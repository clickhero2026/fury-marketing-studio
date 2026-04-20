# SDD Enforcement Automation — Requirements

> Status: AS-BUILT (2026-04-20)
> Language: pt-BR

## Problema

IA recorrentemente esquecia decisoes ja tomadas e reimplementava features sem
consultar specs existentes. CLAUDE.md e MEMORY.md tinham regras de SDD mas eram
ignoradas sob pressao de fix rapido.

## Objetivo

Tornar SDD enforcement automatico via hook `PreToolUse` que bloqueia operacoes
sensiveis sem spec correspondente.

## Requisitos (EARS)

### REQ-1 — Hook PreToolUse bloqueante
**Quando** a IA tentar criar (Write) novo arquivo em:
- `supabase/functions/<nova-funcao>/index.ts`
- `supabase/migrations/*.sql`

**o sistema deve** bloquear a criacao via exit code 2 + stderr instrutivo,
a menos que exista spec em `.kiro/specs/` cujo nome coincida com fragmento do caminho.

### REQ-2 — Edits nao bloqueiam, apenas avisam
**Quando** a IA editar (Edit) arquivo ja existente em path protegido,
**o sistema deve** apenas imprimir aviso listando spec relevante (se houver),
sem bloquear.

### REQ-3 — Bypass consumivel
**Quando** existir arquivo sentinela `.kiro/.fast-track`,
**o sistema deve** permitir a operacao UMA vez e deletar o sentinela.
Usuario/IA deve criar spec AS-BUILT apos o fato.

### REQ-4 — Bypass via env
**Quando** `SDD_BYPASS=1` estiver setado,
**o sistema deve** permitir todas as operacoes protegidas na sessao.

### REQ-5 — Steering visivel
**Quando** a IA iniciar sessao,
**o sistema deve** auto-carregar `.kiro/steering/sdd-enforcement.md` com
arvore de decisao curta.

## Nao-requisitos

- Nao audita Git history (confianca na spec presente no filesystem)
- Nao envia telemetria externa
- Nao funciona em `.claude/hooks/` outros projetos — e per-project
