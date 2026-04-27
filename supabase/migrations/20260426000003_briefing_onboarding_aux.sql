-- Migration: Briefing Onboarding — Auxiliares (proibicoes + history + audit + assets visuais)
-- Spec: .kiro/specs/briefing-onboarding/
-- Tasks: 1.2, 1.4, 1.5
--
-- Criadas em uma unica migration por coesao logica:
--   - company_prohibitions     (R5)        — palavras/assuntos/visuais proibidos
--   - briefing_history         (R6.2/6.3)  — snapshots versionados (insert via trigger)
--   - briefing_access_log      (R7.6)      — audit de leituras pela IA (insert via RPC)
--   - bucket Storage company-assets (R4)   — bucket privado com policies por path
--   - company_branding_assets  (R4)        — metadata dos arquivos visuais
--
-- Seguranca: ADITIVO. Nenhuma tabela/bucket existente alterado.

-- ============================================================
-- company_prohibitions (R5.1, R5.2, R5.3, R5.5)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.company_prohibitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL
    REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Categoria do que esta sendo proibido
  category text NOT NULL
    CHECK (category IN ('word', 'topic', 'visual')),

  -- O conteudo proibido (palavra, assunto descrito, regra visual)
  value text NOT NULL,

  -- Origem: o usuario adicionou ou foi default por vertical regulada (R5.4)
  source text NOT NULL DEFAULT 'user'
    CHECK (source IN ('user', 'vertical_default')),

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT company_prohibitions_value_not_empty_chk
    CHECK (length(value) > 0)
);

CREATE INDEX IF NOT EXISTS company_prohibitions_company_category_idx
  ON public.company_prohibitions(company_id, category);

-- Auto-set company_id no insert
DROP TRIGGER IF EXISTS auto_set_company_id_company_prohibitions ON public.company_prohibitions;
CREATE TRIGGER auto_set_company_id_company_prohibitions
  BEFORE INSERT ON public.company_prohibitions
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

ALTER TABLE public.company_prohibitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_prohibitions_select" ON public.company_prohibitions;
CREATE POLICY "company_prohibitions_select" ON public.company_prohibitions
  FOR SELECT USING (company_id = public.current_user_company_id());

DROP POLICY IF EXISTS "company_prohibitions_insert" ON public.company_prohibitions;
CREATE POLICY "company_prohibitions_insert" ON public.company_prohibitions
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());

DROP POLICY IF EXISTS "company_prohibitions_update" ON public.company_prohibitions;
CREATE POLICY "company_prohibitions_update" ON public.company_prohibitions
  FOR UPDATE USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());

DROP POLICY IF EXISTS "company_prohibitions_delete" ON public.company_prohibitions;
CREATE POLICY "company_prohibitions_delete" ON public.company_prohibitions
  FOR DELETE USING (company_id = public.current_user_company_id());

COMMENT ON TABLE public.company_prohibitions IS
  'Proibicoes da empresa (palavras/assuntos/visuais que a IA nao pode usar). Inclui defaults por vertical regulada (saude, financeiro, infoproduto).';

-- ============================================================
-- briefing_history (R6.2, R6.3)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.briefing_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL
    REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Snapshot completo do briefing (incluindo arrays/objects relacionados)
  snapshot jsonb NOT NULL,

  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS briefing_history_company_changed_at_idx
  ON public.briefing_history(company_id, changed_at DESC);

ALTER TABLE public.briefing_history ENABLE ROW LEVEL SECURITY;

-- SELECT por company_id (audit visivel ao tenant)
DROP POLICY IF EXISTS "briefing_history_select" ON public.briefing_history;
CREATE POLICY "briefing_history_select" ON public.briefing_history
  FOR SELECT USING (company_id = public.current_user_company_id());

-- Sem policies de INSERT/UPDATE/DELETE para clientes:
-- inserts so acontecem via trigger (SECURITY DEFINER) em company_briefings (task 1.3).
-- Nenhuma role normal pode escrever direto.

COMMENT ON TABLE public.briefing_history IS
  'Snapshots versionados do briefing. INSERT acontece exclusivamente via trigger AFTER UPDATE em company_briefings (task 1.3). Retencao bounded em 20 versoes mais recentes por company (cron task 1.3).';

-- ============================================================
-- briefing_access_log (R7.6)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.briefing_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL
    REFERENCES public.companies(id) ON DELETE CASCADE,

  accessed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Proposito da leitura: chat / creative-generation / campaign-publish / compliance-preflight
  purpose text NOT NULL
    CHECK (purpose IN ('chat', 'creative-generation', 'campaign-publish', 'compliance-preflight')),

  accessed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS briefing_access_log_company_accessed_at_idx
  ON public.briefing_access_log(company_id, accessed_at DESC);

ALTER TABLE public.briefing_access_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "briefing_access_log_select" ON public.briefing_access_log;
CREATE POLICY "briefing_access_log_select" ON public.briefing_access_log
  FOR SELECT USING (company_id = public.current_user_company_id());

-- Sem policies de INSERT/UPDATE/DELETE para clientes:
-- inserts acontecem dentro da RPC get_company_briefing (task 3.x), com SECURITY DEFINER.

COMMENT ON TABLE public.briefing_access_log IS
  'Audit de leituras do briefing pela IA. INSERT acontece exclusivamente dentro da RPC get_company_briefing (task 3.x).';

-- ============================================================
-- Bucket Storage: company-assets (privado)
-- Path convention: <company_id>/branding/<kind>/<uuid>.<ext>
-- (R4.4, R4.6, R9.2)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-assets',
  'company-assets',
  false,
  5242880,  -- 5 MB (alinhado a R4.5)
  ARRAY[
    'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "company_assets_storage_select" ON storage.objects;
CREATE POLICY "company_assets_storage_select" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'company-assets'
    AND (storage.foldername(name))[1] = public.current_user_company_id()::text
  );

DROP POLICY IF EXISTS "company_assets_storage_insert" ON storage.objects;
CREATE POLICY "company_assets_storage_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'company-assets'
    AND (storage.foldername(name))[1] = public.current_user_company_id()::text
  );

DROP POLICY IF EXISTS "company_assets_storage_update" ON storage.objects;
CREATE POLICY "company_assets_storage_update" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'company-assets'
    AND (storage.foldername(name))[1] = public.current_user_company_id()::text
  );

DROP POLICY IF EXISTS "company_assets_storage_delete" ON storage.objects;
CREATE POLICY "company_assets_storage_delete" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'company-assets'
    AND (storage.foldername(name))[1] = public.current_user_company_id()::text
  );

-- ============================================================
-- company_branding_assets (R4.1, R4.3, R4.4)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.company_branding_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL
    REFERENCES public.companies(id) ON DELETE CASCADE,

  kind text NOT NULL
    CHECK (kind IN ('logo_primary', 'logo_alt', 'mood_board')),

  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL
    CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml')),
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  width integer,
  height integer,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_branding_assets_company_kind_idx
  ON public.company_branding_assets(company_id, kind);

-- Unique parcial: no maximo UM logo_primary e UM logo_alt por company.
-- mood_board nao tem unique (limite de 10 e enforced no client + RPC).
CREATE UNIQUE INDEX IF NOT EXISTS company_branding_assets_one_logo_primary_uidx
  ON public.company_branding_assets(company_id)
  WHERE kind = 'logo_primary';

CREATE UNIQUE INDEX IF NOT EXISTS company_branding_assets_one_logo_alt_uidx
  ON public.company_branding_assets(company_id)
  WHERE kind = 'logo_alt';

DROP TRIGGER IF EXISTS auto_set_company_id_company_branding_assets ON public.company_branding_assets;
CREATE TRIGGER auto_set_company_id_company_branding_assets
  BEFORE INSERT ON public.company_branding_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

ALTER TABLE public.company_branding_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_branding_assets_select" ON public.company_branding_assets;
CREATE POLICY "company_branding_assets_select" ON public.company_branding_assets
  FOR SELECT USING (company_id = public.current_user_company_id());

DROP POLICY IF EXISTS "company_branding_assets_insert" ON public.company_branding_assets;
CREATE POLICY "company_branding_assets_insert" ON public.company_branding_assets
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());

DROP POLICY IF EXISTS "company_branding_assets_update" ON public.company_branding_assets;
CREATE POLICY "company_branding_assets_update" ON public.company_branding_assets
  FOR UPDATE USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());

DROP POLICY IF EXISTS "company_branding_assets_delete" ON public.company_branding_assets;
CREATE POLICY "company_branding_assets_delete" ON public.company_branding_assets
  FOR DELETE USING (company_id = public.current_user_company_id());

COMMENT ON TABLE public.company_branding_assets IS
  'Metadata de assets visuais (logo principal, logo alternativa, mood board). Bytes vivem no bucket company-assets. Unique parcial garante exatamente um logo_primary e um logo_alt por company.';
