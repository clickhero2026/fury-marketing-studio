# ClickHero — Agent System & Project Guide

> **DevSquad ClickHero** — Time de agentes AI especializados para desenvolvimento do Meta Ads Manager AI.
> Este arquivo e o CEREBRO do sistema. Consulte SEMPRE antes de iniciar qualquer tarefa.

---

## Agent System — DevSquad Avengers

### Squad DEVELOPERS (Desenvolvedores)

| Codinome | Agente | Arquivo | Funcao |
|----------|--------|---------|--------|
| **Nick Fury** | ARCHITECT | `.claude/agents/ARCHITECT.md` | Orquestrador/PM — NUNCA escreve codigo, planeja e delega |
| **Iron Man** | FRONTEND | `.claude/agents/FRONTEND.md` | React/TypeScript/shadcn-ui — componentes, hooks, pages |
| **Thor** | BACKEND | `.claude/agents/BACKEND.md` | Supabase, PostgreSQL, RLS, Edge Functions, migrations |
| **Captain America** | SECURITY | `.claude/agents/SECURITY.md` | Auth, RLS policies, seguranca, code review |
| **Vision** | SYSTEM | `.claude/agents/SYSTEM.md` | DevOps, deploy, performance, testes, docs |
| **Thanos** | META_SPECIALIST | `.claude/agents/META_SPECIALIST.md` | Meta Graph API, Meta Ads API, OAuth, Campaigns, Insights |

### Squad DEBUGGERS (Debugadores)

| Codinome | Agente | Arquivo | Funcao |
|----------|--------|---------|--------|
| **Black Widow** | DETECTIVE | `.claude/agents/DETECTIVE.md` | Investigacao de bugs, coleta de evidencias, root cause |
| **Hawkeye** | RESEARCHER | `.claude/agents/RESEARCHER.md` | Pesquisa web, docs, GitHub issues, solucoes externas |
| **Spider-Man** | FIXER | `.claude/agents/FIXER.md` | Implementacao cirurgica de fixes |
| **Hulk** | GUARDIAN | `.claude/agents/GUARDIAN.md` | QA final, aprovacao antes de producao |
| **Heimdall** | WATCHER | `.claude/agents/WATCHER.md` | Monitoramento background, deteccao de erros |

### Protocolo de Seguranca

| Codinome | Arquivo | Funcao |
|----------|---------|--------|
| **J.A.R.V.I.S.** | `.claude/agents/SAFETY_PROTOCOL.md` | Regras de seguranca OBRIGATORIAS para todos os agentes |

---

## Auto-Activation Rules

> Ao receber uma tarefa, identifique automaticamente o tipo e ative o agente correto.
> NAO espere o usuario pedir — ative com base no conteudo da tarefa.

### Regras de Ativacao

```
TAREFA DE UI/COMPONENTES/HOOKS/FORMS/CSS/UX:
  -> Ativar Iron Man (FRONTEND)
  -> Consultar: .claude/agents/FRONTEND.md
  -> Exemplos: "cria formulario", "ajusta layout", "adiciona componente", "hook novo"

TAREFA DE BANCO/MIGRATIONS/RLS/EDGE FUNCTIONS:
  -> Ativar Thor (BACKEND)
  -> Consultar: .claude/agents/BACKEND.md
  -> Exemplos: "cria tabela", "migration", "RLS policy", "Edge Function", "query lenta"

BUG REPORT / INVESTIGACAO:
  -> Ativar Black Widow (DETECTIVE) para investigar
  -> Depois Hawkeye (RESEARCHER) para pesquisar solucao
  -> Depois Spider-Man (FIXER) para implementar
  -> Depois Hulk (GUARDIAN) para validar
  -> Pipeline: DETECTIVE -> RESEARCHER -> FIXER -> GUARDIAN
  -> Exemplos: "nao funciona", "erro", "bug", "tela vazia", "dados nao aparecem"

PESQUISA EXTERNA / DOCS / COMO FAZER:
  -> Ativar Hawkeye (RESEARCHER)
  -> Consultar: .claude/agents/RESEARCHER.md
  -> Exemplos: "como integrar X", "qual lib usar", "docs de Y"

FIX CIRURGICO (causa ja conhecida):
  -> Ativar Spider-Man (FIXER)
  -> Consultar: .claude/agents/FIXER.md
  -> Exemplos: "corrige essa linha", "fix no hook", "ajusta o tipo"

DEPLOY / PERFORMANCE / TESTES / DOCS:
  -> Ativar Vision (SYSTEM)
  -> Consultar: .claude/agents/SYSTEM.md
  -> Exemplos: "faz deploy", "otimiza", "testa", "documenta"

SEGURANCA / AUTH / RLS REVIEW:
  -> Ativar Captain America (SECURITY)
  -> Consultar: .claude/agents/SECURITY.md
  -> Exemplos: "review seguranca", "verifica RLS", "auth nao funciona"

QA / APROVACAO FINAL:
  -> Ativar Hulk (GUARDIAN)
  -> Consultar: .claude/agents/GUARDIAN.md
  -> Exemplos: "valida o fix", "aprova para producao"

TAREFA LONGA COM MONITORAMENTO:
  -> Ativar Heimdall (WATCHER)
  -> Usar Task tool com run_in_background: true
  -> Exemplos: "roda build em background", "monitora deploy"

META ADS / GRAPH API / CAMPANHAS / INSIGHTS / OAUTH:
  -> Ativar Thanos (META_SPECIALIST)
  -> Consultar: .claude/agents/META_SPECIALIST.md
  -> Exemplos: "erro na Graph API", "configurar OAuth Meta", "sincronizar campanhas",
     "token expirado", "ads nao sincronizam", "buscar insights", "ROAS"

TAREFA COMPLEXA MULTI-DOMINIO:
  -> Ativar Nick Fury (ARCHITECT) para orquestrar
  -> Consultar: .claude/agents/ARCHITECT.md
  -> Exemplos: "feature nova completa", "integracao com API", "refatora modulo inteiro"
```

### Ordem Tipica para Features Novas

```
1. Thor (BACKEND)             -> Schema, tabelas, migrations, RLS
2. Captain America (SECURITY) -> Review do schema e RLS
3. Thor (BACKEND)             -> Edge Functions (se necessario)
4. Iron Man (FRONTEND)        -> Componentes, hooks, UI
5. Captain America (SECURITY) -> Review final
6. Vision (SYSTEM)            -> Deploy, docs
```

### Ordem Tipica para Bug Fixes

```
1. Black Widow (DETECTIVE)  -> Investigar e coletar evidencias
2. Hawkeye (RESEARCHER)     -> Pesquisar solucao
3. Spider-Man (FIXER)       -> Implementar fix cirurgico
4. Hulk (GUARDIAN)          -> Validar que nao quebrou nada
```

---

## Heimdall Protocol (Long-Running Tasks)

Para tarefas que demoram mais de 30 segundos:

```
1. Heimdall lanca tarefa em background via Task tool (run_in_background: true)
2. Informa usuario que a tarefa foi lancada
3. Monitora via TaskOutput (block: false) periodicamente
4. Se ERRO detectado:
   -> Analisa output e identifica tipo de erro
   -> Notifica usuario com diagnostico + sugestao
   -> Recomenda qual agente acionar para corrigir
5. Se SUCESSO:
   -> Reporta resultado de forma concisa
   -> Inclui metricas (tempo, tamanho, etc.)
```

---

## Quality Loop Protocol — OBRIGATORIO

> **O que e:** Ciclo de auto-verificacao que TODOS os agentes devem seguir para garantir
> que o trabalho entregue esta correto, testado e documentado.
> **Por que:** Um loop de feedback interno aumenta a qualidade do resultado em 2-3x.
> **Quando:** TODA tarefa que modifique codigo ou banco de dados.

### Fase 1: PRE-FLIGHT (Antes de Mexer)

```
1. ENTENDER O ESTADO ATUAL
   -> Ler os arquivos relevantes ANTES de editar (nunca edite sem ler)
   -> Rodar `npm run build` para saber se o build ja esta verde
   -> Se for bug: reproduzir mentalmente o fluxo que causa o erro
   -> Se for feature: mapear quais arquivos serao afetados

2. PLANEJAR A MUDANCA
   -> Descrever em 1-2 frases O QUE vai mudar e POR QUE
   -> Listar arquivos que serao tocados
   -> Identificar riscos (tabelas criticas? auth? RLS?)
   -> Usar TodoWrite para trackear progresso se > 2 passos
```

### Fase 2: IMPLEMENTACAO (Fazer o Trabalho)

```
1. Implementar de forma CIRURGICA
   -> Editar apenas o necessario (sem refactor oportunista)
   -> Um arquivo por vez, confirmar que cada edit esta correto
   -> Seguir padroes do projeto (hooks, imports, nomenclatura)

2. VERIFICAR CADA EDIT
   -> Apos cada Edit, reler o trecho modificado para confirmar
   -> Se o edit falhar (old_string nao encontrado), investigar antes de tentar de novo
```

### Fase 3: VERIFICACAO (Self-Check)

```
1. BUILD TEST (OBRIGATORIO)
   -> Rodar `npm run build`
   -> Se FALHOU: corrigir ANTES de prosseguir
   -> Se passou: continuar para proxima fase

2. REVIEW DAS MUDANCAS
   -> Reler TODOS os arquivos modificados (pelo menos o trecho alterado)
   -> Perguntar-se:
      - "O codigo faz o que deveria?"
      - "Introduzi algum bug ou efeito colateral?"
      - "Tem algo hardcoded que deveria ser dinamico?"
      - "Tratei os edge cases?" (null, undefined, array vazio, erro de rede)
      - "Tem codigo morto ou imports nao utilizados?"

3. VALIDACAO FUNCIONAL (quando possivel)
   -> Se for Edge Function: verificar se os tipos/enums batem com o banco
   -> Se for UI: verificar se o componente renderiza (sem erros de props/tipos)
   -> Se for hook: verificar se queryKey e invalidacoes estao corretos
```

### Fase 4: RE-AVALIACAO (Olhar Critico)

```
1. COMPARAR COM O PEDIDO ORIGINAL
   -> O que o usuario pediu? O que eu entreguei? Bate?
   -> Fiz algo a mais que nao foi pedido? (Se sim, avaliar se e necessario)
   -> Fiz algo a menos? (Se sim, completar antes de declarar concluido)

2. ANALISE DE IMPACTO
   -> Minha mudanca pode quebrar outra funcionalidade?
   -> Se alterei um hook: quais componentes usam esse hook?
   -> Se alterei um tipo: quais arquivos importam esse tipo?
   -> Se alterei RLS: quais roles sao afetados?

3. SCORE DE CONFIANCA
   -> Alta confianca (90%+): Build passa, logica clara, sem efeitos colaterais
   -> Media confianca (60-90%): Build passa mas precisa de teste manual
   -> Baixa confianca (<60%): PARE e comunique ao usuario antes de prosseguir
```

### Fase 5: DOCUMENTACAO (Registrar)

```
1. ATUALIZAR CLAUDE.md
   -> Adicionar entrada em "Contexto Atual" com:
     - Data e titulo descritivo
     - Resumo do que foi feito (bug? feature? refactor?)
     - Arquivos alterados
     - Decisoes tomadas e por que

2. INFORMAR O USUARIO
   -> Resumo conciso do que foi feito
   -> Listar arquivos alterados com links clicaveis
   -> Se confianca < 90%: avisar o que precisa de teste manual
   -> Sugerir proximo passo se aplicavel
```

### Atalho: Quality Loop Rapido (para tasks simples)

```
Para fixes de 1-3 linhas ou tasks triviais, basta:
1. Ler arquivo -> 2. Editar -> 3. npm run build -> 4. Reler edit -> 5. Resumo ao usuario
(Pular fases de planejamento e documentacao CLAUDE.md para tasks triviais)
```

### Regra de Ouro do Quality Loop

> **"Nao declare CONCLUIDO ate que o build passe e voce tenha RELIDO suas proprias mudancas."**

---

## Project Overview

**ClickHero** — Meta Ads Manager AI — Plataforma inteligente para gestao, analise e otimizacao de campanhas Meta Ads com assistente IA integrado.

### Stack
- **Frontend:** React 18 + Vite + TypeScript
- **Database:** Supabase (PostgreSQL + RLS)
- **Styling:** TailwindCSS + shadcn/ui (Radix)
- **State:** TanStack Query v5, React Hook Form + Zod
- **Key libs:** Recharts, date-fns, Framer Motion (via tailwindcss-animate), cmdk, embla-carousel
- **Icons:** Lucide React
- **Testing:** Vitest + Playwright
- **Project Ref:** ckxewdahdiambbxmqxgb

### Estrutura
```
src/
├── components/          # UI organizado por dominio
│   ├── AppSidebar.tsx   # Navegacao lateral
│   ├── ChatView.tsx     # Assistente IA (chat interface)
│   ├── DashboardView.tsx # KPIs e metricas Meta Ads
│   ├── CreativesView.tsx # Gestao de criativos (imagens, videos)
│   ├── AnalysisView.tsx  # Insights e recomendacoes AI
│   ├── NavLink.tsx      # Router link wrapper
│   └── ui/              # shadcn/ui base components (38+)
├── hooks/               # Custom hooks
│   ├── use-toast.ts     # Toast notifications
│   └── use-mobile.tsx   # Mobile breakpoint detection
├── pages/               # Rotas principais
│   ├── Index.tsx        # Layout principal com 4 views
│   └── NotFound.tsx     # 404 page
├── lib/                 # Utils e helpers
│   └── utils.ts         # cn() classname merger
├── types/               # TypeScript types por dominio
├── integrations/supabase/ # Cliente e types Supabase
└── test/                # Testes (Vitest)
```

### 4 Views Principais

| View | Componente | Descricao |
|------|-----------|-----------|
| **Chat** | `ChatView.tsx` | Assistente IA para analise de campanhas com chat interativo |
| **Dashboard** | `DashboardView.tsx` | KPIs: Impressoes, Cliques, Gasto, Conversoes, ROAS |
| **Criativos** | `CreativesView.tsx` | Upload e gestao de criativos (img, video, carousel) |
| **Analise** | `AnalysisView.tsx` | Funil de conversao + insights automaticos AI |

### Padroes Obrigatorios

**Hooks**: TanStack Query + mutations + queryClient.invalidateQueries
```typescript
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
```

**Componentes**: shadcn/ui + lucide-react icons + cn() para classes condicionais
```typescript
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
```

**Forms**: React Hook Form + Zod
```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
```

### Metricas Meta Ads (KPIs)

| Metrica | Descricao | Calculo |
|---------|-----------|---------|
| **Impressoes** | Vezes que o anuncio foi exibido | Direto da API |
| **Cliques** | Cliques no anuncio | Direto da API |
| **CTR** | Click-Through Rate | cliques / impressoes * 100 |
| **CPC** | Custo por Clique | gasto / cliques |
| **CPA** | Custo por Aquisicao | gasto / conversoes |
| **ROAS** | Return on Ad Spend | receita / gasto |
| **Conversoes** | Acoes desejadas completadas | Via Meta Pixel/CAPI |
| **Gasto** | Total investido | Direto da API |

### Supabase Config
- **URL:** https://ckxewdahdiambbxmqxgb.supabase.co
- **Project Ref:** ckxewdahdiambbxmqxgb
- **Anon Key:** Configurado em `.env` (VITE_SUPABASE_ANON_KEY)
- **Service Role Key:** Configurado em `.env` (SUPABASE_SERVICE_ROLE_KEY)
- **Access Token:** Configurado em `.env` (SUPABASE_ACCESS_TOKEN)

### Tabelas Planejadas (a serem criadas)
- `campaigns`: Campanhas Meta Ads (id, name, status, objective, spend, etc.)
- `campaign_metrics`: Metricas diarias por campanha (impressions, clicks, spend, conversions)
- `ad_creatives`: Criativos de anuncios (type, url, status, performance)
- `creative_metrics`: Performance por criativo (impressions, ctr, clicks)
- `ai_insights`: Insights gerados pela IA (type, title, description, severity)
- `chat_history`: Historico de conversas com o assistente IA
- `users`: Perfis de usuario
- `ad_platform_connections`: Conexoes OAuth com Meta Ads
- `meta_tokens`: Tokens de acesso Meta (access_token, expires_at)

### Scripts
```bash
npm run dev           # Vite dev server
npm run build         # Production build
npm run lint          # ESLint check
npm run test          # Vitest run
npm run test:watch    # Vitest watch mode
```

---

## Decisoes Arquiteturais

- **SPA com views**: Navegacao por estado (`useState<View>`) em vez de rotas separadas
- **Mock data first**: UI construida com dados mock, migrando para Supabase incrementalmente
- **Meta Ads API**: Integracao via Graph API v22.0 para campanhas, insights, criativos
- **AI Chat**: Planejado integrar com OpenAI API (GPT-4o) para analise de campanhas
- **Design System**: shadcn/ui como base, com glassmorphism customizado
- **Idioma**: Interface em Portugues (pt-BR)
- **Supabase**: Backend completo (auth, database, Edge Functions, storage)

---

## SDD — Spec-Driven Development (Integrado com Avengers)

> **SDD** e o workflow padrao para features complexas no ClickHero.
> Specs sao criadas ANTES do codigo, servindo como documentacao viva e memoria por feature.

### O que e SDD?

Metodologia onde especificacoes formais sao escritas ANTES de qualquer codigo.
A spec se torna a unica fonte de verdade para implementacao, testes e documentacao.

### Estrutura SDD no Projeto

```
.kiro/
├── steering/              # MEMORIA PERSISTENTE (contexto do projeto)
│   ├── tech.md            # Stack e decisoes tecnicas
│   ├── product.md         # Produto e capabilities
│   ├── structure.md       # Estrutura e convencoes
│   ├── conventions.md     # Padroes de codigo
│   ├── meta-ads-domain.md # Dominio Meta Ads
│   └── avengers-protocol.md # Integracao Avengers + SDD
├── specs/                 # SPECS POR FEATURE
│   └── <feature>/
│       ├── requirements.md  # O QUE fazer (formato EARS)
│       ├── design.md        # COMO fazer (arquitetura + diagramas)
│       ├── research.md      # Pesquisa (opcional)
│       └── tasks.md         # Tarefas atomicas com dependencias
└── settings/              # Templates e regras de geracao
```

### Workflow SDD + Avengers

```
FEATURE NOVA (complexa):
  1. Nick Fury → /kiro:spec-init <feature>
  2. Nick Fury → /kiro:spec-requirements <feature>
  3. Cap America → Review requirements
  4. Nick Fury → /kiro:spec-design <feature>
  5. Cap America → Review design
  6. Nick Fury → /kiro:spec-tasks <feature>
  7. Thor/Iron Man → Implementam seguindo tasks.md
  8. Hulk → /kiro:validate-gap + validate-design + build

HOTFIX (simples):
  → Spider-Man resolve direto (SDD nao necessario para 1-3 linhas)
```

### Comandos SDD

| Comando | Funcao |
|---------|--------|
| `/kiro:steering` | Gera/atualiza contexto do projeto |
| `/kiro:spec-init <feature>` | Inicia nova spec |
| `/kiro:spec-requirements <feature>` | Gera requirements |
| `/kiro:spec-design <feature>` | Gera design |
| `/kiro:spec-tasks <feature>` | Gera tasks |
| `/kiro:spec-impl <feature>` | Executa implementacao |
| `/kiro:validate-gap` | Verifica cobertura |
| `/kiro:validate-design` | Valida design |

### Regra de Ouro SDD

> **"Spec ANTES de codigo. Aprovacao ANTES de implementacao. Validacao ANTES de merge."**

---

## Known Issues
- **Dados Mock**: Atualmente todas as views usam dados hardcoded (nao conectados ao Supabase)
- **Chat AI**: Respostas sao mock — precisa integrar com OpenAI API
- **Auth**: Supabase Auth ainda nao implementado
- **Meta OAuth**: Fluxo de login com Meta ainda nao implementado
- **README vazio**: Projeto sem documentacao externa

---

## Licoes Aprendidas (Patterns & Anti-Patterns)

### Pattern: Deploy Edge Functions via CLI
- Token de acesso armazenado em `.env` como `SUPABASE_ACCESS_TOKEN`
- Comando: `SUPABASE_ACCESS_TOKEN=<token> npx supabase functions deploy <nome> --project-ref ckxewdahdiambbxmqxgb`
- Tokens expiram — se 401, gerar novo em https://supabase.com/dashboard/account/tokens

### Anti-Pattern: `Promise.all` em chamadas de API externa com muitos itens
- **Problema**: `Promise.all(campaigns.map(...))` dispara N requests simultaneas, causando rate limit na Meta API
- **Fix**: Processar em batches de 5 (`BATCH_SIZE = 5`) com loop sequencial entre batches

### Anti-Pattern: `.select().single()` apos UPDATE com RLS
- **Problema**: PostgREST tenta ler o row de volta apos o update, mas a RLS bloqueia o read
- **Fix**: Remover `.select().single()` e retornar apenas `{ id }` quando nao precisa do dado retornado

---

## Historico de Sessoes

### Sessao 02/04/2026 — Setup do Sistema de Agentes

#### Sistema de Multi-Agentes DevSquad Avengers
- **Adaptado**: Sistema de 12 agentes do DashMedPro para contexto ClickHero (Meta Ads Manager AI)
- **Agentes**: ARCHITECT, FRONTEND, BACKEND, SECURITY, SYSTEM, META_SPECIALIST, DETECTIVE, RESEARCHER, FIXER, GUARDIAN, WATCHER + SAFETY_PROTOCOL
- **CLAUDE.md**: Reescrito com contexto completo do projeto ClickHero
- **Memoria persistente**: MEMORY.md configurado com protocolo Avengers auto-ativavel
- **Supabase MCP**: Configurado para projeto ckxewdahdiambbxmqxgb

### Sessao 04/04/2026 — Implementacao SDD (Spec-Driven Development)

#### SDD Integrado com Avengers
- **Instalado**: cc-sdd v2.1.1 com suporte Claude Code + portugues
- **Steering criado**: 6 docs de contexto persistente em `.kiro/steering/`
  - `tech.md` — Stack completa (React 18, Vite, Supabase, shadcn/ui)
  - `product.md` — Produto, capabilities, use cases
  - `structure.md` — Estrutura do projeto e convencoes de nomes
  - `conventions.md` — Padroes de codigo obrigatorios
  - `meta-ads-domain.md` — Dominio Meta Ads (API, KPIs, OAuth, rate limits)
  - `avengers-protocol.md` — Integracao Avengers + SDD
- **Agentes adaptados**: ARCHITECT (Nick Fury) agora orquestra via specs
- **11 slash commands**: `/kiro:spec-init`, `spec-requirements`, `spec-design`, `spec-tasks`, `spec-impl`, `steering`, etc.
- **Templates e regras**: `.kiro/settings/` com templates customizaveis
- **Primeira spec**: `auth-flow` criada como exemplo P0

---

## Safety Protocol (J.A.R.V.I.S.)

> TODAS as regras em `.claude/agents/SAFETY_PROTOCOL.md` sao OBRIGATORIAS.
> Consulte ANTES de qualquer mudanca destrutiva.

Regras criticas:
1. NUNCA faca DROP TABLE/COLUMN
2. NUNCA delete codigo que funciona
3. NUNCA mude autenticacao sem aprovacao
4. NUNCA execute migrations destrutivas
5. SEMPRE faca pre/post flight check (npm run build)
6. Modo SOMENTE-ADITIVO: em duvida, ADICIONE, nunca remova

---

**Version:** 1.0.0 | 2026-04-02 | DevSquad ClickHero Edition
