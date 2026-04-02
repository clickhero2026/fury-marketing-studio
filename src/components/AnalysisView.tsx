import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Lightbulb, ArrowRight } from "lucide-react";
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
    description: "A campanha 'Conversão — Produto A' atingiu ROAS de 5.2x, superando a meta de 4.0x. Considere escalar o orçamento.",
    metric: "5.2x ROAS",
    change: "+30%",
    positive: true,
  },
  {
    id: "2",
    type: "warning",
    title: "Fadiga de criativo detectada",
    description: "O criativo 'Reels Testimonial' teve queda de 35% no CTR nos últimos 3 dias. Recomendamos testar novas variações.",
    metric: "2.1% CTR",
    change: "-35%",
    positive: false,
  },
  {
    id: "3",
    type: "tip",
    title: "Oportunidade de público",
    description: "O público Lookalike 1% tem CPA 38% menor que a média. Considere criar novas campanhas segmentando este público.",
    metric: "R$ 22.30 CPA",
    change: "-38%",
    positive: true,
  },
  {
    id: "4",
    type: "success",
    title: "Melhor horário identificado",
    description: "Suas campanhas performam 45% melhor entre 19h-22h. Os anúncios agendados neste horário geram mais conversões.",
    metric: "19h-22h",
    change: "+45%",
    positive: true,
  },
  {
    id: "5",
    type: "warning",
    title: "Budget não consumido",
    description: "A campanha 'Awareness — Marca' consumiu apenas 60% do orçamento diário. Verifique a segmentação de público.",
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
  success: { border: "border-meta-green/20", bg: "bg-meta-green-light", icon: "text-meta-green" },
  warning: { border: "border-meta-orange/20", bg: "bg-meta-orange-light", icon: "text-meta-orange" },
  tip: { border: "border-meta-blue/20", bg: "bg-meta-blue-light", icon: "text-meta-blue" },
};

const funnelSteps = [
  { label: "Impressões", value: "245.8K", pct: 100 },
  { label: "Cliques", value: "8.4K", pct: 34 },
  { label: "Visitas LP", value: "6.1K", pct: 25 },
  { label: "Add to Cart", value: "1.2K", pct: 10 },
  { label: "Conversões", value: "312", pct: 5 },
];

const AnalysisView = () => {
  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      <div>
        <h2 className="text-xl font-bold text-foreground">Análise de Campanhas</h2>
        <p className="text-sm text-muted-foreground">Insights e recomendações baseados em dados</p>
      </div>

      {/* Funnel */}
      <div className="glass-card rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Funil de Conversão</h3>
        <div className="flex items-end gap-2 h-40">
          {funnelSteps.map((step, i) => (
            <div key={step.label} className="flex-1 flex flex-col items-center gap-2">
              <p className="text-xs font-semibold text-foreground">{step.value}</p>
              <div
                className="w-full rounded-t-lg chat-gradient transition-all"
                style={{ height: `${step.pct}%`, opacity: 1 - i * 0.12 }}
              />
              <p className="text-xs text-muted-foreground text-center">{step.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Insights */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Insights Automáticos</h3>
        {insights.map((insight) => {
          const Icon = iconMap[insight.type];
          const style = styleMap[insight.type];
          return (
            <div
              key={insight.id}
              className={cn("glass-card rounded-xl p-4 border-l-4 slide-up", style.border)}
            >
              <div className="flex items-start gap-3">
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", style.bg)}>
                  <Icon className={cn("w-4 h-4", style.icon)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">{insight.title}</p>
                    {insight.metric && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-foreground">{insight.metric}</span>
                        {insight.change && (
                          <span className={cn("text-xs font-medium flex items-center gap-0.5", insight.positive ? "text-meta-green" : "text-meta-red")}>
                            {insight.positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {insight.change}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{insight.description}</p>
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
