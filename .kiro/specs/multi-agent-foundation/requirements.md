# Requirements — Multi-Agent Foundation

> Status: SPEC (pendente aprovacao do usuario)
> Owner: Nick Fury (orquestra) + Thor (Edge Functions/DB) + Iron Man (UI)
> Data: 2026-04-22
> Deploy targets: **Lovable** (frontend) + **Supabase** (Edge Functions + Postgres + pg_cron)

## Contexto

ClickHero precisa de um sistema multi-agente para alimentar o ChatView, automatizar
analises de Meta Ads, manter perfil rico do usuario/empresa e (futuro) gerar criativos.
Esta spec define a fundacao: orquestrador conversacional + agente Meta Ads + profiler
passivo + memoria persistente. Geracao de criativos vira em spec separada.

## Restricoes Arquiteturais

- **Sem backend dedicado.** Tudo em Supabase Edge Functions (Deno) + Postgres.
- **Frontend deploy via Lovable** (push em main → build automatico).
- **Edge Function deploy via CLI** (`supabase functions deploy ...`).
- **DB migrations** versionadas em `supabase/migrations/`.
- **Provider LLM:** Anthropic Claude API (`@anthropic-ai/sdk` no Deno via `https://esm.sh`).
- **Frameworks descartados:** LangGraph (hostil a serverless), Mastra (overkill por enquanto), CrewAI/AutoGen (Python).
- **Frontend streaming:** Vercel AI SDK (`useChat`) ou SSE manual — decidido durante implementacao.

## Padrao de Orquestracao

**Orchestrator-Workers** (canon Anthropic). Orquestrador decide via tool use quem chamar.
Workers sao Edge Functions isoladas invocadas via HTTP do orquestrador.

## User Stories (EARS)

### US-1: Conversacao com IA persistente
- **Ubiquitous:** O sistema DEVE oferecer uma interface de chat onde o usuario interage
  com um Orquestrador IA que tem contexto da empresa, das campanhas e do historico.
- **Event-driven:** QUANDO o usuario enviar uma mensagem, o sistema DEVE persistir em
  `messages`, invocar Edge Function `agent-orchestrator`, retornar resposta em streaming.
- **State-driven:** ENQUANTO houver historico de conversa, o sistema DEVE incluir contexto
  relevante (ultimas N mensagens + RAG via embeddings) no system prompt do orquestrador.

### US-2: Delegacao para Meta Ads Specialist
- **Event-driven:** QUANDO a pergunta do usuario envolver campanhas/insights/acoes Meta,
  o orquestrador DEVE delegar via tool call `delegate_to_meta_ads(question, context)`.
- **Ubiquitous:** O Meta Ads Specialist DEVE ter tools read-only (`list_campaigns`,
  `get_insights`) e tools write com aprovacao (`pause_campaign`, `update_budget`).

### US-3: Human-in-the-Loop (HITL) para acoes destrutivas
- **Ubiquitous:** Toda acao que muda estado externo (Meta API write) DEVE criar entrada em
  `approvals` table e aguardar confirmacao explicita do usuario via UI.
- **Event-driven:** QUANDO o agente propor uma acao destrutiva, o sistema DEVE seguir o
  pattern Plan Mode: mostrar plano completo (todas as acoes + impacto previsto), usuario
  aprova com 1 clique, agente executa em sequencia.
- **Time-driven:** Aprovacoes DEVEM expirar em 5 minutos. Apos expirar, status vira
  `expired` e o agente precisa propor de novo.

### US-4: Profiler passivo
- **Time-driven:** A CADA hora, o sistema DEVE invocar Edge Function `profiler-tick` que
  le `event_log` desde `last_processed_at`, extrai fatos via Haiku 4.5, e atualiza
  `user_facts` (com `confidence`, `evidence_message_ids`, `superseded_by`).
- **Event-driven:** QUANDO o orquestrador for invocado, o sistema DEVE incluir os top-N
  user_facts mais relevantes (por `confidence` desc, filtrados por organization_id) no
  system prompt cacheado.

### US-5: Observabilidade e custo
- **Ubiquitous:** Toda invocacao de agente DEVE registrar entrada em `agent_runs` com
  tokens_in/out, cost_usd, status, duration_ms, parent_run_id (para arvore de calls).
- **Ubiquitous:** Falhas DEVEM ser persistidas com stack trace truncado em `agent_runs.output`.

### US-6: Memoria semantica (RAG)
- **Event-driven:** QUANDO uma `messages` for inserida, um trigger DEVE enfileirar geracao
  de embedding (via job table) — o embedding sera computado em batch para nao bloquear
  o response time da conversa.
- **Ubiquitous:** O orquestrador DEVE ter tool `search_memory(query, k=5)` que faz busca
  cosine no `message_embeddings` filtrada por `organization_id`.

### US-7: Geracao de relatorios
- **Event-driven:** QUANDO o usuario solicitar relatorio (ex: "como foram as campanhas
  na ultima semana?"), o orquestrador DEVE invocar tool `generate_report(template,
  date_range)` que faz internamente: research (chama Meta Ads agent) → write (compoe
  texto multi-secao) → review (auto-revisao com Sonnet).

## Modelos LLM (decisao)

| Agente | Modelo | Motivo |
|---|---|---|
| Orchestrator | Sonnet 4.6 | Equilibrio raciocinio/custo, prompt caching agressivo |
| Meta Ads Specialist | Sonnet 4.6 | Tool use intenso + raciocinio sobre metricas |
| Profiler | Haiku 4.5 | Extracao estruturada barata, batch |
| Reports (writing pass) | Opus 4.7 | Qualidade de prosa em narrativas importantes |

## Non-Goals

- **Geracao de criativos** (Kling, Nano Banana) — spec separada
- **Voice/audio** — fora do escopo
- **Multi-tenancy entre organizations** numa unica conversa — cada conversa pertence a uma org
- **Migration de chat antigo (mock)** — comeca limpo
- **Cost enforcement (cap mensal por user)** — fica para sprint pos-MVP, so tracking agora
- **Approval automatico baseado em policy** — sempre HITL nesta primeira versao

## Metricas de Sucesso

- Build verde, todas as Edge Functions deployadas
- RLS validada por Captain America antes de prod
- Conversa funcional com persistencia em < 2s (p95) ate primeiro token
- Custo medio < $0.05 por conversa (10 mensagens) com prompt caching ativo
- HITL approvals nao bloqueiam UI (aparecem em painel proprio)
- Profiler processa 1000 events/run sem timeout (limite Edge Function: 60s)

## Riscos & Mitigacao (sumario)

| Risco | Mitigacao |
|---|---|
| Custo explode | Prompt caching, Haiku no Profiler, monitoring via agent_runs |
| Meta rate limit | Mirror local + jobs async, API real so em writes |
| Loop infinito de agent | max_steps=10, timeout 60s, kill switch |
| Acao destrutiva errada | Plan-mode HITL, expiracao 5min |
| Memory pollution | Confidence score + superseded_by chain |
| PII em memorias | Profiler com prompt anti-PII + redacao auto |
| Prompt injection | Validacao Zod nos tool calls + role separation |
