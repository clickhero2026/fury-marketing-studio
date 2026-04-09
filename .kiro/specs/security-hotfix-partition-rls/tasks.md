# Tasks: Hotfix RLS particoes

> **Status:** AS-BUILT
> **Migration:** `hotfix_partitions_rls_security`

- [x] 1. ALTER TABLE em loop sobre `pg_inherits` habilitando RLS+FORCE em todas as particoes do `campaign_metrics`
- [x] 2. Patch `create_next_campaign_metrics_partition()` para garantir RLS habilitada em particoes futuras
- [x] 3. Validar via Supabase advisor: 0 ERRORs `rls_disabled_in_public` nas particoes
- [x] 4. Atualizar steering em `implemented-features.md`
