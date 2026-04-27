-- Migration: Briefing Onboarding — RPC get_company_briefing + audit log
-- Spec: .kiro/specs/briefing-onboarding/
-- Tasks: 3.1, 3.2, 3.3
--
-- Implementa:
--   1. log_briefing_access(company_id, purpose) — helper SECURITY DEFINER
--      que escreve em briefing_access_log (tabela sem INSERT policy publica).
--   2. get_company_briefing(p_company_id, p_purpose) — RPC SECURITY INVOKER
--      que retorna briefing completo agregado em JSON.
--   3. Indices adicionais para garantir p95 <200ms (R7.2).
--
-- Decisao de design (signed URLs):
--   A RPC retorna storage_path/mime/dimensoes dos assets visuais. Edge Functions
--   consumidoras (ai-chat, futuras creative-gen, campaign-publish) geram signed
--   URLs via supabase.storage.createSignedUrl() apos a chamada — mesmo padrao
--   de use-message-attachments.ts (chat-multimodal). Isso evita dependencia
--   de funcoes SQL de signing nao estaveis em todas as versoes do Supabase.

-- ============================================================
-- Helper: log_briefing_access (SECURITY DEFINER)
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_briefing_access(
  p_company_id uuid,
  p_purpose text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_purpose NOT IN ('chat', 'creative-generation', 'campaign-publish', 'compliance-preflight') THEN
    RAISE EXCEPTION 'invalid purpose: %', p_purpose USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.briefing_access_log (company_id, accessed_by, purpose, accessed_at)
  VALUES (p_company_id, auth.uid(), p_purpose, now());
END;
$$;

REVOKE ALL ON FUNCTION public.log_briefing_access(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.log_briefing_access(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.log_briefing_access IS
  'Helper interno chamado por get_company_briefing para inserir em briefing_access_log (que nao aceita INSERT direto de clientes).';

-- ============================================================
-- RPC: get_company_briefing
--   Retorna BriefingPayload completo (JSONB).
--   SECURITY INVOKER -> RLS aplica naturalmente. Se o usuario nao puder
--   ler company_briefings da company_id solicitada, retorna NULL e nao
--   loga acesso (R7.5).
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_company_briefing(
  p_company_id uuid,
  p_purpose text DEFAULT 'chat'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_briefing public.company_briefings%ROWTYPE;
  v_status RECORD;
  v_primary_offer jsonb;
  v_secondary_offers jsonb;
  v_prohibitions jsonb;
  v_visual_identity jsonb;
  v_payload jsonb;
BEGIN
  -- Valida enum de purpose antes de qualquer leitura.
  IF p_purpose NOT IN ('chat', 'creative-generation', 'campaign-publish', 'compliance-preflight') THEN
    RAISE EXCEPTION 'invalid purpose: %', p_purpose USING ERRCODE = '22023';
  END IF;

  -- RLS implicita: se o usuario nao for da company, briefing vira NULL.
  SELECT *
    INTO v_briefing
    FROM public.company_briefings
   WHERE company_id = p_company_id;

  IF NOT FOUND THEN
    -- Sem briefing OU sem acesso -> retorna NULL. Nao loga (R7.5).
    RETURN NULL;
  END IF;

  -- Status agregado (score / is_complete / missing_fields)
  SELECT s.is_complete, s.score, s.missing_fields
    INTO v_status
    FROM public.v_company_briefing_status s
   WHERE s.company_id = p_company_id;

  -- Oferta principal
  SELECT to_jsonb(o.*)
    INTO v_primary_offer
    FROM public.company_offers o
   WHERE o.company_id = p_company_id AND o.is_primary = true
   LIMIT 1;

  -- Ofertas secundarias ordenadas por position
  SELECT COALESCE(jsonb_agg(to_jsonb(o.*) ORDER BY o.position, o.created_at), '[]'::jsonb)
    INTO v_secondary_offers
    FROM public.company_offers o
   WHERE o.company_id = p_company_id AND o.is_primary = false;

  -- Proibicoes agrupadas por categoria
  SELECT jsonb_build_object(
    'words', COALESCE((SELECT jsonb_agg(value ORDER BY created_at)
                         FROM public.company_prohibitions
                        WHERE company_id = p_company_id AND category = 'word'), '[]'::jsonb),
    'topics', COALESCE((SELECT jsonb_agg(value ORDER BY created_at)
                         FROM public.company_prohibitions
                        WHERE company_id = p_company_id AND category = 'topic'), '[]'::jsonb),
    'visualRules', COALESCE((SELECT jsonb_agg(value ORDER BY created_at)
                              FROM public.company_prohibitions
                             WHERE company_id = p_company_id AND category = 'visual'), '[]'::jsonb)
  ) INTO v_prohibitions;

  -- Identidade visual: paths + metadata. Edge Function consumidora gera signed URLs.
  -- Mood board limitado a 10 (R4.3).
  SELECT jsonb_build_object(
    'logoPrimary', (
      SELECT jsonb_build_object(
        'storagePath', a.storage_path,
        'mimeType', a.mime_type,
        'sizeBytes', a.size_bytes,
        'width', a.width,
        'height', a.height
      )
        FROM public.company_branding_assets a
       WHERE a.company_id = p_company_id AND a.kind = 'logo_primary'
       LIMIT 1
    ),
    'logoAlt', (
      SELECT jsonb_build_object(
        'storagePath', a.storage_path,
        'mimeType', a.mime_type,
        'sizeBytes', a.size_bytes,
        'width', a.width,
        'height', a.height
      )
        FROM public.company_branding_assets a
       WHERE a.company_id = p_company_id AND a.kind = 'logo_alt'
       LIMIT 1
    ),
    'palette', v_briefing.palette,
    'moodBoard', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'storagePath', a.storage_path,
          'mimeType', a.mime_type,
          'sizeBytes', a.size_bytes,
          'width', a.width,
          'height', a.height
        ) ORDER BY a.created_at
      )
        FROM (
          SELECT * FROM public.company_branding_assets
           WHERE company_id = p_company_id AND kind = 'mood_board'
           ORDER BY created_at
           LIMIT 10
        ) a
    ), '[]'::jsonb)
  ) INTO v_visual_identity;

  -- Monta payload final
  v_payload := jsonb_build_object(
    'isComplete', COALESCE(v_status.is_complete, false),
    'status', v_briefing.status,
    'completenessScore', COALESCE(v_status.score, 0),
    'missingFields', COALESCE(v_status.missing_fields, ARRAY[]::text[]),
    'business', jsonb_build_object(
      'niche', v_briefing.niche,
      'nicheCategory', v_briefing.niche_category,
      'description', v_briefing.short_description,
      'website', v_briefing.website_url,
      'social', v_briefing.social_links
    ),
    'primaryOffer', v_primary_offer,
    'secondaryOffers', v_secondary_offers,
    'audience', v_briefing.audience,
    'tone', v_briefing.tone,
    'visualIdentity', v_visual_identity,
    'prohibitions', v_prohibitions,
    'meta', jsonb_build_object(
      'fetchedAt', now(),
      'cacheTtlSeconds', 300
    )
  );

  -- Audit (R7.6): so chega aqui se o usuario teve acesso real.
  PERFORM public.log_briefing_access(p_company_id, p_purpose);

  RETURN v_payload;
END;
$$;

REVOKE ALL ON FUNCTION public.get_company_briefing(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_company_briefing(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_company_briefing IS
  'Leitura agregada do briefing para consumo pela IA (chat / creative-gen / campaign-publish / compliance-preflight). Retorna NULL silenciosamente se sem acesso (RLS). Audit em briefing_access_log apenas em sucesso. Edge Functions consumidoras geram signed URLs a partir dos storagePath retornados.';

-- ============================================================
-- Indices adicionais para perf (R7.2 — p95 <200ms)
-- ============================================================
-- Lookup de oferta principal (filtro is_primary)
CREATE INDEX IF NOT EXISTS company_offers_company_primary_idx
  ON public.company_offers(company_id)
  WHERE is_primary = true;

-- Lookup de assets por kind
-- (company_branding_assets_company_kind_idx ja existe — ok)

-- Proibicoes por categoria
-- (company_prohibitions_company_category_idx ja existe — ok)
