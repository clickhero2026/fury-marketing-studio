import { LineChartSpendVsConv } from './LineChartSpendVsConv';
import { BarChartTop5Campaigns } from './BarChartTop5Campaigns';
import { PieChartSpendByCampaign } from './PieChartSpendByCampaign';
import type { MetricRow } from './DashKpiGrid';
import { cn } from '@/lib/utils';

interface Props {
  metrics: MetricRow[];
  loading?: boolean;
}

function ChartCard({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("bento-card group", className)}>
      <h3 className="mb-6 text-sm font-bold uppercase tracking-widest text-muted-foreground group-hover:text-primary transition-colors">
        {title}
      </h3>
      <div className="relative">
        {children}
      </div>
    </div>
  );
}

export function DashCharts({ metrics, loading }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="skeleton h-[400px] rounded-2xl bg-white/5" />
        <div className="skeleton h-[400px] rounded-2xl bg-white/5" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ChartCard title="Investimento vs Conversas (diário)">
        <div className="h-[300px]">
          <LineChartSpendVsConv metrics={metrics} />
        </div>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Top 5 campanhas por conversão">
          <div className="h-[300px]">
            <BarChartTop5Campaigns metrics={metrics} />
          </div>
        </ChartCard>
        <ChartCard title="Distribuição de investimento">
          <div className="h-[300px]">
            <PieChartSpendByCampaign metrics={metrics} />
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
