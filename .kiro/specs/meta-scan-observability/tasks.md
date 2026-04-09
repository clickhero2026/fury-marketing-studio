# Tasks: Meta Scan Observability

> **Status:** APPROVED (fast-track)

- [x] 1-4. Migration unica `scan_observability_01_error_summary_and_health` (error_summary + view + stale detector + cron hourly)
- [x] 5. Patch `meta-deep-scan` (MetaApiError + classifyMetaError + extractErrorCode + pushError aceita unknown + error_summary agregado + auto-expired)
- [x] 6. Hook `useMetaScanHealth()`
- [x] 7. `ScanHealthCard.tsx` + integrado em `Integrations.tsx`
- [x] 8. `npm run build` verde
- [x] 9. Deploy `meta-deep-scan`
- [x] 10. Atualizar `implemented-features.md`
