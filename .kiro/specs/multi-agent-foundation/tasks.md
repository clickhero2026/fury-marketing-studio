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

- [ ] V1 — `npm run build` verde apos cada sprint
- [ ] V2 — RLS audit (Captain America) antes de merge
- [ ] V3 — Manual smoke test no Lovable preview
- [ ] V4 — `implemented-features.md` atualizado por sprint
