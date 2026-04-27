-- Migration: Fury Learning — RLS + triggers
-- Spec: .kiro/specs/fury-learning/
-- Task: T1.2

-- =================== creative_assets ===================
ALTER TABLE public.creative_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creative_assets_tenant_select" ON public.creative_assets
  FOR SELECT USING (company_id = public.current_user_company_id());
CREATE POLICY "creative_assets_tenant_insert" ON public.creative_assets
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "creative_assets_tenant_update" ON public.creative_assets
  FOR UPDATE USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "creative_assets_tenant_delete" ON public.creative_assets
  FOR DELETE USING (company_id = public.current_user_company_id());

CREATE TRIGGER auto_set_company_id_creative_assets
  BEFORE INSERT ON public.creative_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- =================== behavior_rules ===================
ALTER TABLE public.behavior_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "behavior_rules_tenant_select" ON public.behavior_rules
  FOR SELECT USING (company_id = public.current_user_company_id());
CREATE POLICY "behavior_rules_tenant_insert" ON public.behavior_rules
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "behavior_rules_tenant_update" ON public.behavior_rules
  FOR UPDATE USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "behavior_rules_tenant_delete" ON public.behavior_rules
  FOR DELETE USING (company_id = public.current_user_company_id());

CREATE TRIGGER auto_set_company_id_behavior_rules
  BEFORE INSERT ON public.behavior_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

CREATE TRIGGER set_updated_at_behavior_rules
  BEFORE UPDATE ON public.behavior_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =================== creative_pipeline_rules ===================
ALTER TABLE public.creative_pipeline_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pipeline_rules_tenant_select" ON public.creative_pipeline_rules
  FOR SELECT USING (company_id = public.current_user_company_id());
CREATE POLICY "pipeline_rules_tenant_insert" ON public.creative_pipeline_rules
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "pipeline_rules_tenant_update" ON public.creative_pipeline_rules
  FOR UPDATE USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "pipeline_rules_tenant_delete" ON public.creative_pipeline_rules
  FOR DELETE USING (company_id = public.current_user_company_id());

CREATE TRIGGER auto_set_company_id_creative_pipeline_rules
  BEFORE INSERT ON public.creative_pipeline_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

CREATE TRIGGER set_updated_at_creative_pipeline_rules
  BEFORE UPDATE ON public.creative_pipeline_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =================== rule_proposal_events ===================
ALTER TABLE public.rule_proposal_events ENABLE ROW LEVEL SECURITY;

-- Read aberto pro tenant. INSERT bloqueado fora do tenant. UPDATE/DELETE proibidos (audit imutavel).
CREATE POLICY "rule_proposal_events_tenant_select" ON public.rule_proposal_events
  FOR SELECT USING (company_id = public.current_user_company_id());
CREATE POLICY "rule_proposal_events_tenant_insert" ON public.rule_proposal_events
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());

CREATE TRIGGER auto_set_company_id_rule_proposal_events
  BEFORE INSERT ON public.rule_proposal_events
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();
