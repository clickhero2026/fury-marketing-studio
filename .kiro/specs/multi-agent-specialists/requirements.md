# Requirements — Multi-Agent Specialists

> Continua o trabalho de `multi-agent-foundation`. Foundation criou o padrao de
> sub-agentes (meta-ads-specialist) e o orchestrator. Esta spec adiciona
> 3 novos specialists: Creative, Compliance, Action.

## Contexto / Por que

O `ai-chat` hoje carrega ~25 tools + prompt de 280 linhas. Modelo precisa
trocar de "papel" entre analise de dados, geracao criativa, compliance e
acoes destrutivas em todo turno. Isso causa:

- Respostas genericas em fluxos especificos (ex: "Parece que houve um problema")
- Prompt inflado dificulta evolucao por dominio sem regredir outros
- Sem decomposicao, fica caro adicionar mais qualidade por dominio

## Requisitos (formato EARS)

### R1 — Creative Specialist

R1.1 — QUANDO o usuario pede pra gerar/iterar/variar/adaptar imagem
       SE o orchestrator decide delegar
       ENTAO chama Edge Function `creative-specialist` com pergunta + contexto
       E recebe resposta estruturada (markdown + creative_ids quando aplicavel).

R1.2 — O creative-specialist DEVE conduzir o fluxo consultivo (pergunta
       oferta/formato/count antes de chamar generate_creative) usando seu
       proprio prompt focado, sem depender do orchestrator.

R1.3 — O creative-specialist DEVE ter acesso APENAS as tools criativas:
       generate_creative, iterate_creative, vary_creative, adapt_creative,
       compare_creatives. NAO tem acesso a pause/reactivate/budget/etc.

R1.4 — Logs em `agent_runs` com agent_name='creative-specialist' e
       parent_run_id ligando ao orchestrator que delegou.

### R2 — Compliance Officer

R2.1 — QUANDO o usuario adiciona proibicao ("nunca use X") ou pede scan
       ENTAO orchestrator delega ao `compliance-officer` que tem acesso
       restrito a add_prohibition, rescan_compliance, get_compliance_status.

R2.2 — O compliance-officer DEVE retornar resultado estruturado que o
       orchestrator usa para popular `metadata.compliance_action` da
       assistant message (mantem card violeta inline).

R2.3 — Logs em `agent_runs` com agent_name='compliance-officer'.

### R3 — Action Manager

R3.1 — QUANDO o usuario pede acao destrutiva (pausar/reativar
       ad/campanha, mudar budget) OU expressa regra permanente ("sempre",
       "nunca")
       ENTAO orchestrator delega ao `action-manager` que tem acesso a
       pause_campaign, reactivate_campaign, pause_ad, reactivate_ad,
       update_budget, propose_rule, propose_plan.

R3.2 — O action-manager NAO executa Meta API direto — sempre cria approval
       ou plan pending (HITL). Comportamento atual mantido.

R3.3 — Logs em `agent_runs` com agent_name='action-manager'.

### R4 — Orchestrator slim

R4.1 — `ai-chat` (orchestrator) MANTEM as tools de leitura/dados
       (get_*, search_knowledge, sync_meta_assets, generate_report) que ja
       sao baratas e rapidas — nao vale a pena delegar.

R4.2 — `ai-chat` GANHA 3 novas tools de delegacao: `delegate_to_creative`,
       `delegate_to_compliance`, `delegate_to_action` (analogas ao
       `delegate_to_meta_specialist` existente).

R4.3 — `ai-chat` PERDE as tools que viraram especialidade exclusiva
       dos specialists (generate/iterate/vary/adapt/compare_creative,
       add_prohibition/rescan_compliance, pause/reactivate/budget,
       propose_rule/propose_plan). Continuara apenas com a delegacao.

R4.4 — Apos receber resposta do specialist, orchestrator faz POLIMENTO
       no tom WhatsApp/consultivo antes de retornar ao usuario, conforme
       diretrizes ja existentes em prompt.ts (estilo WhatsApp, zero jargao).

### R5 — Performance / qualidade

R5.1 — Latencia adicional por delegacao DEVE ser <= 4s media (p50).
       Specialists usam GPT-4o (mesmo modelo do orchestrator hoje), nao
       precisamos otimizar com Haiku ainda.

R5.2 — Custo total por turno DEVE ficar <= 1.8x do baseline atual.
       Aceitavel pelo ganho de qualidade.

R5.3 — `metadata.parent_run_id` em todo agent_run de specialist permite
       traçar custo/latencia por turno completo.

### R6 — Backward compat

R6.1 — Nenhum tool publico do orchestrator pode mudar de assinatura
       — usuario nao deve perceber mudanca exceto pela qualidade.

R6.2 — Mensagens antigas no historico continuam carregando metadata
       (compliance_action, proposed_rule) corretamente, mesmo geradas
       pelo orchestrator monolitico antes da decomposicao.

## Metricas de sucesso

- Reducao de "respostas genericas" reportadas pelo usuario em fluxos
  criativos / compliance / action
- agent_runs mostra distribuicao saudavel (nao 100% no orchestrator)
- Latencia p50 <= 12s end-to-end (vs 8s atual baseline)

## Escopo fora desta spec

- Streaming dos specialists (so o polimento final faz stream — futuro)
- Trocar GPT-4o por Haiku no orchestrator (futuro, depois de medir custo)
- Specialist de Knowledge/RAG (search_knowledge fica no orchestrator —
  e leve e contextual ao prompt geral)
