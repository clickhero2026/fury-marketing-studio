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

// Returns HTML that posts message to opener (popup parent) and closes
// SECURITY: targetOrigin e o APP_URL configurado (NAO '*'), previne vazamento de token
function popupResponse(payload: Record<string, unknown>): Response {
  // Extrai origin do APP_URL (ex: https://app.clickhero.com.br → mesma origem)
  let appOrigin: string;
  try {
    appOrigin = new URL(APP_URL).origin;
  } catch {
    appOrigin = 'http://localhost:8080';
  }

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>ClickHero</title></head>
<body style="background:#0c0d0a;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
  <div style="text-align:center">
    <div style="font-size:14px;opacity:0.6">Concluindo conexao...</div>
  </div>
  <script>
    (function() {
      try {
        if (window.opener) {
          // SECURITY: target origin restrito (APP_URL). NAO usa window.opener.location (bloqueado cross-origin)
          window.opener.postMessage(${JSON.stringify(payload)}, ${JSON.stringify(appOrigin)});
        }
      } catch(e) {
        console.error('[meta-oauth-callback] postMessage failed:', e);
      }
      setTimeout(function(){ window.close(); }, 500);
    })();
  </script>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
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
      return popupResponse({ type: 'meta-oauth-error', error: errorDesc });
    }

    // --- Extract code and state ---
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code || !state) {
      return popupResponse({ type: 'meta-oauth-error', error: 'Parametros invalidos' });
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
      return popupResponse({ type: 'meta-oauth-error', error: 'Sessao OAuth invalida ou expirada' });
    }

    // Check expiry
    if (new Date(session.expires_at) < new Date()) {
      await supabaseAdmin.from('oauth_sessions').delete().eq('id', state);
      return popupResponse({ type: 'meta-oauth-error', error: 'Sessao OAuth expirada. Tente novamente.' });
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
      return popupResponse({ type: 'meta-oauth-error', error: 'Falha ao trocar codigo por token' });
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
      return popupResponse({ type: 'meta-oauth-error', error: 'Falha ao gerar token de longa duracao' });
    }

    const longLivedToken = longLivedData.access_token;
    const expiresIn = longLivedData.expires_in ?? 5184000; // ~60 days default

    // --- Step 3: Fetch user info ---
    const meResp = await fetch(
      `${GRAPH_BASE}/me?fields=id,name&access_token=${longLivedToken}`
    );
    const meData = await meResp.json();

    if (meData.error) {
      console.error('Failed to fetch /me:', meData.error);
      return popupResponse({ type: 'meta-oauth-error', error: 'Falha ao obter dados do usuario Meta' });
    }

    // --- Step 4: Fetch ad accounts ---
    const accountsResp = await fetch(
      `${GRAPH_BASE}/me/adaccounts?fields=id,name,account_status,currency,business&limit=100&access_token=${longLivedToken}`
    );
    const accountsData = await accountsResp.json();

    const adAccounts = accountsData.data ?? [];

    if (adAccounts.length === 0) {
      console.error('Meta retornou 0 ad accounts — usuario nao tem contas ou permissao ads_management');
      return popupResponse({
        type: 'meta-oauth-error',
        error: 'Nenhuma conta de anuncios encontrada. Confirme que voce tem acesso a pelo menos 1 Ad Account na Meta e que autorizou as permissoes necessarias.',
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
      return popupResponse({ type: 'meta-oauth-error', error: 'Empresa nao encontrada. Configure sua organizacao primeiro.' });
    }

    // --- Step 7: Encrypt token and save ---
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Encrypt the token using our pgcrypto helper
    const { data: encryptedData, error: encryptError } = await supabaseAdmin
      .rpc('encrypt_meta_token', { token: longLivedToken });

    if (encryptError) {
      console.error('Token encryption failed:', encryptError);
      return popupResponse({ type: 'meta-oauth-error', error: 'Falha ao criptografar token' });
    }

    // Upsert integration (one per company for Meta)
    const firstAccount = adAccounts[0] ?? null;
    const firstBusiness = businesses[0] ?? null;

    const { error: upsertError } = await supabaseAdmin
      .from('integrations')
      .upsert(
        {
          platform: 'meta',
          company_id: companyId,
          access_token: encryptedData, // encrypted
          account_id: firstAccount?.id ?? null,
          account_name: firstAccount?.name ?? null,
          account_status: firstAccount?.account_status?.toString() ?? null,
          business_id: firstBusiness?.id ?? null,
          business_name: firstBusiness?.name ?? null,
          facebook_user_id: meData.id,
          facebook_user_name: meData.name,
          connected_by_user_id: userId,
          token_expires_at: tokenExpiresAt,
          status: 'active',
          last_sync: new Date().toISOString(),
          data_source: 'oauth',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'company_id,platform' }
      );

    if (upsertError) {
      // If upsert fails due to no unique constraint, try insert
      console.error('Upsert failed, trying insert:', upsertError);

      // Delete existing first
      await supabaseAdmin
        .from('integrations')
        .delete()
        .eq('company_id', companyId)
        .eq('platform', 'meta');

      const { error: insertError } = await supabaseAdmin
        .from('integrations')
        .insert({
          platform: 'meta',
          company_id: companyId,
          access_token: encryptedData,
          account_id: firstAccount?.id ?? null,
          account_name: firstAccount?.name ?? null,
          account_status: firstAccount?.account_status?.toString() ?? null,
          business_id: firstBusiness?.id ?? null,
          business_name: firstBusiness?.name ?? null,
          facebook_user_id: meData.id,
          facebook_user_name: meData.name,
          connected_by_user_id: userId,
          token_expires_at: tokenExpiresAt,
          status: 'active',
          last_sync: new Date().toISOString(),
          data_source: 'oauth',
        });

      if (insertError) {
        console.error('Insert integration failed:', insertError);
        return popupResponse({ type: 'meta-oauth-error', error: 'Falha ao salvar integracao' });
      }
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
    return popupResponse({ type: 'meta-oauth-success', accounts: accountCount });
  } catch (error) {
    console.error('Unexpected error in meta-oauth-callback:', error);
    return popupResponse({ type: 'meta-oauth-error', error: 'Erro interno do servidor' });
  }
});
