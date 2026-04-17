# Design: Orcamento Smart v0

## Database

```sql
-- Benchmarks agregados por tenant + objective
CREATE TABLE budget_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  objective text NOT NULL,  -- OUTCOME_LEADS | OUTCOME_SALES | OUTCOME_TRAFFIC | OUTCOME_ENGAGEMENT
  avg_cpl numeric,           -- custo por conversao medio
  avg_cpa numeric,           -- custo por aquisicao medio
  avg_roas numeric,
  avg_ctr numeric,
  samples_count int,         -- dias de dados
  total_spend numeric,
  last_calculated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(company_id, objective)
);
ALTER TABLE budget_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bb_select" ON budget_benchmarks FOR SELECT USING (company_id = current_user_company_id());

-- RPC que agrega dos ultimos 30 dias
CREATE OR REPLACE FUNCTION refresh_budget_benchmarks(p_company_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO budget_benchmarks (company_id, objective, avg_cpl, avg_cpa, avg_roas, avg_ctr, samples_count, total_spend, last_calculated_at)
  SELECT
    p_company_id,
    COALESCE(c.objective, 'UNKNOWN') as objective,
    AVG(NULLIF(cm.custo_conversa, 0))::numeric as avg_cpl,
    CASE WHEN SUM(cm.conversas_iniciadas) > 0 THEN SUM(cm.investimento) / SUM(cm.conversas_iniciadas) ELSE NULL END as avg_cpa,
    AVG(NULLIF(cm.website_purchase_roas, 0))::numeric as avg_roas,
    CASE WHEN SUM(cm.impressoes) > 0 THEN (SUM(cm.cliques)::numeric / SUM(cm.impressoes)) * 100 ELSE NULL END as avg_ctr,
    COUNT(DISTINCT cm.data)::int as samples_count,
    SUM(cm.investimento)::numeric as total_spend,
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
END $$;
```

## Market fallback defaults (codigo, nao DB)

```typescript
const MARKET_FALLBACK: Record<string, { avg_cpl: number; avg_cpa: number; avg_roas: number }> = {
  OUTCOME_LEADS:       { avg_cpl: 15, avg_cpa: 15, avg_roas: 0 },
  OUTCOME_SALES:       { avg_cpl: 40, avg_cpa: 40, avg_roas: 2.5 },
  OUTCOME_TRAFFIC:     { avg_cpl: 2,  avg_cpa: 2,  avg_roas: 0 },
  OUTCOME_ENGAGEMENT:  { avg_cpl: 1,  avg_cpa: 1,  avg_roas: 0 },
};
```

## Edge Function: `budget-recommend`

```
1. Auth JWT
2. Body: { objective, goal_per_week, current_budget_weekly }
3. Refresh benchmarks (chama RPC)
4. Fetch benchmark pro objective OU fallback market
5. Calcular alertas deterministicos:
   - CPL vs mediana mercado
   - Meta vs budget/cpl
   - Samples count
6. Prompt Claude com contexto completo pedindo JSON estruturado
7. Return {recommended_budget_weekly, projected_volume, projected_range_min/max, justification, alerts[]}
```

## Frontend

### Componentes
| Componente | Descricao |
|---|---|
| `BudgetSmartView.tsx` | View principal (nova tab sidebar) |
| `GoalWizard.tsx` | 3 steps stepper |
| `ObjectiveStep.tsx` | Cards grandes por objetivo |
| `GoalInputStep.tsx` | Input numerico + unidade |
| `BudgetSliderStep.tsx` | Slider + projecao real-time + botao IA |
| `RecommendationCard.tsx` | Card com recomendacao Claude |

### Hooks
| Hook | Descricao |
|---|---|
| `useBudgetBenchmarks()` | Query + refresh |
| `useBudgetRecommend()` | Mutation Claude |

### Estado local
- `useState` no wizard (objective, goal, currentBudget, recommendation)
- Sem necessidade de store global

## Trade-offs

| Decisao | Pros | Contras |
|---|---|---|
| Projecao client-side (vs server) | Slider fluido <300ms | Formula simples — mitigado por Claude no final |
| Benchmark no DB + market fallback | Dados reais do tenant + cobertura mesmo sem historico | Duas fontes — consolidado na Edge Function |
| Claude so no final | Economia de tokens | Menos iteracao AI — aceitavel v0 |
