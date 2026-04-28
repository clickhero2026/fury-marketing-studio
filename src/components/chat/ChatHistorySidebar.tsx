// Sidebar de conversas anteriores (estilo ChatGPT/Claude).
// Lista as 50 conversas mais recentes do user. Clique abre + carrega historico.

import { useState } from 'react';
import { MessageSquare, Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  useConversationList,
  useConversationMessages,
  useDeleteConversation,
  type ConversationSummary,
} from '@/hooks/use-chat-history';
import type { ChatMessage } from '@/hooks/use-chat';

interface Props {
  currentConversationId: string | null;
  onSelectConversation: (id: string, history: ChatMessage[]) => void;
  onNewConversation: () => void;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}sem`;
  const months = Math.floor(days / 30);
  return `${months}m`;
}

export function ChatHistorySidebar({ currentConversationId, onSelectConversation, onNewConversation }: Props) {
  const { data: conversations, isLoading } = useConversationList();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const { toast } = useToast();

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border/50">
        <Button
          variant="default"
          className="w-full justify-start gap-2"
          onClick={onNewConversation}
        >
          <MessageSquare className="h-4 w-4" />
          Nova conversa
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isLoading && (
          <div className="text-xs text-muted-foreground p-2">Carregando...</div>
        )}
        {!isLoading && (!conversations || conversations.length === 0) && (
          <div className="text-xs text-muted-foreground p-2">Sem conversas anteriores ainda.</div>
        )}
        {conversations?.map((conv) => (
          <ConversationRow
            key={conv.id}
            conv={conv}
            isActive={conv.id === currentConversationId}
            isLoading={loadingId === conv.id}
            onSelect={async (history) => {
              onSelectConversation(conv.id, history);
              setLoadingId(null);
            }}
            onLoadStart={() => setLoadingId(conv.id)}
            onLoadError={(msg) => {
              setLoadingId(null);
              toast({ title: 'Falha ao abrir conversa', description: msg, variant: 'destructive' });
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ConversationRow({
  conv,
  isActive,
  isLoading,
  onSelect,
  onLoadStart,
  onLoadError,
}: {
  conv: ConversationSummary;
  isActive: boolean;
  isLoading: boolean;
  onSelect: (history: ChatMessage[]) => void;
  onLoadStart: () => void;
  onLoadError: (msg: string) => void;
}) {
  const messagesQuery = useConversationMessages(null);
  const del = useDeleteConversation();
  const { toast } = useToast();

  const handleClick = async () => {
    if (isLoading) return;
    onLoadStart();
    const result = await messagesQuery.refetch ? null : null;
    void result;
    // Buscar manualmente — refetch da query controlada nao funciona aqui.
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data, error } = await supabase
        .from('chat_messages' as never)
        .select('id, role, content, created_at, metadata')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<{
        id: string;
        role: 'user' | 'assistant';
        content: string;
        created_at: string;
        metadata: { attachments?: string[] } | null;
      }>;
      const history: ChatMessage[] = rows.map((r) => ({
        id: r.id,
        role: r.role,
        content: r.content,
        timestamp: new Date(r.created_at),
        attachmentIds:
          r.role === 'user' && Array.isArray(r.metadata?.attachments)
            ? r.metadata!.attachments
            : undefined,
      }));
      onSelect(history);
    } catch (e) {
      onLoadError((e as Error).message);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Excluir "${conv.title ?? 'esta conversa'}"?`)) return;
    try {
      await del.mutateAsync(conv.id);
      toast({ title: 'Conversa excluida' });
    } catch (e) {
      toast({ title: 'Falha ao excluir', description: (e as Error).message, variant: 'destructive' });
    }
  };

  return (
    <div
      className={cn(
        'group flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer text-sm',
        isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
      )}
      onClick={handleClick}
    >
      <div className="flex-1 min-w-0">
        <div className="truncate text-foreground">
          {isLoading && <Loader2 className="inline h-3 w-3 mr-1.5 animate-spin" />}
          {conv.title || 'Sem titulo'}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {conv.message_count !== null && conv.message_count !== undefined && (
            <span>{conv.message_count} msgs</span>
          )}
          <span>·</span>
          <span>{relativeTime(conv.updated_at ?? conv.created_at)}</span>
        </div>
      </div>
      <button
        onClick={handleDelete}
        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 rounded text-destructive shrink-0"
        aria-label="Excluir conversa"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
