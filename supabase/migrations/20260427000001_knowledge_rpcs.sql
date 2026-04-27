-- Migration: Knowledge Base RAG — RPCs publicas
-- Spec: .kiro/specs/knowledge-base-rag/
-- Tasks: 2.1, 2.2
--
-- Implementa:
--   1. search_knowledge — busca semantica por cosseno com filtros, boost de
--      source-of-truth e log de query (R5.1-5.5).
--   2. get_knowledge_usage — uso atual vs quotas do plano da company (R8.1, R8.2, R8.4).
--
-- search_knowledge e SECURITY INVOKER (herda RLS).
-- log_knowledge_access e SECURITY DEFINER (insere em knowledge_query_log que nao
-- tem INSERT policy publica).

-- ============================================================
-- Helper: log_knowledge_access (escrita em knowledge_query_log)
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_knowledge_access(
  p_company_id uuid,
  p_query_preview text,
  p_top_k integer,
  p_chunk_ids uuid[],
  p_top_score real,
  p_duration_ms integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.knowledge_query_log (
    company_id, user_id, query_preview, top_k, chunk_ids, top_score, duration_ms
  )
  VALUES (
    p_company_id,
    auth.uid(),
    -- Garante truncate em 200 chars (R9.5)
    LEFT(COALESCE(p_query_preview, ''), 200),
    p_top_k,
    COALESCE(p_chunk_ids, ARRAY[]::uuid[]),
    p_top_score,
    GREATEST(0, p_duration_ms)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_knowledge_access(uuid, text, integer, uuid[], real, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.log_knowledge_access(uuid, text, integer, uuid[], real, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.log_knowledge_access IS
  'Helper interno chamado por search_knowledge para inserir audit. Truncate em 200 chars.';

-- ============================================================
-- RPC: search_knowledge
--
-- p_company_id: company alvo (RLS valida via SELECT em knowledge_chunks)
-- p_query_embedding: embedding da query (gerado pelo caller via OpenAI)
-- p_top_k: 1..20 (default 8)
-- p_filters: jsonb com keys opcionais:
--   { type: ['pdf','docx',...], tags: ['x','y'], is_source_of_truth: true|false }
-- p_query_preview: para audit (truncado em 200 chars)
-- p_boost_source_of_truth: bonus aplicado ao score (default 0.05)
-- ============================================================
CREATE OR REPLACE FUNCTION public.search_knowledge(
  p_company_id uuid,
  p_query_embedding vector(1536),
  p_top_k integer DEFAULT 8,
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_query_preview text DEFAULT NULL,
  p_boost_source_of_truth real DEFAULT 0.05
)
RETURNS TABLE (
  chunk_id uuid,
  document_id uuid,
  document_title text,
  document_type text,
  chunk_text text,
  chunk_index integer,
  page_number integer,
  score real,
  is_source_of_truth boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_started timestamptz := clock_timestamp();
  v_top_k integer;
  v_filter_types text[];
  v_filter_tags text[];
  v_filter_sot boolean;
  v_chunk_ids uuid[];
  v_top_score real;
  v_duration_ms integer;
BEGIN
  -- Validar top_k em [1, 20]
  v_top_k := GREATEST(1, LEAST(20, COALESCE(p_top_k, 8)));

  -- Extrair filtros
  v_filter_types := CASE
    WHEN p_filters ? 'type' AND jsonb_typeof(p_filters->'type') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_filters->'type'))
    ELSE NULL
  END;

  v_filter_tags := CASE
    WHEN p_filters ? 'tags' AND jsonb_typeof(p_filters->'tags') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_filters->'tags'))
    ELSE NULL
  END;

  v_filter_sot := CASE
    WHEN p_filters ? 'is_source_of_truth' AND jsonb_typeof(p_filters->'is_source_of_truth') = 'boolean'
      THEN (p_filters->>'is_source_of_truth')::boolean
    ELSE NULL
  END;

  -- Busca + boost (RLS aplica naturalmente: cross-tenant retorna 0 rows)
  RETURN QUERY
  WITH ranked AS (
    SELECT
      kc.id AS chunk_id,
      kc.document_id,
      kd.title AS document_title,
      kd.type AS document_type,
      kc.chunk_text,
      kc.chunk_index,
      kc.page_number,
      -- score = 1 - cosine_distance + boost se source_of_truth
      ((1 - (kc.embedding <=> p_query_embedding))::real
        + (CASE WHEN kd.is_source_of_truth THEN p_boost_source_of_truth ELSE 0 END))::real AS score,
      kd.is_source_of_truth
    FROM public.knowledge_chunks kc
    INNER JOIN public.knowledge_documents kd ON kd.id = kc.document_id
    WHERE kc.company_id = p_company_id
      AND kd.status = 'indexed'
      AND (v_filter_types IS NULL OR kd.type = ANY(v_filter_types))
      AND (v_filter_tags IS NULL OR kd.tags && v_filter_tags)
      AND (v_filter_sot IS NULL OR kd.is_source_of_truth = v_filter_sot)
      AND kc.embedding IS NOT NULL
    ORDER BY kc.embedding <=> p_query_embedding
    LIMIT v_top_k
  )
  SELECT * FROM ranked;

  -- Audit log: pega ids/score/duration apos retornar
  -- (executa em segundo momento: PERFORM em CTE seria mais limpo, mas exigiria
  --  RETURN apenas no fim — RETURN QUERY ja escreveu, agora podemos auditar)
  GET DIAGNOSTICS v_duration_ms = ROW_COUNT;  -- nao e rowcount real, recomputa abaixo

  v_duration_ms := EXTRACT(MILLISECONDS FROM clock_timestamp() - v_started)::integer;

  -- Recoleta ids/score com mesma logica para audit (custo extra mas garante log preciso).
  WITH a AS (
    SELECT
      kc.id AS chunk_id,
      ((1 - (kc.embedding <=> p_query_embedding))::real
        + (CASE WHEN kd.is_source_of_truth THEN p_boost_source_of_truth ELSE 0 END))::real AS sc
    FROM public.knowledge_chunks kc
    INNER JOIN public.knowledge_documents kd ON kd.id = kc.document_id
    WHERE kc.company_id = p_company_id
      AND kd.status = 'indexed'
      AND (v_filter_types IS NULL OR kd.type = ANY(v_filter_types))
      AND (v_filter_tags IS NULL OR kd.tags && v_filter_tags)
      AND (v_filter_sot IS NULL OR kd.is_source_of_truth = v_filter_sot)
      AND kc.embedding IS NOT NULL
    ORDER BY kc.embedding <=> p_query_embedding
    LIMIT v_top_k
  )
  SELECT array_agg(chunk_id), max(sc)
    INTO v_chunk_ids, v_top_score
    FROM a;

  PERFORM public.log_knowledge_access(
    p_company_id,
    p_query_preview,
    v_top_k,
    v_chunk_ids,
    v_top_score,
    v_duration_ms
  );
END;
$$;

REVOKE ALL ON FUNCTION public.search_knowledge(uuid, vector, integer, jsonb, text, real) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.search_knowledge(uuid, vector, integer, jsonb, text, real) TO authenticated, service_role;

COMMENT ON FUNCTION public.search_knowledge IS
  'Busca semantica em knowledge_chunks por cosseno. Boost de is_source_of_truth (+0.05 default). Filtros opcionais (type, tags, is_source_of_truth). Audit em knowledge_query_log. SECURITY INVOKER — RLS bloqueia cross-tenant.';

-- ============================================================
-- RPC: get_knowledge_usage
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_knowledge_usage(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_storage_bytes bigint;
  v_documents_count integer;
  v_embeddings_tokens bigint;
  v_storage_max bigint;
  v_documents_max integer;
  v_embeddings_max bigint;
  v_warning text[] := ARRAY[]::text[];
  v_blocked text[] := ARRAY[]::text[];
  v_status text;
  v_month_start timestamptz := date_trunc('month', now());
BEGIN
  -- Validacao implicita via RLS: se company nao for do user, SELECTs retornam 0 rows.
  -- Storage total (excluindo promocoes do chat — ja contam no chat-attachments)
  SELECT
    COALESCE(SUM(CASE WHEN source = 'upload' THEN size_bytes ELSE 0 END), 0),
    COUNT(*)::int
    INTO v_storage_bytes, v_documents_count
    FROM public.knowledge_documents
   WHERE company_id = p_company_id;

  -- Embeddings tokens do mes corrente via agent_runs (agent_name='kb-embed')
  SELECT COALESCE(SUM(total_tokens), 0)
    INTO v_embeddings_tokens
    FROM public.agent_runs
   WHERE company_id = p_company_id
     AND agent_name = 'kb-embed'
     AND started_at >= v_month_start;

  -- Quotas a partir do plano de assinatura da organization (nao confundir com tabela public.plans!)
  SELECT
    q.storage_bytes_max,
    q.documents_max,
    q.embeddings_per_month_max
    INTO v_storage_max, v_documents_max, v_embeddings_max
    FROM public.kb_plan_quotas q
    INNER JOIN public.organizations o ON o.plan = q.plan
    INNER JOIN public.companies c ON c.organization_id = o.id
   WHERE c.id = p_company_id
   LIMIT 1;

  -- Se sem plano definido, aplicar fallback conservador (free)
  v_storage_max := COALESCE(v_storage_max, 524288000);
  v_documents_max := COALESCE(v_documents_max, 100);
  v_embeddings_max := COALESCE(v_embeddings_max, 100000);

  -- Calcular warning/blocked por dimensao
  IF v_storage_bytes >= v_storage_max THEN
    v_blocked := array_append(v_blocked, 'storage');
  ELSIF v_storage_bytes >= (v_storage_max * 0.8)::bigint THEN
    v_warning := array_append(v_warning, 'storage');
  END IF;

  IF v_documents_count >= v_documents_max THEN
    v_blocked := array_append(v_blocked, 'documents');
  ELSIF v_documents_count >= (v_documents_max * 0.8)::int THEN
    v_warning := array_append(v_warning, 'documents');
  END IF;

  IF v_embeddings_tokens >= v_embeddings_max THEN
    v_blocked := array_append(v_blocked, 'embeddings');
  ELSIF v_embeddings_tokens >= (v_embeddings_max * 0.8)::bigint THEN
    v_warning := array_append(v_warning, 'embeddings');
  END IF;

  v_status := CASE
    WHEN array_length(v_blocked, 1) > 0 THEN 'blocked'
    WHEN array_length(v_warning, 1) > 0 THEN 'warning'
    ELSE 'ok'
  END;

  RETURN jsonb_build_object(
    'storage', jsonb_build_object('bytes', v_storage_bytes, 'max', v_storage_max),
    'documents', jsonb_build_object('count', v_documents_count, 'max', v_documents_max),
    'embeddings_this_month', jsonb_build_object('tokens', v_embeddings_tokens, 'max', v_embeddings_max),
    'status', v_status,
    'warning_dimensions', to_jsonb(v_warning),
    'blocked_dimensions', to_jsonb(v_blocked)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_knowledge_usage(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_knowledge_usage(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_knowledge_usage IS
  'Uso atual da KB vs quotas do plano. Retorna jsonb com storage/documents/embeddings + status (ok|warning|blocked) + dimensoes em warning/blocked.';
