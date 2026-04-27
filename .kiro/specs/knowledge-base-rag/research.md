# Research & Design Decisions — knowledge-base-rag

## Summary
- **Feature**: `knowledge-base-rag`
- **Discovery Scope**: Extension (greenfield em cima de infra existente: pgvector + tabela `memories` + integracao OpenAI embeddings + bucket privado patterns)
- **Key Findings**:
  - `text-embedding-3-small` ja e usado em [ai-chat/index.ts:172](../../../supabase/functions/ai-chat/index.ts) — modelo, formato e auth ja estabelecidos
  - Tabela `memories` ja existe e usa pgvector + RPC `search_memories` — confirma que pgvector esta habilitado e padronizado
  - Knowledge base e diferente do `memories`: aquele guarda **fatos curtos extraidos do chat** ("cliente prefere CTA X"), este guarda **documentos longos do cliente** (PDFs, planilhas). Sao sistemas paralelos, nao redundantes.
  - Padrao do projeto para Edge Functions: `_shared/cors.ts`, `_shared/briefing-tenant-guard.ts` (recem criado), Anthropic/OpenAI fetch direto sem SDK pesado
  - chat-multimodal ja extrai texto de PDFs/docs em `chat_attachments.extracted_text` — reusar essa extracao na promocao para a KB evita reprocessamento

## Research Log

### Tabela memories vs knowledge_documents
- **Context**: Decidir se ampliamos `memories` ou criamos novo dominio
- **Sources**: migration 20260424000002_memories_refinement.sql, ai-chat retrieval em linhas 160-200
- **Findings**:
  - `memories` armazena texto CURTO (fatos extraidos automaticamente apos conversas) com confidence/source/superseded_by
  - Documentos do cliente sao longos (varios MB, dezenas de paginas) e nao se encaixam no shape `memories`
  - Misturar os dois polui a busca: query "qual a oferta?" retornaria fatos refinados E paragrafos de PDFs antigos com score similar
- **Implications**: Criar tabelas dedicadas `knowledge_documents` (1 linha por arquivo/anexo) + `knowledge_chunks` (N linhas por documento) com bucket proprio. Tool `search_knowledge` e separado de `search_memories`.

### Chunking strategy
- **Context**: Tamanho de chunk e overlap para PDFs/docs/planilhas
- **Sources**: melhores praticas de RAG production (LangChain/Llama-Index defaults, OpenAI cookbook)
- **Findings**:
  - 800 tokens com 100 de overlap e o sweet spot para `text-embedding-3-small` (8191 token max input, 1536 dim)
  - Chunks menores (300-500) aumentam ruido, maiores (>1500) diluem similaridade semantica
  - Para CSV/XLSX: chunk por linha logica (header + N linhas) e mais util que tokenizacao cega
  - Para PDFs: chunk respeitando page boundaries, com `page_number` no metadata para citacao
- **Implications**: Adopt 800/100 default + estrategias especializadas por tipo no chunker. `embedding_model_version` em cada chunk para reindex futuro.

### pgvector index strategy
- **Context**: Qual indice usar para busca por cosseno em milhares de chunks
- **Sources**: pgvector README + Supabase docs
- **Findings**:
  - **HNSW** e o padrao moderno (recall ~0.99, query <50ms ate 1M vetores)
  - **IVFFlat** e mais rapido para construir mas precisa REINDEX periodico — descartado
  - HNSW: `m=16, ef_construction=64` sao defaults sensatos para 1536d
- **Implications**: Indice HNSW em `knowledge_chunks.embedding` com operador `vector_cosine_ops`. Construcao incremental (concurrent build) para nao bloquear writes durante setup.

### OCR e visao para imagens
- **Context**: R3.4 exige extracao de texto + caption de imagens (PNG/JPEG/WEBP)
- **Sources**: GPT-4o vision ja usado em ai-chat (multimodal); custos OpenAI
- **Findings**:
  - GPT-4o-mini e mais barato que GPT-4o e suficiente para OCR + caption simples ($0.15/1M input vs $2.50)
  - OCR-puro via tesseract.js seria mais barato mas tem qualidade ruim em screenshots de redes sociais
  - Pragmatico: **GPT-4o-mini com prompt estruturado** retornando `{ extracted_text, visual_description }` em uma chamada
- **Implications**: Edge Function `kb-ingest` chama `vision/captions` via GPT-4o-mini quando MIME for imagem. Texto e caption concatenados antes de chunking.

### Quotas e tracking de custo
- **Context**: R8 — limitar storage e embeddings por plano
- **Sources**: tabela `plans` existente (migration 20260424000005_plans.sql), `agent_runs`
- **Findings**:
  - `plans` ja tem campos arbitrarios — adicionar `kb_storage_bytes_max`, `kb_documents_max`, `kb_embeddings_per_month_max` via ALTER
  - `agent_runs` ja registra custo por chamada IA — reusar com `purpose='kb-embed'` ou `purpose='kb-extract'`
- **Implications**: Sem nova tabela de billing. Tabela `knowledge_usage_monthly` apenas como agregado para queries rapidas (sumario na UI), populada via cron mensal a partir de `agent_runs`.

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|---|---|---|---|---|
| Pipeline sincrono dentro do upload | Edge Function processa extract+chunk+embed na mesma request | Simples, sem fila | Timeout em PDFs grandes (Edge Functions tem ~150s), UX bloqueia | Rejeitado |
| Pipeline async via cron polling | Upload escreve `pending`, cron processa em batch | Sem fila externa, baixo custo | Latencia ate 1min, cron precisa rodar frequente | **Selecionado** |
| Fila externa (pg_notify + worker) | Trigger emite NOTIFY, worker dedicado consome | Latencia baixa, escalavel | Requer worker rodando fora do Supabase, complexo | Rejeitado para v1 |
| Edge Function recursiva | Function dispara outra function por arquivo | Async sem fila | Limite de invocacoes empilhadas, debug dificil | Rejeitado |

## Design Decisions

### Decision: Pipeline async via cron interno
- **Context**: R1.4 e R1.5 falam de status assincrono; R4.5 exige rate limit
- **Selected**: Upload escreve documento com status `pending`. Edge Function `kb-ingest` invocada manualmente apos upload OU por cron a cada 30s pega documentos `pending` em batch e processa
- **Rationale**: Mantem stack 100% Supabase, controla concurrency naturalmente via batch, e simples
- **Trade-offs**: Latencia perceptivel (ate 30s para iniciar processamento)
- **Follow-up**: Avaliar pg_notify se UX exigir tempo real

### Decision: Bucket separado `knowledge-base` em vez de reusar `chat-attachments`
- **Context**: R2 fala em promocao de anexos do chat
- **Selected**: Bucket novo. Para anexos promovidos do chat, KB armazena APENAS uma referencia (`source_attachment_id` + `storage_bucket='chat-attachments'` + `storage_path`), sem copiar bytes
- **Rationale**: Evita duplicacao de bytes e permite remocao na KB sem mexer no anexo original
- **Trade-offs**: Codigo precisa lidar com 2 buckets ao gerar signed URL
- **Follow-up**: Documentar a logica de "bucket sob demanda" no helper de signed URL

### Decision: Chunking strategy por tipo de arquivo
- **Context**: R3 e R4 — extracao e chunking
- **Selected**: 
  - PDF/DOCX: 800 tokens com overlap 100, respeitando page boundaries
  - TXT/MD: 800/100 puro
  - CSV/XLSX: chunk por bloco de linhas (header repetido + 50 linhas)
  - JSON: chunk por objeto top-level se aplicavel, fallback 800/100
  - Imagens: 1 chunk unico (texto OCR + caption concatenados)
- **Rationale**: Strategy by type captura semantica natural de cada formato

### Decision: Tool `search_knowledge` separada de `search_memories`
- **Context**: R5.7 — tool calling no chat
- **Selected**: Nova tool com schema proprio (parametros `query`, `top_k`, `filters`). Description no prompt instrui IA a usar `search_knowledge` para "documentos do cliente" e `search_memories` para "fatos aprendidos em conversas anteriores"
- **Rationale**: Separacao clara reduz ambiguidade e permite IA escolher fonte certa
- **Follow-up**: Monitorar uso comparativo via logs

## Risks & Mitigations
- **Risco**: Custo de embeddings explode com cliente que sobe muito documento → quota por plano + alerta em 80% (R8.2/8.3) + `agent_runs` tracking
- **Risco**: Hallucinacao de citacao (IA inventa `[doc:X#chunk:Y]` inexistente) → validar referencias no renderer (R6.4) + monitorar via log
- **Risco**: PDF com mais de 200 paginas estoura timeout → split em batches de N paginas + processamento incremental
- **Risco**: pgvector HNSW build trava em large datasets → indice criado CONCURRENTLY desde o inicio
- **Risco**: Promocao de chat-attachments perde acesso quando conversa antiga e arquivada → manter ON DELETE SET NULL no FK + storage_path sobrevive

## References
- [pgvector HNSW indexing](https://github.com/pgvector/pgvector#hnsw)
- [OpenAI text-embedding-3-small docs](https://platform.openai.com/docs/guides/embeddings)
- ai-chat embedding pattern em [supabase/functions/ai-chat/index.ts](../../../supabase/functions/ai-chat/index.ts) linhas 162-220
- [briefing-onboarding tenant guard](../../../supabase/functions/_shared/briefing-tenant-guard.ts) — reusavel
- [chat-multimodal extract](../../chat-multimodal/) — extracao de PDFs ja implementada, reusar
