-- Migration: Briefing Onboarding — View de status + auto-transicao
-- Spec: .kiro/specs/briefing-onboarding/
-- Tasks: 2.1, 2.2
--
-- Implementa:
--   1. View v_company_briefing_status (R8.1, R8.2, R8.5, R8.6)
--      - score 0-100 ponderado
--      - is_complete baseado no minimo de R8.2
--      - missing_fields text[] identificando campos faltantes
--      - SECURITY INVOKER: respeita RLS naturalmente.
--   2. Funcao refresh_briefing_status(company_id) que sincroniza
--      company_briefings.status a partir da view.
--   3. Triggers em company_briefings/offers/branding_assets que disparam
--      o refresh quando dados relevantes mudam.
--
-- Seguranca: ADITIVO. Status flui automaticamente — frontend nao precisa
-- gerenciar manualmente.

-- ============================================================
-- View: v_company_briefing_status
-- ============================================================
CREATE OR REPLACE VIEW public.v_company_briefing_status
WITH (security_invoker = true) AS
WITH
  briefing AS (
    SELECT cb.*
      FROM public.company_briefings cb
  ),
  primary_offer AS (
    SELECT o.company_id,
           bool_or(o.is_primary
                   AND length(o.name) > 0
                   AND length(o.short_description) > 0
                   AND o.price >= 0) AS has_valid_primary,
           count(*) FILTER (WHERE NOT o.is_primary) AS secondary_count
      FROM public.company_offers o
     GROUP BY o.company_id
  ),
  visual_assets AS (
    SELECT a.company_id,
           bool_or(a.kind = 'logo_primary') AS has_logo_primary,
           count(*) FILTER (WHERE a.kind = 'mood_board') AS mood_board_count
      FROM public.company_branding_assets a
     GROUP BY a.company_id
  ),
  prohibitions_count AS (
    SELECT p.company_id, count(*) AS total
      FROM public.company_prohibitions p
     GROUP BY p.company_id
  ),
  fields AS (
    SELECT
      b.company_id,

      -- ===== Required minimum (R8.2) =====
      (b.niche IS NOT NULL AND length(b.niche) > 0) AS has_niche,
      (b.short_description IS NOT NULL AND length(b.short_description) > 0) AS has_description,
      COALESCE(po.has_valid_primary, false) AS has_primary_offer,

      -- audience.ageRange e audience.location nao podem ser null
      (b.audience ? 'ageRange'
        AND b.audience->'ageRange' IS NOT NULL
        AND jsonb_typeof(b.audience->'ageRange') = 'object') AS has_audience_age,
      (b.audience ? 'location'
        AND b.audience->'location' IS NOT NULL
        AND jsonb_typeof(b.audience->'location') = 'object') AS has_audience_location,

      -- tom em 3 dimensoes
      (b.tone ? 'formality' AND jsonb_typeof(b.tone->'formality') = 'number') AS has_tone_formality,
      (b.tone ? 'technicality' AND jsonb_typeof(b.tone->'technicality') = 'number') AS has_tone_technicality,
      (b.tone ? 'emotional'
        AND jsonb_typeof(b.tone->'emotional') = 'array'
        AND jsonb_array_length(b.tone->'emotional') > 0) AS has_tone_emotional,

      -- identidade visual: logo_primary OU paleta com 4 cores
      (
        COALESCE(va.has_logo_primary, false)
        OR (
          b.palette ? 'primary' AND jsonb_typeof(b.palette->'primary') = 'string'
          AND b.palette ? 'secondary' AND jsonb_typeof(b.palette->'secondary') = 'string'
          AND b.palette ? 'accent' AND jsonb_typeof(b.palette->'accent') = 'string'
          AND b.palette ? 'background' AND jsonb_typeof(b.palette->'background') = 'string'
        )
      ) AS has_visual_identity,

      -- ===== Optional (contribuem para score) =====
      COALESCE(po.secondary_count, 0) > 0 AS has_secondary_offers,
      (b.audience ? 'occupation' AND jsonb_typeof(b.audience->'occupation') = 'string') AS has_occupation,
      (b.audience ? 'incomeRange' AND jsonb_typeof(b.audience->'incomeRange') = 'string') AS has_income,
      (b.audience ? 'awarenessLevel' AND jsonb_typeof(b.audience->'awarenessLevel') = 'number') AS has_awareness,
      (b.tone ? 'preferredCtas'
        AND jsonb_typeof(b.tone->'preferredCtas') = 'array'
        AND jsonb_array_length(b.tone->'preferredCtas') > 0) AS has_preferred_ctas,
      (b.tone ? 'forbiddenPhrases'
        AND jsonb_typeof(b.tone->'forbiddenPhrases') = 'array'
        AND jsonb_array_length(b.tone->'forbiddenPhrases') > 0) AS has_forbidden_phrases,
      COALESCE(va.mood_board_count, 0) > 0 AS has_mood_board,
      COALESCE(pc.total, 0) > 0 AS has_any_prohibition

      FROM briefing b
      LEFT JOIN primary_offer po ON po.company_id = b.company_id
      LEFT JOIN visual_assets va ON va.company_id = b.company_id
      LEFT JOIN prohibitions_count pc ON pc.company_id = b.company_id
  )
SELECT
  f.company_id,

  -- is_complete: TODOS os required precisam estar verdadeiros (R8.2)
  (f.has_niche
    AND f.has_description
    AND f.has_primary_offer
    AND f.has_audience_age
    AND f.has_audience_location
    AND f.has_tone_formality
    AND f.has_tone_technicality
    AND f.has_tone_emotional
    AND f.has_visual_identity) AS is_complete,

  -- score 0-100: required pesa 80, optional pesa 20
  LEAST(100, GREATEST(0,
    (CASE WHEN f.has_niche THEN 10 ELSE 0 END)
    + (CASE WHEN f.has_description THEN 10 ELSE 0 END)
    + (CASE WHEN f.has_primary_offer THEN 15 ELSE 0 END)
    + (CASE WHEN f.has_audience_age THEN 10 ELSE 0 END)
    + (CASE WHEN f.has_audience_location THEN 10 ELSE 0 END)
    + (CASE WHEN f.has_tone_formality THEN 8 ELSE 0 END)
    + (CASE WHEN f.has_tone_technicality THEN 7 ELSE 0 END)
    + (CASE WHEN f.has_tone_emotional THEN 5 ELSE 0 END)
    + (CASE WHEN f.has_visual_identity THEN 5 ELSE 0 END)
    -- Optional total = 20
    + (CASE WHEN f.has_secondary_offers THEN 4 ELSE 0 END)
    + (CASE WHEN f.has_occupation THEN 2 ELSE 0 END)
    + (CASE WHEN f.has_income THEN 2 ELSE 0 END)
    + (CASE WHEN f.has_awareness THEN 2 ELSE 0 END)
    + (CASE WHEN f.has_preferred_ctas THEN 3 ELSE 0 END)
    + (CASE WHEN f.has_forbidden_phrases THEN 2 ELSE 0 END)
    + (CASE WHEN f.has_mood_board THEN 3 ELSE 0 END)
    + (CASE WHEN f.has_any_prohibition THEN 2 ELSE 0 END)
  ))::int AS score,

  -- missing_fields: identificadores estaveis para o frontend renderizar mensagens
  ARRAY_REMOVE(ARRAY[
    CASE WHEN NOT f.has_niche THEN 'niche' END,
    CASE WHEN NOT f.has_description THEN 'short_description' END,
    CASE WHEN NOT f.has_primary_offer THEN 'primary_offer' END,
    CASE WHEN NOT f.has_audience_age THEN 'audience_age' END,
    CASE WHEN NOT f.has_audience_location THEN 'audience_location' END,
    CASE WHEN NOT f.has_tone_formality THEN 'tone_formality' END,
    CASE WHEN NOT f.has_tone_technicality THEN 'tone_technicality' END,
    CASE WHEN NOT f.has_tone_emotional THEN 'tone_emotional' END,
    CASE WHEN NOT f.has_visual_identity THEN 'visual_identity' END
  ], NULL) AS missing_fields
  FROM fields f;

COMMENT ON VIEW public.v_company_briefing_status IS
  'Status agregado de completude do briefing. score 0-100 (required=80 + optional=20). is_complete = todos os required de R8.2 preenchidos. missing_fields = identificadores estaveis consumidos pelo frontend.';

-- ============================================================
-- Funcao refresh_briefing_status: sincroniza company_briefings.status
-- ============================================================
CREATE OR REPLACE FUNCTION public.refresh_briefing_status(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_complete boolean;
  v_score int;
  v_new_status text;
  v_current_status text;
BEGIN
  SELECT s.is_complete, s.score
    INTO v_complete, v_score
    FROM public.v_company_briefing_status s
   WHERE s.company_id = p_company_id;

  -- Sem briefing -> nada a fazer
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_new_status := CASE
    WHEN v_complete THEN 'complete'
    WHEN v_score = 0 THEN 'not_started'
    ELSE 'incomplete'
  END;

  SELECT status INTO v_current_status
    FROM public.company_briefings
   WHERE company_id = p_company_id;

  -- Atualiza apenas se status mudou (evita UPDATEs desnecessarios e snapshots redundantes)
  IF v_current_status IS DISTINCT FROM v_new_status THEN
    UPDATE public.company_briefings
       SET status = v_new_status
     WHERE company_id = p_company_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.refresh_briefing_status IS
  'Sincroniza company_briefings.status a partir da view v_company_briefing_status. Idempotente (so atualiza se mudou). SECURITY DEFINER pra funcionar a partir de triggers em qualquer tabela relacionada.';

-- ============================================================
-- Triggers que disparam o refresh
-- ============================================================

-- 1) BEFORE UPDATE em company_briefings: o proprio briefing mudou.
--    Calculamos depois (AFTER) para que o NEW ja esteja persistido.
--    Mas evitamos recursao usando uma flag de coluna especifica.
CREATE OR REPLACE FUNCTION public.trg_refresh_status_after_briefing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- So recalcula se algum campo de conteudo mudou (nao status puro).
  -- Evita loop infinito quando refresh_briefing_status atualiza status.
  IF TG_OP = 'UPDATE' AND (
       NEW.niche IS DISTINCT FROM OLD.niche
    OR NEW.short_description IS DISTINCT FROM OLD.short_description
    OR NEW.audience IS DISTINCT FROM OLD.audience
    OR NEW.tone IS DISTINCT FROM OLD.tone
    OR NEW.palette IS DISTINCT FROM OLD.palette
    OR NEW.social_links IS DISTINCT FROM OLD.social_links
    OR NEW.website_url IS DISTINCT FROM OLD.website_url
    OR NEW.niche_category IS DISTINCT FROM OLD.niche_category
  ) THEN
    PERFORM public.refresh_briefing_status(NEW.company_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS refresh_status_after_briefing ON public.company_briefings;
CREATE TRIGGER refresh_status_after_briefing
  AFTER UPDATE ON public.company_briefings
  FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_status_after_briefing();

-- 2) AFTER INSERT em company_briefings (primeiro save).
--    Forca a transicao de 'not_started' -> 'incomplete' ou 'complete'.
CREATE OR REPLACE FUNCTION public.trg_refresh_status_after_briefing_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.refresh_briefing_status(NEW.company_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS refresh_status_after_briefing_insert ON public.company_briefings;
CREATE TRIGGER refresh_status_after_briefing_insert
  AFTER INSERT ON public.company_briefings
  FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_status_after_briefing_insert();

-- 3) Triggers em tabelas relacionadas (offers, prohibitions, branding_assets).
--    Reusa uma unica funcao generica que pega company_id de NEW ou OLD.
CREATE OR REPLACE FUNCTION public.trg_refresh_status_from_related()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := COALESCE(
    (CASE WHEN TG_OP = 'DELETE' THEN OLD.company_id ELSE NEW.company_id END),
    NULL
  );
  IF v_company_id IS NOT NULL THEN
    PERFORM public.refresh_briefing_status(v_company_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS refresh_status_after_offers ON public.company_offers;
CREATE TRIGGER refresh_status_after_offers
  AFTER INSERT OR UPDATE OR DELETE ON public.company_offers
  FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_status_from_related();

DROP TRIGGER IF EXISTS refresh_status_after_prohibitions ON public.company_prohibitions;
CREATE TRIGGER refresh_status_after_prohibitions
  AFTER INSERT OR UPDATE OR DELETE ON public.company_prohibitions
  FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_status_from_related();

DROP TRIGGER IF EXISTS refresh_status_after_branding ON public.company_branding_assets;
CREATE TRIGGER refresh_status_after_branding
  AFTER INSERT OR UPDATE OR DELETE ON public.company_branding_assets
  FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_status_from_related();
