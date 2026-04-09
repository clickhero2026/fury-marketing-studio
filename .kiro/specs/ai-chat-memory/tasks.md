# Tasks: AI Chat com Memoria Vetorial

> **Status:** AS-BUILT — todas concluidas

## Tasks

- [x] 1. Schema chat + memoria (Thor)
  - Habilitar extension `vector` (pgvector)
  - Criar `chat_conversations`, `chat_messages`
  - Criar `memories` com VECTOR(1536)
  - Indice IVFFlat com vector_cosine_ops
  - RLS por user_id em todas
  - _Requirements: 2, 3_

- [x] 2. RPCs `search_memories` e `bump_memory_access` (Thor + Cap)
  - search_memories(query_embedding, p_user_id, top_k, threshold) com score hibrido
  - bump_memory_access(memory_ids uuid[]) update last_accessed_at + access_count
  - SECURITY DEFINER + search_path explicito
  - _Requirements: 4_

- [x] 3. `_shared/prompt.ts`, `tools.ts`, `data-fetchers.ts` (Thanos)
  - SYSTEM_PROMPT com identidade marketing + schema + formulas
  - 6 functions OpenAI definidas
  - Implementacoes que consultam campaign_metrics filtrado por company_id
  - _Requirements: 1_

- [x] 4. Edge Function `ai-chat` (Thanos + Iron Man)
  - SSE streaming via ReadableStream
  - 2-step OpenAI flow (tools -> data -> stream)
  - Memory retrieval: embedding(user_msg) -> search_memories -> inject system prompt
  - Persistir mensagens em chat_messages
  - Fire-and-forget extract-memories no final
  - _Requirements: 1, 2, 3_

- [x] 5. Edge Function `extract-memories` (Thanos)
  - GPT-4o-mini para extracao estruturada
  - Embeddings via text-embedding-3-small
  - Dedup por similaridade > 0.92
  - Insert em memories
  - _Requirements: 3_

- [x] 6. Hook `useChat` (Iron Man)
  - SSE via fetch + ReadableStream parser
  - Estado: messages, isStreaming, currentResponse
  - _Requirements: 1_

- [x] 7. UI `ChatView` (Iron Man)
  - Lista de mensagens
  - Input com Enter para enviar
  - Markdown render (negrito, listas, tabelas)
  - Cursor piscante durante streaming
  - _Requirements: 1_

- [x] 8. pg_cron `memory-decay` semanal (Thor + Vision)
  - Reduce confidence 5% para inativas 30+ dias
  - Delete confidence < 0.2
  - _Requirements: 5_

- [x] 9. Quality Loop (Hulk)
  - Build verde
  - Teste manual: chat -> data fetch -> memoria persistida -> conversa nova relembra
  - _Requirements: todos_
