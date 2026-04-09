# Requirements: Meta Deep Scan (Varredura Profunda — BMs, Pixels, Adsets, Pages)

> **Status:** DRAFT v2 — aguardando aprovacao
> **Criado:** 2026-04-06
> **Idioma:** pt-BR
> **Owner:** Thanos (META_SPECIALIST) + Thor (BACKEND)
> **Otimizacao:** Decisoes feitas pensando em escala 1000+ empresas × 50 ad accounts cada

## Introduction

Hoje o ClickHero ja sincroniza **campanhas**, **insights diarios** e **criativos** via [meta-sync-dashboard](../meta-sync-dashboard/). Falta o que torna o produto **auditavel** de verdade: **Business Managers, Ad Sets, Pixels e Paginas com verification_status**.

Esta feature implementa o pipeline de **ingestao profunda** das contas Meta conectadas, expandindo o sync atual para mais entidades, com:
- **Tier de freshness por entidade** (ACTIVE/PAUSED/ARCHIVED) para nao re-buscar tudo todo dia
- **Scheduling distribuido** via `next_scan_at` (sem stampede de cron 03h)
- **Soft delete via `deleted_at`** (auditoria de "quando sumiu")
- **Particionamento mensal** de `campaign_metrics` (preventivo para 100M+ rows)
- **Chunking opcional por ad account** (driblar 150s timeout de Edge Function)

## Scope

**IN scope:**
- Sincronizar Business Managers (BMs)
- Enriquecer Ad Accounts (saldo, spend_cap, timezone, status)
- Sincronizar Ad Sets (adsets) — targeting, placement, schedule, budget
- Sincronizar Pixels (lista + metadados — **sem stats de eventos**)
- Enriquecer Pages (verification_status, fan_count, picture)
- Edge Function `meta-deep-scan` com chunking opcional por `account_ids[]`
- pg_cron job `meta-deep-scan-tick` (a cada 15min, pega vencidos)
- Tabela `meta_api_rate_limit` para throttle
- Particionamento mensal de `campaign_metrics`
- Hook React `useDeepScan()` + botao "Varredura Profunda"

**OUT of scope (proximas specs):**
- **Pixel events stats** — spec futura `meta-pixel-explorer` (lazy + on-demand)
- UI para listar BMs/Pixels/Adsets — spec `meta-explorer-ui`
- Auditoria automatica (regras de compliance) — spec `meta-audit-rules`
- Webhooks Meta (real-time) — spec `meta-webhooks`
- Alertas — backlog

## Cross-Cutting Decisions (escalabilidade)

**Soft delete:** TODAS as tabelas novas usam `deleted_at timestamptz NULL` em vez de `is_active boolean`. Query padrao: `WHERE deleted_at IS NULL`. Permite TTL futuro e auditoria de "quando sumiu".

**Freshness tiering:** Cada entidade tem `last_scanned_at` + a logica de scan respeita:
- `ACTIVE` ou `effective_status='ACTIVE'`: refetch se `last_scanned_at < now() - 6h`
- `PAUSED`: refetch se `last_scanned_at < now() - 24h`
- `ARCHIVED`/`DELETED`: refetch se `last_scanned_at < now() - 7d`

**Stagger via `next_scan_at`:** `integrations` ganha coluna `next_scan_at timestamptz`. Cron a cada 15min pega top-N vencidos. Apos scan, agenda proxima com jitter aleatorio para evitar reagrupamento.

**Chunking:** `meta-deep-scan` aceita parametro opcional `account_ids[]` para processar subset. Permite dividir empresa grande em multiplas invocacoes Edge Function.

## Requirements

### Requirement 1: Sync Business Managers

**Objective:** Como gestor multi-conta, quero ver todos os BMs conectados com seus detalhes, para entender a estrutura organizacional Meta da empresa.

#### Acceptance Criteria
1. The system shall criar tabela `meta_business_managers` com colunas: id (uuid), company_id, integration_id, external_id, name, vertical, primary_page, created_time, two_factor_type, verification_status, last_scanned_at, deleted_at, created_at, updated_at
2. The system shall aplicar RLS por `company_id = current_user_company_id()`
3. The system shall criar UNIQUE constraint `(external_id, company_id)`
4. When `meta-deep-scan` roda, the system shall buscar `GET /me/businesses?fields=id,name,vertical,primary_page,created_time,two_factor_type,verification_status`
5. The system shall fazer upsert por `(external_id, company_id)` e atualizar `last_scanned_at = now()`
6. The system shall marcar BMs ausentes do scan atual como `deleted_at = now()` (soft delete)
7. If um BM previamente deletado reaparece, then the system shall fazer `UPDATE deleted_at = NULL` (revival)

### Requirement 2: Enriquecer Ad Accounts

**Objective:** Como gestor, quero ver saldo e limite de gasto, para evitar campanhas pausadas por falta de saldo.

#### Acceptance Criteria
1. The system shall ALTER TABLE `meta_ad_accounts` ADD COLUMNS: `balance numeric`, `spend_cap numeric`, `timezone_name text`, `amount_spent numeric`, `funding_source text`, `account_status_code int`, `last_scanned_at timestamptz`, `deleted_at timestamptz`
2. The system shall migrar dados de `is_active` para `deleted_at` (UPDATE deleted_at = now() WHERE is_active = false; depois DROP COLUMN is_active em migration separada)
3. When `meta-deep-scan` roda, the system shall buscar `GET /act_<id>?fields=balance,spend_cap,currency,timezone_name,amount_spent,funding_source,account_status` para ad accounts com `deleted_at IS NULL`
4. The system shall converter valores Meta (cents) para reais dividindo por 100
5. The system shall fazer UPDATE em meta_ad_accounts e atualizar `last_scanned_at`

### Requirement 3: Sync Ad Sets

**Objective:** Como auditor, quero ver os adsets com targeting, placement e budget, para identificar conjuntos mal configurados.

#### Acceptance Criteria
1. The system shall criar tabela `adsets` com colunas: id (uuid), external_id, name, status, effective_status, campaign_id (uuid FK -> campaigns.id), campaign_external_id, daily_budget, lifetime_budget, budget_remaining, bid_strategy, billing_event, optimization_goal, targeting jsonb, promoted_object jsonb, start_time, end_time, company_id, integration_id, platform, last_scanned_at, deleted_at, created_at, updated_at
2. The system shall aplicar RLS por company_id
3. The system shall criar UNIQUE constraint `(external_id, company_id)` e indices em `campaign_id`, `effective_status`, `last_scanned_at`
4. The system shall respeitar **freshness tiering** (Cross-Cutting Decisions): so refetcha adsets cujo `last_scanned_at` esta vencido baseado no `effective_status` atual
5. When refetch e necessario, the system shall buscar `GET /act_<id>/adsets?fields=...`
6. The system shall mapear `campaign_external_id -> campaign_id` consultando `campaigns`
7. The system shall fazer upsert por `(external_id, company_id)`
8. The system shall converter valores monetarios Meta (cents) para reais
9. The system shall marcar adsets ausentes da response como `deleted_at = now()`

### Requirement 4: Sync Pixels (sem stats)

**Objective:** Como auditor, quero ver os pixels Meta da conta, para detectar pixel duplicado, ausente ou nao verificado.

#### Acceptance Criteria
1. The system shall criar tabela `meta_pixels` com colunas: id, external_id, name, code, last_fired_time, creation_time, owner_business_id, can_proxy, is_unavailable, automatic_matching_fields jsonb, first_party_cookie_status, company_id, integration_id, ad_account_id text, last_scanned_at, deleted_at, created_at, updated_at
2. The system shall aplicar RLS por company_id e UNIQUE `(external_id, company_id)`
3. When `meta-deep-scan` roda, the system shall buscar `GET /act_<id>/adspixels?fields=id,name,code,last_fired_time,creation_time,owner_business,can_proxy,is_unavailable,automatic_matching_fields,first_party_cookie_status` para cada ad account ativa
4. The system shall fazer upsert e atualizar `last_scanned_at`
5. The system shall marcar pixels ausentes como `deleted_at = now()`
6. **NOT in scope:** stats de eventos por pixel (sera spec futura `meta-pixel-explorer`, on-demand)

### Requirement 5: Enriquecer Pages

**Objective:** Como auditor, quero ver verification_status, categoria e fan_count das pages.

#### Acceptance Criteria
1. The system shall ALTER TABLE `meta_pages` ADD COLUMNS: `verification_status text`, `category_list jsonb`, `fan_count int`, `followers_count int`, `link text`, `picture_url text`, `last_scanned_at timestamptz`, `deleted_at timestamptz`
2. The system shall migrar `is_active` para `deleted_at` (mesma migration de meta_ad_accounts)
3. When `meta-deep-scan` roda, the system shall buscar `GET /<page_id>?fields=id,name,verification_status,category,category_list,fan_count,followers_count,link,picture{url}` para pages com `deleted_at IS NULL`
4. The system shall fazer UPDATE em meta_pages e atualizar `last_scanned_at`

### Requirement 6: Edge Function meta-deep-scan (com chunking)

**Objective:** Como sistema, quero uma Edge Function que orquestra a varredura, com possibilidade de chunking para empresas grandes.

#### Acceptance Criteria
1. The system shall criar Edge Function `meta-deep-scan` (Deno)
2. The function shall aceitar autenticacao via:
   - `Authorization: Bearer <user JWT>` (chamada manual do frontend), OU
   - `x-cron-secret: <secret>` + `body.company_id` (chamada do cron)
3. The function shall aceitar parametro opcional `body.account_ids: string[]` para processar apenas subset (chunking)
4. The function shall decriptar token Meta via RPC `decrypt_meta_token`
5. The function shall executar em sequencia: BMs -> Ad Accounts (enrich) -> Adsets -> Pixels -> Pages
6. The function shall **respeitar freshness tier** — pular entidades com `last_scanned_at` ainda fresh
7. The function shall processar ad accounts em batches de `BATCH_SIZE = 5`
8. The function shall registrar erros em `stats.errors[]` sem abortar o scan inteiro
9. The function shall criar linha em `meta_scan_logs` ao iniciar (`status='running'`) e atualizar ao terminar
10. The function shall atualizar `integrations.last_deep_scan_at` e `integrations.next_scan_at = now() + interval '24 hours' + (random() * interval '1 hour')`
11. The function shall retornar `{status, stats: {bms_synced, adsets_synced, pixels_synced, pages_updated, accounts_enriched, accounts_skipped_fresh, errors[]}}`
12. If a execucao passar de 120s (margem antes do timeout 150s), the function shall salvar progresso e sugerir continuacao via novo body `account_ids` no proximo tick

### Requirement 7: Rate Limit Tracking

**Objective:** Como sistema, quero respeitar 90% do rate limit Meta para evitar 429 e bans.

#### Acceptance Criteria
1. The system shall criar tabela `meta_api_rate_limit` com colunas: id, company_id, integration_id, endpoint_pattern text, x_business_use_case_usage jsonb, x_app_usage jsonb, last_429_at timestamptz, updated_at
2. The system shall criar UNIQUE `(company_id, endpoint_pattern)` e indice em `last_429_at`
3. After cada chamada Graph API, the function shall ler headers `X-Business-Use-Case-Usage` e `X-App-Usage` e fazer UPSERT
4. If qualquer metric do header passar de 90 (90% do limite), then a function shall fazer `await sleep(2000)` antes da proxima call ao mesmo endpoint
5. If receber HTTP 429, then the function shall registrar `last_429_at`, abortar o batch atual e adicionar erro descritivo em `stats.errors[]`

### Requirement 8: Stagger Scheduling via `next_scan_at`

**Objective:** Como sistema com 1000+ integracoes, quero distribuir a carga de scans ao longo do dia, evitando stampede de cron.

#### Acceptance Criteria
1. The system shall ALTER TABLE `integrations` ADD COLUMN `next_scan_at timestamptz DEFAULT now()`, `last_deep_scan_at timestamptz`
2. The system shall criar pg_cron job `meta-deep-scan-tick` rodando a cada 15 minutos (`*/15 * * * *`)
3. The job shall executar:
   ```sql
   SELECT id, company_id FROM integrations
   WHERE platform = 'meta'
     AND status = 'active'
     AND token_expires_at > now() + interval '1 day'
     AND next_scan_at <= now()
   ORDER BY next_scan_at ASC
   LIMIT 20;
   ```
4. For each integracao, the job shall chamar `meta-deep-scan` Edge Function via `net.http_post` passando `x-cron-secret` + `company_id`
5. After cada call, `meta-deep-scan` shall agendar `next_scan_at = now() + interval '24 hours' + (random() * interval '1 hour')` (jitter)
6. The system shall **nao** disparar todas as integracoes ao mesmo tempo — limite de 20 por tick = ~80/hora = ~1900/dia (suficiente para escala alvo)

### Requirement 9: Particionamento de campaign_metrics

**Objective:** Como sistema que vai acumular ~100M+ rows em campaign_metrics, quero particionar por mes para manter queries do dashboard < 1s.

#### Acceptance Criteria
1. The system shall criar nova tabela `campaign_metrics_partitioned` particionada por RANGE em `data`
2. The system shall criar particoes mensais para os ultimos 12 meses + proximos 3 meses
3. The system shall migrar dados existentes via `INSERT INTO campaign_metrics_partitioned SELECT * FROM campaign_metrics`
4. The system shall renomear: `campaign_metrics -> campaign_metrics_old`, `campaign_metrics_partitioned -> campaign_metrics`
5. The system shall criar trigger ou job que cria proxima particao mensal automaticamente (`pg_cron` mensal)
6. The system shall atualizar indices: `(company_id, data DESC)`, `(campanha, data DESC)`
7. After validacao, the system shall DROP `campaign_metrics_old` em migration separada
8. **Risco:** mudanca de schema critica — fazer com janela de manutencao OU usar `CREATE TABLE LIKE ... INCLUDING ALL` + backup completo antes

### Requirement 10: UI — Botao "Varredura Profunda"

**Objective:** Como gestor, quero disparar uma varredura manualmente quando precisar de dados frescos.

#### Acceptance Criteria
1. The system shall criar hook `useDeepScan()` em `src/hooks/use-meta-connect.ts` (ou novo arquivo)
2. The hook shall expor `deepScan()` mutation, `isDeepScanning` boolean, `lastDeepScanAt` derivado de `integrations.last_deep_scan_at`
3. The system shall adicionar botao "Varredura Profunda" no card Meta de `Integrations.tsx`, ao lado de "Sincronizar"
4. While scanning, the button shall mostrar spinner + texto "Varrendo..."
5. After sucesso, the system shall mostrar toast: `${bms_synced} BMs · ${adsets_synced} adsets · ${pixels_synced} pixels · ${pages_updated} pages` (com `accounts_skipped_fresh` em tooltip)
6. The system shall invalidar queries: `meta-integration`, `meta-business-managers`, `meta-pixels`, `adsets`, `meta-pages`
7. If receber erro, the system shall mostrar toast com mensagem descritiva
8. The button shall ser desabilitado se `isConnected = false`

### Requirement 11: Logs de Varredura

**Objective:** Como dev/auditor, quero historico de scans para debugar e auditar.

#### Acceptance Criteria
1. The system shall criar tabela `meta_scan_logs` com colunas: id, company_id, integration_id, scan_type ('full_sync'|'deep_scan'), started_at, finished_at, status ('running'|'success'|'partial'|'failed'), stats jsonb, error text, triggered_by ('manual'|'cron')
2. The system shall aplicar RLS por company_id
3. Both `meta-sync` e `meta-deep-scan` shall criar linha ao iniciar e atualizar ao terminar
4. The system shall criar indice em `(company_id, started_at DESC)` para queries de historico
5. The system shall criar pg_cron mensal `meta-scan-logs-purge` deletando logs > 90 dias

## Non-Functional Requirements

- **Performance:** Deep scan completo de 5 ad accounts em < 60s; com freshness tier, scans subsequentes em < 15s
- **Escala:** Suporta 1000+ integracoes via stagger (`next_scan_at` + cron 15min × 20 por tick)
- **Idempotencia:** Multiplos scans nao duplicam — todos upsert
- **Resiliencia:** Falha em 1 ad account / pixel / page nao bloqueia o scan inteiro
- **Rate limit:** Respeita 90% do limite Meta antes de throttling (sleep 2s)
- **Multi-tenant:** RLS estrita por `company_id` em TODAS as tabelas novas
- **Auditoria:** Soft delete via `deleted_at` em TODAS as entidades novas
- **Composabilidade:** `meta-deep-scan` nao duplica logica de `meta-sync` (campanhas/insights/criativos ficam no sync atual)
- **Future-proof:** `campaign_metrics` particionada por mes desde ja
