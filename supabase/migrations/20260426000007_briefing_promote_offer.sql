-- Migration: Briefing Onboarding — RPC atomico de promote_offer_to_primary
-- Spec: .kiro/specs/briefing-onboarding/
-- Fix M2 do code review: promote era 2 UPDATEs separados (demote + promote).
-- Se promote falhasse apos demote, a company ficava sem oferta principal,
-- violando o invariant "exatamente 1 principal por company".
-- Esta RPC executa demote + promote em uma unica transacao implicita
-- (todo corpo da funcao plpgsql roda em uma transacao).

CREATE OR REPLACE FUNCTION public.promote_offer_to_primary(p_offer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  -- Pega a company da oferta. RLS implicita: se nao for da company do usuario, NULL.
  SELECT company_id INTO v_company_id
    FROM public.company_offers
   WHERE id = p_offer_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'offer not found or access denied' USING ERRCODE = '42501';
  END IF;

  -- Demote da principal atual (se houver), excluindo o alvo.
  UPDATE public.company_offers
     SET is_primary = false
   WHERE company_id = v_company_id
     AND is_primary = true
     AND id <> p_offer_id;

  -- Promote a oferta alvo. Unique parcial garante consistencia mesmo em race.
  UPDATE public.company_offers
     SET is_primary = true
   WHERE id = p_offer_id;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_offer_to_primary(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.promote_offer_to_primary(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.promote_offer_to_primary IS
  'Atomic: demote oferta principal atual + promote a alvo, garantindo invariant "1 principal por company". RLS aplica via SECURITY INVOKER.';
