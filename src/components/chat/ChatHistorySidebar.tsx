// Sidebar de conversas anteriores (estilo ChatGPT/Claude).
// Lista as 50 conversas mais recentes do user. Clique abre + carrega historico.

import { useEffect, useState } from 'react';
import { MessageSquare, Trash2, Loader2, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  useConversationList,
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

async function fetchConversationMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, role, content, created_at, metadata')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message || 'Erro ao buscar mensagens');
  type Row = {
    id: string;
    role: string;
    content: string;
    created_at: string;
    metadata: { attachments?: string[] } | null;
  };
  const rows = (data ?? []) as Row[];
  return rows.map((r) => ({
    id: r.id,
    role: (r.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
    content: r.content,
    timestamp: new Date(r.created_at),
    attachmentIds:
      r.role === 'user' && Array.isArray(r.metadata?.attachments)
        ? r.metadata!.attachments
        : undefined,
  }));
}

export function ChatHistorySidebar({ currentConversationId, onSelectConversation, onNewConversation }: Props) {
  const { data: conversations, isLoading } = useConversationList();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const del = useDeleteConversation();
  const { toast } = useToast();

  const filteredConversations = (conversations ?? []).filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (c.title ?? '').toLowerCase().includes(q);
  });

  const handleSelect = async (conv: ConversationSummary) => {
    if (loadingId) return;
    setLoadingId(conv.id);
    try {
      const history = await fetchConversationMessages(conv.id);
      onSelectConversation(conv.id, history);
    } catch (e) {
      toast({
        title: 'Falha ao abrir conversa',
        description: (e as Error).message,
        variant: 'destructive',
      });
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (e: React.MouseEvent, conv: ConversationSummary) => {
    e.stopPropagation();
    if (!confirm(`Excluir "${conv.title ?? 'esta conversa'}"?`)) return;
    try {
      await del.mutateAsync(conv.id);
      toast({ title: 'Conversa excluida' });
      if (conv.id === currentConversationId) onNewConversation();
    } catch (err) {
      toast({ title: 'Falha ao excluir', description: (err as Error).message, variant: 'destructive' });
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border/50 space-y-2">
        <Button variant="default" className="w-full justify-start gap-2" onClick={onNewConversation}>
          <MessageSquare className="h-4 w-4" />
          Nova conversa
        </Button>
        {/* Busca no historico */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar conversa..."
            className="w-full pl-7 pr-7 py-1.5 text-xs rounded-md bg-background/50 border border-border/50 focus:outline-none focus:border-primary/50"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 hover:bg-accent rounded"
              aria-label="Limpar busca"
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isLoading && <div className="text-xs text-muted-foreground p-2">Carregando...</div>}
        {!isLoading && (!conversations || conversations.length === 0) && (
          <div className="text-xs text-muted-foreground p-2">Sem conversas anteriores ainda.</div>
        )}
        {!isLoading && conversations && conversations.length > 0 && filteredConversations.length === 0 && (
          <div className="text-xs text-muted-foreground p-2">Nenhuma conversa encontrada para "{searchQuery}".</div>
        )}
        {filteredConversations.map((conv) => {
          const isActive = conv.id === currentConversationId;
          const isLoading = loadingId === conv.id;
          return (
            <div
              key={conv.id}
              className={cn(
                'group flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer text-sm',
                isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
              )}
              onClick={() => handleSelect(conv)}
            >
              <div className="flex-1 min-w-0">
                <div className="truncate text-foreground flex items-center">
                  {isLoading && <Loader2 className="inline h-3 w-3 mr-1.5 animate-spin shrink-0" />}
                  <span className="truncate">{conv.title || 'Sem titulo'}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  {typeof conv.message_count === 'number' && <span>{conv.message_count} msgs</span>}
                  <span>·</span>
                  <span>{relativeTime(conv.updated_at ?? conv.created_at)}</span>
                </div>
              </div>
              <button
                onClick={(e) => handleDelete(e, conv)}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 rounded text-destructive shrink-0"
                aria-label="Excluir conversa"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
