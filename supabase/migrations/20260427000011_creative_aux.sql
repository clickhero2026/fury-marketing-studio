-- Migration: AI Creative Generation — Auxiliares (compliance + blocklist + quotas + bucket)
-- Spec: .kiro/specs/ai-creative-generation/
-- Tasks: 1.2, 1.3, 1.4, 1.5
--
-- Empacotadas em uma migration por coesao logica:
--   - creative_compliance_check (R10.6)
--   - meta_baseline_blocklist com seed (R10.1)
--   - creative_plan_quotas com seed conservador MVP (R6.1, R6.2)
--   - bucket Storage generated-creatives (R9.2)
--
-- Seguranca: ADITIVO. Nada existente alterado.

-- ============================================================
-- creative_compliance_check (R10.6)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.creative_compliance_check (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id uuid NOT NULL
    REFERENCES public.creatives_generated(id) ON DELETE CASCADE,

  -- Listas de termos que matched em cada categoria
  baseline_hits text[] NOT NULL DEFAULT ARRAY[]::text[],
  briefing_hits text[] NOT NULL DEFAULT ARRAY[]::text[],
  ocr_hits text[] NOT NULL DEFAULT ARRAY[]::text[],

  -- Resultado consolidado: passou sem violacoes hard?
  passed boolean NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS creative_compliance_check_creative_idx
  ON public.creative_compliance_check(creative_id);

ALTER TABLE public.creative_compliance_check ENABLE ROW LEVEL SECURITY;

-- SELECT: tenant via JOIN com creatives_generated (RLS implicit no nested SELECT)
-- Acesso direto via creative_id seria leak — exigimos passar pelo creative pai.
DROP POLICY IF EXISTS "creative_compliance_check_select" ON public.creative_compliance_check;
CREATE POLICY "creative_compliance_check_select" ON public.creative_compliance_check
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.creatives_generated cg
       WHERE cg.id = creative_id
         AND cg.company_id = public.current_user_company_id()
    )
  );

-- Sem INSERT/UPDATE/DELETE policies — escrita exclusiva via service_role (Edge Fn).

COMMENT ON TABLE public.creative_compliance_check IS
  'Resultado do compliance light pre+pos-geracao por criativo. INSERT exclusivo via Edge Function creative-generate (service_role).';

-- ============================================================
-- meta_baseline_blocklist (R10.1) com seed inicial
-- ============================================================
CREATE TABLE IF NOT EXISTS public.meta_baseline_blocklist (
  term text PRIMARY KEY,
  category text NOT NULL CHECK (category IN (
    'claim_garantia', 'antes_depois', 'saude', 'financeiro', 'peso', 'outros'
  )),
  severity text NOT NULL CHECK (severity IN ('warn', 'block_unless_override')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meta_baseline_blocklist_category_idx
  ON public.meta_baseline_blocklist(category, severity);

-- Seed: termos PT-BR que costumam disparar Meta MARS/Account Quality
INSERT INTO public.meta_baseline_blocklist (term, category, severity) VALUES
  -- Claims de garantia
  ('100% garantido', 'claim_garantia', 'block_unless_override'),
  ('garantia total', 'claim_garantia', 'block_unless_override'),
  ('resultado garantido', 'claim_garantia', 'block_unless_override'),
  ('milagre', 'claim_garantia', 'warn'),
  ('milagroso', 'claim_garantia', 'warn'),

  -- Antes e depois (foto comparativa e flag classico)
  ('antes e depois', 'antes_depois', 'block_unless_override'),
  ('antes depois', 'antes_depois', 'block_unless_override'),
  ('transformacao', 'antes_depois', 'warn'),

  -- Saude
  ('cura definitiva', 'saude', 'block_unless_override'),
  ('cura', 'saude', 'warn'),
  ('elimina', 'saude', 'warn'),
  ('combata', 'saude', 'warn'),

  -- Financeiro
  ('ganhe r$', 'financeiro', 'block_unless_override'),
  ('ganhe x reais', 'financeiro', 'block_unless_override'),
  ('renda extra garantida', 'financeiro', 'block_unless_override'),
  ('lucro garantido', 'financeiro', 'block_unless_override'),
  ('enriquecer rapido', 'financeiro', 'block_unless_override'),

  -- Peso (regra estrita Meta)
  ('voce esta acima do peso', 'peso', 'block_unless_override'),
  ('emagreca x kg em y dias', 'peso', 'block_unless_override'),
  ('queime gordura', 'peso', 'warn'),
  ('barriga grande', 'peso', 'warn'),
  ('flacida', 'peso', 'warn'),

  -- Outros padroes problematicos
  ('voce', 'outros', 'warn'),  -- chamada direta excessiva (Meta penaliza)
  ('clique aqui', 'outros', 'warn')
ON CONFLICT (term) DO NOTHING;

ALTER TABLE public.meta_baseline_blocklist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meta_baseline_blocklist_select" ON public.meta_baseline_blocklist;
CREATE POLICY "meta_baseline_blocklist_select" ON public.meta_baseline_blocklist
  FOR SELECT TO authenticated USING (true);

-- INSERT/UPDATE/DELETE somente service_role (sem policies = bloqueado para clients)

COMMENT ON TABLE public.meta_baseline_blocklist IS
  'Blocklist baseline de termos sensiveis Meta. severity=warn (alerta), block_unless_override (exige confirmacao explicita). Read aberto para authenticated; mutacoes via service_role.';

-- ============================================================
-- creative_plan_quotas (R6.1, R6.2) com seed conservador MVP
-- ============================================================
CREATE TABLE IF NOT EXISTS public.creative_plan_quotas (
  plan text PRIMARY KEY CHECK (plan IN ('free', 'pro', 'enterprise')),
  creatives_per_day_max integer NOT NULL,
  creatives_per_month_max integer NOT NULL,
  cost_usd_per_month_max numeric(10, 2) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.creative_plan_quotas (plan, creatives_per_day_max, creatives_per_month_max, cost_usd_per_month_max) VALUES
  ('free',        5,   25,   2.00),
  ('pro',         25,  250,  25.00),
  ('enterprise',  100, 1000, 100.00)
ON CONFLICT (plan) DO NOTHING;

ALTER TABLE public.creative_plan_quotas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "creative_plan_quotas_select" ON public.creative_plan_quotas;
CREATE POLICY "creative_plan_quotas_select" ON public.creative_plan_quotas
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE public.creative_plan_quotas IS
  'Limites por plano de assinatura para geracao de criativos. Conservador no MVP — pode aumentar apos validacao com usuarios reais. Plano vive em organizations.plan.';

-- ============================================================
-- Bucket Storage: generated-creatives (R9.2, R9.3)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'generated-creatives',
  'generated-creatives',
  false,
  5242880,  -- 5 MB (criativos AI saem em ~2-4MB)
  ARRAY['image/png', 'image/webp', 'image/jpeg']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "generated_creatives_storage_select" ON storage.objects;
CREATE POLICY "generated_creatives_storage_select" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'generated-creatives'
    AND (storage.foldername(name))[1] = public.current_user_company_id()::text
  );

DROP POLICY IF EXISTS "generated_creatives_storage_insert" ON storage.objects;
CREATE POLICY "generated_creatives_storage_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'generated-creatives'
    AND (storage.foldername(name))[1] = public.current_user_company_id()::text
  );

DROP POLICY IF EXISTS "generated_creatives_storage_update" ON storage.objects;
CREATE POLICY "generated_creatives_storage_update" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'generated-creatives'
    AND (storage.foldername(name))[1] = public.current_user_company_id()::text
  );

DROP POLICY IF EXISTS "generated_creatives_storage_delete" ON storage.objects;
CREATE POLICY "generated_creatives_storage_delete" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'generated-creatives'
    AND (storage.foldername(name))[1] = public.current_user_company_id()::text
  );
