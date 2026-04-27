-- Cross-Tenant Isolation Tests — briefing-onboarding (task 9.1)
-- Spec: .kiro/specs/briefing-onboarding/ (R9.1, R9.2, R9.3)
--
-- Como rodar:
--   1. Setup em staging com 2 organizations + 2 companies + 2 users (A e B).
--   2. Em sessao A (auth.uid() = userA), executar cada bloco.
--   3. Repetir como user B para verificar simetria.
--
-- Resultado esperado: TODOS os SELECTs retornam 0 rows e UPDATEs/DELETEs/INSERTs
-- falham com "permission denied" ou afetam 0 rows. Storage policies negam acesso.
--
-- Marcadores no resultado:
--   ✅ = isolamento correto (zero leak)
--   ❌ = falha de seguranca (leak detectado)

-- ============================================================
-- SETUP (rodar como service_role apenas para preparar)
-- ============================================================
-- INSERT INTO organizations ... (org_a, org_b)
-- INSERT INTO companies ... (company_a vinculada a org_a, company_b vinculada a org_b)
-- INSERT INTO organization_members ... (userA -> org_a owner, userB -> org_b owner)
-- INSERT INTO company_briefings ... (briefing_a, briefing_b)
-- INSERT INTO company_offers ... (offer_a primary, offer_b primary)

-- Como user A (auth.uid = userA), tente acessar dados da company_b:

-- 1. company_briefings — SELECT cross-tenant deve retornar 0
SELECT 'company_briefings_cross_select' AS test,
       count(*) AS rows_leaked
  FROM public.company_briefings
 WHERE company_id = '<company_b_uuid>';
-- Esperado: rows_leaked = 0

-- 2. company_briefings — UPDATE cross-tenant deve afetar 0 (e ainda assim nao rollar erro)
WITH upd AS (
  UPDATE public.company_briefings
     SET niche = 'invasion'
   WHERE company_id = '<company_b_uuid>'
   RETURNING company_id
)
SELECT 'company_briefings_cross_update' AS test, count(*) AS rows_affected FROM upd;
-- Esperado: rows_affected = 0

-- 3. company_briefings — INSERT direto com company_id de outra company
-- WITH CHECK deve bloquear.
INSERT INTO public.company_briefings (company_id, niche)
VALUES ('<company_b_uuid>', 'leaked-niche');
-- Esperado: ERROR new row violates row-level security policy

-- 4. company_offers — SELECT cross-tenant
SELECT 'company_offers_cross_select' AS test, count(*) FROM public.company_offers
 WHERE company_id = '<company_b_uuid>';
-- Esperado: 0

-- 5. company_branding_assets — SELECT cross-tenant
SELECT 'company_branding_assets_cross_select' AS test, count(*) FROM public.company_branding_assets
 WHERE company_id = '<company_b_uuid>';
-- Esperado: 0

-- 6. company_prohibitions — SELECT cross-tenant
SELECT 'company_prohibitions_cross_select' AS test, count(*) FROM public.company_prohibitions
 WHERE company_id = '<company_b_uuid>';
-- Esperado: 0

-- 7. briefing_history — SELECT cross-tenant
SELECT 'briefing_history_cross_select' AS test, count(*) FROM public.briefing_history
 WHERE company_id = '<company_b_uuid>';
-- Esperado: 0

-- 8. briefing_access_log — SELECT cross-tenant
SELECT 'briefing_access_log_cross_select' AS test, count(*) FROM public.briefing_access_log
 WHERE company_id = '<company_b_uuid>';
-- Esperado: 0

-- 9. briefing_history — INSERT direto (deve falhar — sem policy publica)
INSERT INTO public.briefing_history (company_id, snapshot)
VALUES ('<company_a_uuid>', '{"injected": true}'::jsonb);
-- Esperado: ERROR (sem INSERT policy mesmo para sua propria company)

-- 10. briefing_access_log — INSERT direto (deve falhar)
INSERT INTO public.briefing_access_log (company_id, purpose)
VALUES ('<company_a_uuid>', 'chat');
-- Esperado: ERROR

-- 11. View v_company_briefing_status — leitura cross-tenant
SELECT 'v_status_cross_select' AS test, count(*) FROM public.v_company_briefing_status
 WHERE company_id = '<company_b_uuid>';
-- Esperado: 0 (view e SECURITY INVOKER, herda RLS)

-- 12. RPC get_company_briefing — chamada cross-tenant retorna NULL silenciosamente (R7.5)
SELECT public.get_company_briefing('<company_b_uuid>'::uuid, 'chat') AS payload;
-- Esperado: payload IS NULL (sem erro, sem dados, sem audit)

-- 13. RPC get_company_briefing — verificar que NAO criou audit log
SELECT 'rpc_no_audit_on_unauthorized' AS test, count(*) FROM public.briefing_access_log
 WHERE company_id = '<company_b_uuid>'
   AND accessed_at > now() - interval '5 seconds';
-- Esperado: 0

-- 14. Storage company-assets — listar objetos de outra company
-- (rodar via SDK: supabase.storage.from('company-assets').list('<company_b_uuid>/branding/'))
-- Esperado: lista vazia ou erro 401/403

-- 15. Storage company-assets — download de path cross-tenant
-- (rodar via SDK: supabase.storage.from('company-assets').createSignedUrl('<company_b_uuid>/branding/logo_primary/x.png', 60))
-- Esperado: signedUrl null ou erro

-- ============================================================
-- POSITIVO: como user A, acessar a propria company deve funcionar.
-- ============================================================

SELECT 'company_briefings_self_select' AS test, count(*) FROM public.company_briefings
 WHERE company_id = '<company_a_uuid>';
-- Esperado: >= 0 (sem erro de RLS)

SELECT public.get_company_briefing('<company_a_uuid>'::uuid, 'chat') AS payload;
-- Esperado: payload com dados ou NULL se briefing nunca foi salvo
-- E briefing_access_log deve ter 1 entrada nova
