# Meta Disconnect Cascade — Tasks

> Status: AS-BUILT (2026-04-19)

- [x] Migration `20260419000001_meta_assets_upsert_constraints.sql` — UNIQUE em meta_ad_accounts e meta_pages
- [x] Migration `20260419000002_cascade_fury_compliance.sql` — CASCADE em 5 FKs fury/compliance
- [x] `meta-oauth-disconnect/index.ts` — simplificado para DELETE + retorno de erro detalhado
- [x] `use-meta-connect.ts` — toast de erro usa `error.message` do backend
- [x] Deploy via CLI + push 3 remotes
- [x] Teste funcional: disconnect + reconnect no ambiente Lovable OK
