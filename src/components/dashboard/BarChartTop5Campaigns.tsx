import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import type { MetricRow } from './DashKpiGrid';

interface Props {
  metrics: MetricRow[];
}

export function BarChartTop5Campaigns({ metrics }: Props) {
  const data = useMemo(() => {
    const byCampaign = new Map<string, number>();
    for (const m of metrics) {
      if (!m.campanha) continue;
      const cur = byCampaign.get(m.campanha) ?? 0;
      byCampaign.set(m.campanha, cur + (Number(m.conversas_iniciadas) || 0));
    }
    return [...byCampaign.entries()]
      .map(([name, conversas]) => ({
        name: name.length > 22 ? name.slice(0, 22) + '…' : name,
        conversas,
      }))
      .sort((a, b) => b.conversas - a.conversas)
      .slice(0, 5);
  }, [metrics]);

  if (data.length === 0) {
    return <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">Sem dados</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ top: 10, right: 30, bottom: 0, left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis type="number" tick={{ fontSize: 11, fill: '#888' }} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#ccc' }} width={160} />
        <Tooltip
          contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: 8, fontSize: 12 }}
          formatter={(v: number) => [v.toLocaleString('pt-BR'), 'Conversas']}
        />
        <Bar dataKey="conversas" fill="#8b5cf6" radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
