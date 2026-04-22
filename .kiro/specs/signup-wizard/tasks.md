# Tasks — Signup Wizard

> Status: FAST-TRACK em execucao

## Implementacao

- [x] T1 — Atualizar `src/types/auth.ts` com novos campos em `SignUpData` (slug, plan, avatarSeed)
- [x] T2 — Patch em `AuthContext.signUp` para aceitar plan e avatarSeed; update pos-criacao
- [x] T3 — Reescrever `src/pages/Register.tsx` como wizard 3-step com:
  - [x] Schema Zod consolidado + react-hook-form
  - [x] Header com stepper + Progress bar
  - [x] Step 1: Conta + password strength meter
  - [x] Step 2: Organizacao + slug auto-gerado + cards de plano
  - [x] Step 3: Avatar gradient + review card
  - [x] Botoes Voltar / Continuar / Criar conta
  - [x] Validacao por etapa via `form.trigger`
  - [x] Animacoes de transicao entre steps

## Validacao

- [x] V1 — `npm run build` verde (1m04s, 3644 modulos, sem erros)
- [ ] V2 — `npm run lint` (nao executado — nao bloqueante)
- [ ] V3 — Manual: abrir /register, navegar steps, testar validacoes
  (Usuario deve executar esta etapa no navegador — Hulk valida build, nao UI)

## Definition of Done

- [x] Spec (req + design + tasks) criada
- [x] Todas as tasks T* marcadas [x]
- [x] Build verde
- [ ] Steering `implemented-features.md` atualizado (opcional — feature isolada)
- [x] Resumo entregue ao usuario com links clicaveis
