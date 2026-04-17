# Tasks: Campaign Publisher

## Fase 1 — Database
- [x] 1. Migration: CREATE TABLE `campaign_drafts` + RLS (4 policies)
- [x] 2. Migration: CREATE TABLE `campaign_publications` + RLS + indexes
- [x] 3. Migration: CREATE TABLE `campaign_publication_steps` + RLS

## Fase 2 — Edge Function `campaign-publish`
- [x] 4. Zod schemas (Campaign/Adset/Ad)
- [x] 5. Auth + fetch draft OR use body
- [x] 6. Validacao Zod (400 com mensagens amigaveis)
- [x] 7. Compliance gate inline (analyzeCopy + analyzeImage)
- [x] 8. Publish sequence (4 calls Meta API) com logs em steps
- [x] 9. Rollback em ordem inversa em caso de erro
- [x] 10. Retry 2x com backoff em 5xx

## Fase 3 — Hooks
- [x] 11. `useCampaignDrafts()` — CRUD
- [x] 12. `useCampaignPublish()` — mutation
- [x] 13. `useCampaignPublication(id)` — polling 2s
- [x] 14. `useCampaignPublications()` — historico

## Fase 4 — UI
- [x] 15. Sidebar: add "Publicar" + Index.tsx
- [x] 16. `CampaignPublisherView` layout + Wizard
- [x] 17. `CampaignStep` (nome + objetivo + datas)
- [x] 18. `AdsetStep` (targeting + budget)
- [x] 19. `AdStep` (criativo + texto)
- [x] 20. `PublishConfirmModal` (compliance preview)
- [x] 21. `PublicationStatus` (progress live)
- [x] 22. `PublicationHistory` (lista)

## Fase 5 — Quality
- [x] 23. Build verde
- [x] 24. Deploy campaign-publish
- [x] 25. Steering
