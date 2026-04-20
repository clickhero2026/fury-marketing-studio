# UI Redesign — Tasks

> Status: DRAFT (aguardando aprovacao)

## Wave 1 — Fundacao
- [x] Adicionar import JetBrains Mono em index.css
- [x] Expandir tokens CSS: gray scale 9 steps, font-sans/mono, text-* scale, shadow-1..5, duration/ease
- [x] Atualizar tailwind.config.ts: extend fontFamily.mono, boxShadow.e1..e5, transitionDuration, keyframes
- [x] Refinar Button (primary gradient + inner shadow + scale press)
- [x] Refinar Card (border sutil, shadow-e1 default)
- [x] Expandir Badge com variantes semanticas + enterprise
- [x] Refinar Dialog (backdrop blur + shadow-e5 + rounded-xl)
- [x] Criar componente `src/components/shared/PageHeader.tsx` (titulo + descricao + actions slot)
- [x] Build verde + commit "wave 1 — design foundations"

## Wave 2 — Dashboard
- [ ] Criar `Sparkline.tsx` (SVG minimalista, gradient fill)
- [ ] Criar `TrendIndicator.tsx` (arrow + percent/absolute + color semantic)
- [ ] Criar `KpiCard.tsx` (tier 1: label uppercase + valor tabular grande + trend + sparkline)
- [ ] Criar `KpiCardCompact.tsx` (tier 2: label + numero + delta inline)
- [ ] Refatorar `DashboardView.tsx`: header + 3 tier-1 + 3 tier-2 + charts row
- [ ] Refinar chart "Investimento vs Conversas" com gradient fill + tooltip glass
- [ ] Refinar card "Timeline FURY" (icones coloridos por tipo, timestamps tabular)
- [ ] Build verde + screenshot
- [ ] Commit "wave 2 — dashboard redesign"

## Wave 3 — Sidebar
- [ ] Refinar AppSidebar (badge enterprise animated, nav selected indicator dot/bar)
- [ ] Refinar OrganizationSwitcher (chip laranja no enterprise)
- [ ] Refinar UserMenu (avatar com gradient, email truncado)
- [ ] Build verde + commit "wave 3 — sidebar polish"

## Wave 4 — Views funcionais
- [ ] ChatView — header + input refinado + message bubbles com shadow-1 + timestamps mono
- [ ] CreativesView — grid cards com hover state + filters bar
- [ ] AnalysisView — funil refinado + insights cards com severity colors
- [ ] ComplianceView — scorecard grande + violations com severity
- [ ] FuryView — timeline + action cards
- [ ] PublisherView — wizard steps + forms
- [ ] BudgetView — projections com charts + alerts
- [ ] Build verde + commit "wave 4 — views redesign"

## Wave 5 — Integracoes + Polish
- [ ] Integrations page — cards de provider + connected state
- [ ] MetaAssetPicker — refinar cards hierarquicos
- [ ] Motion pass — fade-in em route changes, skeleton shimmer
- [ ] A11y audit — focus rings, aria-labels, touch targets
- [ ] Final build + screenshot comparison before/after
- [ ] Commit "wave 5 — final polish"
- [ ] Atualizar .kiro/steering/implemented-features.md
