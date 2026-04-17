# Requirements: Orcamento Smart v0

> **Status:** APPROVED (fast-track)
> **Criado:** 2026-04-13
> **Owner:** Thor + Iron Man + Claude AI

## Introducao

Wizard de metas que transforma "quero 100 leads/semana" em recomendacao concreta de orcamento usando historico do tenant + IA. Reduz ansiedade e friccao na configuracao de campanhas.

## Adaptacoes do Roadmap

- Meta Budget API → `campaign_metrics` existente (ja temos custo_conversa = CPL historico)
- Claude API → reuso ANTHROPIC_API_KEY Vault
- Slider real-time → calculo client-side (sem chamada API por slide)
- Claude so ao finalizar → evita burn de tokens

## Requirements

### REQ-1: Benchmarks historicos por tenant

**Objetivo:** Como sistema, quero agregar CPL/CPA historico por objetivo pra projetar resultados.

#### Criterios de Aceite
1. Tabela `budget_benchmarks` com: `company_id`, `objective`, `avg_cpl` (custo por conversao), `avg_cpa` (custo por aquisicao), `avg_roas`, `samples_count` (dias de dados), `total_spend`, `last_calculated_at`
2. RPC `refresh_budget_benchmarks(company_id)` que agrega ultimos 30 dias de `campaign_metrics` x `campaigns` (join via external_id)
3. Benchmark global fallback quando tenant tem < 7 dias de dados — valores de mercado por vertical
4. Executar refresh na primeira chamada do wizard OU no background via cron (opcional v1)

### REQ-2: Wizard UI 3 passos

**Objetivo:** Como gestor, quero chegar de "objetivo" a "recomendacao de orcamento" em 3 passos.

#### Criterios de Aceite
1. **Passo 1** — Objetivo: selecionar um de `Leads | Vendas | Trafego | Engajamento` (botoes grandes com icones)
2. **Passo 2** — Meta: input numerico "Quantos [leads/vendas] voce quer por semana?"
3. **Passo 3** — Slider de investimento:
   - Range min 70 (R$ 10/dia x 7 dias) ate 10.000/semana
   - Ao mover, exibe em tempo real:
     - Volume esperado: `budget / avg_cpl`
     - Faixa de confianca: `±20%` baseado em desvio do historico
     - Indicador visual: verde se atinge meta, amarelo se perto, vermelho se insuficiente
4. Botao "Gerar Recomendacao com IA" dispara Claude
5. Card de insight com: budget recomendado + justificativa + alertas (CPL alto, meta irrealista)

### REQ-3: Recomendacao via Claude API

**Objetivo:** Como sistema, quero que Claude analise contexto e retorne recomendacao acionavel.

#### Criterios de Aceite
1. Edge Function `budget-recommend` recebe: `objective`, `goal_per_week`, `current_budget_weekly`
2. Busca benchmarks + historico das ultimas 3 campanhas similares
3. Prompt estruturado pedindo JSON: `{ recommended_budget_weekly, recommended_daily, projected_volume, projected_range, justification, alerts[] }`
4. Alertas automaticos:
   - Se CPL > 2x mediana de mercado: "CPL 40% acima da media"
   - Se goal > budget * 1.5 / cpl: "Meta pode ser irrealista"
   - Se samples < 7: "Historico limitado, recomendacao baseada em benchmarks"
5. Latencia alvo: < 5s

### REQ-4: Limites e guardrails

#### Criterios de Aceite
1. Budget minimo: R$ 10/dia (R$ 70/semana) — Meta API limit
2. Budget maximo: R$ 100.000/semana (sanity check)
3. Disclaimer sempre visivel: "Projecoes baseadas em historico. Resultados reais podem variar."
4. Se tenant sem dados E sem benchmark de mercado disponivel: bloquear calculo, sugerir conectar conta

### REQ-5: Integracao com Publisher

**Objetivo:** Quando gestor sai do Budget Smart, levar o resultado ao Campaign Publisher.

#### Criterios de Aceite
1. Botao "Usar este orcamento em nova campanha" preenche adset.daily_budget no Publisher wizard
2. Estado passado via query param OU localStorage (simples, sem novo store)

## Non-Functional Requirements

- Slider update < 300ms (client-side calc)
- Recomendacao IA < 5s
- Benchmark fallback de mercado em valores realistas pt-BR (ex: Leads R$ 15, Vendas R$ 30, Trafego R$ 2)
- Multi-tenancy via RLS
