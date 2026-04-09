# Requirements: Meta Integration (OAuth + Asset Management)

> **Status:** AS-BUILT (spec retroativa) — feature ja implementada e em producao
> **Criado:** 2026-04-06
> **Idioma:** pt-BR

## Introduction

Permitir que usuarios do ClickHero conectem suas contas Meta (Facebook/Instagram) via OAuth 2.0, selecionem quais ad accounts e paginas desejam gerenciar, e revoguem o acesso quando quiserem. Os tokens de acesso devem ser armazenados de forma criptografada (pgcrypto) e nunca expostos ao frontend.

## Requirements

### Requirement 1: OAuth Connect Flow

**Objective:** Como gestor de trafego, quero conectar minha conta Meta via popup OAuth, para que o ClickHero acesse minhas campanhas sem eu compartilhar senhas.

#### Acceptance Criteria
1. When o usuario clica "Conectar Meta Ads", the system shall chamar Edge Function `meta-oauth-start` que gera state token anti-CSRF salvo em `oauth_sessions`
2. When recebe a URL OAuth, the system shall abrir popup centralizado (600x700) com `window.opener` ativo
3. When o usuario aprova no Facebook, the system shall trocar code -> short-lived token -> long-lived token (~60 dias) via `fb_exchange_token`
4. When obtem o long-lived token, the system shall criptografar via RPC `encrypt_meta_token` (pgcrypto + Vault) e fazer upsert em `integrations` com `onConflict: 'company_id,platform'`
5. When o callback termina, the system shall retornar HTML com `window.opener.postMessage({type:'meta-oauth-success'})` e fechar o popup
6. While o popup esta aberto, the system shall escutar mensagens via `addEventListener('message')` e invalidar queries `meta-integration` e `meta-assets` ao receber sucesso
7. If o popup for bloqueado, then the system shall exibir toast "Popup bloqueado, permita popups"

### Requirement 2: Token Storage & Encryption

**Objective:** Como projeto multi-tenant, quero garantir que tokens Meta nunca vazem entre empresas nem sejam legiveis em caso de breach do banco.

#### Acceptance Criteria
1. The system shall armazenar `access_token` na coluna `integrations.access_token` apenas como string criptografada (pgcrypto AES via Vault key)
2. The system shall expor RPCs `encrypt_meta_token(token text)` e `decrypt_meta_token(encrypted_token text)` como SECURITY DEFINER com `search_path = public, extensions`
3. The system shall NUNCA enviar token decriptado para o frontend — apenas Edge Functions chamam `decrypt_meta_token`
4. The system shall aplicar RLS na tabela `integrations` filtrando por `company_id = current_user_company_id()`
5. The system shall salvar `token_expires_at` para detectar expiracao futura

### Requirement 3: Asset Selection (Ad Accounts + Pages)

**Objective:** Como usuario com 50+ ad accounts, quero escolher quais o ClickHero deve sincronizar, para nao poluir o dashboard.

#### Acceptance Criteria
1. After conexao bem-sucedida, the system shall abrir automaticamente o seletor de ativos (`MetaAccountSelector`)
2. The system shall chamar Edge Function `meta-list-assets` que busca `/me/adaccounts` e `/me/businesses` da Graph API
3. The system shall exibir checkbox por ad account (com nome, status, currency) e por business manager
4. When o usuario salva, the system shall chamar `meta-save-assets` que faz replace-all em `meta_ad_accounts` e `meta_pages` filtrando por `company_id`
5. The system shall marcar contas selecionadas com `is_active = true`

### Requirement 4: Disconnect

**Objective:** Como usuario, quero desconectar minha conta Meta a qualquer momento, para revogar acesso.

#### Acceptance Criteria
1. When o usuario clica "Desconectar", the system shall chamar `meta-oauth-disconnect`
2. The system shall decriptar o token e chamar `DELETE /me/permissions` na Graph API para revogar
3. The system shall remover a linha de `integrations` (cascade limpa `meta_ad_accounts` e `meta_pages`)
4. The system shall invalidar queries e voltar para o estado "Desconectado"

### Requirement 5: Status Indicator

**Objective:** Como usuario, quero ver claramente o status da integracao Meta, para saber se preciso reconectar.

#### Acceptance Criteria
1. The system shall calcular `daysUntilExpiry` baseado em `token_expires_at`
2. If `daysUntilExpiry > 7`, then the system shall exibir badge verde "Conectado"
3. If `daysUntilExpiry <= 7 && > 0`, then the system shall exibir badge ambar "Expira em N dias"
4. If `daysUntilExpiry <= 0`, then the system shall exibir badge vermelho "Expirado" e botao "Reconectar"

## Non-Functional Requirements

- **Seguranca:** Tokens criptografados em repouso (pgcrypto + Vault); RLS multi-tenant
- **UX:** Popup OAuth (nao redirect) para nao perder estado da pagina principal
- **Compatibilidade:** Meta Graph API v22.0; sem refresh tokens (Meta nao suporta), apenas long-lived tokens de 60 dias
