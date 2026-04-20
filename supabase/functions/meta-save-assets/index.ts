import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';

/**
 * Salva os ativos selecionados pelo usuário (Ad Accounts + Pages).
 *
 * Body: {
 *   ad_accounts: [{ id, name, account_status, currency, business_id, business_name }],
 *   pages: [{ id, name, category, access_token }]
 * }
 *
 * Lógica: replace all — deleta os anteriores e insere os novos.
 */

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

    // Parse body
    let body: {
      ad_accounts?: Array<{
        id: string;
        name?: string;
        account_status?: string;
        currency?: string;
        business_id?: string;
        business_name?: string;
      }>;
      pages?: Array<{
        id: string;
        name?: string;
        category?: string;
        access_token?: string;
      }>;
    };

    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
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
      .select('id')
      .eq('company_id', company.id)
      .eq('platform', 'meta')
      .single();

    if (!integration) {
      return new Response(
        JSON.stringify({ error: 'Integração Meta não encontrada' }),
        { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // --- SOFT-DELETE: marca tudo como inativo, depois reativa os selecionados ---
    const adAccounts = body.ad_accounts ?? [];
    const pages = body.pages ?? [];

    // Paraleliza soft-delete pra reduzir janela de inconsistencia (ambos
    // updates resolvem juntos; falha de um ainda e possivel mas janela e menor).
    await Promise.all([
      supabaseAdmin.from('meta_ad_accounts').update({ is_active: false }).eq('company_id', company.id),
      supabaseAdmin.from('meta_pages').update({ is_active: false }).eq('company_id', company.id),
    ]);

    // --- BUSINESS MANAGERS: upsert dos BMs selecionados (derivados dos accounts+pages) ---
    const bmMap = new Map<string, { id: string; name: string }>();
    for (const acc of adAccounts) {
      if (acc.business_id && acc.business_name) {
        bmMap.set(acc.business_id, { id: acc.business_id, name: acc.business_name });
      }
    }
    for (const p of pages) {
      const bp = p as { business_id?: string; business_name?: string };
      if (bp.business_id && bp.business_name) {
        bmMap.set(bp.business_id, { id: bp.business_id, name: bp.business_name });
      }
    }
    if (bmMap.size > 0) {
      const bmRows = [...bmMap.values()].map((bm) => ({
        integration_id: integration.id,
        company_id: company.id,
        external_id: bm.id,
        name: bm.name,
        last_scanned_at: new Date().toISOString(),
        deleted_at: null,
      }));
      await supabaseAdmin
        .from('meta_business_managers')
        .upsert(bmRows, { onConflict: 'external_id,company_id' });
    }

    // --- AD ACCOUNTS: upsert por (company_id, account_id) com is_active=true ---
    // Dedup por acc.id — mesma conta pode chegar 2x (owned em um BM + client em outro)
    if (adAccounts.length > 0) {
      const uniqAccounts = new Map<string, typeof adAccounts[number]>();
      for (const acc of adAccounts) if (acc.id) uniqAccounts.set(acc.id, acc);

      const accountRows = [...uniqAccounts.values()].map((acc) => ({
        integration_id: integration.id,
        company_id: company.id,
        account_id: acc.id,
        account_name: acc.name ?? null,
        account_status: acc.account_status != null ? String(acc.account_status) : null,
        currency: acc.currency ?? null,
        business_id: acc.business_id ?? null,
        business_name: acc.business_name ?? null,
        is_active: true,
      }));

      const { error: upsertAccountsError } = await supabaseAdmin
        .from('meta_ad_accounts')
        .upsert(accountRows, { onConflict: 'company_id,account_id' });

      if (upsertAccountsError) {
        console.error('Failed to upsert ad accounts:', upsertAccountsError);
        return new Response(JSON.stringify({ error: 'Falha ao salvar contas de anuncio', details: upsertAccountsError.message }), {
          status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
    }

    // --- PAGES: upsert com is_active=true ---
    // Dedup por page.id — mesma page pode estar em multiplos BMs (owned+client)
    if (pages.length > 0) {
      const uniqPages = new Map<string, typeof pages[number]>();
      for (const p of pages) if (p.id) uniqPages.set(p.id, p);

      const pageRows = [...uniqPages.values()].map((page) => ({
        integration_id: integration.id,
        company_id: company.id,
        page_id: page.id,
        page_name: page.name ?? null,
        page_category: page.category ?? null,
        page_access_token: page.access_token ?? null,
        is_active: true,
      }));

      const { error: upsertPagesError } = await supabaseAdmin
        .from('meta_pages')
        .upsert(pageRows, { onConflict: 'company_id,page_id' });

      if (upsertPagesError) {
        console.error('Failed to upsert pages:', upsertPagesError);
        return new Response(JSON.stringify({ error: 'Falha ao salvar paginas', details: upsertPagesError.message }), {
          status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
    }

    // --- Integration: normaliza com primeira account selecionada (UI legada) ---
    const primaryAccount = adAccounts[0] ?? null;
    if (primaryAccount) {
      await supabaseAdmin
        .from('integrations')
        .update({
          account_id: primaryAccount.id,
          account_name: primaryAccount.name ?? null,
          account_status: primaryAccount.account_status != null ? String(primaryAccount.account_status) : null,
          business_id: primaryAccount.business_id ?? null,
          business_name: primaryAccount.business_name ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', integration.id);
    }

    // Cleanup oauth_sessions cache
    await supabaseAdmin
      .from('oauth_sessions')
      .delete()
      .eq('id', `meta_accounts_${user.id}`);

    // Recovery: se integration estava 'stale' (deteccao automatica), reativa apos
    // o usuario reselecionar ativos manualmente — sinal de que o token funciona
    await supabaseAdmin
      .from('integrations')
      .update({ status: 'active' })
      .eq('id', integration.id)
      .eq('status', 'stale');

    // Auto-trigger meta-sync (background) para popular dashboard imediatamente
    // Usa EdgeRuntime.waitUntil para garantir execucao apos o Response retornar
    try {
      const cronSecret = Deno.env.get('CRON_SECRET');
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      if (cronSecret && supabaseUrl && adAccounts.length > 0) {
        const triggerPromise = fetch(`${supabaseUrl}/functions/v1/meta-sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-cron-secret': cronSecret,
          },
          body: JSON.stringify({ company_id: company.id }),
        }).then(
          (res) => {
            if (!res.ok) {
              console.error(`[meta-save-assets] meta-sync auto-trigger HTTP ${res.status}`);
            }
          },
          (err) => {
            console.error('[meta-save-assets] meta-sync auto-trigger failed:', err);
          },
        );

        // EdgeRuntime e global no Deno Deploy — mantem worker viva ate a promise resolver
        const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
        if (edgeRuntime?.waitUntil) {
          edgeRuntime.waitUntil(triggerPromise);
        }
      }
    } catch (err) {
      console.error('[meta-save-assets] auto-trigger error:', err);
    }

    return new Response(
      JSON.stringify({
        success: true,
        saved: {
          ad_accounts: adAccounts.length,
          pages: pages.length,
        },
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
