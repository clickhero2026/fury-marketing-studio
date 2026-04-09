# Tasks: Meta Integration

> **Status:** AS-BUILT — todas as tasks ja concluidas em producao

## Tasks

- [x] 1. Schema + Encryption (Thor + Cap)
  - Criar tabelas `integrations`, `meta_ad_accounts`, `meta_pages`, `oauth_sessions`
  - RLS por `company_id = current_user_company_id()`
  - UNIQUE constraint `(company_id, platform)` em integrations
  - RPCs `encrypt_meta_token` / `decrypt_meta_token` (SECURITY DEFINER, search_path=public,extensions)
  - Vault key para pgcrypto
  - _Requirements: 2_

- [x] 2. Edge Function `meta-oauth-start` (Thanos)
  - Gerar state UUID, INSERT em oauth_sessions com expires_at +10min
  - Construir URL Meta com scopes: ads_read, ads_management, business_management, pages_read_engagement
  - Retornar `{url, state}` ao frontend
  - _Requirements: 1_

- [x] 3. Edge Function `meta-oauth-callback` (Thanos)
  - Validar state contra oauth_sessions, deletar apos uso
  - Trocar code -> short-lived token via Graph API
  - Trocar short-lived -> long-lived via `fb_exchange_token`
  - Buscar `/me`, `/me/adaccounts`, `/me/businesses`
  - Encrypt token via RPC
  - Upsert integration com onConflict company_id+platform
  - Cache ad accounts em oauth_sessions com id `meta_accounts_<userId>`
  - Retornar HTML com `window.opener.postMessage` e auto-close
  - _Requirements: 1, 2_

- [x] 4. Edge Function `meta-oauth-disconnect` (Thanos)
  - Decrypt token, chamar DELETE /me/permissions
  - DELETE FROM integrations WHERE company_id AND platform=meta
  - _Requirements: 4_

- [x] 5. Edge Functions `meta-list-assets` + `meta-save-assets` (Thanos)
  - list-assets: ler do cache oauth_sessions ou Graph API
  - save-assets: replace-all em meta_ad_accounts + meta_pages
  - _Requirements: 3_

- [x] 6. Hook `useMetaConnect` (Iron Man)
  - useQuery integration
  - connectMutation: chama meta-oauth-start, abre popup centralizado, escuta postMessage
  - disconnectMutation: chama meta-oauth-disconnect
  - Computed: isConnected, isExpiringSoon, isExpired, daysUntilExpiry
  - _Requirements: 1, 4, 5_

- [x] 7. Hook `useMetaAssets` (Iron Man)
  - useQuery list-assets
  - mutation save-assets com invalidacao
  - _Requirements: 3_

- [x] 8. UI `MetaAccountSelector` (Iron Man)
  - Checkbox por ad account e page
  - Save dispara mutation
  - _Requirements: 3_

- [x] 9. Pagina `Integrations.tsx` (Iron Man)
  - Card Meta com status badge (Conectado/Expirando/Expirado/Desconectado)
  - Botoes Conectar/Sincronizar/Gerenciar Ativos/Desconectar
  - Auto-abre seletor apos OAuth bem-sucedido
  - _Requirements: 1, 3, 4, 5_

- [x] 10. Quality Loop (Hulk)
  - npm run build verde
  - Teste manual end-to-end: connect -> select -> disconnect
  - _Requirements: todos_
