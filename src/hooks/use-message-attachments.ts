import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AttachmentKind, ExtractionStatus } from '@/lib/chat-constants';

export interface MessageAttachment {
  id: string;
  kind: AttachmentKind;
  mime_type: string;
  storage_path: string;
  original_filename: string | null;
  size_bytes: number;
  width: number | null;
  height: number | null;
  extraction_status: ExtractionStatus;
  signed_url?: string;
}

const SIGNED_URL_TTL_SECONDS = 240;

/**
 * Busca anexos por message_id e gera signed URLs (cache 4min).
 * Spec: chat-multimodal REQ-5
 */
export function useMessageAttachments(messageId: string | null | undefined) {
  return useQuery({
    queryKey: ['message-attachments', messageId],
    enabled: !!messageId,
    staleTime: SIGNED_URL_TTL_SECONDS * 1000,
    queryFn: async (): Promise<MessageAttachment[]> => {
      if (!messageId) return [];
      const { data, error } = await supabase
        .from('chat_attachments' as never)
        .select(
          'id, kind, mime_type, storage_path, original_filename, size_bytes, width, height, extraction_status'
        )
        .eq('message_id', messageId)
        .order('created_at', { ascending: true });

      if (error || !data) return [];
      return enrichWithSignedUrls(data as unknown as MessageAttachment[]);
    },
  });
}

/**
 * Variante: busca anexos por lista de IDs (uso quando user message
 * existe so client-side e ainda nao tem DB id).
 */
export function useAttachmentsByIds(ids: string[] | undefined) {
  const stableKey = (ids ?? []).slice().sort().join(',');
  return useQuery({
    queryKey: ['attachments-by-ids', stableKey],
    enabled: !!ids && ids.length > 0,
    staleTime: SIGNED_URL_TTL_SECONDS * 1000,
    queryFn: async (): Promise<MessageAttachment[]> => {
      if (!ids || !ids.length) return [];
      const { data, error } = await supabase
        .from('chat_attachments' as never)
        .select(
          'id, kind, mime_type, storage_path, original_filename, size_bytes, width, height, extraction_status'
        )
        .in('id', ids);
      if (error || !data) return [];
      return enrichWithSignedUrls(data as unknown as MessageAttachment[]);
    },
  });
}

async function enrichWithSignedUrls(list: MessageAttachment[]): Promise<MessageAttachment[]> {
  return Promise.all(
    list.map(async (att) => {
      const { data: signed } = await supabase.storage
        .from('chat-attachments')
        .createSignedUrl(att.storage_path, SIGNED_URL_TTL_SECONDS);
      return { ...att, signed_url: signed?.signedUrl };
    })
  );
}
