import { useMemo } from 'react';
import { TrendingUp, DollarSign, Wallet, Target, Receipt, Percent } from 'lucide-react';
import { KpiCard } from '@/components/shared/KpiCard';
import { KpiCardCompact } from '@/components/shared/KpiCardCompact';
import { fmtBRL } from '@/lib/meta-labels';

export interface MetricRow {
  data: string | null;
  campanha: string | null;
  investimento: number | null;
  conversas_iniciadas: number | null;
  website_purchase_roas: number | null;
}

interface Props {
  currentMetrics: MetricRow[];
  previousMetrics: MetricRow[];
  loading: boolean;
}

interface Totals {
  investimento: number;
  conversas: number;
  receita: number;
  lucro: number;
  roi: number | null;
  cpl: number | null;
  roas: number | null;
}

function computeTotals(metrics: MetricRow[]): Totals {
  let investimento = 0, conversas = 0, receita = 0;
  for (const m of metrics) {
    const spend = Number(m.investimento) || 0;
    const roas = Number(m.website_purchase_roas) || 0;
    investimento += spend;
    conversas += Number(m.conversas_iniciadas) || 0;
    receita += spend * roas;
  }
  const lucro = receita - investimento;
  return {
    investimento,
    conversas,
    receita,
    lucro,
    roi: investimento > 0 ? (lucro / investimento) * 100 : null,
    cpl: conversas > 0 ? investimento / conversas : null,
    roas: investimento > 0 ? receita / investimento : null,
  };
}

function delta(current: number | null, prev: number | null): number | null {
  if (current == null || prev == null || prev === 0) return null;
  return ((current - prev) / Math.abs(prev)) * 100;
}

function fmtOrDash(value: number | null, formatter: (n: number) => string): string {
  return value == null ? '—' : formatter(value);
}

/**
 * Constroi serie diaria agregada para sparklines.
 * Retorna array de valores por dia ordenado cronologicamente.
 */
function dailySeries(metrics: MetricRow[], pick: (t: Totals) => number | null): number[] {
  const byDay = new Map<string, MetricRow[]>();
  for (const m of metrics) {
    if (!m.data) continue;
    if (!byDay.has(m.data)) byDay.set(m.data, []);
    byDay.get(m.data)!.push(m);
  }
  const dates = [...byDay.keys()].sort();
  return dates
    .map((d) => pick(computeTotals(byDay.get(d)!)))
    .filter((v): v is number => v != null && isFinite(v));
}

export function DashKpiGrid({ currentMetrics, previousMetrics, loading }: Props) {
  const { cur, prev, sparks } = useMemo(() => ({
    cur: computeTotals(currentMetrics),
    prev: computeTotals(previousMetrics),
    sparks: {
      roas: dailySeries(currentMetrics, (t) => t.roas),
      lucro: dailySeries(currentMetrics, (t) => t.lucro),
      invest: dailySeries(currentMetrics, (t) => t.investimento),
    },
  }), [currentMetrics, previousMetrics]);

  // Tier 1 — cards grandes com sparkline
  const tier1 = [
    {
      label: 'ROAS',
      value: cur.roas != null ? cur.roas.toFixed(2) : '—',
      unit: cur.roas != null ? 'x' : undefined,
      deltaPct: delta(cur.roas, prev.roas),
      higherIsBetter: true,
      icon: DollarSign,
      spark: sparks.roas,
    },
    {
      label: 'Lucro',
      value: fmtBRL(cur.lucro),
      deltaPct: delta(cur.lucro, prev.lucro),
      higherIsBetter: true,
      icon: TrendingUp,
      spark: sparks.lucro,
      accent: cur.lucro >= 0 ? 'text-emerald-600' : 'text-red-600',
    },
    {
      label: 'Investimento',
      value: fmtBRL(cur.investimento),
      deltaPct: delta(cur.investimento, prev.investimento),
      higherIsBetter: false,
      icon: Wallet,
      spark: sparks.invest,
    },
  ];

  // Tier 2 — compactos
  const tier2 = [
    {
      label: 'ROI',
      value: fmtOrDash(cur.roi, (v) => v.toFixed(1)),
      unit: cur.roi != null ? '%' : undefined,
      deltaPct: delta(cur.roi, prev.roi),
      higherIsBetter: true,
      icon: Percent,
    },
    {
      label: 'Leads / Conv.',
      value: cur.conversas.toLocaleString('pt-BR'),
      deltaPct: delta(cur.conversas, prev.conversas),
      higherIsBetter: true,
      icon: Target,
    },
    {
      label: 'CPL / CPA',
      value: fmtOrDash(cur.cpl, fmtBRL),
      deltaPct: delta(cur.cpl, prev.cpl),
      higherIsBetter: false,
      icon: Receipt,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {tier1.map((c) => (
          <KpiCard
            key={c.label}
            label={c.label}
            value={loading ? '—' : c.value}
            unit={c.unit}
            deltaPct={loading ? null : c.deltaPct}
            higherIsBetter={c.higherIsBetter}
            icon={c.icon}
            sparklineData={loading ? undefined : c.spark}
            accentClassName={c.accent}
            loading={loading}
          />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {tier2.map((c) => (
          <KpiCardCompact
            key={c.label}
            label={c.label}
            value={loading ? '—' : c.value}
            unit={c.unit}
            deltaPct={loading ? null : c.deltaPct}
            higherIsBetter={c.higherIsBetter}
            icon={c.icon}
            loading={loading}
          />
        ))}
      </div>
    </div>
  );
}
