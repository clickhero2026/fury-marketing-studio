# Tasks: FURY v0

> **Status:** APPROVED (fast-track)

## Fase 1 — Database + Seed + Cron

- [x] 1. Migration: CREATE TABLE `fury_rules` + RLS
- [x] 2. Migration: CREATE TABLE `fury_evaluations` + RLS + indexes
- [x] 3. Migration: CREATE TABLE `fury_actions` + RLS + indexes
- [x] 4. Migration: CREATE TABLE `fury_scan_logs` + RLS
- [x] 5. Migration: SEED 5 regras default por empresa
- [x] 6. Migration: CREATE FUNCTION `trigger_fury_evaluate_tick()` + pg_cron hourly

## Fase 2 — Edge Function `fury-evaluate`

- [x] 7. Criar `supabase/functions/fury-evaluate/index.ts`:
  - 7a. Dual auth
  - 7b. Fetch fury_rules ativas
  - 7c. Fetch campaigns + metricas 7d
  - 7d. Agregar metricas (avg CTR, CPM, CPC, freq, CPA, budget%)
  - 7e. Calcular tendencia (improving/stable/worsening)
- [x] 8. Motor de regras: aplicar cada regra ativa contra metricas
- [x] 9. Dedup: skip se mesma regra+campanha em 24h
- [x] 10. Auto-execute: POST Meta API status=PAUSED + revert_before
- [x] 11. Handler de revert: body.revert_action_id → POST status=ACTIVE
- [x] 12. Scan log (start/finish/stats)

## Fase 3 — Hooks

- [x] 13. `useFuryActions()` — feed com refetchInterval 30s
- [x] 14. `useFuryRules()` — CRUD regras (toggle + threshold)
- [x] 15. `useFuryEvaluate()` — trigger manual
- [x] 16. `useFuryStats()` — KPIs agregados
- [x] 17. `useFuryRevert()` — mutation revert

## Fase 4 — UI

- [x] 18. Sidebar: add "FURY" (icone Zap) + Index.tsx
- [x] 19. `FuryView.tsx` — layout com tabs (Feed | Configuracoes)
- [x] 20. `FuryDashboard.tsx` — KPI cards
- [x] 21. `FuryActionFeed.tsx` — feed de acoes com filtro + desfazer
- [x] 22. `FuryRulesConfig.tsx` — toggles + thresholds

## Fase 5 — Quality

- [x] 23. `npm run build` verde
- [x] 24. Deploy fury-evaluate
- [x] 25. Atualizar `implemented-features.md`
