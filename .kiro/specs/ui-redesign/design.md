# UI Redesign — Design

> Status: DRAFT (aguardando aprovacao)

## Aesthetic Thesis: "Editorial Fintech"

**Referencias visuais:** Linear (hierarquia), Vercel Analytics (charts), Stripe
Dashboard (densidade profissional), Attio (tipografia), Ramp (numbers as heroes).

**Principios:**
1. **Numbers are heroes** — valores KPI sao o foco, tipografia tabular grande
2. **Whitespace generoso** — densidade informacional sim, mas sem sufocar
3. **Micro-ornamento com proposito** — sparklines, progress rings, trend arrows
4. **Cor como sinal, nao decoracao** — laranja so pra primary actions + hero numbers
5. **Monocromatico + 1 acento** — grays sao a estrutura, laranja e o spotlight

## DFII Evaluation (Frontend Design Skill)

| Dimensao | Score | Nota |
|----------|-------|------|
| Aesthetic Impact | 4/5 | "Editorial Fintech" e distintivo vs SaaS generico |
| Context Fit | 5/5 | Perfeito para ferramenta B2B de gestor de trafego |
| Implementation Feasibility | 4/5 | Tudo em Tailwind + shadcn, sem libs exoticas |
| Performance Safety | 5/5 | Sparklines em SVG lean, zero motion libs pesadas |
| Consistency Risk | -2 | Risco medio — precisa disciplina em 9 views |
| **TOTAL DFII** | **16** | **Excelente — executar** |

## Design System Tokens (novos/expandidos)

### Tipografia
```css
/* Adicional: JetBrains Mono para numeros tabulares */
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');

--font-sans: 'Inter', system-ui, sans-serif;
--font-mono: 'JetBrains Mono', ui-monospace, monospace;

/* Scale */
--text-display: 2.5rem;   /* 40px — KPI hero */
--text-h1: 1.875rem;      /* 30px — page title */
--text-h2: 1.5rem;        /* 24px — section */
--text-h3: 1.125rem;      /* 18px — card title */
--text-body: 0.9375rem;   /* 15px — base */
--text-small: 0.8125rem;  /* 13px — labels */
--text-xs: 0.75rem;       /* 12px — meta */
```

### Gray Scale (9 steps)
```css
--gray-50:  #fafafa;
--gray-100: #f4f4f5;
--gray-200: #e4e4e7;
--gray-300: #d4d4d8;
--gray-400: #a1a1aa;
--gray-500: #71717a;
--gray-600: #52525b;
--gray-700: #3f3f46;
--gray-800: #27272a;
--gray-900: #18181b;
```

### Elevations
```css
--shadow-1: 0 1px 2px 0 rgb(0 0 0 / 0.03);
--shadow-2: 0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04);
--shadow-3: 0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.04);
--shadow-4: 0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.04);
--shadow-5: 0 20px 25px -5px rgb(0 0 0 / 0.10), 0 8px 10px -6px rgb(0 0 0 / 0.04);
```

### Motion
```css
--ease-smooth: cubic-bezier(0.16, 1, 0.3, 1);
--duration-fast: 150ms;
--duration-base: 200ms;
--duration-slow: 400ms;
```

## Layout: Dashboard (showcase)

```
+------------------------------------------------------------------+
|  Dashboard                             [Hoje|7d|30d] [Filtros]   |
|  Visao geral das campanhas Meta Ads              [Ao vivo 5min]  |
+------------------------------------------------------------------+
|                                                                  |
|  +----------------+ +----------------+ +----------------+        |
|  |  ROAS          | |  LUCRO         | |  INVESTIMENTO  |        |
|  |                | |                | |                |        |
|  |  4.2x          | |  R$ 12.840     | |  R$ 2.686      |        |
|  |  ↑ +18%        | |  ↑ R$ 2.100    | |  ↓ -R$ 310     |        |
|  |  ___/\___--    | |  --/\_/--      | |  \__-^--       |        |
|  +----------------+ +----------------+ +----------------+        |
|                                                                  |
|  +-------------+ +-------------+ +-------------+                 |
|  | ROI         | | LEADS       | | CPA         |                 |
|  | -100%       | | 56          | | R$ 48       |                 |
|  | vs 30d      | | +12         | | -R$ 4       |                 |
|  +-------------+ +-------------+ +-------------+                 |
|                                                                  |
|  +------------------------------+ +-----------------------+      |
|  | Investimento vs Conversas    | | Timeline FURY         |      |
|  | [line chart com gradient]    | | • acao recente        |      |
|  |                              | | • acao recente        |      |
|  +------------------------------+ +-----------------------+      |
+------------------------------------------------------------------+
```

**KPI Card Tier 1 anatomy:**
```tsx
<Card className="relative overflow-hidden p-6 bg-card border-border/60 shadow-sm hover:shadow-md transition-shadow">
  <div className="flex items-center justify-between mb-4">
    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
      ROAS
    </span>
    <Icon className="w-4 h-4 text-primary/60" />
  </div>

  <div className="font-mono text-4xl font-semibold tabular-nums tracking-tight">
    4.2<span className="text-2xl text-muted-foreground">x</span>
  </div>

  <div className="mt-2 flex items-center gap-1.5 text-sm">
    <TrendUp className="w-3.5 h-3.5 text-emerald-600" />
    <span className="font-medium text-emerald-600">+18%</span>
    <span className="text-muted-foreground">vs 30d</span>
  </div>

  <div className="mt-4 -mx-6 -mb-6 h-12">
    <Sparkline data={...} color="currentColor" className="text-primary/30" />
  </div>
</Card>
```

## Componentes Refinados (overrides shadcn)

### Button primary
- Background: `linear-gradient(135deg, #cf6f03 0%, #e8850a 100%)`
- Inner shadow sutil: `inset 0 1px 0 rgb(255 255 255 / 0.15)`
- Hover: levanta 1px + shadow-3
- Active: scale 0.98

### Card
- Border: `1px solid hsl(var(--border) / 0.5)`
- Default: shadow-1
- Hover (se interactive): shadow-3

### Badge variants
- success: `bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/10`
- warning: `bg-amber-50 text-amber-700 ring-1 ring-amber-600/10`
- danger: `bg-red-50 text-red-700 ring-1 ring-red-600/10`
- info: `bg-blue-50 text-blue-700 ring-1 ring-blue-600/10`
- enterprise: `bg-primary/10 text-primary ring-1 ring-primary/20 animate-pulse-soft`

## Arquivos Afetados

### Core (tokens + base)
- `src/index.css` — tokens expandidos, fonts, utilities
- `tailwind.config.ts` — font-mono, shadow scale, duration

### Componentes base (shadcn overrides)
- `src/components/ui/button.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/badge.tsx`
- `src/components/ui/dialog.tsx`

### Novos componentes
- `src/components/shared/PageHeader.tsx`
- `src/components/shared/KpiCard.tsx` (tier 1)
- `src/components/shared/KpiCardCompact.tsx` (tier 2)
- `src/components/shared/Sparkline.tsx`
- `src/components/shared/TrendIndicator.tsx`

### Views
- `src/components/DashboardView.tsx` — reestrutura KPIs + charts
- `src/components/ChatView.tsx`
- `src/components/CreativesView.tsx`
- `src/components/AnalysisView.tsx`
- `src/components/ComplianceView.tsx`
- `src/components/FuryView.tsx` (se existir)
- `src/components/PublisherView.tsx`
- `src/components/BudgetView.tsx`
- `src/pages/Integrations.tsx`

### Layout
- `src/components/AppSidebar.tsx` — refino do visual

## Estrategia de Implementacao (Incremental)

Nao e viavel fazer tudo em 1 sessao. Divido em **5 waves**:

**Wave 1 — Fundacao (1 sessao)**
- Tokens CSS novos
- Fonte JetBrains Mono
- Tailwind config
- Componentes ui base (Button, Card, Badge, Dialog refinements)
- PageHeader component

**Wave 2 — Dashboard (1 sessao)**
- KpiCard + KpiCardCompact + Sparkline + TrendIndicator
- DashboardView reestruturado (showcase)
- Charts refinados (Recharts theming)

**Wave 3 — Sidebar + Navigation (0.5 sessao)**
- AppSidebar refino
- UserMenu, OrganizationSwitcher

**Wave 4 — Views funcionais (2 sessoes)**
- Chat, Criativos, Analise, Compliance, FURY, Publicar, Orcamento

**Wave 5 — Integracoes + Polish (1 sessao)**
- Integrations page refresh
- Motion tuning
- A11y audit final

Total estimado: ~5 sessoes. Cada wave termina com build verde + screenshot
da mudanca.

## Trade-offs

- **Font extra (JetBrains Mono)**: +20KB woff2. Mitigacao: `display: swap` +
  preload seletivo.
- **Sparklines em todos KPIs**: custo de render. Mitigacao: virtualizar se 20+
  cards; usar SVG estatico pra <10.
- **Redesign em 9 views**: risco de inconsistencia. Mitigacao: PageHeader +
  KpiCard compartilhados, design tokens como fonte unica.
- **Mudanca visual grande pode assustar user**: cada wave tem diff visual
  reviewable; nada e merged sem aprovacao.
