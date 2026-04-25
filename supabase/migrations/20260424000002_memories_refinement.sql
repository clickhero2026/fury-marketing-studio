-- Migration: Profiler refinement (Sprint A3)
-- Spec: .kiro/specs/multi-agent-foundation/
--
-- Adiciona ao memories:
--   - confidence: 0..1 (proxy de qualidade do fato extraido)
--   - source: 'observed' (default) | 'declared' | 'inferred'
--   - superseded_by: aponta para memory que substituiu esta (chain)
--   - evidence_message_ids: uuid[] das messages que originaram o fato

ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS confidence numeric(3,2) NOT NULL DEFAULT 1.00
    CHECK (confidence BETWEEN 0 AND 1);

ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'observed'
    CHECK (source IN ('observed','declared','inferred'));

ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS superseded_by uuid
    REFERENCES public.memories(id) ON DELETE SET NULL;

ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS evidence_message_ids uuid[];

CREATE INDEX IF NOT EXISTS memories_active_chain_idx
  ON public.memories(user_id, importance DESC)
  WHERE superseded_by IS NULL AND (is_active IS NULL OR is_active = true);

CREATE INDEX IF NOT EXISTS memories_superseded_by_idx
  ON public.memories(superseded_by)
  WHERE superseded_by IS NOT NULL;

COMMENT ON COLUMN public.memories.confidence IS 'Confianca da memoria (0..1). Proxy de qualidade do fato extraido.';
COMMENT ON COLUMN public.memories.source IS 'observed (extraido de comportamento), declared (usuario disse), inferred (deduzido pelo LLM).';
COMMENT ON COLUMN public.memories.superseded_by IS 'Aponta para a memoria que substituiu esta. NULL = ainda eh a versao corrente.';
COMMENT ON COLUMN public.memories.evidence_message_ids IS 'IDs das chat_messages que originaram este fato. Util para auditoria.';
