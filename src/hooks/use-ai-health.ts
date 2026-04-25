import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface AiHealthTotals {
  total_runs: number;
  success_runs: number;
  error_runs: number;
  partial_runs: number;
  total_cost_usd: number;
  total_tokens: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  p50_latency_ms: number;
}

export interface AiHealthDaily {
  day: string;
  runs: number;
  cost_usd: number;
  errors: number;
}

export interface AiHealthTool {
  name: string;
  uses: number;
}

export interface AiHealthError {
  id: string;
  started_at: string;
  error_message: string | null;
  agent_name: string;
  tools_used: string[];
}

export interface AiHealthSummary {
  period_days: number;
  totals: AiHealthTotals;
  daily: AiHealthDaily[];
  top_tools: AiHealthTool[];
  recent_errors: AiHealthError[];
}

export function useAiHealth(days: number = 7) {
  const [data, setData] = useState<AiHealthSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const { data: result, error: err } = await supabase.rpc(
      'get_ai_health_summary' as never,
      { p_days: days } as never
    );

    if (err) {
      setError(err.message);
      setIsLoading(false);
      return;
    }

    setData(result as unknown as AiHealthSummary);
    setIsLoading(false);
  }, [days]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, isLoading, error, refresh };
}
