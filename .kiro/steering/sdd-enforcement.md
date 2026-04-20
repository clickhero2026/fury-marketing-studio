# SDD Enforcement — Arvore de Decisao Rapida

> Loaded automaticamente em toda sessao (steering). Consulte ANTES de qualquer Edit/Write
> em `supabase/functions/**` ou `supabase/migrations/**`.

## Decisao em 10 segundos

```
Vou criar/editar arquivo em...
|
+-- supabase/functions/<nova-funcao>/index.ts  => SDD OBRIGATORIO (hook bloqueia sem spec)
|
+-- supabase/migrations/*.sql                  => SDD OBRIGATORIO (hook bloqueia sem spec)
|
+-- supabase/functions/<funcao-ja-existe>/**   => LER .kiro/specs/<feature>/ primeiro
|
+-- src/pages/**, src/hooks/**, src/components/** (novos)
|     => Se e feature nova: SDD. Se e ajuste em feature ja existente: LER spec existente.
|
+-- Fix de 1-3 linhas / ajuste cosmetico       => Direto, sem spec
```

## Hook automatico

`.claude/hooks/sdd-gate.cjs` (registrado em `.claude/settings.json`):
- **Bloqueia** criacao de Edge Function nova sem spec correspondente
- **Bloqueia** nova migration sem spec correspondente
- **Avisa** ao editar arquivo protegido, listando a spec relevante
- **Bypass** (so para hotfix real):
  - `touch .kiro/.fast-track` — consumido em 1 uso, cria spec AS-BUILT depois
  - `SDD_BYPASS=1` no env

## Regra de ouro

> Se o usuario descrevesse essa mudanca em 1 frase para outro dev, e essa frase caberia
> em UMA TAREFA de spec existente -> leia a spec antes.
> Se ela INAUGURA uma tarefa nova -> spec nova antes de codar.

## Indice de specs ativas

Ver [implemented-features.md](./implemented-features.md) para mapa de features -> specs -> arquivos.

## Lembretes que a IA costuma ignorar

1. **Ler spec antes de editar Edge Function** — a decisao da contagem de campanhas ja
   pode estar em spec `meta-oauth-asset-picker` ou `meta-integration`. Nao reinventar.
2. **Atualizar tasks.md** ao concluir item — marcar `[x]` e commitar.
3. **Atualizar implemented-features.md** quando feature concluir — e o indice vivo.
4. **Criar spec AS-BUILT** apos fast-track — debito tecnico se nao fizer.
