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
    <Card className="flex items-center justify-between gap-3 p-4 hover:shadow-e2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {Icon ? <Icon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2} /> : null}
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {label}
          </span>
        </div>
        <div className="mt-1 flex items-baseline gap-0.5">
          {loading ? (
            <div className="h-6 w-16 skeleton rounded" />
          ) : (
            <>
              <span className="font-mono text-xl font-semibold tabular-nums tracking-tight text-foreground">
                {value}
              </span>
              {unit ? (
                <span className="font-mono text-sm text-muted-foreground">{unit}</span>
              ) : null}
            </>
          )}
        </div>
      </div>
      {!loading && (
        <div className="shrink-0 text-right">
          <TrendIndicator deltaPct={deltaPct} higherIsBetter={higherIsBetter} hint={hint} className="justify-end" />
        </div>
      )}
    </Card>
  );
}
