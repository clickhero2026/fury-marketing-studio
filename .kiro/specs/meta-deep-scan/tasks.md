# Tasks: Meta Deep Scan

> **Status:** DRAFT — aguardando aprovacao
> **Idioma:** pt-BR
> **Estimativa:** ~20 tasks atomicas, agrupadas em 5 fases

## Fase 1 — Schema base (Thor) ✅ CONCLUIDA 2026-04-06

- [x] 1.1 Migration: ALTER `integrations` (next_scan_at, last_deep_scan_at) + indice partial
- [x] 1.2 Migration: ALTER `meta_ad_accounts` (balance, spend_cap, timezone_name, amount_spent, funding_source, account_status_code, last_scanned_at, deleted_at) + UPDATE is_active->deleted_at
- [x] 1.3 Migration: ALTER `meta_pages` (verification_status, category_list, fan_count, followers_count, link, picture_url, last_scanned_at, deleted_at)
- [x] 1.4 Migration: CREATE `meta_business_managers` + RLS + indices + UNIQUE
- [x] 1.5 Migration: CREATE `adsets` + RLS + indices + UNIQUE + FK campaign_id
- [x] 1.6 Migration: CREATE `meta_pixels` + RLS + indices + UNIQUE
- [x] 1.7 Migration: CREATE `meta_api_rate_limit` + RLS + UNIQUE
- [x] 1.8 Migration: CREATE `meta_scan_logs` + RLS SELECT + indices
- [x] 1.9 Cap America revisa todas as RLS policies — VALIDADO (5 tabelas com RLS, 5 policies, current_user_company_id() existe)

## Fase 2 — Particionamento campaign_metrics ✅ CONCLUIDA 2026-04-06

> **Nota:** Tabela tinha apenas 4 rows, entao Fase A+B foram colapsadas em uma unica migration atomica `deep_scan_09_partition_campaign_metrics`. PK ajustada de `(id)` para `(id, data)` (exigencia do Postgres para particionamento).

- [x] 2.1+2.2+2.4 Migration unica: CREATE particionada + 15 particoes (2025_04..2026_06) + backfill 4 rows + recriar 5 indices + RLS + 4 policies + RENAME swap atomico
- [x] 2.3 Validacao: row count match (4=4), 15 particoes criadas, partition pruning confirmado via EXPLAIN (so toca particao do mes)
- [x] 2.5 Smoke test: campaign_metrics sustenta SELECT/INSERT, RLS ativa, 4 policies recriadas
- [x] 2.6 pg_cron `campaign-metrics-create-partition` (mensal, dia 25) — funcao SECURITY DEFINER + agendamento OK
- [ ] 2.7 (Apos 7d) Migration Fase C: DROP `campaign_metrics_old` — aguardando validacao em prod

## Fase 3 — Edge Function meta-deep-scan ✅ CONCLUIDA 2026-04-06

- [x] 3.1 Estrutura inicial com auth dual (JWT ou x-cron-secret) + resolve company_id + decrypt token
- [x] 3.2 Helper `callMeta()` com rate limit tracking
- [x] 3.3 Helper `isFresh()` com tiers 6h/24h/7d
- [x] 3.4 Helper `softDeleteSweep()` + revival idempotente
- [x] 3.5 `syncBMs()`
- [x] 3.6 `enrichAdAccount()` com conversao cents->reais
- [x] 3.7 `syncAdsets()` com map external_id->campaign_id
- [x] 3.8 `syncPixels()`
- [x] 3.9 `enrichPages()` com tier 6h
- [x] 3.10 Orquestrador `deepScan()` com timeout guard 120s
- [x] 3.11 Finalizacao com scan_log + next_scan_at + jitter
- [x] 3.12 Deploy (--no-verify-jwt, auth custom dentro da funcao)

## Fase 4 — Cron e jobs ✅ CONCLUIDA 2026-04-06

- [x] 4.1 CRON_SECRET gerado e armazenado em Vault + configurado em Supabase secrets
- [x] 4.2 pg_cron `meta-deep-scan-tick` (`*/15 * * * *`) — funcao `trigger_meta_deep_scan_tick()` le Vault + dispara via net.http_post
- [x] 4.3 pg_cron `meta-scan-logs-purge` (mensal dia 1 04h)
- [ ] 4.4 Vision monitora primeiras 2h em producao (pendente — quando houver integracao real ativa)

## Fase 5 — Frontend ✅ CONCLUIDA 2026-04-06

- [x] 5.1 `src/hooks/use-deep-scan.ts` com mutation + invalidacao de 6 queryKeys
- [x] 5.2 Botao "Varredura Profunda" em Integrations.tsx com icone Radar
- [x] 5.3 Toast resultado com stats + skipped_fresh + timeout_hit
- [x] 5.4 Error toast descritivo

## Fase 6 — Quality Loop (Hulk) ✅ PARCIAL (smoke tests aguardam ambiente)

- [x] 6.1 `npm run build` verde (33.9s, 0 TS errors)
- [ ] 6.2 Smoke test manual (aguarda conta Meta real)
- [ ] 6.3 Verificar soft delete (requer teste em prod)
- [ ] 6.4 Verificar revival (requer teste em prod)
- [ ] 6.5 Verificar freshness tier (requer teste em prod)
- [ ] 6.6 Verificar timeout guard (requer teste em prod)
- [ ] 6.7 Verificar cron tick (aguarda 15min + integracao ativa)
- [x] 6.8 Verificar particionamento: EXPLAIN confirma partition pruning (so toca 1 particao por mes)
- [x] 6.9 Steering atualizado em `implemented-features.md`

## Fase 7 — DROP COLUMN is_active (Migration separada, apos validacao em prod)

- [ ] 7.1 Confirmar com usuario que `deleted_at` esta funcionando ha 7+ dias
- [ ] 7.2 Migration: ALTER TABLE meta_ad_accounts DROP COLUMN is_active
- [ ] 7.3 Migration: ALTER TABLE meta_pages DROP COLUMN is_active
- [ ] 7.4 Verificar que nenhum codigo no projeto referencia `is_active` dessas 2 tabelas

## Resumo de dependencias

```
Fase 1 (schema base)
  └─> Fase 3 (Edge Function depende de tabelas existirem)
       └─> Fase 4 (cron chama Edge Function)
            └─> Fase 5 (UI chama Edge Function tambem)

Fase 2 (particionamento) — paralelo a Fase 3, mas Fase B precisa janela
Fase 6 (Hulk) — depende de Fase 1-5 concluidas
Fase 7 — depende de Fase 6 + 7d de validacao
```

## Total

**~33 tasks atomicas** distribuidas em 7 fases. Estimativa de ordem de grandeza:
- Fase 1: 9 migrations + 1 review = 1 sessao
- Fase 2: particionamento delicado = 1 sessao + 7d wait + 1 cleanup
- Fase 3: 12 tasks = 1-2 sessoes (Edge Function)
- Fase 4: 4 tasks cron = 0.5 sessao
- Fase 5: 4 tasks UI = 0.5 sessao
- Fase 6: 9 tasks QA = 1 sessao
- Fase 7: cleanup pos-validacao = 0.25 sessao
