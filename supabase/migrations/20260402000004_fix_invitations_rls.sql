-- =====================================================
-- Fix: invitations_select policy info leakage
-- Captain America (SECURITY) — Review Fix Round 2
-- =====================================================
-- Issue: Invited user could see ALL invitations to their email
-- across ALL organizations, leaking org names/invite info.
-- Fix: Restrict invited user view to PENDING invitations only.
-- =====================================================

DROP POLICY IF EXISTS "invitations_select" ON public.organization_invitations;

CREATE POLICY "invitations_select" ON public.organization_invitations
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
    OR (
      email = LOWER((SELECT email FROM auth.users WHERE id = auth.uid()))
      AND status = 'pending'
    )
  );
