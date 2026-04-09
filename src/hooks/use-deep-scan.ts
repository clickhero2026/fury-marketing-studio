import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface DeepScanStats {
  bms_synced: number;
  bms_deleted: number;
  accounts_enriched: number;
  accounts_skipped_fresh: number;
  adsets_synced: number;
  adsets_deleted: number;
  pixels_synced: number;
  pixels_deleted: number;
  pages_updated: number;
  errors: Array<{ where: string; error: string }>;
  timeout_hit: boolean;
  remaining_account_ids: string[];
}

interface DeepScanResponse {
  status: 'success' | 'partial' | 'failed';
  stats: DeepScanStats;
}

export function useDeepScan() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const deepScanMutation = useMutation<DeepScanResponse>({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Nao autenticado');

      const { data, error } = await supabase.functions.invoke('meta-deep-scan', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {},
      });

      if (error) throw error;
      return data as DeepScanResponse;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['meta-integration'] });
      queryClient.invalidateQueries({ queryKey: ['meta-business-managers'] });
      queryClient.invalidateQueries({ queryKey: ['meta-pixels'] });
      queryClient.invalidateQueries({ queryKey: ['adsets'] });
      queryClient.invalidateQueries({ queryKey: ['meta-pages'] });
      queryClient.invalidateQueries({ queryKey: ['meta-ad-accounts'] });

      const s = data.stats;
      const parts = [
        `${s.bms_synced} BMs`,
        `${s.adsets_synced} adsets`,
        `${s.pixels_synced} pixels`,
        `${s.pages_updated} pages`,
      ];
      const suffix = s.accounts_skipped_fresh > 0
        ? ` (${s.accounts_skipped_fresh} contas puladas por freshness)`
        : '';
      const timeoutSuffix = s.timeout_hit
        ? ` — timeout ativado, ${s.remaining_account_ids.length} contas restantes`
        : '';

      toast({
        title: data.status === 'success' ? 'Varredura concluida' : 'Varredura parcial',
        description: parts.join(' · ') + suffix + timeoutSuffix,
        variant: data.status === 'failed' ? 'destructive' : 'default',
      });

      if (data.stats.errors.length > 0) {
        console.warn('Deep scan errors:', data.stats.errors);
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro na varredura profunda',
        description: error.message || 'Tente novamente.',
        variant: 'destructive',
      });
    },
  });

  return {
    deepScan: () => deepScanMutation.mutate(),
    isDeepScanning: deepScanMutation.isPending,
  };
}
