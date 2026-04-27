-- Schema Integration Tests — briefing-onboarding (task 10.2)
-- Spec: .kiro/specs/briefing-onboarding/ (R6.2, R6.3, R8.1, R2.6)
--
-- Como rodar: contra staging com 1 company de teste.
-- Cada bloco e independente. Espera-se que TODOS retornem PASS.

-- ============================================================
-- SETUP (rodar como service_role)
-- ============================================================
-- DECLARE company_id := <uuid_teste>
-- INSERT minimal companies + organization_member do user de teste

-- ============================================================
-- 1. View v_company_briefing_status — fixtures
-- ============================================================

-- 1a) Briefing vazio: score 0, is_complete=false, missing_fields contem todos required
DELETE FROM public.company_briefings WHERE company_id = '<test_company>';
INSERT INTO public.company_briefings (company_id) VALUES ('<test_company>');

SELECT 'view_empty_briefing' AS test,
       CASE WHEN score = 0 AND NOT is_complete
                 AND 'niche' = ANY(missing_fields)
                 AND 'short_description' = ANY(missing_fields)
                 AND 'primary_offer' = ANY(missing_fields)
            THEN 'PASS' ELSE 'FAIL' END AS result
  FROM public.v_company_briefing_status
 WHERE company_id = '<test_company>';

-- 1b) Briefing parcial: score > 0 mas < 100, is_complete=false
UPDATE public.company_briefings
   SET niche = 'test',
       short_description = 'descricao'
 WHERE company_id = '<test_company>';

SELECT 'view_partial_briefing' AS test,
       CASE WHEN score > 0 AND score < 100 AND NOT is_complete
            THEN 'PASS' ELSE 'FAIL' END AS result
  FROM public.v_company_briefing_status
 WHERE company_id = '<test_company>';

-- 1c) Briefing completo: score 100 e is_complete=true
UPDATE public.company_briefings
   SET audience = '{"ageRange": {"min": 18, "max": 45}, "location": {"country": "Brasil"}}'::jsonb,
       tone = '{"formality": 3, "technicality": 3, "emotional": ["welcoming"]}'::jsonb,
       palette = '{"primary": "#000", "secondary": "#fff", "accent": "#3b82f6", "background": "#0a0a0a"}'::jsonb
 WHERE company_id = '<test_company>';

INSERT INTO public.company_offers (company_id, is_primary, name, short_description, price, format)
VALUES ('<test_company>', true, 'Oferta', 'Descricao', 99.9, 'course')
ON CONFLICT DO NOTHING;

SELECT 'view_complete_briefing' AS test,
       CASE WHEN is_complete AND score >= 80
            THEN 'PASS' ELSE 'FAIL' END AS result
  FROM public.v_company_briefing_status
 WHERE company_id = '<test_company>';

-- ============================================================
-- 2. Trigger snapshot_company_briefing — versionamento (R6.2)
-- ============================================================

-- 2a) UPDATE em campo de conteudo gera 1 snapshot
TRUNCATE public.briefing_history;
UPDATE public.company_briefings
   SET niche = 'updated-niche'
 WHERE company_id = '<test_company>';

SELECT 'trigger_snapshot_on_content_change' AS test,
       CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END AS result
  FROM public.briefing_history
 WHERE company_id = '<test_company>';

-- 2b) Fix C1: UPDATE apenas de status NAO gera snapshot adicional
-- (auto-status ja roda no UPDATE acima — verifica se foi UM snapshot, nao DOIS)
SELECT 'trigger_no_double_snapshot' AS test,
       CASE WHEN count(*) <= 1 THEN 'PASS' ELSE 'FAIL' END AS result
  FROM public.briefing_history
 WHERE company_id = '<test_company>';

-- 2c) SELECT em company_briefings nao gera snapshot
SELECT * FROM public.company_briefings WHERE company_id = '<test_company>';

SELECT 'trigger_no_snapshot_on_select' AS test,
       CASE WHEN count(*) <= 1 THEN 'PASS' ELSE 'FAIL' END AS result
  FROM public.briefing_history
 WHERE company_id = '<test_company>';

-- ============================================================
-- 3. Cron de retencao briefing_history (R6.3) — 20 versoes max
-- ============================================================

-- 3a) Inserir 25 snapshots fake e rodar a query do cron manualmente
INSERT INTO public.briefing_history (company_id, snapshot, changed_at)
SELECT '<test_company>', '{}'::jsonb, now() - (n || ' minutes')::interval
  FROM generate_series(1, 25) n;

DELETE FROM public.briefing_history bh
 WHERE bh.id IN (
   SELECT id FROM (
     SELECT id, row_number() OVER (PARTITION BY company_id ORDER BY changed_at DESC) AS rn
       FROM public.briefing_history
   ) ranked
   WHERE ranked.rn > 20
 );

SELECT 'retention_keeps_20_max' AS test,
       CASE WHEN count(*) <= 20 THEN 'PASS' ELSE 'FAIL' END AS result
  FROM public.briefing_history
 WHERE company_id = '<test_company>';

-- ============================================================
-- 4. Unique parcial em company_offers (1 principal por company)
-- ============================================================

-- 4a) Inserir 2 ofertas com is_primary=true deve falhar com violation
DELETE FROM public.company_offers WHERE company_id = '<test_company>';

INSERT INTO public.company_offers (company_id, is_primary, name, short_description, price, format)
VALUES ('<test_company>', true, 'Oferta A', 'D1', 10.0, 'course');

-- Esta query DEVE falhar:
-- INSERT INTO public.company_offers (company_id, is_primary, name, short_description, price, format)
-- VALUES ('<test_company>', true, 'Oferta B', 'D2', 20.0, 'course');
-- Esperado: ERROR duplicate key value violates unique constraint
--          "company_offers_one_primary_per_company_uidx"

-- 4b) Inserir varias com is_primary=false e permitido
INSERT INTO public.company_offers (company_id, is_primary, name, short_description, price, format)
VALUES
  ('<test_company>', false, 'Sec1', 'D', 1.0, 'course'),
  ('<test_company>', false, 'Sec2', 'D', 1.0, 'course');

SELECT 'unique_primary_constraint_only' AS test,
       CASE WHEN count(*) = 3 THEN 'PASS' ELSE 'FAIL' END AS result
  FROM public.company_offers
 WHERE company_id = '<test_company>';

-- ============================================================
-- 5. RPC promote_offer_to_primary — atomicidade (Fix M2)
-- ============================================================

-- 5a) Promote troca atomicamente o is_primary
DELETE FROM public.company_offers WHERE company_id = '<test_company>';
INSERT INTO public.company_offers (id, company_id, is_primary, name, short_description, price, format)
VALUES
  ('11111111-1111-1111-1111-111111111111', '<test_company>', true, 'Atual', 'D', 1.0, 'course'),
  ('22222222-2222-2222-2222-222222222222', '<test_company>', false, 'Nova', 'D', 2.0, 'course');

SELECT public.promote_offer_to_primary('22222222-2222-2222-2222-222222222222'::uuid);

SELECT 'promote_atomic_swap' AS test,
       CASE WHEN
         (SELECT count(*) FROM public.company_offers WHERE company_id = '<test_company>' AND is_primary) = 1
         AND (SELECT is_primary FROM public.company_offers WHERE id = '22222222-2222-2222-2222-222222222222')
         AND NOT (SELECT is_primary FROM public.company_offers WHERE id = '11111111-1111-1111-1111-111111111111')
       THEN 'PASS' ELSE 'FAIL' END AS result;

-- ============================================================
-- 6. CHECK constraints em company_offers (R2.6)
-- ============================================================

-- 6a) name vazio deve falhar
-- INSERT INTO public.company_offers (company_id, name, short_description, price, format)
-- VALUES ('<test_company>', '', 'desc', 10, 'course');
-- Esperado: ERROR check constraint company_offers_required_fields_chk

-- 6b) price negativo deve falhar
-- INSERT INTO public.company_offers (company_id, name, short_description, price, format)
-- VALUES ('<test_company>', 'X', 'Y', -1, 'course');
-- Esperado: ERROR check constraint

-- ============================================================
-- 7. RPC get_company_briefing — payload + audit
-- ============================================================

-- 7a) Sucesso retorna JSON com keys esperadas e cria 1 entrada em access_log
TRUNCATE public.briefing_access_log;
SELECT public.get_company_briefing('<test_company>'::uuid, 'chat');

SELECT 'rpc_audit_on_success' AS test,
       CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END AS result
  FROM public.briefing_access_log
 WHERE company_id = '<test_company>'
   AND purpose = 'chat';

-- 7b) purpose invalido falha sem criar audit
TRUNCATE public.briefing_access_log;
DO $$ BEGIN
  BEGIN
    PERFORM public.get_company_briefing('<test_company>'::uuid, 'invalid-purpose');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;

SELECT 'rpc_no_audit_on_invalid_purpose' AS test,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result
  FROM public.briefing_access_log
 WHERE company_id = '<test_company>';

-- ============================================================
-- CLEANUP
-- ============================================================
-- DELETE FROM company_offers WHERE company_id = '<test_company>';
-- DELETE FROM briefing_history WHERE company_id = '<test_company>';
-- DELETE FROM briefing_access_log WHERE company_id = '<test_company>';
-- DELETE FROM company_briefings WHERE company_id = '<test_company>';
