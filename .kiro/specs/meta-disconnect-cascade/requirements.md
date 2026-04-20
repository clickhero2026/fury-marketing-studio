# Meta Disconnect Cascade — Requirements

> Status: AS-BUILT (2026-04-19)
> Language: pt-BR

## Objetivo

Permitir que o usuario desconecte a integracao Meta com um clique, removendo
todos os dados dependentes (campanhas, metricas, criativos, FURY evaluations,
compliance scores, etc.) sem erros de FK violation.

## Requisitos (EARS)

### REQ-1 — Disconnect idempotente
**Quando** o usuario clicar em "Desconectar",
**o sistema deve** executar a Edge Function `meta-oauth-disconnect` que:
- Valida sessao do user
- DELETE em `integrations` WHERE company_id = X AND platform = 'meta'
- Retorna 200 com `{ success: true }` OU 500 com detalhe do erro

### REQ-2 — CASCADE automatico em tabelas dependentes
**Quando** o DELETE em `integrations` executar,
**o sistema deve** propagar via ON DELETE CASCADE para:
- `meta_ad_accounts` (FK integration_id)
- `meta_pages` (FK integration_id)
- `meta_business_managers` (FK integration_id)
- `campaigns` (FK integration_id)
- `campaign_metrics` (FK campaign_id -> campaigns)
- `creatives` (FK integration_id)
- `adsets` (FK campaign_id)
- `meta_pixels` (FK integration_id)
- `fury_evaluations` (FK campaign_id/creative_id)
- `fury_actions` (FK campaign_id/creative_id)
- `compliance_scores` (FK campaign_id/creative_id)
- `compliance_violations` (FK campaign_id/creative_id)
- `compliance_actions` (FK campaign_id/creative_id)

### REQ-3 — Erro detalhado
**Quando** o CASCADE falhar,
**o sistema deve** retornar `{ error, details, hint, code, cleanup_errors }`
para debug, e NAO retornar 500 generico.

## Nao-requisitos

- Nao precisa de "undo" — disconnect e terminal
- Nao exige confirmacao dupla (UX simples)
