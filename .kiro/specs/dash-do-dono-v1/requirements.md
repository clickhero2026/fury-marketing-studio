# Requirements: Dash do Dono v1

> **Status:** APPROVED (fast-track)
> **Criado:** 2026-04-17
> **Owner:** Iron Man (FRONTEND)
> **Prioridade:** P0 — "primeiro AHA moment" do produto

## Introducao

Dashboard principal: KPIs financeiros (ROI/Lucro/Investimento/Leads/CPL/ROAS), filtros de periodo+conta+campanha, 3 graficos Recharts, e timeline FURY. Substitui o `DashboardView.tsx` atual (que e basico).

## Adaptacoes

- Meta Insights API → `campaign_metrics` existente (ja sincronizado)
- "Receita atribuida" → `website_purchase_roas * investimento` por dia (Meta ja atribui)
- FURY timeline → reusar `useFuryActions()` ja implementado
- Scroll infinito → limit 50 + "Ver mais" (simples v1)

## Requirements

### REQ-1: 6 KPIs de Destaque

#### Criterios de Aceite
1. Cards destaque: **ROI%**, **Lucro R$**, **Investimento R$**, **Leads**, **CPL/CPA medio**, **ROAS**
2. Cada card com:
   - Valor principal formatado (R$ ou numero ou %)
   - Comparativo ↑/↓ vs periodo anterior (mesma duracao)
   - Cor: verde se melhor, vermelho se pior, cinza se igual
   - Icone
3. Calculos:
   - `receita = sum(investimento * website_purchase_roas)` por linha
   - `lucro = receita - investimento`
   - `roi = lucro / investimento * 100`
   - `cpl = investimento / leads`
4. Skeleton durante loading, estado de erro com retry, estado empty se sem dados

### REQ-2: Filtros

#### Criterios de Aceite
1. **Seletor de periodo**: chips "Hoje | 7d | 30d | Personalizado" (calendar picker se personalizado)
2. **Filtro conta**: multi-select de `meta_ad_accounts` (se tenant tem 2+ contas)
3. **Filtro campanha**: multi-select das campanhas ativas no periodo
4. Mudanca de filtro recalcula **todos** os KPIs + graficos + timeline (cliente-side)
5. Estado dos filtros em `useState` (sem URL/localStorage v1)

### REQ-3: 3 Graficos Recharts

#### Criterios de Aceite
1. **Linha** — Investimento (azul) vs Conversoes (verde) nos ultimos 30 dias. 2 eixos Y. ResponsiveContainer
2. **Barras** — Top 5 campanhas por conversao. Horizontal (nomes longos). Cores gradient
3. **Pizza** — Distribuicao de investimento por campanha. Top 5 + "Outros". Labels em %
4. Graficos respeitam filtros ativos
5. Tooltip customizado pt-BR com formatacao R$ e numeros abreviados (K/M)

### REQ-4: Timeline FURY

#### Criterios de Aceite
1. Lista das ultimas **20 acoes** de `fury_actions` (reusar `useFuryActions()` com limit 20)
2. Cada item: icone por tipo (⏸️ pause, 📈 suggest, ⚠️ alert, ▶️ revert), descricao humanizada, tempo relativo
3. Exemplos:
   - "⏸️ Pausei **Oferta Verao** — Frequencia 3.8 > 3.0 por 3 dias"
   - "📈 Sugiro aumentar orcamento de **Black Friday** — CPA R$25 abaixo do target"
4. Botao "Ver todos" → leva pra tab FURY
5. Estado empty: "Nenhuma acao registrada. O FURY roda a cada hora."

### REQ-5: Performance + Real-time

#### Criterios de Aceite
1. `useCampaignMetrics`, `useCampaigns`, `useFuryActions` ja tem cache — adicionar `refetchInterval: 300_000` (5 min) nos 3
2. **Skeleton** especifico por bloco (cards, graficos, timeline) — nao bloqueia tudo com 1 spinner
3. Erro com **Tentar Novamente** por bloco
4. TanStack Query ja compartilha cache entre componentes — navegar nao re-busca

### REQ-6: Responsividade

#### Criterios de Aceite
1. **Desktop (≥1280px)**: KPIs em 6 colunas, graficos 2x1 + timeline lateral
2. **Tablet (768-1279)**: KPIs em 3 colunas, graficos empilhados, timeline abaixo
3. **Mobile (<768)**: KPIs 2 colunas, graficos 1/tela, timeline compact

## Non-Functional Requirements

- Build size: graficos via import dinamico se recharts > 100KB delta — check
- Acessibilidade: keyboard nav nos filtros, aria-label nos KPIs
- pt-BR consistente: `R$ 1.234,56`, `1,2K`, `12,5%`
