-- Migration: AI Creative Generation — creatives_generated (1 row por imagem)
-- Spec: .kiro/specs/ai-creative-generation/
-- Task: 1.1
--
-- Tabela central da geracao de criativos. 1 row por imagem gerada.
-- Bytes vivem em bucket privado generated-creatives. Cadeia de iteracao via
-- parent_creative_id. Auditoria completa: prompt, briefing snapshot, KB chunks
-- usados, modelo, custo, latencia, pHash para dedupe.
--
-- Seguranca: ADITIVO. Nenhuma tabela existente alterada. RLS por
-- current_user_company_id(). DELETE bloqueado (apenas via discard via UPDATE).

CREATE TABLE IF NOT EXISTS public.creatives_generated (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL
    REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Vinculos opcionais
  conversation_id uuid REFERENCES public.chat_conversations(id) ON DELETE SET NULL,
  parent_creative_id uuid REFERENCES public.creatives_generated(id) ON DELETE SET NULL,
  near_duplicate_of_id uuid REFERENCES public.creatives_generated(id) ON DELETE SET NULL,

  -- Agrupamento de adaptacoes multi-aspecto (mode='adapt')
  adaptation_set_id uuid,

  -- Idempotencia (R11.4)
  idempotency_key text UNIQUE,

  -- Conteudo da geracao
  prompt text NOT NULL,
  concept text NOT NULL,
  format text NOT NULL CHECK (format IN ('feed_1x1', 'story_9x16', 'reels_4x5')),
  model_used text NOT NULL CHECK (model_used IN ('gemini-2.5-flash-image', 'gpt-image-1')),
  provider_model_version text,

  -- Status
  status text NOT NULL DEFAULT 'generated'
    CHECK (status IN ('generated', 'approved', 'discarded', 'published')),

  -- Storage
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL CHECK (mime_type IN ('image/png', 'image/webp', 'image/jpeg')),
  width integer NOT NULL CHECK (width > 0),
  height integer NOT NULL CHECK (height > 0),

  -- Custo + perf (cobrado por imagem; agent_runs tem tracking agregado)
  cost_usd numeric(10, 6) NOT NULL DEFAULT 0,
  latency_ms integer,

  -- pHash dHash 64-bit -> hex 16 chars
  phash text NOT NULL CHECK (length(phash) = 16),
  is_near_duplicate boolean NOT NULL DEFAULT false,

  -- Compliance light pos-OCR (R10.5)
  compliance_warning boolean NOT NULL DEFAULT false,

  -- Sinaliza "pronto pro campaign-publish" (R7.4)
  ready_for_publish boolean NOT NULL DEFAULT false,

  -- Metadata user-facing
  title text,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  description text,

  -- Auditoria/reproducibilidade (R8.1)
  briefing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  kb_chunk_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indices
CREATE INDEX IF NOT EXISTS creatives_generated_company_created_idx
  ON public.creatives_generated(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS creatives_generated_company_status_idx
  ON public.creatives_generated(company_id, status);

CREATE INDEX IF NOT EXISTS creatives_generated_company_phash_idx
  ON public.creatives_generated(company_id, phash);

CREATE INDEX IF NOT EXISTS creatives_generated_parent_idx
  ON public.creatives_generated(parent_creative_id)
  WHERE parent_creative_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS creatives_generated_adaptation_set_idx
  ON public.creatives_generated(adaptation_set_id)
  WHERE adaptation_set_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS creatives_generated_tags_gin_idx
  ON public.creatives_generated USING GIN (tags);

CREATE INDEX IF NOT EXISTS creatives_generated_conversation_idx
  ON public.creatives_generated(conversation_id, created_at DESC)
  WHERE conversation_id IS NOT NULL;

-- Trigger updated_at automatico
CREATE OR REPLACE FUNCTION public.touch_creatives_generated_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_creatives_generated_updated_at ON public.creatives_generated;
CREATE TRIGGER touch_creatives_generated_updated_at
  BEFORE UPDATE ON public.creatives_generated
  FOR EACH ROW EXECUTE FUNCTION public.touch_creatives_generated_updated_at();

-- Auto-set company_id no insert (segue padrao do projeto)
DROP TRIGGER IF EXISTS auto_set_company_id_creatives_generated ON public.creatives_generated;
CREATE TRIGGER auto_set_company_id_creatives_generated
  BEFORE INSERT ON public.creatives_generated
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.creatives_generated ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer membro do tenant
DROP POLICY IF EXISTS "creatives_generated_select" ON public.creatives_generated;
CREATE POLICY "creatives_generated_select" ON public.creatives_generated
  FOR SELECT USING (company_id = public.current_user_company_id());

-- INSERT: tenant + role IN (owner, admin) — members nao geram (R9.4)
DROP POLICY IF EXISTS "creatives_generated_insert" ON public.creatives_generated;
CREATE POLICY "creatives_generated_insert" ON public.creatives_generated
  FOR INSERT WITH CHECK (
    company_id = public.current_user_company_id()
    AND public.current_user_role() IN ('owner', 'admin')
  );

-- UPDATE: tenant + role IN (owner, admin) — members nao aprovam/discartam
DROP POLICY IF EXISTS "creatives_generated_update" ON public.creatives_generated;
CREATE POLICY "creatives_generated_update" ON public.creatives_generated
  FOR UPDATE USING (
    company_id = public.current_user_company_id()
    AND public.current_user_role() IN ('owner', 'admin')
  )
  WITH CHECK (
    company_id = public.current_user_company_id()
  );

-- DELETE: bloqueado para clientes — discard via UPDATE status='discarded' (R8.1 audit)
-- (sem policy de DELETE significa: nenhum cliente pode deletar via PostgREST)

COMMENT ON TABLE public.creatives_generated IS
  'Criativos gerados por IA (Nano Banana / GPT-image). Bytes em bucket generated-creatives. Cadeia de iteracao via parent_creative_id; multi-aspecto via adaptation_set_id. DELETE bloqueado para auditoria — use status=discarded.';
