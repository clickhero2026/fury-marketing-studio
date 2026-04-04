# Avengers Protocol — Agent System Integration with SDD

## Overview

O ClickHero usa um sistema de multi-agentes AI (DevSquad Avengers) integrado com Spec-Driven Development.
Cada agente tem um papel especifico e DEVE seguir as specs criadas via SDD.

## Agentes e Seus Papeis no SDD

| Agente | Papel no SDD |
|--------|-------------|
| **Nick Fury (ARCHITECT)** | Cria specs: `spec-init` → `spec-requirements` → `spec-design` → `spec-tasks` |
| **Iron Man (FRONTEND)** | Implementa tasks de UI/componentes/hooks conforme `tasks.md` |
| **Thor (BACKEND)** | Implementa tasks de banco/API/Edge Functions conforme `tasks.md` |
| **Captain America (SECURITY)** | Review de `requirements.md` e `design.md` antes de implementacao |
| **Hulk (GUARDIAN)** | Valida implementacao contra spec (`validate-gap`, `validate-design`) |
| **Thanos (META_SPECIALIST)** | Specs especificas de Meta API (OAuth, Campaigns, Insights) |
| **Black Widow (DETECTIVE)** | Investiga bugs — consulta spec para entender comportamento esperado |
| **Hawkeye (RESEARCHER)** | Pesquisa solucoes — atualiza `research.md` na spec |
| **Spider-Man (FIXER)** | Fix cirurgico — consulta spec para nao quebrar contrato |
| **Vision (SYSTEM)** | Deploy e docs — valida que build segue spec |
| **Heimdall (WATCHER)** | Monitora tasks longas em background |

## Workflow SDD + Avengers

### Para Features Novas
```
1. Nick Fury    → /kiro:spec-init <feature>
2. Nick Fury    → /kiro:spec-requirements <feature>
3. Cap America  → Review de requirements.md
4. Nick Fury    → /kiro:spec-design <feature>
5. Cap America  → Review de design.md
6. Nick Fury    → /kiro:spec-tasks <feature>
7. Thor         → Implementa tasks de backend
8. Iron Man     → Implementa tasks de frontend
9. Hulk         → /kiro:validate-gap + /kiro:validate-design + build
```

### Para Bug Fixes
```
1. Black Widow  → Investiga, consulta spec da feature afetada
2. Hawkeye      → Pesquisa solucao, atualiza research.md se necessario
3. Spider-Man   → Implementa fix respeitando contracts da spec
4. Hulk         → Valida que fix nao viola spec
```

## Regras de Integracao

1. **Spec ANTES de codigo** — Nenhum agente implementa sem spec aprovada
2. **Tasks atomicas** — Cada task em `tasks.md` e implementavel independentemente
3. **Contracts sao lei** — Interfaces definidas em `design.md` nao podem ser alteradas sem re-review
4. **Steering sempre atualizado** — Ao aprender algo novo sobre o projeto, atualizar steering
5. **Spec como documentacao** — Specs completadas servem como documentacao viva da feature

## Quality Gates

- [ ] Requirements aprovados pelo usuario?
- [ ] Design aprovado pelo usuario?
- [ ] Tasks decompostas com dependencias?
- [ ] Build verde apos implementacao?
- [ ] `validate-gap` sem lacunas?
- [ ] `validate-design` sem desvios?

---
_Protocol for integrating Avengers agent system with SDD workflow_
