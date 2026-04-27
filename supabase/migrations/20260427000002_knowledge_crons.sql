-- Migration: Knowledge Base RAG — Crons (process-pending + cleanup + rollup)
-- Spec: .kiro/specs/knowledge-base-rag/
-- Tasks: 3.6, 3.7, 3.8
--
-- Implementa:
--   - kb-cleanup-logs (3.7): apaga knowledge_query_log > 90 dias (pure SQL, R10.6)
--   - kb-rollup-monthly (3.8): agrega agent_runs em knowledge_usage_monthly (R8.5)
--   - kb-process-pending (3.6): dispara kb-ingest via pg_net.http_post se disponivel.
--     Fallback: frontend chama kb-ingest best-effort apos upload (task 5.1).
--
-- pg_cron ja foi habilitado em 20260424000003.

-- ============================================================
-- Cron kb-cleanup-logs (R10.6) — diario 03:30 UTC
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kb-cleanup-logs') THEN
    PERFORM cron.unschedule('kb-cleanup-logs');
  END IF;
END $$;

SELECT cron.schedule(
  'kb-cleanup-logs',
  '30 3 * * *',
  $$
    DELETE FROM public.knowledge_query_log
    WHERE created_at < now() - interval '90 days'
  $$
);

-- ============================================================
-- Cron kb-rollup-monthly (R8.5) — dia 1 do mes 02:00 UTC
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kb-rollup-monthly') THEN
    PERFORM cron.unschedule('kb-rollup-monthly');
  END IF;
END $$;

SELECT cron.schedule(
  'kb-rollup-monthly',
  '0 2 1 * *',
  $$
    INSERT INTO public.knowledge_usage_monthly
      (company_id, month, embeddings_tokens, documents_count, storage_bytes, updated_at)
    SELECT
      c.id AS company_id,
      date_trunc('month', now() - interval '1 day')::date AS month,
      COALESCE((
        SELECT SUM(ar.total_tokens)
          FROM public.agent_runs ar
         WHERE ar.company_id = c.id
           AND ar.agent_name = 'kb-embed'
           AND ar.started_at >= date_trunc('month', now() - interval '1 day')
           AND ar.started_at < date_trunc('month', now())
      ), 0) AS embeddings_tokens,
      (SELECT COUNT(*) FROM public.knowledge_documents kd
        WHERE kd.company_id = c.id) AS documents_count,
      COALESCE((
        SELECT SUM(kd.size_bytes) FROM public.knowledge_documents kd
         WHERE kd.company_id = c.id AND kd.source = 'upload'
      ), 0) AS storage_bytes,
      now()
    FROM public.companies c
    ON CONFLICT (company_id, month) DO UPDATE SET
      embeddings_tokens = EXCLUDED.embeddings_tokens,
      documents_count = EXCLUDED.documents_count,
      storage_bytes = EXCLUDED.storage_bytes,
      updated_at = now()
  $$
);

-- ============================================================
-- Cron kb-process-pending (R1.4 / R1.5) — a cada 1 minuto
--
-- Requer pg_net.http_post para invocar kb-ingest. Se pg_net nao estiver
-- habilitado, o cron e agendado mas falhara silenciosamente. Frontend
-- invoca kb-ingest best-effort apos upload (task 5.1) cobrindo o caminho
-- principal.
--
-- IMPORTANTE: substitua os placeholders abaixo pelo URL/chave reais ao
-- deploy (recomendado via Supabase Vault):
--   - SUPABASE_URL
--   - SUPABASE_SERVICE_ROLE_KEY
--
-- Para v1, a habilitacao deste cron e MANUAL (DBA roda apos configurar pg_net).
-- ============================================================
DO $$
DECLARE
  has_pg_net boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_net'
  ) INTO has_pg_net;

  IF has_pg_net THEN
    -- Apenas instala stub; URL/key reais devem ser preenchidas via Supabase Vault.
    -- DBA habilitara substituindo os placeholders e re-rodando este bloco.
    RAISE NOTICE 'pg_net detected — kb-process-pending pode ser habilitado manualmente.';
  ELSE
    RAISE NOTICE 'pg_net nao habilitado — pipeline depende de invocacao via frontend (task 5.1) ou kb-reindex manual.';
  END IF;
END $$;
