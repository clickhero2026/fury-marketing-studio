# Tasks — Multi-Agent Foundation

> Sprints incrementais. Cada sprint termina com deploy no Lovable + Supabase.
> Marca [x] conforme avanca.

## Sprint 1 — Schema base + Orchestrator chat (sem agents ainda)

Objetivo: chat funcional persistente com Sonnet, sem delegacao ainda. Caminho mais curto pra valor.

- [ ] T1.1 — Migration `2026MMDD01_multi_agent_base.sql`:
  - `conversations`, `messages`, `agent_runs`, `event_log`, `user_facts` (vazio)
  - RLS por organization_id
- [ ] T1.2 — Edge Function `agent-orchestrator` minimal:
  - Recebe `{conversation_id, message}`
  - Persiste user message
  - Chama Sonnet 4.6 (sem tools ainda) com prompt caching
  - Streaming SSE
  - Persiste assistant message + agent_run
- [ ] T1.3 — Frontend: substituir mock do `ChatView` por chamada real
  - Hook `useConversation` (criar/listar)
  - Vercel AI SDK `useChat` apontando para Edge Function
  - UI de loading/streaming/error states
- [ ] T1.4 — Hulk valida: build, types, fluxo manual de chat
- [ ] T1.5 — Atualizar `.kiro/steering/implemented-features.md`

## Sprint 2 — Meta Ads agent read-only + mirror

- [ ] T2.1 — Migration `..._meta_mirror.sql`:
  - `meta_campaigns_mirror`, `meta_insights_mirror` (deduzir colunas dos types existentes)
  - Indices por organization_id + campaign_id
- [ ] T2.2 — Edge Function `meta-sync-tick` (cron 30min):
  - Le `ad_platform_connections` ativos
  - Sincroniza campaigns + insights ultimos 7 dias para mirror
- [ ] T2.3 — Edge Function `agent-meta-ads`:
  - Tools read-only: `list_campaigns`, `get_insights`, `get_creative_performance`
  - Le do mirror, nunca da Meta API direto
- [ ] T2.4 — Adicionar tool `delegate_to_meta_ads` no orchestrator (com sub-call HTTP)
- [ ] T2.5 — Hulk valida

## Sprint 3 — Meta Ads write + HITL approvals

- [ ] T3.1 — Migration `..._approvals.sql`:
  - Tabela `approvals`
  - Trigger pra notificar via Realtime (`pg_notify` ou Realtime channel)
- [ ] T3.2 — Estender `agent-meta-ads` com tools write (criam approval, nao executam)
- [ ] T3.3 — Edge Function `approval-action`:
  - Valida permissao (owner/admin)
  - Executa Meta API real
  - Posta system message no chat
- [ ] T3.4 — Frontend `ApprovalsView`:
  - Lista approvals pending (Realtime subscription)
  - Botoes Approve/Reject com confirmacao
  - Plan-mode UI: mostra todas as acoes do plano em conjunto
- [ ] T3.5 — Captain America: review de RLS + permission checks
- [ ] T3.6 — Cron job pra expirar approvals > 5min
- [ ] T3.7 — Hulk valida fluxo end-to-end

## Sprint 4 — Profiler

- [ ] T4.1 — Migration `..._profiler_cron.sql`:
  - Setup pg_cron + cron_secret config
  - Schedule `profiler-tick-hourly`
- [ ] T4.2 — Trigger em `messages`/eventos chave que insere em `event_log`
- [ ] T4.3 — Edge Function `profiler-tick`:
  - Le event_log nao processado
  - Chama Haiku com structured output (Zod)
  - Insere/upsert user_facts (com superseded_by chain)
- [ ] T4.4 — Orchestrator inclui top 10 user_facts no system prompt cacheado
- [ ] T4.5 — Hulk valida: profiler roda sem timeout para 500 events

## Sprint 5 — Memory/RAG

- [ ] T5.1 — Migration `..._embeddings.sql`:
  - `message_embeddings` com pgvector(512)
  - Indice ivfflat
- [ ] T5.2 — Edge Function `embed-tick` (cron 5min):
  - Le messages sem embedding
  - Batch call Voyage API (voyage-3-lite)
  - Insert em message_embeddings
- [ ] T5.3 — Tool `search_memory` no orchestrator
- [ ] T5.4 — Adicionar embeddings semanticos relevantes ao context window
- [ ] T5.5 — Hulk valida

## Sprint 6 — Reports

- [ ] T6.1 — Tool `generate_report` no orchestrator
- [ ] T6.2 — Sub-flow research (Meta Ads agent) → write (Opus 4.7) → review (Sonnet)
- [ ] T6.3 — Templates: weekly_performance, campaign_deep_dive, creative_analysis
- [ ] T6.4 — UI: botao "Gerar relatorio" + viewer markdown
- [ ] T6.5 — Hulk valida qualidade de relatorios em 3 cenarios reais

## Sprint 7+ — Creative agents (spec separada)

Fica para `.kiro/specs/creative-agents/` quando chegar a hora.

## Validacao geral

- [ ] V1 — `npm run build` verde apos cada sprint
- [ ] V2 — RLS audit por Captain America antes de merge pra main
- [ ] V3 — Custo medido em `agent_runs.cost_usd` < $0.05 por conversa de 10 msgs
- [ ] V4 — p95 time-to-first-token < 2s
- [ ] V5 — Steering `implemented-features.md` atualizado por sprint

## Definition of Done por sprint

- Build verde
- Edge Functions deployadas (`SUPABASE_ACCESS_TOKEN` no `.env.local`)
- Migrations aplicadas (`supabase db push` ou via dashboard SQL editor)
- RLS validada
- Manual smoke test no Lovable preview
- `implemented-features.md` atualizado
- Resumo entregue ao usuario com links clicaveis
