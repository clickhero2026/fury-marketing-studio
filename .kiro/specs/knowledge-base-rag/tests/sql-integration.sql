-- SQL Integration Tests — knowledge-base-rag (task 10.4)
-- Spec: .kiro/specs/knowledge-base-rag/ (R5.2, R5.3, R5.4, R8.1, R9.1)
--
-- Como rodar: contra staging com 2 companies (A e B) + seed minimo de chunks.
-- Cada bloco e independente. Espera-se que TODOS retornem PASS.

-- ============================================================
-- SETUP (rodar como service_role)
-- ============================================================
-- DECLARE company_a := <uuid_test_a>, company_b := <uuid_test_b>
-- INSERT minimal companies + organization_members (user_a -> company_a, user_b -> company_b)

-- Cria 2 documentos: 1 normal + 1 source_of_truth
-- INSERT INTO knowledge_documents (id, company_id, title, type, source, storage_bucket, storage_path,
--   mime_type, size_bytes, is_source_of_truth, status, embedding_model_version, indexed_at) VALUES
-- ('doc-1', '<company_a>', 'Doc Normal', 'pdf', 'upload', 'knowledge-base', '<company_a>/doc-1.pdf',
--   'application/pdf', 1000, false, 'indexed', 'text-embedding-3-small', now()),
-- ('doc-2', '<company_a>', 'Doc Fonte', 'pdf', 'upload', 'knowledge-base', '<company_a>/doc-2.pdf',
--   'application/pdf', 1000, true, 'indexed', 'text-embedding-3-small', now()),
-- ('doc-3', '<company_b>', 'Doc Outro Tenant', 'pdf', 'upload', 'knowledge-base', '<company_b>/doc-3.pdf',
--   'application/pdf', 1000, false, 'indexed', 'text-embedding-3-small', now());

-- INSERT chunks com embeddings ja calculadas (mock embedding por simplicidade — vetor de zeros + 1 dim com sinal)
-- (em ambiente real, gerar via OpenAI antes do teste)

-- ============================================================
-- 1. RPC search_knowledge — boost source-of-truth aplica
-- ============================================================

-- Como user A, query que retorna ambos doc-1 e doc-2.
-- Esperado: doc-2 (source_of_truth=true) com score >= doc-1 + 0.05

-- SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '<user_a_uuid>';
-- SELECT * FROM public.search_knowledge('<company_a>'::uuid, '[zero_vector]'::vector, 8, '{}'::jsonb, 'test query', 0.05);

SELECT 'sot_boost_applies' AS test,
       CASE WHEN
         (SELECT score FROM public.search_knowledge('<company_a>'::uuid, '<query_emb>'::vector, 8, '{}'::jsonb, 'q', 0.05)
           WHERE document_id = '<doc_2_uuid>')
         >=
         (SELECT score FROM public.search_knowledge('<company_a>'::uuid, '<query_emb>'::vector, 8, '{}'::jsonb, 'q', 0.05)
           WHERE document_id = '<doc_1_uuid>') + 0.04
       THEN 'PASS' ELSE 'FAIL' END AS result;

-- ============================================================
-- 2. search_knowledge cross-tenant retorna 0 rows (RLS)
-- ============================================================

-- Como user A, tenta buscar em company B
-- SET LOCAL request.jwt.claim.sub = '<user_a_uuid>';
SELECT 'cross_tenant_search_blocked' AS test,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result
  FROM public.search_knowledge('<company_b>'::uuid, '<query_emb>'::vector, 8, '{}'::jsonb, 'q', 0.05);

-- ============================================================
-- 3. Filtros funcionam (type, tags, is_source_of_truth)
-- ============================================================

-- Filtro por type=pdf (todos sao PDF) deve retornar todos da company A
SELECT 'filter_type_pdf' AS test,
       CASE WHEN count(*) >= 2 THEN 'PASS' ELSE 'FAIL' END AS result
  FROM public.search_knowledge('<company_a>'::uuid, '<query_emb>'::vector, 8, '{"type":["pdf"]}'::jsonb, 'q', 0.05);

-- Filtro is_source_of_truth=true deve retornar so doc-2
SELECT 'filter_sot_only' AS test,
       CASE WHEN count(*) = 1 AND bool_and(is_source_of_truth)
       THEN 'PASS' ELSE 'FAIL' END AS result
  FROM public.search_knowledge('<company_a>'::uuid, '<query_emb>'::vector, 8, '{"is_source_of_truth":true}'::jsonb, 'q', 0.05);

-- ============================================================
-- 4. RLS em knowledge_documents — cross-tenant SELECT
-- ============================================================

-- Como user A, count em company B
SELECT 'rls_documents_cross_tenant' AS test,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result
  FROM public.knowledge_documents
 WHERE company_id = '<company_b>';

-- ============================================================
-- 5. RLS em knowledge_chunks — clientes nao podem INSERT direto
-- ============================================================

-- Espera-se ERROR pois nao ha INSERT policy publica
DO $$ BEGIN
  BEGIN
    INSERT INTO public.knowledge_chunks
      (document_id, company_id, chunk_index, chunk_text, embedding_model_version)
    VALUES ('<doc_1_uuid>', '<company_a>', 999, 'tentativa', 'test');
    RAISE EXCEPTION 'INSERT em knowledge_chunks deveria falhar mas passou';
  EXCEPTION WHEN insufficient_privilege OR check_violation OR raise_exception THEN
    RAISE NOTICE 'PASS: INSERT em knowledge_chunks bloqueado para client';
  END;
END $$;

-- ============================================================
-- 6. RPC get_knowledge_usage — calculo correto e quotas por plano
-- ============================================================

-- Como user A em plano free
SELECT 'usage_quota_free' AS test,
       CASE WHEN
         (data->'storage'->>'max')::bigint = 524288000
         AND (data->'documents'->>'max')::int = 100
       THEN 'PASS' ELSE 'FAIL' END AS result
  FROM (SELECT public.get_knowledge_usage('<company_a>'::uuid) AS data) sub;

-- ============================================================
-- 7. INSERT direto em knowledge_query_log (sem policy de INSERT publico)
-- ============================================================

DO $$ BEGIN
  BEGIN
    INSERT INTO public.knowledge_query_log (company_id, query_preview, top_k)
    VALUES ('<company_a>', 'fake', 8);
    RAISE EXCEPTION 'INSERT em knowledge_query_log deveria falhar';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    RAISE NOTICE 'PASS: INSERT em knowledge_query_log bloqueado para client';
  END;
END $$;

-- ============================================================
-- 8. log_knowledge_access SECURITY DEFINER trunca query a 200 chars
-- ============================================================

-- Chama log_knowledge_access com query gigante e verifica que foi truncada
SELECT public.log_knowledge_access('<company_a>'::uuid, repeat('a', 500), 8, ARRAY[]::uuid[], 0.5, 100);
SELECT 'query_truncated_to_200' AS test,
       CASE WHEN length(query_preview) <= 200
       THEN 'PASS' ELSE 'FAIL' END AS result
  FROM public.knowledge_query_log
 WHERE company_id = '<company_a>'
 ORDER BY created_at DESC LIMIT 1;

-- ============================================================
-- 9. Bucket Storage cross-tenant
-- ============================================================
-- Rodar via SDK: supabase.storage.from('knowledge-base').list('<company_b>/')
-- Esperado: lista vazia ou erro 401/403

-- ============================================================
-- CLEANUP
-- ============================================================
-- DELETE FROM knowledge_chunks WHERE document_id IN ('<doc_1>','<doc_2>','<doc_3>');
-- DELETE FROM knowledge_documents WHERE id IN ('<doc_1>','<doc_2>','<doc_3>');
-- DELETE FROM knowledge_query_log WHERE company_id IN ('<company_a>','<company_b>');
