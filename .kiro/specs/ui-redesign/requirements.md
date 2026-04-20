# UI Redesign — Requirements

> Status: DRAFT (aguardando aprovacao)
> Criado: 2026-04-20
> Language: pt-BR

## Problema

Usuario reportou que o design atual do ClickHero esta "horrivel":
- Dashboard com KPIs cramped (6 colunas em linha, cada card minusculo)
- Tipografia do VALOR do KPI fraca (sem peso, sem contraste vs label)
- Label "Investi..." truncado por falta de espaco
- "vs periodo anterior" quebra em 3 linhas verticalmente
- Zero hierarquia entre KPIs principais vs secundarios
- Cards todos iguais, sem personalidade
- Charts com labels minusculos e sem refinamento
- Badges ("Ao vivo") deslocados, sem integracao visual

## Objetivo

Elevar o app a patamar de ferramenta profissional premium (referencia: Linear,
Vercel, Stripe Dashboard, Attio), mantendo a identidade ClickHero:
- Paleta: preto #0c0d0a + branco #ecedef + laranja #cf6f03
- Fonte: Inter (primary) + monospace pra numeros

## Direcao Aesthetica

**"Editorial Fintech"** — premium, denso de informacao, mas respiravel.
Numeros sao os herois: tipografia tabular grande, com hierarquia clara.
Whitespace generoso. Micro-decoracoes que servem ao conteudo (sparklines,
progress bars, dots de status).

## Requisitos (EARS)

### REQ-1 — Design System Tokens Expandidos
**Quando** o app for carregado,
**o sistema deve** aplicar tokens CSS expandidos com:
- Paleta mantida (laranja/preto/creme)
- 9 steps de gray (vs 3 atuais)
- Tipografia escalada: display / heading / body / caption / mono
- Font adicional tabular (JetBrains Mono ou Geist Mono) para numeros
- Elevations (shadow scale 1-5)
- Duration/easing tokens para motion consistente

### REQ-2 — KPI Cards Redesenhados
**Quando** o user visitar o Dashboard,
**o sistema deve** exibir KPIs em 2 tiers:
- **Tier 1** (3 cards grandes top): ROAS, Lucro, Investimento — com sparkline,
  trend arrow, delta absoluto + percentual, label primario grande
- **Tier 2** (3 cards menores below): ROI, Leads, CPA — compactos, sem sparkline,
  so numero + delta

### REQ-3 — Charts Refinados
**Quando** o user visualizar o grafico "Investimento vs Conversas",
**o sistema deve**:
- Usar Recharts com theming consistente (cores da paleta)
- Axis labels com tipografia tabular
- Tooltip com fundo glass + shadow
- Grid lines muito sutis (5% opacity)
- Linha com gradient + area fill com gradient fade

### REQ-4 — Sidebar Refinada
**Quando** a sidebar for exibida,
**o sistema deve**:
- Badge com logo mais proeminente
- OrganizationSwitcher com chip enterprise animado
- Botao "Nova conversa" com gradient refinado + hover state
- Items do menu com indicador animado de selecao (dot/bar lateral)
- UserMenu no footer com avatar colorido + email truncado
- Sem quebras em resolucoes entre 1280-1920px

### REQ-5 — Page Header Consistente
**Quando** qualquer view principal for carregada,
**o sistema deve** renderizar um header padrao:
- Titulo display (text-3xl/4xl, font-semibold, tracking-tight)
- Descricao muted abaixo
- Acoes a direita (badges, filtros, botoes)
- Alinhamento preciso com grid do conteudo

### REQ-6 — Componentes UI Base Refinados
**Quando** componentes shadcn forem usados,
**o sistema deve** ter overrides de theme para:
- Button: primary com gradient laranja + subtle inner shadow, secondary ghost
- Card: border mais sutil + elevation 1 default, elevation 2 on hover
- Input: focus ring laranja translucent
- Badge: variantes semanticas (success/warning/danger/info) com cores da paleta
- Dialog: backdrop blur + slide-up refinado
- Toast: side-right + border lateral colorido por severity

### REQ-7 — 8 Views Re-skinned
**Quando** cada view principal for visitada,
**o sistema deve** aplicar o redesign:
- Dashboard (prioritario — print do usuario)
- Chat/Assistente IA
- Criativos
- Analise
- Compliance
- FURY
- Publicar
- Orcamento Smart
- Integracoes

### REQ-8 — Motion e Micro-interacoes
**Quando** o user interagir com a UI,
**o sistema deve** ter:
- Fade-in 200ms em mounts
- Scale 0.98 on press (buttons, cards clicaveis)
- Skeleton com shimmer sutil em loading states
- Page transitions suaves (opacity + translateY)

### REQ-9 — Acessibilidade Mantida/Melhorada
**Quando** componentes forem redesenhados,
**o sistema deve** preservar:
- Contraste minimo 4.5:1 para texto normal
- Focus rings visiveis
- Touch targets >= 44x44px
- aria-labels em icon-only buttons
- Navegacao teclado funcional

### REQ-10 — Responsividade
**Quando** o app for visualizado entre 1280px e 2560px,
**o sistema deve** escalar fluidamente sem quebras:
- Dashboard KPI grid: 3 cols em <1440px, 3 cols em >=1440px (ambos tier 1)
- Tier 2 KPIs: 3 cols sempre
- Sidebar 200-260px
- Max-width do conteudo 1600px com padding responsivo

## Nao-requisitos

- Nao mudar a identidade da marca (laranja/preto/creme fica)
- Nao trocar stack (shadcn/ui continua, Tailwind continua)
- Nao mudar funcionalidades — apenas visual
- Nao fazer dark mode agora (futuro)
- Nao mudar estrutura de rotas/navegacao
