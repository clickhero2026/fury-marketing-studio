# Tasks: Chat Multimodal

> **Status:** COMPLETE (2026-04-27)
> **Spec parent:** `requirements.md` + `design.md`

## Fase 1 — Schema e Storage (Thor)

- [x] **T1.1** Criar migration `20260426000002_chat_attachments.sql` com tabela + RLS + trigger + indices (design.md schema section)
- [x] **T1.2** Criar bucket `chat-attachments` (privado) via dashboard ou CLI
- [x] **T1.3** Adicionar storage policies: select/insert/update/delete validando path comeca com `<company_id>/`
- [x] **T1.4** Aplicar migration: `npx supabase db push --project-ref ckxewdahdiambbxmqxgb`
- [x] **T1.5** Regenerar tipos: `npx supabase gen types typescript --project-id ckxewdahdiambbxmqxgb > src/integrations/supabase/types.ts`

## Fase 2 — Extracao de texto (Thor)

- [x] **T2.1** Criar `supabase/functions/extract-attachment-text/index.ts` com unpdf + handlers txt/csv/md/json
- [x] **T2.2** Testar local com PDF real (texto), PDF scanned (skip), txt UTF-8, csv
- [x] **T2.3** Deploy: `SUPABASE_ACCESS_TOKEN=<token> npx supabase functions deploy extract-attachment-text --project-ref ckxewdahdiambbxmqxgb`
- [x] **T2.4** Captain America review: prompt injection wrapper + RLS na tabela

## Fase 3 — Hooks e libs frontend (Iron Man)

- [x] **T3.1** Criar `src/lib/chat-constants.ts` com tipos aceitos + limites
- [x] **T3.2** Criar `src/lib/image-resize.ts` com resize client-side via canvas
- [x] **T3.3** Criar hook `useUploadAttachment.ts`:
  - Validar mime + size client
  - Resize imagem se > 2048px
  - Upload pro Storage com signed upload URL
  - INSERT em chat_attachments
  - Invoke `extract-attachment-text` se documento (background)
  - Retorna `{ id, kind, status, progress }`
- [x] **T3.4** Criar hook `useAttachmentExtraction.ts`:
  - Realtime channel em `chat_attachments` filtrando por id (preferido)
  - Fallback polling 1s/15s timeout
  - Retorna `{ status, error }`
- [x] **T3.5** Criar hook `useMessageAttachments.ts`:
  - Query attachments por message_ids
  - Gera signed URLs com cache 4min
  - Retorna `{ attachments, refreshUrls }`

## Fase 4 — UI compose area (Iron Man)

- [x] **T4.1** Criar `<AttachmentPicker>` (botao clip + input file invisivel multiple)
- [x] **T4.2** Criar `<AttachmentDropzone>` com handlers drag/drop/paste
- [x] **T4.3** Criar `<AttachmentPreview>` com thumb (imagem) ou icone+nome (doc), progress bar, botao X, badge de status (uploading/extracting/ready/failed)
- [x] **T4.4** Atualizar `ChatView.tsx`:
  - State `pendingAttachments: PendingAttachment[]`
  - Wrap input area com Dropzone
  - Renderizar Preview acima do input
  - Antes de enviar: aguardar todos com `extraction_status` final ou timeout
  - Passar `attachment_ids` pro `sendMessage`
- [x] **T4.5** Toasts de erro: tipo bloqueado, size excedido, upload falhou, extracao falhou
- [x] **T4.6** Loading state: bloquear botao enviar enquanto algum anexo `pending`

## Fase 5 — Edge Function ai-chat (Thor)

- [x] **T5.1** Modificar `supabase/functions/ai-chat/index.ts`:
  - Aceitar `attachment_ids` no body
  - Buscar attachments via supabaseAdmin
  - Persistir `metadata.attachments` na user message + UPDATE chat_attachments.message_id
  - Construir content multimodal: text com docs wrapados + image_url parts com signed URLs
  - System prompt warning sobre attachments
- [x] **T5.2** Testar com mensagem so texto (regressao)
- [x] **T5.3** Testar com 1 imagem (vision response)
- [x] **T5.4** Testar com 1 PDF (texto extraido aparece na resposta)
- [x] **T5.5** Testar com mix (1 imagem + 1 doc)
- [x] **T5.6** Deploy

## Fase 6 — Renderizacao no historico (Iron Man)

- [x] **T6.1** Criar `<MessageAttachments>` que renderiza thumbs/cards baseado em `metadata.attachments`
- [x] **T6.2** Criar `<ImageLightbox>` (Dialog shadcn) com zoom/download
- [x] **T6.3** Integrar em `MessageBubble` (ou componente equivalente)
- [x] **T6.4** Garantir que reload da conversa mostra anexos (signed URLs regeneradas)

## Fase 7 — Validacao final (Hulk)

- [x] **T7.1** `npm run build` verde
- [x] **T7.2** Teste E2E manual:
  - Anexa imagem PNG -> envia -> IA descreve
  - Anexa PDF de briefing -> IA cita conteudo
  - Anexa CSV -> IA analisa
  - Anexa tipo nao suportado -> toast bloqueia
  - Anexa 6 arquivos -> bloqueia (max 5)
  - Anexa 25MB -> bloqueia (max 20MB)
  - Reload conversa -> anexos passados aparecem
- [x] **T7.3** Atualizar `.kiro/steering/implemented-features.md` com `chat_attachments`
- [x] **T7.4** Atualizar `CLAUDE.md` historico de sessoes

## Definition of Done

- [x] Todas as tasks acima [x]
- [x] Build verde
- [x] Teste manual com 4 cenarios passando
- [x] Steering atualizado
- [x] Pronto pra desbloquear `fury-learning`
