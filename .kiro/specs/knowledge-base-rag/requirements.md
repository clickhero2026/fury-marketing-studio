# Requirements Document

## Project Description (Input)
Banco de memoria com RAG (Retrieval-Augmented Generation) sobre documentos arbitrarios que o cliente sobe (PDFs, fotos de produto, depoimentos, briefings antigos, posts com performance, planilhas de campanha, etc.). E o **diferencial #1 do Fury contra Madgicx/AdCreative** — nenhum concorrente entrega chat com memoria + RAG sobre artefatos do cliente para SMB. Complementa o `briefing-onboarding` (que e dado estruturado curto) com **memoria longa nao-estruturada**.

A IA do Fury consulta esse banco via tool calling no chat para tomar decisoes contextualizadas: gerar criativo citando depoimento real, sugerir copy baseada em post que ja performou, identificar oferta no PDF antigo do cliente. O cliente ve tudo na view "Memoria" — pode editar, deletar, marcar como "fonte de verdade" prioritaria. Embeddings via OpenAI text-embedding-3-small + pgvector no Supabase. Promocao automatica de anexos do chat-multimodal para a knowledge base.

## Introduction

A `knowledge-base-rag` e a memoria longa do Fury sobre o negocio do cliente. Onde o `briefing-onboarding` armazena dado estruturado curto (nicho, oferta, persona), esta feature armazena **dado nao-estruturado de qualquer tamanho**: PDFs, depoimentos texto, screenshots de posts que performaram, planilhas com historico, briefings antigos, fotos de produto.

A IA consulta esse acervo via busca semantica (embeddings + pgvector) durante conversas — sem precisar carregar todo contexto no prompt. Resultados de busca incluem **citacao da fonte** (titulo, trecho, link) para que respostas da IA sejam auditaveis.

Esta spec define **APENAS** o pipeline de ingestao, indexacao, busca, exposicao via tool no chat e UI de gerenciamento. Geracao de criativos a partir do que foi recuperado e escopo de `ai-creative-generation`. Pre-flight de compliance e escopo de spec separada.

**Premissas:**
- pgvector ja e disponivel no Supabase
- Anexos do `chat-multimodal` (bucket `chat-attachments` + tabela `chat_attachments`) podem ser promovidos para a KB
- Briefing do `briefing-onboarding` ja existe e a KB referencia mas nao duplica seu conteudo
- Pipeline assume custo por embedding controlado e quota por plano

## Requirements

### Requirement 1: Ingestao de Documentos (Upload Direto)

**Objective:** Como dono de empresa, quero subir PDFs, imagens, textos e planilhas para um banco de memoria que a IA do Fury consulta, para que minhas conversas sejam baseadas em dados reais do meu negocio.

#### Acceptance Criteria

1. The Knowledge Base Service shall aceitar uploads de arquivos nos formatos PDF, TXT, MD, CSV, JSON, DOCX, XLSX, PNG, JPEG, WEBP via UI dedicada na view "Memoria".
2. The Knowledge Base Service shall enforcar limite de tamanho de 25MB por arquivo individual.
3. The Knowledge Base Service shall enforcar quota de armazenamento total por company configuravel por plano (default: 500MB para free, 5GB para pro, 50GB para enterprise).
4. When o usuario fizer upload, the Knowledge Base Service shall persistir o arquivo em bucket privado dedicado, criar registro de metadata (titulo, tipo, tamanho, data, uploader) e enfileirar processamento de extracao + embedding.
5. While o processamento estiver em andamento, the Knowledge Base Service shall expor o status do documento (`pending`, `extracting`, `embedding`, `indexed`, `failed`) e exibir indicador visual ao usuario.
6. If o arquivo exceder limite ou formato nao suportado, the Knowledge Base Service shall rejeitar com mensagem especifica indicando o limite/formato aceito.
7. Where o usuario quiser, the Knowledge Base Service shall permitir adicionar titulo customizado, descricao curta e tags ao documento durante ou apos o upload.

### Requirement 2: Promocao de Anexos do Chat para a Knowledge Base

**Objective:** Como dono de empresa, quero que documentos relevantes que enviei no chat possam virar memoria permanente sem subir de novo, para evitar reupload e manter rastreabilidade.

#### Acceptance Criteria

1. The Knowledge Base Service shall expor uma acao "Salvar na memoria" em qualquer anexo de mensagem do chat (do `chat-multimodal`).
2. When o usuario promover um anexo, the Knowledge Base Service shall criar registro na knowledge base reusando o storage_path do bucket `chat-attachments` (sem copiar bytes) e enfileirar embedding do conteudo extraido.
3. The Knowledge Base Service shall vincular o registro promovido ao anexo de origem (`source_attachment_id`) para auditoria reversa.
4. When um anexo do chat tiver `extracted_text` valido, the Knowledge Base Service shall pular re-extracao e ir direto para a fase de embedding.
5. If o usuario promover o mesmo anexo duas vezes, the Knowledge Base Service shall deduplicar pela ligacao com `source_attachment_id` e nao criar entrada duplicada.

### Requirement 3: Extracao de Conteudo

**Objective:** Como sistema, quero converter cada arquivo em texto buscavel mais metadata estruturada, para que possam ser indexados semanticamente.

#### Acceptance Criteria

1. The Knowledge Base Service shall extrair texto de PDFs preservando ordem de paginas e mantendo numero de pagina por chunk para citacao.
2. The Knowledge Base Service shall extrair texto de DOCX e XLSX preservando estrutura (paragrafos, celulas, sheets) na medida do possivel.
3. The Knowledge Base Service shall ler texto plano de TXT, MD, CSV e JSON sem transformacoes destrutivas.
4. When o documento for imagem (PNG/JPEG/WEBP), the Knowledge Base Service shall executar OCR para extrair texto visivel e armazenar tambem uma legenda gerada por modelo de visao para descrever conteudo nao-textual.
5. If a extracao falhar, the Knowledge Base Service shall marcar o documento como `failed` com mensagem de erro acessivel ao usuario, sem quebrar o pipeline para outros documentos.
6. The Knowledge Base Service shall preservar o texto extraido bruto em campo `extracted_text` para reindexacao futura sem reprocessar o arquivo.

### Requirement 4: Chunking e Embeddings

**Objective:** Como sistema, quero dividir documentos em pedacos semanticamente coesos e gerar vetores que permitem busca por similaridade, para que a IA recupere apenas trechos relevantes em vez de documentos inteiros.

#### Acceptance Criteria

1. The Knowledge Base Service shall dividir o texto extraido em chunks de aproximadamente 800 tokens com sobreposicao de 100 tokens entre chunks adjacentes.
2. The Knowledge Base Service shall gerar embeddings para cada chunk via modelo `text-embedding-3-small` (dimensao 1536) e persistir em coluna `vector(1536)` com indice pgvector adequado para busca por cosseno.
3. The Knowledge Base Service shall associar cada chunk ao documento de origem, ao numero de pagina (quando aplicavel) e a um indice ordinal dentro do documento.
4. When um documento for editado ou substituido, the Knowledge Base Service shall apagar chunks antigos e regenerar embeddings de forma transacional.
5. The Knowledge Base Service shall aplicar rate limit e batch ao chamar a API de embeddings para evitar custo descontrolado, respeitando concurrency maxima de 5 chamadas simultaneas por company.
6. The Knowledge Base Service shall registrar custo de cada lote de embeddings em `agent_runs` com `purpose='embed-document'` para tracking financeiro.

### Requirement 5: Busca Semantica (RPC + Tool no Chat)

**Objective:** Como IA do Fury, quero consultar a knowledge base via uma chamada eficiente que retorna apenas chunks relevantes com citacao da fonte, para responder com base em dados reais do cliente sem inflar o prompt.

#### Acceptance Criteria

1. The Knowledge Base Service shall expor uma RPC `search_knowledge(company_id, query, top_k, filters)` que recebe a query em linguagem natural, gera embedding e retorna os top-k chunks mais similares por cosseno (default top_k=8, max=20).
2. The Knowledge Base Service shall retornar para cada chunk: texto, score de similaridade (0-1), `document_id`, titulo do documento, tipo, numero de pagina (se aplicavel), URL assinada do documento original (TTL 1h) e flag `is_source_of_truth`.
3. While `filters` for fornecido, the Knowledge Base Service shall permitir filtrar por tipo de documento, tag, intervalo de data ou flag `is_source_of_truth=true`.
4. The Knowledge Base Service shall priorizar chunks de documentos marcados como `is_source_of_truth=true` em caso de empate de score, aplicando boost configuravel.
5. When um agente IA chamar `search_knowledge`, the Knowledge Base Service shall registrar a query, top_k, scores retornados e duracao em `knowledge_query_log` para auditoria de uso.
6. The Knowledge Base Service shall garantir p95 da busca < 350ms para companies com ate 5000 chunks.
7. The Knowledge Base Service shall expor `search_knowledge` como tool no chat (`name: 'search_knowledge'`), descrevendo parametros e formato de retorno em linguagem natural para que o GPT escolha quando chamar.

### Requirement 6: Citacoes Traceaveis nas Respostas da IA

**Objective:** Como dono de empresa, quero saber de onde a IA tirou cada afirmacao, para auditar a resposta e confiar nela em decisoes de marketing.

#### Acceptance Criteria

1. When a IA usar resultados de `search_knowledge` em uma resposta, the Knowledge Base Service shall instruir via prompt de sistema que a IA cite cada trecho com referencia inline no formato `[doc:<document_id>#chunk:<chunk_index>]`.
2. The Knowledge Base Service shall expor um helper de renderizacao no frontend que substitui referencias inline por links clicaveis para o documento de origem.
3. While o usuario clicar em uma citacao, the Knowledge Base Service shall abrir um drawer mostrando o trecho destacado, contexto adjacente, titulo do documento e botao para abrir o arquivo completo.
4. If a IA gerar uma referencia para um chunk que nao existe (hallucinacao), the Knowledge Base Service shall renderizar um marcador visual de "fonte invalida" sem quebrar o restante da resposta.

### Requirement 7: Gerenciamento da Memoria (UI "Memoria")

**Objective:** Como dono de empresa, quero ver tudo o que a IA tem indexado sobre meu negocio, editar metadata, marcar fontes prioritarias e remover o que nao quero mais que ela use.

#### Acceptance Criteria

1. The Knowledge Base Service shall expor uma view "Memoria" com listagem paginada de documentos exibindo titulo, tipo, tamanho, status, tags, data e flag `is_source_of_truth`.
2. The Knowledge Base Service shall permitir filtrar por tipo, tag, status e busca textual em titulo/descricao.
3. The Knowledge Base Service shall permitir editar titulo, descricao e tags de cada documento sem reprocessamento de embeddings.
4. The Knowledge Base Service shall permitir marcar/desmarcar `is_source_of_truth=true` em qualquer documento, com efeito imediato no boost da busca.
5. When o usuario remover um documento, the Knowledge Base Service shall apagar registros (chunks, embeddings, metadata) E o arquivo no Storage de forma transacional, exceto quando o registro for promocao do `chat-attachments` — neste caso so apaga a referencia, preservando o anexo de origem.
6. Where o usuario for `member` (nao `owner`/`admin`), the Knowledge Base Service shall permitir somente leitura.
7. The Knowledge Base Service shall expor preview do documento (texto extraido em viewer com paginacao) sem download obrigatorio.

### Requirement 8: Quota e Controle de Custo

**Objective:** Como produto, quero limitar uso de embeddings e armazenamento por plano, para evitar abuso e prever custos operacionais.

#### Acceptance Criteria

1. The Knowledge Base Service shall consultar quotas (`storage_bytes_max`, `documents_max`, `embeddings_per_month_max`) na tabela `plans` ou em config equivalente.
2. While a company atingir 80% da quota de qualquer dimensao, the Knowledge Base Service shall exibir aviso amigavel no banner da view "Memoria".
3. If a company atingir 100% de qualquer quota, the Knowledge Base Service shall bloquear novos uploads e novas embeddings com mensagem instruindo upgrade ou limpeza.
4. The Knowledge Base Service shall expor RPC `get_knowledge_usage(company_id)` retornando uso atual e limites para cada dimensao, consumida pela UI de "Memoria" e pelo banner.
5. The Knowledge Base Service shall registrar a soma de tokens embedados por mes em `knowledge_usage_monthly` para auditoria e billing futuro.

### Requirement 9: Seguranca e Isolamento Multi-Tenant

**Objective:** Como cliente, quero garantia absoluta de que documentos do meu negocio — frequentemente sensiveis — estao isolados de outros clientes.

#### Acceptance Criteria

1. The Knowledge Base Service shall aplicar Row-Level Security em todas as tabelas (`knowledge_documents`, `knowledge_chunks`, `knowledge_query_log`, `knowledge_usage_monthly`) restringindo leitura/escrita por `current_user_company_id()`.
2. The Knowledge Base Service shall persistir bytes em bucket privado `knowledge-base` com policies por path `{company_id}/...`.
3. The Knowledge Base Service shall usar URLs assinadas com TTL maximo de 1h para qualquer download, gerando-as somente sob demanda.
4. If uma Edge Function precisar acessar a knowledge base com `service_role`, the Knowledge Base Service shall exigir validacao do `company_id` via tenant guard antes de qualquer operacao.
5. The Knowledge Base Service shall ofuscar conteudo de chunks em logs estruturados, registrando apenas IDs, scores e contagens.
6. While um membro for removido da organizacao, the Knowledge Base Service shall imediatamente revogar acesso aos documentos daquela organizacao para esse usuario via RLS.

### Requirement 10: Reindexacao e Manutencao

**Objective:** Como sistema, quero permitir reindexar documentos quando o modelo de embeddings mudar ou quando a estrategia de chunking for revisada, para evoluir a qualidade da busca sem perder os documentos.

#### Acceptance Criteria

1. The Knowledge Base Service shall persistir o `embedding_model_version` em cada chunk para sabermos quando ele foi gerado.
2. The Knowledge Base Service shall expor uma operacao administrativa de reindexacao que aceita escopo por documento, por company ou global.
3. While reindexar estiver em andamento, the Knowledge Base Service shall manter os chunks antigos disponiveis para busca ate o termino, evitando janela sem busca disponivel.
4. The Knowledge Base Service shall consolidar reindexacoes em lotes e respeitar a mesma rate limit de embeddings de R4.5.
5. If um documento estiver com status `failed`, the Knowledge Base Service shall permitir retentativa manual a partir da UI.
6. The Knowledge Base Service shall executar limpeza periodica (cron diario) de logs `knowledge_query_log` mais antigos que 90 dias.
