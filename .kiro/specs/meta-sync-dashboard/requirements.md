# Requirements: Meta Sync + Dashboard/Criativos com Dados Reais

> **Status:** AS-BUILT
> **Criado:** 2026-04-06
> **Idioma:** pt-BR

## Introduction

Sincronizar campanhas, insights diarios (30 dias) e criativos da Meta Graph API para tabelas locais Supabase, e conectar as views Dashboard e Criativos para consumir esses dados reais (substituindo mocks). Permite que o usuario veja KPIs e criativos reais imediatamente apos clicar "Sincronizar".

## Requirements

### Requirement 1: Sync Campaigns

**Objective:** Como usuario que conectou Meta, quero clicar "Sincronizar" e ver minhas campanhas reais no dashboard.

#### Acceptance Criteria
1. When o usuario clica "Sincronizar", the system shall chamar Edge Function `meta-sync` com Authorization Bearer
2. The system shall buscar `act_<id>/campaigns` para cada ad account ativa em `meta_ad_accounts`
3. The system shall fazer upsert em `campaigns` com `onConflict: external_id,company_id`
4. The system shall mapear: external_id, name, status, effective_status, objective, buying_type, daily_budget/100, lifetime_budget/100, budget_remaining/100
5. The system shall preencher `company_id`, `integration_id`, `account` (act_id), `platform='meta'`

### Requirement 2: Sync Daily Insights (30 dias)

**Objective:** Como usuario, quero ver metricas diarias reais (impressoes, cliques, gasto, conversas, ROAS).

#### Acceptance Criteria
1. The system shall buscar `act_<id>/insights?date_preset=last_30d&time_increment=1&level=ad` por ad account
2. The system shall extrair: impressions, clicks, spend, cpm, cpc, ctr, reach, frequency, unique_clicks, unique_ctr, quality_ranking, engagement_rate_ranking, conversion_rate_ranking
3. The system shall extrair `conversas_iniciadas` de `actions[onsite_conversion.messaging_conversation_started_7d]`
4. The system shall extrair `custo_conversa` de `cost_per_action_type` correspondente
5. The system shall extrair `website_purchase_roas[0].value`
6. The system shall INSERT em `campaign_metrics` (sem dedup — cada sync e snapshot)
7. The system shall preencher `company_id`, `source='meta_api'`, `sync_batch=now()`

### Requirement 3: Sync Ads + Creatives

**Objective:** Como usuario, quero ver os criativos reais com imagens, headlines e CTAs.

#### Acceptance Criteria
1. The system shall buscar `act_<id>/ads?fields=...,creative{id,name,title,body,image_url,video_id,call_to_action_type,object_type}`
2. The system shall mapear: external_id (creative.id), name, type, image_url, headline (title), text (body), call_to_action
3. The system shall detectar `detected_media_type`: 'video' se video_id, 'image' se image_url, senao 'unknown'
4. The system shall fazer upsert em `creatives` com `onConflict: external_id,company_id`
5. The system shall vincular ao `campaign_id` interno via map `external_id -> uuid`

### Requirement 4: Rate Limit Protection

**Objective:** Como sistema, quero evitar 429 da Meta API quando empresa tem muitas ad accounts.

#### Acceptance Criteria
1. The system shall processar ad accounts em batches de `BATCH_SIZE = 5`
2. The system shall usar `Promise.all` dentro do batch e loop sequencial entre batches
3. If qualquer account falhar, then the system shall registrar em `stats.errors` e continuar com as outras

### Requirement 5: Status & Feedback

**Objective:** Como usuario, quero feedback claro durante e apos a sincronizacao.

#### Acceptance Criteria
1. While sincronizando, the system shall mostrar botao em loading com "Sincronizando..."
2. After sucesso, the system shall mostrar toast com "${campaigns_synced} campanhas, ${metrics_synced} metricas, ${creatives_synced} criativos"
3. The system shall atualizar `integrations.last_sync` e `last_full_sync`
4. The system shall invalidar queries: `meta-integration`, `campaigns`, `campaign-metrics`, `creatives`

### Requirement 6: Dashboard com Dados Reais

**Objective:** Como usuario, quero ver KPIs e tabela de campanhas reais imediatamente apos sync.

#### Acceptance Criteria
1. The DashboardView shall consumir `useCampaigns()` e `useCampaignMetrics(30)`
2. The system shall agregar metrics dos 30 dias para os 4 KPI cards (impressoes, cliques, gasto BRL, conversas)
3. The system shall montar map `campanha -> {spend, conv, roas}` por nome de campanha
4. The system shall renderizar tabela com badge de status (ACTIVE = verde "Ativo", outros = cinza)
5. The system shall mostrar empty state "Nenhuma campanha sincronizada. Va em Integracoes e clique em Sincronizar."
6. The system shall mostrar loading spinner durante fetch

### Requirement 7: Criativos com Dados Reais

**Objective:** Como usuario, quero ver os criativos reais (com imagens) sincronizados.

#### Acceptance Criteria
1. The CreativesView shall consumir `useCreatives()`
2. The system shall renderizar grid 1/2/3 colunas responsivo
3. The system shall mostrar `image_url` real quando disponivel; fallback para icone Video/ImagePlus
4. The system shall mostrar headline, text (line-clamp-2) e call_to_action
5. The system shall mapear status ACTIVE/PAUSED/IN_PROCESS para badges com cores
6. The system shall mostrar empty state quando array vazio
7. The system shall remover area de upload mock (criativos vem da Meta)

## Non-Functional Requirements

- **Performance:** Sync de 5 ad accounts em < 30s
- **Idempotencia:** Multiplos syncs nao duplicam campaigns/creatives (upsert); metrics intencionalmente acumulam por sync_batch
- **Resiliencia:** Falha em 1 conta nao bloqueia outras
