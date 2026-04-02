import { TrendingUp, TrendingDown, Eye, MousePointerClick, DollarSign, Target, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string;
  change: string;
  positive: boolean;
  icon: React.ElementType;
  color: "blue" | "green" | "orange" | "red";
}

const colorMap = {
  blue: { bg: "bg-meta-blue-light", text: "text-meta-blue", icon: "text-meta-blue" },
  green: { bg: "bg-meta-green-light", text: "text-meta-green", icon: "text-meta-green" },
  orange: { bg: "bg-meta-orange-light", text: "text-meta-orange", icon: "text-meta-orange" },
  red: { bg: "bg-meta-red-light", text: "text-meta-red", icon: "text-meta-red" },
};

const StatCard = ({ title, value, change, positive, icon: Icon, color }: StatCardProps) => {
  const colors = colorMap[color];
  return (
    <div className="glass-card rounded-xl p-5 stat-glow slide-up">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
          <div className={cn("flex items-center gap-1 mt-2 text-xs font-medium", positive ? "text-meta-green" : "text-meta-red")}>
            {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {change}
          </div>
        </div>
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", colors.bg)}>
          <Icon className={cn("w-5 h-5", colors.icon)} />
        </div>
      </div>
    </div>
  );
};

const campaigns = [
  { name: "Conversão — Produto A", status: "Ativo", spend: "R$ 1.240", results: "89 conv.", cpa: "R$ 13.93", roas: "5.2x", trend: true },
  { name: "Tráfego — Blog", status: "Ativo", spend: "R$ 680", results: "2.1K cliques", cpa: "R$ 0.32", roas: "3.8x", trend: true },
  { name: "Awareness — Marca", status: "Ativo", spend: "R$ 450", results: "32K imp.", cpa: "R$ 0.014", roas: "2.1x", trend: false },
  { name: "Retargeting — Cart", status: "Pausado", spend: "R$ 320", results: "42 conv.", cpa: "R$ 7.62", roas: "7.8x", trend: true },
];

const DashboardView = () => {
  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Dashboard</h2>
          <p className="text-sm text-muted-foreground">Visão geral das campanhas Meta Ads</p>
        </div>
        <div className="flex items-center gap-2 text-xs bg-meta-green-light text-meta-green px-3 py-1.5 rounded-full font-medium">
          <span className="w-2 h-2 bg-meta-green rounded-full animate-pulse" />
          Dados atualizados
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Impressões" value="245.8K" change="+12.5% vs ontem" positive icon={Eye} color="blue" />
        <StatCard title="Cliques" value="8.4K" change="+8.2% vs ontem" positive icon={MousePointerClick} color="green" />
        <StatCard title="Gasto Total" value="R$ 2.690" change="+3.1% vs ontem" positive={false} icon={DollarSign} color="orange" />
        <StatCard title="Conversões" value="312" change="+18.7% vs ontem" positive icon={Target} color="blue" />
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Campanhas Ativas</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Campanha</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Gasto</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Resultados</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">CPA</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.name} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-foreground">{c.name}</td>
                  <td className="px-5 py-3.5">
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-xs font-medium",
                      c.status === "Ativo" ? "bg-meta-green-light text-meta-green" : "bg-secondary text-muted-foreground"
                    )}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right text-foreground">{c.spend}</td>
                  <td className="px-5 py-3.5 text-right text-foreground">{c.results}</td>
                  <td className="px-5 py-3.5 text-right text-foreground">{c.cpa}</td>
                  <td className="px-5 py-3.5 text-right">
                    <span className="flex items-center justify-end gap-1 text-foreground">
                      {c.roas}
                      {c.trend && <ArrowUpRight className="w-3 h-3 text-meta-green" />}
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
