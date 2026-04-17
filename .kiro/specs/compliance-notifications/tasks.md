# Tasks: Compliance Notifications

> **Status:** APPROVED (fast-track)

## Fase 1 — Database + Cron

- [x] 1. Migration: ADD `notification_webhook_url`, `notification_email` em companies
- [x] 2. Migration: CREATE FUNCTION `trigger_compliance_fast_tick()` + pg_cron every 5min

## Fase 2 — Edge Function patches

- [x] 3. Helper `dispatchWebhook()` (fire-and-forget, 5s timeout)
- [x] 4. Helper `sendAlertEmail()` via Resend API (5s timeout)
- [x] 5. `buildEmailHtml()` — template HTML inline
- [x] 6. Chamar webhook + email apos cada takedown no `scanCreative()`
- [x] 7. Buscar `notification_webhook_url`, `notification_email` do company settings
- [x] 8. Suportar `fast_mode: true` — so ads sem score, limit 10
- [x] 9. Suportar `test_webhook: true` e `test_email: true` (handlers especiais)

## Fase 3 — Secrets

- [x] 10. Configurar RESEND_API_KEY como Supabase secret

## Fase 4 — UI

- [x] 11. ComplianceSettings: secao "Notificacoes" (webhook + email + botoes teste)

## Fase 5 — Quality

- [x] 12. `npm run build` verde
- [x] 13. Deploy compliance-scan
- [x] 14. Atualizar `implemented-features.md`
