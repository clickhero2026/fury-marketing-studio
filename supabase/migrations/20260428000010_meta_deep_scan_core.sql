-- Migration: Meta Deep Scan — Corte A (slice minimo viavel)
-- Spec: .kiro/specs/meta-deep-scan/
--
-- Cria 3 tabelas core: meta_business_managers, adsets, meta_pixels.
-- Sem rate_limit, sem particionamento, sem cron — tudo isso vem em Corte B/C.
--
-- ADITIVO. Soft delete via deleted_at. RLS por current_user_company_id().

-- =================== meta_business_managers ===================
CREATE TABLE IF NOT EXISTS public.meta_business_managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  integration_id uuid REFERENCES public.integrations(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  name text,
  vertical text,
  primary_page text,
  created_time timestamptz,
  two_factor_type text,
  verification_status text,
  last_scanned_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_bms_external_company_unique UNIQUE (external_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_bms_company
  ON public.meta_business_managers(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_meta_bms_scanned
  ON public.meta_business_managers(last_scanned_at);

ALTER TABLE public.meta_business_managers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meta_bms_tenant_select" ON public.meta_business_managers;
CREATE POLICY "meta_bms_tenant_select" ON public.meta_business_managers
  FOR SELECT USING (company_id = public.current_user_company_id());
DROP POLICY IF EXISTS "meta_bms_tenant_insert" ON public.meta_business_managers;
CREATE POLICY "meta_bms_tenant_insert" ON public.meta_business_managers
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());
DROP POLICY IF EXISTS "meta_bms_tenant_update" ON public.meta_business_managers;
CREATE POLICY "meta_bms_tenant_update" ON public.meta_business_managers
  FOR UPDATE USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());
DROP POLICY IF EXISTS "meta_bms_tenant_delete" ON public.meta_business_managers;
CREATE POLICY "meta_bms_tenant_delete" ON public.meta_business_managers
  FOR DELETE USING (company_id = public.current_user_company_id());

DROP TRIGGER IF EXISTS auto_set_company_id_meta_bms ON public.meta_business_managers;
CREATE TRIGGER auto_set_company_id_meta_bms
  BEFORE INSERT ON public.meta_business_managers
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

DROP TRIGGER IF EXISTS set_updated_at_meta_bms ON public.meta_business_managers;
CREATE TRIGGER set_updated_at_meta_bms
  BEFORE UPDATE ON public.meta_business_managers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =================== adsets ===================
CREATE TABLE IF NOT EXISTS public.adsets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text NOT NULL,
  name text,
  status text,
  effective_status text,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  campaign_external_id text,
  daily_budget numeric,
  lifetime_budget numeric,
  budget_remaining numeric,
  bid_strategy text,
  billing_event text,
  optimization_goal text,
  targeting jsonb,
  promoted_object jsonb,
  start_time timestamptz,
  end_time timestamptz,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  integration_id uuid REFERENCES public.integrations(id) ON DELETE CASCADE,
  platform text NOT NULL DEFAULT 'meta',
  last_scanned_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT adsets_external_company_unique UNIQUE (external_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_adsets_company
  ON public.adsets(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_adsets_campaign
  ON public.adsets(campaign_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_adsets_effective_status
  ON public.adsets(effective_status) WHERE deleted_at IS NULL;

ALTER TABLE public.adsets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "adsets_tenant_select" ON public.adsets;
CREATE POLICY "adsets_tenant_select" ON public.adsets
  FOR SELECT USING (company_id = public.current_user_company_id());
DROP POLICY IF EXISTS "adsets_tenant_insert" ON public.adsets;
CREATE POLICY "adsets_tenant_insert" ON public.adsets
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());
DROP POLICY IF EXISTS "adsets_tenant_update" ON public.adsets;
CREATE POLICY "adsets_tenant_update" ON public.adsets
  FOR UPDATE USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());
DROP POLICY IF EXISTS "adsets_tenant_delete" ON public.adsets;
CREATE POLICY "adsets_tenant_delete" ON public.adsets
  FOR DELETE USING (company_id = public.current_user_company_id());

DROP TRIGGER IF EXISTS auto_set_company_id_adsets ON public.adsets;
CREATE TRIGGER auto_set_company_id_adsets
  BEFORE INSERT ON public.adsets
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

DROP TRIGGER IF EXISTS set_updated_at_adsets ON public.adsets;
CREATE TRIGGER set_updated_at_adsets
  BEFORE UPDATE ON public.adsets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =================== meta_pixels ===================
CREATE TABLE IF NOT EXISTS public.meta_pixels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text NOT NULL,
  name text,
  code text,
  last_fired_time timestamptz,
  creation_time timestamptz,
  owner_business_id text,
  can_proxy boolean,
  is_unavailable boolean,
  automatic_matching_fields jsonb,
  first_party_cookie_status text,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  integration_id uuid REFERENCES public.integrations(id) ON DELETE CASCADE,
  ad_account_id text,
  last_scanned_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_pixels_external_company_unique UNIQUE (external_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_pixels_company
  ON public.meta_pixels(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_meta_pixels_account
  ON public.meta_pixels(ad_account_id);

ALTER TABLE public.meta_pixels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meta_pixels_tenant_select" ON public.meta_pixels;
CREATE POLICY "meta_pixels_tenant_select" ON public.meta_pixels
  FOR SELECT USING (company_id = public.current_user_company_id());
DROP POLICY IF EXISTS "meta_pixels_tenant_insert" ON public.meta_pixels;
CREATE POLICY "meta_pixels_tenant_insert" ON public.meta_pixels
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());
DROP POLICY IF EXISTS "meta_pixels_tenant_update" ON public.meta_pixels;
CREATE POLICY "meta_pixels_tenant_update" ON public.meta_pixels
  FOR UPDATE USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());
DROP POLICY IF EXISTS "meta_pixels_tenant_delete" ON public.meta_pixels;
CREATE POLICY "meta_pixels_tenant_delete" ON public.meta_pixels
  FOR DELETE USING (company_id = public.current_user_company_id());

DROP TRIGGER IF EXISTS auto_set_company_id_meta_pixels ON public.meta_pixels;
CREATE TRIGGER auto_set_company_id_meta_pixels
  BEFORE INSERT ON public.meta_pixels
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

DROP TRIGGER IF EXISTS set_updated_at_meta_pixels ON public.meta_pixels;
CREATE TRIGGER set_updated_at_meta_pixels
  BEFORE UPDATE ON public.meta_pixels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =================== meta_api_rate_limit (auxiliar) ===================
CREATE TABLE IF NOT EXISTS public.meta_api_rate_limit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  integration_id uuid REFERENCES public.integrations(id) ON DELETE CASCADE,
  endpoint_pattern text NOT NULL,
  x_business_use_case_usage jsonb,
  x_app_usage jsonb,
  last_429_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_rate_limit_unique UNIQUE (company_id, endpoint_pattern)
);

CREATE INDEX IF NOT EXISTS idx_meta_rate_limit_429
  ON public.meta_api_rate_limit(last_429_at) WHERE last_429_at IS NOT NULL;

ALTER TABLE public.meta_api_rate_limit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meta_rate_limit_tenant_select" ON public.meta_api_rate_limit;
CREATE POLICY "meta_rate_limit_tenant_select" ON public.meta_api_rate_limit
  FOR SELECT USING (company_id = public.current_user_company_id());
DROP POLICY IF EXISTS "meta_rate_limit_tenant_insert" ON public.meta_api_rate_limit;
CREATE POLICY "meta_rate_limit_tenant_insert" ON public.meta_api_rate_limit
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());
DROP POLICY IF EXISTS "meta_rate_limit_tenant_update" ON public.meta_api_rate_limit;
CREATE POLICY "meta_rate_limit_tenant_update" ON public.meta_api_rate_limit
  FOR UPDATE USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());

DROP TRIGGER IF EXISTS auto_set_company_id_meta_rate_limit ON public.meta_api_rate_limit;
CREATE TRIGGER auto_set_company_id_meta_rate_limit
  BEFORE INSERT ON public.meta_api_rate_limit
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- =================== meta_scan_logs (auxiliar) ===================
CREATE TABLE IF NOT EXISTS public.meta_scan_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  integration_id uuid REFERENCES public.integrations(id) ON DELETE CASCADE,
  scan_type text NOT NULL CHECK (scan_type IN ('full_sync','deep_scan')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL CHECK (status IN ('running','success','partial','failed')),
  stats jsonb,
  error text,
  triggered_by text NOT NULL CHECK (triggered_by IN ('manual','cron'))
);

CREATE INDEX IF NOT EXISTS idx_meta_scan_logs_company
  ON public.meta_scan_logs(company_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_scan_logs_status
  ON public.meta_scan_logs(status) WHERE status = 'running';

ALTER TABLE public.meta_scan_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meta_scan_logs_tenant_select" ON public.meta_scan_logs;
CREATE POLICY "meta_scan_logs_tenant_select" ON public.meta_scan_logs
  FOR SELECT USING (company_id = public.current_user_company_id());

-- INSERT/UPDATE/DELETE: somente service_role (Edge Function meta-deep-scan).
