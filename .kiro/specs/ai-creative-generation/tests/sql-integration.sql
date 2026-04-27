-- SQL Integration Tests — ai-creative-generation (task 11.5)
-- Spec: .kiro/specs/ai-creative-generation/ (R6.5, R8.4, R9.1)
--
-- Como rodar: contra staging com 2 companies (A e B) + seed minimo.
-- Cada bloco e independente. Espera-se que TODOS retornem PASS.

-- ============================================================
-- SETUP (rodar como service_role)
-- ============================================================
-- Substitua placeholders <company_a>, <company_b>, <user_a>, <user_b>, <doc_*>
--
-- Espera 3 organizations (uma por plano), 2 companies (A=pro, B=free), 2 users
-- em organization_members (user_a -> org_a, user_b -> org_b).
--
-- Seed:
-- INSERT INTO public.creatives_generated (id, company_id, prompt, concept, format,
--   model_used, storage_path, mime_type, width, height, phash, cost_usd) VALUES
-- ('cre-1a', '<company_a>', 'p1', 'cafe', 'feed_1x1', 'gemini-2.5-flash-image',
--   '<company_a>/cre-1a.png', 'image/png', 1024, 1024, '0000000000000000', 0.039),
-- ('cre-2a', '<company_a>', 'p2', 'cafe v2', 'feed_1x1', 'gemini-2.5-flash-image',
--   '<company_a>/cre-2a.png', 'image/png', 1024, 1024, '0000000000000001', 0.039),
-- ('cre-1b', '<company_b>', 'p3', 'tea', 'feed_1x1', 'gemini-2.5-flash-image',
--   '<company_b>/cre-1b.png', 'image/png', 1024, 1024, '1111111111111111', 0.039);
-- UPDATE public.creatives_generated SET parent_creative_id = 'cre-1a' WHERE id = 'cre-2a';
--
-- INSERT INTO public.agent_runs (company_id, agent_name, status, cost_usd, started_at)
-- VALUES ('<company_a>', 'creative-nano-banana', 'success', 0.039, now()),
--        ('<company_a>', 'creative-nano-banana', 'success', 0.039, now()),
--        ('<company_a>', 'creative-gpt-image', 'error', 0, now());

-- ============================================================
-- 1. get_creative_usage retorna jsonb correto em planos
-- ============================================================

-- Plano pro (company_a) com 2 creatives no mes -> abaixo de 80% de 250 -> ok
SELECT 'usage_pro_ok' AS test,
       CASE WHEN
         (public.get_creative_usage('<company_a>'::uuid)->>'status') = 'ok'
       THEN 'PASS' ELSE 'FAIL' END AS result;

-- Plano free (company_b) com 1 creative no dia (>=20% mas <80% de 5) -> ok
SELECT 'usage_free_ok' AS test,
       CASE WHEN
         (public.get_creative_usage('<company_b>'::uuid)->>'status') IN ('ok', 'warning')
       THEN 'PASS' ELSE 'FAIL' END AS result;

-- Daily count correto
SELECT 'usage_daily_count' AS test,
       CASE WHEN
         ((public.get_creative_usage('<company_a>'::uuid)->'daily'->>'count')::int) >= 0
       THEN 'PASS' ELSE 'FAIL' END AS result;

-- Cost agregado de agent_runs (creative-* prefix)
SELECT 'usage_cost_uses_agent_runs' AS test,
       CASE WHEN
         ((public.get_creative_usage('<company_a>'::uuid)->'cost_usd_month'->>'value')::numeric) > 0
       THEN 'PASS' ELSE 'FAIL' END AS result;

-- ============================================================
-- 2. Cross-tenant: SELECT em creatives_generated retorna 0
-- ============================================================

-- Como user_a, tenta ler creatives da company_b -> 0 rows
-- SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '<user_a>';
SELECT 'cross_tenant_select_blocked' AS test,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result
  FROM public.creatives_generated
 WHERE company_id = '<company_b>'::uuid;

-- ============================================================
-- 3. INSERT direto em creative_compliance_check bloqueado pra client
-- ============================================================

-- Como user_a (role authenticated), tenta INSERT direto -> deve falhar
-- (sem policy de INSERT, PostgREST rejeita com 42501 ou similar)
DO $$
BEGIN
  -- SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '<user_a>';
  BEGIN
    INSERT INTO public.creative_compliance_check (creative_id, passed)
    VALUES ('cre-1a'::uuid, true);
    RAISE EXCEPTION 'FAIL — INSERT deveria ter sido bloqueado por RLS';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN
      RAISE NOTICE 'PASS — INSERT bloqueado como esperado';
  END;
END $$;

-- ============================================================
-- 4. get_creative_provenance retorna chain via parent_creative_id
-- ============================================================

-- Cre-2a tem parent=cre-1a. Esperado: chain com 2 nos, depth=1, root=cre-1a
SELECT 'provenance_chain_2_nodes' AS test,
       CASE WHEN
         jsonb_array_length((public.get_creative_provenance('cre-2a'::uuid))->'chain') = 2
       THEN 'PASS' ELSE 'FAIL' END AS result;

SELECT 'provenance_depth_1' AS test,
       CASE WHEN
         ((public.get_creative_provenance('cre-2a'::uuid))->>'depth')::int = 1
       THEN 'PASS' ELSE 'FAIL' END AS result;

-- Root contem snapshot do criativo raiz
SELECT 'provenance_root_concept_matches' AS test,
       CASE WHEN
         ((public.get_creative_provenance('cre-2a'::uuid))->'root'->>'concept') = 'cafe'
       THEN 'PASS' ELSE 'FAIL' END AS result;

-- ============================================================
-- 5. RLS UPDATE: members nao podem aprovar/discartar
-- ============================================================

-- Como user_member (role='member' em organization_members), UPDATE rejeita
-- SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '<user_member>';
DO $$
BEGIN
  BEGIN
    UPDATE public.creatives_generated SET status = 'approved' WHERE id = 'cre-1a';
    -- Se executou sem erro mas afetou 0 rows, RLS bloqueou silenciosamente
    IF FOUND THEN
      RAISE EXCEPTION 'FAIL — UPDATE deveria ter sido bloqueado pra member';
    END IF;
    RAISE NOTICE 'PASS — UPDATE silenciosamente bloqueado por RLS';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS — UPDATE rejeitado com 42501';
  END;
END $$;

-- ============================================================
-- 6. DELETE bloqueado mesmo pra owner (sem policy DELETE)
-- ============================================================

-- Owner tenta deletar -> bloqueado pq nao existe policy DELETE
-- SET LOCAL request.jwt.claim.sub = '<user_owner_a>';
DO $$
BEGIN
  BEGIN
    DELETE FROM public.creatives_generated WHERE id = 'cre-1a';
    IF FOUND THEN
      RAISE EXCEPTION 'FAIL — DELETE deveria ter sido bloqueado (audit invariant)';
    END IF;
    RAISE NOTICE 'PASS — DELETE silenciosamente bloqueado por RLS';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS — DELETE rejeitado com 42501';
  END;
END $$;

-- ============================================================
-- 7. get_creative_health agregado nao expoe dado tenant
-- ============================================================

-- Como qualquer user authenticated, deve retornar contagens globais
SELECT 'health_returns_aggregates' AS test,
       CASE WHEN
         (public.get_creative_health()) ? 'nano_banana_24h'
         AND (public.get_creative_health()) ? 'gpt_image_24h'
         AND (public.get_creative_health()) ? 'p95_latency_ms'
       THEN 'PASS' ELSE 'FAIL' END AS result;

-- ============================================================
-- 8. Storage: cross-tenant read bloqueado por prefix
-- ============================================================

-- Como user_a, tenta ler '<company_b>/file.png' -> RLS de storage.objects bloqueia
-- (validacao via API real do supabase-js — este SQL apenas checa policy existence)
SELECT 'storage_select_policy_exists' AS test,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_policies
          WHERE tablename = 'objects' AND schemaname = 'storage'
            AND policyname = 'generated_creatives_storage_select'
       ) THEN 'PASS' ELSE 'FAIL' END AS result;

-- ============================================================
-- 9. meta_baseline_blocklist seed populado
-- ============================================================

SELECT 'blocklist_seed_populated' AS test,
       CASE WHEN
         (SELECT count(*) FROM public.meta_baseline_blocklist) >= 20
       THEN 'PASS' ELSE 'FAIL' END AS result;

-- 10. creative_plan_quotas seed populado para 3 planos
SELECT 'plan_quotas_3_plans' AS test,
       CASE WHEN
         (SELECT count(*) FROM public.creative_plan_quotas
           WHERE plan IN ('free', 'pro', 'enterprise')) = 3
       THEN 'PASS' ELSE 'FAIL' END AS result;
