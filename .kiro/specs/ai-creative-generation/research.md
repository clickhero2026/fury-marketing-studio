# Research & Design Decisions — ai-creative-generation

## Summary
- **Feature**: `ai-creative-generation`
- **Discovery Scope**: Complex Integration — duas APIs externas novas (Gemini + OpenAI Images) + nova funcionalidade central no chat
- **Key Findings**:
  - Ambos provedores retornam base64 inline (nao URL/file id) — pipeline armazena bytes em bucket privado a partir do output do modelo
  - Gemini 2.5 Flash Image suporta aspect ratios nativos `1:1`, `4:5`, `9:16` (todos que precisamos) sem crop posterior
  - GPT-image-1 so tem 3 sizes: `1024x1024`, `1024x1536`, `1536x1024` — para reels (4:5) precisaremos crop pos-geracao OU usar sempre Nano Banana para 4:5
  - **Nem Gemini nem GPT-image suportam seed** — iteracao consistente exige passar imagem anterior como input (img2img)
  - pHash em Deno: nao existe lib pronta — implementar dHash via `imagescript` (zero deps nativas)
  - Pricing aproximado: Nano Banana ~$0.04/img · GPT-image-1 high ~$0.17/img

## Research Log

### Gemini 2.5 Flash Image (Nano Banana 2)
- **Endpoint**: `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent`
- **Auth**: header `x-goog-api-key`
- **Request shape**: `{ contents: [{ parts: [{ text }, { inline_data: { mime_type, data } }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio } } }`
- **Aspectos suportados nativamente**: 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9 — **todos os 3 alvos** (1:1/9:16/4:5) sao nativos
- **Resolucao**: ~1024px no maior lado
- **Output**: base64 em `candidates[0].content.parts[].inline_data.data`
- **Pricing**: ~$0.039/img (1290 output tokens × $30/1M)
- **Img2img**: SIM — basta incluir `inline_data` parts adicionais junto com text
- **Seed**: NAO documentado para esse modelo
- **Implications**: ideal para default rapido + iteracao via img2img passando parent image

### GPT-image-1 (OpenAI)
- **Geracao**: `POST https://api.openai.com/v1/images/generations`
- **Edits (img2img)**: `POST https://api.openai.com/v1/images/edits` (multipart/form-data)
- **Auth**: `Authorization: Bearer`
- **Sizes nativos**: 1024x1024, 1024x1536, 1536x1024 — **sem 4:5 nativo** (1024x1280 nao existe)
- **Output**: SEMPRE base64 em `data[0].b64_json`
- **Quality**: low / medium / high
- **Pricing high**: ~$0.17/img (1024x1024) ate $0.25 (1536x1024)
- **Seed**: nao suportado
- **input_fidelity**: `low` | `high` (so em /edits) — preserva logos/rostos
- **Implications**: usar para fechar conceito (qualidade); mapear reels 4:5 para 1024x1280 via crop ou forcar Nano Banana para 4:5

### pHash em Deno
- Nao existe lib pronta sem deps nativas. `sharp-phash` e `imghash` requerem libvips.
- **Solucao escolhida**: implementar **dHash** via `imagescript@1.2.17` (Deno-native, ESM, zero binarios)
- Pipeline: decode -> resize 9x8 -> grayscale -> compara pixels adjacentes -> 64 bits = hash hex 16 chars
- Distancia: Hamming via XOR + popcount
- Custo: ~80 linhas TS, sem dependencia externa nativa

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|---|---|---|---|---|
| Geracao sincrona dentro do chat (streaming) | Tool retorna URLs prontos no mesmo turno | UX boa, sem polling | Edge Function pode timeout em count>2 com GPT-image | **Selecionado para count<=2**; count>2 vira async |
| Pipeline async com cron polling | Pedido grava `pending`, cron processa | Resiliente | Latencia ~30s — UX ruim no chat | Rejeitado para v1 |
| Hibrido sincrono+async | sync ate count=2; async para count>=3 com loading state no chat | Melhor dos dois mundos | Mais codigo | **Selecionado** |

## Design Decisions

### Decision: Hibrido sincrono (count<=2) vs async (count>=3)
- **Context**: Edge Functions tem limite ~150s. count=4 com GPT-image-1 high pode estourar.
- **Selected**: Tool `generate_creative` chama Edge Function `creative-generate` que processa sincrono em paralelo (Promise.all com timeout 30s/img). Para count>=3, dispara em background via `kb-process-pending`-style polling.
- **Rationale**: 95% dos pedidos sao count<=2 — sincrono cobre o caso comum.
- **Trade-offs**: dois caminhos no codigo

### Decision: Bucket separado `generated-creatives`
- **Context**: criativos sao patrimonio de marca, separado de `knowledge-base`/`chat-attachments`
- **Selected**: bucket privado novo, path `{company_id}/{creative_id}.{ext}`
- **Rationale**: lifecycle e RLS distintos; permite quota separada

### Decision: dHash em vez de pHash classico
- **Context**: R8.2 exige hash perceptual; pHash classico (DCT 32x32) seria ~110 linhas TS
- **Selected**: dHash (resize 9x8 + diff vizinhos) — equivalente para dedup com 60-80 linhas
- **Rationale**: simplicidade vence; pHash classico pode vir em v2 se dHash mostrar limites

### Decision: Iteracao via img2img (sem seed)
- **Context**: Nem Gemini nem GPT suportam seed
- **Selected**: `iterate_creative` baixa o parent do bucket, encoda em base64, envia como `inline_data` no novo prompt
- **Rationale**: e o padrao recomendado oficialmente
- **Trade-offs**: custo mais alto (image input tokens), mas e a unica alternativa

### Decision: Compliance light textual antes da geracao + OCR pos
- **Context**: R10 - rejeitar concept obviamente violador antes de cobrar token
- **Selected**: blocklist baseline + briefing prohibitions verificados em `concept`/`instruction` ANTES da chamada ao provedor; OCR pos-geracao via GPT-4o-mini para detectar texto problematico nas imagens
- **Rationale**: poupar custos quando o pedido ja vem ruim; pos-OCR pega so casos limite

### Decision: Quotas conservadoras por planos (free=5/dia/$2 etc)
- Confirmado em sessao com usuario. Permite revisao para cima depois de validar.

## Risks & Mitigations
- **Risco**: Gemini API key vazar -> custo de terceiro rodando ate ser detectado. **Mitigacao**: chave so em env do Supabase (nunca no front), rate limit por company.
- **Risco**: count>=3 async perdeu visibilidade no chat. **Mitigacao**: emit eventos de progresso via realtime channel + UI mostra "gerando 3/4..."
- **Risco**: pHash dHash pode dar falso positivo em criativos legitimos parecidos (mesma campanha em cores diferentes). **Mitigacao**: threshold <=3 e bem estrito, e bloqueio retorna criativo existente — usuario pode confirmar com flag.
- **Risco**: GPT-image high ~$0.17 estoura quota free rapido. **Mitigacao**: free bloqueado de GPT-image (R6.7).
- **Risco**: Provedores down simultaneamente. **Mitigacao**: fallback Nano->GPT (R2.3); se ambos falhar, retorna erro sem cobrar (R2.4).

## References
- [Gemini API — Image generation](https://ai.google.dev/gemini-api/docs/image-generation)
- [Google blog — production aspect ratios](https://developers.googleblog.com/gemini-2-5-flash-image-now-ready-for-production-with-new-aspect-ratios/)
- [OpenAI — Image generation guide](https://developers.openai.com/api/docs/guides/image-generation)
- [OpenAI — gpt-image-1 model card](https://platform.openai.com/docs/models/gpt-image-1)
- [OpenAI Cookbook — high input fidelity](https://cookbook.openai.com/examples/generate_images_with_high_input_fidelity)
- [imagescript Deno module](https://deno.land/x/imagescript@1.2.17)
