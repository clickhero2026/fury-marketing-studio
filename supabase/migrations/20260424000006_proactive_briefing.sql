-- Migration: Proactive Profiler Briefing (Sprint B3)
-- Spec: .kiro/specs/multi-agent-foundation/ (B3 — profiler proativo)
--
-- RPC get_proactive_briefing: ao abrir o chat, IA tem acesso a um briefing
-- automatico com:
--   - Memorias high-importance dos ultimos 14 dias
--   - Mudancas significativas em metricas (CTR drop > 20%, ROAS jump > 30%, gasto picos)
--   - Approvals/Plans pendentes
--
-- Frontend usa para mostrar banner "Sugestao do dia" no topo do chat.

CREATE OR REPLACE FUNCTION public.get_proactive_briefing()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_result jsonb;
BEGIN
  v_user_id := auth.uid();
  v_company_id := public.current_user_company_id();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthenticated');
  END IF;

  WITH
  -- Memorias high-importance recentes (ultimos 14d)
  recent_memories AS (
    SELECT id, content, memory_type, category, importance, last_accessed_at
    FROM public.memories
    WHERE user_id = v_user_id
      AND is_active = true
      AND importance >= 7
      AND created_at >= now() - interval '14 days'
      AND superseded_by IS NULL
    ORDER BY importance DESC, created_at DESC
    LIMIT 5
  ),
  -- Approvals e plans pendentes
  pending_approvals AS (
    SELECT count(*)::int AS n
    FROM public.approvals
    WHERE company_id = v_company_id
      AND status = 'pending'
      AND plan_id IS NULL
  ),
  pending_plans AS (
    SELECT count(*)::int AS n
    FROM public.plans
    WHERE company_id = v_company_id
      AND status = 'pending'
  ),
  -- Mudancas em metricas (last 7d vs previous 7d) — apenas se ha company
  last_7 AS (
    SELECT
      coalesce(sum(spend), 0)::numeric AS spend,
      coalesce(sum(impressions), 0)::bigint AS impressions,
      coalesce(sum(clicks), 0)::bigint AS clicks,
      coalesce(sum(conversions), 0)::numeric AS conversions
    FROM public.campaign_metrics cm
    JOIN public.campaigns c ON c.id = cm.campaign_id
    WHERE c.company_id = v_company_id
      AND cm.date >= (now() - interval '7 days')::date
      AND cm.date <= now()::date
  ),
  prev_7 AS (
    SELECT
      coalesce(sum(spend), 0)::numeric AS spend,
      coalesce(sum(impressions), 0)::bigint AS impressions,
      coalesce(sum(clicks), 0)::bigint AS clicks,
      coalesce(sum(conversions), 0)::numeric AS conversions
    FROM public.campaign_metrics cm
    JOIN public.campaigns c ON c.id = cm.campaign_id
    WHERE c.company_id = v_company_id
      AND cm.date >= (now() - interval '14 days')::date
      AND cm.date < (now() - interval '7 days')::date
  ),
  metric_diff AS (
    SELECT
      l.spend AS spend_now, p.spend AS spend_prev,
      l.impressions AS impr_now, p.impressions AS impr_prev,
      l.clicks AS clicks_now, p.clicks AS clicks_prev,
      l.conversions AS conv_now, p.conversions AS conv_prev,
      CASE WHEN p.impressions > 0 THEN (l.clicks::numeric / NULLIF(l.impressions, 0)) END AS ctr_now,
      CASE WHEN p.impressions > 0 THEN (p.clicks::numeric / NULLIF(p.impressions, 0)) END AS ctr_prev,
      CASE WHEN p.spend > 0 THEN (l.spend - p.spend) / p.spend * 100 END AS spend_change_pct,
      CASE WHEN p.conversions > 0 THEN (l.conversions - p.conversions) / p.conversions * 100 END AS conv_change_pct
    FROM last_7 l, prev_7 p
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'memories', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'content', content,
        'category', category,
        'importance', importance
      )) FROM recent_memories
    ), '[]'::jsonb),
    'pending_approvals', (SELECT n FROM pending_approvals),
    'pending_plans', (SELECT n FROM pending_plans),
    'metrics', (SELECT row_to_json(metric_diff.*) FROM metric_diff),
    'has_data', (SELECT COALESCE(impr_now > 0, false) FROM metric_diff)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_proactive_briefing() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_proactive_briefing() TO authenticated;

COMMENT ON FUNCTION public.get_proactive_briefing IS 'Briefing proativo (B3): memorias recentes high-importance + mudancas em metricas + approvals pendentes. Frontend chama ao abrir chat.';
