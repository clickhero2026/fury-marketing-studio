import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from 'recharts';
import { fmtBRL, fmtCompact } from '@/lib/meta-labels';
import type { MetricRow } from './DashKpiGrid';

interface Props {
  metrics: MetricRow[];
}

export function LineChartSpendVsConv({ metrics }: Props) {
  const data = useMemo(() => {
    const byDay = new Map<string, { data: string; investimento: number; conversas: number }>();
    for (const m of metrics) {
      if (!m.data) continue;
      const cur = byDay.get(m.data) ?? { data: m.data, investimento: 0, conversas: 0 };
      cur.investimento += Number(m.investimento) || 0;
      cur.conversas += Number(m.conversas_iniciadas) || 0;
      byDay.set(m.data, cur);
    }
    return [...byDay.values()].sort((a, b) => a.data.localeCompare(b.data));
  }, [metrics]);

  if (data.length === 0) {
    return <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">Sem dados no periodo</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis
          dataKey="data"
          tick={{ fontSize: 11, fill: '#888' }}
          tickFormatter={(v: string) => {
            const d = new Date(v);
            return `${d.getDate()}/${d.getMonth() + 1}`;
          }}
        />
        <YAxis yAxisId="spend" orientation="left" tick={{ fontSize: 11, fill: '#888' }} tickFormatter={(v) => fmtCompact(v)} />
        <YAxis yAxisId="conv" orientation="right" tick={{ fontSize: 11, fill: '#888' }} />
        <Tooltip
          contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: 8, fontSize: 12 }}
          labelFormatter={(v: string) => new Date(v).toLocaleDateString('pt-BR')}
          formatter={(val: number, name: string) => {
            if (name === 'investimento') return [fmtBRL(val), 'Investimento'];
            return [val.toLocaleString('pt-BR'), 'Conversas'];
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <Line yAxisId="spend" type="monotone" dataKey="investimento" stroke="#3b82f6" strokeWidth={2} dot={false} name="Investimento" />
        <Line yAxisId="conv" type="monotone" dataKey="conversas" stroke="#10b981" strokeWidth={2} dot={false} name="Conversas" />
      </LineChart>
    </ResponsiveContainer>
  );
}
