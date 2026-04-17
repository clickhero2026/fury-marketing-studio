# Design: FURY v0 — Algoritmo de Performance

> **Status:** APPROVED (fast-track)

## Database Schema

```sql
-- 1. Regras de performance por tenant (toggles)
CREATE TABLE fury_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  rule_key text NOT NULL, -- saturation, high_cpa, low_ctr, budget_exhausted, scaling_opportunity
  display_name text NOT NULL,
  description text,
  is_enabled boolean DEFAULT false,
  auto_execute boolean DEFAULT false, -- true = executa automaticamente, false = so recomenda
  threshold_value numeric NOT NULL,   -- valor de corte (3.0, 50, 0.5, 90, 20)
  threshold_unit text NOT NULL,       -- 'frequency', 'currency', 'percent', 'percent_budget', 'percent_below'
  consecutive_days int NOT NULL DEFAULT 2,
  action_type text NOT NULL CHECK (action_type IN ('pause','alert','suggest')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, rule_key)
);
ALTER TABLE fury_rules ENABLE ROW LEVEL SECURITY;

-- 2. Avaliacoes por campanha por execucao (features pra ML futuro)
CREATE TABLE fury_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  campaign_id uuid REFERENCES campaigns(id),
  campaign_external_id text,
  campaign_name text,
  -- Metricas 7d
  avg_ctr numeric,
  avg_cpm numeric,
  avg_cpc numeric,
  avg_frequency numeric,
  total_spend numeric,
  total_impressions bigint,
  total_clicks bigint,
  total_conversions int,
  daily_cpa numeric,         -- spend / conversions (7d)
  budget_pct_used numeric,   -- spend / budget * 100
  -- Tendencia
  trend_direction text CHECK (trend_direction IN ('improving','stable','worsening','insufficient_data')),
  trend_pct_change numeric,  -- variacao % media dia-a-dia
  days_with_data int,
  -- Resultado
  rules_triggered text[],    -- array de rule_keys que dispararam
  overall_health text CHECK (overall_health IN ('healthy','attention','critical')),
  evaluated_at timestamptz DEFAULT now()
);
ALTER TABLE fury_evaluations ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_fury_eval_company ON fury_evaluations(company_id, evaluated_at DESC);
CREATE INDEX idx_fury_eval_campaign ON fury_evaluations(campaign_id, evaluated_at DESC);

-- 3. Acoes do FURY (feed + auditoria)
CREATE TABLE fury_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  evaluation_id uuid REFERENCES fury_evaluations(id),
  campaign_id uuid REFERENCES campaigns(id),
  campaign_external_id text,
  campaign_name text,
  rule_key text NOT NULL,
  rule_display_name text,
  action_type text NOT NULL CHECK (action_type IN ('pause','alert','suggest','revert')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','executed','reverted','expired')),
  metric_name text,           -- ex: 'frequency', 'cpa', 'ctr'
  metric_value numeric,       -- valor atual da metrica
  threshold_value numeric,    -- threshold configurado
  meta_api_response jsonb,
  revert_before timestamptz,  -- created_at + 30 min (so pra executed)
  reverted_at timestamptz,
  performed_by text DEFAULT 'fury',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE fury_actions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_fury_actions_company ON fury_actions(company_id, created_at DESC);
CREATE INDEX idx_fury_actions_status ON fury_actions(company_id, status);

-- 4. Scan logs
CREATE TABLE fury_scan_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','partial','failed')),
  triggered_by text DEFAULT 'cron',
  campaigns_evaluated int DEFAULT 0,
  rules_triggered int DEFAULT 0,
  actions_executed int DEFAULT 0,
  error text,
  started_at timestamptz DEFAULT now(),
  finished_at timestamptz
);
ALTER TABLE fury_scan_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies (todas SELECT-only pra authenticated, service_role faz writes)
CREATE POLICY "fr_select" ON fury_rules FOR SELECT USING (company_id = current_user_company_id());
CREATE POLICY "fr_update" ON fury_rules FOR UPDATE USING (company_id = current_user_company_id());
CREATE POLICY "fe_select" ON fury_evaluations FOR SELECT USING (company_id = current_user_company_id());
CREATE POLICY "fa_select" ON fury_actions FOR SELECT USING (company_id = current_user_company_id());
CREATE POLICY "fsl_select" ON fury_scan_logs FOR SELECT USING (company_id = current_user_company_id());
```

## Edge Function: `fury-evaluate`

### Fluxo principal

```
1. Auth (dual JWT | x-cron-secret)
2. Fetch fury_rules WHERE is_enabled=true
3. Fetch campaigns ativas com metricas 7 dias (campaign_metrics)
4. Para cada campanha:
   a. Agregar metricas 7d (avg CTR, CPM, CPC, freq, spend, conversions)
   b. Calcular tendencia (3+ dias melhora vs piora)
   c. Calcular CPA e budget% used
   d. Aplicar cada regra ativa:
      - saturation: avg_frequency > threshold por consecutive_days
      - high_cpa: daily_cpa > threshold por consecutive_days
      - low_ctr: avg_ctr < threshold por consecutive_days
      - budget_exhausted: budget_pct > threshold
      - scaling_opportunity: daily_cpa < (threshold * -1 * threshold_below%) por consecutive_days
   e. INSERT fury_evaluations com snapshot
   f. Para cada regra que disparou:
      - Check dedup (mesma regra + campanha nas ultimas 24h)
      - INSERT fury_actions
      - Se auto_execute=true → POST Meta API status=PAUSED + set revert_before
5. Log em fury_scan_logs
```

### Calculo de metricas

```typescript
// Agregar 7 dias de campaign_metrics
const metrics = await supabase
  .from('campaign_metrics')
  .select('data, impressoes, cliques, cpc, cpm, investimento, conversas_iniciadas, website_purchase_roas')
  .eq('campanha', campaign.external_id)
  .gte('data', sevenDaysAgo)
  .order('data', { ascending: true });

// Media movel
const avgCtr = totalClicks / totalImpressions * 100;
const avgCpm = totalSpend / totalImpressions * 1000;
const avgCpc = totalSpend / totalClicks;
const dailyCpa = totalSpend / totalConversions;

// Tendencia: regressao linear simplificada sobre CPA diario
// Se coeficiente negativo por 3+ dias = improving
// Se positivo por 3+ dias = worsening
```

## Frontend

### Componentes

| Componente | Descricao |
|---|---|
| `FuryView.tsx` | View principal (nova tab sidebar, icone Zap) |
| `FuryDashboard.tsx` | KPI cards: acoes hoje, alertas, campanhas otimizadas |
| `FuryActionFeed.tsx` | Feed de acoes com filtro + botao desfazer |
| `FuryRulesConfig.tsx` | Toggles + thresholds por regra |

### Hooks

| Hook | Descricao |
|---|---|
| `useFuryActions()` | Lista fury_actions com refetchInterval 30s |
| `useFuryRules()` | CRUD fury_rules |
| `useFuryEvaluate()` | Mutation → trigger manual |
| `useFuryStats()` | KPIs agregados |
| `useFuryRevert(actionId)` | Mutation → revert acao |

## Cron

```sql
CREATE OR REPLACE FUNCTION trigger_fury_evaluate_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','vault','extensions' AS $$
DECLARE v_secret text; v_url text := 'https://ckxewdahdiambbxmqxgb.supabase.co'; r record;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name='CRON_SECRET' LIMIT 1;
  IF v_secret IS NULL THEN RETURN; END IF;
  FOR r IN
    SELECT DISTINCT i.company_id
    FROM integrations i WHERE i.platform='meta' AND i.status='active'
    ORDER BY i.company_id  -- futuro: ORDER BY spend DESC
  LOOP
    PERFORM net.http_post(
      url := v_url || '/functions/v1/fury-evaluate',
      headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',v_secret),
      body := jsonb_build_object('company_id', r.company_id)
    );
  END LOOP;
END $$;

SELECT cron.schedule('fury-evaluate-tick','0 * * * *', $$SELECT trigger_fury_evaluate_tick();$$);
```

## Trade-offs

| Decisao | Pros | Contras |
|---|---|---|
| Regras deterministicas vs ML | Simples, auditavel, rapido de implementar | Menos sofisticado — aceito pra v0 |
| Dados de campaign_metrics vs API real-time | Sem chamada externa, rapido, dados ja existem | Atraso de ate 6h (frequencia do meta-sync) — aceitavel |
| Revert em 30 min (vs permanente) | Safety net pra falso positivo | UX complexa — mitigado por botao claro |
| Schema com features pra ML | Facilita Sprint 3 | Colunas extras hoje — custo minimo |
