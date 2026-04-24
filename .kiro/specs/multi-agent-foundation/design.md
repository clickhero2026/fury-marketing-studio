# Design — Multi-Agent Foundation

> Veja `requirements.md` para os user stories completos.

## Diagrama logico

```
┌────────────────────────────────────────────────────────────────────────┐
│  React (Lovable) — ChatView, ApprovalsView                             │
│  ├─ POST /functions/v1/agent-orchestrator (streaming SSE/Anthropic)    │
│  ├─ Realtime channel: approvals, messages                              │
│  └─ POST /functions/v1/approval-action (approve/reject)                │
└──────────────┬─────────────────────────────────────────────────────────┘
               │
┌──────────────▼─────────────────────────────────────────────────────────┐
│  Supabase Edge Functions (Deno)                                        │
│                                                                        │
│  ┌─────────────────────┐   delegate    ┌─────────────────────┐         │
│  │ agent-orchestrator  │──────────────▶│  agent-meta-ads     │         │
│  │ (Sonnet 4.6)        │               │  (Sonnet 4.6)       │         │
│  │ system_prompt cache │               │  tools: list, get,  │         │
│  │ tools: delegate*,   │               │   pause*, budget*   │         │
│  │  search_memory,     │               │  *=create approval  │         │
│  │  generate_report    │               └─────────────────────┘         │
│  └─────────────────────┘                                               │
│                                                                        │
│  ┌─────────────────────┐                ┌─────────────────────┐        │
│  │ agent-creative      │                │ profiler-tick       │        │
│  │ (FUTURO)            │                │ (Haiku 4.5)         │        │
│  └─────────────────────┘                │ pg_cron 1h          │        │
│                                         └─────────────────────┘        │
│                                                                        │
│  ┌─────────────────────┐                ┌─────────────────────┐        │
│  │ embed-tick          │                │ approval-action     │        │
│  │ (cron 5min, batch)  │                │ (executa Meta API)  │        │
│  └─────────────────────┘                └─────────────────────┘        │
└────────────────────────────────┬───────────────────────────────────────┘
                                 │
┌────────────────────────────────▼───────────────────────────────────────┐
│  Supabase Postgres                                                     │
│  ── conversations, messages                                            │
│  ── message_embeddings (pgvector)                                      │
│  ── user_facts, event_log                                              │
│  ── agent_runs (observability)                                         │
│  ── approvals (HITL queue)                                             │
│  ── meta_campaigns_mirror, meta_insights_mirror (sync local)           │
└────────────────────────────────────────────────────────────────────────┘
```

## Componentes

### 1. Edge Function `agent-orchestrator`

**Input (POST):**
```ts
{
  conversation_id: uuid,
  message: string,
  organization_id: uuid  // de RLS, mas explicit pro check
}
```

**Comportamento:**
1. Valida JWT, deriva user_id
2. Persiste user message em `messages`
3. Carrega contexto:
   - Ultimas 20 mensagens da conversa
   - Top 10 user_facts (confidence desc) da org
   - 5 mensagens semanticamente relevantes via pgvector (search_memory tool pode adicionar mais)
4. Monta system prompt com **cache_control breakpoint** apos as parts estaveis (identidade + tools + facts)
5. Chama Claude com tools = [`delegate_to_meta_ads`, `search_memory`, `generate_report`]
6. Loop ate `stop_reason !== 'tool_use'` ou `max_steps=10`
7. Streaming SSE pro client (text deltas + tool events)
8. Persiste assistant message + agent_run

**Tool `delegate_to_meta_ads`:**
- Chama internal HTTP em `agent-meta-ads` Edge Function (passa Authorization)
- Recebe response → injeta como `tool_result` no proximo turn

**Tool `search_memory`:**
- Embedding da query via Voyage API (ou OpenAI fallback)
- `select * from message_embeddings join messages ... order by embedding <=> query_embedding limit k`
- Filtrada por organization_id

**Tool `generate_report`:**
- Subprocess: research (Meta Ads agent) → write (Opus) → review (Sonnet)
- Resultado vira tool_result texto multi-secao

### 2. Edge Function `agent-meta-ads`

**Input:** chamada interna pelo orchestrator com `{ question, context }`.

**Tools disponiveis:**
- `list_campaigns(filters)` — le do mirror local (`meta_campaigns_mirror`), nao Meta API direto
- `get_insights(campaign_id, metrics, date_range)` — le mirror, refresh on-demand se stale
- `pause_campaign(campaign_id)` — **NAO executa**, cria entry em `approvals` table com status='pending'
- `resume_campaign(campaign_id)` — idem
- `update_budget(campaign_id, daily_budget)` — idem

Quando o agente quer fazer write, o tool result e:
```
Action queued for approval (id: <uuid>). User must approve via UI before execution.
```

A execucao real acontece em `approval-action` Edge Function quando o user aprova.

### 3. Edge Function `approval-action`

**Input:**
```ts
{ approval_id: uuid, decision: 'approve' | 'reject' }
```

**Comportamento:**
- Valida que approver = owner/admin da org
- Se approve: executa a acao real (Meta Marketing API call), marca `approvals.status='executed'`
- Se reject: marca `status='rejected'`
- Posta uma `messages` system na conversa de origem informando resultado

### 4. Edge Function `profiler-tick`

**Trigger:** `pg_cron` a cada hora.

**Comportamento:**
1. `select * from event_log where processed_at is null limit 500`
2. Agrupa por organization_id
3. Para cada grupo:
   - Monta prompt: "Aqui estao os eventos recentes desta organizacao. Extraia fatos em formato JSON."
   - Chama Haiku 4.5 com structured output (Zod schema)
   - Insert/update `user_facts` com `confidence` e `evidence_message_ids`
4. Marca eventos como `processed_at = now()`

**Schema do output (Zod):**
```ts
{
  facts: Array<{
    key: string,      // 'preferred_objective', 'avg_daily_budget', etc
    value: any,
    confidence: number, // 0..1
    evidence_event_ids: number[]
  }>
}
```

### 5. Edge Function `embed-tick`

**Trigger:** `pg_cron` a cada 5 min.

**Comportamento:**
- `select id, content from messages where id not in (select message_id from message_embeddings) limit 100`
- Para cada: chamada batch Voyage API → insert em `message_embeddings`

## Schema DB (DDL final)

```sql
-- migration: 2026MMDD_multi_agent_foundation.sql

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Conversas
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations ON DELETE CASCADE,
  title text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.conversations(user_id, organization_id, created_at DESC);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','tool','system')),
  content jsonb NOT NULL,
  agent text,
  parent_run_id uuid,
  tokens_in int, tokens_out int,
  cost_usd numeric(10,6),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.messages(conversation_id, created_at);

-- Memoria semantica
CREATE TABLE public.message_embeddings (
  message_id uuid PRIMARY KEY REFERENCES public.messages ON DELETE CASCADE,
  organization_id uuid NOT NULL,  -- denorm para filtro RLS-friendly
  embedding vector(512),  -- voyage-3-lite eh 512 dim
  summary text
);
CREATE INDEX ON public.message_embeddings USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX ON public.message_embeddings(organization_id);

-- Profiler
CREATE TABLE public.user_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb NOT NULL,
  confidence numeric(3,2) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  source text NOT NULL CHECK (source IN ('observed','declared','inferred')),
  evidence_event_ids bigint[],
  evidence_message_ids uuid[],
  superseded_by uuid REFERENCES public.user_facts,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ON public.user_facts(user_id, organization_id, key)
  WHERE superseded_by IS NULL;

CREATE TABLE public.event_log (
  id bigserial PRIMARY KEY,
  user_id uuid,
  organization_id uuid,
  event_type text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX ON public.event_log(processed_at) WHERE processed_at IS NULL;
CREATE INDEX ON public.event_log(organization_id, created_at DESC);

-- Observability
CREATE TABLE public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent text NOT NULL,
  conversation_id uuid REFERENCES public.conversations ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  parent_run_id uuid REFERENCES public.agent_runs ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('running','completed','failed','killed')),
  input jsonb, output jsonb,
  error text,
  tokens_in int, tokens_out int,
  cache_read_tokens int, cache_write_tokens int,
  cost_usd numeric(10,6),
  duration_ms int,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX ON public.agent_runs(organization_id, started_at DESC);
CREATE INDEX ON public.agent_runs(conversation_id, started_at);

-- HITL
CREATE TABLE public.approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations ON DELETE SET NULL,
  run_id uuid REFERENCES public.agent_runs ON DELETE SET NULL,
  action_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired','executed','failed')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  approved_by uuid REFERENCES auth.users,
  approved_at timestamptz,
  executed_at timestamptz,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.approvals(organization_id, status, created_at DESC);

-- RLS (Captain America revisa)
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;

-- Policy pattern (membership na org)
CREATE POLICY "members_select_conversations" ON public.conversations
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );
-- (analogos pras outras tabelas)

-- Cron jobs
SELECT cron.schedule(
  'profiler-tick-hourly',
  '0 * * * *',
  $$ SELECT net.http_post(
    url := 'https://ckxewdahdiambbxmqxgb.supabase.co/functions/v1/profiler-tick',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.cron_secret'))
  ) $$
);
SELECT cron.schedule(
  'embed-tick-5min',
  '*/5 * * * *',
  $$ SELECT net.http_post(
    url := 'https://ckxewdahdiambbxmqxgb.supabase.co/functions/v1/embed-tick',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.cron_secret'))
  ) $$
);
```

## Prompt Caching Strategy

System prompt do orchestrator dividido em blocos com `cache_control`:

```ts
[
  { type: 'text', text: IDENTITY_PROMPT, cache_control: { type: 'ephemeral' } },  // raramente muda
  { type: 'text', text: TOOLS_SCHEMA, cache_control: { type: 'ephemeral' } },     // muda em deploy
  { type: 'text', text: USER_FACTS_TEXT, cache_control: { type: 'ephemeral' } },  // muda quando profiler atualiza
  { type: 'text', text: CONVERSATION_HISTORY }  // muda toda mensagem — sem cache
]
```

Cache reads = 90% off. Hit rate esperado >80% pra mesmo user em sessao continua.

## Streaming UI

Vercel AI SDK `useChat` com endpoint custom apontando pra Edge Function. Edge function
emite SSE no formato AI SDK Data Stream Protocol (text-delta + tool-call + finish).

Pacote: `@ai-sdk/anthropic` + `ai` (~50KB gzip extra).

## Tool Schemas (Zod)

```ts
// Orchestrator tools
const delegateToMetaAdsSchema = z.object({
  question: z.string(),
  context: z.string().optional()
});

const searchMemorySchema = z.object({
  query: z.string(),
  k: z.number().min(1).max(20).default(5)
});

const generateReportSchema = z.object({
  template: z.enum(['weekly_performance', 'campaign_deep_dive', 'creative_analysis']),
  date_range: z.object({ start: z.string(), end: z.string() })
});

// Meta Ads tools (truncated)
const pauseCampaignSchema = z.object({
  campaign_id: z.string(),
  reason: z.string()
});
```

## Defesas

- **Max steps:** loop do agent quebra em 10 iteracoes
- **Timeout:** Edge Function timeout 60s; se passar, kill + agent_runs.status='killed'
- **Token cap por run:** rejeita se ultrapassar 100k tokens (proteção contra runaway)
- **Validation:** todo tool input passa por Zod antes de executar
- **Approval expiration:** cron job marca expired apos 5min
- **PII redaction (Profiler):** prompt explicito + regex post-processing pra emails/phones
- **Prompt injection:** campaign names/user content sempre em `<user_data>` tags, system instrui a ignorar instrucoes embutidas

## Open Decisions (resolvidos com defaults)

| Decisao | Default escolhido | Razao |
|---|---|---|
| Streaming UI | Vercel AI SDK | Mais simples, suporte nativo a Anthropic |
| Embeddings | voyage-3-lite (512d) | Anthropic-aligned, $0.02/M tokens |
| Cost cap | Apenas tracking | Enforcement sai em sprint posterior |

Mude antes do Sprint 1 se discordar.
