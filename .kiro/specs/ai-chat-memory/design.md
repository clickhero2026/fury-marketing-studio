# Design: AI Chat com Memoria Vetorial Infinita

> **Status:** AS-BUILT
> **Idioma:** pt-BR

## Overview

**Purpose:** Assistente conversacional que responde sobre dados Meta reais via Function Calling e mantem memoria persistente vetorial inspirada em mem0.

**Users:** Gestores de trafego que querem analise rapida sem clicar em dashboards.

**Impact:** Diferenciador-chave do ClickHero — transforma a plataforma de dashboard passivo em copiloto ativo.

### Goals
- Streaming SSE (UX instantanea)
- Function Calling (respostas baseadas em dados reais, nao alucinacao)
- Memoria infinita com decay (lembra o importante, esquece o irrelevante)
- Hybrid retrieval (similaridade + importancia + recencia)

### Non-Goals
- Multi-modal (imagens/audio)
- Voice input
- Multi-agent orchestration dentro do chat (ainda)

## Architecture

```
[ChatView] --SSE fetch--> [Edge: ai-chat]
                                |
                                | 1. embedding(user_msg)
                                | 2. RPC search_memories -> top-K
                                | 3. inject memorias no system prompt
                                | 4. OpenAI chat with tools
                                | 5. se tool_calls -> data-fetchers (Supabase queries)
                                | 6. segunda chamada OpenAI (stream)
                                |
                                v
                          [SSE stream chunks]
                                |
                                | resposta completa
                                v
                          [persiste msg + fire-and-forget]
                                                |
                                                v
                              [Edge: extract-memories]
                                  | GPT-4o-mini extrai
                                  | gera embeddings
                                  | dedupe (sim > 0.92)
                                  | INSERT memories
```

## Database Schema

### `memories` (pgvector)
```sql
CREATE TABLE memories (
  id uuid PK,
  user_id uuid FK auth.users,
  company_id uuid FK companies,
  type text CHECK (type IN ('fact','preference','procedure','episode','profile')),
  content text,
  embedding VECTOR(1536),
  importance float DEFAULT 0.5,
  confidence float DEFAULT 1.0,
  last_accessed_at timestamptz,
  access_count int DEFAULT 0,
  source_conversation_id uuid,
  created_at timestamptz
);

CREATE INDEX ON memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

### `chat_conversations`, `chat_messages`
- conversation: id, user_id, company_id, title, created_at
- message: id, conversation_id, role, content, tool_calls jsonb, created_at
- RLS por user_id

### Functions
- `search_memories(query_embedding, p_user_id, top_k, threshold)` — score hibrido
- `bump_memory_access(memory_ids uuid[])` — update last_accessed_at + access_count

## Components

### Edge Functions
| Function | Responsabilidade |
|----------|------------------|
| `ai-chat` | SSE streaming, function calling, memory retrieval/inject |
| `extract-memories` | Async: GPT-4o-mini extract -> embed -> dedupe -> insert |

### `_shared/`
| Arquivo | Responsabilidade |
|---------|------------------|
| `prompt.ts` | SYSTEM_PROMPT com identidade + schema DB + formulas |
| `tools.ts` | 6 OpenAI function definitions |
| `data-fetchers.ts` | Implementacoes que consultam Supabase |

### Frontend
| Arquivo | Responsabilidade |
|---------|------------------|
| `src/hooks/use-chat.ts` | SSE via fetch + ReadableStream parser |
| `src/components/ChatView.tsx` | Lista mensagens + input + markdown render |

## Hybrid Retrieval Score

```
score = 0.5 * cosine_similarity(query, memory.embedding)
      + 0.2 * memory.importance
      + 0.2 * exp(-days_since_last_access / 30)
      + 0.1 * memory.confidence
```

Top-K (default K=5) ordenado por score descrescente, filtrado por `similarity > 0.65`.

## Memory Types

| Tipo | Exemplo | TTL |
|------|---------|-----|
| `fact` | "Meu produto principal e e-book de marketing" | infinito |
| `preference` | "Prefere relatorios em tabela markdown" | infinito |
| `procedure` | "Sempre comeca o dia revisando ROAS" | decay lento |
| `episode` | "Em 03/04 trocou criativo da campanha X" | decay rapido |
| `profile` | "Gestor de trafego senior, foco em e-commerce" | infinito |

## pg_cron Jobs
- `memory-decay` (semanal): reduz confidence em 5% para memorias inativas 30+ dias; deleta confidence < 0.2

## Trade-offs

- **Fire-and-forget extract-memories vs sincrono:** Sincrono atrasaria resposta. Fire-and-forget aceita race conditions menores em troca de UX.
- **GPT-4o-mini para extracao:** 10x mais barato; qualidade suficiente para extracao estruturada.
- **IVFFlat vs HNSW:** IVFFlat simples e bom ate ~1M vetores; migrar para HNSW se necessario.
- **Threshold 0.65:** Permissivo para lembrar de coisas vagas; tunavel.
