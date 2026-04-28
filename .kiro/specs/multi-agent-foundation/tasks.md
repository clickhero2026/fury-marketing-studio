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
| HITL approvals | ✅ AS-BUILT (Sprint A1 — auditoria 2026-04-28) |
| Reports multi-section | ✅ AS-BUILT (Sprint A2 — auditoria 2026-04-28) |
| Refinar profiler | ✅ AS-BUILT (Sprint A3 — auditoria 2026-04-28) |

## Sprint A1 — HITL Approvals (AS-BUILT 2026-04-28 via auditoria)

Objetivo: tools destrutivas (pause/reactivate, e futuramente budget) criam approval pending
em vez de executar direto. Usuario aprova/rejeita via UI. Mantem reversao de 30min existente.

- [x] T1.1 — Migration `20260424000001_approvals.sql` (tabela approvals + RLS + realtime publication)
- [x] T1.2 — Edge Function `supabase/functions/approval-action/index.ts` (decisao + dispatch Meta API)
- [x] T1.3 — `proposePauseCampaign`/`proposeReactivateCampaign`/`proposeUpdateBudget` em `_shared/data-fetchers.ts` criam approval pending
- [x] T1.4 — `src/components/ApprovalsView.tsx` com cards pending + Realtime subscription via `useApprovals()`
- [x] T1.5 — Cron `20260424000003_approvals_expire_cron.sql` (pg_cron 1min)
- [x] T1.6 — Build + deploy + push (concluido)

## Sprint A2 — Reports (AS-BUILT 2026-04-28 via auditoria)

- [x] T2.1 — Tool `generate_report` em `ai-chat/index.ts:702-703` + impl em `_shared/report-generators.ts` (templates weekly_performance + campaign_deep_dive)
- [x] T2.2 — UI integrada via tool delegation no chat (markdown renderer existente)
- [x] T2.3 — Build + deploy (concluido)

## Sprint A3 — Refinar Profiler (AS-BUILT 2026-04-28 via auditoria)

- [x] T3.1 — Migration `20260424000002_memories_refinement.sql` (confidence, source, superseded_by, evidence_message_ids + indexes)
- [x] T3.2 — `extract-memories/index.ts:200-225` preenche todos os campos novos
- [x] T3.3 — Dedup com superseded_by chain implementada
- [x] T3.4 — Build + deploy (concluido)

## Validacao geral

- [x] V1 — `npm run build` verde apos cada sprint (B1-B5)
- [x] V2 — RLS audit (passou — RLS ativo em approvals/plans/agent_runs/memories via current_user_company_id())
- [x] V3 — Manual smoke test (em uso producao desde 2026-04-25)
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
