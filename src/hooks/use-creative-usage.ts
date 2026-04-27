// Hook que consome RPCs get_creative_usage + get_creative_health.
// Spec: .kiro/specs/ai-creative-generation/ (task 8.2)

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import type {
  CreativeHealth,
  CreativeUsage,
  UsageDimension,
} from '@/types/creative';

const STALE_MS = 60 * 1000;

interface UsageRpcPayload {
  daily: { count: number; max: number };
  monthly: { count: number; max: number };
  cost_usd_month: { value: number; max: number };
  status: 'ok' | 'warning' | 'blocked';
  warning_dimensions: string[];
  blocked_dimensions: string[];
}

interface HealthRpcPayload {
  nano_banana_24h: { success: number; failed: number };
  gpt_image_24h: { success: number; failed: number };
  p95_latency_ms: number;
  window_start: string;
}

const DEFAULT_USAGE: CreativeUsage = {
  daily: { count: 0, max: 0 },
  monthly: { count: 0, max: 0 },
  cost_usd_month: { value: 0, max: 0 },
  status: 'ok',
  warning_dimensions: [],
  blocked_dimensions: [],
};

const DEFAULT_HEALTH: CreativeHealth = {
  nano_banana_24h: { success: 0, failed: 0 },
  gpt_image_24h: { success: 0, failed: 0 },
  p95_latency_ms: 0,
  window_start: new Date(0).toISOString(),
};

export function useCreativeUsage() {
  const { company } = useAuth();
  const companyId = company?.id ?? null;
  const queryClient = useQueryClient();

  // RPCs em paralelo via Promise.all dentro de uma unica query (cacheada juntas)
  const query = useQuery({
    queryKey: ['creative-usage', companyId],
    enabled: !!companyId,
    staleTime: STALE_MS,
    queryFn: async (): Promise<{ usage: CreativeUsage; health: CreativeHealth }> => {
      if (!companyId) return { usage: DEFAULT_USAGE, health: DEFAULT_HEALTH };

      const [usageRes, healthRes] = await Promise.all([
        supabase.rpc('get_creative_usage' as never, { p_company_id: companyId } as never),
        supabase.rpc('get_creative_health' as never, {} as never),
      ]);

      const usage: CreativeUsage = (() => {
        if (usageRes.error || !usageRes.data) return DEFAULT_USAGE;
        const p = usageRes.data as unknown as UsageRpcPayload;
        return {
          daily: p.daily,
          monthly: p.monthly,
          cost_usd_month: p.cost_usd_month,
          status: p.status,
          warning_dimensions: (p.warning_dimensions ?? []) as UsageDimension[],
          blocked_dimensions: (p.blocked_dimensions ?? []) as UsageDimension[],
        };
      })();

      const health: CreativeHealth = (() => {
        if (healthRes.error || !healthRes.data) return DEFAULT_HEALTH;
        const p = healthRes.data as unknown as HealthRpcPayload;
        return {
          nano_banana_24h: p.nano_banana_24h ?? DEFAULT_HEALTH.nano_banana_24h,
          gpt_image_24h: p.gpt_image_24h ?? DEFAULT_HEALTH.gpt_image_24h,
          p95_latency_ms: p.p95_latency_ms ?? 0,
          window_start: p.window_start ?? DEFAULT_HEALTH.window_start,
        };
      })();

      return { usage, health };
    },
  });

  const merged = query.data ?? { usage: DEFAULT_USAGE, health: DEFAULT_HEALTH };

  return {
    ...merged.usage,
    health: merged.health,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => queryClient.invalidateQueries({ queryKey: ['creative-usage', companyId] }),
  };
}
