import { useMemo } from 'react';
import { TrendingUp, DollarSign, Wallet, Target, Receipt, Percent } from 'lucide-react';
import { KpiCard } from './KpiCard';
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
  roi: number | null;    // null quando nao calculavel
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

export function DashKpiGrid({ currentMetrics, previousMetrics, loading }: Props) {
  const { cur, prev } = useMemo(() => ({
    cur: computeTotals(currentMetrics),
    prev: computeTotals(previousMetrics),
  }), [currentMetrics, previousMetrics]);

  const cards = [
    { title: 'ROI', value: fmtOrDash(cur.roi, (v) => `${v.toFixed(1)}%`), deltaPct: delta(cur.roi, prev.roi), higherIsBetter: true, icon: Percent },
    { title: 'Lucro', value: fmtBRL(cur.lucro), deltaPct: delta(cur.lucro, prev.lucro), higherIsBetter: true, icon: TrendingUp },
    { title: 'Investimento', value: fmtBRL(cur.investimento), deltaPct: delta(cur.investimento, prev.investimento), higherIsBetter: false, icon: Wallet },
    { title: 'Leads/Conv.', value: cur.conversas.toLocaleString('pt-BR'), deltaPct: delta(cur.conversas, prev.conversas), higherIsBetter: true, icon: Target },
    { title: 'CPL/CPA', value: fmtOrDash(cur.cpl, fmtBRL), deltaPct: delta(cur.cpl, prev.cpl), higherIsBetter: false, icon: Receipt },
    { title: 'ROAS', value: fmtOrDash(cur.roas, (v) => `${v.toFixed(2)}x`), deltaPct: delta(cur.roas, prev.roas), higherIsBetter: true, icon: DollarSign },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((c) => (
        <KpiCard
          key={c.title}
          title={c.title}
          value={loading ? '—' : c.value}
          deltaPct={loading ? null : c.deltaPct}
          higherIsBetter={c.higherIsBetter}
          icon={c.icon}
          hint="vs periodo anterior"
          loading={loading}
        />
      ))}
    </div>
  );
}
