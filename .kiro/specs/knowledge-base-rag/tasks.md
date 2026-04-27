# Implementation Plan — knowledge-base-rag

> **Modo**: Aditivo. Reusa pgvector, OpenAI embeddings (`text-embedding-3-small`), tenant guard e padroes de bucket privado ja estabelecidos. Nenhuma tabela ou Edge Function existente sera modificada de forma breaking. A tool no chat e adicionada de forma opt-in via system prompt.

## 1. Schema base e RLS

- [x] 1.1 Habilitar pgvector e criar `knowledge_documents`
  - Garantir extension pgvector (provavel ja habilitada via memories — IF NOT EXISTS)
  - Criar tabela com colunas: title, description, type, source ('upload' | 'chat_attachment'), source_attachment_id, storage_bucket, storage_path UNIQUE, mime_type, size_bytes, page_count, tags text[], is_source_of_truth, status, status_error, embedding_model_version, indexed_at
  - Constraint CHECK validando invariant de source vs storage_bucket
  - Indices em (company_id, status), (company_id, created_at DESC), GIN em tags
  - RLS por current_user_company_id() em SELECT/INSERT/UPDATE/DELETE
  - Trigger auto_set_company_id_on_insert
  - _Requirements: 1.1, 1.4, 1.7, 7.1, 7.4, 9.1_

- [x] 1.2 (P) Criar `knowledge_chunks` com vector(1536)
  - Colunas: document_id FK, company_id FK (denormalizado para perf), chunk_index, page_number, chunk_text, embedding vector(1536), embedding_model_version, token_count
  - FK com ON DELETE CASCADE
  - Indice unique em (document_id, chunk_index)
  - RLS: SELECT por company_id; INSERT/UPDATE/DELETE apenas service_role (Edge Functions)
  - _Requirements: 4.1, 4.2, 4.3, 9.1_

- [x] 1.3 (P) Criar `knowledge_query_log` e `knowledge_usage_monthly`
  - knowledge_query_log: company_id, user_id, query_preview (truncado em 200 chars), top_k, chunk_ids uuid[], top_score, duration_ms, created_at
  - knowledge_usage_monthly: company_id, month, embeddings_tokens, documents_count, storage_bytes; unique (company_id, month)
  - RLS: SELECT por company_id; INSERT apenas service_role
  - Indices apropriados em (company_id, created_at DESC) e (company_id, month DESC)
  - _Requirements: 5.5, 8.5, 9.1_

- [x] 1.4 Criar indice HNSW em knowledge_chunks.embedding
  - CREATE INDEX CONCURRENTLY com vector_cosine_ops
  - Parametros m=16, ef_construction=64
  - Documentar como reconstruir caso fique degradado
  - _Requirements: 5.6_

- [x] 1.5 (P) Estender tabela `plans` com colunas de quota KB
  - ALTER TABLE plans ADD: kb_storage_bytes_max bigint, kb_documents_max int, kb_embeddings_per_month_max bigint
  - Defaults: free=500MB/100/100k, pro=5GB/1000/1M, enterprise=50GB/10000/10M
  - UPDATE rows existentes com defaults
  - _Requirements: 8.1_

- [x] 1.6 (P) Criar bucket Storage `knowledge-base` com policies
  - Bucket privado, file_size_limit 25MB, mime allowlist (PDF/DOCX/XLSX/CSV/JSON/TXT/MD/PNG/JPEG/WEBP)
  - Policies de Storage por path `{company_id}/...`
  - Replicar template do `chat-attachments`/`company-assets`
  - _Requirements: 1.2, 9.2, 9.3_

## 2. RPCs publicas

- [x] 2.1 Implementar RPC `search_knowledge`
  - Parametros: p_company_id uuid, p_query_embedding vector(1536), p_top_k int default 8, p_filters jsonb default '{}'
  - Validar p_top_k em [1, 20]
  - Filtros: type, tags (qualquer match), is_source_of_truth
  - Order by `embedding <=> p_query_embedding` (cosine distance)
  - Retornar score = 1 - distance, com boost configuravel para is_source_of_truth (default +0.05)
  - INSERT em knowledge_query_log com truncate da query a 200 chars
  - SECURITY INVOKER para herdar RLS
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 2.2 (P) Implementar RPC `get_knowledge_usage`
  - Calcula bytes (SUM size_bytes de status='indexed'), documents (COUNT), embeddings_tokens_this_month (SUM via agent_runs WHERE purpose='kb-embed' AND month current)
  - Le quota da tabela plans via current_user_organization_id()
  - Retorna status: ok | warning (>=80%) | blocked (>=100%) com warning_dimensions e blocked_dimensions
  - SECURITY INVOKER
  - _Requirements: 8.1, 8.2, 8.4_

## 3. Pipeline async (Edge Functions + crons)

- [x] 3.1 Implementar `kb-ingest` Edge Function — esqueleto + extracao
  - Endpoint POST recebe { document_ids: string[] }
  - Valida JWT ou service_role; usa tenant guard para checar acesso aos document_ids
  - Para cada document_id: SELECT documento, baixa do bucket apropriado, marca status=extracting
  - Estrategia per-type: PDF (pdf-parse), DOCX, XLSX, TXT/MD/CSV/JSON puros
  - Salva extracted_text em coluna nova ou em chunk_text temporario
  - Em falha: status=failed + status_error
  - Concurrency max 5 docs por invocacao
  - _Requirements: 1.4, 1.5, 3.1, 3.2, 3.3, 3.5, 3.6_

- [x] 3.2 Adicionar OCR + caption por GPT-4o-mini para imagens
  - Quando MIME for image/*, chamar OpenAI vision com prompt estruturado retornando { extracted_text, visual_description }
  - Concatenar texto extraido + caption antes do chunking
  - Custo registrado em agent_runs com purpose='kb-vision'
  - _Requirements: 3.4_

- [x] 3.3 Implementar chunking por tipo
  - Default: 800 tokens com overlap 100
  - PDF/DOCX: respeitar page boundaries, page_number por chunk
  - CSV/XLSX: chunk por bloco de linhas (header repetido + 50 linhas)
  - JSON: chunk por objeto top-level se array no root, fallback default
  - Imagens: 1 chunk unico
  - _Requirements: 4.1, 4.3_

- [x] 3.4 Adicionar geracao de embeddings em batch
  - Reusar padrao do ai-chat para chamada OpenAI text-embedding-3-small
  - Batch de ate 100 inputs por chamada (limite OpenAI)
  - Concurrency max 5 chamadas paralelas por company
  - INSERT chunks transacional (todos ou nada)
  - Marcar status=indexed e indexed_at
  - Registrar custo em agent_runs com purpose='kb-embed' e token_count somado
  - _Requirements: 4.2, 4.5, 4.6_

- [x] 3.5 (P) Implementar `kb-reindex` Edge Function
  - Endpoint POST recebe { scope: 'document' | 'company' | 'global', target_id?, target_model? }
  - scope=global requer service_role + admin role check
  - Cria chunks novos com embedding_model_version atualizado, mantendo antigos
  - Apos sucesso, deleta chunks antigos em transacao
  - Reusa rate limit de R4.5
  - Permite retry de documents com status='failed'
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [~] 3.6 (P) Configurar cron `kb-process-pending` — depende de pg_net (manual)
  - Roda a cada 30s (`*/30 * * * * *` ou */1 minuto se cron nao suportar segundos)
  - Query: SELECT documents WHERE status='pending' LIMIT 5
  - HTTP call para kb-ingest com os ids
  - Idempotente: status=extracting marca como em processamento
  - _Requirements: 1.4, 1.5_

- [x] 3.7 (P) Configurar cron `kb-cleanup-logs`
  - Diario as 03:30 UTC
  - DELETE FROM knowledge_query_log WHERE created_at < now() - interval '90 days'
  - _Requirements: 10.6_

- [x] 3.8 (P) Configurar cron `kb-rollup-monthly`
  - 1o dia do mes 02:00 UTC
  - Agrega agent_runs purpose='kb-embed' do mes anterior em knowledge_usage_monthly
  - Atualiza documents_count e storage_bytes correntes
  - _Requirements: 8.5_

## 4. Tipos e schemas frontend

- [x] 4.1 Criar tipos TypeScript do dominio em `src/types/knowledge.ts`
  - KbDocStatus, KbDocType, KnowledgeDocument, KnowledgeFilters, KnowledgeUsage, UsageDimension
  - KbError com kind discriminado
  - Constantes: MAX_FILE_BYTES=25MB, ALLOWED_MIMES, SIGNED_URL_TTL=3600
  - _Requirements: 1.1, 1.6, 7.1, 8.1_

- [x] 4.2 Criar schemas Zod em `src/lib/knowledge-schemas.ts`
  - schema de upload (file + meta)
  - schema de update metadata
  - schema de filtros
  - _Requirements: 1.6, 7.3_

## 5. Hooks frontend

- [x] 5.1 Implementar `useKnowledge` hook
  - Listagem com filtros via TanStack Query (cache 5min)
  - upload: valida client-side -> consulta useKnowledgeUsage para checar quota -> sobe pra bucket -> INSERT documento status=pending -> dispara kb-ingest best-effort
  - promoteFromChat: valida acesso ao anexo -> INSERT documento source='chat_attachment' apontando para chat_attachments.storage_path
  - updateMetadata: PATCH em colunas seguras (titulo/desc/tags/is_source_of_truth)
  - remove: para source='chat_attachment' apenas DELETE row; para 'upload' DELETE row + Storage (transacional via Edge Function ou SQL)
  - retryFailed: marca status=pending e dispara kb-ingest
  - isReadOnly por role
  - _Requirements: 1.4, 2.1, 2.2, 2.3, 2.5, 7.3, 7.4, 7.5, 7.6, 10.5_

- [x] 5.2 (P) Implementar `useKnowledgeUsage` hook
  - Consume RPC get_knowledge_usage
  - Cache 1min
  - Invalidacao automatica em mutations de useKnowledge
  - _Requirements: 8.1, 8.2, 8.4_

## 6. UI Memoria

- [x] 6.1 Criar `MemoryView` (shell + lista paginada)
  - Header com upload button, filtros (type, tags, status, busca textual), banner de quota
  - DocumentList paginada (20 por pagina)
  - Estado vazio com CTA
  - Bloqueio visual para readOnly
  - Adicionar entrada no AppSidebar e em VALID_VIEWS no Index.tsx
  - _Requirements: 7.1, 7.2, 7.6_

- [x] 6.2 Criar `DocumentUploadDialog`
  - Drag-drop de arquivos, validacao client-side de mime e tamanho
  - Mostra quota atual e bloqueia se status='blocked'
  - Form com titulo, descricao, tags
  - Mensagens de erro especificas (R1.6)
  - _Requirements: 1.1, 1.2, 1.6, 1.7, 8.3_

- [x] 6.3 (P) Criar `DocumentDetailDrawer`
  - Preview do extracted_text com paginacao
  - Edit metadata inline (titulo/desc/tags)
  - Toggle is_source_of_truth
  - Botoes: retry failed, delete (com confirm), abrir arquivo (signed URL)
  - _Requirements: 7.3, 7.4, 7.7, 10.5_

- [x] 6.4 (P) Criar `KnowledgeUsageBanner`
  - Renderiza no topo do MemoryView quando status='warning' ou 'blocked'
  - Lista warning_dimensions / blocked_dimensions
  - CTA para upgrade ou limpeza
  - _Requirements: 8.2, 8.3_

## 7. Promocao de anexos do chat

- [x] 7.1 Adicionar acao "Salvar na memoria" em anexos do chat
  - Botao no MessageAttachments / AttachmentPreview
  - Chama useKnowledge.promoteFromChat
  - Toast de sucesso / erro
  - Skip re-extracao quando chat_attachments.extracted_text existe (R2.4)
  - _Requirements: 2.1, 2.2, 2.4_

- [x] 7.2 Garantir deduplicacao de promocao
  - Unique parcial em knowledge_documents(source_attachment_id) WHERE source='chat_attachment'
  - Hook detecta erro 23505 e mostra toast "Ja salvo na memoria"
  - _Requirements: 2.5_

## 8. Integracao com o chat (tool calling + citacoes)

- [x] 8.1 Adicionar tool `search_knowledge` em `_shared/tools.ts`
  - Schema OpenAI com parametros query (req), top_k (1-20 default 8), filters opcional
  - Description distingue claramente vs search_memories
  - _Requirements: 5.7_

- [x] 8.2 Implementar handler da tool em `ai-chat`
  - Recebe args -> gera embedding da query -> chama RPC search_knowledge
  - Retorna chunks formatados com `[doc:X#chunk:Y]` ja embutido para a IA usar
  - Edge Function gera signed URLs apenas se solicitado pelo client (lazy)
  - _Requirements: 5.7, 6.1_

- [x] 8.3 Atualizar SYSTEM_PROMPT do `_shared/prompt.ts`
  - Adicionar instrucao para citar fontes via `[doc:<document_id>#chunk:<chunk_index>]` apos qualquer chamada de search_knowledge
  - Reforcar: nao inventar referencias; somente citar chunks retornados
  - _Requirements: 6.1_

- [x] 8.4 Implementar `CitationRenderer` no frontend
  - Wrapper de markdown que parseia regex `\[doc:([0-9a-f-]+)#chunk:(\d+)\]`
  - Substitui por link clicavel
  - Click abre DocumentDetailDrawer com chunk destacado
  - Refs invalidas viram badge "fonte invalida" (sem quebrar markdown circundante)
  - Integrar em ChatView para mensagens da IA
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

## 9. Seguranca e tenant guard

- [x] 9.1 Generalizar tenant guard `_shared/briefing-tenant-guard.ts` -> `_shared/tenant-guard.ts`
  - Renomear arquivo (ou criar novo) para `requireTenant` mais generico
  - Importavel por kb-ingest, kb-reindex e futuras Edge Functions
  - Manter export antigo `requireBriefingTenant` como alias
  - _Requirements: 9.4_

- [x] 9.2 Aplicar tenant guard em kb-ingest e kb-reindex
  - Usar requireTenant em request com JWT
  - Validar que cada document_id pertence a company resolvida
  - Bloquear cross-tenant calls explicitamente
  - _Requirements: 9.4_

- [x] 9.3 (P) Aplicar log redaction em kb-ingest e kb-reindex
  - Reusar `_shared/log-redact.ts` para nao logar chunk_text bruto
  - Helper `logKnowledgeAccess({ companyId, userId, purpose, ... })`
  - _Requirements: 9.5_

## 10. Testes

- [x] 10.1 Testes unit do chunker
  - 800/100 com overlap correto
  - PDF respeitando page boundaries (mock pdf-parse)
  - CSV chunk por bloco de linhas
  - Imagens viram 1 chunk
  - _Requirements: 4.1, 4.3_

- [x] 10.2 (P) Testes unit do citation parser
  - Regex captura formato correto
  - Refs invalidas viram badge
  - Refs validas viram link
  - Multiplas refs em uma resposta funcionam
  - _Requirements: 6.2, 6.4_

- [x] 10.3 (P) Testes unit dos hooks (mocked supabase)
  - useKnowledge.upload bloqueia em quota=blocked
  - useKnowledge.remove para chat_attachment nao tenta apagar Storage
  - useKnowledge.promoteFromChat detecta dedup (23505) e retorna erro especifico
  - _Requirements: 1.4, 2.5, 7.5, 8.3_

- [x] 10.4 Tests integracao SQL — RPC e RLS
  - search_knowledge retorna ordem correta + boost source-of-truth aplica
  - search_knowledge cross-tenant retorna 0 rows
  - get_knowledge_usage calcula corretamente em fixtures (free/pro/enterprise)
  - Documentado como spec executavel em .kiro/specs/knowledge-base-rag/tests/sql-integration.sql
  - _Requirements: 5.2, 5.3, 5.4, 8.1, 9.1_

- [x] 10.5 (P) Testes E2E Playwright — fluxo completo
  - Upload de PDF -> aguardar status=indexed via polling
  - Buscar via chat -> resposta cita `[doc:X#chunk:Y]`
  - Click em citacao abre drawer com chunk destacado
  - Documentado em e2e/knowledge-base.spec.ts
  - _Requirements: 1.4, 5.7, 6.2, 6.3_

- [ ] 10.6* Testes de performance
  - p95 search_knowledge < 350ms com seed de 5k chunks
  - Pipeline kb-ingest de PDF 50 paginas < 60s
  - Marcado opcional pois exige seed real em staging
  - _Requirements: 5.6_
