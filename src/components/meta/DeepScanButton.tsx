// Botao de gatilho manual da Varredura Profunda da Meta API.
// Spec: meta-deep-scan Corte A.

import { Loader2, Telescope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDeepScan } from '@/hooks/use-deep-scan';

export function DeepScanButton({ size = 'sm', variant = 'outline' }: {
  size?: 'sm' | 'default' | 'lg';
  variant?: 'default' | 'outline' | 'ghost';
}) {
  const { deepScan, isDeepScanning } = useDeepScan();

  return (
    <Button
      size={size}
      variant={variant}
      onClick={() => deepScan()}
      disabled={isDeepScanning}
      className="gap-2 shrink-0"
      title="Varre BMs, ad sets, pixels e paginas conectados"
    >
      {isDeepScanning ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Telescope className="h-3.5 w-3.5" />
      )}
      {isDeepScanning ? 'Varrendo...' : 'Varredura profunda'}
    </Button>
  );
}
