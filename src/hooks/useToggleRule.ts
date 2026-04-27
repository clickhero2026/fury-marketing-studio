// Mutation generica pra ligar/desligar e excluir regras das 3 tabelas.
// Spec: .kiro/specs/fury-learning/ (T3.6)

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type RuleTable = 'behavior_rules' | 'creative_pipeline_rules' | 'fury_rules';

export function useToggleRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ table, id, is_enabled }: { table: RuleTable; id: string; is_enabled: boolean }) => {
      const { error } = await supabase
        .from(table as never)
        .update({ is_enabled } as never)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fury-rules'] }),
  });
}

export function useDeleteRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ table, id }: { table: RuleTable; id: string }) => {
      const { error } = await supabase.from(table as never).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fury-rules'] }),
  });
}
