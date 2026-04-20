import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';

/**
 * Lista hierarquia completa de ativos Meta:
 * - Business Managers (owned_ad_accounts + client_ad_accounts + owned_pages + client_pages)
 * - Contas pessoais (sem BM)
 * - Paginas pessoais (sem BM)
 *
 * Enriquece cada ad account com:
 *   - active_campaigns_count (via batch /act_{id}/campaigns?effective_status=['ACTIVE']&summary=true)
 *   - spend_last_30d (via batch /act_{id}/insights?date_preset=last_30d&fields=spend)
 *
 * Tambem retorna `selected_*_ids` pra UI pre-marcar o que ja foi escolhido.
 */

const GRAPH_VERSION = Deno.env.get('META_GRAPH_API_VERSION') ?? 'v22.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const BATCH_SIZE = 50; // Meta limita batch a 50 requests

interface RawBusiness { id: string; name: string; verification_status?: string; primary_page?: { id: string } }
interface RawAdAccount {
  id: string; account_id?: string; name: string; currency?: string;
  account_status?: number; timezone_name?: string; amount_spent?: string;
  business?: { id: string; name?: string };
}
interface RawPage { id: string; name: string; category?: string; picture?: { data?: { url?: string } } }

interface EnrichedAccount extends RawAdAccount {
  active_campaigns_count: number;
  spend_last_30d: number;
  business_id: string | null;
  is_owned: boolean;
}

interface BusinessNode {
  id: string;
  name: string;
  verification_status: string | null;
  ad_accounts: EnrichedAccount[];
  pages: Array<RawPage & { business_id: string | null; is_owned: boolean }>;
}

async function safeFetchJson(url: string): Promise<{ data?: unknown[]; error?: { code?: number; message?: string } }> {
  try {
    const res = await fetch(url);
    return await res.json();
  } catch (err) {
    return { error: { message: (err as Error).message } };
  }
}

// Batch request Graph API (POST /?batch=[...]&access_token=...)
async function batchGraph(token: string, requests: Array<{ method: string; relative_url: string }>): Promise<Array<{ code: number; body: string } | null>> {
  if (requests.length === 0) return [];
  const results: Array<{ code: number; body: string } | null> = [];

  for (let i = 0; i < requests.length; i += BATCH_SIZE) {
    const chunk = requests.slice(i, i + BATCH_SIZE);
    try {
      const form = new URLSearchParams();
      form.append('access_token', token);
      form.append('batch', JSON.stringify(chunk));
      const res = await fetch(`${GRAPH_BASE}/`, { method: 'POST', body: form });
      const data = await res.json();
      if (Array.isArray(data)) {
        for (const r of data) results.push(r);
      } else {
        for (let j = 0; j < chunk.length; j++) results.push(null);
      }
    } catch (err) {
      console.error('[meta-list-assets] batch failed:', err);
      for (let j = 0; j < chunk.length; j++) results.push(null);
    }
  }
  return results;
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: profile } = await supabaseAdmin
      .from('profiles').select('current_organization_id').eq('id', user.id).single();
    if (!profile?.current_organization_id) {
      return new Response(JSON.stringify({ error: 'Organizacao nao encontrada' }), {
        status: 404, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    const { data: company } = await supabaseAdmin
      .from('companies').select('id').eq('organization_id', profile.current_organization_id).single();
    if (!company) {
      return new Response(JSON.stringify({ error: 'Empresa nao encontrada' }), {
        status: 404, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const { data: integration } = await supabaseAdmin
      .from('integrations')
      .select('id, access_token, status')
      .eq('company_id', company.id)
      .eq('platform', 'meta')
      .single();

    if (!integration) {
      return new Response(JSON.stringify({ error: 'Integracao Meta nao encontrada. Conecte primeiro.' }), {
        status: 404, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const { data: decryptedToken, error: decryptError } = await supabaseAdmin
      .rpc('decrypt_meta_token', { encrypted_token: integration.access_token });
    if (decryptError || !decryptedToken) {
      return new Response(JSON.stringify({ error: 'Falha ao descriptografar token. Reconecte.' }), {
        status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    const token = decryptedToken as string;

    // --- Step 1: Fetch BMs + personal adaccounts + personal pages em paralelo ---
    const [businessesData, personalAccountsData, personalPagesData] = await Promise.all([
      safeFetchJson(`${GRAPH_BASE}/me/businesses?fields=id,name,verification_status,primary_page&limit=100&access_token=${token}`),
      safeFetchJson(`${GRAPH_BASE}/me/adaccounts?fields=id,account_id,name,currency,account_status,timezone_name,amount_spent,business&limit=100&access_token=${token}`),
      safeFetchJson(`${GRAPH_BASE}/me/accounts?fields=id,name,category,picture{url}&limit=100&access_token=${token}`),
    ]);

    if (businessesData.error?.code === 190 || personalAccountsData.error?.code === 190) {
      await supabaseAdmin.from('integrations').update({ status: 'expired' }).eq('id', integration.id);
      return new Response(JSON.stringify({ error: 'Token Meta expirado. Reconecte sua conta.' }), {
        status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const businesses = (businessesData.data ?? []) as RawBusiness[];
    const personalAccountsRaw = (personalAccountsData.data ?? []) as RawAdAccount[];
    const personalPagesRaw = (personalPagesData.data ?? []) as RawPage[];

    // --- Step 2: Pra cada BM, fetch owned/client ad accounts + pages (paralelo) ---
    const bmFetchPromises = businesses.map(async (bm) => {
      const [ownedAccs, clientAccs, ownedPgs, clientPgs] = await Promise.all([
        safeFetchJson(`${GRAPH_BASE}/${bm.id}/owned_ad_accounts?fields=id,account_id,name,currency,account_status,timezone_name,amount_spent&limit=100&access_token=${token}`),
        safeFetchJson(`${GRAPH_BASE}/${bm.id}/client_ad_accounts?fields=id,account_id,name,currency,account_status,timezone_name,amount_spent&limit=100&access_token=${token}`),
        safeFetchJson(`${GRAPH_BASE}/${bm.id}/owned_pages?fields=id,name,category,picture{url}&limit=100&access_token=${token}`),
        safeFetchJson(`${GRAPH_BASE}/${bm.id}/client_pages?fields=id,name,category,picture{url}&limit=100&access_token=${token}`),
      ]);
      return {
        bm,
        ownedAccounts: (ownedAccs.data ?? []) as RawAdAccount[],
        clientAccounts: (clientAccs.data ?? []) as RawAdAccount[],
        ownedPages: (ownedPgs.data ?? []) as RawPage[],
        clientPages: (clientPgs.data ?? []) as RawPage[],
      };
    });

    const bmResults = await Promise.all(bmFetchPromises);

    // --- Step 3: Deduplicacao — account pode aparecer em BM e em /me/adaccounts ---
    const seenAccountIds = new Set<string>();
    const businessNodes: BusinessNode[] = [];

    for (const { bm, ownedAccounts, clientAccounts, ownedPages, clientPages } of bmResults) {
      const allAccs = [
        ...ownedAccounts.map((a) => ({ ...a, is_owned: true, business_id: bm.id })),
        ...clientAccounts.map((a) => ({ ...a, is_owned: false, business_id: bm.id })),
      ];
      const allPages = [
        ...ownedPages.map((p) => ({ ...p, is_owned: true, business_id: bm.id })),
        ...clientPages.map((p) => ({ ...p, is_owned: false, business_id: bm.id })),
      ];

      for (const a of allAccs) {
        const id = a.account_id ?? a.id.replace(/^act_/, '');
        seenAccountIds.add(id);
      }

      businessNodes.push({
        id: bm.id,
        name: bm.name,
        verification_status: bm.verification_status ?? null,
        ad_accounts: allAccs as EnrichedAccount[],
        pages: allPages,
      });
    }

    // Pessoais: so os que nao apareceram em BMs
    const personalAccounts = personalAccountsRaw
      .filter((a) => {
        const id = a.account_id ?? a.id.replace(/^act_/, '');
        return !seenAccountIds.has(id);
      })
      .map((a) => ({ ...a, is_owned: true, business_id: null } as EnrichedAccount));

    const seenPageIds = new Set<string>();
    for (const bn of businessNodes) for (const p of bn.pages) seenPageIds.add(p.id);
    const personalPages = personalPagesRaw
      .filter((p) => !seenPageIds.has(p.id))
      .map((p) => ({ ...p, is_owned: true, business_id: null }));

    // --- Step 4: Enrichment via batch — active campaigns + spend 30d ---
    // Coleta todos os ad account IDs pra enrichment
    const allAccounts: EnrichedAccount[] = [
      ...businessNodes.flatMap((b) => b.ad_accounts),
      ...personalAccounts,
    ];

    const batchRequests: Array<{ method: string; relative_url: string }> = [];
    // Usa `filtering` com status=ACTIVE (configurado pelo user) em vez de `effective_status`
    // (que pode divergir por billing/conta pausada).
    const filtering = encodeURIComponent(JSON.stringify([{ field: 'status', operator: 'IN', value: ['ACTIVE'] }]));
    for (const a of allAccounts) {
      const actId = a.id.startsWith('act_') ? a.id : `act_${a.account_id ?? a.id}`;
      batchRequests.push({
        method: 'GET',
        relative_url: `${actId}/campaigns?filtering=${filtering}&limit=0&summary=total_count`,
      });
      // Spend 30d
      batchRequests.push({
        method: 'GET',
        relative_url: `${actId}/insights?date_preset=last_30d&fields=spend&level=account`,
      });
    }

    const batchResults = await batchGraph(token, batchRequests);

    // Parse results pareados (2 por account: campaigns + spend)
    for (let i = 0; i < allAccounts.length; i++) {
      const campaignsResult = batchResults[i * 2];
      const spendResult = batchResults[i * 2 + 1];

      let activeCount = 0;
      if (campaignsResult?.code === 200) {
        try {
          const body = JSON.parse(campaignsResult.body);
          activeCount = body.summary?.total_count ?? body.data?.length ?? 0;
        } catch (e) {
          console.error('[meta-list-assets] parse campaigns failed:', e);
        }
      } else if (campaignsResult) {
        console.error('[meta-list-assets] campaigns batch non-200:', campaignsResult.code, campaignsResult.body?.slice(0, 300));
      }

      let spend30d = 0;
      if (spendResult?.code === 200) {
        try {
          const body = JSON.parse(spendResult.body);
          const row = body.data?.[0];
          if (row?.spend) spend30d = Number(row.spend) || 0;
        } catch { /* empty */ }
      }

      allAccounts[i].active_campaigns_count = activeCount;
      allAccounts[i].spend_last_30d = spend30d;
    }

    // --- Step 5: Get already selected (pra UI pre-marcar) ---
    const { data: selectedAccounts } = await supabaseAdmin
      .from('meta_ad_accounts')
      .select('account_id')
      .eq('company_id', company.id)
      .eq('is_active', true);

    const { data: selectedPages } = await supabaseAdmin
      .from('meta_pages')
      .select('page_id')
      .eq('company_id', company.id)
      .eq('is_active', true);

    const selectedAccountIds = (selectedAccounts ?? []).map((a: { account_id: string }) => a.account_id);
    const selectedPageIds = (selectedPages ?? []).map((p: { page_id: string }) => p.page_id);

    return new Response(
      JSON.stringify({
        businesses: businessNodes,
        personal_ad_accounts: personalAccounts,
        personal_pages: personalPages,
        selected_account_ids: selectedAccountIds,
        selected_page_ids: selectedPageIds,
        source: 'api_hierarchy_v2',
      }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[meta-list-assets] Unexpected error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', detail: (error as Error).message }), {
      status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
