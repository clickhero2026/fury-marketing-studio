# Requirements Document

## Project Description (Input)
Geracao de criativos de anuncio (imagens estaticas) por IA dentro do chat do Fury, usando dados estruturados do `briefing-onboarding` (oferta, persona, tom, paleta, logo, proibicoes) + contexto recuperado da `knowledge-base-rag` (depoimentos, fotos, dados historicos). E o **terceiro pilar do produto** — o que transforma o Fury de "assistente analitico" em "produtor de criativo de fato".

Stack: **Nano Banana 2 (Gemini 2.5 Flash Image)** como default por velocidade/custo (1-3s, ~$0.08/img — ideal pra iteracao no chat) com upgrade opcional para **GPT-image-1** quando o usuario aprovar conceito (texto legivel, hero shot, +qualidade fotorrealista). Interface conversacional: usuario pede "gera 4 anuncios pra Black Friday", IA usa briefing + KB + tool generate_creative, mostra galeria inline com botoes "iterar / aprovar / variar / subir pra Meta".

Output: imagens em formato de feed (1:1), story (9:16) e reels (4:5). Cada criativo gerado tem metadata completa (prompt usado, modelo, oferta de origem, custo, similarity para detectar duplicacao). Cliente pode marcar criativos aprovados pra usar no `campaign-publish` futuro. Pre-flight de compliance Meta (rejeitar antes de gastar tokens) sera spec separada.

## Introduction

A `ai-creative-generation` transforma a IA do Fury de assistente analitico em **produtor de criativos**. Resolve a dor central do gestor de trafego: "preciso de 5 variacoes do anuncio ate amanha". O usuario pede em linguagem natural, a IA monta prompt usando briefing + memoria do cliente, gera imagens, mostra galeria inline e permite iterar conversacionalmente.

Diferenca chave vs concorrentes (AdCreative.ai, Predis, Pencil):
1. **Contextual** — usa `get_company_briefing` + `search_knowledge` para criativo aderente ao negocio real
2. **Conversacional** — iteracao via chat ("muda a cor pra azul", "tenta sem texto") em vez de formulario
3. **Multi-modelo** — Nano Banana pra iterar barato + GPT-image-1 pra fechar conceito

Esta spec define **APENAS** geracao + iteracao + biblioteca + quota + tool calling. Pre-flight de compliance Meta antes de upload e escopo de spec separada (`compliance-preflight`). Upload na Meta API tambem e separada (`campaign-publish` ja existente).

**Premissas:**
- Briefing minimo (R8.2 do briefing-onboarding) deve estar completo — bloqueado se incompleto
- KB pode estar vazia (geracao funciona sem RAG, com qualidade reduzida)
- OpenAI API key + Gemini API key configuradas em env do Supabase

## Requirements

### Requirement 1: Tool de Geracao no Chat

**Objective:** Como dono de empresa, quero pedir geracao de criativos em linguagem natural no chat, para que a IA produza imagens contextualizadas sem eu preencher formularios.

#### Acceptance Criteria

1. The Creative Generation Service shall expor uma tool `generate_creative` ao GPT do `ai-chat`, com parametros: `concept` (descricao curta do que gerar), `format` (feed_1x1 | story_9x16 | reels_4x5), `count` (1-4, default 2), `style_hint` (opcional: minimalista / cinematografico / clean / lifestyle / produto_em_uso), `use_logo` (boolean, default true), `model` (auto | nano_banana | gpt_image, default auto).
2. When o GPT chamar `generate_creative`, the Creative Generation Service shall consultar o briefing da company e abortar com erro `briefing_incomplete` se completude minima nao for atingida (referencia briefing-onboarding R8.2).
3. The Creative Generation Service shall recuperar contexto adicional da knowledge-base via `search_knowledge` quando o concept indicar tema especifico (ex: "depoimento", "produto X") com top_k=3.
4. While `model='auto'`, the Creative Generation Service shall escolher Nano Banana 2 quando `count > 1` ou flag de iteracao, e GPT-image-1 quando `count == 1` E briefing tiver paleta de cores definida (sinal de "fechar conceito").
5. The Creative Generation Service shall montar prompt incluindo: oferta principal, dores resolvidas, persona, tom, paleta hex, logo signed URL (se use_logo=true), trechos da KB relevantes, e proibicoes do briefing renderizadas como negative prompt.
6. If qualquer proibicao visual do briefing for violada pelo concept solicitado (ex: cliente proibiu "fotos de pessoas" mas o usuario pediu "lifestyle com casal"), the Creative Generation Service shall avisar via mensagem antes de gerar e exigir confirmacao explicita.
7. The Creative Generation Service shall retornar para o chat: array de creative_ids gerados + URLs assinadas para preview imediato + metadata resumida (modelo, custo estimado).

### Requirement 2: Multi-Modelo (Nano Banana + GPT-image)

**Objective:** Como sistema, quero balancear custo/qualidade entre dois provedores de imagem, para entregar iteracao rapida sem queimar quota e qualidade alta quando o conceito e aprovado.

#### Acceptance Criteria

1. The Creative Generation Service shall integrar com Google Gemini API (`gemini-2.5-flash-image` aka Nano Banana 2) e OpenAI Images API (`gpt-image-1`) via fetch direto.
2. The Creative Generation Service shall mapear formatos para resolucoes nativas de cada modelo (feed_1x1: 1024x1024; story_9x16: 1024x1792 ou aspect ratio nativo; reels_4x5: 1024x1280) e ajustar parametros por provedor.
3. While Nano Banana 2 estiver indisponivel ou retornar erro 5xx, the Creative Generation Service shall fazer fallback automatico para GPT-image-1 (com flag `fallback=true` na metadata) e cobrar a diferenca na quota.
4. If GPT-image-1 tambem falhar, the Creative Generation Service shall retornar erro `provider_unavailable` ao chat sem cobrar quota e sugerir tentar novamente em 1 minuto.
5. The Creative Generation Service shall registrar em `agent_runs` com `agent_name` em (`creative-nano-banana` | `creative-gpt-image`), token_count agregado e cost_usd estimado por imagem segundo tabela de pricing configurada.
6. The Creative Generation Service shall enforcar timeout de 30 segundos por chamada de provedor; expirado, marca como falha sem cobrar quota.

### Requirement 3: Iteracao Conversacional

**Objective:** Como dono de empresa, quero refinar criativos por mensagem ("deixa mais escuro", "tira o texto", "muda fundo"), para chegar no resultado certo sem comecar do zero.

#### Acceptance Criteria

1. The Creative Generation Service shall expor uma tool `iterate_creative` com parametros: `parent_creative_id`, `instruction` (texto livre da mudanca pedida), `count` (1-2 default 1).
2. When `iterate_creative` for chamado, the Creative Generation Service shall preservar todo o contexto do parent (oferta, persona, paleta) e apenas adicionar a `instruction` como diff no prompt, mantendo seed quando o modelo suportar para preservar consistencia visual.
3. The Creative Generation Service shall criar uma cadeia de iteracao via FK `parent_creative_id`, permitindo navegar do criativo gerado de volta ate a raiz (briefing call original).
4. While o usuario iterar mais de 5 vezes seguidas a partir do mesmo parent, the Creative Generation Service shall avisar via mensagem que muitas iteracoes podem indicar que o concept inicial precisa ser repensado.
5. The Creative Generation Service shall suportar `regenerate` (mesmo prompt, seed nova) e `vary` (gera 3 variacoes do parent com mesmo prompt + seed diferente) como atalhos especializados de iterate_creative.

### Requirement 4: Formatos e Adaptacao Multi-Aspecto

**Objective:** Como dono de empresa, quero gerar o mesmo conceito em multiplos aspectos (feed/story/reels), para uma campanha cobrir todos os placements Meta com consistencia visual.

#### Acceptance Criteria

1. The Creative Generation Service shall expor uma tool `adapt_creative` que recebe um `creative_id` aprovado e gera versoes nos aspectos faltantes (1:1, 9:16, 4:5).
2. The Creative Generation Service shall preservar a paleta, tipografia logica e elementos centrais do criativo original ao adaptar, ajustando apenas composicao para o novo aspecto.
3. While o usuario nao especificar aspectos, the Creative Generation Service shall gerar todos os 3 (feed/story/reels) em uma unica operacao agrupada (`adaptation_set_id`).
4. The Creative Generation Service shall vincular as adaptacoes ao parent via FK e marca-las com `kind='adaptation'`.

### Requirement 5: Galeria Inline no Chat + Acoes

**Objective:** Como dono de empresa, quero ver os criativos gerados direto na conversa com botoes para aprovar, iterar, variar ou descartar, para tomar decisao sem trocar de tela.

#### Acceptance Criteria

1. The Creative Generation Service shall expor cada criativo gerado como elemento renderizavel no chat com: thumbnail clicavel (lightbox), metadata curta (aspecto, modelo), e 4 botoes: "Aprovar", "Iterar", "Variar (3x)", "Descartar".
2. When o usuario clicar em "Aprovar", the Creative Generation Service shall marcar o criativo como `status='approved'` e exibi-lo destacado na biblioteca (R7).
3. When o usuario clicar em "Variar (3x)", the Creative Generation Service shall disparar `vary` (R3.5) gerando 3 novas variacoes do parent na mesma conversa.
4. When o usuario clicar em "Iterar", the Creative Generation Service shall abrir um input pedindo a instrucao da mudanca, depois chamar `iterate_creative` automaticamente.
5. When o usuario clicar em "Descartar", the Creative Generation Service shall marcar `status='discarded'` (sem deletar bytes — auditoria) e remover da galeria visivel.
6. The Creative Generation Service shall renderizar criativos historicos (carregados do DB) usando o mesmo componente, preservando estado de aprovacao.

### Requirement 6: Quota e Controle de Custo

**Objective:** Como produto, quero limitar geracao por plano e por janela de tempo, para evitar abuso, prever custos operacionais e nao quebrar margem.

#### Acceptance Criteria

1. The Creative Generation Service shall consultar quotas (`creatives_per_month_max`, `creatives_per_day_max`, `cost_usd_per_month_max`) por plano em tabela de config (referencia ao padrao `kb_plan_quotas`).
2. The Creative Generation Service shall aplicar defaults conservadores para MVP: free=5/dia 25/mes $2; pro=25/dia 250/mes $25; enterprise=100/dia 1000/mes $100. Limites podem ser revistos para cima apos validacao com usuarios reais.
3. While a company atingir 80% de qualquer dimensao de quota, the Creative Generation Service shall avisar no chat ao gerar com mensagem nao-bloqueante.
4. If a company atingir 100% de qualquer dimensao, the Creative Generation Service shall bloquear `generate_creative` e `iterate_creative` retornando erro `quota_exceeded` com instrucao de upgrade.
5. The Creative Generation Service shall expor RPC `get_creative_usage(company_id)` retornando uso vs limites para UI mostrar.
6. The Creative Generation Service shall consolidar custo via `agent_runs` com `agent_name` em prefixo `creative-*` para reuso da mesma observabilidade do projeto.
7. While `model='gpt_image'` for explicitamente solicitado em company plano free, the Creative Generation Service shall recusar com mensagem sugerindo upgrade ou Nano Banana.

### Requirement 7: Biblioteca de Criativos

**Objective:** Como dono de empresa, quero uma biblioteca permanente dos criativos aprovados separada da galeria efemera do chat, para gerenciar acervo, exportar e marcar prontos para Meta.

#### Acceptance Criteria

1. The Creative Generation Service shall expor uma view "Estudio" (ou submenu de Criativos existente) listando criativos com filtros por status (`generated` | `approved` | `discarded` | `published`), aspecto, oferta de origem e periodo.
2. The Creative Generation Service shall permitir editar metadata (titulo, tags, descricao curta) sem regenerar.
3. The Creative Generation Service shall permitir download do arquivo original em alta resolucao via signed URL (TTL 1h).
4. The Creative Generation Service shall permitir marcar criativos como `ready_for_publish=true` sinalizando para o futuro fluxo de `campaign-publish` que esses estao prontos.
5. While um criativo for usado em campanha publicada, the Creative Generation Service shall mostrar status `published` com link para a campanha.
6. Where o usuario quiser, the Creative Generation Service shall permitir exportar lote de criativos aprovados em ZIP via Edge Function dedicada.

### Requirement 8: Auditoria e Reproducibilidade

**Objective:** Como sistema, quero registrar tudo o que entrou e saiu em cada geracao, para debug, regeneracao identica e analise de custo por oferta/conceito.

#### Acceptance Criteria

1. The Creative Generation Service shall persistir por criativo: prompt completo enviado ao modelo, parametros (aspect, seed, count, style), modelo + versao, custo USD, latencia ms, IDs do briefing snapshot e dos chunks da KB usados, e timestamp.
2. The Creative Generation Service shall calcular hash perceptual (pHash) de cada imagem gerada e armazenar em coluna `phash` para deteccao de quasi-duplicates.
3. While um criativo recem gerado tiver pHash com distancia <= 3 de outro criativo gerado da mesma company nos ultimos 30 dias, the Creative Generation Service shall **bloquear** o output ANTES de cobrar quota (economiza credito do cliente — comportamento cheapest), retornando o criativo existente. Para distancia entre 4 e 8 (similar mas nao duplicado), shall apenas sinalizar `is_near_duplicate=true` na metadata.
4. The Creative Generation Service shall expor RPC `get_creative_provenance(creative_id)` retornando arvore de iteracao (parent chain) + briefing/KB inputs usados.

### Requirement 9: Seguranca e Multi-Tenant

**Objective:** Como cliente, quero garantia de isolamento dos meus criativos (que podem conter dados sensiveis de marca, ofertas, depoimentos), assim como acontece com briefing e KB.

#### Acceptance Criteria

1. The Creative Generation Service shall aplicar Row-Level Security em todas as tabelas (`creatives_generated`, `creative_iterations`) restringindo leitura/escrita por `current_user_company_id()`.
2. The Creative Generation Service shall persistir bytes em bucket privado dedicado `generated-creatives` com policies por path `{company_id}/...`.
3. The Creative Generation Service shall nunca retornar storage_path bruto na API publica — apenas signed URLs com TTL maximo de 1h.
4. Where o usuario for `member` (nao `owner`/`admin`), the Creative Generation Service shall permitir somente leitura da biblioteca — nao pode gerar nem aprovar.
5. The Creative Generation Service shall ofuscar prompts e instrucoes em logs estruturados, registrando apenas IDs/contagens (alinhado a `_shared/log-redact.ts`).
6. While um membro for removido da organizacao, the Creative Generation Service shall imediatamente revogar acesso aos criativos via RLS.

### Requirement 10: Compliance Inline Minimo (Pre-Flight Light)

**Objective:** Como produto, quero rejeitar geracoes com sinais obvios de violacao Meta/proibicoes do briefing antes de cobrar tokens, para reduzir risco de banimento e desperdicio. Pre-flight completo (analise visual pos-geracao, score MARS) sera spec dedicada.

#### Acceptance Criteria

1. The Creative Generation Service shall manter uma blocklist textual baseline de termos proibidos pela Meta (ex: "antes e depois", "garantido", "cura", "voce esta acima do peso") configurada em tabela `meta_baseline_blocklist`.
2. When o concept ou instruction enviados pelo usuario contiver match na blocklist, the Creative Generation Service shall avisar antes de gerar e exigir confirmacao explicita ("Posso prosseguir mesmo com risco?").
3. The Creative Generation Service shall combinar a blocklist baseline com proibicoes da company (briefing R5.1-5.3) — palavras proibidas do cliente sempre bloqueiam (sem opcao de prosseguir).
4. The Creative Generation Service shall montar um `negative_prompt` no provedor com todos os termos da blocklist + proibicoes do briefing, instruindo o modelo a evitar elementos sensiveis.
5. While um criativo gerado tiver texto visivel (detectado por OCR pos-geracao com GPT-4o-mini), the Creative Generation Service shall escanear esse texto com mesma blocklist e marcar `compliance_warning=true` na metadata se houver match (sem bloquear o criativo — apenas alertar).
6. The Creative Generation Service shall registrar o resultado do compliance light em coluna `compliance_check` (jsonb com fields baseline_hits, briefing_hits, ocr_hits) para futura spec de pre-flight completo consumir.

### Requirement 11: Confiabilidade e Robustez

**Objective:** Como produto, quero tolerar falhas pontuais de provedores externos sem perder pedidos do usuario, para a experiencia continuar boa mesmo quando OpenAI/Gemini estao instaveis.

#### Acceptance Criteria

1. The Creative Generation Service shall implementar retry com backoff exponencial (1s, 3s, 7s) em falhas transitorias (5xx, timeout, rate limit) ate 3 tentativas por provedor.
2. While o pedido tiver `count > 1` e parte das imagens falhar, the Creative Generation Service shall retornar parcial (sucesso + falhas marcadas) e cobrar quota apenas das que sucederam.
3. If um pedido demorar mais que 60s no total (sem retornar nenhuma imagem), the Creative Generation Service shall abortar com erro claro e nao cobrar quota.
4. The Creative Generation Service shall manter idempotency-key por pedido para evitar duplicacao em caso de retry do client.
5. The Creative Generation Service shall expor `health` simples (ultimas 24h: sucesso vs falha por provedor) acessivel via RPC para a UI "Saude do AI".
