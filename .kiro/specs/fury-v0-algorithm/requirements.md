# Requirements: FURY v0 — Algoritmo de Performance

> **Status:** APPROVED (fast-track)
> **Criado:** 2026-04-10
> **Owner:** Thor (BACKEND) + Iron Man (FRONTEND) + Nick Fury (ARCHITECT)
> **Prioridade:** P0 — coracao do produto, diferenciador vs ferramentas comuns

## Introducao

Motor de inteligencia FURY v0: regras deterministicas + historico 7 dias para avaliar anuncios e recomendar/executar acoes de otimizacao automaticamente. NAO e ML — validacao de hipoteses antes de investir em modelo (ML real no Sprint 3).

## Adaptacoes do Roadmap

- BullMQ → pg_cron `fury-evaluate-tick` a cada hora + Edge Function
- Meta Insights API → `campaign_metrics` ja coletado pelo meta-sync (nao re-busca)
- Feed real-time → tabela `fury_actions` + React Query refetchInterval 30s
- Desfazer → `revert_before` timestamp + POST Meta API status=ACTIVE/anterior

## Requirements

### REQ-1: Regras de performance configuraveis (toggles)

**Objetivo:** Como gestor, quero ativar/desativar regras de otimizacao e configurar thresholds.

#### Criterios de Aceite
1. The system shall ter tabela `fury_rules` com regras pre-definidas por empresa:
   - `saturation`: frequencia > X por Y dias consecutivos → pausar
   - `high_cpa`: CPA > threshold por Z dias → pausar ad set
   - `low_ctr`: CTR < X% por Yh → flag pra revisao
   - `budget_exhausted`: orcamento > 90% antes das 18h → alerta
   - `scaling_opportunity`: CPA 20% abaixo do target por 3 dias → sugerir aumento
2. Cada regra shall ter: `is_enabled boolean`, `threshold_value numeric`, `consecutive_days int`, `action_type` ('pause' | 'alert' | 'suggest')
3. The system shall seed regras default ao criar empresa (todas desabilitadas por padrao, exceto `high_cpa` e `saturation`)
4. The UI shall mostrar toggle + slider/input pra cada regra

### REQ-2: Avaliacao com historico 7 dias

**Objetivo:** Como sistema, quero calcular metricas movendo-se por janela de 7 dias pra detectar tendencias.

#### Criterios de Aceite
1. The Edge Function `fury-evaluate` shall agregar `campaign_metrics` dos ultimos 7 dias por campanha
2. Metricas calculadas: media de CTR, CPM, CPC, conversoes/dia, frequencia media, tendencia (% variacao dia-a-dia)
3. The system shall armazenar em `fury_evaluations` o snapshot por campanha por execucao
4. The system shall detectar tendencia positiva (melhora 3+ dias) e negativa (piora 3+ dias)
5. Dados insuficientes (< 3 dias de metricas) shall gerar avaliacao `insufficient_data` sem acao

### REQ-3: Motor de regras

**Objetivo:** Como sistema, quero aplicar as regras ativas contra as metricas calculadas e gerar acoes.

#### Criterios de Aceite
1. Para cada campanha, the system shall iterar regras ativas e verificar se a condicao e atendida
2. Each regra que dispara shall gerar entrada em `fury_actions` com:
   - `rule_id`, `campaign_id`, `metric_value`, `threshold_value`, `action_type`, `status` ('pending' | 'executed' | 'reverted')
3. When `action_type='pause'` AND regra tem `auto_execute=true`, the system shall pausar via Meta Graph API
4. When `action_type='alert'` ou `auto_execute=false`, the system shall apenas registrar como `pending`
5. The system shall NOT executar acao duplicada (se campanha ja foi pausada pela mesma regra nas ultimas 24h, skip)

### REQ-4: Execucao automatica + Desfazer

**Objetivo:** Como gestor, quero que acoes automaticas possam ser revertidas em ate 30 minutos.

#### Criterios de Aceite
1. Cada acao executada shall ter `revert_before` = created_at + 30 minutos
2. The UI shall mostrar botao "Desfazer" enquanto `revert_before > now()`
3. Ao desfazer, the system shall POST `/{campaign_id}?status=ACTIVE` na Meta API
4. The system shall marcar acao como `status='reverted'` + registrar nova acao de revert
5. Apos 30 minutos, botao desaparece e acao e considerada definitiva

### REQ-5: Cron horario

**Objetivo:** Como sistema, quero avaliar todas as contas ativas a cada hora.

#### Criterios de Aceite
1. The system shall criar pg_cron `fury-evaluate-tick` rodando a cada hora (`0 * * * *`)
2. O cron shall priorizar empresas com maior volume de investimento (ORDER BY total spend DESC)
3. The system shall processar max 100 campanhas por execucao (batch)
4. Dual auth: JWT (manual via UI) OR x-cron-secret
5. Scan log em `fury_scan_logs` (mesmo padrao compliance_scan_logs)

### REQ-6: Painel de Acoes (Feed FURY)

**Objetivo:** Como gestor, quero um feed das acoes tomadas/recomendadas pelo FURY.

#### Criterios de Aceite
1. Nova view "FURY" acessivel via sidebar (icone Zap/Brain)
2. Dashboard cards: acoes executadas hoje, alertas pendentes, campanhas otimizadas, economia estimada
3. Feed de acoes em lista: campanha, regra disparada, metrica violada, valor vs threshold, acao, timestamp, botao desfazer
4. Filtro por tipo: todos | executados | pendentes | revertidos
5. Configuracoes: toggle/threshold de cada regra
6. 4 estados visuais: Loading, Error, Empty, Data

### REQ-7: Seed de regras default

**Objetivo:** Como sistema, quero que toda nova empresa ja tenha regras pre-configuradas.

#### Criterios de Aceite
1. Seed 5 regras default pra cada empresa existente:
   - `saturation`: freq > 3.0, 3 dias, action=pause, auto_execute=false, enabled=true
   - `high_cpa`: CPA > 50 (BRL), 2 dias, action=pause, auto_execute=false, enabled=true
   - `low_ctr`: CTR < 0.5%, 2 dias, action=alert, auto_execute=false, enabled=false
   - `budget_exhausted`: budget > 90%, 1 dia, action=alert, auto_execute=false, enabled=false
   - `scaling_opportunity`: CPA < target -20%, 3 dias, action=suggest, auto_execute=false, enabled=false

## Non-Functional Requirements

- **Performance:** avaliacao de 100 campanhas < 30s (sem chamada externa — so banco)
- **Idempotencia:** mesma regra nao dispara 2x na mesma campanha em 24h
- **Auditoria:** TODA acao logada, imutavel, com snapshot de metricas no momento
- **Multi-tenancy:** RLS em todas tabelas
- **Preparado pra ML:** schema de `fury_evaluations` armazena features que serao input do modelo v1
