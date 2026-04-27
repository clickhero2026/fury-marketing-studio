-- Migration: Knowledge Base RAG — knowledge_documents (1 row por arquivo)
-- Spec: .kiro/specs/knowledge-base-rag/
-- Task: 1.1
--
-- Tabela 1:1 com cada documento da KB do cliente. Bytes vivem em bucket
-- knowledge-base (uploads diretos) OU chat-attachments (promocao do chat,
-- sem copiar bytes). Pipeline async marca status conforme processa.
--
-- Seguranca: ADITIVO. Reusa current_user_company_id() e set_company_id_on_insert.

-- Garante extension pgvector (idempotente — provavelmente ja habilitada via memories)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL
    REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Metadata user-facing
  title text NOT NULL,
  description text,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],

  -- Tipo do documento (afeta estrategia de extracao + chunking)
  type text NOT NULL CHECK (type IN (
    'pdf', 'docx', 'xlsx', 'csv', 'json', 'txt', 'md', 'image'
  )),

  -- Origem do conteudo
  source text NOT NULL CHECK (source IN ('upload', 'chat_attachment')),
  source_attachment_id uuid REFERENCES public.chat_attachments(id) ON DELETE SET NULL,

  -- Storage
  storage_bucket text NOT NULL CHECK (storage_bucket IN ('knowledge-base', 'chat-attachments')),
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 26214400),

  -- Estrutura
  page_count integer,

  -- Flag para boost na busca semantica
  is_source_of_truth boolean NOT NULL DEFAULT false,

  -- Pipeline status
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'extracting', 'embedding', 'indexed', 'failed')),
  status_error text,

  -- Versao do modelo de embeddings (preenchida ao concluir indexacao)
  embedding_model_version text,

  -- Texto bruto extraido (para reindex sem reprocessar arquivo — R3.6)
  extracted_text text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  indexed_at timestamptz,

  -- Invariants source vs storage_bucket (R9.5 / design data model)
  CONSTRAINT knowledge_documents_source_bucket_chk CHECK (
    (source = 'upload' AND storage_bucket = 'knowledge-base')
    OR
    (source = 'chat_attachment' AND storage_bucket = 'chat-attachments' AND source_attachment_id IS NOT NULL)
  )
);

-- Unique parcial: nao permite promover o mesmo anexo duas vezes (R2.5)
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_documents_unique_promotion_uidx
  ON public.knowledge_documents(company_id, source_attachment_id)
  WHERE source = 'chat_attachment' AND source_attachment_id IS NOT NULL;

-- Indices
CREATE INDEX IF NOT EXISTS knowledge_documents_company_status_idx
  ON public.knowledge_documents(company_id, status);

CREATE INDEX IF NOT EXISTS knowledge_documents_company_created_idx
  ON public.knowledge_documents(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS knowledge_documents_status_pending_idx
  ON public.knowledge_documents(status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS knowledge_documents_tags_gin_idx
  ON public.knowledge_documents USING GIN (tags);

-- Auto-updated_at
CREATE OR REPLACE FUNCTION public.touch_knowledge_documents_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_knowledge_documents_updated_at ON public.knowledge_documents;
CREATE TRIGGER touch_knowledge_documents_updated_at
  BEFORE UPDATE ON public.knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION public.touch_knowledge_documents_updated_at();

-- Auto-set company_id no insert (segue padrao do projeto)
DROP TRIGGER IF EXISTS auto_set_company_id_knowledge_documents ON public.knowledge_documents;
CREATE TRIGGER auto_set_company_id_knowledge_documents
  BEFORE INSERT ON public.knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- RLS
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "knowledge_documents_select" ON public.knowledge_documents;
CREATE POLICY "knowledge_documents_select" ON public.knowledge_documents
  FOR SELECT USING (company_id = public.current_user_company_id());

DROP POLICY IF EXISTS "knowledge_documents_insert" ON public.knowledge_documents;
CREATE POLICY "knowledge_documents_insert" ON public.knowledge_documents
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());

DROP POLICY IF EXISTS "knowledge_documents_update" ON public.knowledge_documents;
CREATE POLICY "knowledge_documents_update" ON public.knowledge_documents
  FOR UPDATE USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());

DROP POLICY IF EXISTS "knowledge_documents_delete" ON public.knowledge_documents;
CREATE POLICY "knowledge_documents_delete" ON public.knowledge_documents
  FOR DELETE USING (company_id = public.current_user_company_id());

COMMENT ON TABLE public.knowledge_documents IS
  'Banco de memoria longa do cliente: documentos arbitrarios indexados via embeddings. Bytes vivem em knowledge-base bucket OU chat-attachments (quando promovido do chat — sem copia). Pipeline async preenche extracted_text/status/indexed_at.';
