import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';

/**
 * Lista todos os ativos Meta (Ad Accounts, Businesses, Pages)
 * usando o token armazenado na integração.
 *
 * Pode ser chamado:
 * - Logo após OAuth (usa dados do oauth_sessions cache)
 * - A qualquer momento (faz fetch direto na Graph API)
 */

const GRAPH_VERSION = Deno.env.get('META_GRAPH_API_VERSION') ?? 'v22.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // User client
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false },
      }
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Get user's company
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('current_organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.current_organization_id) {
      return new Response(
        JSON.stringify({ error: 'Organização não encontrada' }),
        { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('id')
      .eq('organization_id', profile.current_organization_id)
      .single();

    if (!company) {
      return new Response(
        JSON.stringify({ error: 'Empresa não encontrada' }),
        { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // Get integration
    const { data: integration } = await supabaseAdmin
      .from('integrations')
      .select('id, access_token, status')
      .eq('company_id', company.id)
      .eq('platform', 'meta')
      .single();

    if (!integration) {
      return new Response(
        JSON.stringify({ error: 'Integração Meta não encontrada. Conecte primeiro.' }),
        { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // Check for cached accounts in oauth_sessions first (faster, post-OAuth)
    const { data: cachedSession } = await supabaseAdmin
      .from('oauth_sessions')
      .select('accounts, expires_at')
      .eq('id', `meta_accounts_${user.id}`)
      .single();

    if (cachedSession && new Date(cachedSession.expires_at) > new Date()) {
      // Use cached data
      const cached = cachedSession.accounts as {
        ad_accounts?: unknown[];
        businesses?: unknown[];
      };

      // Also fetch pages (not cached in callback)
      const { data: decryptedToken } = await supabaseAdmin
        .rpc('decrypt_meta_token', { encrypted_token: integration.access_token });

      let pages: unknown[] = [];
      if (decryptedToken) {
        try {
          const pagesResp = await fetch(
            `${GRAPH_BASE}/me/accounts?fields=id,name,category,access_token&limit=100&access_token=${decryptedToken}`
          );
          const pagesData = await pagesResp.json();
          pages = pagesData.data ?? [];
        } catch {
          console.warn('Failed to fetch pages');
        }
      }

      // Get already selected accounts
      const { data: selectedAccounts } = await supabaseAdmin
        .from('meta_ad_accounts')
        .select('account_id')
        .eq('company_id', company.id);

      const { data: selectedPages } = await supabaseAdmin
        .from('meta_pages')
        .select('page_id')
        .eq('company_id', company.id);

      const selectedAccountIds = (selectedAccounts ?? []).map((a: { account_id: string }) => a.account_id);
      const selectedPageIds = (selectedPages ?? []).map((p: { page_id: string }) => p.page_id);

      return new Response(
        JSON.stringify({
          ad_accounts: cached.ad_accounts ?? [],
          businesses: cached.businesses ?? [],
          pages,
          selected_account_ids: selectedAccountIds,
          selected_page_ids: selectedPageIds,
          source: 'cache',
        }),
        { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // No cache — fetch from Graph API
    const { data: decryptedToken, error: decryptError } = await supabaseAdmin
      .rpc('decrypt_meta_token', { encrypted_token: integration.access_token });

    if (decryptError || !decryptedToken) {
      return new Response(
        JSON.stringify({ error: 'Falha ao descriptografar token. Reconecte a conta Meta.' }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch all assets in parallel
    const [accountsResp, businessResp, pagesResp] = await Promise.all([
      fetch(`${GRAPH_BASE}/me/adaccounts?fields=id,name,account_status,currency,business&limit=100&access_token=${decryptedToken}`),
      fetch(`${GRAPH_BASE}/me/businesses?fields=id,name&limit=100&access_token=${decryptedToken}`),
      fetch(`${GRAPH_BASE}/me/accounts?fields=id,name,category,access_token&limit=100&access_token=${decryptedToken}`),
    ]);

    const [accountsData, businessData, pagesData] = await Promise.all([
      accountsResp.json(),
      businessResp.json(),
      pagesResp.json(),
    ]);

    // Check for token errors
    if (accountsData.error) {
      const errorCode = accountsData.error.code;
      if (errorCode === 190) {
        // Token invalid/expired
        await supabaseAdmin
          .from('integrations')
          .update({ status: 'expired' })
          .eq('id', integration.id);

        return new Response(
          JSON.stringify({ error: 'Token Meta expirado. Reconecte sua conta.' }),
          { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ error: `Erro Meta API: ${accountsData.error.message}` }),
        { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // Get already selected
    const { data: selectedAccounts } = await supabaseAdmin
      .from('meta_ad_accounts')
      .select('account_id')
      .eq('company_id', company.id);

    const { data: selectedPages } = await supabaseAdmin
      .from('meta_pages')
      .select('page_id')
      .eq('company_id', company.id);

    const selectedAccountIds = (selectedAccounts ?? []).map((a: { account_id: string }) => a.account_id);
    const selectedPageIds = (selectedPages ?? []).map((p: { page_id: string }) => p.page_id);

    return new Response(
      JSON.stringify({
        ad_accounts: accountsData.data ?? [],
        businesses: businessData.data ?? [],
        pages: pagesData.data ?? [],
        selected_account_ids: selectedAccountIds,
        selected_page_ids: selectedPageIds,
        source: 'api',
      }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
