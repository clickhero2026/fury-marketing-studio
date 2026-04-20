import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface TrendIndicatorProps {
  deltaPct: number | null;
  higherIsBetter?: boolean;
  hint?: string;
  className?: string;
}

/**
 * Indicador de tendencia: seta + percentual + hint.
 * Cor depende de sinal e de `higherIsBetter` (ex: aumento de CPA = ruim).
 */
export function TrendIndicator({
  deltaPct,
  higherIsBetter = true,
  hint,
  className,
}: TrendIndicatorProps) {
  if (deltaPct == null || !isFinite(deltaPct)) {
    return (
      <div className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
        <Minus className="h-3 w-3" />
        <span>—</span>
        {hint ? <span className="opacity-70">{hint}</span> : null}
      </div>
    );
  }

  const positive = deltaPct > 0;
  const isGood = higherIsBetter ? positive : !positive;
  const Icon = positive ? ArrowUp : ArrowDown;
  const colorClass = Math.abs(deltaPct) < 0.1
    ? "text-muted-foreground"
    : isGood
      ? "text-emerald-600"
      : "text-red-600";

  const sign = positive ? "+" : "";
  const valueStr = `${sign}${deltaPct.toFixed(1)}%`;

  return (
    <div className={cn("flex items-center gap-1.5 text-xs", className)}>
      <Icon className={cn("h-3 w-3", colorClass)} strokeWidth={2.5} />
      <span className={cn("font-mono font-medium tabular-nums", colorClass)}>{valueStr}</span>
      {hint ? <span className="text-muted-foreground">{hint}</span> : null}
    </div>
  );
}
