# Design — Multi-Agent Specialists

## Arquitetura geral

```
                        ┌──────────────────────┐
   user message  ──────▶│  ORCHESTRATOR        │
                        │  (ai-chat / GPT-4o)  │
                        │                      │
                        │  Tools que mantem:   │
                        │  - get_* (dados)     │
                        │  - search_knowledge  │
                        │  - sync_meta_assets  │
                        │  - generate_report   │
                        │  - delegate_to_*     │
                        └──────┬───────────────┘
                               │
            ┌──────────────────┼─────────────────┬─────────────────┐
            ▼                  ▼                 ▼                 ▼
    ┌──────────────┐   ┌─────────────┐   ┌──────────────┐  ┌────────────┐
    │ meta-ads-    │   │ creative-   │   │ compliance-  │  │ action-    │
    │ specialist   │   │ specialist  │   │ officer      │  │ manager    │
    │ (existente)  │   │ (NOVO)      │   │ (NOVO)       │  │ (NOVO)     │
    └──────────────┘   └─────────────┘   └──────────────┘  └────────────┘
       analise            criativos        compliance        HITL acoes
       quanti             AI               retroativo        + propose_rule
```

## Componentes novos

### Edge Function `creative-specialist`

**Path**: `supabase/functions/creative-specialist/index.ts`

**Prompt focado** (~80 linhas):
- Identidade: especialista em criativos AI para Meta Ads
- Fluxo consultivo obrigatorio (pergunta oferta+formato+count antes de gerar
  se intencao for vaga)
- Conhece os 3 modelos disponiveis (nano_banana, gpt_image, auto)
- Conhece formato (feed_1x1, story_9x16, reels_4x5)
- Tradução de jargao (creative, formato) pra leigos
- Output: 1-2 frases de intro + tag `<creative-gallery>` + 1 frase de proximo passo

**Tools acessiveis**:
- `generate_creative`
- `iterate_creative`
- `vary_creative`
- `adapt_creative`
- `compare_creatives`
- `search_knowledge` (para puxar oferta/depoimentos do briefing quando relevante)

**Request body**:
```ts
{
  question: string,         // pergunta/instrucao do orchestrator
  context?: string,         // contexto adicional (historico relevante)
  parent_run_id?: string,
  conversation_id?: string,
  company_id: string,
}
```

**Response**:
```ts
{
  answer: string,           // markdown final pronto pra o orchestrator polir
  tools_used: string[],
  cost_usd: number,
  latency_ms: number,
}
```

### Edge Function `compliance-officer`

**Path**: `supabase/functions/compliance-officer/index.ts`

**Tools acessiveis**:
- `add_prohibition`
- `rescan_compliance`
- `get_compliance_status`

**Particularidade**: precisa retornar `compliance_action` capturado (prohibition + rescan stats)
para o orchestrator poder embutir em `metadata.compliance_action` da assistant
message — mantendo o card violeta inline funcionando.

**Response extendida**:
```ts
{
  answer: string,
  compliance_action?: { prohibition?: {...}, rescan?: {...} },
  ...
}
```

### Edge Function `action-manager`

**Path**: `supabase/functions/action-manager/index.ts`

**Tools acessiveis**:
- `pause_campaign`, `reactivate_campaign`, `update_budget`
- `pause_ad`, `reactivate_ad`
- `propose_rule`, `propose_plan`

**Particularidade**: tools criam approvals/plans pending. Precisa retornar
`proposed_rule` capturado quando aplicavel para o orchestrator embutir em
`metadata.proposed_rule` (mantem RuleProposalCard funcionando).

## Modificacoes no orchestrator

### `_shared/tools.ts`
- Adicionar 3 tool definitions de delegacao
- REMOVER definitions das tools que viraram exclusivas dos specialists
  (mas manter export caso specialists usem)

### `ai-chat/index.ts`
- Adicionar 3 cases no switch `executeTool`:
  - `delegate_to_creative` -> invokeSpecialist('creative-specialist', ...)
  - `delegate_to_compliance` -> invokeSpecialist('compliance-officer', ...)
  - `delegate_to_action` -> invokeSpecialist('action-manager', ...)
- Helper `invokeSpecialist(endpoint, args, ctx)` generico baseado no
  `delegateToSpecialist` ja existente para meta-ads-specialist
- Quando specialist retorna metadata extra (compliance_action, proposed_rule),
  popular nos refs apropriados para persistir em chat_messages.metadata

### `_shared/prompt.ts`
- Adicionar secao "QUANDO DELEGAR vs RESPONDER DIRETO":
  - Pergunta sobre dados/metricas → meta-ads-specialist
  - Pedido de geracao/edicao de imagem → creative-specialist
  - Adicionar/scanear compliance → compliance-officer
  - Pausar/reativar/mudar budget/aprender regra → action-manager
  - Tudo mais (perguntas conversacionais, dados leves) → responde direto
- Reforcar: APOS receber resposta do specialist, FAZER POLIMENTO no tom
  WhatsApp antes de mandar pro user. Nunca colar a resposta do specialist
  literal — sempre passar pelo polish.

## Helper compartilhado

**Path**: `supabase/functions/_shared/specialist-invoker.ts`

Generico para invocar qualquer specialist:

```ts
export async function invokeSpecialist(
  endpoint: 'creative-specialist' | 'compliance-officer' | 'action-manager' | 'meta-ads-specialist',
  body: { question: string; context?: string; ... },
  authHeader: string,
): Promise<{ answer: string; metadata?: Record<string, unknown>; cost_usd: number }>
```

Substitui o atual `delegateToSpecialist` em `ai-chat/index.ts` por uma versao
generica. Reduz duplicacao.

## Trade-offs assumidos

| Decisao | Tradeoff | Por que aceitar |
|---|---|---|
| Specialists sincronos (orchestrator espera) | +latencia por turno (~3-5s) | Streaming polifasico complica muito; user prefere qualidade |
| Mesmo modelo (GPT-4o) em todos | Custo nao cai | Otimizacao prematura — medimos depois |
| Specialists nao tem `delegate_to_*` | Sem cadeia profunda | YAGNI — orchestrator continua sendo unico router |
| Polimento sempre no orchestrator | +1 LLM call no fim | Garante consistencia de tom WhatsApp |

## Sequencia de turn (exemplo)

```
1. User: "cria um anuncio pra minha pizzaria"
2. Orchestrator: classifica intencao = creative
   → chama delegate_to_creative({question: "cria anuncio para pizzaria",
                                  context: "user disse 'minha pizzaria',
                                            sem mais contexto"})
3. Creative-specialist: roda LLM com prompt focado
   → decide que falta info (oferta? formato?)
   → retorna: {answer: "Show, sobre o que? me conta a oferta principal..."}
4. Orchestrator: recebe answer, faz polimento (tom WhatsApp, emoji se cabe)
   → stream pro user
5. User responde detalhes
6. Orchestrator: classifica = creative de novo
   → delega com contexto enriquecido
7. Creative-specialist: tem tudo, chama generate_creative
   → retorna {answer: "Gerei tua imagem 🍕 [creative-gallery ids=...]"}
8. Orchestrator: polimento (curto), stream
```

## Riscos e mitigacoes

| Risco | Mitigacao |
|---|---|
| Orchestrator e specialist "discordam" sobre proximo passo | Specialist sempre tem contexto enriquecido do orchestrator; dois LLM calls aumentam consistencia mas raramente divergem |
| Latencia ultrapassa 12s em horario de pico | Telemetria via agent_runs; se passar de 12s p50 por uma semana, considerar Haiku no orchestrator |
| Custo dobra | Monitorar agent_runs.cost_usd somado por parent_run_id; alertar se >2x baseline |
| Quebra mensagens antigas | metadata cols ja existentes; novos specialists populam mesmas cols |

## Migrations necessarias

**Nenhuma**. Reusa `agent_runs` (com parent_run_id), `approvals`, `plans`,
`chat_messages.metadata` existentes.
