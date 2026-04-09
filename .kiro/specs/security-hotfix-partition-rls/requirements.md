# Requirements: Hotfix RLS particoes campaign_metrics

> **Status:** AS-BUILT (hotfix critico aplicado em 2026-04-06)
> **Severidade:** P0 — multi-tenant data leak
> **Owner:** Captain America (SECURITY)

## Introduction

Bug surfou no Supabase advisor durante review da spec `meta-scan-observability`. As 12 particoes filhas de `campaign_metrics` (criadas em `deep_scan_09_partition_campaign_metrics`) tinham `rowsecurity=false`, permitindo `SELECT * FROM campaign_metrics_p_2026_04` direto via PostgREST e bypassando as policies do parent.

## Requirements

### Requirement 1: Habilitar RLS em todas particoes existentes

#### Acceptance Criteria
1. Todas as 15 particoes `campaign_metrics_p_*` shall ter `rowsecurity=true` E `forcerowsecurity=true`
2. The system shall **nao** criar policies nas particoes — bloqueio default e suficiente (acesso via parent usa policies do parent)
3. Service role bypass continua funcionando (Edge Functions usam service_role)

### Requirement 2: Garantir RLS em particoes futuras

#### Acceptance Criteria
1. The function `create_next_campaign_metrics_partition()` shall executar `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` apos `CREATE TABLE ... PARTITION OF` para particoes mensais novas
2. The cron `campaign-metrics-create-partition` shall continuar funcionando sem mudancas

## Validation

- Antes: 15 lints `rls_disabled_in_public` ERROR-level (das 12 particoes mensais + 3 que ja existiam)
- Depois: 0 ERRORs nas particoes; 15 INFOs `rls_enabled_no_policy` (intencional — bloqueio total via PostgREST direto)
