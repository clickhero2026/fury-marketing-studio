-- ============================================================================
-- Migration: Bridge organizations <-> companies
-- Purpose: Link the auth tenant model (organizations) to the business tenant
--          model (companies), enabling RLS on all business tables.
-- Safety: ADDITIVE ONLY — no drops, no deletes, no destructive changes.
-- ============================================================================

-- 1. Add organization_id FK to companies table
-- This creates the bridge: each company belongs to exactly one organization.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

-- Unique partial index: one company per organization (for now)
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_organization_id
  ON public.companies(organization_id)
  WHERE organization_id IS NOT NULL;

-- Index for fast lookups from organization → company
CREATE INDEX IF NOT EXISTS idx_companies_org_id
  ON public.companies(organization_id);

-- 2. Bridge helper function: resolves current user's organization → company_id
-- This is the KEY function that ALL business table RLS policies will use.
CREATE OR REPLACE FUNCTION public.current_user_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT c.id
  FROM public.companies c
  WHERE c.organization_id = public.current_user_organization_id()
  LIMIT 1
$$;

-- 3. Auto-inject company_id trigger function
-- When frontend inserts a row without company_id, this trigger fills it.
CREATE OR REPLACE FUNCTION public.set_company_id_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := public.current_user_company_id();
  END IF;
  RETURN NEW;
END;
$$;

-- 4. RLS on companies table itself
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- SELECT: user can see companies linked to their organizations
CREATE POLICY "companies_tenant_select" ON public.companies
  FOR SELECT USING (
    organization_id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

-- INSERT: user can create company for their current organization
CREATE POLICY "companies_tenant_insert" ON public.companies
  FOR INSERT WITH CHECK (
    organization_id = public.current_user_organization_id()
  );

-- UPDATE: only organization owner can update company
CREATE POLICY "companies_tenant_update" ON public.companies
  FOR UPDATE USING (
    organization_id = public.current_user_organization_id()
    AND public.current_user_role() = 'owner'
  )
  WITH CHECK (
    organization_id = public.current_user_organization_id()
  );

-- DELETE: only organization owner can delete company
CREATE POLICY "companies_tenant_delete" ON public.companies
  FOR DELETE USING (
    organization_id = public.current_user_organization_id()
    AND public.current_user_role() = 'owner'
  );

-- ============================================================================
-- DONE: Bridge created. Next migration applies RLS to all business tables.
-- ============================================================================
