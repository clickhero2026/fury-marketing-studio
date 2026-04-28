-- Migration: Fury Learning Fase 6 — pipeline columns em creatives_generated
-- Spec: fury-learning Fase 6
--
-- Adiciona suporte a auto-trigger de apply-creative-pipeline em criativos
-- gerados pela IA. Mesmas colunas ja presentes em creatives (Meta-synced).

ALTER TABLE public.creatives_generated
  ADD COLUMN IF NOT EXISTS pipeline_applied_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pipeline_source_path text,
  ADD COLUMN IF NOT EXISTS pipeline_status text NOT NULL DEFAULT 'idle'
    CHECK (pipeline_status IN ('idle', 'pending', 'applying', 'applied', 'skipped', 'failed')),
  ADD COLUMN IF NOT EXISTS pipeline_error text;

CREATE INDEX IF NOT EXISTS creatives_generated_pipeline_status_idx
  ON public.creatives_generated(company_id, pipeline_status);

COMMENT ON COLUMN public.creatives_generated.pipeline_applied_rules IS
  'Array de uuids de creative_pipeline_rules aplicados. Vazio = nenhum.';
COMMENT ON COLUMN public.creatives_generated.pipeline_source_path IS
  'storage_path original ANTES das transformacoes. Permite revert.';
COMMENT ON COLUMN public.creatives_generated.pipeline_status IS
  'Status do pipeline: idle (nunca rodou), pending (na fila), applying (rodando), applied (sucesso), skipped (sem regras), failed (erro).';
