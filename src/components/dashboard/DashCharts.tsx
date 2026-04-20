import { LineChartSpendVsConv } from './LineChartSpendVsConv';
import { BarChartTop5Campaigns } from './BarChartTop5Campaigns';
import { PieChartSpendByCampaign } from './PieChartSpendByCampaign';
import type { MetricRow } from './DashKpiGrid';

interface Props {
  metrics: MetricRow[];
  loading?: boolean;
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 shadow-e1 transition-shadow duration-base ease-smooth hover:shadow-e2">
      <h3 className="mb-4 text-sm font-semibold tracking-tight text-foreground">{title}</h3>
      {children}
    </div>
  );
}

export function DashCharts({ metrics, loading }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-[340px] animate-pulse rounded-xl border border-border/60 bg-card" />
        <div className="h-[340px] animate-pulse rounded-xl border border-border/60 bg-card" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ChartCard title="Investimento vs Conversas (diario)">
        <LineChartSpendVsConv metrics={metrics} />
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Top 5 campanhas por conversao">
          <BarChartTop5Campaigns metrics={metrics} />
        </ChartCard>
        <ChartCard title="Distribuicao de investimento">
          <PieChartSpendByCampaign metrics={metrics} />
        </ChartCard>
      </div>
    </div>
  );
}
