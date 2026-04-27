import { useCallback, useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  ALLOWED_TYPES,
  MAX_FILE_SIZE,
  MAX_TOTAL_SIZE,
  MAX_FILES,
  EXTRACTION_TIMEOUT_MS,
  classifyMimeType,
  sanitizeFilename,
  formatFileSize,
  type AttachmentKind,
  type ExtractionStatus,
} from '@/lib/chat-constants';
import { resizeImageIfNeeded, getImageDimensions } from '@/lib/image-resize';

export interface PendingAttachment {
  /** ID local (uuid client-side) */
  localId: string;
  /** ID do registro chat_attachments (preenchido apos upload) */
  id?: string;
  file: File;
  kind: AttachmentKind;
  /** Preview URL (object URL pra imagem) */
  previewUrl?: string;
  /** Estado do upload */
  uploadStatus: 'idle' | 'uploading' | 'uploaded' | 'failed';
  uploadProgress: number; // 0..1
  uploadError?: string;
  /** Estado da extracao de texto (so documento) */
  extractionStatus?: ExtractionStatus;
  extractionError?: string;
}

export interface UseAttachmentsReturn {
  pending: PendingAttachment[];
  addFiles: (files: FileList | File[]) => Promise<void>;
  remove: (localId: string) => void;
  clear: () => void;
  /** True quando algum anexo ainda esta uploading ou extracao pendente */
  isBusy: boolean;
  /** True quando todos uploads OK e extracoes terminadas (done|failed|skipped) */
  isReady: boolean;
  /** IDs prontos pra enviar pro ai-chat */
  readyAttachmentIds: string[];
  /** Erros de validacao apos addFiles (resetados em add subsequente) */
  validationErrors: string[];
}

/**
 * Gerencia anexos pendentes de uma mensagem do chat.
 * Spec: .kiro/specs/chat-multimodal/ (REQ-1, REQ-2, REQ-3)
 *
 * Fluxo:
 *   1. addFiles() valida -> resize imagem -> upload Storage -> INSERT chat_attachments
 *   2. Se documento: dispara extract-attachment-text em background
 *   3. Polling do extraction_status via realtime channel (com fallback poll 1s)
 *   4. Quando todos terminados -> isReady=true, expoe readyAttachmentIds
 */
export function useAttachments(conversationId: string | null): UseAttachmentsReturn {
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const channelsRef = useRef<Map<string, ReturnType<typeof supabase.channel>>>(new Map());

  const updateOne = useCallback((localId: string, patch: Partial<PendingAttachment>) => {
    setPending((prev) => prev.map((p) => (p.localId === localId ? { ...p, ...patch } : p)));
  }, []);

  const addFiles = useCallback(
    async (incoming: FileList | File[]) => {
      const files = Array.from(incoming);
      const errors: string[] = [];

      // Validacao: total count
      if (pending.length + files.length > MAX_FILES) {
        errors.push(`Maximo ${MAX_FILES} arquivos por mensagem`);
        setValidationErrors(errors);
        return;
      }

      // Validacao: total size
      const currentTotal = pending.reduce((s, p) => s + p.file.size, 0);
      const incomingTotal = files.reduce((s, f) => s + f.size, 0);
      if (currentTotal + incomingTotal > MAX_TOTAL_SIZE) {
        errors.push(`Tamanho total acima de ${formatFileSize(MAX_TOTAL_SIZE)}`);
        setValidationErrors(errors);
        return;
      }

      // Validacao por arquivo
      const accepted: { file: File; kind: AttachmentKind }[] = [];
      for (const file of files) {
        if (file.size > MAX_FILE_SIZE) {
          errors.push(`${file.name}: maior que ${formatFileSize(MAX_FILE_SIZE)}`);
          continue;
        }
        if (!(ALLOWED_TYPES as readonly string[]).includes(file.type)) {
          errors.push(`${file.name}: tipo "${file.type || 'desconhecido'}" nao suportado`);
          continue;
        }
        const kind = classifyMimeType(file.type);
        if (!kind) {
          errors.push(`${file.name}: nao foi possivel classificar`);
          continue;
        }
        accepted.push({ file, kind });
      }

      setValidationErrors(errors);
      if (!accepted.length) return;

      // Cria entries iniciais
      const newEntries: PendingAttachment[] = accepted.map(({ file, kind }) => ({
        localId: crypto.randomUUID(),
        file,
        kind,
        previewUrl: kind === 'image' ? URL.createObjectURL(file) : undefined,
        uploadStatus: 'idle',
        uploadProgress: 0,
      }));
      setPending((prev) => [...prev, ...newEntries]);

      // Upload em paralelo
      await Promise.all(newEntries.map((entry) => uploadOne(entry)));
    },
    [pending]
  );

  const uploadOne = useCallback(
    async (entry: PendingAttachment) => {
      try {
        updateOne(entry.localId, { uploadStatus: 'uploading', uploadProgress: 0.1 });

        // Pegar user + company_id
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData.user?.id;
        if (!userId) throw new Error('Nao autenticado');

        const { data: companyRow } = await supabase
          .from('users' as never)
          .select('company_id')
          .eq('id', userId)
          .maybeSingle();
        const companyId = (companyRow as { company_id?: string } | null)?.company_id;
        if (!companyId) throw new Error('Empresa nao identificada');

        // Resize se imagem
        let fileToUpload = entry.file;
        if (entry.kind === 'image') {
          fileToUpload = await resizeImageIfNeeded(entry.file);
        }

        updateOne(entry.localId, { uploadProgress: 0.3 });

        // Path: <company_id>/<conversation_id|new>/<uuid>.<ext>
        const ext = (fileToUpload.name.split('.').pop() || 'bin').toLowerCase().slice(0, 10);
        const fileUuid = crypto.randomUUID();
        const convSegment = conversationId ?? 'new';
        const path = `${companyId}/${convSegment}/${fileUuid}.${ext}`;

        const { error: uploadErr } = await supabase.storage
          .from('chat-attachments')
          .upload(path, fileToUpload, {
            contentType: fileToUpload.type,
            upsert: false,
          });
        if (uploadErr) throw uploadErr;

        updateOne(entry.localId, { uploadProgress: 0.7 });

        // Dimensoes (so imagem)
        const dims = entry.kind === 'image' ? await getImageDimensions(fileToUpload) : null;

        // INSERT chat_attachments (message_id sera preenchido depois pelo ai-chat)
        const { data: row, error: insertErr } = await supabase
          .from('chat_attachments' as never)
          .insert({
            kind: entry.kind,
            mime_type: fileToUpload.type,
            storage_path: path,
            original_filename: sanitizeFilename(entry.file.name),
            size_bytes: fileToUpload.size,
            width: dims?.width ?? null,
            height: dims?.height ?? null,
            conversation_id: conversationId,
            uploader_id: userId,
            extraction_status: entry.kind === 'image' ? 'skipped' : 'pending',
          } as never)
          .select('id')
          .single();
        if (insertErr || !row) throw insertErr ?? new Error('insert chat_attachments falhou');

        const attachmentId = (row as { id: string }).id;

        updateOne(entry.localId, {
          id: attachmentId,
          uploadStatus: 'uploaded',
          uploadProgress: 1,
          extractionStatus: entry.kind === 'image' ? 'skipped' : 'pending',
        });

        // Disparar extracao em background (so documento)
        if (entry.kind === 'document') {
          supabase.functions
            .invoke('extract-attachment-text', { body: { attachment_id: attachmentId } })
            .catch(() => {
              // erro logado pelo edge function; UI pega via polling
            });

          // Subscrever realtime + fallback polling
          subscribeExtraction(entry.localId, attachmentId);
        }
      } catch (e) {
        const msg = (e as Error)?.message ?? String(e);
        updateOne(entry.localId, { uploadStatus: 'failed', uploadError: msg, uploadProgress: 0 });
      }
    },
    [conversationId, updateOne]
  );

  /**
   * Realtime channel pra observar mudanca de extraction_status.
   * Fallback polling 1s ate timeout.
   */
  const subscribeExtraction = useCallback(
    (localId: string, attachmentId: string) => {
      const channel = supabase
        .channel(`chat_att:${attachmentId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'chat_attachments',
            filter: `id=eq.${attachmentId}`,
          },
          (payload) => {
            const newRow = payload.new as { extraction_status?: ExtractionStatus; extraction_error?: string };
            if (newRow.extraction_status && newRow.extraction_status !== 'pending') {
              updateOne(localId, {
                extractionStatus: newRow.extraction_status,
                extractionError: newRow.extraction_error,
              });
              const ch = channelsRef.current.get(attachmentId);
              if (ch) {
                supabase.removeChannel(ch);
                channelsRef.current.delete(attachmentId);
              }
            }
          }
        )
        .subscribe();
      channelsRef.current.set(attachmentId, channel);

      // Fallback polling
      const pollStart = Date.now();
      const poll = async () => {
        if (Date.now() - pollStart > EXTRACTION_TIMEOUT_MS) return;
        const { data } = await supabase
          .from('chat_attachments' as never)
          .select('extraction_status, extraction_error')
          .eq('id', attachmentId)
          .single();
        const row = data as { extraction_status?: ExtractionStatus; extraction_error?: string } | null;
        if (row?.extraction_status && row.extraction_status !== 'pending') {
          updateOne(localId, {
            extractionStatus: row.extraction_status,
            extractionError: row.extraction_error,
          });
          const ch = channelsRef.current.get(attachmentId);
          if (ch) {
            supabase.removeChannel(ch);
            channelsRef.current.delete(attachmentId);
          }
          return;
        }
        setTimeout(poll, 1000);
      };
      setTimeout(poll, 1000);
    },
    [updateOne]
  );

  const remove = useCallback((localId: string) => {
    setPending((prev) => {
      const target = prev.find((p) => p.localId === localId);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      // Tentativa best-effort de deletar do storage e da tabela (RLS protege)
      if (target?.id) {
        supabase
          .from('chat_attachments' as never)
          .delete()
          .eq('id', target.id)
          .then(() => {
            // best-effort
          });
      }
      return prev.filter((p) => p.localId !== localId);
    });
  }, []);

  const clear = useCallback(() => {
    setPending((prev) => {
      prev.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
      return [];
    });
    setValidationErrors([]);
    // Limpa channels
    channelsRef.current.forEach((ch) => supabase.removeChannel(ch));
    channelsRef.current.clear();
  }, []);

  // Cleanup no unmount
  useEffect(() => {
    return () => {
      pending.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
      channelsRef.current.forEach((ch) => supabase.removeChannel(ch));
      channelsRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isBusy = pending.some(
    (p) =>
      p.uploadStatus === 'uploading' ||
      p.uploadStatus === 'idle' ||
      (p.kind === 'document' && p.extractionStatus === 'pending')
  );

  const isReady =
    pending.length === 0 ||
    pending.every(
      (p) =>
        p.uploadStatus === 'uploaded' &&
        (p.kind === 'image' || (p.extractionStatus && p.extractionStatus !== 'pending'))
    );

  const readyAttachmentIds = pending
    .filter((p) => p.uploadStatus === 'uploaded' && p.id)
    .map((p) => p.id!) as string[];

  return {
    pending,
    addFiles,
    remove,
    clear,
    isBusy,
    isReady,
    readyAttachmentIds,
    validationErrors,
  };
}
