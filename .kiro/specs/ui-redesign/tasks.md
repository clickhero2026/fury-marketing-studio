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
- [x] Criar `Sparkline.tsx` (SVG minimalista, gradient fill)
- [x] Criar `TrendIndicator.tsx` (arrow + percent/absolute + color semantic)
- [x] Criar `KpiCard.tsx` (tier 1: label uppercase + valor tabular grande + trend + sparkline)
- [x] Criar `KpiCardCompact.tsx` (tier 2: label + numero + delta inline)
- [x] Refatorar `DashboardView.tsx`: PageHeader + 3 tier-1 + 3 tier-2 + charts row
- [x] Refinar chart "Investimento vs Conversas" (AreaChart + gradient fill + tooltip glass custom)
- [ ] Refinar card "Timeline FURY" (wave 4)
- [x] Build verde
- [x] Commit "wave 2 — dashboard redesign"

## Wave 3 — Sidebar
- [x] Refinar AppSidebar (workspace label, indicador lateral animado primary, botao Nova conversa com shadow laranja + icon rotate)
- [x] Refinar UserMenu (avatar gradient laranja com ring, tipografia refinada)
- [ ] Refinar OrganizationSwitcher (futuro se necessario)
- [x] Build verde + commit "wave 3 — sidebar polish"

## Fixes extras (Wave 2.5)
- [x] PieChartSpendByCampaign: labels dentro das slices + legenda a direita (sem overlap)
- [x] BarChartTop5Campaigns: tooltip glass + cor primary + barSize fixo
- [x] DashCharts: ChartCard usa rounded-xl + shadow-e1

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
