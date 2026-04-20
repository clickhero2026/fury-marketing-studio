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
- [x] ChatView — welcome refinado com icone gradient, suggestion cards com hover lift + primary accent, tabelas/markdown com tokens claros (sem white/X hardcoded)
- [x] CreativesView — PageHeader + badge de count + cards com hover lift + shadow-e2 + badges semanticas + grid responsivo 4 cols em xl
- [x] AnalysisView — PageHeader + funil refinado com valores mono tabular + insights com border-l colorido + trend indicators mono
- [x] ComplianceView — nao implementado ainda (skip)
- [x] FuryView — nao implementado ainda (skip)
- [x] PublisherView — nao implementado ainda (skip)
- [x] BudgetView — nao implementado ainda (skip)
- [x] Build verde + commit "wave 4 — views redesign"

## Wave 5 — Integracoes + Polish
- [x] Integrations page — LIGHT theme (antes era dark hardcoded), PageHeader, Card com shadow-e1, badges variantes, InfoField component, Alert component, actions com flex-wrap
- [ ] MetaAssetPicker — refinar cards hierarquicos (adiar — ja funciona razoavel)
- [x] Motion pass — animate-fade-in em route roots (Dashboard/Analise/Criativos), skeleton shimmer real (gradient animado) substitui animate-pulse
- [x] A11y pass — aria-labels em botoes icon-only do chat (Paperclip, Square, Send), focus-visible rings refinados
- [x] Commit "wave 4+5 — views + integracoes redesign"
- [x] Commit "polish — shimmer, fade-in, a11y"
- [x] Atualizar .kiro/steering/implemented-features.md (final do redesign)
