import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

interface Insight {
  id: string;
  type: "success" | "warning" | "tip";
  title: string;
  description: string;
  metric?: string;
  change?: string;
  positive?: boolean;
}

const insights: Insight[] = [
  {
    id: "1",
    type: "success",
    title: "ROAS acima da meta",
    description: "A campanha 'Conversao — Produto A' atingiu ROAS de 5.2x, superando a meta de 4.0x. Considere escalar o orcamento.",
    metric: "5.2x ROAS",
    change: "+30%",
    positive: true,
  },
  {
    id: "2",
    type: "warning",
    title: "Fadiga de criativo detectada",
    description: "O criativo 'Reels Testimonial' teve queda de 35% no CTR nos ultimos 3 dias. Recomendamos testar novas variacoes.",
    metric: "2.1% CTR",
    change: "-35%",
    positive: false,
  },
  {
    id: "3",
    type: "tip",
    title: "Oportunidade de publico",
    description: "O publico Lookalike 1% tem CPA 38% menor que a media. Considere criar novas campanhas segmentando este publico.",
    metric: "R$ 22.30 CPA",
    change: "-38%",
    positive: true,
  },
  {
    id: "4",
    type: "success",
    title: "Melhor horario identificado",
    description: "Suas campanhas performam 45% melhor entre 19h-22h. Os anuncios agendados neste horario geram mais conversoes.",
    metric: "19h-22h",
    change: "+45%",
    positive: true,
  },
  {
    id: "5",
    type: "warning",
    title: "Budget nao consumido",
    description: "A campanha 'Awareness — Marca' consumiu apenas 60% do orcamento diario. Verifique a segmentacao de publico.",
    metric: "60%",
    change: "-40%",
    positive: false,
  },
];

const iconMap = {
  success: CheckCircle2,
  warning: AlertTriangle,
  tip: Lightbulb,
};

const styleMap = {
  success: { border: "border-success/20", bg: "bg-success/10", icon: "text-success" },
  warning: { border: "border-warning/20", bg: "bg-warning/10", icon: "text-warning" },
  tip: { border: "border-info/20", bg: "bg-info/10", icon: "text-info" },
};

const funnelSteps = [
  { label: "Impressoes", value: "245.8K", pct: 100 },
  { label: "Cliques", value: "8.4K", pct: 34 },
  { label: "Visitas LP", value: "6.1K", pct: 25 },
  { label: "Add to Cart", value: "1.2K", pct: 10 },
  { label: "Conversoes", value: "312", pct: 5 },
];

const AnalysisView = () => {
  return (
    <div className="p-6 lg:p-8 space-y-6 overflow-y-auto h-full">
      <div>
        <h2 className="text-xl font-semibold text-foreground tracking-tight">Analise de Campanhas</h2>
        <p className="text-[13px] text-muted-foreground mt-0.5">Insights e recomendacoes baseados em dados</p>
      </div>

      {/* Funnel */}
      <div className="glass-card rounded-2xl p-6">
        <h3 className="text-[13px] font-semibold text-foreground mb-5">Funil de Conversao</h3>
        <div className="flex items-end gap-3 h-40">
          {funnelSteps.map((step, i) => (
            <div key={step.label} className="flex-1 flex flex-col items-center gap-2">
              <p className="text-[12px] font-semibold text-foreground">{step.value}</p>
              <div
                className="w-full rounded-lg brand-gradient transition-all"
                style={{ height: `${step.pct}%`, opacity: Math.max(0.25, 1 - i * 0.15) }}
              />
              <p className="text-[11px] text-muted-foreground text-center leading-tight">{step.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Insights */}
      <div className="space-y-3">
        <h3 className="text-[13px] font-semibold text-foreground">Insights Automaticos</h3>
        {insights.map((insight) => {
          const Icon = iconMap[insight.type];
          const style = styleMap[insight.type];
          return (
            <div
              key={insight.id}
              className={cn("glass-card rounded-2xl p-4 border-l-[3px] slide-up", style.border)}
            >
              <div className="flex items-start gap-3">
                <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0", style.bg)}>
                  <Icon className={cn("w-4 h-4", style.icon)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] font-semibold text-foreground">{insight.title}</p>
                    {insight.metric && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-semibold text-foreground">{insight.metric}</span>
                        {insight.change && (
                          <span className={cn(
                            "text-[11px] font-medium flex items-center gap-0.5",
                            insight.positive ? "text-success" : "text-danger"
                          )}>
                            {insight.positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {insight.change}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">{insight.description}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AnalysisView;
