-- Migration: Knowledge Base RAG — auxiliares (chunks + logs + usage + HNSW + plans + bucket)
-- Spec: .kiro/specs/knowledge-base-rag/
-- Tasks: 1.2, 1.3, 1.4, 1.5, 1.6
--
-- Empacotadas em uma so migration por coesao logica:
--   - knowledge_chunks (vector(1536) + HNSW)
--   - knowledge_query_log (audit de buscas)
--   - knowledge_usage_monthly (agregado para billing/UI)
--   - ALTER plans com colunas de quota KB
--   - bucket Storage knowledge-base com policies
--
-- Seguranca: ADITIVO. Nenhuma tabela existente alterada destrutivamente.

-- ============================================================
-- knowledge_chunks (R4.1, R4.2, R4.3, R9.1)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL
    REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  -- company_id denormalizado p/ performance da busca semantica + RLS direta
  company_id uuid NOT NULL
    REFERENCES public.companies(id) ON DELETE CASCADE,

  chunk_index integer NOT NULL,
  page_number integer,
  chunk_text text NOT NULL,
  embedding vector(1536),

  -- Versao do modelo (permite reindex granular - R10.1)
  embedding_model_version text NOT NULL,

  token_count integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT knowledge_chunks_unique_per_doc UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS knowledge_chunks_document_idx
  ON public.knowledge_chunks(document_id, chunk_index);

CREATE INDEX IF NOT EXISTS knowledge_chunks_company_idx
  ON public.knowledge_chunks(company_id);

-- ============================================================
-- HNSW index para busca por cosseno (R5.6 — p95 < 350ms)
-- m=16, ef_construction=64 sao defaults sensatos para 1536d.
-- Sem CONCURRENTLY pois migration roda em transacao (table acabou de ser criada,
-- vazia — sem risco). Para re-create em prod use CONCURRENTLY.
-- ============================================================
CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_hnsw_idx
  ON public.knowledge_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- RLS: SELECT por company. INSERT/UPDATE/DELETE apenas via service_role
-- (Edge Functions kb-ingest / kb-reindex). Clients NAO escrevem chunks direto.
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "knowledge_chunks_select" ON public.knowledge_chunks;
CREATE POLICY "knowledge_chunks_select" ON public.knowledge_chunks
  FOR SELECT USING (company_id = public.current_user_company_id());

-- Sem policies de INSERT/UPDATE/DELETE para clientes.

COMMENT ON TABLE public.knowledge_chunks IS
  'N chunks por knowledge_document, com embedding vector(1536). HNSW cosine index para busca semantica. INSERT/UPDATE/DELETE apenas via service_role (Edge Fns kb-ingest/kb-reindex).';

-- ============================================================
-- knowledge_query_log (R5.5, R10.6)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.knowledge_query_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL
    REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Truncado a 200 chars para nao expor query crua em logs (R9.5)
  query_preview text,
  top_k integer NOT NULL,
  chunk_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  top_score real,
  duration_ms integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_query_log_company_created_idx
  ON public.knowledge_query_log(company_id, created_at DESC);

ALTER TABLE public.knowledge_query_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "knowledge_query_log_select" ON public.knowledge_query_log;
CREATE POLICY "knowledge_query_log_select" ON public.knowledge_query_log
  FOR SELECT USING (company_id = public.current_user_company_id());

-- Sem INSERT/UPDATE/DELETE policies para clientes — escrita via RPC search_knowledge.

COMMENT ON TABLE public.knowledge_query_log IS
  'Audit de buscas semanticas pela IA. INSERT acontece dentro da RPC search_knowledge. Cron kb-cleanup-logs apaga > 90 dias.';

-- ============================================================
-- knowledge_usage_monthly (R8.5)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.knowledge_usage_monthly (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL
    REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Sempre primeiro dia do mes (date_trunc('month', ...))
  month date NOT NULL,

  embeddings_tokens bigint NOT NULL DEFAULT 0,
  documents_count integer NOT NULL DEFAULT 0,
  storage_bytes bigint NOT NULL DEFAULT 0,

  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT knowledge_usage_monthly_unique UNIQUE (company_id, month)
);

CREATE INDEX IF NOT EXISTS knowledge_usage_monthly_company_month_idx
  ON public.knowledge_usage_monthly(company_id, month DESC);

ALTER TABLE public.knowledge_usage_monthly ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "knowledge_usage_monthly_select" ON public.knowledge_usage_monthly;
CREATE POLICY "knowledge_usage_monthly_select" ON public.knowledge_usage_monthly
  FOR SELECT USING (company_id = public.current_user_company_id());

-- Sem INSERT/UPDATE/DELETE policies — escrita via cron kb-rollup-monthly (service_role).

COMMENT ON TABLE public.knowledge_usage_monthly IS
  'Agregado mensal de uso (tokens embedados, documentos, bytes). Populado por cron kb-rollup-monthly a partir de agent_runs purpose=kb-embed e snapshot da tabela knowledge_documents.';

-- ============================================================
-- Quotas KB por plano de assinatura (R8.1)
--
-- Tabela de config dedicada (NAO confundir com public.plans, que e o sistema
-- de multi-step AI plans do sprint B2). O plano de assinatura vive em
-- organizations.plan ('free' | 'pro' | 'enterprise').
-- ============================================================
CREATE TABLE IF NOT EXISTS public.kb_plan_quotas (
  plan text PRIMARY KEY CHECK (plan IN ('free', 'pro', 'enterprise')),
  storage_bytes_max bigint NOT NULL,
  documents_max integer NOT NULL,
  embeddings_per_month_max bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.kb_plan_quotas (plan, storage_bytes_max, documents_max, embeddings_per_month_max)
VALUES
  ('free',       524288000,    100,   100000),     -- 500 MB / 100 docs / 100k tokens/mes
  ('pro',        5368709120,   1000,  1000000),    -- 5 GB / 1k docs / 1M tokens/mes
  ('enterprise', 53687091200,  10000, 10000000)    -- 50 GB / 10k docs / 10M tokens/mes
ON CONFLICT (plan) DO NOTHING;

-- Read publico via authenticated (config nao sensivel)
ALTER TABLE public.kb_plan_quotas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kb_plan_quotas_select_authenticated" ON public.kb_plan_quotas;
CREATE POLICY "kb_plan_quotas_select_authenticated" ON public.kb_plan_quotas
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE public.kb_plan_quotas IS
  'Config de quotas da knowledge-base por plano de assinatura. Plano vive em organizations.plan; esta tabela e o lookup de limites.';

-- ============================================================
-- Bucket Storage: knowledge-base (privado, R9.2 / R9.3)
-- Path convention: <company_id>/<document_id>.<ext>
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'knowledge-base',
  'knowledge-base',
  false,
  26214400,  -- 25 MB (R1.2)
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  -- docx
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',         -- xlsx
    'text/csv',
    'text/plain',
    'text/markdown',
    'application/json',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "knowledge_base_storage_select" ON storage.objects;
CREATE POLICY "knowledge_base_storage_select" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'knowledge-base'
    AND (storage.foldername(name))[1] = public.current_user_company_id()::text
  );

DROP POLICY IF EXISTS "knowledge_base_storage_insert" ON storage.objects;
CREATE POLICY "knowledge_base_storage_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'knowledge-base'
    AND (storage.foldername(name))[1] = public.current_user_company_id()::text
  );

DROP POLICY IF EXISTS "knowledge_base_storage_update" ON storage.objects;
CREATE POLICY "knowledge_base_storage_update" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'knowledge-base'
    AND (storage.foldername(name))[1] = public.current_user_company_id()::text
  );

DROP POLICY IF EXISTS "knowledge_base_storage_delete" ON storage.objects;
CREATE POLICY "knowledge_base_storage_delete" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'knowledge-base'
    AND (storage.foldername(name))[1] = public.current_user_company_id()::text
  );
