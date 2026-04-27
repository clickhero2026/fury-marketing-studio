-- Migration: Briefing Onboarding — Core (briefings + offers)
-- Spec: .kiro/specs/briefing-onboarding/
-- Task: 1.1
--
-- Cria as duas tabelas centrais do briefing estruturado da empresa:
--   - company_briefings: 1:1 com companies. Guarda negocio, audience, tone, palette, status.
--   - company_offers   : 1:N. Oferta principal + ate 10 secundarias. Unique parcial garante
--                        no maximo UMA principal por company.
--
-- Seguranca: ADITIVO. Nenhuma tabela existente e alterada. RLS aplicada via
--            current_user_company_id() (mesma convencao do projeto).

-- ============================================================
-- company_briefings (1:1 com companies, company_id como PK)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.company_briefings (
  company_id uuid PRIMARY KEY
    REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Negocio
  niche text,
  niche_category text,
  short_description text,
  website_url text,
  social_links jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Audience (estrutura validada pelo Zod no client; nao normalizamos aqui)
  --   { ageRange, gender, location, occupation, incomeRange, awarenessLevel,
  --     interests[], behaviors[], languageSamples[] }
  audience jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Tom de voz
  --   { formality 1-5, technicality 1-5, emotional[],
  --     preferredCtas[], forbiddenPhrases[] }
  tone jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Identidade visual textual (logo/mood board ficam em company_branding_assets)
  --   { primary, secondary, accent, background } em hex
  palette jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Status agregado
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'incomplete', 'complete')),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_briefings_status_idx
  ON public.company_briefings(status);

-- updated_at automatico
CREATE OR REPLACE FUNCTION public.touch_company_briefings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_company_briefings_updated_at ON public.company_briefings;
CREATE TRIGGER touch_company_briefings_updated_at
  BEFORE UPDATE ON public.company_briefings
  FOR EACH ROW EXECUTE FUNCTION public.touch_company_briefings_updated_at();

-- RLS
ALTER TABLE public.company_briefings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_briefings_select" ON public.company_briefings;
CREATE POLICY "company_briefings_select" ON public.company_briefings
  FOR SELECT USING (company_id = public.current_user_company_id());

DROP POLICY IF EXISTS "company_briefings_insert" ON public.company_briefings;
CREATE POLICY "company_briefings_insert" ON public.company_briefings
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());

DROP POLICY IF EXISTS "company_briefings_update" ON public.company_briefings;
CREATE POLICY "company_briefings_update" ON public.company_briefings
  FOR UPDATE USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());

DROP POLICY IF EXISTS "company_briefings_delete" ON public.company_briefings;
CREATE POLICY "company_briefings_delete" ON public.company_briefings
  FOR DELETE USING (company_id = public.current_user_company_id());

COMMENT ON TABLE public.company_briefings IS
  'Briefing estruturado da empresa (1:1 com companies). Alimenta a IA do Fury com contexto de negocio, audience, tom e identidade visual textual. Logos e mood board vivem em company_branding_assets.';

-- ============================================================
-- company_offers (1:N)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.company_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL
    REFERENCES public.companies(id) ON DELETE CASCADE,

  is_primary boolean NOT NULL DEFAULT false,

  name text NOT NULL,
  short_description text NOT NULL,
  price numeric(12, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'BRL'
    CHECK (currency IN ('BRL', 'USD', 'EUR')),
  format text NOT NULL
    CHECK (format IN ('course', 'service', 'physical', 'saas', 'other')),
  sales_url text,

  pains_resolved text[] NOT NULL DEFAULT ARRAY[]::text[],
  benefits text[] NOT NULL DEFAULT ARRAY[]::text[],
  social_proof jsonb NOT NULL DEFAULT '{}'::jsonb,

  position integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Validacao de campos minimos (alinhada a R2.6)
  CONSTRAINT company_offers_required_fields_chk
    CHECK (length(name) > 0 AND length(short_description) > 0 AND price >= 0)
);

CREATE INDEX IF NOT EXISTS company_offers_company_idx
  ON public.company_offers(company_id, position);

-- Unique parcial: no maximo UMA oferta principal por company
CREATE UNIQUE INDEX IF NOT EXISTS company_offers_one_primary_per_company_uidx
  ON public.company_offers(company_id)
  WHERE is_primary = true;

-- updated_at automatico
CREATE OR REPLACE FUNCTION public.touch_company_offers_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_company_offers_updated_at ON public.company_offers;
CREATE TRIGGER touch_company_offers_updated_at
  BEFORE UPDATE ON public.company_offers
  FOR EACH ROW EXECUTE FUNCTION public.touch_company_offers_updated_at();

-- Auto-set company_id no insert quando o client nao passar (segue padrao do projeto)
DROP TRIGGER IF EXISTS auto_set_company_id_company_offers ON public.company_offers;
CREATE TRIGGER auto_set_company_id_company_offers
  BEFORE INSERT ON public.company_offers
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- RLS
ALTER TABLE public.company_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_offers_select" ON public.company_offers;
CREATE POLICY "company_offers_select" ON public.company_offers
  FOR SELECT USING (company_id = public.current_user_company_id());

DROP POLICY IF EXISTS "company_offers_insert" ON public.company_offers;
CREATE POLICY "company_offers_insert" ON public.company_offers
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());

DROP POLICY IF EXISTS "company_offers_update" ON public.company_offers;
CREATE POLICY "company_offers_update" ON public.company_offers
  FOR UPDATE USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());

DROP POLICY IF EXISTS "company_offers_delete" ON public.company_offers;
CREATE POLICY "company_offers_delete" ON public.company_offers
  FOR DELETE USING (company_id = public.current_user_company_id());

COMMENT ON TABLE public.company_offers IS
  'Ofertas da empresa (1:N com companies). Unique parcial garante exatamente uma oferta principal por company. Pre-requisito para gerar criativos contextualizados.';
