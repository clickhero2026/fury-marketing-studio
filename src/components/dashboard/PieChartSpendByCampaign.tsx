import { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { fmtBRL } from '@/lib/meta-labels';
import type { MetricRow } from './DashKpiGrid';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#6b7280'];

interface Props {
  metrics: MetricRow[];
}

export function PieChartSpendByCampaign({ metrics }: Props) {
  const data = useMemo(() => {
    const byCampaign = new Map<string, number>();
    for (const m of metrics) {
      if (!m.campanha) continue;
      const cur = byCampaign.get(m.campanha) ?? 0;
      byCampaign.set(m.campanha, cur + (Number(m.investimento) || 0));
    }
    const sorted = [...byCampaign.entries()]
      .map(([name, spend]) => ({ name, spend }))
      .sort((a, b) => b.spend - a.spend);

    const top5 = sorted.slice(0, 5);
    const others = sorted.slice(5);
    const result = top5.map((c) => ({ name: c.name.length > 20 ? c.name.slice(0, 20) + '…' : c.name, value: c.spend }));
    if (others.length > 0) {
      result.push({ name: 'Outros', value: others.reduce((s, c) => s + c.spend, 0) });
    }
    return result;
  }, [metrics]);

  const total = data.reduce((s, d) => s + d.value, 0);

  if (total === 0) {
    return <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">Sem gasto no periodo</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          outerRadius={90}
          innerRadius={50}
          paddingAngle={2}
          dataKey="value"
          label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
          labelLine={false}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: 8, fontSize: 12 }}
          formatter={(v: number) => [fmtBRL(v), 'Investimento']}
        />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
