// Hook canonico da Knowledge Base — listagem, upload, promote, edit, remove.
// Spec: .kiro/specs/knowledge-base-rag/ (task 5.1)

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import {
  KB_BUCKET,
  KB_SIGNED_URL_TTL_SECONDS,
  mimeToKbType,
  type KbError,
  type KnowledgeDocument,
  type KnowledgeFilters,
  type Result,
} from '@/types/knowledge';
import { validateFileForUpload } from '@/lib/knowledge-schemas';

const STALE_MS = 5 * 60 * 1000;

function toError(msg: unknown): KbError {
  return {
    kind: 'network',
    message: typeof msg === 'string' ? msg : (msg instanceof Error ? msg.message : 'erro de rede'),
  };
}

async function enrichWithSignedUrl(doc: KnowledgeDocument): Promise<KnowledgeDocument> {
  const { data } = await supabase.storage
    .from(doc.storage_bucket)
    .createSignedUrl(doc.storage_path, KB_SIGNED_URL_TTL_SECONDS);
  return { ...doc, signed_url: data?.signedUrl };
}

export function useKnowledge() {
  const { company, role } = useAuth();
  const companyId = company?.id ?? null;
  const isReadOnly = role !== 'owner' && role !== 'admin';
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<KnowledgeFilters>({});

  const documentsQuery = useQuery({
    queryKey: ['kb-documents', companyId, filters],
    enabled: !!companyId,
    staleTime: STALE_MS,
    queryFn: async (): Promise<KnowledgeDocument[]> => {
      if (!companyId) return [];

      let query = supabase
        .from('knowledge_documents' as never)
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (filters.type && filters.type.length > 0) {
        query = query.in('type', filters.type);
      }
      if (filters.status && filters.status.length > 0) {
        query = query.in('status', filters.status);
      }
      if (typeof filters.is_source_of_truth === 'boolean') {
        query = query.eq('is_source_of_truth', filters.is_source_of_truth);
      }
      if (filters.tags && filters.tags.length > 0) {
        // overlap em text[] (R7.2)
        query = query.overlaps('tags', filters.tags);
      }
      if (filters.search && filters.search.trim().length > 0) {
        const q = `%${filters.search.trim()}%`;
        query = query.or(`title.ilike.${q},description.ilike.${q}`);
      }

      const { data, error } = await query.limit(100);
      if (error) throw error;
      return (data as unknown as KnowledgeDocument[]) ?? [];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['kb-documents', companyId] });
    queryClient.invalidateQueries({ queryKey: ['kb-usage', companyId] });
  };

  // ============ UPLOAD ============
  const uploadMutation = useMutation({
    mutationFn: async (params: {
      file: File;
      meta?: { title?: string; description?: string; tags?: string[] };
    }): Promise<Result<KnowledgeDocument, KbError>> => {
      if (!companyId || isReadOnly) return { ok: false, error: { kind: 'unauthorized' } };

      const fileCheck = validateFileForUpload(params.file);
      if (!fileCheck.ok) {
        return {
          ok: false,
          error: fileCheck.reason === 'too_large'
            ? { kind: 'too_large', maxBytes: 25 * 1024 * 1024 }
            : { kind: 'unsupported_mime' },
        };
      }

      const docType = mimeToKbType(params.file.type);
      if (!docType) return { ok: false, error: { kind: 'unsupported_mime' } };

      // Quota check (R8.3)
      const usage = await fetchUsage(companyId);
      if (usage?.status === 'blocked' && usage.blocked_dimensions.length > 0) {
        const dim = usage.blocked_dimensions[0] as 'storage' | 'documents' | 'embeddings';
        return { ok: false, error: { kind: 'quota_exceeded', dimension: dim } };
      }

      // Path: {company_id}/{uuid}.{ext}
      const ext = params.file.name.includes('.') ? params.file.name.split('.').pop() : '';
      const docId = crypto.randomUUID();
      const storagePath = `${companyId}/${docId}${ext ? '.' + ext : ''}`;

      const { error: uploadErr } = await supabase.storage
        .from(KB_BUCKET)
        .upload(storagePath, params.file, { contentType: params.file.type, upsert: false });
      if (uploadErr) return { ok: false, error: toError(uploadErr.message) };

      const insert = {
        id: docId,
        company_id: companyId,
        title: params.meta?.title ?? params.file.name,
        description: params.meta?.description ?? null,
        type: docType,
        source: 'upload' as const,
        storage_bucket: KB_BUCKET,
        storage_path: storagePath,
        mime_type: params.file.type,
        size_bytes: params.file.size,
        tags: params.meta?.tags ?? [],
        status: 'pending' as const,
      };
      const { data, error: insertErr } = await supabase
        .from('knowledge_documents' as never)
        .insert(insert as never)
        .select()
        .single();

      if (insertErr || !data) {
        await supabase.storage.from(KB_BUCKET).remove([storagePath]);
        return { ok: false, error: toError(insertErr?.message ?? 'insert failed') };
      }

      // Best-effort: dispara kb-ingest (cron tambem cobrira)
      void supabase.functions.invoke('kb-ingest', {
        body: { document_ids: [docId] },
      }).catch(() => { /* silently ignore — cron pega depois */ });

      return { ok: true, value: data as unknown as KnowledgeDocument };
    },
    onSuccess: invalidate,
  });

  // ============ PROMOTE FROM CHAT ============
  const promoteMutation = useMutation({
    mutationFn: async (params: {
      attachmentId: string;
      meta?: { title?: string; description?: string; tags?: string[] };
    }): Promise<Result<KnowledgeDocument, KbError>> => {
      if (!companyId || isReadOnly) return { ok: false, error: { kind: 'unauthorized' } };

      const { data: att, error: attErr } = await supabase
        .from('chat_attachments' as never)
        .select('id, kind, mime_type, storage_path, original_filename, size_bytes, extracted_text')
        .eq('id', params.attachmentId)
        .eq('company_id', companyId)
        .maybeSingle();

      if (attErr || !att) return { ok: false, error: { kind: 'not_found' } };

      const a = att as unknown as {
        id: string;
        kind: 'image' | 'document';
        mime_type: string;
        storage_path: string;
        original_filename: string | null;
        size_bytes: number;
        extracted_text: string | null;
      };

      const docType = mimeToKbType(a.mime_type);
      if (!docType) return { ok: false, error: { kind: 'unsupported_mime' } };

      const insert = {
        company_id: companyId,
        title: params.meta?.title ?? a.original_filename ?? 'Anexo do chat',
        description: params.meta?.description ?? null,
        type: docType,
        source: 'chat_attachment' as const,
        source_attachment_id: a.id,
        storage_bucket: 'chat-attachments' as const,
        storage_path: a.storage_path,
        mime_type: a.mime_type,
        size_bytes: a.size_bytes,
        tags: params.meta?.tags ?? [],
        // R2.4: se ja temos texto extraido, pula re-extracao no kb-ingest
        extracted_text: a.extracted_text,
        status: 'pending' as const,
      };

      const { data, error: insertErr } = await supabase
        .from('knowledge_documents' as never)
        .insert(insert as never)
        .select()
        .single();

      if (insertErr) {
        // 23505 = unique violation (R2.5: dedupe)
        const code = (insertErr as { code?: string }).code;
        if (code === '23505') {
          return { ok: false, error: { kind: 'duplicate', reason: 'already_promoted_from_chat' } };
        }
        return { ok: false, error: toError(insertErr.message) };
      }

      const docId = (data as { id: string }).id;
      void supabase.functions.invoke('kb-ingest', {
        body: { document_ids: [docId] },
      }).catch(() => { /* cron retry */ });

      return { ok: true, value: data as unknown as KnowledgeDocument };
    },
    onSuccess: invalidate,
  });

  // ============ UPDATE METADATA ============
  const updateMetadataMutation = useMutation({
    mutationFn: async (params: {
      id: string;
      patch: Partial<Pick<KnowledgeDocument, 'title' | 'description' | 'tags' | 'is_source_of_truth'>>;
    }): Promise<Result<KnowledgeDocument, KbError>> => {
      if (!companyId || isReadOnly) return { ok: false, error: { kind: 'unauthorized' } };
      const { data, error } = await supabase
        .from('knowledge_documents' as never)
        .update(params.patch as never)
        .eq('id', params.id)
        .select()
        .single();
      if (error) return { ok: false, error: toError(error.message) };
      return { ok: true, value: data as unknown as KnowledgeDocument };
    },
    onSuccess: invalidate,
  });

  // ============ REMOVE ============
  const removeMutation = useMutation({
    mutationFn: async (id: string): Promise<Result<void, KbError>> => {
      if (!companyId || isReadOnly) return { ok: false, error: { kind: 'unauthorized' } };
      const target = (documentsQuery.data ?? []).find((d) => d.id === id);

      // Para chat_attachment, NAO apagar bytes — pertencem ao chat (R7.5)
      if (target && target.source === 'upload') {
        await supabase.storage.from(target.storage_bucket).remove([target.storage_path]);
      }
      const { error } = await supabase
        .from('knowledge_documents' as never)
        .delete()
        .eq('id', id);
      if (error) return { ok: false, error: toError(error.message) };
      return { ok: true, value: undefined };
    },
    onSuccess: invalidate,
  });

  // ============ RETRY FAILED ============
  const retryMutation = useMutation({
    mutationFn: async (id: string): Promise<Result<void, KbError>> => {
      if (!companyId || isReadOnly) return { ok: false, error: { kind: 'unauthorized' } };
      const { error } = await supabase
        .from('knowledge_documents' as never)
        .update({ status: 'pending', status_error: null } as never)
        .eq('id', id)
        .eq('status', 'failed');
      if (error) return { ok: false, error: toError(error.message) };

      void supabase.functions.invoke('kb-ingest', {
        body: { document_ids: [id] },
      }).catch(() => { /* ignore */ });
      return { ok: true, value: undefined };
    },
    onSuccess: invalidate,
  });

  return {
    documents: documentsQuery.data ?? [],
    isLoading: documentsQuery.isLoading,
    isError: documentsQuery.isError,
    isReadOnly,
    filters,
    setFilters,
    upload: uploadMutation.mutateAsync,
    promoteFromChat: promoteMutation.mutateAsync,
    updateMetadata: updateMetadataMutation.mutateAsync,
    remove: removeMutation.mutateAsync,
    retryFailed: retryMutation.mutateAsync,
    enrichWithSignedUrl,
  };
}

// Helper interno usado pelo upload pra checar quota antes do Storage write.
async function fetchUsage(companyId: string) {
  const { data } = await supabase.rpc('get_knowledge_usage' as never, {
    p_company_id: companyId,
  } as never);
  return data as unknown as {
    status: 'ok' | 'warning' | 'blocked';
    blocked_dimensions: string[];
  } | null;
}
