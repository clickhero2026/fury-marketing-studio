# Tasks: Meta Scan Pipeline

> **Status:** APPROVED (fast-track)
> **Fast-track:** todas as fases encadeadas sem pausa

## Tasks

- [x] 1. Migration: ALTER `integrations` ADD COLUMN `scan_interval_hours int DEFAULT 24` + CHECK constraint
- [x] 2. Patch `meta-deep-scan` (retries 3x exponencial + scan_interval_hours + retries_count em stats)
- [x] 3. Patch `meta-sync` — dual auth (JWT OR x-cron-secret + body.company_id)
- [x] 4. Patch `meta-save-assets` — fire-and-forget POST para `meta-sync` no final
- [x] 5. Patch `use-meta-connect.ts` — `updateScanInterval` mutation
- [x] 6. Patch `Integrations.tsx` — Select com opcoes [6, 12, 24, 48, 72, 168]
- [x] 7. `npm run build` verde
- [x] 8. Deploy `meta-deep-scan` + `meta-sync` + `meta-save-assets`
- [ ] 9. Smoke test: mudar intervalo via UI, confirmar next_scan_at (manual)
- [x] 10. Atualizar `implemented-features.md`
