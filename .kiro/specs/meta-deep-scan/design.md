# Design: Meta Deep Scan (Varredura Profunda)

> **Status:** DRAFT — aguardando aprovacao
> **Idioma:** pt-BR
> **Owner:** Thanos + Thor + Captain America (security review)

## Overview

**Purpose:** Pipeline de ingestao profunda Meta — BMs, Adsets, Pixels, Pages enriquecidas — com arquitetura escalavel para 1000+ integracoes via stagger, freshness tiering, soft delete e particionamento preventivo de `campaign_metrics`.

**Users:** Gestores que precisam de auditoria de compliance + dados frescos sem clicar em "Sincronizar" toda hora.

**Impact:** Habilita o pilar "auditavel" do produto. Prepara o terreno para `meta-audit-rules` (proxima spec).

### Goals
- Sincronizar 7 entidades Meta (BMs, ad accounts enriched, adsets, pixels, pages enriched) com o minimo de chamadas API
- Suportar 1000+ integracoes sem stampede (stagger via `next_scan_at`)
- Reduzir chamadas Meta em ~70% via freshness tier
- Soft delete universal para auditoria de "quando sumiu"
- Particionar `campaign_metrics` antes de doer
- Resiliente: 1 falha != scan inteiro abortado

### Non-Goals
- UI para visualizar BMs/adsets/pixels (spec separada)
- Stats de eventos por pixel (spec separada, on-demand)
- Webhooks Meta (futuro)
- Regras de compliance (spec separada)

## Architecture

### Fluxo macro

```
                      ┌─────────────────────┐
                      │ pg_cron */15 * * * * │
                      │ meta-deep-scan-tick  │
                      └──────────┬───────────┘
                                 │ SELECT 20 integrations
                                 │ WHERE next_scan_at <= now()
                                 │ ORDER BY next_scan_at ASC
                                 ▼
                  ┌──────────────────────────────────┐
                  │ for each integration (parallel): │
                  │   net.http_post(meta-deep-scan)  │
                  │   headers: x-cron-secret         │
                  │   body: { company_id }           │
                  └────────────┬─────────────────────┘
                               │
                               ▼
              ┌────────────────────────────────────────┐
              │   Edge Function: meta-deep-scan        │
              │   ┌──────────────────────────────────┐ │
              │   │ 0. INSERT meta_scan_logs running │ │
              │   │ 1. resolve company_id + token    │ │
              │   │ 2. decrypt token                 │ │
              │   │ 3. SyncBMs() — soft delete       │ │
              │   │ 4. for batch in chunks(accts,5): │ │
              │   │     for acct in batch (parallel):│ │
              │   │       EnrichAdAccount(acct)      │ │
              │   │       SyncAdsets(acct, tier)     │ │
              │   │       SyncPixels(acct)           │ │
              │   │ 5. EnrichPages() — tier          │ │
              │   │ 6. UPDATE meta_scan_logs success │ │
              │   │ 7. UPDATE next_scan_at + jitter  │ │
              │   │ 8. timeout guard at 120s         │ │
              │   └──────────────────────────────────┘ │
              └────────────────────────────────────────┘
                               │
                               ▼
              meta_business_managers, meta_ad_accounts (enriched),
              adsets, meta_pixels, meta_pages (enriched), meta_scan_logs
```

### Manual trigger (UI)

```
[Botao "Varredura Profunda" em Integrations.tsx]
  → useDeepScan().deepScan()
    → fetch Edge meta-deep-scan
       headers: Authorization Bearer <user JWT>
       body: {} (sem account_ids = full)
    → invalidateQueries
    → toast resultado
```

## Database Schema

### Novas tabelas

#### `meta_business_managers`
```sql
CREATE TABLE meta_business_managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  name text,
  vertical text,
  primary_page text,
  created_time timestamptz,
  two_factor_type text,
  verification_status text,
  last_scanned_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT meta_bms_external_company_unique UNIQUE (external_id, company_id)
);

CREATE INDEX idx_meta_bms_company ON meta_business_managers(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_meta_bms_scanned ON meta_business_managers(last_scanned_at);

ALTER TABLE meta_business_managers ENABLE ROW LEVEL SECURITY;

CREATE POLICY meta_bms_select ON meta_business_managers FOR SELECT
  USING (company_id = current_user_company_id());
CREATE POLICY meta_bms_all ON meta_business_managers FOR ALL
  USING (company_id = current_user_company_id())
  WITH CHECK (company_id = current_user_company_id());
```

#### `adsets`
```sql
CREATE TABLE adsets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text NOT NULL,
  name text,
  status text,
  effective_status text,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  campaign_external_id text,
  daily_budget numeric,
  lifetime_budget numeric,
  budget_remaining numeric,
  bid_strategy text,
  billing_event text,
  optimization_goal text,
  targeting jsonb,
  promoted_object jsonb,
  start_time timestamptz,
  end_time timestamptz,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  integration_id uuid REFERENCES integrations(id) ON DELETE CASCADE,
  platform text DEFAULT 'meta',
  last_scanned_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT adsets_external_company_unique UNIQUE (external_id, company_id)
);

CREATE INDEX idx_adsets_company ON adsets(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_adsets_campaign ON adsets(campaign_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_adsets_effective_status ON adsets(effective_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_adsets_scanned ON adsets(last_scanned_at);

ALTER TABLE adsets ENABLE ROW LEVEL SECURITY;
CREATE POLICY adsets_all ON adsets FOR ALL
  USING (company_id = current_user_company_id())
  WITH CHECK (company_id = current_user_company_id());
```

#### `meta_pixels`
```sql
CREATE TABLE meta_pixels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text NOT NULL,
  name text,
  code text,
  last_fired_time timestamptz,
  creation_time timestamptz,
  owner_business_id text,
  can_proxy boolean,
  is_unavailable boolean,
  automatic_matching_fields jsonb,
  first_party_cookie_status text,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  integration_id uuid REFERENCES integrations(id) ON DELETE CASCADE,
  ad_account_id text,
  last_scanned_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT meta_pixels_external_company_unique UNIQUE (external_id, company_id)
);

CREATE INDEX idx_meta_pixels_company ON meta_pixels(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_meta_pixels_account ON meta_pixels(ad_account_id);
CREATE INDEX idx_meta_pixels_scanned ON meta_pixels(last_scanned_at);

ALTER TABLE meta_pixels ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_pixels_all ON meta_pixels FOR ALL
  USING (company_id = current_user_company_id())
  WITH CHECK (company_id = current_user_company_id());
```

#### `meta_api_rate_limit`
```sql
CREATE TABLE meta_api_rate_limit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  integration_id uuid REFERENCES integrations(id) ON DELETE CASCADE,
  endpoint_pattern text NOT NULL,
  x_business_use_case_usage jsonb,
  x_app_usage jsonb,
  last_429_at timestamptz,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT meta_rate_limit_unique UNIQUE (company_id, endpoint_pattern)
);

CREATE INDEX idx_meta_rate_limit_429 ON meta_api_rate_limit(last_429_at) WHERE last_429_at IS NOT NULL;

ALTER TABLE meta_api_rate_limit ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_rate_limit_all ON meta_api_rate_limit FOR ALL
  USING (company_id = current_user_company_id())
  WITH CHECK (company_id = current_user_company_id());
```

#### `meta_scan_logs`
```sql
CREATE TABLE meta_scan_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  integration_id uuid REFERENCES integrations(id) ON DELETE CASCADE,
  scan_type text NOT NULL CHECK (scan_type IN ('full_sync','deep_scan')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL CHECK (status IN ('running','success','partial','failed')),
  stats jsonb,
  error text,
  triggered_by text NOT NULL CHECK (triggered_by IN ('manual','cron'))
);

CREATE INDEX idx_meta_scan_logs_company ON meta_scan_logs(company_id, started_at DESC);
CREATE INDEX idx_meta_scan_logs_status ON meta_scan_logs(status) WHERE status = 'running';

ALTER TABLE meta_scan_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_scan_logs_select ON meta_scan_logs FOR SELECT
  USING (company_id = current_user_company_id());
-- INSERT/UPDATE feito apenas pelas Edge Functions com service_role, sem policy explicita
```

### Alteracoes em tabelas existentes

#### `meta_ad_accounts`
```sql
ALTER TABLE meta_ad_accounts
  ADD COLUMN balance numeric,
  ADD COLUMN spend_cap numeric,
  ADD COLUMN timezone_name text,
  ADD COLUMN amount_spent numeric,
  ADD COLUMN funding_source text,
  ADD COLUMN account_status_code int,
  ADD COLUMN last_scanned_at timestamptz,
  ADD COLUMN deleted_at timestamptz;

-- Migration de is_active -> deleted_at
UPDATE meta_ad_accounts SET deleted_at = now() WHERE is_active = false;

-- DROP COLUMN is_active sera em migration SEPARADA depois de validar
-- (mantemos as duas colunas convivendo para safety durante migracao)
```

#### `meta_pages`
```sql
ALTER TABLE meta_pages
  ADD COLUMN verification_status text,
  ADD COLUMN category_list jsonb,
  ADD COLUMN fan_count int,
  ADD COLUMN followers_count int,
  ADD COLUMN link text,
  ADD COLUMN picture_url text,
  ADD COLUMN last_scanned_at timestamptz,
  ADD COLUMN deleted_at timestamptz;

UPDATE meta_pages SET deleted_at = now() WHERE is_active = false;
```

#### `integrations`
```sql
ALTER TABLE integrations
  ADD COLUMN next_scan_at timestamptz DEFAULT now(),
  ADD COLUMN last_deep_scan_at timestamptz;

CREATE INDEX idx_integrations_next_scan
  ON integrations(next_scan_at)
  WHERE platform = 'meta' AND status = 'active';
```

### Particionamento de `campaign_metrics`

Estrategia em **3 fases** com plano de rollback:

**Fase A (sem downtime):**
```sql
-- 1. Cria tabela particionada com mesma estrutura
CREATE TABLE campaign_metrics_p (LIKE campaign_metrics INCLUDING ALL)
  PARTITION BY RANGE (data);

-- 2. Cria 15 particoes (12 passados + 3 futuros)
DO $$
DECLARE m int;
BEGIN
  FOR m IN -12..3 LOOP
    EXECUTE format(
      'CREATE TABLE campaign_metrics_p_%s PARTITION OF campaign_metrics_p
       FOR VALUES FROM (%L) TO (%L)',
      to_char((date_trunc('month', now()) + (m || ' months')::interval)::date, 'YYYY_MM'),
      (date_trunc('month', now()) + (m || ' months')::interval)::date,
      (date_trunc('month', now()) + ((m+1) || ' months')::interval)::date
    );
  END LOOP;
END $$;

-- 3. Backfill (idempotente — pode rodar varias vezes)
INSERT INTO campaign_metrics_p SELECT * FROM campaign_metrics
ON CONFLICT DO NOTHING;
```

**Fase B (janela curta de manutencao — < 30s):**
```sql
BEGIN;
  -- Captura linhas novas que entraram durante backfill
  INSERT INTO campaign_metrics_p
    SELECT * FROM campaign_metrics
    WHERE id NOT IN (SELECT id FROM campaign_metrics_p);

  ALTER TABLE campaign_metrics RENAME TO campaign_metrics_old;
  ALTER TABLE campaign_metrics_p RENAME TO campaign_metrics;
COMMIT;
```

**Fase C (validacao + cleanup, dias depois):**
```sql
-- Apos 7 dias confirmando que tudo funciona:
DROP TABLE campaign_metrics_old;
```

**Job auto-criacao de particao** (pg_cron mensal):
```sql
SELECT cron.schedule(
  'campaign-metrics-create-partition',
  '0 0 25 * *',  -- dia 25 de cada mes
  $$
  DO $do$
  DECLARE
    next_month date := date_trunc('month', now() + interval '2 months');
    next_after date := next_month + interval '1 month';
    partition_name text := 'campaign_metrics_p_' || to_char(next_month, 'YYYY_MM');
  BEGIN
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF campaign_metrics
       FOR VALUES FROM (%L) TO (%L)',
      partition_name, next_month, next_after
    );
  END $do$;
  $$
);
```

**Rollback plan:**
- Fase B falhar: ROLLBACK + investigar; tabela `campaign_metrics_p` continua existindo mas nao usada
- Pos-Fase B com bug: `ALTER TABLE campaign_metrics RENAME TO campaign_metrics_p; ALTER TABLE campaign_metrics_old RENAME TO campaign_metrics;`
- Fase C ja foi: backup completo via Supabase point-in-time recovery

## Components

### Edge Function `meta-deep-scan`

**Estrutura interna (Deno):**
```typescript
// supabase/functions/meta-deep-scan/index.ts

interface ScanContext {
  supabase: SupabaseClient;
  token: string;
  companyId: string;
  integrationId: string;
  startedAt: Date;
  scanLogId: string;
  stats: ScanStats;
  rateLimits: Map<string, RateLimitState>;
}

async function deepScan(ctx: ScanContext, accountIds?: string[]) {
  await syncBMs(ctx);

  const accounts = await listActiveAccounts(ctx, accountIds);
  for (const batch of chunks(accounts, 5)) {
    if (Date.now() - ctx.startedAt.getTime() > 120_000) {
      ctx.stats.timeout_hit = true;
      ctx.stats.remaining_account_ids = accounts
        .slice(accounts.indexOf(batch[0]))
        .map(a => a.account_id);
      break;
    }
    await Promise.all(batch.map(acct => syncAccountDeep(ctx, acct)));
  }

  await enrichPages(ctx);
  await finalizeScan(ctx);
}

async function syncAccountDeep(ctx: ScanContext, acct: AdAccount) {
  try {
    await enrichAdAccount(ctx, acct);
    await syncAdsets(ctx, acct);
    await syncPixels(ctx, acct);
  } catch (err) {
    ctx.stats.errors.push({ account_id: acct.account_id, error: err.message });
  }
}
```

### Freshness tier helper

```typescript
function isFresh(lastScannedAt: Date | null, effectiveStatus: string): boolean {
  if (!lastScannedAt) return false;
  const ageMs = Date.now() - lastScannedAt.getTime();
  const tierMs = effectiveStatus === 'ACTIVE' ? 6 * 3600_000
              : effectiveStatus === 'PAUSED' ? 24 * 3600_000
              : 7 * 24 * 3600_000;
  return ageMs < tierMs;
}
```

### Rate limit helper

```typescript
async function callMeta(ctx: ScanContext, endpoint: string, opts?: RequestInit) {
  const state = ctx.rateLimits.get(endpoint) ?? { usage: 0 };
  if (state.usage >= 90) await sleep(2000);

  const res = await fetch(`https://graph.facebook.com/v22.0${endpoint}`, opts);

  const usage = JSON.parse(res.headers.get('x-business-use-case-usage') ?? '{}');
  const appUsage = JSON.parse(res.headers.get('x-app-usage') ?? '{}');
  const maxUsage = Math.max(
    appUsage.call_count ?? 0,
    appUsage.total_cputime ?? 0,
    appUsage.total_time ?? 0,
    ...Object.values(usage).flatMap((u: any) =>
      Array.isArray(u) ? u.map((x: any) => Math.max(x.call_count ?? 0, x.total_cputime ?? 0)) : []
    )
  );

  ctx.rateLimits.set(endpoint, { usage: maxUsage });
  await upsertRateLimit(ctx, endpoint, usage, appUsage);

  if (res.status === 429) {
    await markRateLimit429(ctx, endpoint);
    throw new Error(`Rate limited on ${endpoint}`);
  }
  return res;
}
```

### Frontend

| Arquivo | Responsabilidade |
|---------|------------------|
| `src/hooks/use-deep-scan.ts` (novo) | useQuery `last_deep_scan_at` + mutation `deepScan()` |
| `src/pages/Integrations.tsx` | Botao "Varredura Profunda" + toast resultado |

## Algorithms

### `next_scan_at` jitter
```typescript
const baseInterval = 24 * 3600_000; // 24h
const jitter = Math.random() * 3600_000; // 0-1h
nextScanAt = new Date(Date.now() + baseInterval + jitter);
```

Resultado: scans naturalmente se espalham num intervalo de 1h, evitando reagrupamento mesmo apos falhas.

### Soft delete sweep
Apos cada scan que retorna lista (BMs, adsets, pixels):
```sql
UPDATE meta_business_managers
SET deleted_at = now()
WHERE company_id = $1
  AND deleted_at IS NULL
  AND external_id NOT IN (SELECT unnest($2::text[]));
```
E para revival:
```sql
UPDATE meta_business_managers
SET deleted_at = NULL, last_scanned_at = now()
WHERE company_id = $1
  AND external_id = ANY($2::text[])
  AND deleted_at IS NOT NULL;
```

## Security

1. **RLS estrita** em TODAS as 5 tabelas novas — `company_id = current_user_company_id()`
2. **Edge Function autenticada** por user JWT OU `x-cron-secret` (verificado contra Supabase Vault)
3. **Token Meta** continua decriptado apenas dentro da Edge Function via `decrypt_meta_token` RPC
4. **`meta_scan_logs`** so tem policy de SELECT — INSERT/UPDATE somente via service_role
5. **`meta_api_rate_limit`** acessivel apenas dentro do tenant (RLS)

## Trade-offs

| Decisao | Pros | Contras |
|---|---|---|
| Soft delete via `deleted_at` (vs `is_active`) | Auditoria de "quando sumiu" + TTL trivial | Queries precisam `WHERE deleted_at IS NULL` (uso de partial index mitiga) |
| `next_scan_at` + cron `*/15` | Distribui carga; retomavel; prioriza atrasados | Latencia maxima de "primeiro scan" pode ser ate 15min |
| Freshness tier hardcoded (6h/24h/7d) | Reduz ~70% chamadas Meta | Nao configuravel por usuario (proxima spec se necessario) |
| Particionamento por mes (vs semana/dia) | Equilibrio: nao explode num. de particoes nem deixa cada uma gigante | Queries cross-month tem leve overhead |
| Chunking via `account_ids[]` opcional | Permite empresa gigante completar via N invocacoes | Logica de retomada e responsabilidade do caller (cron acompanha via `remaining_account_ids` no log) |
| `meta_scan_logs` sem RLS de INSERT | Edge Functions usam service_role mesmo | Nao bloqueia escritas indevidas se service_role vazar (mitigar via secret rotation) |
| Sem stats de pixel events | Economiza ~100k calls/dia em escala | Usuario nao ve "PageView fired 1234 times" sem abrir detalhe (proxima spec) |

## Risks

| Risco | Probabilidade | Impacto | Mitigacao |
|---|---|---|---|
| Migracao de `campaign_metrics` falha | Media | Alto | Plano de rollback em 3 fases + Supabase PITR |
| Edge Function timeout em conta gigante | Media | Medio | Guard de 120s + chunking via `account_ids[]` |
| Rate limit Meta apos 1000+ integracoes | Alta | Alto | Stagger + freshness tier reduz ~70% calls; rate limit tracker aborta antes do 429 |
| Soft delete acumula linhas mortas | Baixa | Baixo | TTL job futuro: `DELETE WHERE deleted_at < now() - 1 year` |
| pg_cron tick pega mesma integracao 2× | Baixa | Medio | Cron `LIMIT 20` + `next_scan_at` atualizado pela Edge Function antes do scan terminar |
| Token expira no meio do scan | Baixa | Medio | Try/catch ja captura; scan_log marca `partial`; usuario reconecta |

## Open Questions (ja resolvidas, nao precisam de mais aprovacao)

- ✅ Soft delete: SIM, via `deleted_at`
- ✅ Pixel stats: NAO, spec separada
- ✅ Cron horario: stagger via `next_scan_at`, nao horario fixo
- ✅ UI: spec separada
- ✅ Particionamento: SIM, agora
- ✅ Chunking: SIM, opcional via parametro

## Migration Order

```
1. ALTER integrations (next_scan_at, last_deep_scan_at)
2. ALTER meta_ad_accounts (novas colunas + deleted_at)
3. ALTER meta_pages (novas colunas + deleted_at)
4. CREATE meta_business_managers
5. CREATE adsets
6. CREATE meta_pixels
7. CREATE meta_api_rate_limit
8. CREATE meta_scan_logs
9. Particionamento campaign_metrics — Fase A (sem downtime)
10. Particionamento campaign_metrics — Fase B (janela curta)
11. pg_cron meta-deep-scan-tick
12. pg_cron campaign-metrics-create-partition
13. pg_cron meta-scan-logs-purge
14. (Apos 7d validacao) Particionamento Fase C (DROP old)
15. (Apos validacao) DROP COLUMN is_active de meta_ad_accounts e meta_pages
```
