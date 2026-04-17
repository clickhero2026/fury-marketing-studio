import { cn } from '@/lib/utils';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

interface Props {
  title: string;
  value: string;
  hint?: string;
  deltaPct?: number | null;       // comparativo vs periodo anterior (%)
  higherIsBetter?: boolean;       // true pra ROI/Lucro/Leads/ROAS; false pra CPL
  icon: React.ElementType;
  loading?: boolean;
}

export function KpiCard({ title, value, hint, deltaPct, higherIsBetter = true, icon: Icon, loading }: Props) {
  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-5 animate-pulse h-[112px]" />
    );
  }

  const hasDelta = deltaPct != null && isFinite(deltaPct);
  const isBetter = hasDelta && ((higherIsBetter && deltaPct > 0) || (!higherIsBetter && deltaPct < 0));
  const isWorse = hasDelta && ((higherIsBetter && deltaPct < 0) || (!higherIsBetter && deltaPct > 0));
  const isFlat = hasDelta && Math.abs(deltaPct) < 0.5;

  const DeltaIcon = isFlat ? Minus : (deltaPct ?? 0) > 0 ? ArrowUpRight : ArrowDownRight;
  const deltaClassName = isFlat ? 'text-muted-foreground' : isBetter ? 'text-emerald-400' : isWorse ? 'text-red-400' : 'text-muted-foreground';

  return (
    <div className="glass-card rounded-2xl p-5 slide-up transition-all">
      <div className="flex items-start justify-between">
        <div className="space-y-1 min-w-0 flex-1">
          <p className="text-[13px] font-medium text-muted-foreground truncate">{title}</p>
          <p className="text-2xl font-semibold text-foreground tracking-tight">{value}</p>
          <div className="flex items-center gap-1.5 text-xs">
            {hasDelta && (
              <span className={cn('flex items-center gap-0.5 font-medium', deltaClassName)}>
                <DeltaIcon className="w-3 h-3" />
                {Math.abs(deltaPct).toFixed(1)}%
              </span>
            )}
            {hint && <span className="text-muted-foreground">{hint}</span>}
          </div>
        </div>
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 ml-2">
          <Icon className="w-[18px] h-[18px] text-primary" />
        </div>
      </div>
    </div>
  );
}
