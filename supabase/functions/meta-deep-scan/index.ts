import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';

/**
 * Meta Deep Scan — varredura profunda de Business Managers, Ad Sets, Pixels e Pages.
 *
 * Composto com meta-sync existente (que cuida de campaigns/insights/creatives).
 * Suporta autenticacao por user JWT (chamada manual) ou x-cron-secret (cron job).
 *
 * Features:
 * - Freshness tier (6h ACTIVE / 24h PAUSED / 7d ARCHIVED)
 * - Soft delete via deleted_at
 * - Rate limit tracking via headers Meta + sleep adaptativo
 * - Chunking opcional via account_ids[]
 * - Timeout guard 120s (margem para 150s do Edge)
 * - Logs estruturados em meta_scan_logs
 */

const GRAPH_VERSION = Deno.env.get('META_GRAPH_API_VERSION') ?? 'v22.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const BATCH_SIZE = 5;
const TIMEOUT_GUARD_MS = 120_000;
const FRESH_TIER_MS: Record<string, number> = {
  ACTIVE: 6 * 3600_000,
  PAUSED: 24 * 3600_000,
  DEFAULT: 7 * 24 * 3600_000,
};

// Retry exponencial em 5xx — max 3 retries (delays em ms)
const RETRY_DELAYS_MS = [1000, 3000, 9000];

// Classificacao de erros Meta API para observabilidade
type ErrorCode =
  | 'token_expired'
  | 'permission_denied'
  | 'rate_limit'
  | 'not_found'
  | 'network'
  | 'server_error'
  | 'unknown';

class MetaApiError extends Error {
  code: ErrorCode;
  status: number;
  constructor(message: string, code: ErrorCode, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function classifyMetaError(status: number, body: unknown): ErrorCode {
  const metaCode = (body as { error?: { code?: number } })?.error?.code;
  if (metaCode === 190 || metaCode === 102 || metaCode === 463) return 'token_expired';
  if (status === 429 || metaCode === 4 || metaCode === 17 || metaCode === 613) return 'rate_limit';
  if (metaCode === 200 || metaCode === 10 || metaCode === 294) return 'permission_denied';
  if (status === 404) return 'not_found';
  if (status >= 500) return 'server_error';
  if (status === 401 || status === 403) return 'permission_denied';
  if (status >= 400) return 'unknown';
  return 'unknown';
}

function extractErrorCode(err: unknown): ErrorCode | undefined {
  if (err instanceof MetaApiError) return err.code;
  const msg = err instanceof Error ? err.message : String(err);
  // Padroes especificos da Meta API — ancorados em "Meta API <status>" ou codes parentizados
  if (/access token has expired|OAuthException.*190|code.{0,5}190/i.test(msg)) return 'token_expired';
  if (/Meta API 429|Rate limited \(429\)|rate limit/i.test(msg)) return 'rate_limit';
  if (/permission|Meta API 40[13]|code.{0,5}(200|10|294)/i.test(msg)) return 'permission_denied';
  if (/Meta API 404|not found/i.test(msg)) return 'not_found';
  if (/Meta API 5\d{2}/.test(msg)) return 'server_error';
  return undefined;
}

interface ScanStats {
  bms_synced: number;
  bms_deleted: number;
  accounts_enriched: number;
  accounts_skipped_fresh: number;
  adsets_synced: number;
  adsets_deleted: number;
  pixels_synced: number;
  pixels_deleted: number;
  pages_updated: number;
  retries_count: number;
  errors: Array<{ where: string; error: string; code?: ErrorCode }>;
  timeout_hit: boolean;
  remaining_account_ids: string[];
}

interface ScanContext {
  supabase: SupabaseClient;
  token: string;
  companyId: string;
  integrationId: string;
  startedAt: number;
  scanLogId: string;
  stats: ScanStats;
  rateLimits: Map<string, { usage: number }>;
}

// FIX P4: chaves numericas de ScanStats — previne incremento acidental de array/boolean
type NumericStatKey =
  | 'bms_synced'
  | 'bms_deleted'
  | 'accounts_enriched'
  | 'accounts_skipped_fresh'
  | 'adsets_synced'
  | 'adsets_deleted'
  | 'pixels_synced'
  | 'pixels_deleted'
  | 'pages_updated'
  | 'retries_count';

const MAX_ERRORS_IN_STATS = 50;
function pushError(ctx: ScanContext, where: string, error: unknown, code?: ErrorCode, suffix?: string) {
  if (ctx.stats.errors.length >= MAX_ERRORS_IN_STATS) return;
  const baseMsg = error instanceof Error ? error.message : String(error);
  const msg = suffix ? `${baseMsg} ${suffix}` : baseMsg;
  const inferredCode = code
    ?? (error instanceof MetaApiError ? error.code : extractErrorCode(error));
  ctx.stats.errors.push({ where, error: msg.slice(0, 300), code: inferredCode });
}

// FIX P1: remove access_token de paging.next para nao vazar em logs/proxies
function stripAccessToken(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.delete('access_token');
    return u.toString();
  } catch {
    return url;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const chunks = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

function isFresh(lastScannedAt: string | null, effectiveStatus: string | null): boolean {
  if (!lastScannedAt) return false;
  const ageMs = Date.now() - new Date(lastScannedAt).getTime();
  const tier = FRESH_TIER_MS[effectiveStatus ?? ''] ?? FRESH_TIER_MS.DEFAULT;
  return ageMs < tier;
}

// ============================================================================
// Rate-limit-aware Meta API call (with retry on 5xx)
// ============================================================================
async function callMeta(
  ctx: ScanContext,
  endpoint: string,
  endpointKey?: string,
  attempt = 0,
): Promise<unknown> {
  const key = endpointKey ?? endpoint.split('?')[0];
  const state = ctx.rateLimits.get(key) ?? { usage: 0 };

  // Sleep adaptativo: 80% -> 500ms, 90% -> 2s, 95% -> 5s
  if (state.usage >= 95) await sleep(5000);
  else if (state.usage >= 90) await sleep(2000);
  else if (state.usage >= 80) await sleep(500);

  const url = endpoint.startsWith('http') ? endpoint : `${GRAPH_BASE}${endpoint}`;

  // FIX C1: Token via Authorization header, nao query string (seguranca)
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${ctx.token}` },
  });

  // Parse usage headers
  const appUsageRaw = res.headers.get('x-app-usage');
  const businessUsageRaw = res.headers.get('x-business-use-case-usage');
  let maxUsage = 0;

  try {
    if (appUsageRaw) {
      const u = JSON.parse(appUsageRaw);
      maxUsage = Math.max(maxUsage, u.call_count ?? 0, u.total_cputime ?? 0, u.total_time ?? 0);
    }
    if (businessUsageRaw) {
      const u = JSON.parse(businessUsageRaw);
      for (const arr of Object.values(u) as Array<Array<{ call_count?: number; total_cputime?: number }>>) {
        if (Array.isArray(arr)) {
          for (const x of arr) {
            maxUsage = Math.max(maxUsage, x.call_count ?? 0, x.total_cputime ?? 0);
          }
        }
      }
    }
  } catch {
    // ignore parse errors
  }

  ctx.rateLimits.set(key, { usage: maxUsage });

  // FIX Q2: parse uma unica vez (dentro do try) — evita parse duplicado e erro sincrono fora do catch
  let parsedAppUsage: unknown = null;
  let parsedBusinessUsage: unknown = null;
  try {
    if (appUsageRaw) parsedAppUsage = JSON.parse(appUsageRaw);
    if (businessUsageRaw) parsedBusinessUsage = JSON.parse(businessUsageRaw);
  } catch {
    // Meta retornou JSON malformado — usage fica null, scan continua
  }

  // Persist rate limit state (fire-and-forget)
  // FIX P2: .then(onFulfilled, onRejected) previne UnhandledPromiseRejection no Deno
  ctx.supabase
    .from('meta_api_rate_limit')
    .upsert(
      {
        company_id: ctx.companyId,
        integration_id: ctx.integrationId,
        endpoint_pattern: key,
        x_app_usage: parsedAppUsage,
        x_business_use_case_usage: parsedBusinessUsage,
        last_429_at: res.status === 429 ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'company_id,endpoint_pattern' },
    )
    .then(
      () => {},
      () => {},
    );

  if (res.status === 429) {
    throw new MetaApiError(`Rate limited (429) on ${key}`, 'rate_limit', 429);
  }

  // Retry exponencial em 5xx: 3 tentativas com delays 1s/3s/9s
  if (res.status >= 500 && res.status < 600 && attempt < RETRY_DELAYS_MS.length) {
    ctx.stats.retries_count++;
    await sleep(RETRY_DELAYS_MS[attempt]);
    return callMeta(ctx, endpoint, endpointKey, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { /* not json */ }
    const code = classifyMetaError(res.status, parsed);
    throw new MetaApiError(
      `Meta API ${res.status} on ${key}: ${text.slice(0, 200)}`,
      code,
      res.status,
    );
  }

  return res.json();
}

// ============================================================================
// Paginate: segue paging.next ate acabar ou atingir hardCap
// FIX P1: strip access_token de paging.next (evita vazar em logs)
// FIX P5: catch erros no meio da paginacao para retornar resultados parciais
// ============================================================================
async function callMetaPaginated<T>(
  ctx: ScanContext,
  initialEndpoint: string,
  endpointKey: string,
  hardCap = 2000,
): Promise<T[]> {
  const results: T[] = [];
  let next: string | null = initialEndpoint;
  let pageNum = 0;

  while (next && results.length < hardCap) {
    try {
      const data = (await callMeta(ctx, next, endpointKey)) as {
        data?: T[];
        paging?: { next?: string };
      };
      if (Array.isArray(data.data)) results.push(...data.data);
      next = data.paging?.next ? stripAccessToken(data.paging.next) : null;
      pageNum++;
    } catch (err) {
      // Erro no meio: registra (preservando MetaApiError code) e retorna parciais (FIX P5)
      pushError(
        ctx,
        `paginated ${endpointKey} page ${pageNum}`,
        err,
        undefined,
        `(partial results: ${results.length})`,
      );
      break;
    }
  }

  return results;
}

// ============================================================================
// Upsert helper com error check (FIX H2 + P4: counterKey fortemente tipado)
// ============================================================================
async function safeUpsert(
  ctx: ScanContext,
  table: string,
  row: Record<string, unknown>,
  onConflict: string,
  counterKey: NumericStatKey,
): Promise<boolean> {
  const { error } = await ctx.supabase.from(table).upsert(row, { onConflict });
  if (error) {
    pushError(ctx, `upsert ${table}`, error.message);
    return false;
  }
  ctx.stats[counterKey]++;
  return true;
}

// ============================================================================
// Batch upsert (FIX Q3) — 1 round-trip ao inves de N
// Em caso de erro no batch, faz fallback por-item para isolar a row problematica
// ============================================================================
async function safeUpsertBatch(
  ctx: ScanContext,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
  counterKey: NumericStatKey,
): Promise<void> {
  if (rows.length === 0) return;

  const { error } = await ctx.supabase.from(table).upsert(rows, { onConflict });
  if (!error) {
    ctx.stats[counterKey] += rows.length;
    return;
  }

  // Batch falhou: fallback por-item (pode ser 1 row corrompida travando o batch)
  pushError(ctx, `batch upsert ${table}`, `${error.message} — retrying per-row`);
  for (const row of rows) {
    await safeUpsert(ctx, table, row, onConflict, counterKey);
  }
}

// ============================================================================
// Soft delete sweep + revival (FIX C2: sem SQL string manual)
// ============================================================================
async function softDeleteSweep(
  ctx: ScanContext,
  table: string,
  presentExternalIds: string[],
  extraFilter?: { column: string; values: string[] },
) {
  const nowIso = new Date().toISOString();

  // Fetch ids atuais em memoria para computar diff em JS (evita SQL string building)
  let query = ctx.supabase
    .from(table)
    .select('id, external_id')
    .eq('company_id', ctx.companyId)
    .is('deleted_at', null);

  if (extraFilter && extraFilter.values.length > 0) {
    query = query.in(extraFilter.column, extraFilter.values);
  }

  const { data: currentRows, error: selectError } = await query;
  if (selectError) {
    pushError(ctx, `softDeleteSweep(${table}) select`, selectError.message);
    return;
  }

  const presentSet = new Set(presentExternalIds);
  const toDeleteIds = (currentRows ?? [])
    .filter((r) => !presentSet.has(r.external_id as string))
    .map((r) => r.id as string);

  if (toDeleteIds.length > 0) {
    const { error } = await ctx.supabase
      .from(table)
      .update({ deleted_at: nowIso })
      .in('id', toDeleteIds);
    if (error) pushError(ctx, `softDeleteSweep(${table}) delete`, error.message);
  }

  // Revive: entidades que estavam deleted e reapareceram
  if (presentExternalIds.length > 0) {
    const { error } = await ctx.supabase
      .from(table)
      .update({ deleted_at: null })
      .eq('company_id', ctx.companyId)
      .not('deleted_at', 'is', null)
      .in('external_id', presentExternalIds);
    if (error) pushError(ctx, `softDeleteSweep(${table}) revive`, error.message);
  }
}

// ============================================================================
// Sync Business Managers (paginado + batch upsert)
// ============================================================================
async function syncBMs(ctx: ScanContext) {
  try {
    const bms = await callMetaPaginated<Record<string, unknown>>(
      ctx,
      `/me/businesses?fields=id,name,vertical,primary_page,created_time,two_factor_type,verification_status&limit=100`,
      '/me/businesses',
    );

    const nowIso = new Date().toISOString();
    const externalIds: string[] = [];
    const rows = bms.map((bm) => {
      const externalId = String(bm.id);
      externalIds.push(externalId);
      return {
        company_id: ctx.companyId,
        integration_id: ctx.integrationId,
        external_id: externalId,
        name: bm.name ?? null,
        vertical: bm.vertical ?? null,
        primary_page: bm.primary_page ?? null,
        created_time: bm.created_time ?? null,
        two_factor_type: bm.two_factor_type ?? null,
        verification_status: bm.verification_status ?? null,
        last_scanned_at: nowIso,
        deleted_at: null,
        updated_at: nowIso,
      };
    });

    await safeUpsertBatch(ctx, 'meta_business_managers', rows, 'external_id,company_id', 'bms_synced');
    await softDeleteSweep(ctx, 'meta_business_managers', externalIds);
  } catch (err) {
    pushError(ctx, 'syncBMs', err);
  }
}

// ============================================================================
// Enrich Ad Account
// ============================================================================
async function enrichAdAccount(
  ctx: ScanContext,
  acct: { account_id: string; last_scanned_at: string | null; account_status: string | null },
) {
  if (isFresh(acct.last_scanned_at, acct.account_status)) {
    ctx.stats.accounts_skipped_fresh++;
    return;
  }

  // Meta API exige prefix act_ em endpoints de ad account
  const acctPath = acct.account_id.startsWith('act_') ? acct.account_id : `act_${acct.account_id}`;

  try {
    const data = (await callMeta(
      ctx,
      `/${acctPath}?fields=balance,spend_cap,currency,timezone_name,amount_spent,funding_source,account_status`,
      '/act_<id>',
    )) as Record<string, unknown>;

    await ctx.supabase
      .from('meta_ad_accounts')
      .update({
        balance: data.balance ? Number(data.balance) / 100 : null,
        spend_cap: data.spend_cap ? Number(data.spend_cap) / 100 : null,
        currency: data.currency ?? null,
        timezone_name: data.timezone_name ?? null,
        amount_spent: data.amount_spent ? Number(data.amount_spent) / 100 : null,
        funding_source: data.funding_source ?? null,
        account_status_code: data.account_status ?? null,
        last_scanned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('company_id', ctx.companyId)
      .eq('account_id', acct.account_id);

    ctx.stats.accounts_enriched++;
  } catch (err) {
    pushError(ctx, `enrichAdAccount(${acct.account_id})`, err);
  }
}

// ============================================================================
// Sync Ad Sets (paginado + batch upsert)
// FIX Q1: backfill removido daqui — agora roda UMA VEZ ao final do deepScan
// ============================================================================
async function syncAdsets(ctx: ScanContext, accountId: string) {
  const acctPath = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
  try {
    const adsets = await callMetaPaginated<Record<string, unknown>>(
      ctx,
      `/${acctPath}/adsets?fields=id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,budget_remaining,bid_strategy,billing_event,optimization_goal,targeting,promoted_object,start_time,end_time&limit=100`,
      '/act_<id>/adsets',
    );

    // Map campaign external_id -> uuid
    const campaignExternalIds = [...new Set(adsets.map((a) => String(a.campaign_id)).filter(Boolean))];
    const { data: campaigns } = await ctx.supabase
      .from('campaigns')
      .select('id, external_id')
      .eq('company_id', ctx.companyId)
      .in('external_id', campaignExternalIds);

    const campaignIdMap = new Map<string, string>();
    for (const c of campaigns ?? []) {
      if (c.external_id) campaignIdMap.set(c.external_id, c.id);
    }

    const nowIso = new Date().toISOString();
    const externalIds: string[] = [];
    const rows = adsets.map((adset) => {
      const externalId = String(adset.id);
      externalIds.push(externalId);
      return {
        company_id: ctx.companyId,
        integration_id: ctx.integrationId,
        external_id: externalId,
        name: adset.name ?? null,
        status: adset.status ?? null,
        effective_status: adset.effective_status ?? null,
        campaign_id: campaignIdMap.get(String(adset.campaign_id)) ?? null,
        campaign_external_id: adset.campaign_id ?? null,
        daily_budget: adset.daily_budget ? Number(adset.daily_budget) / 100 : null,
        lifetime_budget: adset.lifetime_budget ? Number(adset.lifetime_budget) / 100 : null,
        budget_remaining: adset.budget_remaining ? Number(adset.budget_remaining) / 100 : null,
        bid_strategy: adset.bid_strategy ?? null,
        billing_event: adset.billing_event ?? null,
        optimization_goal: adset.optimization_goal ?? null,
        targeting: adset.targeting ?? null,
        promoted_object: adset.promoted_object ?? null,
        start_time: adset.start_time ?? null,
        end_time: adset.end_time ?? null,
        platform: 'meta',
        last_scanned_at: nowIso,
        deleted_at: null,
        updated_at: nowIso,
      };
    });

    await safeUpsertBatch(ctx, 'adsets', rows, 'external_id,company_id', 'adsets_synced');

    // Soft delete sweep escopado por campanhas dessa conta
    if (externalIds.length > 0 && campaignExternalIds.length > 0) {
      await softDeleteSweep(ctx, 'adsets', externalIds, {
        column: 'campaign_external_id',
        values: campaignExternalIds,
      });
    }
  } catch (err) {
    pushError(ctx, `syncAdsets(${accountId})`, err);
  }
}

// ============================================================================
// Sync Pixels (paginado + batch upsert)
// ============================================================================
async function syncPixels(ctx: ScanContext, accountId: string) {
  const acctPath = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
  try {
    const pixels = await callMetaPaginated<Record<string, unknown>>(
      ctx,
      `/${acctPath}/adspixels?fields=id,name,code,last_fired_time,creation_time,owner_business,can_proxy,is_unavailable,automatic_matching_fields,first_party_cookie_status&limit=100`,
      '/act_<id>/adspixels',
    );

    const nowIso = new Date().toISOString();
    const rows = pixels.map((px) => {
      const ownerBusiness = px.owner_business as { id?: string } | undefined;
      return {
        company_id: ctx.companyId,
        integration_id: ctx.integrationId,
        external_id: String(px.id),
        name: px.name ?? null,
        code: px.code ?? null,
        last_fired_time: px.last_fired_time ?? null,
        creation_time: px.creation_time ?? null,
        owner_business_id: ownerBusiness?.id ?? null,
        can_proxy: px.can_proxy ?? null,
        is_unavailable: px.is_unavailable ?? null,
        automatic_matching_fields: px.automatic_matching_fields ?? null,
        first_party_cookie_status: px.first_party_cookie_status ?? null,
        ad_account_id: accountId,
        last_scanned_at: nowIso,
        deleted_at: null,
        updated_at: nowIso,
      };
    });

    await safeUpsertBatch(ctx, 'meta_pixels', rows, 'external_id,company_id', 'pixels_synced');
  } catch (err) {
    pushError(ctx, `syncPixels(${accountId})`, err);
  }
}

// ============================================================================
// Enrich Pages
// ============================================================================
async function enrichPages(ctx: ScanContext) {
  try {
    const { data: pages } = await ctx.supabase
      .from('meta_pages')
      .select('id, page_id, last_scanned_at')
      .eq('company_id', ctx.companyId)
      .is('deleted_at', null);

    if (!pages || pages.length === 0) return;

    for (const page of pages) {
      // Pages tier: trata todas como "ACTIVE" para refetch a cada 6h
      if (isFresh(page.last_scanned_at, 'ACTIVE')) continue;

      try {
        const data = (await callMeta(
          ctx,
          `/${page.page_id}?fields=id,name,verification_status,category,category_list,fan_count,followers_count,link,picture{url}`,
          '/<page_id>',
        )) as Record<string, unknown>;

        const picture = data.picture as { data?: { url?: string } } | undefined;

        await ctx.supabase
          .from('meta_pages')
          .update({
            page_name: data.name ?? null,
            page_category: data.category ?? null,
            verification_status: data.verification_status ?? null,
            category_list: data.category_list ?? null,
            fan_count: data.fan_count ?? null,
            followers_count: data.followers_count ?? null,
            link: data.link ?? null,
            picture_url: picture?.data?.url ?? null,
            last_scanned_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', page.id);

        ctx.stats.pages_updated++;
      } catch (err) {
        pushError(ctx, `enrichPage(${page.page_id})`, err);
      }
    }
  } catch (err) {
    pushError(ctx, 'enrichPages', err);
  }
}

// ============================================================================
// Orchestrator
// ============================================================================
async function deepScan(ctx: ScanContext, accountIds?: string[]) {
  // 1. Business Managers (1 call)
  await syncBMs(ctx);

  // 2. Lista de ad accounts ativas
  let query = ctx.supabase
    .from('meta_ad_accounts')
    .select('account_id, account_name, account_status, last_scanned_at')
    .eq('company_id', ctx.companyId)
    .is('deleted_at', null);

  if (accountIds && accountIds.length > 0) {
    query = query.in('account_id', accountIds);
  }

  const { data: accounts } = await query;
  if (!accounts || accounts.length === 0) {
    pushError(ctx, 'listAccounts', 'Nenhuma ad account ativa');
    return;
  }

  // 3. Processa em batches de 5 com timeout guard (FIX H4: check externo + interno)
  let processedIdx = 0;
  const isTimedOut = () => Date.now() - ctx.startedAt > TIMEOUT_GUARD_MS;

  for (const batch of chunks(accounts, BATCH_SIZE)) {
    if (isTimedOut()) {
      ctx.stats.timeout_hit = true;
      ctx.stats.remaining_account_ids = accounts.slice(processedIdx).map((a) => a.account_id);
      break;
    }

    await Promise.all(
      batch.map(async (acct) => {
        // Check tambem dentro do batch — cada sub-sync e skippada se ja estourou
        if (isTimedOut()) return;
        await enrichAdAccount(ctx, acct);
        if (isTimedOut()) return;
        await syncAdsets(ctx, acct.account_id);
        if (isTimedOut()) return;
        await syncPixels(ctx, acct.account_id);
      }),
    );

    processedIdx += batch.length;

    // Segundo check apos batch — se estourou durante, marca remaining
    if (isTimedOut() && processedIdx < accounts.length) {
      ctx.stats.timeout_hit = true;
      ctx.stats.remaining_account_ids = accounts.slice(processedIdx).map((a) => a.account_id);
      break;
    }
  }

  // 4. Pages enrichment (so se nao estourou timeout)
  if (!ctx.stats.timeout_hit) {
    await enrichPages(ctx);
  }

  // 5. FIX Q1: backfill UMA vez ao final (nao N vezes por conta)
  // Reconcilia adsets orfaos (campaign_id NULL) quando campanhas aparecem via meta-sync
  try {
    await ctx.supabase.rpc('backfill_adsets_campaign_id', { p_company_id: ctx.companyId });
  } catch (err) {
    pushError(ctx, 'backfill_adsets_campaign_id', err);
  }
}

// ============================================================================
// HTTP handler
// ============================================================================
Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  let companyId: string | null = null;
  let body: { account_ids?: string[]; company_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // Auth: x-cron-secret OR Authorization Bearer
  const cronSecret = req.headers.get('x-cron-secret');
  const expectedCronSecret = Deno.env.get('CRON_SECRET');

  if (cronSecret && expectedCronSecret && cronSecret === expectedCronSecret) {
    if (!body.company_id) {
      return new Response(JSON.stringify({ error: 'company_id required for cron call' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    companyId = body.company_id;
  } else {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false },
      },
    );
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('current_organization_id')
      .eq('id', user.id)
      .single();
    if (!profile?.current_organization_id) {
      return new Response(JSON.stringify({ error: 'Organizacao nao encontrada' }), {
        status: 404,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('id')
      .eq('organization_id', profile.current_organization_id)
      .single();
    if (!company) {
      return new Response(JSON.stringify({ error: 'Empresa nao encontrada' }), {
        status: 404,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    companyId = company.id;
  }

  // Get integration + decrypt token
  const { data: integration } = await supabaseAdmin
    .from('integrations')
    .select('id, access_token, scan_interval_hours, status')
    .eq('company_id', companyId)
    .eq('platform', 'meta')
    .single();

  if (!integration) {
    return new Response(JSON.stringify({ error: 'Integracao Meta nao encontrada' }), {
      status: 404,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const { data: token, error: decryptError } = await supabaseAdmin.rpc('decrypt_meta_token', {
    encrypted_token: integration.access_token,
  });
  if (decryptError || !token) {
    return new Response(JSON.stringify({ error: 'Falha ao descriptografar token' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // Cria scan log inicial
  // FIX Q4: log erro se INSERT falhar (evita scan silencioso sem auditoria)
  const triggeredBy = cronSecret ? 'cron' : 'manual';
  const { data: scanLog, error: scanLogInsertError } = await supabaseAdmin
    .from('meta_scan_logs')
    .insert({
      company_id: companyId,
      integration_id: integration.id,
      scan_type: 'deep_scan',
      status: 'running',
      triggered_by: triggeredBy,
    })
    .select('id')
    .single();

  if (scanLogInsertError || !scanLog?.id) {
    console.error(
      `[meta-deep-scan] Failed to create scan_log for company ${companyId}:`,
      scanLogInsertError?.message ?? 'no id returned',
    );
  }

  const ctx: ScanContext = {
    supabase: supabaseAdmin,
    token: token as string,
    companyId: companyId!,
    integrationId: integration.id,
    startedAt: Date.now(),
    scanLogId: scanLog?.id ?? '',
    stats: {
      bms_synced: 0,
      bms_deleted: 0,
      accounts_enriched: 0,
      accounts_skipped_fresh: 0,
      adsets_synced: 0,
      adsets_deleted: 0,
      pixels_synced: 0,
      pixels_deleted: 0,
      pages_updated: 0,
      retries_count: 0,
      errors: [],
      timeout_hit: false,
      remaining_account_ids: [],
    },
    rateLimits: new Map(),
  };

  try {
    await deepScan(ctx, body.account_ids);

    const finalStatus = ctx.stats.errors.length === 0
      ? 'success'
      : ctx.stats.errors.length < 3
        ? 'partial'
        : 'failed';

    // Agrega error_summary {code: count} para observabilidade
    const errorSummary: Record<string, number> = {};
    for (const e of ctx.stats.errors) {
      const k = e.code ?? 'unknown';
      errorSummary[k] = (errorSummary[k] ?? 0) + 1;
    }

    // Atualiza scan log
    if (ctx.scanLogId) {
      await supabaseAdmin
        .from('meta_scan_logs')
        .update({
          status: finalStatus,
          finished_at: new Date().toISOString(),
          stats: ctx.stats,
          error_summary: errorSummary,
          error: ctx.stats.errors.length > 0 ? ctx.stats.errors.map((e) => `${e.where}: ${e.error}`).join('; ').slice(0, 1000) : null,
        })
        .eq('id', ctx.scanLogId);
    }

    // Auto-mark integration expired se algum sub-sync detectou token invalido
    const tokenExpired = !!errorSummary.token_expired;
    if (tokenExpired) {
      await supabaseAdmin.from('integrations').update({ status: 'expired' }).eq('id', integration.id);
    }

    // H2: Recovery — se integration estava 'stale' e o scan rodou sem token_expired,
    // restaura para 'active' (mesmo com erros parciais — token funcionando ja basta)
    const integrationStatus = (integration as { status?: string }).status;
    if (!tokenExpired && integrationStatus === 'stale') {
      await supabaseAdmin.from('integrations').update({ status: 'active' }).eq('id', integration.id);
    }

    // M2: Skip next_scan_at se token expirou — cron filtra status='active' de qualquer jeito,
    // mas evita mostrar "proxima execucao em X" pra integration morta
    if (!tokenExpired) {
      const intervalHours = (integration as { scan_interval_hours?: number }).scan_interval_hours ?? 24;
      const jitterMs = Math.random() * 3600_000;
      const nextScanAt = new Date(Date.now() + intervalHours * 3600_000 + jitterMs).toISOString();
      await supabaseAdmin
        .from('integrations')
        .update({
          last_deep_scan_at: new Date().toISOString(),
          next_scan_at: nextScanAt,
        })
        .eq('id', integration.id);
    } else {
      // Token expirou — registra last_deep_scan_at mas nao agenda proxima
      await supabaseAdmin
        .from('integrations')
        .update({ last_deep_scan_at: new Date().toISOString() })
        .eq('id', integration.id);
    }

    return new Response(
      JSON.stringify({ status: finalStatus, stats: ctx.stats }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const fatalCode = err instanceof MetaApiError ? err.code : extractErrorCode(err);
    if (ctx.scanLogId) {
      await supabaseAdmin
        .from('meta_scan_logs')
        .update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          stats: ctx.stats,
          error: errorMsg.slice(0, 1000),
          error_summary: fatalCode ? { [fatalCode]: 1 } : {},
        })
        .eq('id', ctx.scanLogId);
    }
    // Auto-mark integration expired se token invalido
    if (fatalCode === 'token_expired') {
      await supabaseAdmin.from('integrations').update({ status: 'expired' }).eq('id', integration.id);
    }
    return new Response(
      JSON.stringify({ error: errorMsg, stats: ctx.stats }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }
});
