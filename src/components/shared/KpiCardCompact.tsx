import { type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { TrendIndicator } from "./TrendIndicator";

interface KpiCardCompactProps {
  label: string;
  value: string;
  unit?: string;
  deltaPct: number | null;
  higherIsBetter?: boolean;
  hint?: string;
  icon?: LucideIcon;
  loading?: boolean;
}

/**
 * KpiCard Tier 2 — compacto, sem sparkline. Uma linha de KPIs secundarios.
 */
export function KpiCardCompact({
  label,
  value,
  unit,
  deltaPct,
  higherIsBetter = true,
  hint,
  icon: Icon,
  loading = false,
}: KpiCardCompactProps) {
  return (
    <div className="bento-card group flex items-center justify-between p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-2">
          {Icon && (
            <div className="p-1.5 rounded-md bg-white/5 border border-white/5">
              <Icon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" strokeWidth={2.5} />
            </div>
          )}
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {label}
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          {loading ? (
            <div className="h-7 w-20 skeleton rounded-lg bg-white/5" />
          ) : (
            <>
              <span className="text-2xl font-bold tracking-tight text-foreground">
                {value}
              </span>
              {unit && (
                <span className="text-sm font-medium text-muted-foreground">{unit}</span>
              )}
            </>
          )}
        </div>
      </div>
      {!loading && (
        <div className="shrink-0">
          <TrendIndicator deltaPct={deltaPct} higherIsBetter={higherIsBetter} hint={hint} className="justify-end" />
        </div>
      )}
    </div>
  );
}
