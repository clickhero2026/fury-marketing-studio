# Design: Dash do Dono v1

## Estrutura de componentes

```
DashboardView.tsx                  (reescrita — layout principal)
├── DashFilters.tsx                (periodo + conta + campanha)
├── DashKpiGrid.tsx                (6 cards com comparativo)
│   └── KpiCard.tsx
├── DashCharts.tsx                 (3 graficos)
│   ├── LineChartSpendVsConv.tsx
│   ├── BarChartTop5Campaigns.tsx
│   └── PieChartSpendByCampaign.tsx
└── DashFuryTimeline.tsx           (reusa useFuryActions)
```

## Hooks — reuso maximo

```typescript
// Nao cria hook novo — estende os existentes com refetchInterval
// use-campaigns.ts: useCampaignMetrics(days) ja tem staleTime
// use-fury.ts: useFuryActions() ja tem refetchInterval 30s
```

## Calculos derivados (no componente)

```typescript
// Todos calculos sao client-side — nao precisa RPC
function computeKpis(metrics: MetricRow[], prevMetrics: MetricRow[]) {
  const totals = metrics.reduce((a, m) => ({
    investimento: a.investimento + (m.investimento ?? 0),
    conversas: a.conversas + (m.conversas_iniciadas ?? 0),
    receita: a.receita + (m.investimento ?? 0) * (m.website_purchase_roas ?? 0),
  }), { investimento: 0, conversas: 0, receita: 0 });

  const lucro = totals.receita - totals.investimento;
  const roi = totals.investimento > 0 ? (lucro / totals.investimento) * 100 : 0;
  const cpl = totals.conversas > 0 ? totals.investimento / totals.conversas : 0;
  const roas = totals.investimento > 0 ? totals.receita / totals.investimento : 0;

  // Mesmo calculo no prevMetrics pra delta %
  return { ...totals, lucro, roi, cpl, roas, delta: computeDelta(...) };
}
```

## Filtros — estado local

```typescript
type Period = 'today' | '7d' | '30d' | 'custom';

const [period, setPeriod] = useState<Period>('30d');
const [customRange, setCustomRange] = useState<{ start: Date; end: Date } | null>(null);
const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]); // account_ids
const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]); // campaign names
```

Filtros aplicados em `metrics` via `.filter()` antes de `computeKpis`.

## Graficos

### LineChart (Spend vs Conversoes — 30d)

```tsx
<ResponsiveContainer height={280}>
  <LineChart data={dailyAggregated}>
    <XAxis dataKey="data" tickFormatter={formatDateShort} />
    <YAxis yAxisId="spend" orientation="left" tickFormatter={fmtBRLShort} />
    <YAxis yAxisId="conv" orientation="right" />
    <Tooltip content={<CustomTooltip />} />
    <Line yAxisId="spend" dataKey="investimento" stroke="#3b82f6" />
    <Line yAxisId="conv" dataKey="conversas" stroke="#10b981" />
  </LineChart>
</ResponsiveContainer>
```

### BarChart (Top 5 por conversao)

Horizontal layout pra acomodar nomes longos. Cores gradient (primary → accent).

### PieChart (Distribuicao spend)

Top 5 + "Outros" agregado. Label externa com %. Cores de paleta.

## Timeline FURY

Reusa `useFuryActions()`. Render em lista com `formatDistanceToNow`.

Humanizacao no componente (nao no backend):

```typescript
function humanizeFuryAction(a: FuryAction): { emoji: string; text: ReactNode } {
  const name = <strong>{a.campaign_name}</strong>;
  switch (a.rule_key) {
    case 'saturation':          return { emoji: '⏸️', text: <>Pausei {name} — Frequencia {a.metric_value} {'>'} {a.threshold_value}</> };
    case 'high_cpa':             return { emoji: '⏸️', text: <>Pausei {name} — CPA R$ {a.metric_value} acima do limite</> };
    case 'low_ctr':              return { emoji: '⚠️', text: <>Alerta: CTR de {name} esta em {a.metric_value}%</> };
    case 'budget_exhausted':     return { emoji: '⚠️', text: <>Orcamento de {name} consumido em {a.metric_value}%</> };
    case 'scaling_opportunity':  return { emoji: '📈', text: <>Sugiro aumentar orcamento de {name} — CPA R$ {a.metric_value}</> };
    case 'manual_chat':          return { emoji: '💬', text: <>Acao via chat em {name}</> };
    default:                      return { emoji: '🤖', text: <>FURY agiu em {name}</> };
  }
}
```

## Responsividade (Tailwind)

```
grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6  // KPIs
grid lg:grid-cols-3 gap-6                        // Charts + Timeline (2col chart, 1col timeline)
```

## Trade-offs

| Decisao | Pros | Contras |
|---|---|---|
| Tudo client-side | Simples, sem novo backend | Pra 1000+ rows pode travar — mitigado por limit 30d |
| Reusar hooks existentes + refetchInterval | Zero novo codigo | Cache inclui dados alem do filtro — trivial (filter local) |
| Recharts (ja no bundle) | Zero delta de bundle | — |
| Filtros so em memoria | Rapido | Perde estado ao trocar view — aceitavel v1 |
