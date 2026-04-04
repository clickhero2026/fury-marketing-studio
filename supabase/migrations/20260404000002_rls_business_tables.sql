-- ============================================================================
-- Migration: RLS policies for ALL business tables
-- Purpose: Tenant isolation — user can only access data belonging to their
--          company (linked via organization bridge).
-- Pattern: company_id = current_user_company_id() on every table.
-- Safety: ADDITIVE ONLY — enables RLS + creates policies + creates triggers.
-- ============================================================================

-- ============================================================================
-- HELPER: Macro pattern applied to each table with company_id
-- For each table we:
--   1. Enable RLS
--   2. Create SELECT policy (tenant read)
--   3. Create INSERT policy (tenant write, with CHECK)
--   4. Create UPDATE policy (tenant modify)
--   5. Create DELETE policy (tenant remove)
--   6. Create auto_set_company_id trigger (auto-inject on INSERT)
-- ============================================================================

-- ======================== ad_sets ========================
ALTER TABLE public.ad_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ad_sets_tenant_select" ON public.ad_sets
  FOR SELECT USING (company_id = public.current_user_company_id());
CREATE POLICY "ad_sets_tenant_insert" ON public.ad_sets
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "ad_sets_tenant_update" ON public.ad_sets
  FOR UPDATE USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "ad_sets_tenant_delete" ON public.ad_sets
  FOR DELETE USING (company_id = public.current_user_company_id());

CREATE TRIGGER auto_set_company_id_ad_sets
  BEFORE INSERT ON public.ad_sets
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- ======================== auction_insights ========================
ALTER TABLE public.auction_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auction_insights_tenant_select" ON public.auction_insights
  FOR SELECT USING (company_id = public.current_user_company_id());
CREATE POLICY "auction_insights_tenant_insert" ON public.auction_insights
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "auction_insights_tenant_update" ON public.auction_insights
  FOR UPDATE USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "auction_insights_tenant_delete" ON public.auction_insights
  FOR DELETE USING (company_id = public.current_user_company_id());

CREATE TRIGGER auto_set_company_id_auction_insights
  BEFORE INSERT ON public.auction_insights
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- ======================== audit_actions ========================
ALTER TABLE public.audit_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_actions_tenant_select" ON public.audit_actions
  FOR SELECT USING (company_id = public.current_user_company_id());
CREATE POLICY "audit_actions_tenant_insert" ON public.audit_actions
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "audit_actions_tenant_update" ON public.audit_actions
  FOR UPDATE USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "audit_actions_tenant_delete" ON public.audit_actions
  FOR DELETE USING (company_id = public.current_user_company_id());

CREATE TRIGGER auto_set_company_id_audit_actions
  BEFORE INSERT ON public.audit_actions
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- ======================== audits ========================
ALTER TABLE public.audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audits_tenant_select" ON public.audits
  FOR SELECT USING (company_id = public.current_user_company_id());
CREATE POLICY "audits_tenant_insert" ON public.audits
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "audits_tenant_update" ON public.audits
  FOR UPDATE USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "audits_tenant_delete" ON public.audits
  FOR DELETE USING (company_id = public.current_user_company_id());

CREATE TRIGGER auto_set_company_id_audits
  BEFORE INSERT ON public.audits
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- ======================== brand_configurations ========================
ALTER TABLE public.brand_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brand_configurations_tenant_select" ON public.brand_configurations
  FOR SELECT USING (company_id = public.current_user_company_id());
CREATE POLICY "brand_configurations_tenant_insert" ON public.brand_configurations
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "brand_configurations_tenant_update" ON public.brand_configurations
  FOR UPDATE USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "brand_configurations_tenant_delete" ON public.brand_configurations
  FOR DELETE USING (company_id = public.current_user_company_id());

CREATE TRIGGER auto_set_company_id_brand_configurations
  BEFORE INSERT ON public.brand_configurations
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- ======================== campaign_metrics ========================
ALTER TABLE public.campaign_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign_metrics_tenant_select" ON public.campaign_metrics
  FOR SELECT USING (company_id = public.current_user_company_id());
CREATE POLICY "campaign_metrics_tenant_insert" ON public.campaign_metrics
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "campaign_metrics_tenant_update" ON public.campaign_metrics
  FOR UPDATE USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "campaign_metrics_tenant_delete" ON public.campaign_metrics
  FOR DELETE USING (company_id = public.current_user_company_id());

CREATE TRIGGER auto_set_company_id_campaign_metrics
  BEFORE INSERT ON public.campaign_metrics
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- ======================== campaigns ========================
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaigns_tenant_select" ON public.campaigns
  FOR SELECT USING (company_id = public.current_user_company_id());
CREATE POLICY "campaigns_tenant_insert" ON public.campaigns
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "campaigns_tenant_update" ON public.campaigns
  FOR UPDATE USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "campaigns_tenant_delete" ON public.campaigns
  FOR DELETE USING (company_id = public.current_user_company_id());

CREATE TRIGGER auto_set_company_id_campaigns
  BEFORE INSERT ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- ======================== content_criteria ========================
ALTER TABLE public.content_criteria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_criteria_tenant_select" ON public.content_criteria
  FOR SELECT USING (company_id = public.current_user_company_id());
CREATE POLICY "content_criteria_tenant_insert" ON public.content_criteria
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "content_criteria_tenant_update" ON public.content_criteria
  FOR UPDATE USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "content_criteria_tenant_delete" ON public.content_criteria
  FOR DELETE USING (company_id = public.current_user_company_id());

CREATE TRIGGER auto_set_company_id_content_criteria
  BEFORE INSERT ON public.content_criteria
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- ======================== creative_patterns ========================
ALTER TABLE public.creative_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creative_patterns_tenant_select" ON public.creative_patterns
  FOR SELECT USING (company_id = public.current_user_company_id());
CREATE POLICY "creative_patterns_tenant_insert" ON public.creative_patterns
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "creative_patterns_tenant_update" ON public.creative_patterns
  FOR UPDATE USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "creative_patterns_tenant_delete" ON public.creative_patterns
  FOR DELETE USING (company_id = public.current_user_company_id());

CREATE TRIGGER auto_set_company_id_creative_patterns
  BEFORE INSERT ON public.creative_patterns
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- ======================== creatives ========================
ALTER TABLE public.creatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creatives_tenant_select" ON public.creatives
  FOR SELECT USING (company_id = public.current_user_company_id());
CREATE POLICY "creatives_tenant_insert" ON public.creatives
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "creatives_tenant_update" ON public.creatives
  FOR UPDATE USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "creatives_tenant_delete" ON public.creatives
  FOR DELETE USING (company_id = public.current_user_company_id());

CREATE TRIGGER auto_set_company_id_creatives
  BEFORE INSERT ON public.creatives
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- ======================== google_sheets_config ========================
ALTER TABLE public.google_sheets_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "google_sheets_config_tenant_select" ON public.google_sheets_config
  FOR SELECT USING (company_id = public.current_user_company_id());
CREATE POLICY "google_sheets_config_tenant_insert" ON public.google_sheets_config
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "google_sheets_config_tenant_update" ON public.google_sheets_config
  FOR UPDATE USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "google_sheets_config_tenant_delete" ON public.google_sheets_config
  FOR DELETE USING (company_id = public.current_user_company_id());

CREATE TRIGGER auto_set_company_id_google_sheets_config
  BEFORE INSERT ON public.google_sheets_config
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- ======================== governance_infractions ========================
ALTER TABLE public.governance_infractions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "governance_infractions_tenant_select" ON public.governance_infractions
  FOR SELECT USING (company_id = public.current_user_company_id());
CREATE POLICY "governance_infractions_tenant_insert" ON public.governance_infractions
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "governance_infractions_tenant_update" ON public.governance_infractions
  FOR UPDATE USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "governance_infractions_tenant_delete" ON public.governance_infractions
  FOR DELETE USING (company_id = public.current_user_company_id());

CREATE TRIGGER auto_set_company_id_governance_infractions
  BEFORE INSERT ON public.governance_infractions
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- ======================== governance_rules ========================
ALTER TABLE public.governance_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "governance_rules_tenant_select" ON public.governance_rules
  FOR SELECT USING (company_id = public.current_user_company_id());
CREATE POLICY "governance_rules_tenant_insert" ON public.governance_rules
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "governance_rules_tenant_update" ON public.governance_rules
  FOR UPDATE USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "governance_rules_tenant_delete" ON public.governance_rules
  FOR DELETE USING (company_id = public.current_user_company_id());

CREATE TRIGGER auto_set_company_id_governance_rules
  BEFORE INSERT ON public.governance_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- ======================== integrations ========================
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "integrations_tenant_select" ON public.integrations
  FOR SELECT USING (company_id = public.current_user_company_id());
CREATE POLICY "integrations_tenant_insert" ON public.integrations
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "integrations_tenant_update" ON public.integrations
  FOR UPDATE USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "integrations_tenant_delete" ON public.integrations
  FOR DELETE USING (company_id = public.current_user_company_id());

CREATE TRIGGER auto_set_company_id_integrations
  BEFORE INSERT ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- ======================== keyword_rules ========================
ALTER TABLE public.keyword_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "keyword_rules_tenant_select" ON public.keyword_rules
  FOR SELECT USING (company_id = public.current_user_company_id());
CREATE POLICY "keyword_rules_tenant_insert" ON public.keyword_rules
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "keyword_rules_tenant_update" ON public.keyword_rules
  FOR UPDATE USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "keyword_rules_tenant_delete" ON public.keyword_rules
  FOR DELETE USING (company_id = public.current_user_company_id());

CREATE TRIGGER auto_set_company_id_keyword_rules
  BEFORE INSERT ON public.keyword_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- ======================== notifications ========================
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_tenant_select" ON public.notifications
  FOR SELECT USING (company_id = public.current_user_company_id());
CREATE POLICY "notifications_tenant_insert" ON public.notifications
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "notifications_tenant_update" ON public.notifications
  FOR UPDATE USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "notifications_tenant_delete" ON public.notifications
  FOR DELETE USING (company_id = public.current_user_company_id());

CREATE TRIGGER auto_set_company_id_notifications
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- ======================== performance_benchmarks ========================
ALTER TABLE public.performance_benchmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "performance_benchmarks_tenant_select" ON public.performance_benchmarks
  FOR SELECT USING (company_id = public.current_user_company_id());
CREATE POLICY "performance_benchmarks_tenant_insert" ON public.performance_benchmarks
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "performance_benchmarks_tenant_update" ON public.performance_benchmarks
  FOR UPDATE USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "performance_benchmarks_tenant_delete" ON public.performance_benchmarks
  FOR DELETE USING (company_id = public.current_user_company_id());

CREATE TRIGGER auto_set_company_id_performance_benchmarks
  BEFORE INSERT ON public.performance_benchmarks
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- ======================== policies ========================
ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "policies_tenant_select" ON public.policies
  FOR SELECT USING (company_id = public.current_user_company_id());
CREATE POLICY "policies_tenant_insert" ON public.policies
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "policies_tenant_update" ON public.policies
  FOR UPDATE USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "policies_tenant_delete" ON public.policies
  FOR DELETE USING (company_id = public.current_user_company_id());

CREATE TRIGGER auto_set_company_id_policies
  BEFORE INSERT ON public.policies
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- ======================== search_terms ========================
ALTER TABLE public.search_terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "search_terms_tenant_select" ON public.search_terms
  FOR SELECT USING (company_id = public.current_user_company_id());
CREATE POLICY "search_terms_tenant_insert" ON public.search_terms
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "search_terms_tenant_update" ON public.search_terms
  FOR UPDATE USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "search_terms_tenant_delete" ON public.search_terms
  FOR DELETE USING (company_id = public.current_user_company_id());

CREATE TRIGGER auto_set_company_id_search_terms
  BEFORE INSERT ON public.search_terms
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- ======================== sync_history ========================
ALTER TABLE public.sync_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_history_tenant_select" ON public.sync_history
  FOR SELECT USING (company_id = public.current_user_company_id());
CREATE POLICY "sync_history_tenant_insert" ON public.sync_history
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "sync_history_tenant_update" ON public.sync_history
  FOR UPDATE USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "sync_history_tenant_delete" ON public.sync_history
  FOR DELETE USING (company_id = public.current_user_company_id());

CREATE TRIGGER auto_set_company_id_sync_history
  BEFORE INSERT ON public.sync_history
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- ======================== tags ========================
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tags_tenant_select" ON public.tags
  FOR SELECT USING (company_id = public.current_user_company_id());
CREATE POLICY "tags_tenant_insert" ON public.tags
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "tags_tenant_update" ON public.tags
  FOR UPDATE USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());
CREATE POLICY "tags_tenant_delete" ON public.tags
  FOR DELETE USING (company_id = public.current_user_company_id());

CREATE TRIGGER auto_set_company_id_tags
  BEFORE INSERT ON public.tags
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- ============================================================================
-- JUNCTION TABLES (no company_id — inherit isolation via parent FK)
-- ============================================================================

-- ======================== campaign_tags ========================
ALTER TABLE public.campaign_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign_tags_tenant_select" ON public.campaign_tags
  FOR SELECT USING (
    campaign_id IN (SELECT id FROM public.campaigns WHERE company_id = public.current_user_company_id())
  );
CREATE POLICY "campaign_tags_tenant_insert" ON public.campaign_tags
  FOR INSERT WITH CHECK (
    campaign_id IN (SELECT id FROM public.campaigns WHERE company_id = public.current_user_company_id())
  );
CREATE POLICY "campaign_tags_tenant_delete" ON public.campaign_tags
  FOR DELETE USING (
    campaign_id IN (SELECT id FROM public.campaigns WHERE company_id = public.current_user_company_id())
  );

-- ======================== creative_tags ========================
ALTER TABLE public.creative_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creative_tags_tenant_select" ON public.creative_tags
  FOR SELECT USING (
    creative_id IN (SELECT id FROM public.creatives WHERE company_id = public.current_user_company_id())
  );
CREATE POLICY "creative_tags_tenant_insert" ON public.creative_tags
  FOR INSERT WITH CHECK (
    creative_id IN (SELECT id FROM public.creatives WHERE company_id = public.current_user_company_id())
  );
CREATE POLICY "creative_tags_tenant_delete" ON public.creative_tags
  FOR DELETE USING (
    creative_id IN (SELECT id FROM public.creatives WHERE company_id = public.current_user_company_id())
  );

-- ============================================================================
-- SPECIAL TABLES
-- ============================================================================

-- ======================== oauth_sessions (per-user, not per-company) ========================
ALTER TABLE public.oauth_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oauth_sessions_user_select" ON public.oauth_sessions
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "oauth_sessions_user_insert" ON public.oauth_sessions
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "oauth_sessions_user_update" ON public.oauth_sessions
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "oauth_sessions_user_delete" ON public.oauth_sessions
  FOR DELETE USING (user_id = auth.uid());

-- ======================== legacy users table (DEPRECATED) ========================
-- This table is separate from auth.users/profiles. Isolate by company_id.
-- Only SELECT policy — this table should not be written to by the app.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "legacy_users_tenant_select" ON public.users
  FOR SELECT USING (company_id = public.current_user_company_id());

COMMENT ON TABLE public.users IS 'DEPRECATED: Use auth.users + profiles + organization_members instead.';

-- ============================================================================
-- GLOBAL TABLES (no tenant scoping — accessible to all authenticated users)
-- ============================================================================

-- ai_settings: global config, authenticated read
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_settings_authenticated_select" ON public.ai_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- platform_settings: global config, authenticated read
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform_settings_authenticated_select" ON public.platform_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- subscription_plans: global catalog, authenticated read
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscription_plans_authenticated_select" ON public.subscription_plans
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- webhook_events: service-role only (no anon/user access)
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies = no access via anon/user. Only service_role can read/write.

-- ============================================================================
-- DONE: All business tables now have RLS with tenant isolation.
-- Tenant A cannot see Tenant B's data in any table.
-- ============================================================================
