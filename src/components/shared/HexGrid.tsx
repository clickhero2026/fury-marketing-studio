import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';

export const HexGrid = () => {
  const hexagons = useMemo(() => {
    const rows = 12;
    const cols = 18;
    const hexas = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        hexas.push({ 
          r, 
          c, 
          delay: Math.random() * 10,
          duration: 15 + Math.random() * 10,
          baseOpacity: 0.05 + Math.random() * 0.08
        });
      }
    }
    return hexas;
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="relative w-full h-full bg-background transition-colors duration-500">
        <svg className="w-full h-full" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice">
          {hexagons.map((hex, i) => {
            const size = 45;
            const spacingX = size * 1.5;
            const spacingY = size * 0.866;
            const x = hex.c * spacingX;
            const y = hex.r * (spacingY * 2) + (hex.c % 2 === 0 ? 0 : spacingY);

            return (
              <path
                key={i}
                d={`M ${x + size} ${y} l ${-size/2} ${size * 0.866} l ${-size} 0 l ${-size/2} ${-size * 0.866} l ${size/2} ${-size * 0.866} l ${size} 0 Z`}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.1"
                className={cn(
                  "transition-colors duration-500",
                  hex.c % 4 === 0 && hex.r % 3 === 0 
                    ? "text-primary/35" 
                    : "text-muted-foreground/25 dark:text-zinc-800/50"
                )}
                style={{
                  opacity: hex.baseOpacity,
                  animation: `shimmer-hex ${hex.duration}s ease-in-out ${hex.delay}s infinite alternate`
                }}
              />
            );
          })}
        </svg>
        
        {/* Ambient Glow */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,hsl(var(--primary)/0.04)_0%,transparent_70%)]" />
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shimmer-hex {
          0% { opacity: var(--base-opacity, 0.05); transform: scale(1); }
          100% { opacity: 0.2; transform: scale(1.01); }
        }
      `}} />
    </div>
  );
};
