# AI-DLC and Spec-Driven Development

Kiro-style Spec Driven Development implementation on AI-DLC (AI Development Life Cycle)

## Project Context

### Paths
- Steering: `.kiro/steering/`
- Specs: `.kiro/specs/`

### Steering vs Specification

**Steering** (`.kiro/steering/`) - Guide AI with project-wide rules and context
**Specs** (`.kiro/specs/`) - Formalize development process for individual features

### Active Specifications
- Check `.kiro/specs/` for active specifications
- Use `/kiro:spec-status [feature-name]` to check progress

## Development Guidelines
- Think in English, generate responses in Portuguese. All Markdown content written to project files (e.g., requirements.md, design.md, tasks.md, research.md, validation reports) MUST be written in the target language configured for this specification (see spec.json.language).

## Minimal Workflow
- Phase 0 (optional): `/kiro:steering`, `/kiro:steering-custom`
- Phase 1 (Specification):
  - `/kiro:spec-init "description"`
  - `/kiro:spec-requirements {feature}`
  - `/kiro:validate-gap {feature}` (optional: for existing codebase)
  - `/kiro:spec-design {feature} [-y]`
  - `/kiro:validate-design {feature}` (optional: design review)
  - `/kiro:spec-tasks {feature} [-y]`
- Phase 2 (Implementation): `/kiro:spec-impl {feature} [tasks]`
  - `/kiro:validate-impl {feature}` (optional: after implementation)
- Progress check: `/kiro:spec-status {feature}` (use anytime)

## Development Rules
- 3-phase approval workflow: Requirements → Design → Tasks → Implementation
- Human review required each phase; use `-y` only for intentional fast-track
- Keep steering current and verify alignment with `/kiro:spec-status`
- Follow the user's instructions precisely, and within that scope act autonomously: gather the necessary context and complete the requested work end-to-end in this run, asking questions only when essential information is missing or the instructions are critically ambiguous.

## SDD ENFORCEMENT — REGRA OBRIGATORIA (NAO NEGOCIAVEL)

> O usuario decidiu: ESTE PROJETO E TODO CODADO POR IA.
> Sem SDD rigoroso, o codigo se torna ingovernavel quando passar de 50k linhas.
> SDD NAO E OPCIONAL — e parte do "definition of done" de qualquer feature.

### Quando SDD e OBRIGATORIO

| Tipo de tarefa | SDD obrigatorio? | Acao |
|---|---|---|
| Feature nova (qualquer tabela, Edge Function, hook, view) | **SIM** | Criar spec completa antes de codar |
| Refactor que toca > 3 arquivos | **SIM** | Criar spec antes |
| Mudanca de schema (CREATE/ALTER TABLE) | **SIM** | Spec + steering update |
| Nova Edge Function | **SIM** | Spec |
| Nova integracao externa (API, OAuth, etc.) | **SIM** | Spec |
| Bug fix de 1-3 linhas | NAO | Pode ir direto, mas atualizar steering se relevante |
| Ajuste de UI cosmetico (cores, padding, copy) | NAO | Direto |
| Hotfix critico de producao | NAO no momento | Criar spec retroativa "as-built" depois |

### Workflow OBRIGATORIO para feature nova

```
1. Criar pasta .kiro/specs/<feature>/
2. requirements.md (formato EARS) — O QUE fazer
3. PARAR e mostrar para o usuario aprovar (a menos que ele diga "vai direto")
4. design.md — COMO fazer (arquitetura, schema, components, trade-offs)
5. PARAR para aprovacao
6. tasks.md — passos atomicos com [ ] checkboxes
7. PARAR para aprovacao
8. Implementar marcando [x] conforme avanca
9. Atualizar .kiro/steering/implemented-features.md ao concluir
10. Hulk valida (build + types + funcional)
```

### Atalho FAST-TRACK (com aprovacao explicita do usuario)

Se o usuario disser "vai direto", "fast-track", "sem perguntar", ou "ja entendi, faz":
- Criar requirements + design + tasks SEQUENCIALMENTE sem pausar
- Implementar em seguida
- AINDA assim criar os 3 arquivos da spec — eles sao documentacao viva

### Spec Retroativa (As-Built)

Se feature foi implementada SEM spec (legado ou hotfix):
- Criar spec retroativa marcada como `> Status: AS-BUILT`
- Tasks ja vem como `[x]` concluidas
- Serve como documentacao para futuras mudancas

### Atualizacao do Steering

- TODA feature concluida deve atualizar `.kiro/steering/implemented-features.md`
- Adicionar tabelas novas, Edge Functions, RPCs, hooks, jobs cron
- E o "indice vivo" do projeto — IA futura le isso primeiro

### Definition of Done (DoD)

Uma feature so esta DONE quando:
- [ ] Spec existe em `.kiro/specs/<feature>/` (req + design + tasks)
- [ ] Tasks marcadas [x]
- [ ] Steering atualizado em `implemented-features.md`
- [ ] Build verde (`npm run build`)
- [ ] Hulk validou funcional
- [ ] Resumo entregue ao usuario com links clicaveis

### Penalidade por pular SDD

Se o agente pular SDD em feature que exige (sem fast-track explicito), o usuario vai cobrar.
A obrigacao e do agente, NAO do usuario lembrar.

## Steering Configuration
- Load entire `.kiro/steering/` as project memory
- Default files: `product.md`, `tech.md`, `structure.md`
- Custom files are supported (managed via `/kiro:steering-custom`)
