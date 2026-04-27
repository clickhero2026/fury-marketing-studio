// Invoke da Edge Function apply-creative-pipeline (fire-and-forget pos-upload).
// Spec: .kiro/specs/fury-learning/ (T3.7)

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface ApplyArgs {
  creative_id: string;
  source_storage_path: string;
  source_bucket?: string;
}

interface ApplyResponse {
  transformed_storage_path?: string;
  applied_rule_ids?: string[];
  skipped?: boolean;
  reason?: string;
  error?: string;
}

export function useApplyCreativePipeline() {
  const queryClient = useQueryClient();
  return useMutation<ApplyResponse, Error, ApplyArgs>({
    mutationFn: async (args) => {
      const { data, error } = await supabase.functions.invoke<ApplyResponse>(
        'apply-creative-pipeline',
        { body: args },
      );
      if (error) throw error;
      return data ?? {};
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creatives'] });
    },
  });
}
