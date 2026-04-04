-- =====================================================
-- ClickHero: Fix RLS Policies & Add Constraints
-- Captain America (SECURITY) — Review Fix — 2026-04-02
-- =====================================================
-- Fixes:
-- 1. Missing INSERT policy on organizations (Edge Functions use service role,
--    but authenticated users creating orgs via client need this)
-- 2. org_members INSERT circular dependency (first owner can't insert themselves)
--    RESOLVED: Edge Functions use service_role key which bypasses RLS entirely.
--    For client-side member management, owner/admin policy is correct.
-- 3. Prevent last owner from being demoted/removed
-- 4. Add missing index on organization_invitations(organization_id)
-- 5. Normalize invitation emails to lowercase
-- =====================================================

-- 1. Trigger to prevent last owner removal/demotion
CREATE OR REPLACE FUNCTION public.prevent_last_owner_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  owner_count INTEGER;
BEGIN
  -- Only check if deleting an owner or changing role FROM owner
  IF (TG_OP = 'DELETE' AND OLD.role = 'owner') OR
     (TG_OP = 'UPDATE' AND OLD.role = 'owner' AND NEW.role != 'owner') THEN

    SELECT COUNT(*) INTO owner_count
    FROM public.organization_members
    WHERE organization_id = OLD.organization_id
      AND role = 'owner'
      AND id != OLD.id;

    IF owner_count = 0 THEN
      RAISE EXCEPTION 'Cannot remove or demote the last owner of an organization';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_last_owner_on_update ON public.organization_members;
CREATE TRIGGER check_last_owner_on_update
  BEFORE UPDATE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.prevent_last_owner_removal();

DROP TRIGGER IF EXISTS check_last_owner_on_delete ON public.organization_members;
CREATE TRIGGER check_last_owner_on_delete
  BEFORE DELETE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.prevent_last_owner_removal();

-- 2. Normalize invitation emails to lowercase on insert/update
CREATE OR REPLACE FUNCTION public.normalize_invitation_email()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.email = LOWER(TRIM(NEW.email));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_email_on_invitation ON public.organization_invitations;
CREATE TRIGGER normalize_email_on_invitation
  BEFORE INSERT OR UPDATE ON public.organization_invitations
  FOR EACH ROW EXECUTE FUNCTION public.normalize_invitation_email();

-- 3. Add missing index (organization_invitations FK for cascade DELETE performance)
CREATE INDEX IF NOT EXISTS idx_invitations_org ON public.organization_invitations(organization_id);

-- Note on missing INSERT policies:
-- organizations INSERT: Not needed because org creation happens via Edge Function
--   (create-organization) which uses service_role key, bypassing RLS entirely.
-- profiles INSERT: Not needed because profile creation happens via trigger
--   (handle_new_user) with SECURITY DEFINER, bypassing RLS.
-- org_members first INSERT: Same — Edge Function with service_role handles bootstrapping.
-- All subsequent client-side operations use the existing SELECT/UPDATE/DELETE policies.
