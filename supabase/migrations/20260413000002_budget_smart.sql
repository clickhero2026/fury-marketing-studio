-- ============================================================
-- Budget Smart v0 — benchmarks por tenant + RPC de refresh
-- ============================================================

CREATE TABLE IF NOT EXISTS budget_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  objective text NOT NULL,
  avg_cpl numeric,
  avg_cpa numeric,
  avg_roas numeric,
  avg_ctr numeric,
  samples_count int,
  total_spend numeric,
  last_calculated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE (company_id, objective)
);

ALTER TABLE budget_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bb_select" ON budget_benchmarks FOR SELECT USING (company_id = current_user_company_id());
CREATE INDEX IF NOT EXISTS idx_budget_benchmarks_company ON budget_benchmarks(company_id, objective);

-- RPC que agrega metricas dos ultimos 30 dias agrupadas por objetivo
CREATE OR REPLACE FUNCTION refresh_budget_benchmarks(p_company_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_count int;
BEGIN
  INSERT INTO budget_benchmarks (company_id, objective, avg_cpl, avg_cpa, avg_roas, avg_ctr, samples_count, total_spend, last_calculated_at)
  SELECT
    p_company_id,
    COALESCE(c.objective, 'UNKNOWN') AS objective,
    AVG(NULLIF(cm.custo_conversa, 0))::numeric AS avg_cpl,
    CASE WHEN SUM(cm.conversas_iniciadas) > 0
      THEN SUM(cm.investimento) / SUM(cm.conversas_iniciadas)
      ELSE NULL END AS avg_cpa,
    AVG(NULLIF(cm.website_purchase_roas, 0))::numeric AS avg_roas,
    CASE WHEN SUM(cm.impressoes) > 0
      THEN (SUM(cm.cliques)::numeric / SUM(cm.impressoes)) * 100
      ELSE NULL END AS avg_ctr,
    COUNT(DISTINCT cm.data)::int AS samples_count,
    SUM(cm.investimento)::numeric AS total_spend,
    now()
  FROM campaign_metrics cm
  LEFT JOIN campaigns c ON c.external_id = cm.campanha AND c.company_id = p_company_id
  WHERE cm.company_id = p_company_id
    AND cm.data >= (now() - interval '30 days')::date
  GROUP BY c.objective
  ON CONFLICT (company_id, objective) DO UPDATE SET
    avg_cpl = EXCLUDED.avg_cpl,
    avg_cpa = EXCLUDED.avg_cpa,
    avg_roas = EXCLUDED.avg_roas,
    avg_ctr = EXCLUDED.avg_ctr,
    samples_count = EXCLUDED.samples_count,
    total_spend = EXCLUDED.total_spend,
    last_calculated_at = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION refresh_budget_benchmarks(uuid) TO authenticated;
