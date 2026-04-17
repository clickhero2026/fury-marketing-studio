import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface BudgetBenchmark {
  objective: string;
  avg_cpl: number | null;
  avg_cpa: number | null;
  avg_roas: number | null;
  avg_ctr: number | null;
  samples_count: number;
  total_spend: number | null;
  last_calculated_at: string;
}

export interface BudgetRecommendation {
  recommended_budget_weekly: number;
  recommended_daily: number;
  projected_volume: number;
  projected_range_min: number;
  projected_range_max: number;
  justification: string;
  alerts: string[];
  data_source: 'tenant_history' | 'market_fallback' | 'mixed';
}

export function useBudgetBenchmarks() {
  return useQuery<BudgetBenchmark[]>({
    queryKey: ['budget-benchmarks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('budget_benchmarks' as never)
        .select('objective, avg_cpl, avg_cpa, avg_roas, avg_ctr, samples_count, total_spend, last_calculated_at');
      if (error) throw error;
      return (data ?? []) as BudgetBenchmark[];
    },
    staleTime: 60_000,
  });
}

export function useBudgetRecommend() {
  const { toast } = useToast();

  return useMutation<
    BudgetRecommendation,
    Error,
    { objective: string; goal_per_week: number; current_budget_weekly: number }
  >({
    mutationFn: async (input) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Nao autenticado');

      const { data, error } = await supabase.functions.invoke('budget-recommend', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: input,
      });
      if (error) throw error;
      return data as BudgetRecommendation;
    },
    onError: (err) => {
      toast({ title: 'Erro na recomendacao', description: err.message, variant: 'destructive' });
    },
  });
}
