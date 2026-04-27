-- Migration: Chat Multimodal — Anexos no Chat
-- Spec: .kiro/specs/chat-multimodal/
--
-- Tabela chat_attachments armazena metadata de anexos enviados no chat:
--   - imagens (png/jpeg/webp/gif): processadas via GPT-4o vision
--   - documentos (pdf/txt/csv/md/json): texto extraido via Edge Function extract-attachment-text
--
-- Bucket Storage chat-attachments armazena os bytes (privado, RLS por company_id no path).

CREATE TABLE IF NOT EXISTS public.chat_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Vinculos
  message_id uuid REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  uploader_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Identificacao do anexo
  kind text NOT NULL CHECK (kind IN ('image', 'document')),
  mime_type text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  original_filename text,
  size_bytes integer NOT NULL,

  -- Metadata de imagem
  width integer,
  height integer,

  -- Extracao de texto (apenas documentos)
  extracted_text text,
  extraction_status text NOT NULL DEFAULT 'pending'
    CHECK (extraction_status IN ('pending', 'done', 'failed', 'skipped')),
  extraction_error text,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indices
CREATE INDEX IF NOT EXISTS chat_attachments_message_idx
  ON public.chat_attachments(message_id);

CREATE INDEX IF NOT EXISTS chat_attachments_conversation_idx
  ON public.chat_attachments(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_attachments_company_idx
  ON public.chat_attachments(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_attachments_extraction_pending_idx
  ON public.chat_attachments(extraction_status)
  WHERE extraction_status = 'pending';

-- Auto-set company_id no insert (segue padrao do projeto)
DROP TRIGGER IF EXISTS auto_set_company_id_chat_attachments ON public.chat_attachments;
CREATE TRIGGER auto_set_company_id_chat_attachments
  BEFORE INSERT ON public.chat_attachments
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- RLS
ALTER TABLE public.chat_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_attachments_select" ON public.chat_attachments;
CREATE POLICY "chat_attachments_select" ON public.chat_attachments
  FOR SELECT USING (company_id = public.current_user_company_id());

DROP POLICY IF EXISTS "chat_attachments_insert" ON public.chat_attachments;
CREATE POLICY "chat_attachments_insert" ON public.chat_attachments
  FOR INSERT WITH CHECK (company_id = public.current_user_company_id());

DROP POLICY IF EXISTS "chat_attachments_update" ON public.chat_attachments;
CREATE POLICY "chat_attachments_update" ON public.chat_attachments
  FOR UPDATE USING (company_id = public.current_user_company_id());

DROP POLICY IF EXISTS "chat_attachments_delete" ON public.chat_attachments;
CREATE POLICY "chat_attachments_delete" ON public.chat_attachments
  FOR DELETE USING (company_id = public.current_user_company_id());

-- ============================================================
-- Storage bucket: chat-attachments (privado)
-- Path convention: <company_id>/<conversation_id>/<uuid>.<ext>
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-attachments',
  'chat-attachments',
  false,
  20971520,  -- 20 MB
  ARRAY[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'application/pdf', 'text/plain', 'text/csv', 'text/markdown', 'application/json'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage policies: o primeiro segmento do path deve ser company_id do usuario.
-- (storage.foldername(name) retorna array de segmentos do path.)

DROP POLICY IF EXISTS "chat_attachments_storage_select" ON storage.objects;
CREATE POLICY "chat_attachments_storage_select" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = public.current_user_company_id()::text
  );

DROP POLICY IF EXISTS "chat_attachments_storage_insert" ON storage.objects;
CREATE POLICY "chat_attachments_storage_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = public.current_user_company_id()::text
  );

DROP POLICY IF EXISTS "chat_attachments_storage_update" ON storage.objects;
CREATE POLICY "chat_attachments_storage_update" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = public.current_user_company_id()::text
  );

DROP POLICY IF EXISTS "chat_attachments_storage_delete" ON storage.objects;
CREATE POLICY "chat_attachments_storage_delete" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = public.current_user_company_id()::text
  );

COMMENT ON TABLE public.chat_attachments IS 'Anexos enviados no chat (imagens, documentos). Bytes vivem no bucket Storage chat-attachments. Documentos tem texto extraido por Edge Function extract-attachment-text.';
