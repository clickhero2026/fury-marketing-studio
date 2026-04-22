# Requirements — Signup Wizard

> Status: FAST-TRACK (aprovado pelo usuario "vai direto e faz")
> Owner: Iron Man (FRONTEND) + Thor (AuthContext patch)
> Data: 2026-04-22

## Contexto

Substituir o `Register.tsx` atual (single-form minimalista com 5 campos) por um wizard
multi-step visualmente impactante que colete TODOS os dados necessarios para popular
as tabelas `profiles`, `organizations`, `organization_members` e `companies` de uma
vez, melhorando a percepcao de qualidade do produto no primeiro contato.

## User Stories (EARS)

### US-1: Criar conta em etapas
- **Ubiquitous:** O sistema DEVE apresentar o cadastro dividido em 3 etapas progressivas
  (Conta → Organizacao → Finalizar) com barra de progresso animada.
- **Event-driven:** QUANDO o usuario avancar para a proxima etapa, o sistema DEVE
  validar apenas os campos da etapa corrente antes de permitir o avanco.
- **State-driven:** ENQUANTO o usuario estiver em etapas anteriores a 1, o botao
  "Voltar" DEVE permitir retornar sem perder dados ja preenchidos.

### US-2: Medidor de forca de senha
- **Event-driven:** QUANDO o usuario digitar a senha, o sistema DEVE exibir um medidor
  visual (4 barras) com as categorias: Fraca / Razoavel / Boa / Forte.

### US-3: Slug auto-gerado editavel
- **Event-driven:** QUANDO o usuario digitar o nome da organizacao, o sistema DEVE
  gerar automaticamente um slug em tempo real e exibir preview `clickhero.app/<slug>`.
- **Optional:** O usuario PODE editar o slug manualmente. O campo deve validar pattern
  `^[a-z0-9][a-z0-9-]*[a-z0-9]$` com 3-50 chars.

### US-4: Selecao de plano
- **Ubiquitous:** O sistema DEVE apresentar 3 cards (Free, Pro, Enterprise) com
  features/preco e permitir selecao. Plano padrao: Free.

### US-5: Avatar gerado com iniciais
- **Ubiquitous:** O sistema DEVE exibir um avatar circular gerado com as iniciais do
  `displayName` sobre um gradient colorido.
- **Event-driven:** QUANDO o usuario clicar em uma das 6 cores disponiveis, o sistema
  DEVE atualizar o gradient do avatar e persistir a escolha como `avatar_url` no
  formato `gradient:<seed>`.

### US-6: Revisao final
- **Ubiquitous:** A etapa 3 DEVE exibir um card de revisao com todos os dados do
  cadastro (nome, email, organizacao, slug, plano, avatar) antes da confirmacao.

### US-7: Criacao atomica
- **Event-driven:** QUANDO o usuario confirmar o cadastro, o sistema DEVE:
  1. Criar o usuario em `auth.users` (trigger cria `profiles`)
  2. Invocar Edge Function `create-organization` (cria org + company + membership)
  3. Se plan != 'free', atualizar `organizations.plan` via update direto
  4. Persistir `avatar_url` em `profiles`
  5. Redirecionar para `/login` com toast de sucesso

## Non-Goals

- Upload real de avatar (storage bucket) — usa gradient com iniciais
- Aceitar invite via token — fica para spec separada
- Integracao com OAuth (Google/Meta) — ja existe fluxo separado `OAuthComplete`
- Validacao de slug disponivel antes do submit — Edge Function ja trata com 409

## Metricas de Sucesso

- Build verde
- Todos os campos obrigatorios das tabelas core populados no primeiro cadastro
- Feedback visual em TODAS as interacoes (loading, hover, focus, validacao)
