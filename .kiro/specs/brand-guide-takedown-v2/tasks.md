# Tasks: Brand Guide + Smart Takedown v2

> **Status:** APPROVED (fast-track)

## Fase 1 — Database

- [x] 1. Migration: ADD violation_type 'missing_required_term' no CHECK constraint
- [x] 2. Migration: ADD `brand_colors text[]`, `brand_logo_url text`, `takedown_severity_filter text` em companies

## Fase 2 — Edge Function patches

- [x] 3. Buscar required_terms + brand_colors + brand_logo_url na compliance-scan
- [x] 4. Atualizar prompt de copy com termos obrigatorios
- [x] 5. Atualizar prompt de imagem com cores da marca + logo (2 imagens)
- [x] 6. Filtro de severidade no executeTakedown

## Fase 3 — Hooks

- [x] 7. Atualizar `useComplianceRules()` para suportar required_term
- [x] 8. Hook `useTakedownHistory()` para compliance_actions paginado
- [x] 9. Hook `useBrandGuide()` para brand_colors + brand_logo_url CRUD
- [x] 10. Mutation `useReactivateAd()` para POST /{ad_id}?status=ACTIVE

## Fase 4 — UI

- [x] 11. BlacklistManager: tabs "Proibidos" | "Obrigatorios"
- [x] 12. ComplianceSettings: Brand Guide section (colors + logo) + severity filter select
- [x] 13. TakedownHistory.tsx: tabela + botao Reativar
- [x] 14. ComplianceView: adicionar tab "Historico"

## Fase 5 — Quality

- [x] 15. `npm run build` verde
- [x] 16. Deploy compliance-scan
- [x] 17. Atualizar `implemented-features.md`
