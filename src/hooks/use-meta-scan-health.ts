import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type HealthStatus = 'healthy' | 'degraded' | 'stale' | 'expired';

export interface MetaScanHealth {
  integration_id: string;
  company_id: string;
  integration_status: string | null;
  scan_interval_hours: number | null;
  next_scan_at: string | null;
  last_deep_scan_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error_summary: Record<string, number> | null;
  consecutive_failures: number;
  health_status: HealthStatus;
}

export function useMetaScanHealth() {
  return useQuery<MetaScanHealth | null>({
    queryKey: ['meta-scan-health'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meta_scan_health' as never)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return (data as MetaScanHealth | null) ?? null;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
