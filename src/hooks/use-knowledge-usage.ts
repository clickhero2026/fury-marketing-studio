// Hook que consome RPC get_knowledge_usage.
// Spec: .kiro/specs/knowledge-base-rag/ (task 5.2)

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import type { KnowledgeUsage, UsageDimension } from '@/types/knowledge';

const STALE_MS = 60 * 1000;

interface UsageRpcPayload {
  storage: { bytes: number; max: number };
  documents: { count: number; max: number };
  embeddings_this_month: { tokens: number; max: number };
  status: 'ok' | 'warning' | 'blocked';
  warning_dimensions: string[];
  blocked_dimensions: string[];
}

const DEFAULT_USAGE: KnowledgeUsage = {
  storage: { bytes: 0, max: 0 },
  documents: { count: 0, max: 0 },
  embeddingsThisMonth: { tokens: 0, max: 0 },
  status: 'ok',
  warningDimensions: [],
  blockedDimensions: [],
};

export function useKnowledgeUsage() {
  const { company } = useAuth();
  const companyId = company?.id ?? null;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['kb-usage', companyId],
    enabled: !!companyId,
    staleTime: STALE_MS,
    queryFn: async (): Promise<KnowledgeUsage> => {
      if (!companyId) return DEFAULT_USAGE;
      const { data, error } = await supabase.rpc('get_knowledge_usage' as never, {
        p_company_id: companyId,
      } as never);
      if (error || !data) return DEFAULT_USAGE;
      const p = data as unknown as UsageRpcPayload;
      return {
        storage: p.storage,
        documents: p.documents,
        embeddingsThisMonth: p.embeddings_this_month,
        status: p.status,
        warningDimensions: (p.warning_dimensions ?? []) as UsageDimension[],
        blockedDimensions: (p.blocked_dimensions ?? []) as UsageDimension[],
      };
    },
  });

  return {
    ...(query.data ?? DEFAULT_USAGE),
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => queryClient.invalidateQueries({ queryKey: ['kb-usage', companyId] }),
  };
}
