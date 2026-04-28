// Linha discreta de uso de quota, sempre visivel no Studio.
// Mostra contadores + barras de progresso compactas. Diferente do
// CreativeUsageBanner (que so aparece em warning/blocked), este e
// passivo — da transparencia ao usuario sobre quanto esta consumindo.

import { Sparkles, Image as ImageIcon, DollarSign } from 'lucide-react';
import { useCreativeUsage } from '@/hooks/use-creative-usage';
import { cn } from '@/lib/utils';

function pct(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(100, Math.round((value / max) * 100));
}

function toneClass(percent: number): string {
  if (percent >= 90) return 'bg-red-500/70';
  if (percent >= 70) return 'bg-amber-500/70';
  if (percent >= 40) return 'bg-primary/60';
  return 'bg-emerald-500/50';
}

export function CreativeUsageStrip() {
  const usage = useCreativeUsage();

  if (usage.isLoading) return null;
  // Se a quota nao foi carregada (max=0 em tudo), nao renderiza
  if (usage.daily.max === 0 && usage.monthly.max === 0 && usage.cost_usd_month.max === 0) {
    return null;
  }

  const dayPct = pct(usage.daily.count, usage.daily.max);
  const monthPct = pct(usage.monthly.count, usage.monthly.max);
  const costPct = pct(usage.cost_usd_month.value, usage.cost_usd_month.max);

  return (
    <div className="rounded-lg border border-border/40 bg-card/30 px-3 py-2 mb-3 flex flex-col sm:flex-row gap-3 sm:gap-5 text-xs">
      <Stat
        icon={<Sparkles className="h-3 w-3" />}
        label="Hoje"
        current={usage.daily.count}
        max={usage.daily.max}
        suffix="criativos"
        percent={dayPct}
      />
      <Stat
        icon={<ImageIcon className="h-3 w-3" />}
        label="Mes"
        current={usage.monthly.count}
        max={usage.monthly.max}
        suffix="criativos"
        percent={monthPct}
      />
      <Stat
        icon={<DollarSign className="h-3 w-3" />}
        label="Custo"
        current={usage.cost_usd_month.value}
        max={usage.cost_usd_month.max}
        suffix=""
        percent={costPct}
        format="currency"
      />
    </div>
  );
}

function Stat({
  icon,
  label,
  current,
  max,
  suffix,
  percent,
  format,
}: {
  icon: React.ReactNode;
  label: string;
  current: number;
  max: number;
  suffix: string;
  percent: number;
  format?: 'currency';
}) {
  const fmt = (n: number) => (format === 'currency' ? `US$ ${n.toFixed(2)}` : Math.round(n).toString());

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {icon}
          <span className="font-medium">{label}</span>
        </span>
        <span className="text-foreground/80 tabular-nums">
          {fmt(current)} <span className="text-muted-foreground">/ {fmt(max)}</span>
          {suffix && <span className="text-muted-foreground/60 ml-1 hidden sm:inline">{suffix}</span>}
        </span>
      </div>
      <div className="h-1 rounded-full bg-muted/40 overflow-hidden">
        <div
          className={cn('h-full transition-all', toneClass(percent))}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
