import { type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Sparkline } from "./Sparkline";
import { TrendIndicator } from "./TrendIndicator";

interface KpiCardProps {
  label: string;
  value: string;
  /** Unidade pos-valor (ex: "x", "%"). Renderizada menor. */
  unit?: string;
  deltaPct: number | null;
  higherIsBetter?: boolean;
  hint?: string;
  icon?: LucideIcon;
  sparklineData?: number[];
  /** Cor destaque (default: primary/laranja). Use "text-emerald-500" etc. */
  accentClassName?: string;
  loading?: boolean;
}

/**
 * KpiCard Tier 1 — card grande com label, valor tabular display, trend e sparkline.
 * Visual hero para KPIs principais (ROAS, Lucro, Investimento).
 */
export function KpiCard({
  label,
  value,
  unit,
  deltaPct,
  higherIsBetter = true,
  hint = "vs periodo anterior",
  icon: Icon,
  sparklineData,
  accentClassName = "text-primary",
  loading = false,
}: KpiCardProps) {
  return (
    <Card className="group relative overflow-hidden p-5 hover:shadow-e3">
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </span>
        {Icon ? (
          <Icon className={cn("h-4 w-4 opacity-60", accentClassName)} strokeWidth={2} />
        ) : null}
      </div>

      <div className="mt-3 flex items-baseline gap-1">
        {loading ? (
          <div className="h-9 w-24 animate-pulse rounded bg-muted" />
        ) : (
          <>
            <span className="font-mono text-display-sm font-semibold tabular-nums tracking-tight text-foreground">
              {value}
            </span>
            {unit ? (
              <span className="font-mono text-xl font-medium text-muted-foreground">{unit}</span>
            ) : null}
          </>
        )}
      </div>

      <div className="mt-1.5">
        {loading ? (
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
        ) : (
          <TrendIndicator deltaPct={deltaPct} higherIsBetter={higherIsBetter} hint={hint} />
        )}
      </div>

      {sparklineData && sparklineData.length >= 2 ? (
        <div className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-10 opacity-80 transition-opacity group-hover:opacity-100", accentClassName)}>
          <Sparkline
            data={sparklineData}
            strokeClassName="text-current"
            fillClassName="text-current"
            height={40}
          />
        </div>
      ) : null}
    </Card>
  );
}
