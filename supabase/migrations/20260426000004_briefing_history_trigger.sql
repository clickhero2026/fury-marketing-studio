-- Migration: Briefing Onboarding — Trigger de versionamento + cron de retencao
-- Spec: .kiro/specs/briefing-onboarding/
-- Task: 1.3
--
-- Implementa:
--   1. Trigger AFTER UPDATE em company_briefings que insere snapshot agregado
--      em briefing_history (R6.2). Snapshot inclui briefing + ofertas + proibicoes
--      + assets visuais (metadata, sem bytes).
--   2. Cron diario que mantem apenas as 20 versoes mais recentes por company (R6.3).
--
-- Seguranca: SECURITY DEFINER no trigger permite o INSERT em briefing_history
-- (que nao tem policy publica de INSERT). pg_cron ja foi habilitado em
-- 20260424000003_approvals_expire_cron.sql — reusamos a extensao.

-- ============================================================
-- Funcao do trigger: monta snapshot agregado e insere
-- ============================================================
CREATE OR REPLACE FUNCTION public.snapshot_company_briefing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_offers jsonb;
  v_prohibitions jsonb;
  v_assets jsonb;
  v_snapshot jsonb;
BEGIN
  -- Guarda contra re-snapshot quando refresh_briefing_status atualiza apenas
  -- a coluna status. Sem isso, cada save gera 2 entradas em briefing_history
  -- (uma com status antigo, outra com status novo).
  IF TG_OP = 'UPDATE' AND
     NEW.niche IS NOT DISTINCT FROM OLD.niche AND
     NEW.short_description IS NOT DISTINCT FROM OLD.short_description AND
     NEW.audience IS NOT DISTINCT FROM OLD.audience AND
     NEW.tone IS NOT DISTINCT FROM OLD.tone AND
     NEW.palette IS NOT DISTINCT FROM OLD.palette AND
     NEW.social_links IS NOT DISTINCT FROM OLD.social_links AND
     NEW.website_url IS NOT DISTINCT FROM OLD.website_url AND
     NEW.niche_category IS NOT DISTINCT FROM OLD.niche_category
  THEN
    RETURN NEW;
  END IF;

  -- Coleta ofertas atuais da company
  SELECT COALESCE(jsonb_agg(to_jsonb(o.*) ORDER BY o.position, o.created_at), '[]'::jsonb)
    INTO v_offers
    FROM public.company_offers o
   WHERE o.company_id = NEW.company_id;

  -- Coleta proibicoes
  SELECT COALESCE(jsonb_agg(to_jsonb(p.*) ORDER BY p.created_at), '[]'::jsonb)
    INTO v_prohibitions
    FROM public.company_prohibitions p
   WHERE p.company_id = NEW.company_id;

  -- Coleta metadata de assets visuais (sem bytes — apenas storage_path/kind/dimensoes)
  SELECT COALESCE(jsonb_agg(to_jsonb(a.*) ORDER BY a.created_at), '[]'::jsonb)
    INTO v_assets
    FROM public.company_branding_assets a
   WHERE a.company_id = NEW.company_id;

  v_snapshot := jsonb_build_object(
    'briefing', to_jsonb(NEW),
    'offers', v_offers,
    'prohibitions', v_prohibitions,
    'branding_assets', v_assets
  );

  INSERT INTO public.briefing_history (company_id, snapshot, changed_by, changed_at)
  VALUES (NEW.company_id, v_snapshot, auth.uid(), now());

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS snapshot_company_briefing_on_update ON public.company_briefings;
CREATE TRIGGER snapshot_company_briefing_on_update
  AFTER UPDATE ON public.company_briefings
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_company_briefing();

COMMENT ON FUNCTION public.snapshot_company_briefing IS
  'Trigger function: ao UPDATE em company_briefings, snapshota briefing + ofertas + proibicoes + metadata de assets em briefing_history. SECURITY DEFINER pois briefing_history nao tem policy de INSERT publica.';

-- ============================================================
-- Cron de retencao: mantem apenas as 20 versoes mais recentes por company
-- (R6.3). Roda diariamente as 03:00 UTC.
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'briefing-history-retention') THEN
    PERFORM cron.unschedule('briefing-history-retention');
  END IF;
END $$;

SELECT cron.schedule(
  'briefing-history-retention',
  '0 3 * * *',  -- diariamente as 03:00 UTC
  $$
    DELETE FROM public.briefing_history bh
    WHERE bh.id IN (
      SELECT id FROM (
        SELECT id,
               row_number() OVER (PARTITION BY company_id ORDER BY changed_at DESC) AS rn
          FROM public.briefing_history
      ) ranked
      WHERE ranked.rn > 20
    )
  $$
);
