# Design: Smart Takedown + Compliance

> **Status:** APPROVED (fast-track)

## Overview

Motor de compliance com 3 camadas: regras locais (blacklist), IA (Claude API) e acao (takedown Meta). Segue os mesmos padroes de Edge Function, pg_cron e RLS do `meta-deep-scan`.

## Database Schema

```sql
-- 1. Regras de compliance por tenant
CREATE TABLE compliance_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  rule_type text NOT NULL CHECK (rule_type IN ('blacklist_term','brand_guideline','custom')),
  value text NOT NULL,               -- termo ou descricao da regra
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  source text NOT NULL DEFAULT 'user' CHECK (source IN ('user','meta_default','system')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, rule_type, value)
);
ALTER TABLE compliance_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_select" ON compliance_rules FOR SELECT USING (company_id = current_user_company_id());
CREATE POLICY "company_insert" ON compliance_rules FOR INSERT WITH CHECK (company_id = current_user_company_id());
CREATE POLICY "company_update" ON compliance_rules FOR UPDATE USING (company_id = current_user_company_id());
CREATE POLICY "company_delete" ON compliance_rules FOR DELETE USING (company_id = current_user_company_id() AND source = 'user');

-- 2. Scores de conformidade por anuncio
CREATE TABLE compliance_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  creative_id uuid NOT NULL REFERENCES creatives(id),
  external_ad_id text,                -- Meta ad ID
  copy_score int CHECK (copy_score BETWEEN 0 AND 100),
  image_score int CHECK (image_score BETWEEN 0 AND 100),
  final_score int NOT NULL CHECK (final_score BETWEEN 0 AND 100),
  health_status text NOT NULL CHECK (health_status IN ('healthy','warning','critical')),
  scan_model text DEFAULT 'claude-sonnet-4-5',
  scanned_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE compliance_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_select" ON compliance_scores FOR SELECT USING (company_id = current_user_company_id());
CREATE INDEX idx_compliance_scores_creative ON compliance_scores(creative_id, scanned_at DESC);
CREATE INDEX idx_compliance_scores_company ON compliance_scores(company_id, health_status);

-- 3. Violacoes individuais
CREATE TABLE compliance_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  score_id uuid NOT NULL REFERENCES compliance_scores(id) ON DELETE CASCADE,
  creative_id uuid NOT NULL REFERENCES creatives(id),
  violation_type text NOT NULL CHECK (violation_type IN (
    'blacklist_term','misleading_language','unfulfillable_promise',
    'meta_policy_violation','visual_claim','brand_mismatch','ocr_text_violation'
  )),
  severity text NOT NULL CHECK (severity IN ('info','warning','critical')),
  description text NOT NULL,         -- descricao legivel da violacao
  evidence text,                     -- trecho do copy/ocr que causou
  points_deducted int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE compliance_violations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_select" ON compliance_violations FOR SELECT USING (company_id = current_user_company_id());
CREATE INDEX idx_violations_score ON compliance_violations(score_id);
CREATE INDEX idx_violations_creative ON compliance_violations(creative_id);

-- 4. Acoes de takedown
CREATE TABLE compliance_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  creative_id uuid NOT NULL REFERENCES creatives(id),
  score_id uuid REFERENCES compliance_scores(id),
  action_type text NOT NULL CHECK (action_type IN ('auto_paused','manual_paused','appealed','reactivated')),
  external_ad_id text,
  reason text,
  meta_api_response jsonb,
  performed_by text DEFAULT 'system', -- 'system' | user_id
  created_at timestamptz DEFAULT now()
);
ALTER TABLE compliance_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_select" ON compliance_actions FOR SELECT USING (company_id = current_user_company_id());

-- 5. Config de compliance por empresa
-- Reusa integrations ou cria coluna dedicada
ALTER TABLE companies ADD COLUMN IF NOT EXISTS auto_takedown_enabled boolean DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS takedown_threshold int DEFAULT 50 CHECK (takedown_threshold BETWEEN 0 AND 100);

-- 6. Scan logs (mesmo padrao do meta_scan_logs)
CREATE TABLE compliance_scan_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','partial','failed')),
  triggered_by text DEFAULT 'manual' CHECK (triggered_by IN ('manual','cron')),
  ads_analyzed int DEFAULT 0,
  ads_critical int DEFAULT 0,
  ads_warning int DEFAULT 0,
  ads_healthy int DEFAULT 0,
  ads_paused int DEFAULT 0,
  error text,
  started_at timestamptz DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE compliance_scan_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_select" ON compliance_scan_logs FOR SELECT USING (company_id = current_user_company_id());

-- 7. Seed de termos proibidos Meta
INSERT INTO compliance_rules (company_id, rule_type, value, severity, source)
SELECT c.id, 'blacklist_term', t.term, t.severity, 'meta_default'
FROM companies c
CROSS JOIN (VALUES
  ('resultados garantidos', 'critical'),
  ('ganhe dinheiro facil', 'critical'),
  ('emagreca rapido', 'critical'),
  ('cura milagrosa', 'critical'),
  ('renda extra garantida', 'critical'),
  ('sem esforco', 'warning'),
  ('100% comprovado', 'warning'),
  ('aprovado pela anvisa', 'critical'),
  ('numero 1 do mercado', 'warning'),
  ('ultima chance', 'info'),
  ('vagas limitadas', 'info'),
  ('desconto imperdivel', 'info')
) AS t(term, severity)
ON CONFLICT (company_id, rule_type, value) DO NOTHING;
```

## Edge Function: `compliance-scan`

### Estrutura

```
supabase/functions/compliance-scan/index.ts
├── Auth: dual (JWT | x-cron-secret)
├── Resolve company_id
├── Fetch creatives ativas nao analisadas nas ultimas 24h
├── Para cada criativo (batch 5):
│   ├── 1. analyzeCopy(headline, body, cta, blacklist) → Claude Sonnet
│   ├── 2. analyzeImage(image_url, blacklist) → Claude Vision (se imagem)
│   ├── 3. calculateScore(copyResult, imageResult)
│   ├── 4. Upsert compliance_scores + compliance_violations
│   ├── 5. Se auto_takedown + score < threshold → pauseAd(ad_id)
│   └── 6. Log compliance_actions se takedown
├── Atualiza compliance_scan_logs
└── Return stats
```

### Prompt: Copy Analysis

```
Voce e um especialista em compliance de anuncios Meta Ads.
Analise o seguinte copy de anuncio e retorne um JSON.

COPY DO ANUNCIO:
Headline: {{headline}}
Body: {{body}}
CTA: {{cta}}

TERMOS PROIBIDOS DO TENANT:
{{blacklist_terms_joined}}

Retorne EXATAMENTE este JSON:
{
  "score": <0-100 onde 100=conforme>,
  "violations": [
    {
      "type": "blacklist_term|misleading_language|unfulfillable_promise|meta_policy_violation",
      "severity": "info|warning|critical",
      "description": "<descricao clara da violacao>",
      "evidence": "<trecho exato do copy>"
    }
  ]
}

Regras:
- Cada violacao critical deduz 40 pontos
- Cada warning deduz 20 pontos
- Cada info deduz 5 pontos
- Score minimo: 0
- Sem violacoes = score 100
- Considere: linguagem enganosa, promessas impossíveis, termos proibidos Meta,
  urgencia falsa, claims sem evidencia, antes/depois sem disclaimer
```

### Prompt: Image Analysis (Vision)

```
Voce e um especialista em compliance visual de anuncios Meta Ads.
Analise esta imagem de anuncio.

TERMOS PROIBIDOS:
{{blacklist_terms_joined}}

Tarefas:
1. Extraia TODO texto visivel na imagem (OCR)
2. Verifique se algum termo proibido aparece no texto extraido
3. Detecte claims visuais problematicos (antes/depois, numeros sem fonte, logos falsos)
4. Avalie se ha elementos enganosos

Retorne EXATAMENTE este JSON:
{
  "ocr_text": "<todo texto extraido>",
  "score": <0-100>,
  "violations": [
    {
      "type": "ocr_text_violation|visual_claim|brand_mismatch",
      "severity": "info|warning|critical",
      "description": "<descricao>",
      "evidence": "<texto ou descricao do elemento visual>"
    }
  ]
}
```

### Takedown Flow

```
1. Score final < company.takedown_threshold (default 50)?
2. company.auto_takedown_enabled = true?
3. Conta takedowns da ultima hora < 10? (rate limit)
4. POST https://graph.facebook.com/v22.0/{ad_id}?status=PAUSED
   Authorization: Bearer {meta_token}
5. Se 200: INSERT compliance_actions(action_type='auto_paused')
6. Se erro: log + nao retry (evita loop)
```

## Frontend

### Componentes

| Componente | Descricao |
|---|---|
| `ComplianceView.tsx` | View principal (nova tab na sidebar) |
| `ComplianceDashboard.tsx` | Cards KPI: analisados, healthy%, warning%, critical%, pausados |
| `ComplianceTable.tsx` | Tabela de anuncios com score + violacoes + acoes |
| `ComplianceDetail.tsx` | Modal/sheet com violacoes detalhadas de 1 anuncio |
| `ComplianceSettings.tsx` | Toggle takedown + threshold slider + blacklist CRUD |
| `BlacklistManager.tsx` | Tabela editavel de termos proibidos |

### Hooks

| Hook | Query |
|---|---|
| `useComplianceScores()` | `compliance_scores` + join `creatives` |
| `useComplianceViolations(scoreId)` | `compliance_violations` por score |
| `useComplianceRules()` | `compliance_rules` CRUD |
| `useComplianceScan()` | Mutation → invoke `compliance-scan` |
| `useComplianceStats()` | Agregacao: count por health_status |

## Cron

```sql
-- Cron: analise de compliance a cada 6h
CREATE OR REPLACE FUNCTION trigger_compliance_scan_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','vault','extensions' AS $$
DECLARE
  v_secret text;
  v_project_url text := 'https://ckxewdahdiambbxmqxgb.supabase.co';
  r record;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets
    WHERE name='CRON_SECRET' LIMIT 1;
  IF v_secret IS NULL THEN RETURN; END IF;

  FOR r IN
    SELECT DISTINCT i.company_id
    FROM integrations i
    WHERE i.platform = 'meta' AND i.status = 'active'
  LOOP
    PERFORM net.http_post(
      url := v_project_url || '/functions/v1/compliance-scan',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-cron-secret', v_secret
      ),
      body := jsonb_build_object('company_id', r.company_id)
    );
  END LOOP;
END $$;

SELECT cron.schedule('compliance-scan-tick','0 */6 * * *',
  $$SELECT trigger_compliance_scan_tick();$$);
```

## Trade-offs

| Decisao | Pros | Contras |
|---|---|---|
| Claude Vision como OCR (vs Tesseract) | 1 chamada faz OCR+analise, muito mais preciso, sem infra extra | Custo maior (~$0.01/img vs ~$0.001 Tesseract) — aceitavel pelo valor entregue |
| Score ponderado 60/40 (vs igual) | Copy e mais relevante pra politicas Meta | Imagens com texto enganoso podem ser sub-pontuadas — mitigado por `critical` override |
| Rate limit 10 takedowns/hora | Protege contra falso positivo em massa | Atrasa resposta se muitos ads violam — aceitavel como safety net |
| Threshold configuravel (vs fixo 50) | Cada empresa define tolerancia | Complexidade UI — mitigado por default sensato |
| ANTHROPIC_API_KEY no Vault | Seguro, alinhado com padrao de encrypt/decrypt | Uma chamada extra pra buscar — cache em variavel dentro da Edge Function |
