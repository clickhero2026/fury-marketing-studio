import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MetricRow } from './DashKpiGrid';

interface Props {
  metrics: MetricRow[];
}

interface TooltipItem { value?: number; payload?: { fullName?: string } }

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipItem[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0];
  return (
    <div className="rounded-lg border border-border/60 bg-popover/95 px-3 py-2 shadow-e3 backdrop-blur-sm">
      <div className="mb-1 max-w-[280px] truncate text-xs font-medium text-foreground">
        {item.payload?.fullName}
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Conversas</span>
        <span className="ml-auto font-mono font-semibold tabular-nums text-foreground">
          {Number(item.value ?? 0).toLocaleString('pt-BR')}
        </span>
      </div>
    </div>
  );
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
        fullName: name,
        name: name.length > 20 ? name.slice(0, 20) + '…' : name,
        conversas,
      }))
      .sort((a, b) => b.conversas - a.conversas)
      .slice(0, 5);
  }, [metrics]);

  if (data.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
        Sem dados
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" strokeOpacity={0.6} horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))', fontFamily: 'JetBrains Mono, monospace' }}
          tickLine={false}
          axisLine={false}
          tickMargin={6}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }}
          tickLine={false}
          axisLine={false}
          width={170}
          interval={0}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', fillOpacity: 0.4 }} />
        <Bar dataKey="conversas" fill="#cf6f03" radius={[0, 4, 4, 0]} barSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}
