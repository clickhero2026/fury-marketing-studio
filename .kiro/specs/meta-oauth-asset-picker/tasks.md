# Meta OAuth Asset Picker — Tasks

> Status: AS-BUILT (2026-04-19) — tarefas marcadas [x] refletem estado real.

## Backend
- [x] `meta-oauth-callback`: remover auto-selecao; retornar 302 para /oauth/meta/complete
- [x] `meta-oauth-callback`: adicionar headers `Cache-Control: no-store`
- [x] `meta-list-assets`: endpoint retorna hierarquia `{ businesses, personal_ad_accounts, personal_pages }`
- [x] `meta-list-assets`: batch Graph API para `active_campaigns_count` + `spend_last_30d`
- [x] `meta-list-assets`: trocar `effective_status=["ACTIVE"]` por `filtering=[{field:status,operator:IN,value:[ACTIVE]}]` URL-encoded
- [x] `meta-list-assets`: `summary=total_count` explicito
- [x] `meta-save-assets`: upsert com is_active (soft-delete)
- [x] Migration UNIQUE (company_id, account_id) em meta_ad_accounts
- [x] Migration UNIQUE (company_id, page_id) em meta_pages
- [x] Config toml: `verify_jwt=false` para meta-oauth-callback e meta-list-assets

## Frontend
- [x] `OAuthComplete.tsx` — rota /oauth/meta/complete, postMessage + close
- [x] `App.tsx` — registrar rota publica (sem ProtectedRoute)
- [x] `use-meta-connect.ts` — popup flow + messageHandler + polling fallback
- [x] `use-meta-assets.ts` — types hierarquicos + mutations saveAssetsAsync
- [x] `MetaAssetPicker.tsx` — accordion BM + checkbox hierarquico + badges
- [x] `MetaAssetPicker.tsx` — search + toggle "apenas campanhas ativas"
- [x] `MetaAssetPicker.tsx` — validacao (>=1 conta, >=1 pagina)
- [x] `MetaAssetPickerModal.tsx` — Dialog fullscreen wrapper
- [x] `Integrations.tsx` — listener de `meta-oauth-completed` + fallback URL params

## Validacao
- [x] `npm run build` verde
- [x] Deploy Edge Functions via CLI
- [x] Push para 3 remotes (origin, clickhero, fury)
- [ ] **pendente**: teste E2E de ponta-a-ponta com user real (happy path + cancelamento)
