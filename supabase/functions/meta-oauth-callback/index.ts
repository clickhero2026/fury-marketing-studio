import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Meta OAuth Callback Handler
 *
 * Flow:
 * 1. Receives ?code=XXX&state=YYY from Meta redirect
 * 2. Validates state against oauth_sessions (anti-CSRF)
 * 3. Exchanges code → short-lived token (1-2h)
 * 4. Exchanges short-lived → long-lived token (60 days)
 * 5. Fetches user info, ad accounts, businesses
 * 6. Encrypts token and saves to integrations table
 * 7. Redirects user back to app
 */

const GRAPH_VERSION = Deno.env.get('META_GRAPH_API_VERSION') ?? 'v22.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// App redirect after OAuth completes
const APP_URL = Deno.env.get('APP_URL') ?? 'http://localhost:8080';

// Returns 302 redirect para o app com query params
// Fluxo redirect e mais confiavel que popup (nao depende de window.opener,
// nao e afetado por extensoes, nao mostra HTML cru se script falhar)
function redirectResponse(params: Record<string, string | number>): Response {
  // Redireciona pra /oauth/meta/complete — rota do proprio app que:
  // 1. Le os params
  // 2. Faz postMessage pro opener (se for popup)
  // 3. Fecha o popup
  // Como essa rota e mesmo origem do opener, nao tem problema cross-origin
  let baseUrl: string;
  try {
    baseUrl = new URL('/oauth/meta/complete', APP_URL).toString();
  } catch {
    baseUrl = 'http://localhost:8080/oauth/meta/complete';
  }

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    qs.set(k, String(v));
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${baseUrl}?${qs.toString()}`,
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);

    // --- Handle error from Meta ---
    const errorParam = url.searchParams.get('error');
    if (errorParam) {
      const errorDesc = url.searchParams.get('error_description') ?? 'Unknown error';
      console.error('Meta OAuth error:', errorParam, errorDesc);
      return redirectResponse({ oauth_error: errorDesc });
    }

    // --- Extract code and state ---
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code || !state) {
      return redirectResponse({ oauth_error: 'Parametros invalidos' });
    }

    // --- Admin client (bypasses RLS) ---
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // --- Validate state (anti-CSRF) ---
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('oauth_sessions')
      .select('*')
      .eq('id', state)
      .single();

    if (sessionError || !session) {
      console.error('Invalid OAuth state:', state, sessionError);
      return redirectResponse({ oauth_error: 'Sessao OAuth invalida ou expirada' });
    }

    // Check expiry
    if (new Date(session.expires_at) < new Date()) {
      await supabaseAdmin.from('oauth_sessions').delete().eq('id', state);
      return redirectResponse({ oauth_error: 'Sessao OAuth expirada. Tente novamente.' });
    }

    const userId = session.user_id;

    // Delete used state (one-time use)
    await supabaseAdmin.from('oauth_sessions').delete().eq('id', state);

    // --- Step 1: Exchange code → short-lived token ---
    const appId = Deno.env.get('META_APP_ID') ?? '';
    const appSecret = Deno.env.get('META_APP_SECRET') ?? '';
    const redirectUri = Deno.env.get('META_OAUTH_REDIRECT_URI')
      ?? `${Deno.env.get('SUPABASE_URL')}/functions/v1/meta-oauth-callback`;

    const tokenUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
    tokenUrl.searchParams.set('client_id', appId);
    tokenUrl.searchParams.set('client_secret', appSecret);
    tokenUrl.searchParams.set('redirect_uri', redirectUri);
    tokenUrl.searchParams.set('code', code);

    const tokenResp = await fetch(tokenUrl.toString());
    const tokenData = await tokenResp.json();

    if (tokenData.error) {
      console.error('Token exchange failed:', tokenData.error);
      return redirectResponse({ oauth_error: 'Falha ao trocar codigo por token' });
    }

    const shortLivedToken = tokenData.access_token;

    // --- Step 2: Exchange short-lived → long-lived token (60 days) ---
    const longLivedUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
    longLivedUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longLivedUrl.searchParams.set('client_id', appId);
    longLivedUrl.searchParams.set('client_secret', appSecret);
    longLivedUrl.searchParams.set('fb_exchange_token', shortLivedToken);

    const longLivedResp = await fetch(longLivedUrl.toString());
    const longLivedData = await longLivedResp.json();

    if (longLivedData.error) {
      console.error('Long-lived token exchange failed:', longLivedData.error);
      return redirectResponse({ oauth_error: 'Falha ao gerar token de longa duracao' });
    }

    const longLivedToken = longLivedData.access_token;
    const expiresIn = longLivedData.expires_in ?? 5184000; // ~60 days default

    // --- Step 3: Fetch user info (com retry em rate limit transitorio) ---
    let meData: { id?: string; name?: string; error?: { code?: number; message?: string; is_transient?: boolean } } = {};
    for (let attempt = 0; attempt < 3; attempt++) {
      const meResp = await fetch(`${GRAPH_BASE}/me?fields=id,name&access_token=${longLivedToken}`);
      meData = await meResp.json();
      if (!meData.error) break;
      // Code 4 = App Rate Limit, Code 17 = User Rate Limit, Code 32 = Page Rate Limit
      const rateLimited = [4, 17, 32].includes(meData.error.code ?? 0) || meData.error.is_transient;
      if (!rateLimited || attempt === 2) break;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }

    if (meData.error) {
      console.error('Failed to fetch /me:', meData.error);
      const isRateLimit = [4, 17, 32].includes(meData.error.code ?? 0);
      const errMsg = isRateLimit
        ? 'Meta esta limitando requisicoes do app agora (muitos reconnects). Aguarde ~30min e tente novamente.'
        : `Falha ao obter dados do usuario Meta: ${meData.error.message ?? 'erro desconhecido'}`;
      return redirectResponse({ oauth_error: errMsg });
    }

    // --- Step 4: Fetch ad accounts ---
    const accountsResp = await fetch(
      `${GRAPH_BASE}/me/adaccounts?fields=id,name,account_status,currency,business&limit=100&access_token=${longLivedToken}`
    );
    const accountsData = await accountsResp.json();

    const adAccounts = accountsData.data ?? [];

    if (adAccounts.length === 0) {
      console.error('Meta retornou 0 ad accounts — usuario nao tem contas ou permissao ads_management');
      return redirectResponse({
        oauth_error: 'Nenhuma conta de anuncios encontrada. Confirme que voce tem acesso a pelo menos 1 Ad Account na Meta e que autorizou as permissoes necessarias.',
      });
    }

    // --- Step 5: Fetch businesses ---
    const businessResp = await fetch(
      `${GRAPH_BASE}/me/businesses?fields=id,name&limit=100&access_token=${longLivedToken}`
    );
    const businessData = await businessResp.json();

    const businesses = businessData.data ?? [];

    // --- Step 6: Get user's company_id ---
    const { data: userRecord } = await supabaseAdmin
      .from('profiles')
      .select('current_organization_id')
      .eq('id', userId)
      .single();

    let companyId: string | null = null;
    if (userRecord?.current_organization_id) {
      const { data: companyRecord } = await supabaseAdmin
        .from('companies')
        .select('id')
        .eq('organization_id', userRecord.current_organization_id)
        .single();
      companyId = companyRecord?.id ?? null;
    }

    if (!companyId) {
      return redirectResponse({ oauth_error: 'Empresa nao encontrada. Configure sua organizacao primeiro.' });
    }

    // --- Step 7: Encrypt token and save ---
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Encrypt the token using our pgcrypto helper
    const { data: encryptedData, error: encryptError } = await supabaseAdmin
      .rpc('encrypt_meta_token', { token: longLivedToken });

    if (encryptError) {
      console.error('Token encryption failed:', encryptError);
      return redirectResponse({ oauth_error: 'Falha ao criptografar token' });
    }

    // Upsert integration (sem auto-selecao — user escolhe contas manualmente via MetaAccountSelector)
    const { error: upsertError } = await supabaseAdmin
      .from('integrations')
      .upsert(
        {
          platform: 'meta',
          company_id: companyId,
          access_token: encryptedData, // encrypted
          account_id: null,
          account_name: null,
          account_status: null,
          business_id: null,
          business_name: null,
          facebook_user_id: meData.id,
          facebook_user_name: meData.name,
          connected_by_user_id: userId,
          token_expires_at: tokenExpiresAt,
          status: 'active',
          last_sync: null,
          data_source: 'oauth',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'company_id,platform' }
      );

    if (upsertError) {
      // NAO fazer delete+insert como fallback — FK CASCADE propaga pra campaigns/
      // metrics/fury/compliance. Um upsert transiente com falha nao pode apagar
      // dados historicos. Retorna erro pro user tentar de novo.
      console.error('Upsert integration failed:', upsertError);
      return redirectResponse({ oauth_error: 'Falha ao salvar integracao. Tente novamente.' });
    }

    // --- Step 8: Save all accounts in oauth_sessions for selection UI ---
    await supabaseAdmin
      .from('oauth_sessions')
      .upsert({
        id: `meta_accounts_${userId}`,
        user_id: userId,
        access_token: 'stored_in_integrations',
        accounts: { ad_accounts: adAccounts, businesses },
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30min for selection
      });

    // --- Success: postMessage to opener and close popup ---
    const accountCount = adAccounts.length;
    return redirectResponse({ oauth_success: 'true', accounts: accountCount });
  } catch (error) {
    console.error('Unexpected error in meta-oauth-callback:', error);
    return redirectResponse({ oauth_error: 'Erro interno do servidor' });
  }
});
