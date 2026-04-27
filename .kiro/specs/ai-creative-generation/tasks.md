# Implementation Plan — ai-creative-generation

> **Modo**: Aditivo. Reusa briefing-onboarding (RPC `get_company_briefing`), knowledge-base-rag (RPC `search_knowledge`), `_shared/tools.ts`, `_shared/tenant-guard.ts`, `_shared/log-redact.ts`, `agent_runs`. Nenhum codigo existente quebra. Tools adicionadas opt-in via system prompt.

## 1. Schema base + bucket + quotas

- [x] 1.1 Criar tabela `creatives_generated` com RLS
  - Colunas: id, company_id FK, conversation_id FK?, parent_creative_id FK?, adaptation_set_id, idempotency_key UNIQUE?, prompt, concept, format, model_used, provider_model_version, status enum (`generated`/`approved`/`discarded`/`published`), storage_path UNIQUE, mime_type, width, height, cost_usd numeric, latency_ms, phash text(16), is_near_duplicate bool, near_duplicate_of_id FK?, compliance_warning bool, ready_for_publish bool, title, tags text[], description, briefing_snapshot jsonb, kb_chunk_ids uuid[], created_at, updated_at
  - Indices: (company_id, created_at DESC), (company_id, status), (company_id, phash), GIN tags, parent_creative_id
  - RLS: SELECT/UPDATE por tenant; INSERT por tenant + role IN (owner, admin); DELETE bloqueado (so via discard via UPDATE)
  - Trigger auto_set_company_id_on_insert + touch_updated_at
  - _Requirements: 5.2, 7.1, 8.1, 8.2, 8.3, 9.1_

- [x] 1.2 (P) Criar `creative_compliance_check`
  - Colunas: id, creative_id FK CASCADE, baseline_hits text[], briefing_hits text[], ocr_hits text[], passed bool, created_at
  - Indice em creative_id
  - RLS: SELECT por tenant; INSERT via service_role (Edge Function)
  - _Requirements: 10.6_

- [x] 1.3 (P) Criar `meta_baseline_blocklist` com seed
  - Colunas: term PK, category enum (claim_garantia, antes_depois, saude, financeiro, peso), severity enum (warn, block_unless_override), created_at
  - Seed inicial em PT-BR com termos Meta-sensiveis (antes e depois, 100% garantido, cura definitiva, milagre, ganhe X reais em Y dias, voce esta acima do peso, etc)
  - RLS: read publico authenticated; UPDATE/INSERT/DELETE somente service_role
  - _Requirements: 10.1_

- [x] 1.4 (P) Criar `creative_plan_quotas` com seed
  - Colunas: plan PK CHECK IN (free, pro, enterprise), creatives_per_day_max int, creatives_per_month_max int, cost_usd_per_month_max numeric
  - Seed: free=5/25/$2, pro=25/250/$25, enterprise=100/1000/$100
  - RLS: read publico authenticated
  - _Requirements: 6.1, 6.2_

- [x] 1.5 (P) Criar bucket Storage `generated-creatives`
  - Privado, file_size_limit 5MB, allowed_mime: image/png, image/webp, image/jpeg
  - 4 policies por path `{company_id}/...` replicando padrao do projeto
  - _Requirements: 9.2, 9.3_

## 2. RPCs publicas

- [x] 2.1 Implementar RPC `get_creative_usage(company_id)`
  - Calcula daily count, monthly count, cost_usd_month via SUM em agent_runs (`agent_name LIKE 'creative-%'` + `started_at >= mes_corrente`)
  - JOIN com creative_plan_quotas via organizations.plan
  - Retorna jsonb com status (`ok` | `warning` >=80% | `blocked` >=100%) + warning_dimensions / blocked_dimensions
  - SECURITY INVOKER
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 2.2 (P) Implementar RPC `get_creative_provenance(creative_id)`
  - Retorna chain de iteracao seguindo parent_creative_id ate a raiz
  - Inclui briefing_snapshot summary + kb_chunk_ids da raiz
  - SECURITY INVOKER
  - _Requirements: 8.4_

- [x] 2.3 (P) Implementar RPC `get_creative_health()`
  - Le agent_runs `agent_name LIKE 'creative-%'` nas ultimas 24h
  - Retorna sucesso/falha por provedor (nano-banana / gpt-image) + p95 latency_ms
  - SECURITY INVOKER (qualquer authenticated pode ver — nao expoe dado tenant)
  - _Requirements: 11.5_

## 3. Helpers compartilhados Edge Functions

- [x] 3.1 Implementar dHash em `_shared/dhash.ts`
  - Decode imagem via `imagescript@1.2.17`, resize 9x8, grayscale, comparacao de pixels adjacentes -> 64 bits hex (16 chars)
  - Funcao `hammingDistance(a: string, b: string): number` via XOR + popcount
  - _Requirements: 8.2, 8.3_

- [x] 3.2 (P) Implementar provider abstraction em `_shared/creative-providers.ts`
  - Funcao `callProvider(model, prompt, format, parentBytes?, openaiKey, geminiKey)` retornando `{ bytes, modelUsed, costUsd, latencyMs }`
  - Implementa Gemini 2.5 Flash Image: POST em generativelanguage.googleapis.com com aspectRatio nativo
  - Implementa GPT-image-1: POST em api.openai.com/v1/images/generations (ou /edits para img2img)
  - Mapeamento de aspect ratio: 1:1->1024x1024, 9:16->1024x1536 (gpt) ou 9:16 (gemini), 4:5->forca Nano Banana
  - Timeout 30s por chamada, retorna base64 inline
  - _Requirements: 2.1, 2.2, 2.6, 4.2_

- [x] 3.3 (P) Implementar fallback Nano -> GPT em `_shared/creative-providers.ts`
  - Funcao `callProviderWithFallback(...)` envolve callProvider com try Nano primeiro, on 5xx/timeout tenta GPT-image
  - Marca `fallback_triggered=true` na metadata retornada
  - Se ambos falharem retorna `{ ok: false, error: 'provider_unavailable' }` SEM cobrar quota
  - Retry exponencial 1s/3s/7s ate 3 tentativas por provedor
  - _Requirements: 2.3, 2.4, 11.1, 11.3_

- [x] 3.4 (P) Implementar compliance light em `_shared/creative-compliance.ts`
  - Funcao `checkComplianceText(concept, instruction, briefing, blocklist)` retornando `{ baseline_hits, briefing_hits, requires_override }`
  - Briefing prohibitions sempre bloqueiam (sem override possivel)
  - Blocklist baseline com severity=block_unless_override exige flag override
  - Funcao `runOcrCheck(imageBytes, blocklist, openaiKey)` chama gpt-4o-mini vision retornando texto + match
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 3.5 (P) Adicionar `logCreativeAccess` em `_shared/log-redact.ts`
  - Helper de log estruturado: companyId, userId, event ('generate'|'iterate'|'export'), modelUsed, costUsd, durationMs, status, errorKind
  - Nao loga prompt cru (R9.5)
  - _Requirements: 9.5_

## 4. Edge Function `creative-generate`

- [x] 4.1 Implementar esqueleto + tenant guard + parsing
  - Endpoint POST recebe GenerateRequest tipado
  - Tenant guard via `requireTenant`
  - Idempotency check: se `idempotency_key` ja existe em creatives_generated, retorna o existente
  - Validacao Zod do body
  - _Requirements: 1.1, 9.4, 11.4_

- [x] 4.2 Adicionar quota check + briefing completeness
  - Chama get_creative_usage; se status='blocked' retorna 403 quota_exceeded com dimension
  - Chama get_company_briefing; se status != 'complete' retorna 422 briefing_incomplete
  - GPT-image bloqueado em plano free (R6.7) — retorna 403 com mensagem de upgrade
  - _Requirements: 1.2, 6.4, 6.7_

- [x] 4.3 Adicionar compliance light pre-geracao
  - Roda checkComplianceText antes de qualquer call ao provider
  - Se briefing_hits > 0: 403 forbidden_by_briefing (sem override possivel)
  - Se baseline_hits > 0 e !override_blocklist_warning: 403 forbidden_by_blocklist
  - _Requirements: 1.6, 10.2, 10.3_

- [x] 4.4 Adicionar busca contextual KB + montagem do prompt
  - Quando concept indicar tema especifico (heuristica: contem "depoimento"/"cliente"/"oferta X") chama search_knowledge top_k=3 com purpose='creative-generation'
  - Monta prompt incluindo: oferta, dores, persona, tom, paleta hex, logo signed URL (se use_logo), trechos KB, negative_prompt com proibicoes
  - _Requirements: 1.3, 1.5_

- [x] 4.5 Implementar pipeline de geracao paralela com count<=2
  - Promise.all paralelo de count <= 2 imagens via callProviderWithFallback
  - Modelo escolhido conforme R1.4: 'auto' -> Nano Banana se count>1; GPT-image se count==1 e paleta definida
  - Reels (4:5) sempre Nano Banana mesmo com model='gpt_image' (R4.2 GPT nao suporta 4:5 nativo)
  - Timeout total 60s; expira sem cobrar quota
  - Parcial sucesso: retorna falhas marcadas mas cobra so as que sucederam
  - _Requirements: 1.7, 2.5, 4.2, 11.2, 11.3_

- [x] 4.6 Adicionar processamento pos-geracao por imagem
  - dHash + lookup em creatives_generated company nos ultimos 30d
  - Se distancia <=3: BLOQUEIA, retorna criativo existente em vez de inserir novo (sem cobrar quota)
  - Se distancia 4-8: marca is_near_duplicate=true, near_duplicate_of_id
  - OCR via runOcrCheck; match com blocklist marca compliance_warning=true
  - _Requirements: 8.2, 8.3, 10.5_

- [x] 4.7 Persistir resultado + audit
  - Upload bytes ao bucket generated-creatives com path `{company_id}/{creative_id}.{ext}`
  - INSERT creatives_generated (briefing_snapshot, kb_chunk_ids, prompt, custo, phash, etc)
  - INSERT creative_compliance_check
  - INSERT agent_runs com agent_name='creative-nano-banana' ou 'creative-gpt-image' + total_tokens (input + output) + cost_usd
  - logCreativeAccess
  - _Requirements: 2.5, 8.1, 9.5_

- [x] 4.8 (P) Adicionar suporte a mode='adapt' (multi-aspecto)
  - Recebe source_creative_id; baixa source bytes, reusa prompt + concept; substitui apenas format
  - Cria adaptation_set_id agrupando todas adaptacoes do mesmo source
  - parent_creative_id aponta pra source; status default 'generated'
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

## 5. Edge Function `creative-iterate`

- [x] 5.1 Implementar img2img a partir de parent
  - Recebe IterateRequest (parent_creative_id, instruction, mode, count)
  - Tenant guard valida que parent.company_id == user.company_id
  - Quota check + compliance check da instruction (briefing_hits + blocklist)
  - Baixa parent bytes do bucket, encoda b64
  - Chama provider passando parent como inline_data (Gemini) ou via /edits (GPT-image-1)
  - Mode 'vary' forca count=3 com prompts identicos (variacao natural por nao-determinismo); mode 'regenerate' usa mesmo prompt; mode 'iterate' adiciona instruction como diff
  - Persiste com parent_creative_id linkado
  - _Requirements: 3.1, 3.2, 3.3, 3.5_

- [x] 5.2 Adicionar warning de iteracao excessiva
  - Conta cadeia de iteracoes do parent (recursivo via SQL CTE ou cliente)
  - Se >= 5: inclui campo `iteration_warning` na response sugerindo repensar concept
  - _Requirements: 3.4_

## 6. Edge Function `creative-export`

- [x] 6.1 Implementar ZIP de criativos aprovados
  - Recebe array de creative_ids (max 50)
  - Tenant guard + valida que todos pertencem a company
  - Filtra apenas status='approved' ou 'published'
  - Baixa bytes do bucket em paralelo, monta ZIP via lib Deno-friendly
  - Sobe ZIP em bucket temporario (ou retorna stream + signed URL TTL 5min)
  - _Requirements: 7.6_

## 7. Tipos + schemas frontend

- [x] 7.1 Criar tipos em `src/types/creative.ts`
  - AspectFormat, ModelChoice, StyleHint, CreativeStatus, Creative, CreativeUsage, CreativeHealth, CreativeError, GenerateRequest, IterateRequest
  - Constantes: MAX_COUNT=4, ASPECT_LABELS, MODEL_LABELS
  - _Requirements: 1.1, 5.1, 6.5, 11.5_

- [x] 7.2 (P) Criar schemas Zod em `src/lib/creative-schemas.ts`
  - generateRequestSchema, iterateRequestSchema, updateMetadataSchema, filtersSchema
  - _Requirements: 1.1, 3.1, 7.2_

## 8. Hooks frontend

- [x] 8.1 Implementar `useCreatives` hook
  - Listagem com filtros (status, format, oferta, periodo) via TanStack Query
  - Mutations: approve, discard (UPDATE status), updateMetadata, iterate (chama creative-iterate Edge Fn), vary, exportZip
  - readOnly por role (member nao pode aprovar/iterar)
  - Invalida queries `creatives` e `creative-usage` em cada mutation
  - Tradução de erros tipados (CreativeError discriminated union)
  - _Requirements: 5.1, 5.2, 5.3, 5.5, 7.2, 7.4, 9.4_

- [x] 8.2 (P) Implementar `useCreativeUsage` hook
  - Consome get_creative_usage + get_creative_health em paralelo
  - Mapeia snake_case -> camelCase
  - Cache 1min, refetch exposto, invalida quando useCreatives muda
  - _Requirements: 6.5, 11.5_

## 9. UI Estudio + galeria inline

- [x] 9.1 Criar `CreativeGalleryInline` para o chat
  - Renderizado quando ai-chat retorna `creatives` na tool response
  - Cada criativo: thumbnail clicavel (lightbox), badge format/model, 4 botoes (Aprovar, Iterar, Variar 3x, Descartar)
  - Click "Iterar" abre input inline pra instruction
  - Estados: loading durante iteracao, sucesso (atualiza galeria), erro (toast)
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 9.2 (P) Criar `StudioView` (biblioteca permanente)
  - Header com filtros (status, format, oferta, periodo) + busca textual
  - Grid de criativos com badges (status, fonte de verdade quando ready_for_publish)
  - Bulk actions: aprovar selecionados, exportar ZIP
  - Empty state com CTA pra abrir chat
  - Adicionar entrada em AppSidebar (icone Sparkles ou Image)
  - _Requirements: 7.1, 7.6_

- [x] 9.3 (P) Criar `CreativeUsageBanner`
  - Render no topo do StudioView quando status='warning' ou 'blocked'
  - Lista warning/blocked dimensions com numeros
  - CTA upgrade ou limpar discarded
  - _Requirements: 6.3, 6.4_

- [x] 9.4 Criar `CreativeDetailDialog`
  - Abre ao clicar em criativo no Studio ou galeria
  - Exibe: imagem em alta-res (signed URL), prompt completo, modelo, custo, formato, dimensoes
  - Tab "Linhagem" mostra parent chain via get_creative_provenance
  - Tab "Compliance" mostra creative_compliance_check (baseline_hits, briefing_hits, ocr_hits)
  - Edit metadata inline (titulo/desc/tags/ready_for_publish)
  - Acoes: download, mark ready_for_publish, discard, iterate
  - _Requirements: 7.2, 7.3, 7.4, 8.4_

## 10. Integracao com chat (tool calling)

- [x] 10.1 Adicionar 4 tools em `_shared/tools.ts`
  - `generate_creative` (concept, format, count, style_hint, use_logo, model, mode, source_creative_id)
  - `iterate_creative` (parent_creative_id, instruction, mode, count)
  - `vary_creative` atalho de iterate_creative com mode='vary'
  - `adapt_creative` atalho de generate_creative com mode='adapt'
  - Descriptions instruem GPT a NAO usar para perguntas analiticas (evita confusao com get_top_performers)
  - _Requirements: 1.1, 3.1, 3.5, 4.1_

- [x] 10.2 Implementar handler em `ai-chat`
  - case 'generate_creative' chama Edge Function creative-generate via fetch passando JWT do user
  - case 'iterate_creative' / 'vary_creative' chama creative-iterate
  - case 'adapt_creative' chama creative-generate com mode='adapt'
  - Formata response em texto markdown listando criativos por id/format + sinalizacao especial pra galeria inline (ex: tag custom `<creative-gallery ids="..."/>` que o frontend reconhece)
  - _Requirements: 1.7, 5.1_

- [x] 10.3 Atualizar SYSTEM_PROMPT com secao "GERACAO DE CRIATIVOS"
  - Quando usar (pedidos de "gera anuncio", "cria imagem", "faz mais 3 variacoes")
  - Quando NAO usar (pedidos analiticos, perguntas sobre campanhas)
  - Regra: NAO chamar generate_creative se usuario so esta perguntando sobre criativos existentes
  - Regra: apos receber resultado da tool, NAO descrever cada imagem em texto — usuario ja ve a galeria
  - _Requirements: 1.1, 5.6_

- [x] 10.4 Adicionar parser de `<creative-gallery>` em ChatView
  - ChatView detecta a tag custom no texto da resposta da IA
  - Substitui pela renderizacao do CreativeGalleryInline com os ids especificados
  - Refs invalidas (criativo nao existe ou nao acessivel) viram badge "criativo nao encontrado"
  - _Requirements: 5.1, 5.6_

## 11. Testes

- [x] 11.1 Testes unit do dHash
  - imagem identica -> distancia 0
  - variacao leve -> distancia <=3
  - imagem diferente -> distancia >10
  - hash sempre 16 chars hex
  - _Requirements: 8.2, 8.3_

- [x] 11.2 (P) Testes unit do quota calculator
  - warning em 80% (cada dimensao)
  - block em 100% (cada dimensao)
  - dimensoes corretas em status
  - _Requirements: 6.3, 6.4, 6.5_

- [x] 11.3 (P) Testes unit do compliance light textual
  - matchs no concept
  - matchs na instruction
  - briefing prohibitions sempre bloqueiam
  - blocklist com severity=block_unless_override exige flag override
  - _Requirements: 10.2, 10.3, 10.4_

- [x] 11.4 (P) Testes unit dos schemas Zod e tipos
  - generateRequestSchema com count fora de 1-4 falha
  - mode='adapt' sem source_creative_id falha
  - filtros invalidos rejeitados
  - _Requirements: 1.1, 4.1_

- [x] 11.5 Tests integracao SQL — RPC e RLS
  - get_creative_usage retorna jsonb correto em planos free/pro/enterprise (3 fixtures)
  - cross-tenant SELECT em creatives_generated retorna 0
  - INSERT direto em creative_compliance_check bloqueado para client (sem policy publica)
  - get_creative_provenance retorna chain correto seguindo parent_creative_id
  - Documentado em `.kiro/specs/ai-creative-generation/tests/sql-integration.sql`
  - _Requirements: 6.5, 8.4, 9.1_

- [ ] 11.6 (P) Testes E2E Playwright
  - Geracao via chat: "gera 1 anuncio em 1:1" -> galeria aparece -> click aprovar -> aparece em Estudio
  - Iteracao via galeria: click iterar -> input instruction -> novo criativo na galeria
  - Quota=blocked impede geracao com toast claro
  - Cross-tenant em Studio retorna apenas criativos proprios
  - Documentado em `e2e/creative-generation.spec.ts`
  - _Requirements: 5.2, 5.4, 6.4, 9.1_

- [ ] 11.7* Testes de performance
  - p95 generate count=1 Nano Banana <8s
  - p95 generate count=1 GPT-image high <20s
  - dHash 1024x1024 <500ms
  - Marcado opcional pos-MVP — exige API keys reais em staging
  - _Requirements: 11.5_

## 12. Documentacao + steering

- [x] 12.1 Atualizar `.kiro/steering/implemented-features.md`
  - Adicionar entrada com tabelas, RPCs, Edge Functions, hooks, UI, integracoes
  - Notar dependencias: briefing-onboarding (R1.2 gate), knowledge-base-rag (KB context opcional)
  - _Requirements: — (regra do projeto)_
