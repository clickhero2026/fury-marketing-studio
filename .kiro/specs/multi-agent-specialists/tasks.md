# Tasks — Multi-Agent Specialists

> 3 sprints incrementais. Cada sprint deploy + commit independente.
> Fast-track aprovado pelo usuario 2026-04-28.

## Sprint C0 — Helper compartilhado (pre-trabalho)

- [ ] C0.1 — Criar `supabase/functions/_shared/specialist-invoker.ts`
       generico (recebe endpoint name, body, authHeader; retorna answer +
       metadata + cost). Substitui `delegateToSpecialist` em ai-chat.
- [ ] C0.2 — Refatorar ai-chat para usar invokeSpecialist no
       `delegate_to_meta_specialist` existente (sem mudanca de comportamento)
- [ ] C0.3 — Build verde

## Sprint C1 — Creative Specialist

- [ ] C1.1 — Criar `supabase/functions/creative-specialist/index.ts`
       (prompt focado em creative + 5 tools criativas + search_knowledge)
- [ ] C1.2 — Adicionar tool `delegate_to_creative` em `_shared/tools.ts`
- [ ] C1.3 — Adicionar case em `executeTool` no ai-chat
- [ ] C1.4 — Atualizar prompt do orchestrator: secao "QUANDO DELEGAR
       creative" + reforco de polimento WhatsApp pos-delegacao
- [ ] C1.5 — Manter as tools generate_creative/iterate/vary/adapt/compare
       em `_shared/tools.ts` (specialists usam) MAS REMOVER do array
       exposto ao orchestrator (orchestrator so tem delegate_*)
- [ ] C1.6 — Deploy creative-specialist + ai-chat
- [ ] C1.7 — Smoke test: pedir "cria anuncio para minha pizzaria" e
       verificar fluxo consultivo + agent_runs com parent_run_id
- [ ] C1.8 — Build + commit + push

## Sprint C2 — Compliance Officer

- [ ] C2.1 — Criar `supabase/functions/compliance-officer/index.ts`
       com 3 tools (add_prohibition, rescan_compliance, get_compliance_status)
       + retorno de compliance_action capturado
- [ ] C2.2 — Adicionar tool `delegate_to_compliance` em tools.ts
- [ ] C2.3 — Adicionar case em executeTool, propagando compliance_action
       retornado para `complianceActionRef.current`
- [ ] C2.4 — Atualizar prompt: secao "QUANDO DELEGAR compliance"
- [ ] C2.5 — Remover add_prohibition/rescan_compliance do array exposto
       ao orchestrator (mantem export)
- [ ] C2.6 — Deploy + smoke test (adicionar proibicao, conferir card violeta)
- [ ] C2.7 — Build + commit + push

## Sprint C3 — Action Manager

- [ ] C3.1 — Criar `supabase/functions/action-manager/index.ts` com 7 tools
       (pause/reactivate ad/campaign + update_budget + propose_rule + propose_plan)
       + retorno de proposed_rule capturado
- [ ] C3.2 — Adicionar tool `delegate_to_action` em tools.ts
- [ ] C3.3 — Adicionar case em executeTool, propagando proposed_rule
       retornado para `proposedRuleRef.current`
- [ ] C3.4 — Atualizar prompt: secao "QUANDO DELEGAR action"
- [ ] C3.5 — Remover essas 7 tools do array exposto ao orchestrator
- [ ] C3.6 — Deploy + smoke test (pausar ad, regra "sempre X", conferir
       cards inline)
- [ ] C3.7 — Build + commit + push

## Validacao geral

- [ ] V1 — `npm run build` verde apos cada sprint
- [ ] V2 — Telemetria agent_runs mostra distribuicao por agent_name
       (orchestrator vs especialistas)
- [ ] V3 — Latencia p50 <= 12s em 10 turnos de teste
- [ ] V4 — Custo medio por turno <= 1.8x baseline (medido via cost_usd
       agregado por parent_run_id)
- [ ] V5 — Atualizar `.kiro/steering/implemented-features.md` ao final
- [ ] V6 — Commit final + push 3 remotes
