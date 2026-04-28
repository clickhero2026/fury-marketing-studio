// Invoke da Edge Function apply-creative-pipeline.
// Spec: .kiro/specs/fury-learning/ Fase 6
//
// Auto-trigger: chamado em fire-and-forget apos approve em CreativeGalleryInline
// e StudioView. Aplica pipeline_rules ativos (logos/watermarks/etc).

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface ApplyArgs {
  creative_id: string;
  target_table?: 'creatives' | 'creatives_generated';
  source_storage_path?: string;
  source_bucket?: string;
}

export interface ApplyResponse {
  transformed_storage_path?: string;
  applied_rule_ids?: string[];
  skipped?: boolean;
  reason?: 'no_active_rules' | 'no_rule_matched' | 'already_applied';
  error?: string;
  detail?: string;
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
      queryClient.invalidateQueries({ queryKey: ['creatives-generated'] });
    },
  });
}
