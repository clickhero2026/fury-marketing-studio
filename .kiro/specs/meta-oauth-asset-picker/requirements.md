# Meta OAuth Asset Picker — Requirements

> Status: AS-BUILT (2026-04-19)
> Language: pt-BR

## Objetivo

Apos OAuth Meta concluir, exibir modal hierarquico para o usuario selecionar
Business Managers, Contas de Anuncio e Paginas do Facebook que deseja conectar.
Nao auto-selecionar — user escolhe manualmente.

## Requisitos (EARS)

### REQ-1 — Modal hierarquico pos-OAuth
**Quando** o OAuth Meta completar com sucesso,
**o sistema deve** abrir o modal `MetaAssetPicker` listando:
- Business Managers do usuario (com badges: owned/client, verification_status)
- Ad Accounts de cada BM (com currency, account_status, active_campaigns_count, spend_30d)
- Pages de cada BM (com picture, name, category)
- Contas pessoais (sem BM) em secao separada

### REQ-2 — Contagem de campanhas ativas
**Quando** o backend enriquecer os ad accounts,
**o sistema deve** consultar a Graph API via batch request
(`/act_{id}/campaigns?fields=status&limit=500`) e contar CLIENT-SIDE os
campaigns com `status === 'ACTIVE'`. Nao usar `filtering`/`summary` dentro de
batch (quirks da API causam contagem zerada). Nao usar `effective_status`
(diverge por issues de billing).

### REQ-3 — Filtros UI
**Quando** o usuario interagir com o modal,
**o sistema deve** permitir:
- Search textual em BM/Account/Page
- Toggle "Apenas com campanhas ativas" — esconde accounts com `active_campaigns_count === 0`

### REQ-4 — Validacao de selecao
**Quando** o usuario clicar em "Salvar Selecao",
**o sistema deve** bloquear o save se:
- 0 contas de anuncio selecionadas OU
- 0 paginas selecionadas

### REQ-5 — Persistencia
**Quando** a selecao for salva,
**o sistema deve**:
- Upsert em `meta_ad_accounts` com `is_active=true` (soft-delete dos nao selecionados)
- Upsert em `meta_pages` com `is_active=true`
- Upsert em `meta_business_managers` dos BMs referenciados
- Disparar `meta-sync` e `meta-deep-scan` em background

### REQ-6 — Fluxo OAuth via popup
**Quando** o user iniciar OAuth,
**o sistema deve** abrir popup Meta (nao redirect), e o callback
`meta-oauth-callback` deve retornar HTTP 302 para `/oauth/meta/complete`
(rota do app) que faz `postMessage` pro opener e fecha o popup.
Callback NUNCA retorna HTML cru.

## Nao-requisitos

- Nao auto-seleciona primeira conta (behavior antigo removido)
- Nao exige permissoes extras alem das ja solicitadas no escopo OAuth
