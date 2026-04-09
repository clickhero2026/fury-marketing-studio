# Design: Meta Integration (OAuth + Asset Management)

> **Status:** AS-BUILT — feature em producao
> **Idioma:** pt-BR

## Overview

**Purpose:** Conectar contas Meta Ads ao ClickHero via OAuth 2.0 com tokens criptografados, permitindo sincronizacao multi-tenant de campanhas, criativos e metricas.

**Users:** Gestores de trafego que gerenciam campanhas Meta para multiplas empresas.

**Impact:** Habilita o pilar central do ClickHero — sem essa integracao nada de Meta funciona.

### Goals
- OAuth 2.0 popup-based (sem redirect, sem perder contexto)
- Long-lived tokens (60 dias) criptografados via pgcrypto
- Selecao granular de ad accounts e BMs por empresa
- Status visual (conectado/expirando/expirado)
- Disconnect com revogacao na Meta

### Non-Goals
- Refresh automatico de token (Meta nao suporta refresh tokens)
- Login social Meta (apenas conexao de ad accounts)
- Multi-conta Meta por empresa (1 integration/company/platform)

## Architecture

```
[React Frontend]              [Edge Functions]            [Supabase DB]              [Meta Graph API]
       |                              |                          |                          |
       | 1. clica Conectar            |                          |                          |
       |----------------------------->|                          |                          |
       |    meta-oauth-start          | 2. INSERT oauth_sessions |                          |
       |                              |------------------------->|                          |
       | 3. abre popup com URL        |                          |                          |
       |----------------------------------------------------------------------------------->|
       |                              |                          |                          |
       |                              |                          |   4. user aprova         |
       |                              |   5. callback?code=...   |                          |
       |                              |<------------------------------------------------------|
       |                              | 6. exchange code->token  |                          |
       |                              |----------------------------------------------------->|
       |                              | 7. encrypt + upsert      |                          |
       |                              |------------------------->|                          |
       | 8. postMessage success       |                          |                          |
       |<-----------------------------|                          |                          |
       | 9. invalidate queries        |                          |                          |
```

## Database Schema

### `integrations`
- `id` uuid PK
- `company_id` uuid FK -> companies (RLS)
- `platform` text ('meta')
- `access_token` text — **encrypted via pgcrypto**
- `account_id`, `account_name`, `account_status` — primeira ad account
- `business_id`, `business_name` — primeiro BM
- `facebook_user_id`, `facebook_user_name` — usuario Meta
- `connected_by_user_id` uuid FK -> auth.users
- `token_expires_at` timestamptz
- `status` text ('active'/'expiring_soon'/'expired')
- `last_sync` timestamptz
- UNIQUE `(company_id, platform)`

### `meta_ad_accounts`
- `id` uuid PK
- `company_id` uuid FK
- `account_id` text (com prefixo `act_`)
- `account_name`, `currency`, `account_status`
- `is_active` boolean — apenas selecionadas

### `meta_pages`
- `id` uuid PK
- `company_id` uuid FK
- `page_id`, `page_name`, `category`
- `is_active` boolean

### `oauth_sessions`
- `id` text PK (state token)
- `user_id` uuid FK
- `access_token` text (placeholder ou cache temporario)
- `accounts` jsonb (cache de ad accounts apos OAuth)
- `expires_at` timestamptz (10min para state, 30min para selection cache)

### Functions
- `encrypt_meta_token(token text) RETURNS text` — SECURITY DEFINER, search_path=public,extensions
- `decrypt_meta_token(encrypted_token text) RETURNS text` — idem
- `current_user_company_id()` — usado por todas as RLS

## Components

### Edge Functions (Deno)
| Function | Responsabilidade |
|----------|------------------|
| `meta-oauth-start` | Gera state, INSERT oauth_sessions, retorna URL autorizacao Meta |
| `meta-oauth-callback` | Recebe code, troca por token, encrypt, upsert integration, postMessage popup |
| `meta-oauth-disconnect` | Decrypt token, DELETE /me/permissions, DELETE integration |
| `meta-list-assets` | Lista ad accounts + BMs (cache em oauth_sessions ou Graph API) |
| `meta-save-assets` | Replace-all em meta_ad_accounts + meta_pages |

### Frontend
| Arquivo | Responsabilidade |
|---------|------------------|
| `src/hooks/use-meta-connect.ts` | useQuery integration + mutations connect/disconnect/sync + popup + postMessage listener |
| `src/hooks/use-meta-assets.ts` | useQuery list-assets + mutation save-assets |
| `src/components/meta/MetaAccountSelector.tsx` | UI checkbox accounts/pages |
| `src/pages/Integrations.tsx` | Card status + botoes connect/disconnect/sync/manage |

## Security

1. **Tokens nunca no frontend:** todas as chamadas Meta Graph API passam por Edge Functions
2. **pgcrypto + Vault:** chave de criptografia em supabase_vault, nao em env
3. **State anti-CSRF:** UUID gerado por chamada, expira em 10min, one-time-use (DELETE apos validar)
4. **RLS multi-tenant:** todas as queries filtradas por `company_id = current_user_company_id()`
5. **SECURITY DEFINER com search_path explicito:** evita injection de schema

## Trade-offs

- **Popup vs redirect:** Popup escolhido para preservar estado React (carrinho de selecao, etc.). Custo: usuario precisa permitir popups.
- **Long-lived 60 dias vs refresh:** Meta nao oferece refresh tokens. Solucao: pg_cron job verifica `token_expires_at` a cada 12h e marca como `expiring_soon`/`expired`, exigindo reconexao manual.
- **Replace-all em meta_ad_accounts:** Mais simples que diff. Custo: perde overrides locais por conta (nao temos hoje).
