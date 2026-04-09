# Design: Meta Sync + Dashboard/Criativos Reais

> **Status:** AS-BUILT
> **Idioma:** pt-BR

## Overview

**Purpose:** Levar dados reais Meta (campaigns, insights, creatives) para o Supabase e renderizar nas views Dashboard/Criativos, substituindo todos os mocks.

**Users:** Usuarios que ja conectaram Meta e selecionaram ad accounts.

**Impact:** Fecha o loop "conectar -> sincronizar -> visualizar" — primeira entrega de valor real do produto.

### Goals
- Sync completo (campaigns + 30d insights + creatives) em uma chamada
- Idempotente para campaigns/creatives, append-only para metrics
- Rate-limit safe (batches de 5)
- Views reativas via React Query invalidation

### Non-Goals
- Sync incremental (apenas full sync por enquanto)
- Sync agendado (cron) — apenas manual via botao
- Webhooks Meta (real-time updates) — futuro

## Architecture

```
[Botao Sincronizar]
       |
       v
[useMetaConnect.sync()]
       |
       v
[Edge: meta-sync]
       |
       | 1. resolve company_id
       | 2. decrypt token
       | 3. lista meta_ad_accounts WHERE is_active
       | 4. for each batch of 5 accounts:
       |    Promise.all([
       |       syncAccount(account_1),
       |       syncAccount(account_2),
       |       ...
       |    ])
       |
       | syncAccount:
       |    GET /act_X/campaigns -> upsert
       |    GET /act_X/insights -> insert (snapshot)
       |    GET /act_X/ads?fields=...,creative{...} -> upsert creatives
       |
       v
[stats: campaigns_synced, metrics_synced, creatives_synced, errors]
       |
       v
[invalidateQueries: campaigns, campaign-metrics, creatives, meta-integration]
       |
       v
[Dashboard + Criativos re-renderizam]
```

## Database Tables (existentes)

### `campaigns`
- UNIQUE `(external_id, company_id)` ← adicionada nesta feature
- Colunas: external_id, name, status, effective_status, objective, buying_type, budget, budget_remaining, account, integration_id, company_id, platform, api_created_at, updated_at
- RLS por company_id

### `campaign_metrics`
- Append-only por sync_batch
- Colunas: data, nome_conta, campanha, grupo_anuncios, anuncios, impressoes, cliques, cpm, cpc, investimento, reach, frequency, unique_clicks, unique_ctr, quality_ranking, engagement_rate_ranking, conversion_rate_ranking, conversas_iniciadas, custo_conversa, website_purchase_roas, company_id, source, sync_batch
- RLS por company_id

### `creatives`
- UNIQUE `(external_id, company_id)` ← adicionada nesta feature
- Colunas: external_id, name, type, image_url, headline, text, call_to_action, status, campaign_id (uuid interno), company_id, platform, detected_media_type
- RLS por company_id

## Components

### Edge Function `meta-sync`
- Resolve user -> profile -> organization -> company
- Decrypt integration token
- Itera ad accounts em batches de 5
- `syncAccount(supabase, token, integrationId, companyId, accountId, accountName, stats)`:
  1. **campaigns:** GET + upsert + popular `campaignIdMap` (external_id -> uuid)
  2. **insights:** GET 30d daily ad-level + insert snapshot em campaign_metrics
  3. **ads + creatives:** GET ads com creative inline + upsert creatives vinculando campaign_id interno

### Frontend
| Arquivo | Responsabilidade |
|---------|------------------|
| `src/hooks/use-campaigns.ts` | useCampaigns, useCampaignMetrics(days), useCreatives — staleTime 30s |
| `src/hooks/use-meta-connect.ts` | syncMutation com invalidacao |
| `src/pages/Integrations.tsx` | Botao Sincronizar com loading state |
| `src/components/DashboardView.tsx` | KPIs agregados + tabela campanhas com loading/empty |
| `src/components/CreativesView.tsx` | Grid de criativos com imagens reais |

## Data Flow para Views

```
useCampaignMetrics(30) -> array MetricRow
        |
        v
totals = reduce(metrics, sum impressoes/cliques/investimento/conversas)
        |
        v
4 StatCards

metricsByCampaign = Map<campanha_name, {spend, conv, roas}>
        |
        v
campaigns.map -> tabela linhas (join via name)
```

## Trade-offs

- **Insights snapshot vs upsert:** Insert append-only e mais simples e permite auditoria de syncs. Custo: tabela cresce; mitigar com pg_cron purge futuro.
- **Join campanha por nome (string):** Frangil se nome mudar entre syncs. Alternativa futura: join por external_id (requer adicionar coluna campaign_external_id em campaign_metrics).
- **Sync manual vs cron:** Manual primeiro para validar UX; cron sera adicionado depois com pg_cron.
- **BATCH_SIZE = 5:** Conservador para empresas com 100+ ad accounts; pode subir apos profiling.
