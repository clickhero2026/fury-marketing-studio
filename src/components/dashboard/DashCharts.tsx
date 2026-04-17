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
    <div className="glass-card rounded-2xl p-5">
      <h3 className="text-[13px] font-semibold text-foreground mb-4">{title}</h3>
      {children}
    </div>
  );
}

export function DashCharts({ metrics, loading }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card rounded-2xl h-[340px] animate-pulse" />
        <div className="glass-card rounded-2xl h-[340px] animate-pulse" />
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
