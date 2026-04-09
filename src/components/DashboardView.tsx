import { useMemo } from "react";
import { TrendingUp, Eye, MousePointerClick, DollarSign, Target, ArrowUpRight, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCampaigns, useCampaignMetrics } from "@/hooks/use-campaigns";
import { humanizeStatus, humanizeObjective, fmtCompact, fmtBRL } from "@/lib/meta-labels";
import { Button } from "@/components/ui/button";

interface StatCardProps {
  title: string;
  value: string;
  hint: string;
  icon: React.ElementType;
}

const StatCard = ({ title, value, hint, icon: Icon }: StatCardProps) => {
  return (
    <div className="glass-card rounded-2xl p-5 slide-up transition-all">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-[13px] font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-semibold text-foreground tracking-tight">{value}</p>
          <p className="text-xs font-medium text-muted-foreground">{hint}</p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Icon className="w-[18px] h-[18px] text-primary" />
        </div>
      </div>
    </div>
  );
};

const DashboardView = () => {
  const campaignsQ = useCampaigns();
  const metricsQ = useCampaignMetrics(30);

  const campaigns = campaignsQ.data ?? [];
  const metrics = metricsQ.data ?? [];

  const totals = useMemo(
    () =>
      metrics.reduce(
        (acc, m) => {
          acc.impressoes += m.impressoes ?? 0;
          acc.cliques += m.cliques ?? 0;
          acc.investimento += m.investimento ?? 0;
          acc.conversas += m.conversas_iniciadas ?? 0;
          return acc;
        },
        { impressoes: 0, cliques: 0, investimento: 0, conversas: 0 }
      ),
    [metrics]
  );

  // ROAS agregado = media ponderada por spend (matematicamente correto)
  const metricsByCampaign = useMemo(() => {
    const map = new Map<string, { spend: number; conv: number; roasNum: number; roasDen: number }>();
    for (const m of metrics) {
      if (!m.campanha) continue;
      const cur = map.get(m.campanha) ?? { spend: 0, conv: 0, roasNum: 0, roasDen: 0 };
      const spend = m.investimento ?? 0;
      const dailyRoas = m.website_purchase_roas ?? 0;
      cur.spend += spend;
      cur.conv += m.conversas_iniciadas ?? 0;
      if (dailyRoas > 0 && spend > 0) {
        cur.roasNum += dailyRoas * spend;
        cur.roasDen += spend;
      }
      map.set(m.campanha, cur);
    }
    return map;
  }, [metrics]);

  const isLoading = campaignsQ.isLoading || metricsQ.isLoading;
  const isError = campaignsQ.isError || metricsQ.isError;
  const errorMsg = (campaignsQ.error ?? metricsQ.error)?.message;

  return (
    <div className="p-6 lg:p-8 space-y-6 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground tracking-tight">Dashboard</h2>
          <p className="text-[13px] text-muted-foreground mt-0.5">Visao geral das campanhas Meta Ads</p>
        </div>
        <div className={cn(
          "flex items-center gap-2 text-xs px-3 py-1.5 rounded-full font-medium",
          isError ? "bg-danger/10 text-danger" : "bg-success/10 text-success"
        )}>
          <span className={cn("w-1.5 h-1.5 rounded-full", isError ? "bg-danger" : "bg-success animate-pulse")} />
          {isError ? "Erro ao carregar" : isLoading ? "Carregando..." : "Atualizado"}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Impressoes" value={fmtCompact(totals.impressoes)} hint="ultimos 30 dias" icon={Eye} />
        <StatCard title="Cliques" value={fmtCompact(totals.cliques)} hint="ultimos 30 dias" icon={MousePointerClick} />
        <StatCard title="Gasto Total" value={fmtBRL(totals.investimento)} hint="ultimos 30 dias" icon={DollarSign} />
        <StatCard title="Conversas" value={fmtCompact(totals.conversas)} hint="ultimos 30 dias" icon={Target} />
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border/60">
          <h3 className="text-[13px] font-semibold text-foreground">Campanhas</h3>
        </div>
        <div className="overflow-x-auto">
          {isError ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <AlertCircle className="w-6 h-6 text-danger" />
              <p className="text-[13px] text-muted-foreground">Falha ao carregar campanhas{errorMsg ? `: ${errorMsg}` : ""}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  campaignsQ.refetch();
                  metricsQ.refetch();
                }}
              >
                Tentar novamente
              </Button>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-12 text-[13px] text-muted-foreground">
              Nenhuma campanha sincronizada. Va em Integracoes e clique em Sincronizar.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40">
                  <th scope="col" className="text-left px-6 py-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Campanha</th>
                  <th scope="col" className="text-left px-6 py-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  <th scope="col" className="text-right px-6 py-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Gasto</th>
                  <th scope="col" className="text-right px-6 py-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Conversas</th>
                  <th scope="col" className="text-right px-6 py-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Objetivo</th>
                  <th scope="col" className="text-right px-6 py-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const m = metricsByCampaign.get(c.name) ?? { spend: 0, conv: 0, roasNum: 0, roasDen: 0 };
                  const roas = m.roasDen > 0 ? m.roasNum / m.roasDen : 0;
                  const rawStatus = c.effective_status ?? c.status;
                  const isActive = rawStatus === "ACTIVE";
                  return (
                    <tr key={c.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-3.5 font-medium text-foreground text-[13px]">{c.name}</td>
                      <td className="px-6 py-3.5">
                        <span className={cn(
                          "px-2.5 py-1 rounded-full text-[11px] font-medium",
                          isActive ? "bg-success/10 text-success" : "bg-secondary text-muted-foreground"
                        )}>
                          {humanizeStatus(rawStatus)}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right text-foreground text-[13px]">{fmtBRL(m.spend)}</td>
                      <td className="px-6 py-3.5 text-right text-foreground text-[13px]">{m.conv}</td>
                      <td className="px-6 py-3.5 text-right text-muted-foreground text-[12px]">{humanizeObjective(c.objective)}</td>
                      <td className="px-6 py-3.5 text-right">
                        <span className="flex items-center justify-end gap-1 text-foreground text-[13px]">
                          {roas ? `${roas.toFixed(1)}x` : "—"}
                          {roas > 1 && <TrendingUp className="w-3 h-3 text-success" />}
                          {roas > 2 && <ArrowUpRight className="w-3 h-3 text-success" />}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardView;
