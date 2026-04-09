# Tasks: Meta Sync + Dashboard/Criativos Reais

> **Status:** AS-BUILT — todas concluidas

## Tasks

- [x] 1. Unique constraints (Thor)
  - ALTER TABLE campaigns ADD CONSTRAINT UNIQUE (external_id, company_id)
  - ALTER TABLE creatives ADD CONSTRAINT UNIQUE (external_id, company_id)
  - _Requirements: 1, 3_

- [x] 2. Edge Function `meta-sync` (Thanos)
  - Resolver user -> company_id
  - Decrypt token via RPC
  - Listar meta_ad_accounts WHERE is_active
  - Loop em batches de BATCH_SIZE=5 com Promise.all
  - syncAccount(): campaigns -> insights -> ads+creatives
  - Mapear external_id -> uuid para vincular creatives
  - Update integrations.last_sync e last_full_sync
  - Retornar stats {accounts_processed, campaigns_synced, metrics_synced, creatives_synced, errors[]}
  - _Requirements: 1, 2, 3, 4, 5_

- [x] 3. Hook `use-meta-connect.syncMutation` (Iron Man)
  - mutationFn: invoke meta-sync com Authorization
  - onSuccess: invalidateQueries [meta-integration, campaigns, campaign-metrics, creatives] + toast
  - Expor: sync, isSyncing
  - _Requirements: 5_

- [x] 4. Hook `use-campaigns.ts` (Iron Man)
  - useCampaigns(): query campaigns WHERE platform=meta
  - useCampaignMetrics(days=30): query campaign_metrics WHERE data >= now-30d
  - useCreatives(): query creatives WHERE platform=meta
  - staleTime 30s
  - _Requirements: 6, 7_

- [x] 5. Botao Sincronizar em `Integrations.tsx` (Iron Man)
  - Button com RefreshCw icon
  - Loading state via isSyncing
  - Texto dinamico Sincronizar / Sincronizando...
  - Disabled se nao isConnected
  - _Requirements: 5_

- [x] 6. `DashboardView.tsx` consumir dados reais (Iron Man)
  - useCampaigns + useCampaignMetrics(30)
  - Aggregations para 4 KPI cards
  - Map metricsByCampaign por nome
  - Loading e empty states
  - Formatadores BRL e numeros com K
  - _Requirements: 6_

- [x] 7. `CreativesView.tsx` consumir dados reais (Iron Man)
  - useCreatives()
  - Grid responsivo com image_url real
  - Status mapping ACTIVE/PAUSED/IN_PROCESS
  - Empty state
  - Remover area de upload mock
  - _Requirements: 7_

- [x] 8. Quality Loop (Hulk)
  - npm run build verde (15.7s)
  - Tipos OK
  - Funcional: connect -> select -> sincronizar -> dashboard atualiza
  - _Requirements: todos_
