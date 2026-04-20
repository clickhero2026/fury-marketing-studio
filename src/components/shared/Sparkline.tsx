import { useId } from "react";
import { cn } from "@/lib/utils";

interface SparklineProps {
  data: number[];
  className?: string;
  strokeClassName?: string;
  fillClassName?: string;
  height?: number;
}

/**
 * Sparkline SVG minimalista. Renderiza linha + area fill com gradient.
 * `className` aplica na root <svg>; `strokeClassName` e `fillClassName`
 * permitem sobrescrever stroke/fill (default: currentColor).
 */
export function Sparkline({
  data,
  className,
  strokeClassName = "text-primary",
  fillClassName = "text-primary/20",
  height = 40,
}: SparklineProps) {
  const id = useId();
  if (!data || data.length < 2) {
    return <div className={cn("h-full w-full", className)} style={{ height }} />;
  }

  const width = 100;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], i) => (i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`))
    .join(" ");

  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("h-full w-full", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`sparkline-fill-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} className={fillClassName} fill={`url(#sparkline-fill-${id})`} />
      <path
        d={linePath}
        className={strokeClassName}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
