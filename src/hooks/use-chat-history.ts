// Lista de conversas anteriores + carrega mensagens de uma conversa.
// Usado pelo ChatHistorySidebar pra navegar como ChatGPT/Claude.

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import type { ChatMessage } from './use-chat';

export interface ConversationSummary {
  id: string;
  title: string | null;
  message_count: number | null;
  created_at: string;
  updated_at: string | null;
}

export function useConversationList() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['chat-conversations', user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<ConversationSummary[]> => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('chat_conversations' as never)
        .select('id, title, message_count, created_at, updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as ConversationSummary[];
    },
  });
}

export function useConversationMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ['chat-messages', conversationId],
    enabled: !!conversationId,
    staleTime: 5_000,
    queryFn: async (): Promise<ChatMessage[]> => {
      if (!conversationId) return [];
      const { data, error } = await supabase
        .from('chat_messages' as never)
        .select('id, role, content, created_at, metadata')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<{
        id: string;
        role: 'user' | 'assistant';
        content: string;
        created_at: string;
        metadata: { attachments?: string[] } | null;
      }>;
      return rows.map((r) => ({
        id: r.id,
        role: r.role,
        content: r.content,
        timestamp: new Date(r.created_at),
        attachmentIds:
          r.role === 'user' && Array.isArray(r.metadata?.attachments)
            ? r.metadata!.attachments
            : undefined,
      }));
    },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase
        .from('chat_conversations' as never)
        .delete()
        .eq('id', conversationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-conversations'] });
    },
  });
}

export function useRenameConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { error } = await supabase
        .from('chat_conversations' as never)
        .update({ title } as never)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-conversations'] });
    },
  });
}
