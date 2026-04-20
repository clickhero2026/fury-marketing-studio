# Meta Disconnect Cascade — Design

> Status: AS-BUILT (2026-04-19)

## Arquitetura

```
[User clica Desconectar]
  -> use-meta-connect.ts invoke meta-oauth-disconnect
    -> [meta-oauth-disconnect] DELETE FROM integrations WHERE company_id=X AND platform='meta'
      -> PostgreSQL propaga ON DELETE CASCADE por todas as FKs
```

## Decisoes Criticas

### 1. CASCADE no banco, nao cleanup manual
Versao anterior do endpoint fazia DELETE manual em 8 tabelas, que era fragil
(ordenacao de dependencias, transacoes, race conditions). Substituido por FKs
com `ON DELETE CASCADE` — Postgres resolve em uma operacao atomica.

### 2. Migration `20260419000002_cascade_fury_compliance.sql`
Adicionou CASCADE em 5 FKs que referenciam `campaigns` ou `creatives`:
- `fury_evaluations_campaign_id_fkey`, `fury_evaluations_creative_id_fkey`
- `fury_actions_campaign_id_fkey`, `fury_actions_creative_id_fkey`
- `compliance_scores_campaign_id_fkey`, `compliance_scores_creative_id_fkey`
- `compliance_violations_campaign_id_fkey`, `compliance_violations_creative_id_fkey`
- `compliance_actions_campaign_id_fkey`, `compliance_actions_creative_id_fkey`

Investigacao feita via Management API query em `pg_constraint` filtrando
`contype='f' and pg_get_constraintdef(oid) ilike '%REFERENCES campaigns%'`.

### 3. Edge Function simplificada
```ts
const { error } = await supabaseAdmin
  .from('integrations')
  .delete()
  .eq('company_id', companyId)
  .eq('platform', 'meta');

if (error) return 500 { error, details: error.details, hint: error.hint, code: error.code };
return 200 { success: true };
```

## Nao-goals

- Nao suporta disconnect parcial (somente algumas contas)
- Nao notifica outros users da organizacao
