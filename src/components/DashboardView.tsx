import { TrendingUp, TrendingDown, Eye, MousePointerClick, DollarSign, Target, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string;
  change: string;
  positive: boolean;
  icon: React.ElementType;
}

const StatCard = ({ title, value, change, positive, icon: Icon }: StatCardProps) => {
  return (
    <div className="glass-card rounded-2xl p-5 slide-up transition-all">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-[13px] font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-semibold text-foreground tracking-tight">{value}</p>
          <div className={cn(
            "flex items-center gap-1 text-xs font-medium",
            positive ? "text-success" : "text-danger"
          )}>
            {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {change}
          </div>
        </div>
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Icon className="w-[18px] h-[18px] text-primary" />
        </div>
      </div>
    </div>
  );
};

const campaigns = [
  { name: "Conversao — Produto A", status: "Ativo", spend: "R$ 1.240", results: "89 conv.", cpa: "R$ 13.93", roas: "5.2x", trend: true },
  { name: "Trafego — Blog", status: "Ativo", spend: "R$ 680", results: "2.1K cliques", cpa: "R$ 0.32", roas: "3.8x", trend: true },
  { name: "Awareness — Marca", status: "Ativo", spend: "R$ 450", results: "32K imp.", cpa: "R$ 0.014", roas: "2.1x", trend: false },
  { name: "Retargeting — Cart", status: "Pausado", spend: "R$ 320", results: "42 conv.", cpa: "R$ 7.62", roas: "7.8x", trend: true },
];

const DashboardView = () => {
  return (
    <div className="p-6 lg:p-8 space-y-6 overflow-y-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground tracking-tight">Dashboard</h2>
          <p className="text-[13px] text-muted-foreground mt-0.5">Visao geral das campanhas Meta Ads</p>
        </div>
        <div className="flex items-center gap-2 text-xs bg-success/10 text-success px-3 py-1.5 rounded-full font-medium">
          <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
          Atualizado
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Impressoes" value="245.8K" change="+12.5% vs ontem" positive icon={Eye} />
        <StatCard title="Cliques" value="8.4K" change="+8.2% vs ontem" positive icon={MousePointerClick} />
        <StatCard title="Gasto Total" value="R$ 2.690" change="+3.1% vs ontem" positive={false} icon={DollarSign} />
        <StatCard title="Conversoes" value="312" change="+18.7% vs ontem" positive icon={Target} />
      </div>

      {/* Campaigns Table */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border/60">
          <h3 className="text-[13px] font-semibold text-foreground">Campanhas Ativas</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40">
                <th className="text-left px-6 py-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Campanha</th>
                <th className="text-left px-6 py-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-right px-6 py-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Gasto</th>
                <th className="text-right px-6 py-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Resultados</th>
                <th className="text-right px-6 py-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">CPA</th>
                <th className="text-right px-6 py-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.name} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-3.5 font-medium text-foreground text-[13px]">{c.name}</td>
                  <td className="px-6 py-3.5">
                    <span className={cn(
                      "px-2.5 py-1 rounded-full text-[11px] font-medium",
                      c.status === "Ativo"
                        ? "bg-success/10 text-success"
                        : "bg-secondary text-muted-foreground"
                    )}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-right text-foreground text-[13px]">{c.spend}</td>
                  <td className="px-6 py-3.5 text-right text-foreground text-[13px]">{c.results}</td>
                  <td className="px-6 py-3.5 text-right text-foreground text-[13px]">{c.cpa}</td>
                  <td className="px-6 py-3.5 text-right">
                    <span className="flex items-center justify-end gap-1 text-foreground text-[13px]">
                      {c.roas}
                      {c.trend && <ArrowUpRight className="w-3 h-3 text-success" />}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DashboardView;
