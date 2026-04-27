# Design: Fury Learning — Regras Aprendidas via Chat

> **Status:** DRAFT — aguardando aprovacao
> **Criado:** 2026-04-26
> **Owner:** Thor (BACKEND) + Iron Man (FRONTEND) + Captain America (SECURITY)
> **Spec parent:** `requirements.md`

## Visao geral da arquitetura

```
USUARIO digita no chat
        |
        v
[ChatView.tsx] --POST--> [Edge: ai-chat] --GPT-4o (com tool propose_rule)
                              |
                              | tool_calls includes propose_rule?
                              |     |
                              |     SIM --> persiste em chat_messages.metadata.proposed_rule
                              |              |
                              | continua resposta texto normal
                              v              v
                         stream pra ChatView <RuleProposalCard> renderiza inline
                                             |
                                             v (clique Salvar)
                                  INSERT em (behavior|fury|creative_pipeline)_rules
                                             |
                                             v
                         badge "Regra ativa" + invalida useActiveRules

CRIATIVO uploadado (novo)
        |
        v
[CreativesView upload] --> Storage --> [Edge: apply-creative-pipeline]
                                              |
                                              v
                                  busca creative_pipeline_rules ativas
                                              |
                                              v
                                  imagescript: aplica overlays em ordem (priority)
                                              |
                                              v
                                  salva versao final em Storage
                                              |
                                              v
                                  UPDATE creatives.media_url + pipeline_applied_rules
```

## Decisoes arquiteturais (com justificativa)

| Decisao | Escolha | Por que |
|---|---|---|
| LLM detector | GPT-4o ja existente + tool `propose_rule` | Sem custo extra de call paralela; usuario explicitamente pediu o mais barato |
| Lib de imagem em Deno | `imagescript` (npm:imagescript via esm.sh) | Pure TS, roda em Deno Edge Function nativamente; suporta composite/overlay/resize. Sharp nao funciona em Deno |
| Video | Fora do escopo v1 | Decisao do usuario; ffmpeg em Edge Function e pesado, video fica pra fase 2 |
| Aplicacao retroativa | Apenas em criativos novos | Decisao do usuario; botao manual "aplicar em existentes" fica como nice-to-have futuro |
| Sempre perguntar | Sem auto-save silencioso | Confianca do usuario > conveniencia; flexibilizar so com telemetria depois |
| Separacao de tabelas | 3 tabelas (behavior/fury/creative_pipeline) | Schemas muito diferentes; melhor que polimorfismo via JSONB |
| Storage de logos | Bucket `pipeline-assets` + tabela `creative_assets` | RLS por company_id; assets reusaveis entre regras |

## Schema (migrations)

### Migration: `20260426000001_fury_learning.sql`

```sql
-- 1. Tabela auxiliar de assets reusaveis (logos, watermarks, fonts)
CREATE TABLE creative_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  asset_type text NOT NULL CHECK (asset_type IN ('logo', 'watermark', 'overlay', 'font', 'other')),
  storage_path text NOT NULL,            -- ex: 'pipeline-assets/<company_id>/logo-<uuid>.png'
  original_filename text,
  mime_type text NOT NULL,
  width int,
  height int,
  parent_id uuid REFERENCES creative_assets(id),  -- pra versoes derivadas
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_creative_assets_company ON creative_assets(company_id);
ALTER TABLE creative_assets ENABLE ROW LEVEL SECURITY;
-- RLS policies (select/insert/update/delete) usando current_user_company_id() — padrao do projeto

-- 2. Regras de comportamento (preferencias / system prompt)
CREATE TABLE behavior_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  name text NOT NULL,
  description text NOT NULL,
  scope jsonb NOT NULL DEFAULT '{"level":"global"}',
  is_enabled boolean NOT NULL DEFAULT true,
  proposal_status text NOT NULL DEFAULT 'manual'
    CHECK (proposal_status IN ('pending','accepted','rejected','manual')),
  confidence numeric,
  learned_from_message_id uuid REFERENCES chat_messages(id) ON DELETE SET NULL,
  original_text text,
  last_applied_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX idx_behavior_rules_active ON behavior_rules(company_id, is_enabled);
CREATE INDEX idx_behavior_rules_message ON behavior_rules(learned_from_message_id);
ALTER TABLE behavior_rules ENABLE ROW LEVEL SECURITY;

-- 3. Regras de pipeline de criativo
CREATE TABLE creative_pipeline_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  name text NOT NULL,
  description text NOT NULL,
  transform_type text NOT NULL
    CHECK (transform_type IN ('logo_overlay','caption','cta_text','font','color_filter','watermark','crop','custom')),
  transform_params jsonb NOT NULL,
  applies_to jsonb NOT NULL DEFAULT '{"media_types":["image"],"scope":{"level":"global"}}',
  priority int NOT NULL DEFAULT 100,
  is_enabled boolean NOT NULL DEFAULT true,
  proposal_status text NOT NULL DEFAULT 'manual',
  confidence numeric,
  learned_from_message_id uuid REFERENCES chat_messages(id) ON DELETE SET NULL,
  original_text text,
  last_applied_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX idx_pipeline_rules_active ON creative_pipeline_rules(company_id, is_enabled, priority);
ALTER TABLE creative_pipeline_rules ENABLE ROW LEVEL SECURITY;

-- 4. Extensao em fury_rules (regras aprendidas via chat)
ALTER TABLE fury_rules
  ADD COLUMN IF NOT EXISTS learned_from_message_id uuid REFERENCES chat_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS original_text text,
  ADD COLUMN IF NOT EXISTS proposal_status text NOT NULL DEFAULT 'manual'
    CHECK (proposal_status IN ('pending','accepted','rejected','manual')),
  ADD COLUMN IF NOT EXISTS confidence numeric;

-- 5. Auditoria de aplicacao de regras em criativos
ALTER TABLE creatives
  ADD COLUMN IF NOT EXISTS pipeline_applied_rules jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS pipeline_source_path text;  -- caminho do asset original antes das transformacoes

-- 6. Telemetria de proposicoes
CREATE TABLE rule_proposal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  user_id uuid REFERENCES auth.users(id),
  message_id uuid REFERENCES chat_messages(id) ON DELETE CASCADE,
  rule_type text NOT NULL CHECK (rule_type IN ('behavior','action','creative_pipeline')),
  action text NOT NULL CHECK (action IN ('proposed','accepted','rejected','edited')),
  rule_id uuid,                            -- FK polimorfica resolvida pela aplicacao
  confidence numeric,
  latency_ms int,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_proposal_events_company ON rule_proposal_events(company_id, created_at DESC);
ALTER TABLE rule_proposal_events ENABLE ROW LEVEL SECURITY;

-- 7. Triggers padrao do projeto
CREATE TRIGGER set_company_id_behavior_rules
  BEFORE INSERT ON behavior_rules
  FOR EACH ROW EXECUTE FUNCTION auto_set_company_id();
-- (repetir pra creative_assets, creative_pipeline_rules, rule_proposal_events)

CREATE TRIGGER set_updated_at_behavior_rules
  BEFORE UPDATE ON behavior_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- (repetir pras outras com updated_at)
```

### Storage bucket

```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('pipeline-assets', 'pipeline-assets', false);
-- Policies: select/insert/update/delete restritas ao company_id no path `<company_id>/...`
```

## Edge Functions

### Modificada: `ai-chat/index.ts`

**Adicoes:**

1. **Buscar behavior_rules ativas** apos resolver `companyId`, antes de montar `openaiMessages`:
   ```ts
   const { data: behaviorRules } = await supabaseAdmin
     .from('behavior_rules')
     .select('id, description')
     .eq('company_id', companyId)
     .eq('is_enabled', true)
     .order('last_applied_at', { ascending: false, nullsFirst: false })
     .limit(20);
   ```
2. **Injetar no system prompt** (apos persona base):
   ```ts
   if (behaviorRules?.length) {
     systemPrompt += `\n\n<user_rules>\nO usuario configurou as seguintes regras de comportamento. Respeite TODAS:\n${
       behaviorRules.map((r, i) => `${i + 1}. ${r.description}`).join('\n')
     }\n</user_rules>`;
   }
   ```
3. **Adicionar tool `propose_rule`** ao array de tools:
   ```ts
   {
     type: 'function',
     function: {
       name: 'propose_rule',
       description: 'Chame quando o usuario expressar uma instrucao com tom de regra permanente (sempre, toda vez, nunca, quando X faz Y, todo dia X, use sempre, X em todos). NAO chame para pedidos pontuais. Confidence < 0.7 NAO chame.',
       parameters: {
         type: 'object',
         required: ['rule_type','confidence','name','description','scope','reasoning'],
         properties: {
           rule_type: { type: 'string', enum: ['behavior','action','creative_pipeline'] },
           confidence: { type: 'number', minimum: 0, maximum: 1 },
           name: { type: 'string', description: 'Nome curto e humano da regra' },
           description: { type: 'string', description: 'Descricao em PT-BR que sera usada como instrucao' },
           scope: {
             type: 'object',
             properties: {
               level: { type: 'string', enum: ['global','campaign','adset','creative','ad_account'] },
               id: { type: 'string', nullable: true }
             }
           },
           trigger: { type: 'object', nullable: true, description: 'Apenas action: {metric, operator, value, window, consecutive_days}' },
           action: { type: 'object', nullable: true, description: 'Apenas action: {type: pause|alert|suggest, params}' },
           transform: {
             type: 'object', nullable: true,
             description: 'Apenas creative_pipeline: {transform_type, params: {position, padding_pct, opacity, ...}}'
           },
           needs_asset_upload: { type: 'boolean', description: 'true se usuario referenciou anexo (ex: "use essa logo")' },
           reasoning: { type: 'string' }
         }
       }
     }
   }
   ```
4. **Handler do tool_call `propose_rule`** dentro do loop `executeTool`:
   - Se `confidence < 0.7`: retorna `{skipped: true}` e nao persiste nada.
   - Se `needs_asset_upload === true` e a mensagem do usuario tem anexo (`metadata.attachments`):
     - Move o anexo de `chat-uploads/<conv>/<file>` pra `pipeline-assets/<company>/<uuid>.<ext>`.
     - Cria registro em `creative_assets`.
     - Adiciona `transform.params.asset_id` ao proposed_rule.
   - Persiste `proposed_rule` em `chat_messages.metadata.proposed_rule` da mensagem assistant atual (UPDATE no fim do stream).
   - Insere evento `rule_proposal_events` com `action='proposed'`.
   - Retorna pro LLM um string tipo `"Proposta registrada. Continue respondendo ao usuario; o card de aprovacao sera renderizado pela UI."`
5. **Atualizar `last_applied_at`** das behavior_rules usadas (UPDATE batch async, fire-and-forget).

### Nova: `apply-creative-pipeline/index.ts`

```ts
// Input: { creative_id: uuid, source_storage_path: string }
// Output: { transformed_storage_path: string, applied_rule_ids: uuid[] }

import { Image } from "https://esm.sh/imagescript@1.3.0";

serve(async (req) => {
  const { creative_id, source_storage_path } = await req.json();
  const supabase = createClient(...);

  // 1. Buscar criativo + company_id
  const { data: creative } = await supabase.from('creatives').select('*').eq('id', creative_id).single();

  // 2. Buscar regras ativas aplicaveis
  const { data: rules } = await supabase
    .from('creative_pipeline_rules')
    .select('*')
    .eq('company_id', creative.company_id)
    .eq('is_enabled', true)
    .order('priority', { ascending: true });

  if (!rules?.length) return Response.json({ skipped: true });

  // 3. Baixar imagem original
  const { data: originalBlob } = await supabase.storage.from('creatives').download(source_storage_path);
  let img = await Image.decode(new Uint8Array(await originalBlob.arrayBuffer()));

  const appliedIds: string[] = [];
  for (const rule of rules) {
    if (!matchesScope(rule.applies_to, creative)) continue;
    try {
      img = await applyTransform(img, rule, supabase);
      appliedIds.push(rule.id);
    } catch (e) {
      await supabase.from('pipeline_application_logs').insert({
        creative_id, rule_id: rule.id, status: 'error', error: String(e)
      });
    }
  }

  // 4. Salvar versao transformada
  const finalBytes = await img.encode();
  const finalPath = `${creative.company_id}/${creative_id}-pipeline-${Date.now()}.png`;
  await supabase.storage.from('creatives').upload(finalPath, finalBytes, { contentType: 'image/png', upsert: false });

  // 5. Update creatives
  await supabase.from('creatives').update({
    media_url: getPublicUrl(finalPath),
    pipeline_applied_rules: appliedIds,
    pipeline_source_path: source_storage_path
  }).eq('id', creative_id);

  // 6. Update rules.last_applied_at
  await supabase.from('creative_pipeline_rules')
    .update({ last_applied_at: new Date().toISOString() })
    .in('id', appliedIds);

  return Response.json({ transformed_storage_path: finalPath, applied_rule_ids: appliedIds });
});

async function applyTransform(img: Image, rule, supabase) {
  if (rule.transform_type === 'logo_overlay') {
    const { asset_id, position, padding_pct = 5, opacity = 1.0, max_size_pct = 15 } = rule.transform_params;
    const { data: asset } = await supabase.from('creative_assets').select('storage_path').eq('id', asset_id).single();
    const { data: logoBlob } = await supabase.storage.from('pipeline-assets').download(asset.storage_path);
    let logo = await Image.decode(new Uint8Array(await logoBlob.arrayBuffer()));

    // Resize logo pra max_size_pct da menor dimensao
    const maxSide = Math.floor(Math.min(img.width, img.height) * (max_size_pct / 100));
    const scale = maxSide / Math.max(logo.width, logo.height);
    if (scale < 1) logo = logo.resize(Math.floor(logo.width * scale), Math.floor(logo.height * scale));

    // Calcular posicao
    const padX = Math.floor(img.width * padding_pct / 100);
    const padY = Math.floor(img.height * padding_pct / 100);
    const positions = {
      'top-right':    [img.width - logo.width - padX, padY],
      'top-left':     [padX, padY],
      'bottom-right': [img.width - logo.width - padX, img.height - logo.height - padY],
      'bottom-left':  [padX, img.height - logo.height - padY],
      'center':       [(img.width - logo.width) / 2, (img.height - logo.height) / 2],
    };
    const [x, y] = positions[position] ?? positions['top-right'];

    if (opacity < 1) logo.opacity(opacity);
    img.composite(logo, Math.floor(x), Math.floor(y));
  }
  // outros transform_types: caption (texto), color_filter, etc. — fora do v1
  return img;
}
```

**Hook de invocacao:** apos sucesso do upload em `CreativesView` (frontend) ou apos geracao via IA, chamar `supabase.functions.invoke('apply-creative-pipeline', { body: {...} })` em background — nao bloqueia o usuario, atualiza por subscription/refetch.

## Frontend

### Componentes novos

| Componente | Path | Responsabilidade |
|---|---|---|
| `<RuleProposalCard>` | `src/components/fury/RuleProposalCard.tsx` | Renderiza inline no chat quando `message.metadata.proposed_rule`. 3 botoes |
| `<RuleEditModal>` | `src/components/fury/RuleEditModal.tsx` | Edicao da regra antes de salvar (compartilhado entre proposta e CRUD manual) |
| `<FuryRulesView>` | `src/components/fury/FuryRulesView.tsx` | Painel principal com 3 tabs (Tabs do shadcn) |
| `<BehaviorRulesTab>` | `src/components/fury/BehaviorRulesTab.tsx` | Lista regras de comportamento |
| `<ActionRulesTab>` | `src/components/fury/ActionRulesTab.tsx` | Reaproveita componentes existentes de `fury_rules` |
| `<CreativePipelineTab>` | `src/components/fury/CreativePipelineTab.tsx` | Lista regras de pipeline + thumbnail dos assets |
| `<RuleListItem>` | `src/components/fury/RuleListItem.tsx` | Card unificado: toggle, nome, origem, acoes |

### Hooks novos

| Hook | Path | Responsabilidade |
|---|---|---|
| `useActiveRules` | `src/hooks/useActiveRules.ts` | Query unificada das 3 tabelas com filtro por tipo |
| `useAcceptRuleProposal` | `src/hooks/useAcceptRuleProposal.ts` | Mutation: insere na tabela certa + emite event + invalida |
| `useRejectRuleProposal` | `src/hooks/useRejectRuleProposal.ts` | Mutation: marca message metadata como rejected + event |
| `useToggleRule` | `src/hooks/useToggleRule.ts` | Mutation generica (recebe table name) |
| `useApplyCreativePipeline` | `src/hooks/useApplyCreativePipeline.ts` | Invoke da Edge Function apos upload |

### Mudancas em arquivos existentes

| Arquivo | Mudanca |
|---|---|
| `ChatView.tsx` | Renderizar `<RuleProposalCard>` quando `message.metadata?.proposed_rule` |
| `MessageBubble` (ou equivalente) | Receber e passar adiante o metadata |
| `CreativesView.tsx` | Apos upload, chamar `useApplyCreativePipeline` |
| `AppSidebar.tsx` | Entry "FURY" ja existe — apenas garantir que `FuryView` aponta pra novo `FuryRulesView` |
| `Index.tsx` | Garantir route da view `fury` |
| Tipos | Regenerar `src/integrations/supabase/types.ts` apos migration |

## Seguranca (Captain America review)

1. **RLS em todas as 4 tabelas novas** com `current_user_company_id()` — padrao do projeto.
2. **Storage policy** em `pipeline-assets`: path deve comecar com `<company_id>/` e RLS valida match com user's company.
3. **Validacao no `propose_rule` handler**: nao confiar em `confidence` do LLM cegamente — checar formato dos campos obrigatorios; se schema invalido, dropa silenciosamente.
4. **Asset move**: ao mover de `chat-uploads` pra `pipeline-assets`, validar que o `mime_type` e imagem (`image/png|jpeg|webp`); rejeitar outros.
5. **Rate limit** indireto: tool `propose_rule` so chamavel pelo proprio LLM via OpenAI; nao ha endpoint publico.
6. **Auditoria**: `rule_proposal_events` mantem trilha completa.

## Performance

1. Tool extra adiciona ~200ms de latency no primeiro turn do `ai-chat` (antes de detectar `finish_reason='tool_calls'`). Aceitavel.
2. `apply-creative-pipeline` em background — usuario nao espera. Subscription Supabase Realtime avisa quando termina (ja existe pattern no projeto).
3. `behavior_rules` limitado a 20 ativas no system prompt (REQ-5.3).
4. `imagescript` tem startup ~50ms em Edge Function. Aceitavel.

## Telemetria

| Evento | Onde | Campos |
|---|---|---|
| Proposta gerada | `ai-chat` apos tool_call | `rule_type, confidence, latency_ms` |
| Proposta aceita | `useAcceptRuleProposal` | `rule_id, edited (bool)` |
| Proposta rejeitada | `useRejectRuleProposal` | `rule_id_null` |
| Regra aplicada (acao) | `fury-evaluate` (existente) | mantem como esta |
| Regra aplicada (criativo) | `apply-creative-pipeline` | `creative_id, applied_rule_ids` |

Logs de `agent_runs` (existente) ja capturam tokens e custo do `ai-chat` — sem mudanca.

## Fora de escopo (reforco do requirements)

- Video — apenas imagem v1
- Aplicacao retroativa em criativos existentes
- Auto-save silencioso
- Edicao de regra via chat
- Templates de regras
- Compartilhamento entre members

## Riscos tecnicos

| Risco | Mitigacao |
|---|---|
| `imagescript` nao suporta algum formato (heic, gif animado) | Validar mime no upload; fallback skip rule + log erro |
| Anexo no chat ainda nao implementado? | Verificar no codigo atual; se faltar, criar fluxo de upload no chat ANTES (pre-requisito) |
| Tool `propose_rule` chamada em demasia | Threshold confidence + monitorar `rule_proposal_events.action='proposed'` vs `accepted` |
| Edge Function timeout (>50s) com imagem grande | Resize early + limite de 4096x4096 input |

## Plano de rollout

1. Migration + bucket (zero impact, aditivo)
2. Tool `propose_rule` no `ai-chat` — feature flag `ENABLE_RULE_PROPOSALS=false` ate UI estar pronta
3. `<RuleProposalCard>` + hooks
4. `FuryRulesView` 3 abas
5. `apply-creative-pipeline` deployada
6. Hook no `CreativesView`
7. Renomeacao Nick Fury -> Director Coulson (ultimo, por nao bloquear nada)
8. Flag `ENABLE_RULE_PROPOSALS=true`
