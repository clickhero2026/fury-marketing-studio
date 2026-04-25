-- Migration: Agent Observability (Sprint B1)
-- Spec: .kiro/specs/multi-agent-foundation/ (Sprint B1 — Saude do AI)
--
-- Tabela agent_runs registra TODA chamada ao AI:
--   - latencia (start/finish/ms)
--   - tokens (prompt/completion/total)
--   - custo estimado em USD
--   - tools usadas no run
--   - status (success | error | partial)
-- Permite dashboard "Saude do AI" (cost/dia, p95 latency, fail rate).

CREATE TABLE IF NOT EXISTS public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Identificacao do run
  agent_name text NOT NULL DEFAULT 'ai-chat',  -- futuramente: meta-ads-specialist, profiler, etc
  conversation_id uuid REFERENCES public.chat_conversations(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,

  -- Performance
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'error', 'partial')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  latency_ms integer,

  -- Modelo + tokens + custo
  model text,                          -- 'gpt-4o', 'gpt-4o-mini', etc
  prompt_tokens integer DEFAULT 0,
  completion_tokens integer DEFAULT 0,
  total_tokens integer DEFAULT 0,
  cost_usd numeric(10,6) DEFAULT 0,    -- 6 casas decimais (ex: 0.001234 USD)

  -- Tools chamadas no run (array de nomes)
  tools_used jsonb DEFAULT '[]'::jsonb,

  -- Erro (se status = error)
  error_message text,

  -- Metadata extra (request_id, parent_run_id, etc)
  metadata jsonb DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_runs_company_started_idx
  ON public.agent_runs(company_id, started_at DESC);

CREATE INDEX IF NOT EXISTS agent_runs_status_idx
  ON public.agent_runs(status, started_at DESC)
  WHERE status IN ('error', 'partial');

CREATE INDEX IF NOT EXISTS agent_runs_conversation_idx
  ON public.agent_runs(conversation_id, started_at DESC)
  WHERE conversation_id IS NOT NULL;

-- Auto-set company_id no insert
DROP TRIGGER IF EXISTS auto_set_company_id_agent_runs ON public.agent_runs;
CREATE TRIGGER auto_set_company_id_agent_runs
  BEFORE INSERT ON public.agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- RLS: usuarios so leem runs da propria company
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_runs_select" ON public.agent_runs;
CREATE POLICY "agent_runs_select" ON public.agent_runs
  FOR SELECT USING (company_id = public.current_user_company_id());

-- Insert/update sao service-role apenas (Edge Functions registram).
DROP POLICY IF EXISTS "agent_runs_insert" ON public.agent_runs;
CREATE POLICY "agent_runs_insert" ON public.agent_runs
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());

-- ============================================================
-- RPC: get_ai_health_summary
-- Retorna agregacoes para dashboard "Saude do AI" no periodo.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_ai_health_summary(
  p_days integer DEFAULT 7
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_since timestamptz;
  v_result jsonb;
BEGIN
  v_company_id := public.current_user_company_id();
  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('error', 'no_company');
  END IF;

  v_since := now() - (p_days || ' days')::interval;

  WITH base AS (
    SELECT *
    FROM public.agent_runs
    WHERE company_id = v_company_id
      AND started_at >= v_since
  ),
  totals AS (
    SELECT
      count(*)::int AS total_runs,
      count(*) FILTER (WHERE status = 'success')::int AS success_runs,
      count(*) FILTER (WHERE status = 'error')::int AS error_runs,
      count(*) FILTER (WHERE status = 'partial')::int AS partial_runs,
      coalesce(sum(cost_usd), 0)::numeric AS total_cost_usd,
      coalesce(sum(total_tokens), 0)::bigint AS total_tokens,
      coalesce(round(avg(latency_ms))::int, 0) AS avg_latency_ms,
      coalesce(
        (percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms))::int,
        0
      ) AS p95_latency_ms,
      coalesce(
        (percentile_cont(0.50) WITHIN GROUP (ORDER BY latency_ms))::int,
        0
      ) AS p50_latency_ms
    FROM base
    WHERE finished_at IS NOT NULL
  ),
  daily AS (
    SELECT
      to_char(date_trunc('day', started_at), 'YYYY-MM-DD') AS day,
      count(*)::int AS runs,
      coalesce(sum(cost_usd), 0)::numeric AS cost_usd,
      count(*) FILTER (WHERE status = 'error')::int AS errors
    FROM base
    GROUP BY 1
    ORDER BY 1
  ),
  tools AS (
    SELECT
      tool_name AS name,
      count(*)::int AS uses
    FROM base, jsonb_array_elements_text(tools_used) AS tool_name
    WHERE jsonb_array_length(tools_used) > 0
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 10
  ),
  recent_errors AS (
    SELECT
      id,
      started_at,
      error_message,
      agent_name,
      tools_used
    FROM base
    WHERE status = 'error'
    ORDER BY started_at DESC
    LIMIT 10
  )
  SELECT jsonb_build_object(
    'period_days', p_days,
    'totals', (SELECT row_to_json(totals.*) FROM totals),
    'daily', coalesce((SELECT jsonb_agg(row_to_json(daily.*)) FROM daily), '[]'::jsonb),
    'top_tools', coalesce((SELECT jsonb_agg(row_to_json(tools.*)) FROM tools), '[]'::jsonb),
    'recent_errors', coalesce((SELECT jsonb_agg(row_to_json(recent_errors.*)) FROM recent_errors), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ai_health_summary(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ai_health_summary(integer) TO authenticated;

COMMENT ON TABLE public.agent_runs IS 'Telemetria de cada chamada ao AI (ai-chat, sub-agentes, etc): latencia, tokens, custo, tools usadas. Alimenta dashboard Saude do AI.';
COMMENT ON FUNCTION public.get_ai_health_summary IS 'Agregacoes para dashboard de observability. Retorna totals, daily, top_tools, recent_errors no periodo (default 7 dias).';
