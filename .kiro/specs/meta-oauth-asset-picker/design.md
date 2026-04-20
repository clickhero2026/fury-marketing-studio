# Meta OAuth Asset Picker — Design

> Status: AS-BUILT (2026-04-19)

## Arquitetura

```
[User] --clica Conectar-->
  [use-meta-connect.ts] --invoke meta-oauth-start-->
    [meta-oauth-start] --302 para dialog Meta-->
      [Meta OAuth Dialog]
        --redirect callback com ?code-->
          [meta-oauth-callback] --302 Location: /oauth/meta/complete-->
            [OAuthComplete.tsx (SPA)] --postMessage--> [opener window]
              --dispatchEvent meta-oauth-completed-->
                [Integrations.tsx] abre MetaAssetPickerModal
                  [MetaAssetPicker] --invoke meta-list-assets-->
                    [meta-list-assets] retorna arvore hierarquica + enrichment
                  [User seleciona] --invoke meta-save-assets-->
                    [meta-save-assets] upsert + dispara sync/deep-scan
```

## Componentes

### Frontend
- `src/hooks/use-meta-connect.ts` — OAuth start + popup + message listener
- `src/pages/OAuthComplete.tsx` — rota `/oauth/meta/complete`, lê URL params, postMessage, close
- `src/pages/Integrations.tsx` — escuta `meta-oauth-completed`, abre modal
- `src/components/meta/MetaAssetPicker.tsx` — accordion BM + checkbox hierarquico
- `src/components/meta/MetaAssetPickerModal.tsx` — Dialog fullscreen wrapper
- `src/hooks/use-meta-assets.ts` — `useMetaAssets` (list) + `saveAssetsAsync` (mutation)

### Backend (Edge Functions)
- `meta-oauth-callback/index.ts` — recebe code Meta, troca por long-lived token,
  fetches /me + /businesses + /adaccounts, salva em `integrations`, retorna 302
  para `/oauth/meta/complete` com headers `Cache-Control: no-store`
- `meta-list-assets/index.ts` — retorna `{ businesses: [{ id, ad_accounts, pages }],
  personal_ad_accounts, personal_pages }` com enrichment via batch Graph API
- `meta-save-assets/index.ts` — upsert com `is_active`, dispara sync em background

## Decisoes Criticas

### 1. Popup + /oauth/meta/complete (nao HTML inline no callback)
**Razao**: Callback retornando HTML com postMessage era cacheado pelo browser
do popup, mostrando codigo cru em deploys futuros. Solucao: callback sempre
redireciona (302) para rota SPA mesmo-origin, que faz postMessage.

### 2. `filtering=status=ACTIVE` em vez de `effective_status=ACTIVE`
**Razao**: `effective_status` inclui estados derivados de issues (billing, conta
pausada) que mascaram a intencao do usuario. `status` conta o que o user
configurou como ativo, que e o que o filtro do UI representa.

### 3. URL-encoded do parametro filtering dentro do batch
**Razao**: Dentro de `relative_url` de batch request, colchetes/aspas JSON sao
interpretados pela infraestrutura antes do endpoint Graph. `encodeURIComponent`
garante transporte seguro.

### 4. `summary=total_count` em vez de `summary=true`
**Razao**: `summary=true` pode nao retornar total_count em alguns endpoints.
Explicito e seguro.

### 5. Cache-Control: no-store no callback
**Razao**: Evita que browsers (Chrome em particular) cacheiem respostas antigas
do callback, que podiam mostrar HTML de versoes passadas.

## Schema (sem mudancas — reuso)

- `integrations` — account_id/business_id/page_id setados para NULL pos-OAuth
  (user escolhe manualmente depois)
- `meta_ad_accounts` — UNIQUE (company_id, account_id); `is_active` para soft-delete
- `meta_pages` — UNIQUE (company_id, page_id); `is_active` para soft-delete
- `meta_business_managers` — UNIQUE (company_id, business_id)
- `oauth_sessions` — armazena `ad_accounts`/`businesses` fetched no callback
  para `meta-list-assets` reusar (TTL 30min)

## Fluxo de erro

- OAuth cancelado pelo user -> popup fecha, toast "conexao cancelada"
- 0 ad accounts retornados -> callback redireciona com `?oauth_error=...`
- Batch Graph API falha -> campos de enrichment ficam 0, accounts ainda listadas
- Save com 0 accounts ou 0 pages -> UI bloqueia botao Salvar

## Nao-goals

- Nao prove selecao automatica por heuristica
- Nao suporta multi-user por integration (1 integration = 1 connected_by_user)
