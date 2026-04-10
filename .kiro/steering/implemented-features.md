# Implemented Features (Steering — As-Built State)

> Atualizado: 2026-04-06
> Este documento reflete o estado REAL do projeto. Sempre que uma feature for completada, atualize aqui.

## Specs Existentes

| Spec | Status | Descricao |
|------|--------|-----------|
| `auth-flow` | implemented | Supabase Auth + multi-tenancy + RLS |
| `meta-integration` | implemented (as-built) | OAuth 2.0 popup + token encryption + asset selection |
| `ai-chat-memory` | implemented (as-built) | OpenAI Function Calling + memoria vetorial pgvector |
| `meta-sync-dashboard` | implemented (as-built) | Sync campaigns/insights/creatives + dashboard real |
| `meta-deep-scan` | implemented | Varredura profunda BMs/Adsets/Pixels/Pages + cron stagger + particionamento campaign_metrics |

## Tabelas Supabase Existentes

### Auth & Multi-tenancy
- `organizations`, `companies`, `profiles`, `organization_members`
- `auth.users`, `auth.identities` (Supabase Auth)
- Function: `current_user_company_id()`, `current_user_organization_id()`

### Meta Integration
- `integrations` — UNIQUE (company_id, platform); `access_token` encrypted via pgcrypto; `next_scan_at`, `last_deep_scan_at`
- `meta_ad_accounts` — selecionadas + enriquecidas (balance, spend_cap, timezone_name, amount_spent, funding_source, deleted_at)
- `meta_pages` — selecionadas + enriquecidas (verification_status, fan_count, picture_url, deleted_at)
- `meta_business_managers` — BMs com verification_status, vertical (deep-scan)
- `adsets` — ad sets com targeting, placement, budget (deep-scan)
- `meta_pixels` — pixels Meta com eventos configurados (deep-scan)
- `meta_api_rate_limit` — tracking de rate limit por endpoint
- `meta_scan_logs` — historico de sincronizacoes e varreduras
- `oauth_sessions` — anti-CSRF state + cache

### Campanhas (sincronizadas da Meta)
- `campaigns` — UNIQUE (external_id, company_id)
- `campaign_metrics` — append-only por sync_batch
- `creatives` — UNIQUE (external_id, company_id)

### AI Chat & Memoria
- `chat_conversations`, `chat_messages` — RLS por user_id
- `memories` — VECTOR(1536), IVFFlat index, score hibrido

## Edge Functions Deployadas

| Function | Spec | Descricao |
|----------|------|-----------|
| `meta-oauth-start` | meta-integration | Gera state, retorna URL OAuth |
| `meta-oauth-callback` | meta-integration | Troca code -> token, encrypt, upsert, popup postMessage |
| `meta-oauth-disconnect` | meta-integration | Revoga via Meta + DELETE integration |
| `meta-list-assets` | meta-integration | Lista ad accounts + BMs |
| `meta-save-assets` | meta-integration | Replace-all selecao |
| `meta-sync` | meta-sync-dashboard | Sync full campaigns + 30d insights + creatives |
| `ai-chat` | ai-chat-memory | SSE streaming + Function Calling + memory inject |
| `extract-memories` | ai-chat-memory | Async extract -> embed -> dedupe -> insert |
| `meta-deep-scan` | meta-deep-scan | Varredura profunda: BMs, ad accounts enriched, adsets, pixels, pages enriched |

## RPCs (PostgreSQL Functions)

- `encrypt_meta_token(token text)` — pgcrypto + Vault, SECURITY DEFINER
- `decrypt_meta_token(encrypted_token text)` — idem
- `search_memories(query_embedding, p_user_id, top_k, threshold)` — score hibrido
- `bump_memory_access(memory_ids uuid[])` — update last_accessed_at + access_count
- `current_user_company_id()`, `current_user_organization_id()`

## Hooks React Existentes

| Hook | Spec | Descricao |
|------|------|-----------|
| `use-auth` | auth-flow | Supabase Auth context |
| `use-meta-connect` | meta-integration | integration query + connect/disconnect/sync mutations |
| `use-meta-assets` | meta-integration | list/save assets |
| `use-campaigns` | meta-sync-dashboard | useCampaigns, useCampaignMetrics, useCreatives |
| `use-chat` | ai-chat-memory | SSE streaming chat |

## Pages / Views

- `pages/Index.tsx` — layout principal (4 views via state)
- `pages/Login.tsx`, `pages/Register.tsx` — auth-flow
- `pages/Integrations.tsx` — meta-integration
- `components/DashboardView.tsx` — KPIs + tabela campanhas (real)
- `components/CreativesView.tsx` — grid criativos (real)
- `components/ChatView.tsx` — chat AI streaming
- `components/AnalysisView.tsx` — insights (ainda mock — proxima spec)
- `components/meta/MetaAccountSelector.tsx` — selecao de ativos

## Extensions PostgreSQL Habilitadas

- `pgcrypto` (schema extensions)
- `vector` (pgvector)
- `pg_cron`
- `pg_net`
- `supabase_vault`

## pg_cron Jobs

- `token-expiry-check` — 12h, marca tokens proximos do vencimento
- `memory-decay` — semanal, reduz confidence + delete < 0.2
- `meta-deep-scan-tick` — `*/15 * * * *`, pega top-20 integracoes vencidas (`next_scan_at <= now()`) e dispara `meta-deep-scan`
- `meta-scan-logs-purge` — mensal (dia 1, 04h), deleta logs > 90 dias
- `campaign-metrics-create-partition` — mensal (dia 25), cria proxima particao

## Particionamento

- `campaign_metrics` — particionada por RANGE em `data` (mensal), 15 particoes ativas (2025_04..2026_06), auto-criacao via cron. PK composto `(id, data)`.

## Proximas Specs (Backlog)

- [ ] `analysis-insights` — substituir mocks da AnalysisView por insights AI gerados
- [ ] `meta-sync-incremental` — sync incremental + agendado via cron
- [ ] `chat-history-ui` — UI para retomar conversas anteriores
- [ ] `team-collaboration` — multi-usuario por organization
- [ ] `notifications` — alertas por email/push para metricas


## meta-scan-pipeline (2026-04-06)

- Coluna `integrations.scan_interval_hours int DEFAULT 24 CHECK(6..168)` — intervalo configuravel por integracao
- `meta-deep-scan`: retry exponencial 3x [1s/3s/9s] em 5xx + `stats.retries_count` + usa `scan_interval_hours` no `next_scan_at`
- `meta-sync`: dual auth (JWT OU `x-cron-secret` + `body.company_id`) — chamavel internamente
- `meta-save-assets`: auto-trigger fire-and-forget de `meta-sync` apos salvar ativos (popula dashboard imediato)
- `useMetaConnect.updateScanInterval(hours)` + UI Select em `Integrations.tsx` com opcoes [6/12/24/48/72/168]h



## meta-scan-observability (2026-04-06)

- `meta_scan_logs.error_summary jsonb` — agregacao `{ code: count }` por scan
- View `meta_scan_health` (security_invoker) — last_success_at, last_failure_at, consecutive_failures, health_status [healthy/degraded/stale/expired]
- `detect_stale_meta_scans()` SECURITY DEFINER + cron `meta-scan-stale-detector` (hourly) — marca `integrations.status=stale` quando `last_deep_scan_at + scan_interval+1h < now()`
- `meta-deep-scan`: `MetaApiError` + `classifyMetaError` (token_expired/permission_denied/rate_limit/not_found/server_error/unknown) + auto-mark `integrations.status=expired` em code 190
- Hook `useMetaScanHealth()` + componente `ScanHealthCard` em `Integrations.tsx`



## review-fixes (2026-04-06)

**P0 hotfix security** — Migration `hotfix_partitions_rls_security`: RLS+FORCE em todas particoes filhas de `campaign_metrics` (15 tabelas) + patch `create_next_campaign_metrics_partition()` garante RLS em particoes futuras. Spec retroativa em `.kiro/specs/security-hotfix-partition-rls/`.

**meta-deep-scan refinements:**
- H2 Recovery: scan bem-sucedido (sem token_expired) restaura `integration.status: stale -> active` automaticamente
- M2: skip de `next_scan_at` quando token_expired (apenas atualiza last_deep_scan_at)
- M1: regex de extractErrorCode mais especificas (ancoradas em "Meta API <status>" e "code N")

**meta-save-assets:** auto-trigger de meta-sync agora usa `EdgeRuntime.waitUntil()` para garantir execucao apos Response retornar (evita worker terminada cancelando o fetch background)



## smart-takedown-compliance (2026-04-10)

### Tabelas
- `compliance_rules` — blacklist de termos por tenant (RLS, seed 12 termos Meta padrao)
- `compliance_scores` — score 0-100 por criativo (copy_score, image_score, final_score, health_status)
- `compliance_violations` — violacoes individuais (type, severity, evidence, points_deducted)
- `compliance_actions` — log de takedowns (auto_paused, appealed, reactivated)
- `compliance_scan_logs` — log de scans (mesmo padrao meta_scan_logs)
- `companies.auto_takedown_enabled` + `takedown_threshold` — config por empresa

### Edge Functions
- `compliance-scan` — motor de compliance: analise copy (Claude Sonnet) + analise visual/OCR (Claude Vision), score ponderado 60/40, auto-takedown via Meta Graph API, rate limit 10/hora, dual auth

### RPC
- `get_vault_secret(name)` — busca secrets do Vault (SECURITY DEFINER)

### Cron
- `compliance-scan-tick` — `0 */6 * * *` — dispara compliance-scan para cada company com integracao ativa

### Hooks
- `useComplianceScores()` — lista com join creatives
- `useComplianceViolations(scoreId)` — violacoes de 1 anuncio
- `useComplianceRules()` — CRUD blacklist
- `useComplianceScan()` — trigger manual
- `useComplianceStats()` — KPIs agregados

### Componentes
- `ComplianceView` — view principal (nova tab "Compliance" na sidebar)
- `ComplianceDashboard` — KPI cards (total, healthy%, warning%, critical%, pausados)
- `ComplianceTable` — tabela de anuncios com score badge
- `ComplianceDetail` — sheet com violacoes detalhadas
- `ComplianceSettings` — toggle auto-takedown + threshold slider
- `BlacklistManager` — CRUD de termos proibidos (user + meta_default)

