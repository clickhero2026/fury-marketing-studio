-- =====================================================
-- Fix: invitations_update email case + invited_by FK cascade
-- Hulk (GUARDIAN) — Review Round 4 — 2026-04-02
-- =====================================================

-- 1. Fix invitations_update RLS policy: use LOWER() for email comparison
--    (consistent with invitations_select fixed in migration 004)
DROP POLICY IF EXISTS "invitations_update" ON public.organization_invitations;

CREATE POLICY "invitations_update" ON public.organization_invitations
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
    OR (
      email = LOWER((SELECT email FROM auth.users WHERE id = auth.uid()))
      AND status = 'pending'
    )
  );

-- 2. Fix invited_by FK: add ON DELETE CASCADE
--    If a user is deleted, their sent invitations should be cleaned up.
ALTER TABLE public.organization_invitations
  DROP CONSTRAINT IF EXISTS organization_invitations_invited_by_fkey;

ALTER TABLE public.organization_invitations
  ADD CONSTRAINT organization_invitations_invited_by_fkey
  FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE CASCADE;
