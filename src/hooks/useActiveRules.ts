// Hook unificado de regras ativas (3 tabelas).
// Spec: .kiro/specs/fury-learning/ (T3.3)

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import type { ActionRule, BehaviorRule, CreativePipelineRule } from '@/types/fury-rules';

const STALE_MS = 60_000;

export function useActiveRules() {
  const { company } = useAuth();
  const companyId = company?.id ?? null;

  const behaviorQuery = useQuery({
    queryKey: ['fury-rules', 'behavior', companyId],
    enabled: !!companyId,
    staleTime: STALE_MS,
    queryFn: async (): Promise<BehaviorRule[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('behavior_rules' as never)
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BehaviorRule[];
    },
  });

  const pipelineQuery = useQuery({
    queryKey: ['fury-rules', 'pipeline', companyId],
    enabled: !!companyId,
    staleTime: STALE_MS,
    queryFn: async (): Promise<CreativePipelineRule[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('creative_pipeline_rules' as never)
        .select('*')
        .eq('company_id', companyId)
        .order('priority', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CreativePipelineRule[];
    },
  });

  const actionQuery = useQuery({
    queryKey: ['fury-rules', 'action', companyId],
    enabled: !!companyId,
    staleTime: STALE_MS,
    queryFn: async (): Promise<ActionRule[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('fury_rules' as never)
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ActionRule[];
    },
  });

  return {
    behavior: behaviorQuery.data ?? [],
    pipeline: pipelineQuery.data ?? [],
    action: actionQuery.data ?? [],
    isLoading: behaviorQuery.isLoading || pipelineQuery.isLoading || actionQuery.isLoading,
    error: behaviorQuery.error || pipelineQuery.error || actionQuery.error,
  };
}
