# Requirements: AI Chat com Memoria Vetorial Infinita

> **Status:** AS-BUILT (spec retroativa)
> **Criado:** 2026-04-06
> **Idioma:** pt-BR

## Introduction

Construir um assistente de IA conversacional dentro do ClickHero que (1) responde sobre as campanhas Meta reais do usuario via OpenAI Function Calling, (2) faz streaming de respostas via SSE, e (3) mantem memoria infinita estilo mem0 — extraindo fatos/preferencias/procedimentos da conversa, armazenando como embeddings (pgvector), e injetando memorias relevantes em conversas futuras.

## Requirements

### Requirement 1: Chat Streaming com Function Calling

**Objective:** Como gestor, quero perguntar "qual minha campanha com melhor ROAS?" e receber resposta em tempo real baseada em dados reais.

#### Acceptance Criteria
1. When o usuario envia mensagem, the system shall chamar Edge Function `ai-chat` via fetch SSE
2. The system shall executar 2-step OpenAI flow: primeira chamada pode retornar `tool_calls`, executar functions, segunda chamada faz stream da resposta final
3. The system shall expor 6 functions: `get_campaigns_summary`, `get_campaign_details`, `get_metrics_comparison`, `get_top_performers`, `get_daily_metrics`, `get_account_info`
4. The system shall implementar cada function em `_shared/data-fetchers.ts` consultando `campaign_metrics` filtrado por `company_id`
5. The system shall renderizar resposta incrementalmente no `ChatView` via ReadableStream
6. While streaming, the system shall mostrar cursor piscante e desabilitar input
7. The system shall renderizar markdown (negrito, listas, tabelas) na resposta

### Requirement 2: Persistencia de Conversas

**Objective:** Como usuario, quero retomar conversas anteriores e ver historico, para nao perder contexto.

#### Acceptance Criteria
1. The system shall criar tabela `chat_conversations` (id, user_id, company_id, title, created_at)
2. The system shall criar tabela `chat_messages` (id, conversation_id, role, content, tool_calls jsonb, created_at)
3. When o usuario envia primeira mensagem, the system shall criar nova conversation com title gerado automaticamente
4. The system shall persistir cada user/assistant message
5. The system shall aplicar RLS por `user_id`

### Requirement 3: Memoria Vetorial Infinita

**Objective:** Como usuario que conversa diariamente, quero que o agente lembre minhas preferencias e fatos importantes sem eu repetir.

#### Acceptance Criteria
1. The system shall criar tabela `memories` com colunas: id, user_id, company_id, type (fact/preference/procedure/episode/profile), content text, embedding VECTOR(1536), importance float, confidence float, last_accessed_at, access_count, source_conversation_id
2. The system shall criar indice IVFFlat com `vector_cosine_ops` na coluna embedding
3. After cada resposta do chat, the system shall disparar fire-and-forget para Edge Function `extract-memories`
4. The `extract-memories` shall usar GPT-4o-mini para extrair memorias estruturadas da troca user/assistant
5. The system shall gerar embeddings via `text-embedding-3-small` (1536 dimensoes) para cada memoria
6. The system shall deduplicar: se nova memoria tem similaridade > 0.92 com existente, atualizar a antiga em vez de criar nova
7. Before responder, the `ai-chat` shall gerar embedding da mensagem do usuario e chamar RPC `search_memories` para recuperar top-K relevantes
8. The system shall injetar memorias recuperadas no system prompt sob secao "## Memoria do usuario"

### Requirement 4: Hybrid Retrieval Score

**Objective:** Como sistema de memoria, quero ranquear memorias por relevancia + importancia + recencia, nao so por similaridade pura.

#### Acceptance Criteria
1. The RPC `search_memories(query_embedding, user_id, top_k, threshold)` shall calcular score hibrido: `0.5 * similarity + 0.2 * importance + 0.2 * recency_decay + 0.1 * confidence`
2. The system shall computar `recency_decay = exp(-days_since_access / 30)`
3. The system shall filtrar resultados com similarity > threshold (default 0.65)
4. After recuperar, the system shall chamar `bump_memory_access(memory_ids[])` para atualizar `last_accessed_at` e `access_count`

### Requirement 5: Memory Decay (Cron)

**Objective:** Como sistema, quero esquecer memorias irrelevantes ao longo do tempo, para nao acumular ruido.

#### Acceptance Criteria
1. The system shall configurar pg_cron job semanal `memory-decay`
2. The job shall reduzir `confidence` em 5% para memorias nao acessadas em 30+ dias
3. The job shall deletar memorias com `confidence < 0.2`

## Non-Functional Requirements

- **Latencia:** Primeira token < 2s; throughput suficiente para sentir streaming fluido
- **Custo:** GPT-4o para chat principal, GPT-4o-mini para extracao de memoria (10x mais barato)
- **Privacidade:** RLS por user_id em todas as tabelas; embeddings nunca expostos ao frontend
- **Escala:** IVFFlat suporta milhoes de vetores; pg_cron decay mantem tamanho controlado
