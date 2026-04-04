# PROTOCOLO DE SEGURANCA J.A.R.V.I.S. — OBRIGATORIO EM TODA SESSAO

> **Codinome: J.A.R.V.I.S.** (Just A Rather Very Intelligent System)
> Este protocolo e INJETADO em CADA prompt de CADA agente do DevSquad ClickHero.
> Violar qualquer regra aqui e MOTIVO DE PARADA IMEDIATA.
> Projeto: **ClickHero** — Meta Ads Manager AI com Supabase + React + Vite

---

## LISTA DE ACOES PROIBIDAS (JAMAIS EXECUTE)

### 1. NUNCA DELETE TABELAS OU COLUNAS
```sql
-- PROIBIDO — JAMAIS execute estes comandos:
DROP TABLE ...
DROP SCHEMA ...
ALTER TABLE ... DROP COLUMN ...
TRUNCATE TABLE ...
DELETE FROM ... (sem WHERE extremamente especifico)

-- SE precisar "remover" algo:
ALTER TABLE old_table RENAME TO _deprecated_old_table;
ALTER TABLE x ADD COLUMN is_deleted BOOLEAN DEFAULT false;
```

**Tabelas CRITICAS do ClickHero (NUNCA TOQUE sem aprovacao):**
- `campaigns`, `campaign_metrics` — Dados de campanhas Meta Ads
- `ad_creatives`, `creative_metrics` — Criativos e performance
- `ai_insights` — Insights gerados pela IA
- `chat_history` — Historico de conversas com assistente IA
- `ad_platform_connections`, `meta_tokens` — Tokens e conexoes OAuth (PROTEGER API keys)
- `profiles`, `user_roles` — Autenticacao e permissoes

### 2. NUNCA DELETE CODIGO QUE FUNCIONA
```
PROIBIDO:
- Deletar arquivos existentes
- Remover funcoes/componentes/hooks "que parecem nao usados"
- Limpar imports "desnecessarios" em arquivo que voce nao criou
- Remover comentarios existentes
- Sobrescrever arquivo inteiro quando so precisa mudar 5 linhas

PERMITIDO:
- Adicionar codigo novo
- Modificar linhas especificas (com comentario explicando)
- Criar arquivos novos
- Se REALMENTE precisa deprecar algo: renomeie com _old_ ou _deprecated_
```

### 3. NUNCA MUDE AUTENTICACAO SEM APROVACAO EXPLICITA
```
PROIBIDO sem aprovacao do Nick Fury (ARCHITECT) + Hulk (GUARDIAN):
- Mudar metodo de autenticacao
- Alterar middleware de auth
- Modificar RLS policies existentes que FUNCIONAM
- Adicionar/remover providers de auth no Supabase
- Mudar configuracao de JWT/refresh tokens
- Desabilitar qualquer camada de seguranca

PERMITIDO:
- ADICIONAR RLS policy nova (sem alterar as existentes)
- Criar tabela nova COM RLS (seguindo padrao: user_id = auth.uid())
```

### 4. NUNCA EXECUTE MIGRATIONS DESTRUTIVAS
```
PROIBIDO:
- DROP em qualquer coisa (TABLE, INDEX, COLUMN, FUNCTION, TRIGGER, TYPE)
- ALTER TYPE ... RENAME (pode quebrar dados existentes)
- UPDATE em massa sem WHERE
- DELETE em massa sem WHERE
- TRUNCATE
- ALTER TABLE ... ALTER COLUMN TYPE (pode perder dados)

PERMITIDO:
- CREATE TABLE IF NOT EXISTS
- CREATE INDEX IF NOT EXISTS
- ALTER TABLE ADD COLUMN (com DEFAULT)
- CREATE OR REPLACE FUNCTION
- INSERT (dados novos)
- UPDATE com WHERE especifico
```

### 5. NUNCA MODIFIQUE package.json SEM NECESSIDADE
```
PROIBIDO:
- Remover dependencias existentes
- Mudar versao major de dependencias (react 18->19, etc.)
- Adicionar dependencias pesadas sem justificativa
- Alterar scripts que funcionam
- Mudar configuracao de build

PERMITIDO:
- Adicionar dependencia nova leve (com justificativa)
- Adicionar script novo (sem alterar os existentes)
```

### 6. NUNCA ALTERE CONFIGURACOES DE AMBIENTE
```
PROIBIDO:
- Modificar .env existente
- Alterar vite.config.ts sem necessidade
- Mudar tsconfig.json (pode quebrar tipos)
- Alterar configuracoes de CORS

PERMITIDO:
- Adicionar variavel de ambiente NOVA (prefixo VITE_ se frontend)
```

---

## MEDIDAS OBRIGATORIAS ANTES DE QUALQUER MUDANCA

### Pre-Flight Check
```bash
# Verificar build ANTES
npm run build 2>&1 | tail -5
```

### Post-Flight Check
```bash
# Build DEPOIS — se falhou e antes passava, DESFACA
npm run build 2>&1 | tail -5
```

### Quality Loop (OBRIGATORIO)
```
TODA tarefa que modifica codigo DEVE seguir o Quality Loop Protocol:
  1. PRE-FLIGHT   -> Ler arquivos, entender estado, planejar mudanca
  2. IMPLEMENTAR  -> Editar cirurgicamente, um arquivo por vez
  3. VERIFICAR    -> npm run build + reler TODAS as mudancas feitas
  4. RE-AVALIAR   -> Comparar com pedido original, analisar impacto
  5. DOCUMENTAR   -> Atualizar CLAUDE.md, informar usuario

Referencia completa: `.claude/CLAUDE.md` secao "Quality Loop Protocol"

REGRA: Nao declare CONCLUIDO ate que o build passe
        e voce tenha RELIDO suas proprias mudancas.
```

---

## REGRA DE OURO: MODO SOMENTE-ADITIVO

> **SE ESTA EM DUVIDA, ADICIONE. NUNCA REMOVA.**

```
Precisa mudar auth?
  -> NAO mude o existente. ADICIONE nova camada ao lado.

Precisa mudar RLS?
  -> NAO altere a policy existente. CRIE uma nova com nome diferente.

Precisa mudar schema?
  -> NAO altere colunas existentes. ADICIONE colunas novas.

Precisa mudar componente?
  -> NAO sobrescreva o arquivo inteiro. Use Edit cirurgico.
```

---

## ESCALA DE RISCO

```
RISCO BAIXO — Pode fazer direto:
  - Criar arquivo/componente/hook/tabela novo
  - Adicionar coluna nova (com DEFAULT)
  - Criar indice novo

RISCO MEDIO — Fazer com pre/post flight:
  - Modificar componente/hook existente
  - Adicionar RLS policy nova
  - Modificar Edge Function existente

RISCO ALTO — REQUER APROVACAO:
  - Qualquer mudanca em auth/login
  - Alterar RLS policy existente
  - Alterar schema de tabela existente

PROIBIDO — NUNCA FACA:
  - DROP qualquer coisa
  - DELETE em massa
  - Mudar metodo de autenticacao
  - Remover dependencias
  - Sobrescrever arquivo inteiro
  - Desabilitar RLS
```

---

## SE VOCE PERCEBER QUE QUEBROU ALGO

**PARE IMEDIATAMENTE:**

1. NAO TENTE CONSERTAR SOZINHO
2. Se tem git: `git stash && git checkout .`
3. Reporte com: o que fez, o que quebrou, quais arquivos, se build passa

---

## CHECKLIST MENTAL (Antes de CADA Acao)

```
1. Estou ADICIONANDO ou REMOVENDO?
   -> Removendo? PARE e reconsidere

2. Se eu errar, o que acontece?
   -> Dados perdidos ou auth quebra? PARE

3. Eu PRECISO fazer isso para resolver a tarefa?
   -> E "melhoria" adicional? NAO FACA

4. Se der errado, consigo desfazer?
   -> NAO? PARE e pense em outra abordagem

5. Ja RELI minhas proprias mudancas? (Quality Loop Fase 3)
   -> NAO? Releia ANTES de declarar concluido

6. O build passa?
   -> NAO? Corrigir ANTES de prosseguir
```
