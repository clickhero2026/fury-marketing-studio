-- =====================================================
-- ClickHero: Row-Level Security Policies
-- Captain America (SECURITY) — 2026-04-02
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- PROFILES
-- =====================================================

-- Users can read their own profile
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (id = auth.uid());

-- Users can update their own profile
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- =====================================================
-- ORGANIZATIONS
-- =====================================================

-- Members can read their organizations
CREATE POLICY "organizations_select_member" ON public.organizations
  FOR SELECT USING (
    id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Only owner can update organization details
CREATE POLICY "organizations_update_owner" ON public.organizations
  FOR UPDATE USING (
    id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  )
  WITH CHECK (
    id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- Only owner can delete organization
CREATE POLICY "organizations_delete_owner" ON public.organizations
  FOR DELETE USING (
    id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- =====================================================
-- ORGANIZATION MEMBERS
-- =====================================================

-- Members can see co-members in their orgs
CREATE POLICY "org_members_select" ON public.organization_members
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Owner/admin can add members
CREATE POLICY "org_members_insert" ON public.organization_members
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Owner/admin can update member roles
CREATE POLICY "org_members_update" ON public.organization_members
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    -- Cannot promote to owner unless you are the owner
    role != 'owner' OR organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- Owner can remove members (but not themselves)
CREATE POLICY "org_members_delete" ON public.organization_members
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
    AND user_id != auth.uid()
  );

-- =====================================================
-- ORGANIZATION INVITATIONS
-- =====================================================

-- Owner/admin can see invitations for their org
-- Invited user can see invitations sent to their email
CREATE POLICY "invitations_select" ON public.organization_invitations
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Owner/admin can create invitations
CREATE POLICY "invitations_insert" ON public.organization_invitations
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Owner/admin can update invitation status
CREATE POLICY "invitations_update" ON public.organization_invitations
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Owner/admin can delete invitations
CREATE POLICY "invitations_delete" ON public.organization_invitations
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );
