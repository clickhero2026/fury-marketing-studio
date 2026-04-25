# Tasks — Multi-Agent Foundation (CAMINHO A — incremental sobre OpenAI existente)

> Status: APROVADO usuario (auto mode)
> Decisao: caminho A — manter `ai-chat` (OpenAI), expandir features faltantes
> Premissa: o sistema ja roda com OpenAI GPT-4o-mini, `extract-memories` para profile,
>   tabelas `chat_conversations`, `chat_messages`, `memories`, `fury_actions` existem.

## Mapeamento real (apos descoberta)

| Componente | Estado |
|---|---|
| Edge Function chat | ✅ `ai-chat` (OpenAI + tools) |
| Profiler/memorias | ✅ `extract-memories` (OpenAI + embeddings) |
| Hook chat | ✅ `useChat` custom com SSE |
| Tools Meta Ads | ✅ `_shared/data-fetchers.ts` (pause/reactivate executam direto, reversiveis 30min via `fury_actions`) |
| Schema chat | ✅ `chat_conversations`, `chat_messages`, `memories` (criadas via Lovable, **nao em migration**) |
| HITL approvals | ❌ **A FAZER** (Sprint A1) |
| Reports multi-section | ❌ **A FAZER** (Sprint A2) |
| Refinar profiler | ❌ **A FAZER** (Sprint A3) |

## Sprint A1 — HITL Approvals (em execucao)

Objetivo: tools destrutivas (pause/reactivate, e futuramente budget) criam approval pending
em vez de executar direto. Usuario aprova/rejeita via UI. Mantem reversao de 30min existente.

- [ ] T1.1 — Migration `2026MMDD_approvals.sql`:
  - tabela `approvals` (id, organization_id, conversation_id, action_type, payload, status, expires_at, approved_by, executed_at, result)
  - RLS por organization_id
  - Realtime publication para subscribir mudancas
- [ ] T1.2 — Edge Function `approval-action`:
  - Recebe `{approval_id, decision: 'approve'|'reject'}`
  - Valida permissao (owner/admin)
  - Se approve: executa Meta API real, atualiza status='executed', persiste resultado
  - Se reject ou expired: status correspondente, sem executar
  - Posta system message no `chat_messages` da conversa de origem
- [ ] T1.3 — Modificar `pauseCampaignAction` e `reactivateCampaignAction`:
  - Em vez de chamar Meta API, criar approval pending
  - Retornar string explicando que aguarda aprovacao + ID
- [ ] T1.4 — Frontend `ApprovalsView`:
  - Realtime subscription a `approvals` table (filtro org)
  - Cards de approval pending: action_type + payload + Approve / Reject
  - Lista de approvals concluidas (collapsed)
- [ ] T1.5 — Cron pra expirar approvals pendentes > 5min (sem isso ficam orfaos)
- [ ] T1.6 — Build + deploy + push

## Sprint A2 — Reports

- [ ] T2.1 — Tool `generate_report` em `ai-chat`:
  - Templates: weekly_performance, campaign_deep_dive
  - Composicao: pega dados via tools existentes + escreve markdown multi-secao
- [ ] T2.2 — UI: viewer markdown + botao quick "Gerar relatorio semanal"
- [ ] T2.3 — Build + deploy

## Sprint A3 — Refinar Profiler

- [ ] T3.1 — Migration: adicionar `confidence`, `superseded_by`, `evidence_message_ids`, `source` em `memories`
- [ ] T3.2 — Atualizar `extract-memories` pra preencher esses campos
- [ ] T3.3 — Dedup melhor com superseded_by chain
- [ ] T3.4 — Build + deploy

## Validacao geral

- [x] V1 — `npm run build` verde apos cada sprint (B1-B5)
- [ ] V2 — RLS audit (Captain America) antes de merge
- [ ] V3 — Manual smoke test no Lovable preview
- [x] V4 — `implemented-features.md` atualizado (2026-04-25)

---

## Sprint B1 — Agent Observability (AS-BUILT 2026-04-25)

- [x] B1.1 — Migration `20260424000004_agent_runs.sql` (table + RPC `get_ai_health_summary`)
- [x] B1.2 — Instrumentacao ai-chat (insert running -> update success/error com tokens/cost/latencia/tools)
- [x] B1.3 — Hook `useAiHealth` + view `AiHealthView` (KPIs + line/bar charts + top tools + erros)
- [x] B1.4 — Sidebar nav "Saude do AI"
- [x] B1.5 — Bug fixes: HTTP 200 em approval-action mesmo com execution error; toast logic em use-approvals

## Sprint B2 — Multi-step Plan Mode (AS-BUILT 2026-04-25)

- [x] B2.1 — Migration `20260424000005_plans.sql` (plans + plan_id em approvals + cron expire)
- [x] B2.2 — `proposePlan()` + tool `propose_plan` (cria 1 plan + N approvals filhas)
- [x] B2.3 — Edge `plan-action` (executa steps em ordem; status executed/partial/failed)
- [x] B2.4 — Hook `usePlans` + UI ApprovalsView (PendingPlanCard expansivel + PlanHistoryRow)

## Sprint B3 — Profiler Proativo (AS-BUILT 2026-04-25)

- [x] B3.1 — Migration `20260424000006_proactive_briefing.sql` (RPC `get_proactive_briefing`)
- [x] B3.2 — Hook `useProactiveBriefing` (transforma RPC em insights ranqueados)
- [x] B3.3 — `ProactiveBanner` clicavel (zero-cost; substitui auto-greeting LLM)

## Sprint B4 — Approval Inline no Chat (AS-BUILT 2026-04-25)

- [x] B4.1 — Hook `useConversationActions(conversationId)` (filter por conversation + realtime)
- [x] B4.2 — `InlineApprovalCards` — pending plans (expansivel) + approvals avulsas com botoes
- [x] B4.3 — Integracao no ChatView entre mensagens e status indicator

## Sprint B5 — Multi-Agent Real (AS-BUILT 2026-04-25)

- [x] B5.1 — Edge `meta-ads-specialist` (service-role only, prompt focado, tools analiticas)
- [x] B5.2 — Tool `delegate_to_meta_specialist` no orchestrator
- [x] B5.3 — agent_runs com `metadata.parent_run_id` correlacionando sub-agente
