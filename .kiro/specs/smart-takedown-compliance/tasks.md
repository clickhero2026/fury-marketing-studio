# Tasks: Smart Takedown + Compliance

> **Status:** APPROVED (fast-track)

## Fase 1 — Database + Seed

- [x] 1. Migration: CREATE TABLE `compliance_rules` + RLS (4 policies)
- [x] 2. Migration: CREATE TABLE `compliance_scores` + RLS + indexes
- [x] 3. Migration: CREATE TABLE `compliance_violations` + RLS + indexes
- [x] 4. Migration: CREATE TABLE `compliance_actions` + RLS
- [x] 5. Migration: ALTER `companies` ADD `auto_takedown_enabled`, `takedown_threshold`
- [x] 6. Migration: CREATE TABLE `compliance_scan_logs` + RLS
- [x] 7. Migration: INSERT seed de termos proibidos Meta (12 termos padrao)

## Fase 2 — Edge Function `compliance-scan`

- [x] 8. Criar `supabase/functions/compliance-scan/index.ts` com:
  - 8a. Dual auth (JWT | x-cron-secret)
  - 8b. Resolve company_id (mesmo padrao meta-deep-scan)
  - 8c. Fetch creatives ativas nao analisadas nas ultimas 24h
  - 8d. Fetch blacklist do tenant
- [x] 9. Helper `analyzeCopy()`: chamada Anthropic API com prompt de copy
  - 9a. Buscar ANTHROPIC_API_KEY do Vault
  - 9b. Prompt estruturado com blacklist
  - 9c. Parse JSON response (com fallback se mal formado)
- [x] 10. Helper `analyzeImage()`: chamada Claude Vision
  - 10a. Fetch imagem como base64
  - 10b. Prompt de OCR + analise visual com blacklist
  - 10c. Parse JSON response
  - 10d. Fallback: se imagem indisponivel, skip (score so copy)
- [x] 11. `calculateFinalScore()`: ponderacao 60% copy + 40% visual
- [x] 12. Upsert `compliance_scores` + bulk insert `compliance_violations`
- [x] 13. `executeTakedown()`:
  - 13a. Check auto_takedown_enabled + threshold
  - 13b. Rate limit: count actions ultima hora < 10
  - 13c. POST Meta Graph API `/{ad_id}?status=PAUSED`
  - 13d. INSERT compliance_actions
- [x] 14. Log em `compliance_scan_logs` (start/finish/stats)
- [x] 15. Deploy compliance-scan

## Fase 3 — Cron

- [x] 16. Migration: CREATE FUNCTION `trigger_compliance_scan_tick()` + pg_cron every 6h

## Fase 4 — Hooks

- [x] 17. `useComplianceScores()` — lista paginada com join creatives
- [x] 18. `useComplianceViolations(scoreId)` — violacoes de 1 anuncio
- [x] 19. `useComplianceRules()` — CRUD blacklist
- [x] 20. `useComplianceScan()` — mutation trigger manual
- [x] 21. `useComplianceStats()` — agregacao KPIs

## Fase 5 — UI

- [x] 22. Adicionar "Compliance" na sidebar (`AppSidebar.tsx`)
- [x] 23. `ComplianceView.tsx` — layout principal
- [x] 24. `ComplianceDashboard.tsx` — KPI cards (analisados, healthy%, warning%, critical%, pausados)
- [x] 25. `ComplianceTable.tsx` — tabela de anuncios com score badge + acoes
- [x] 26. `ComplianceDetail.tsx` — sheet/modal com violacoes detalhadas
- [x] 27. `ComplianceSettings.tsx` — toggle takedown + threshold + blacklist
- [x] 28. `BlacklistManager.tsx` — tabela editavel CRUD de termos

## Fase 6 — Quality

- [x] 29. `npm run build` verde
- [x] 30. Deploy compliance-scan
- [x] 31. Smoke test: trigger manual, verificar score + violacoes no banco
- [x] 32. Atualizar `implemented-features.md`
