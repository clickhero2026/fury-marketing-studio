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
| `meta-oauth-asset-picker` | implemented (as-built, 2026-04-19) | Modal hierarquico (BM -> Accounts -> Pages) pos-OAuth, com toggle "apenas campanhas ativas" e contagem via Graph API batch (filtering status=ACTIVE) |
| `meta-disconnect-cascade` | implemented (as-built, 2026-04-19) | Disconnect via Edge Function com CASCADE em 5 FKs (fury/compliance) + cleanup defensivo em 8 tabelas |
| `sdd-enforcement-automation` | implemented (as-built, 2026-04-20) | Hook PreToolUse `.claude/hooks/sdd-gate.cjs` bloqueia nova Edge Function/migration sem spec; bypass via `.kiro/.fast-track` |

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



## brand-guide-takedown-v2 (2026-04-10)

### Database delta
- `compliance_violations`: novo `missing_required_term` no CHECK de violation_type
- `companies.brand_colors text[]` — paleta hex da marca (max 10)
- `companies.brand_logo_url text` — URL do logo para validacao visual
- `companies.takedown_severity_filter text` — `critical` (default) | `any`

### Edge Function patches (compliance-scan)
- Prompt de copy atualizado com termos obrigatorios (`required_term`) — gera `missing_required_term` se ausente
- Prompt de imagem atualizado com cores da marca (analise de aderencia) + logo (comparacao visual 2 imagens)
- Takedown filtrado por severidade: `critical` so pausa se tem violacao critical, `any` pausa por score
- Handler de reativacao: `body.reactivate_ad_id` → POST `/{ad_id}?status=ACTIVE` + log em compliance_actions

### Hooks
- `useComplianceRules()` agora busca `blacklist_term` + `required_term`; addRule aceita ruleType
- `useTakedownHistory()` — log paginado de compliance_actions com join creatives + scores
- `useReactivateAd()` — mutation POST status=ACTIVE via compliance-scan
- `useBrandGuide()` — CRUD brand_colors + brand_logo_url

### Componentes
- `BlacklistManager` refatorado com tabs "Proibidos" | "Obrigatorios"
- `ComplianceSettings` expandido: severity filter select + Brand Guide section (color picker hex + logo URL/preview)
- `TakedownHistory` — tabela com acao, score, motivo, botao "Reativar"
- `ComplianceView` — nova aba "Historico"



## compliance-notifications (2026-04-10)

### Database delta
- `companies.notification_webhook_url text` — URL de webhook pra notificacoes
- `companies.notification_email text` — email pra alertas de takedown

### Cron
- `compliance-fast-tick` — `*/5 * * * *` — scan rapido SO para ads novos sem score (max 10, < 5min deteccao)

### Edge Function patches (compliance-scan)
- `dispatchWebhook()` — POST JSON fire-and-forget (5s timeout) apos cada takedown
- `sendAlertEmail()` via Resend API (5s timeout) com template HTML rico (thumbnail, score, violacoes, link dashboard)
- `fast_mode: true` — processa apenas criativos nunca analisados, limit 10
- Handlers de teste: `test_webhook: true` e `test_email: true` enviam payloads/emails de teste
- Payload webhook: `{ event, timestamp, ad_id, ad_name, score, violations, action, company_id }`

### UI
- `ComplianceSettings` expandido: secao "Notificacoes" com webhook URL + email + botoes "Testar"



## fury-v0-algorithm (2026-04-10)

### Tabelas
- `fury_rules` — 5 regras toggleaveis por empresa (saturation, high_cpa, low_ctr, budget_exhausted, scaling_opportunity)
- `fury_evaluations` — snapshot de metricas 7d por campanha (features preparadas pra ML v1)
- `fury_actions` — feed de acoes + auditoria (pause/alert/suggest/revert) com revert_before 30min
- `fury_scan_logs` — log de scans (mesmo padrao)
- Seed: 5 regras default por empresa (saturation+high_cpa enabled, rest disabled)

### Edge Functions
- `fury-evaluate` — motor de regras v0: agrega campaign_metrics 7d, calcula tendencia (improving/stable/worsening), aplica regras, dedup 24h, auto-execute pause via Meta API, handler revert com janela 30min, dual auth

### Cron
- `fury-evaluate-tick` — `0 * * * *` (hourly) — dispara fury-evaluate por empresa

### Hooks
- `useFuryActions(filter?)` — feed com refetchInterval 30s + filtro status
- `useFuryRules()` — CRUD toggle/threshold/consecutive_days/auto_execute
- `useFuryEvaluate()` — trigger manual
- `useFuryStats()` — KPIs (acoes hoje, pendentes, avaliadas, executadas)
- `useFuryRevert(actionId)` — revert acao dentro da janela 30min

### Componentes
- `FuryView` — nova tab "FURY" (icone Zap) na sidebar
- `FuryDashboard` — 4 KPI cards
- `FuryActionFeed` — feed de acoes com filtro + botao "Desfazer" (30min window)
- `FuryRulesConfig` — toggles + threshold inputs + auto_execute switch por regra



## fury-v0.5-improvements + ai-agent-contextual (2026-04-13)

### FURY v0.5 (Track A)
- A1: Frequency agora usa coluna `frequency` real do campaign_metrics (media ponderada por impressoes), fallback para `impressions/reach`, eliminou proxy incorreto `impressions/clicks`
- A2: Regras agora verificam dias consecutivos REAIS — `countConsecutiveFromEnd()` itera do dia mais recente e conta quantos dias seguidos a condicao e verdadeira (antes so checava daysWithData >= N)
- `reach` adicionado ao SELECT de campaign_metrics no fury-evaluate

### AI Agent Contextual (Track B)
- B1: 3 novos tools adicionados ao ai-chat:
  - `get_fury_actions` — busca acoes do FURY (pausas, alertas, sugestoes) com filtro por status
  - `get_fury_evaluations` — busca avaliacoes de performance (metricas 7d, tendencia, health)
  - `get_compliance_status` — busca scores de compliance com violacoes opcionais
- B3: Prompt system reescrito com persona FURY-aware:
  - Contexto do motor FURY (regras, acoes, avaliacoes)
  - Contexto de compliance (scores, violacoes, brand guide)
  - Comportamento proativo (sugerir buscar alertas pendentes ao abrir chat)
  - Benchmarks de metricas (frequencia < 3.0, CTR > 1%)
  - 9 tools disponiveis (6 metricas + 3 FURY/compliance)



## fury-v0.5-sprint2 + ai-agent-actions (2026-04-13)

### FURY v0.5 Sprint 2 (Track A)
- A3: Avaliacao por ADSET — segunda passada apos campanhas, agrupa metricas por `grupo_anuncios`, aplica regras saturation + high_cpa em adsets, pausa via Meta API
- A4: `budget_exhausted` agora verifica hora local (timezone da conta Meta via `meta_ad_accounts.timezone_name`) — so dispara se hora local < 18h
- A5: `scaling_opportunity` agora usa % relativo — CPA precisa estar X% abaixo da MEDIA 7d (antes era valor absoluto em BRL)

### AI Agent Actions (Track B)
- B2: 2 novos tools de ACAO: `pause_campaign` e `reactivate_campaign` — usuario diz "pausa a campanha X" e o chat executa via Meta API, com log em fury_actions
- B4: Insights proativos — ao abrir o chat, envia mensagem `[SISTEMA]` automatica pedindo resumo de alertas FURY + compliance. Prompt reconhece prefixo e busca dados proativamente. Mensagem sistema oculta da UI
- Total de tools no ai-chat: 11 (6 metricas + 3 FURY/compliance + 2 acoes)



## campaign-publisher (2026-04-13)

### Tabelas (aplicar via Supabase Dashboard — arquivo em supabase/migrations/20260413000001_campaign_publisher.sql)
- `campaign_drafts` — drafts em edicao (campaign_data/adset_data/ad_data em jsonb)
- `campaign_publications` — historico imutavel com status workflow (draft → validating → compliance_check → publishing → live/failed)
- `campaign_publication_steps` — auditoria granular por step (campaign/adset/creative/ad + rollbacks)

### Edge Function
- `campaign-publish` — fluxo completo com Zod + compliance gate + 4 passos Meta API + rollback em ordem inversa
- Retry 2x em 5xx com backoff (1s, 3s)
- Compliance inline usando ANTHROPIC_API_KEY (mesmo prompt do compliance-scan)
- Zod schemas: Campaign (250c nome), Adset (targeting+budget), Ad (headline 40c, body 125c)
- Se score < takedown_threshold: bloqueia (forcable com body.force=true)

### Hooks
- `useCampaignDrafts()` — CRUD drafts
- `useCampaignPublish()` — mutation invoke campaign-publish
- `useCampaignPublication(id)` — polling 2s enquanto nao finalizar
- `useCampaignPublications(filter)` — historico

### Componentes
- `CampaignPublisherView` — nova tab "Publicar" (icone Rocket) na sidebar
- `PublishWizard` — stepper 3 etapas com validacao progressiva
- `CampaignStep` / `AdsetStep` / `AdStep` — formularios por nivel
- `PublishConfirmModal` — revisao antes de enviar
- `PublicationStatus` — progress live com polling 2s + link pro Ads Manager
- `PublicationHistory` — lista com filtros live/failed



## budget-smart-v0 (2026-04-13)

### Tabelas (aplicar via Dashboard)
- `budget_benchmarks` — CPL/CPA/ROAS/CTR agregado por tenant x objective (RLS)
- RPC `refresh_budget_benchmarks(company_id)` — agrega ultimos 30 dias de campaign_metrics x campaigns

### Edge Function
- `budget-recommend` — recebe objective+goal+budget, busca benchmark do tenant (fallback market pt-BR), calcula alertas deterministicos, chama Claude pra recomendacao final. Graceful fallback se Claude falhar.

### Hooks
- `useBudgetBenchmarks()` — query benchmarks
- `useBudgetRecommend()` — mutation invoke budget-recommend

### Componentes
- `BudgetSmartView` — nova tab "Orcamento Smart" (icone Wallet) na sidebar
- `GoalWizard` — stepper 3 etapas
- `ObjectiveStep` — 4 cards (Leads/Vendas/Trafego/Engajamento)
- `GoalInputStep` — input meta + quick buttons
- `BudgetSliderStep` — slider 70-10000 R$/semana com projecao real-time client-side (volume = budget/cpl)
- `RecommendationCard` — card com recomendacao IA + alertas + badge data source

### Market fallback (no Edge Function)
- OUTCOME_LEADS: R$ 15 CPL
- OUTCOME_SALES: R$ 40 CPA, ROAS 2.5x
- OUTCOME_TRAFFIC: R$ 2
- OUTCOME_ENGAGEMENT: R$ 1



## dash-do-dono-v1 (2026-04-17)

### Dashboard reescrito (substituiu DashboardView.tsx antigo)

**Componentes novos em src/components/dashboard/:**
- `KpiCard` — card com valor + delta % vs periodo anterior (↑↓ com cor)
- `DashKpiGrid` — 6 KPIs (ROI, Lucro, Investimento, Leads, CPL, ROAS) com comparativo
- `DashFilters` — chips Hoje/7d/30d + multi-select contas + multi-select campanhas
- `LineChartSpendVsConv` — Recharts 2 eixos Y (investimento azul vs conversas verde)
- `BarChartTop5Campaigns` — barras horizontais top 5 por conversao
- `PieChartSpendByCampaign` — pizza top 5 + Outros
- `DashCharts` — container 3 graficos
- `DashFuryTimeline` — timeline humanizada das 20 ultimas fury_actions

### Hooks patchados
- `useCampaignMetrics` / `useCampaigns`: `refetchInterval: 300_000` (5 min)
- Reusa `useFuryActions` existente

### Calculos
- `receita = sum(investimento * website_purchase_roas)` por linha
- `lucro = receita - investimento`
- `roi = lucro / investimento * 100`
- `delta% = (current - prev) / |prev| * 100` comparando periodo atual vs anterior da mesma duracao

### Responsivo
- Desktop: 6 col KPIs, 2 col charts + 1 col timeline (3-col grid)
- Mobile: 2 col KPIs, charts empilhados, timeline por baixo

### Bundle
- Pre-feature: 880KB
- Pos-feature: 1.3MB (+430KB de Recharts)
- Gzip: 252KB → 368KB (+116KB)

