// Query de propostas de regra pendentes de uma conversa (renderizadas inline).
// Spec: .kiro/specs/fury-learning/

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ProposedRuleEnvelope } from '@/types/fury-rules';

export interface PendingProposal {
  message_id: string;
  envelope: ProposedRuleEnvelope;
  created_at: string;
}

export function useRuleProposals(conversationId: string | null) {
  return useQuery({
    queryKey: ['rule-proposals', conversationId],
    enabled: !!conversationId,
    refetchInterval: 4000,
    staleTime: 2000,
    queryFn: async (): Promise<PendingProposal[]> => {
      if (!conversationId) return [];
      const { data, error } = await supabase
        .from('chat_messages' as never)
        .select('id, metadata, created_at')
        .eq('conversation_id', conversationId)
        .eq('role', 'assistant')
        .order('created_at', { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        id: string;
        metadata: { proposed_rule?: ProposedRuleEnvelope } | null;
        created_at: string;
      }>;
      return rows
        .filter((r) => r.metadata?.proposed_rule?.status === 'pending')
        .map((r) => ({
          message_id: r.id,
          envelope: r.metadata!.proposed_rule!,
          created_at: r.created_at,
        }));
    },
  });
}
