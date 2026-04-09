# Design: Meta Scan Observability

> **Status:** APPROVED (fast-track)

## Overview

Adicao de classificacao de erros, deteccao de stale, view de health e dashboard UI. Zero breaking changes.

## Database delta

```sql
-- 1) Coluna nova em meta_scan_logs
ALTER TABLE meta_scan_logs ADD COLUMN error_summary jsonb DEFAULT '{}'::jsonb;
CREATE INDEX idx_meta_scan_logs_company_started ON meta_scan_logs(company_id, started_at DESC);

-- 2) View de health
CREATE OR REPLACE VIEW meta_scan_health
WITH (security_invoker = true) AS
SELECT
  i.id AS integration_id,
  i.company_id,
  i.status AS integration_status,
  i.scan_interval_hours,
  i.next_scan_at,
  i.last_deep_scan_at,
  (SELECT MAX(started_at) FROM meta_scan_logs l
    WHERE l.integration_id = i.id AND l.status = 'success'
    AND l.started_at > now() - interval '7 days') AS last_success_at,
  (SELECT MAX(started_at) FROM meta_scan_logs l
    WHERE l.integration_id = i.id AND l.status IN ('failed','partial')
    AND l.started_at > now() - interval '7 days') AS last_failure_at,
  (SELECT error_summary FROM meta_scan_logs l
    WHERE l.integration_id = i.id AND l.status IN ('failed','partial')
    ORDER BY started_at DESC LIMIT 1) AS last_error_summary,
  (SELECT count(*) FROM meta_scan_logs l
    WHERE l.integration_id = i.id
    AND l.started_at > COALESCE(
      (SELECT MAX(started_at) FROM meta_scan_logs l2
        WHERE l2.integration_id = i.id AND l2.status = 'success'),
      '1970-01-01'::timestamptz
    )
    AND l.status IN ('failed','partial')) AS consecutive_failures,
  CASE
    WHEN i.status = 'expired' THEN 'expired'
    WHEN i.status = 'stale' THEN 'stale'
    WHEN (SELECT count(*) FROM meta_scan_logs l
      WHERE l.integration_id = i.id
      AND l.started_at > now() - interval '24 hours'
      AND l.status IN ('failed','partial')) >= 3 THEN 'degraded'
    ELSE 'healthy'
  END AS health_status
FROM integrations i
WHERE i.platform = 'meta';

GRANT SELECT ON meta_scan_health TO authenticated;

-- 3) Funcao stale detector
CREATE OR REPLACE FUNCTION detect_stale_meta_scans()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE marked int;
BEGIN
  WITH stale AS (
    UPDATE integrations
    SET status = 'stale'
    WHERE platform = 'meta'
      AND status NOT IN ('expired','stale','disconnected')
      AND last_deep_scan_at IS NOT NULL
      AND last_deep_scan_at < now() - (interval '1 hour' * (COALESCE(scan_interval_hours, 24) + 1))
    RETURNING id, company_id
  )
  INSERT INTO meta_scan_logs (company_id, integration_id, scan_type, status, triggered_by, finished_at, error_summary)
  SELECT company_id, id, 'deep_scan', 'stale', 'stale_detector', now(), '{"stale_detector": 1}'::jsonb
  FROM stale;
  GET DIAGNOSTICS marked = ROW_COUNT;
  RETURN marked;
END $$;

-- 4) Cron hourly
SELECT cron.schedule('meta-scan-stale-detector', '0 * * * *',
  $$SELECT detect_stale_meta_scans();$$);
```

## Edge Function patches

### `meta-deep-scan/index.ts`

**Patch — classificar erros em callMeta:**

```typescript
type ErrorCode = 'token_expired' | 'permission_denied' | 'rate_limit' | 'not_found' | 'network' | 'server_error' | 'unknown';

function classifyMetaError(status: number, body: { error?: { code?: number; type?: string } }): ErrorCode {
  const code = body.error?.code;
  if (code === 190 || code === 102) return 'token_expired';
  if (code === 200 || code === 10 || code === 17) return 'permission_denied';
  if (code === 4 || code === 17 || code === 613 || status === 429) return 'rate_limit';
  if (status === 404) return 'not_found';
  if (status >= 500) return 'server_error';
  if (status >= 400) return 'permission_denied';
  return 'unknown';
}

// Em pushError, aceitar code opcional. Em finalizacao, agregar contador:
const errorSummary: Record<string, number> = {};
for (const e of ctx.stats.errors) {
  if (e.code) errorSummary[e.code] = (errorSummary[e.code] ?? 0) + 1;
}
// Se tem token_expired, marca integration:
if (errorSummary.token_expired) {
  await supabaseAdmin.from('integrations')
    .update({ status: 'expired' })
    .eq('id', integration.id);
}
// Salva error_summary no scan_log update
```

## Frontend

### `src/hooks/use-meta-scan-health.ts` (NEW)

```typescript
export function useMetaScanHealth() {
  return useQuery({
    queryKey: ['meta-scan-health'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meta_scan_health')
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
```

### `src/components/meta/ScanHealthCard.tsx` (NEW)

Card mostrando:
- Badge de health_status (healthy=verde, degraded=amarelo, stale=laranja, expired=vermelho)
- "Ultima execucao: ha 2h" (formatDistanceToNow)
- "Proxima: em 4h"
- Falhas consecutivas (se > 0)
- Lista colapsavel dos error codes

Integrar em `Integrations.tsx` apos o card de status atual.

## Trade-offs

| Decisao | Pros | Contras |
|---|---|---|
| View vs tabela materializada | Sempre atualizada, sem job de refresh | Re-calcula a cada query (mitigado por staleTime 30s no front) |
| security_invoker view | Respeita RLS automaticamente | Subqueries podem ser mais lentas — ok pra 1k integrations |
| Marcar `expired` no proprio scan | Reacao imediata | Race condition se 2 scans rodam em paralelo (mitigado pelo cron unico) |
| Stale detector hourly | Pega gaps de 1h+ | Atraso max 1h pra detectar — aceitavel pra UX |
