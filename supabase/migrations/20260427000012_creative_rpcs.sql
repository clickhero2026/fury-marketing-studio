-- Migration: AI Creative Generation — RPCs publicas
-- Spec: .kiro/specs/ai-creative-generation/
-- Tasks: 2.1, 2.2, 2.3
--
-- Implementa:
--   - get_creative_usage(company_id) — uso vs quotas (R6.1, 6.2, 6.3, 6.4, 6.5)
--   - get_creative_provenance(creative_id) — arvore de iteracao (R8.4)
--   - get_creative_health() — sucesso/falha por provedor 24h (R11.5)
--
-- Todas SECURITY INVOKER (herdam RLS). Health e read-only de agregados nao sensitivos.

-- ============================================================
-- get_creative_usage — quota check + status
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_creative_usage(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_daily_count integer;
  v_monthly_count integer;
  v_cost_usd_month numeric;
  v_daily_max integer;
  v_monthly_max integer;
  v_cost_max numeric;
  v_warning text[] := ARRAY[]::text[];
  v_blocked text[] := ARRAY[]::text[];
  v_status text;
  v_today_start timestamptz := date_trunc('day', now());
  v_month_start timestamptz := date_trunc('month', now());
BEGIN
  -- Conta criativos do dia/mes (RLS aplica naturalmente)
  SELECT count(*) INTO v_daily_count
    FROM public.creatives_generated
   WHERE company_id = p_company_id
     AND status != 'discarded'
     AND created_at >= v_today_start;

  SELECT count(*) INTO v_monthly_count
    FROM public.creatives_generated
   WHERE company_id = p_company_id
     AND status != 'discarded'
     AND created_at >= v_month_start;

  -- Custo do mes via agent_runs com agent_name 'creative-*'
  SELECT COALESCE(SUM(cost_usd), 0)
    INTO v_cost_usd_month
    FROM public.agent_runs
   WHERE company_id = p_company_id
     AND agent_name LIKE 'creative-%'
     AND started_at >= v_month_start;

  -- Quotas via JOIN com creative_plan_quotas
  SELECT
    q.creatives_per_day_max,
    q.creatives_per_month_max,
    q.cost_usd_per_month_max
    INTO v_daily_max, v_monthly_max, v_cost_max
    FROM public.creative_plan_quotas q
    INNER JOIN public.organizations o ON o.plan = q.plan
    INNER JOIN public.companies c ON c.organization_id = o.id
   WHERE c.id = p_company_id
   LIMIT 1;

  -- Fallback conservador (free) se sem plano definido
  v_daily_max := COALESCE(v_daily_max, 5);
  v_monthly_max := COALESCE(v_monthly_max, 25);
  v_cost_max := COALESCE(v_cost_max, 2.00);

  -- Calcular warning/blocked por dimensao
  IF v_daily_count >= v_daily_max THEN
    v_blocked := array_append(v_blocked, 'daily');
  ELSIF v_daily_count >= (v_daily_max * 0.8)::int THEN
    v_warning := array_append(v_warning, 'daily');
  END IF;

  IF v_monthly_count >= v_monthly_max THEN
    v_blocked := array_append(v_blocked, 'monthly');
  ELSIF v_monthly_count >= (v_monthly_max * 0.8)::int THEN
    v_warning := array_append(v_warning, 'monthly');
  END IF;

  IF v_cost_usd_month >= v_cost_max THEN
    v_blocked := array_append(v_blocked, 'cost');
  ELSIF v_cost_usd_month >= (v_cost_max * 0.8) THEN
    v_warning := array_append(v_warning, 'cost');
  END IF;

  v_status := CASE
    WHEN array_length(v_blocked, 1) > 0 THEN 'blocked'
    WHEN array_length(v_warning, 1) > 0 THEN 'warning'
    ELSE 'ok'
  END;

  RETURN jsonb_build_object(
    'daily', jsonb_build_object('count', v_daily_count, 'max', v_daily_max),
    'monthly', jsonb_build_object('count', v_monthly_count, 'max', v_monthly_max),
    'cost_usd_month', jsonb_build_object('value', v_cost_usd_month, 'max', v_cost_max),
    'status', v_status,
    'warning_dimensions', to_jsonb(v_warning),
    'blocked_dimensions', to_jsonb(v_blocked)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_creative_usage(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_creative_usage(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_creative_usage IS
  'Uso de geracao de criativos vs quotas do plano. Status: ok|warning(>=80%)|blocked(>=100%) por dimensao (daily/monthly/cost).';

-- ============================================================
-- get_creative_provenance — arvore de iteracao
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_creative_provenance(p_creative_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_chain jsonb;
  v_root_id uuid;
  v_root jsonb;
BEGIN
  -- CTE recursiva sobe ate o pai sem parent (raiz da cadeia)
  WITH RECURSIVE ancestry AS (
    SELECT id, parent_creative_id, prompt, concept, format, model_used,
           status, created_at, briefing_snapshot, kb_chunk_ids, 0 AS depth
      FROM public.creatives_generated
     WHERE id = p_creative_id

    UNION ALL

    SELECT cg.id, cg.parent_creative_id, cg.prompt, cg.concept, cg.format, cg.model_used,
           cg.status, cg.created_at, cg.briefing_snapshot, cg.kb_chunk_ids, a.depth + 1
      FROM public.creatives_generated cg
     INNER JOIN ancestry a ON a.parent_creative_id = cg.id
     WHERE a.depth < 20  -- guarda contra ciclos / cadeias muito longas
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'parent_creative_id', parent_creative_id,
      'concept', concept,
      'format', format,
      'model_used', model_used,
      'status', status,
      'created_at', created_at,
      'depth', depth
    ) ORDER BY depth DESC
  ) INTO v_chain
  FROM ancestry;

  -- Sem chain = creative nao acessivel (RLS) ou nao existe
  IF v_chain IS NULL THEN
    RETURN NULL;
  END IF;

  -- Root snapshot e o ultimo da cadeia (maior depth)
  SELECT id INTO v_root_id
    FROM (
      WITH RECURSIVE r AS (
        SELECT id, parent_creative_id, 0 AS depth
          FROM public.creatives_generated WHERE id = p_creative_id
        UNION ALL
        SELECT c.id, c.parent_creative_id, r.depth + 1
          FROM public.creatives_generated c JOIN r ON r.parent_creative_id = c.id
      )
      SELECT id FROM r ORDER BY depth DESC LIMIT 1
    ) sub;

  IF v_root_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'briefing_snapshot', briefing_snapshot,
      'kb_chunk_ids', kb_chunk_ids,
      'concept', concept,
      'prompt', prompt
    ) INTO v_root
      FROM public.creatives_generated
     WHERE id = v_root_id;
  END IF;

  RETURN jsonb_build_object(
    'chain', v_chain,
    'root', v_root,
    'depth', jsonb_array_length(v_chain) - 1
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_creative_provenance(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_creative_provenance(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_creative_provenance IS
  'Retorna arvore de iteracao de um criativo (chain via parent_creative_id ate raiz) + briefing/KB inputs usados na raiz. Profundidade max 20.';

-- ============================================================
-- get_creative_health — sucesso/falha por provedor 24h
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_creative_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nano_ok integer;
  v_nano_failed integer;
  v_gpt_ok integer;
  v_gpt_failed integer;
  v_p95_latency integer;
  v_window_start timestamptz := now() - interval '24 hours';
BEGIN
  -- Health agregado nao expoe dado tenant — counts globais por provedor.
  SELECT
    count(*) FILTER (WHERE agent_name = 'creative-nano-banana' AND status = 'success'),
    count(*) FILTER (WHERE agent_name = 'creative-nano-banana' AND status IN ('error', 'partial')),
    count(*) FILTER (WHERE agent_name = 'creative-gpt-image' AND status = 'success'),
    count(*) FILTER (WHERE agent_name = 'creative-gpt-image' AND status IN ('error', 'partial'))
    INTO v_nano_ok, v_nano_failed, v_gpt_ok, v_gpt_failed
    FROM public.agent_runs
   WHERE agent_name LIKE 'creative-%'
     AND started_at >= v_window_start;

  -- p95 latency em ms (PostgreSQL percentile_disc)
  SELECT percentile_disc(0.95) WITHIN GROUP (ORDER BY latency_ms)::int
    INTO v_p95_latency
    FROM public.agent_runs
   WHERE agent_name LIKE 'creative-%'
     AND started_at >= v_window_start
     AND latency_ms IS NOT NULL;

  RETURN jsonb_build_object(
    'nano_banana_24h', jsonb_build_object('success', COALESCE(v_nano_ok, 0), 'failed', COALESCE(v_nano_failed, 0)),
    'gpt_image_24h', jsonb_build_object('success', COALESCE(v_gpt_ok, 0), 'failed', COALESCE(v_gpt_failed, 0)),
    'p95_latency_ms', COALESCE(v_p95_latency, 0),
    'window_start', v_window_start
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_creative_health() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_creative_health() TO authenticated, service_role;

COMMENT ON FUNCTION public.get_creative_health IS
  'Saude global dos provedores nas ultimas 24h (sucesso/falha + p95 latency). Aberto para authenticated — agregados nao expoem dado tenant.';
