# Requirements: Fury Learning — Regras Aprendidas via Chat

> **Status:** DRAFT — aguardando aprovacao
> **Criado:** 2026-04-26
> **Owner:** Thor (BACKEND) + Iron Man (FRONTEND) + Captain America (SECURITY)
> **Prioridade:** P0 — virada de posicionamento do produto Fury (assistente IA com memoria + regras)
> **Idioma:** pt-BR

## Introducao

Reposicionamento do "Fury" como **cerebro do assistente IA**: memoria + regras + comportamentos que sao aprendidos durante a conversa do usuario com o chat. O usuario fala em linguagem natural ("sempre pausa campanha com ROAS abaixo de 1", "criativos de fim de semana usam tom casual", "me avisa quando CPA passar de R$50") e o sistema:

1. Detecta a intencao de regra permanente durante a mensagem.
2. Pergunta ao usuario se quer salvar como regra (rule proposal card inline no chat).
3. Persiste a regra (com `learned_from_message_id` apontando pra mensagem origem).
4. Aplica a regra ativa: comportamento via system prompt injection; acao via worker `fury-evaluate`.
5. Permite ao usuario ativar/desativar/editar/excluir no Painel Fury.

**Distincao fundamental** (separar tres tipos de regra que hoje estao misturados):

| Tipo | Tabela | Como aplica | Exemplos |
|---|---|---|---|
| **Acao** (operacional) | `fury_rules` (ja existe) | Worker `fury-evaluate` cron | "pausa se CPA > 50 por 3 dias", "me avisa quando ROAS cair de 1" |
| **Comportamento** (preferencia) | `behavior_rules` (NOVA) | System prompt injection no `ai-chat` | "tom casual em criativos de fim de semana", "sempre me explica em portugues simples" |
| **Pipeline de criativo** (transformacao) | `creative_pipeline_rules` (NOVA) | Hook no upload/geracao de criativo aplica transformacao no asset | "logo no canto superior direito de todo criativo", "sempre legenda em videos", "fonte X em titulos" |

**Reposicionamento Avengers:** o agente interno "Nick Fury (ARCHITECT)" sera renomeado para liberar o nome "Fury" pra feature de produto. Nome novo: **Director Coulson (ORCHESTRATOR)**. Ver REQ-9.

## Requirements

### REQ-1: Schema de regras de comportamento

**Objetivo:** Como sistema, preciso armazenar regras de preferencia de tom/estilo/comportamento do assistente, distintas das regras operacionais existentes.

#### Criterios de Aceite

1. The system shall criar tabela `behavior_rules` com colunas:
   - `id uuid PK`
   - `company_id uuid` (RLS via `current_user_company_id()`)
   - `created_by uuid` (auth.users)
   - `name text` (humano, ex: "Tom casual em fins de semana")
   - `description text` (regra em linguagem natural — vai pro system prompt)
   - `scope jsonb` (`{level: 'global'|'campaign'|'creative'|'ad_account', id?: uuid}`)
   - `is_enabled boolean default true`
   - `proposal_status text` (`'pending'|'accepted'|'rejected'|'manual'`)
   - `confidence numeric` (0..1, score do LLM extractor)
   - `learned_from_message_id uuid` (FK chat_messages, nullable se criada manualmente)
   - `original_text text` (trecho da mensagem que gerou a regra)
   - `created_at timestamptz default now()`
   - `updated_at timestamptz`
   - `last_applied_at timestamptz` (telemetria)
2. RLS shall garantir que cada usuario so ve regras da sua company.
3. Trigger `auto_set_company_id` (ja existe no projeto) shall ser aplicado.
4. Indices: `(company_id, is_enabled)`, `(learned_from_message_id)`.

### REQ-2: Extensao de fury_rules pra suportar learned_from

**Objetivo:** Regras de acao (operacionais) tambem precisam saber se foram aprendidas via chat.

#### Criterios de Aceite

1. The system shall adicionar em `fury_rules`:
   - `learned_from_message_id uuid` (nullable)
   - `original_text text` (nullable)
   - `proposal_status text default 'manual'` (regras seedadas continuam 'manual')
   - `confidence numeric` (nullable)
2. Migration shall ser aditiva (nao remove colunas existentes).

### REQ-2.5: Schema de regras de pipeline de criativo

**Objetivo:** Capturar transformacoes que devem ser aplicadas a criativos durante upload/geracao (overlay de logo, legendas, fonte, cor, CTA).

#### Criterios de Aceite

1. The system shall criar tabela `creative_pipeline_rules` com colunas:
   - `id uuid PK`
   - `company_id uuid` (RLS)
   - `created_by uuid`
   - `name text` (ex: "Logo no canto superior direito")
   - `description text`
   - `transform_type text` (`'logo_overlay'|'caption'|'cta_text'|'font'|'color_filter'|'watermark'|'crop'|'custom'`)
   - `transform_params jsonb` — varia por tipo. Exemplo `logo_overlay`: `{asset_id: uuid, position: 'top-right'|'top-left'|..., padding_pct: 5, opacity: 1.0, max_size_pct: 15}`
   - `applies_to jsonb` (`{media_types: ['image','video','carousel'], scope: {level, id?}}`)
   - `priority int default 100` (ordem de aplicacao quando varias regras casam)
   - `is_enabled boolean default true`
   - `proposal_status text`
   - `confidence numeric`
   - `learned_from_message_id uuid`
   - `original_text text`
   - `created_at`, `updated_at`, `last_applied_at`
2. Assets referenciados em `transform_params` (logo, watermark) shall ser armazenados em Supabase Storage bucket `pipeline-assets` (privado, RLS por company_id).
3. Quando o usuario anexa imagem no chat e fala "use sempre essa logo", the system shall:
   - Salvar o anexo em `pipeline-assets`
   - Criar registro em `creative_assets` (tabela auxiliar: `id, company_id, type, storage_path, original_filename, mime_type`)
   - Referenciar o `creative_assets.id` em `transform_params.asset_id`
4. RLS + indices `(company_id, is_enabled)`, `(transform_type)`.

### REQ-3: Detecao de intencao de regra durante o chat

**Objetivo:** Como assistente, ao receber uma mensagem do usuario, quero detectar se ele esta expressando uma regra permanente (vs pedido pontual).

#### Criterios de Aceite

1. **Decisao de modelo:** em vez de chamada paralela com modelo separado, the system shall **adicionar uma tool `propose_rule` ao toolkit ja existente do `ai-chat`** (GPT-4o). Modelo unico, sem custo extra de call paralela.
2. The tool `propose_rule` shall ter schema strict via OpenAI tools API:
   ```json
   {
     "rule_type": "behavior" | "action" | "creative_pipeline",
     "confidence": number,
     "name": string,
     "description": string,
     "scope": {...},
     "trigger": {...} | null,         // so para action
     "action": {...} | null,          // so para action
     "transform": {...} | null,       // so para creative_pipeline
     "needs_asset_upload": boolean,   // true quando usuario referenciou anexo (ex: "use essa logo")
     "reasoning": string
   }
   ```
3. O system prompt do `ai-chat` shall instruir: "quando o usuario expressar uma instrucao com tom de regra permanente (sempre, toda vez, nunca, quando X faz Y, todo dia X), chame a tool `propose_rule` ANTES de responder com texto. Nao chame para pedidos pontuais."
4. Quando o LLM retornar tool call `propose_rule`, the Edge Function `ai-chat` shall:
   - Persistir `proposed_rule` em `chat_messages.metadata` da mensagem assistant.
   - Continuar respondendo com texto normal — a UI renderiza o card a partir do metadata.
5. Threshold minimo de confidence: 0.7. Abaixo disso, ignora silenciosamente.
6. Frases-gatilho de exemplo no prompt: "sempre", "toda vez", "quando X faz Y", "pausa se", "me avisa quando", "nunca", "todo X dia", "criativos de Y usam Z", "use essa logo em todos", "fonte X em todos titulos".
7. Quando `rule_type='creative_pipeline'` e `needs_asset_upload=true`, the system shall verificar se a mensagem do usuario tem anexo e criar `creative_assets` antes de salvar a regra (REQ-2.5.3).
8. Falsos positivos esperados sao OK — UX trata via "sempre perguntar" (REQ-4).

### REQ-4: Rule Proposal Card inline no chat (sempre perguntar)

**Objetivo:** Como usuario, quero ver claramente quando o assistente detectou uma intencao de regra e decidir se salvo.

#### Criterios de Aceite

1. The component `<RuleProposalCard>` shall renderizar dentro da mensagem assistant quando ela tiver `metadata.proposed_rule`.
2. Card shall mostrar: nome sugerido, descricao em linguagem natural, tipo (acao/comportamento), e 3 botoes:
   - **Salvar como regra** (primary)
   - **So desta vez** (ghost)
   - **Editar antes de salvar** (secondary, abre modal de edicao)
3. Apos clique em "Salvar":
   - Insert em `behavior_rules` ou `fury_rules` conforme `rule_type`
   - Atualiza `proposal_status='accepted'`
   - Substitui o card por badge **"Regra #42 ativa"** clicavel (abre painel Fury com a regra selecionada)
4. Apos clique em "So desta vez": atualiza `proposal_status='rejected'`, card vira mensagem fade ("ok, nao vou guardar").
5. Apos clique em "Editar": abre `<RuleEditModal>` com campos preenchidos, ao salvar segue mesmo flow do botao 1.
6. **Sempre perguntar** — nunca auto-salvar silencioso. (Decisao do usuario; pode ser flexibilizada em release futuro.)

### REQ-5: Aplicacao de regras de comportamento (system prompt injection)

**Objetivo:** Como assistente, quero respeitar as regras de comportamento ativas em toda resposta.

#### Criterios de Aceite

1. A Edge Function `ai-chat` shall, antes de chamar OpenAI, buscar `behavior_rules` da company onde `is_enabled=true`.
2. The function shall agrupar as `description` em bloco `<user_rules>` injetado no system prompt apos a persona base.
3. Se houver mais de 20 regras ativas, the system shall priorizar por `last_applied_at desc` e logar warning (escala futura).
4. Cada uso shall atualizar `last_applied_at = now()` em batch (nao bloquear resposta).

### REQ-5.5: Aplicacao de regras de pipeline de criativo

**Objetivo:** Toda vez que um criativo for criado/uploadado, regras ativas devem ser aplicadas como transformacao no asset final.

#### Criterios de Aceite

1. The system shall criar Edge Function `apply-creative-pipeline` que recebe `{creative_id, source_asset_path}`.
2. A funcao shall:
   - Buscar `creative_pipeline_rules` ativas pra company com `applies_to` casando o tipo de midia.
   - Ordenar por `priority asc`.
   - Aplicar cada transformacao sequencialmente usando biblioteca de imagem/video (avaliar: `sharp` para imagem, `ffmpeg` via wasm/Deno binding para video — definir no design.md).
   - Salvar versao transformada em `creative_assets` com `parent_id` apontando pro original.
   - Atualizar `creatives.thumbnail_url` e `creatives.media_url` pra versao transformada.
3. The function shall ser chamada:
   - Apos upload manual de criativo (hook no UploadCreative)
   - Apos geracao via IA (hook no fluxo `ai-chat` quando o usuario manda criar criativo)
   - Sob demanda via botao "Aplicar regras" em criativo existente
4. The system shall guardar `pipeline_applied_rules jsonb` em `creatives` listando os `rule_id` aplicados (auditoria + permite "desfazer").
5. Falha em uma regra nao deve quebrar as demais — log em `pipeline_application_logs`.

### REQ-6: Aplicacao de regras de acao (worker existente)

**Objetivo:** Regras operacionais aprendidas via chat devem entrar no fluxo `fury-evaluate` ja existente.

#### Criterios de Aceite

1. Regras com `rule_type='action'` aprovadas via chat shall ser persistidas em `fury_rules` com `is_enabled=true` e `proposal_status='accepted'`.
2. The Edge Function `fury-evaluate` (ja existe) shall continuar avaliando todas as `fury_rules` enabled, incluindo as aprendidas. **Nenhuma mudanca no worker.**
3. Mapeamento das colunas do `proposed_rule` pras colunas existentes (`threshold_value`, `consecutive_days`, `action_type`) shall ser feito pela Edge Function `propose-rule` ANTES de retornar — assim o INSERT na aprovacao e direto.

### REQ-7: Painel Fury reformado (2 abas + lista de regras)

**Objetivo:** Como usuario, quero gerenciar todas as regras (comportamento + acao) em um painel unico.

#### Criterios de Aceite

1. View `FuryView` shall ter 3 abas no topo:
   - **Comportamento** (lista de `behavior_rules`)
   - **Acao** (lista de `fury_rules` — mantem componentes ja existentes de threshold/toggle)
   - **Criativos** (lista de `creative_pipeline_rules` com preview do asset quando aplicavel — ex: thumbnail da logo)
2. Cada item de regra shall mostrar:
   - Toggle on/off (UPDATE `is_enabled`)
   - Nome + descricao
   - Origem: badge "Manual" ou "Aprendida" + se aprendida, link clicavel "ver mensagem origem" (abre ChatView na mensagem `learned_from_message_id`)
   - Acoes: editar, excluir
   - Telemetria: ultima aplicacao, vezes aplicada (somente acao)
3. Botao **"+ Nova regra manual"** abre modal de criacao manual (sem chat).
4. Filtro por status: ativas | desativadas | rejeitadas.

### REQ-8: Hook useActiveRules + invalidacao

**Objetivo:** Frontend precisa expor regras ativas pra UI e manter cache fresco apos toggle.

#### Criterios de Aceite

1. The hook `useActiveRules({ type })` shall buscar regras ativas via React Query (staleTime 60s).
2. Mutations `useToggleRule`, `useDeleteRule`, `useCreateRule` shall invalidar `['active-rules']` e `['fury-rules']`.
3. Apos aceitar `RuleProposalCard`, mutation shall invalidar tambem `['chat-messages', conversationId]` pra atualizar metadata.

### REQ-9: Renomeacao do agente interno Nick Fury

**Objetivo:** Liberar o nome "Fury" para o produto, sem ambiguidade interna.

#### Criterios de Aceite

1. O agente em `.claude/agents/ARCHITECT.md` shall ser renomeado de **Nick Fury** para **Director Coulson** (codinome interno do squad — Marvel S.H.I.E.L.D.).
2. Referencias a "Nick Fury" em `CLAUDE.md`, `.claude/CLAUDE.md`, `MEMORY.md` (do projeto, nao auto-memory do user) e demais agents shall ser atualizadas pra "Director Coulson".
3. A auto-memory do usuario (`C:\Users\filip\.claude\projects\e--clickhero-newapp\memory\`) shall ser atualizada em `feedback_avengers_protocol.md` (ou criar novo memo `feedback_fury_rebrand.md`).
4. Migration nao destrutiva: deixar nota em `MEMORY.md` por 1 sprint sobre o rebrand pra IA futura entender o historico.

### REQ-10: Telemetria e observabilidade

**Objetivo:** Saber se a feature esta sendo usada e qual a taxa de aceitacao das propostas.

#### Criterios de Aceite

1. Tabela `rule_proposal_events` shall registrar: `proposal_id, message_id, action ('accepted'|'rejected'|'edited'), rule_type, confidence, latency_ms, user_id, created_at`.
2. Dashboard interno (futuro) shall calcular taxa de aceitacao (accepted / total) por rule_type.
3. `agent_runs` (ja existe) shall continuar logando a chamada do `propose-rule` (tokens, latency, custo).

## Fora de escopo (proximas fases)

- Auto-salvar silencioso estilo ChatGPT (sempre perguntar nesta fase).
- Edicao de regras via chat ("muda a regra X pra Y") — primeiro release so via painel.
- Sugestao proativa de regras a partir de padroes detectados (proximo sprint, baseado em `memories`).
- Versionamento/historico de regras editadas.
- Compartilhamento de regras entre members da mesma company.
- Templates de regras pre-prontas (marketplace).

## Riscos e mitigacoes

| Risco | Mitigacao |
|---|---|
| LLM detecta regra demais (ruido no chat) | Threshold confidence >= 0.7 + "sempre perguntar" + telemetria de rejection rate |
| Regras de comportamento conflitantes ("formal" e "casual" ativas juntas) | Validacao no INSERT + warning na UI quando contradicao detectada |
| Custo do extra LLM call por mensagem | Claude Sonnet (mais barato que Opus) + cache de classificacao por similaridade da mensagem |
| Tokens demais no system prompt com 50+ regras ativas | REQ-5.3 prioriza top 20 + warning |
| Confusao com "Nick Fury" agente vs "Fury" produto | REQ-9 resolve renomeando agente |

## Definition of Done

- [ ] Migrations aplicadas (behavior_rules + creative_pipeline_rules + creative_assets + extensoes em fury_rules + rule_proposal_events)
- [ ] Tool `propose_rule` adicionada ao toolkit do `ai-chat` (sem call paralela)
- [ ] Edge Function `apply-creative-pipeline` deployada e testada com transformacao logo_overlay
- [ ] `ai-chat` injeta behavior_rules no system prompt
- [ ] `<RuleProposalCard>` renderiza inline
- [ ] FuryView com 2 abas funcionando
- [ ] Renomeacao Nick Fury -> Director Coulson concluida
- [ ] Build verde + Hulk validou funcional
- [ ] Steering atualizado em `.kiro/steering/implemented-features.md`
