-- ============================================================
-- Campaign Publisher — drafts, publications, steps
-- ============================================================

-- 1. campaign_drafts — drafts em edicao
CREATE TABLE IF NOT EXISTS campaign_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  created_by uuid REFERENCES auth.users(id),
  name text NOT NULL,
  ad_account_id text NOT NULL,
  campaign_data jsonb NOT NULL,
  adset_data jsonb NOT NULL,
  ad_data jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE campaign_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cd_select" ON campaign_drafts FOR SELECT USING (company_id = current_user_company_id());
CREATE POLICY "cd_insert" ON campaign_drafts FOR INSERT WITH CHECK (company_id = current_user_company_id());
CREATE POLICY "cd_update" ON campaign_drafts FOR UPDATE USING (company_id = current_user_company_id());
CREATE POLICY "cd_delete" ON campaign_drafts FOR DELETE USING (company_id = current_user_company_id());

-- 2. campaign_publications — historico imutavel de publicacoes
CREATE TABLE IF NOT EXISTS campaign_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  draft_id uuid REFERENCES campaign_drafts(id),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','validating','compliance_check','publishing','live','failed')),
  current_step text,
  compliance_score int,
  compliance_violations jsonb,
  meta_campaign_id text,
  meta_adset_id text,
  meta_creative_id text,
  meta_ad_id text,
  error_stage text,
  error_message text,
  started_at timestamptz DEFAULT now(),
  finished_at timestamptz,
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE campaign_publications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cp_select" ON campaign_publications FOR SELECT USING (company_id = current_user_company_id());
CREATE INDEX IF NOT EXISTS idx_publications_company ON campaign_publications(company_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_publications_status_active ON campaign_publications(status) WHERE status IN ('publishing','compliance_check','validating');

-- 3. campaign_publication_steps — auditoria granular para rollback
CREATE TABLE IF NOT EXISTS campaign_publication_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id uuid NOT NULL REFERENCES campaign_publications(id) ON DELETE CASCADE,
  step_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','success','failed','rolled_back')),
  external_id text,
  meta_api_response jsonb,
  error_message text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE campaign_publication_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cps_select" ON campaign_publication_steps FOR SELECT USING (
  publication_id IN (SELECT id FROM campaign_publications WHERE company_id = current_user_company_id())
);
CREATE INDEX IF NOT EXISTS idx_publication_steps_publication ON campaign_publication_steps(publication_id, created_at);
