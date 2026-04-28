-- Migration: estende get_proactive_briefing com alertas de compliance Meta
-- Spec: compliance-notifications (slice minimo)
--
-- Detecta criativos com effective_status problematico vindo da Meta API:
-- DISAPPROVED, WITH_ISSUES, IN_PROCESS sao os flags que aparecem quando
-- a Meta rejeita ou pede revisao. Conta total + lista os 3 mais recentes.

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
  -- NOVO: Criativos com problemas na Meta (DISAPPROVED, WITH_ISSUES, etc)
  compliance_problematic AS (
    SELECT
      count(*)::int AS total,
      jsonb_agg(jsonb_build_object(
        'id', id,
        'name', name,
        'effective_status', effective_status,
        'updated_at', updated_at
      ) ORDER BY updated_at DESC) FILTER (WHERE rn <= 3) AS samples
    FROM (
      SELECT
        id, name, effective_status, updated_at,
        row_number() OVER (ORDER BY updated_at DESC) AS rn
      FROM public.creatives
      WHERE company_id = v_company_id
        AND effective_status IN ('DISAPPROVED', 'WITH_ISSUES', 'PENDING_REVIEW', 'PREAPPROVED', 'PENDING_BILLING_INFO')
    ) sub
  ),
  last_7 AS (
    SELECT
      coalesce(sum(investimento), 0)::numeric AS spend,
      coalesce(sum(impressoes), 0)::bigint AS impressions,
      coalesce(sum(cliques), 0)::bigint AS clicks,
      coalesce(sum(conversas_iniciadas), 0)::numeric AS conversions
    FROM public.campaign_metrics
    WHERE company_id = v_company_id
      AND data >= (now() - interval '7 days')::date
      AND data <= now()::date
  ),
  prev_7 AS (
    SELECT
      coalesce(sum(investimento), 0)::numeric AS spend,
      coalesce(sum(impressoes), 0)::bigint AS impressions,
      coalesce(sum(cliques), 0)::bigint AS clicks,
      coalesce(sum(conversas_iniciadas), 0)::numeric AS conversions
    FROM public.campaign_metrics
    WHERE company_id = v_company_id
      AND data >= (now() - interval '14 days')::date
      AND data < (now() - interval '7 days')::date
  ),
  metric_diff AS (
    SELECT
      l.spend AS spend_now, p.spend AS spend_prev,
      l.impressions AS impr_now, p.impressions AS impr_prev,
      l.clicks AS clicks_now, p.clicks AS clicks_prev,
      l.conversions AS conv_now, p.conversions AS conv_prev,
      CASE WHEN l.impressions > 0 THEN (l.clicks::numeric / NULLIF(l.impressions, 0)) END AS ctr_now,
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
    'compliance_alerts', jsonb_build_object(
      'total', COALESCE((SELECT total FROM compliance_problematic), 0),
      'samples', COALESCE((SELECT samples FROM compliance_problematic), '[]'::jsonb)
    ),
    'metrics', (SELECT row_to_json(metric_diff.*) FROM metric_diff),
    'has_data', (SELECT COALESCE(impr_now > 0, false) FROM metric_diff)
  ) INTO v_result;

  RETURN v_result;
END;
$$;
