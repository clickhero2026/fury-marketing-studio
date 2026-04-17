# Requirements: Subida Automatica de Campanhas

> **Status:** APPROVED (fast-track)
> **Criado:** 2026-04-13
> **Owner:** Thor + Iron Man + Thanos + Captain America

## Introducao

Transforma o ClickHero de ferramenta de auditoria em plataforma de gestao ativa. Permite criar e publicar campanhas Meta Ads direto da interface, com compliance gate nativo antes do envio.

## Adaptacoes do Roadmap

- Meta Ads API v20 → v22.0 (ja usado)
- BullMQ → Edge Function `campaign-publish` + status transitions em tabela (mesmo padrao)
- Zod → Zod via `npm:zod@3.23.8` no Deno
- Compliance gate → chamada INLINE de `analyzeCopy` + `analyzeImage` (mesmo codigo do compliance-scan)
- Real-time UI → React Query `refetchInterval: 2000` durante `publishing`

## Requirements

### REQ-1: Criacao em 3 niveis (Campanha → Ad Set → Ad)

**Objetivo:** Como gestor, quero criar campanha completa com os 3 niveis obrigatorios da Meta.

#### Criterios de Aceite
1. **Nivel Campanha**: nome, objetivo (OUTCOME_SALES/OUTCOME_LEADS/OUTCOME_AWARENESS/OUTCOME_TRAFFIC/OUTCOME_ENGAGEMENT), status inicial (ACTIVE | PAUSED), buying_type (AUCTION), special_ad_categories (opcional), start_time, end_time
2. **Nivel Ad Set**: campaign_id (linkado), nome, daily_budget OR lifetime_budget, targeting JSON (geo_locations, age_min/max, interests, custom_audiences), billing_event (IMPRESSIONS | LINK_CLICKS), optimization_goal, placements, start_time
3. **Nivel Ad**: adset_id (linkado), nome, creative (imagem/video URL + headline + body + CTA + link_url), status inicial, tracking_specs (pixel)
4. The UI shall ter wizard 3 steps com navegacao back/next + validacao progressiva
5. Drafts salvos em `campaign_drafts` pra permitir sair e voltar

### REQ-2: Validacao Zod

**Objetivo:** Como sistema, quero validar dados antes de enviar a Meta API pra evitar erros 4xx.

#### Criterios de Aceite
1. Schema Zod completo pros 3 niveis seguindo limites Meta:
   - Campaign name: 1-250 chars
   - Ad name: 1-400 chars
   - Headline: 1-40 chars (primary text: 1-125 chars, description: 1-27 chars)
   - Image URL: valid URL + formato .jpg/.png/.webp
   - Daily budget: min R$ 1 (ou equivalente na currency da conta)
   - Targeting age: 13-65
2. Retorno de erros de validacao formatados em pt-BR amigaveis
3. Validacao client-side via `zod-resolver` + React Hook Form
4. Validacao server-side (defense in depth) no Edge Function

### REQ-3: Compliance Gate (pre-publicacao)

**Objetivo:** Como sistema, quero bloquear publicacao de anuncios que violariam as regras de compliance.

#### Criterios de Aceite
1. Antes de enviar a Meta, the system shall rodar analise de compliance INLINE:
   - `analyzeCopy` no headline + body + CTA
   - `analyzeImage` na imagem do criativo (se houver)
2. Se `final_score < company.takedown_threshold`: the system shall BLOQUEAR publicacao e retornar violacoes ao usuario
3. Se aprovado: criar entry em `compliance_scores` (auditoria) e prosseguir
4. The UI shall mostrar score + violacoes no modal de confirmacao antes de publicar
5. O usuario pode ignorar o bloqueio apenas se score >= 40 (nunca abaixo — protecao Meta)

### REQ-4: Publicacao assincrona em 3 passos + Rollback

**Objetivo:** Como sistema, quero criar os 3 niveis na Meta API sequencialmente e fazer rollback se qualquer um falhar.

#### Criterios de Aceite
1. Edge Function `campaign-publish` shall criar em sequencia:
   - POST `/act_{ad_account}/campaigns` → retorna campaign_id
   - POST `/act_{ad_account}/adsets` com campaign_id → retorna adset_id
   - POST `/act_{ad_account}/adcreatives` → retorna creative_id
   - POST `/act_{ad_account}/ads` com adset_id + creative_id → retorna ad_id
2. Log de cada step em `campaign_publication_steps` com `step_name`, `external_id`, `status`, `error`
3. Se QUALQUER step falhar:
   - Rollback: DELETE em ordem inversa dos IDs ja criados na Meta
   - Mark publication como `status='failed'` com `error_stage` e `error_message`
4. Retry: steps individuais tentam 2x com backoff (1s, 3s) em erro 5xx
5. Timeout total: 90s (dentro do limite do Edge Function)

### REQ-5: Status em tempo real

**Objetivo:** Como gestor, quero ver o progresso da publicacao ao vivo.

#### Criterios de Aceite
1. Tabela `campaign_publications` com status: `draft` | `validating` | `compliance_check` | `publishing` | `live` | `failed`
2. The UI shall poll via React Query `refetchInterval: 2000` enquanto status nao for `live`/`failed`
3. Progress indicator: step atual + IDs criados
4. Ao publicar: toast de sucesso + link direto pra Meta Ads Manager
5. Ao falhar: toast de erro + detalhes do step que falhou

### REQ-6: Historico de publicacoes

**Objetivo:** Como gestor, quero ver todas as campanhas ja publicadas via plataforma.

#### Criterios de Aceite
1. Nova aba "Publicacoes" ou card na view Campanhas
2. Lista de `campaign_publications` com: nome, status, data, error (se falhou), link Meta
3. Filtros: all | live | failed
4. Botao "Tentar Novamente" para failed (cria nova publication com mesmo draft)

## Non-Functional Requirements

- **Seguranca**: ANTHROPIC_API_KEY ja no Vault (reuso). Meta token via `decrypt_meta_token` existente
- **Idempotencia**: cada draft gera apenas 1 publication ativa por vez (check de status=publishing previne duplicata)
- **Rollback robusto**: mesmo se DELETE falhar, `campaign_publication_steps` registra o que ficou orfao pra cleanup manual
- **RLS**: todas tabelas filtradas por company_id
- **Validacao dupla**: client (UX rapida) + server (seguranca)
