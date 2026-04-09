# Design: Meta Scan Pipeline (deltas)

> **Status:** APPROVED (fast-track)
> **Idioma:** pt-BR

## Overview

Adicao incremental pequena sobre `meta-deep-scan`. 3 mudancas isoladas, nenhuma refactor.

## Architecture delta

```
[User] → OAuth popup → callback → MetaAccountSelector → saveAssets
                                                              │
                                                              ▼
                                           meta-save-assets (Edge Function)
                                           ├─ UPSERT meta_ad_accounts
                                           ├─ UPSERT meta_pages
                                           └─ [NEW] net.http_post('meta-sync') fire-and-forget
                                                        │
                                                        ▼
                                           [user volta pra Integrations com dashboard ja populado]
```

## Database Schema delta

```sql
ALTER TABLE integrations
  ADD COLUMN scan_interval_hours int DEFAULT 24
  CONSTRAINT integrations_scan_interval_chk CHECK (scan_interval_hours BETWEEN 6 AND 168);

-- Backfill: todas integracoes existentes recebem 24h (default)
-- (nao precisa de UPDATE explicito — default cobre)
```

## Edge Function patches

### `meta-deep-scan/index.ts`

**Patch 1 — Retry exponencial:**
```typescript
const RETRY_DELAYS_MS = [1000, 3000, 9000]; // 3 retries em 5xx
const MAX_RETRIES = RETRY_DELAYS_MS.length;

// No callMeta:
if (res.status >= 500 && res.status < 600 && attempt < MAX_RETRIES) {
  await sleep(RETRY_DELAYS_MS[attempt]);
  ctx.stats.retries_count++;
  return callMeta(ctx, endpoint, endpointKey, attempt + 1);
}
```

**Patch 2 — scan_interval_hours ao calcular next_scan_at:**
```typescript
// Busca scan_interval_hours ao decriptar token
const { data: integration } = await supabaseAdmin
  .from('integrations')
  .select('id, access_token, scan_interval_hours')
  .eq('company_id', companyId)
  .eq('platform', 'meta')
  .single();

// No finalize do scan:
const intervalHours = integration.scan_interval_hours ?? 24;
const baseMs = intervalHours * 3600_000;
const jitterMs = Math.random() * 3600_000;
const nextScanAt = new Date(Date.now() + baseMs + jitterMs).toISOString();
```

**Patch 3 — Adicionar `retries_count` no ScanStats:**
```typescript
interface ScanStats {
  ...
  retries_count: number;
}
```

### `meta-save-assets/index.ts`

**Patch — Auto-trigger `meta-sync` fire-and-forget no final:**

```typescript
// Apos salvar accounts + pages com sucesso:
try {
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (cronSecret) {
    // Fire-and-forget — nao aguarda
    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/meta-sync-auto`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': cronSecret,
      },
      body: JSON.stringify({ company_id: companyId }),
    }).catch(() => {});
  }
} catch { /* ignore */ }
```

**PROBLEMA:** `meta-sync` hoje so aceita user JWT (nao tem dual auth). Precisamos:
- **Opcao A:** Adicionar dual auth em `meta-sync` (JWT ou `x-cron-secret`) — similar ao que fizemos em `meta-deep-scan`
- **Opcao B:** Criar Edge Function wrapper `meta-sync-auto` que chama `meta-sync` com um user token cacheado
- **Opcao C:** Dispatcher SQL via `net.http_post` que chama `meta-sync` com um JWT sintetico do user que conectou

**Recomendado:** **Opcao A** — adicionar dual auth em `meta-sync` (5 linhas de codigo). Consistente com `meta-deep-scan`.

## Frontend patches

### `src/hooks/use-meta-connect.ts`

Adicionar:
```typescript
const updateScanIntervalMutation = useMutation({
  mutationFn: async (intervalHours: number) => {
    const { error } = await supabase
      .from('integrations')
      .update({
        scan_interval_hours: intervalHours,
        next_scan_at: new Date(Date.now() + intervalHours * 3600_000).toISOString(),
      })
      .eq('platform', 'meta');
    if (error) throw error;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['meta-integration'] });
    toast({ title: 'Intervalo atualizado' });
  },
});
```

Adicionar no retorno do hook:
```typescript
return {
  ...,
  integration, // expor scan_interval_hours
  updateScanInterval: (hours: number) => updateScanIntervalMutation.mutate(hours),
};
```

### `src/pages/Integrations.tsx`

Adicionar um `<Select>` com opcoes `[6, 12, 24, 48, 72, 168]` horas, mostrando "Intervalo de varredura: X horas". On change, chama `updateScanInterval(value)`.

## Trade-offs

| Decisao | Pros | Contras |
|---|---|---|
| Min 6h (vs 30min do roadmap) | Evita rate limit, composa com stagger | Usuario talvez queira mais agressivo — mitigado por "Varredura Profunda" manual |
| 3 retries exponenciais (vs 1 linear) | Sobrevive a bursts transientes Meta | Aumenta latencia pior-caso ate ~13s por chamada |
| Auto-trigger so `meta-sync` (nao deep-scan) | Dashboard popula imediatamente | Adsets/pixels/BMs esperam proximo cron (max 6h) |
| Fire-and-forget do auto-trigger | Usuario nao espera | Nao ha feedback direto de falha — apareceria no proximo refresh |
| Opcao A (dual auth em meta-sync) | Consistente, pouco codigo | Muda contrato de uma Edge Function existente |

## Risks

| Risco | Prob | Impacto | Mitigacao |
|---|---|---|---|
| Auto-trigger crasha o `meta-save-assets` | Baixa | Alto | Fire-and-forget dentro de try/catch — nao afeta retorno |
| `scan_interval_hours` constraint rejeita migrations existentes | Baixa | Medio | `CHECK (... BETWEEN 6 AND 168)` com DEFAULT 24 — nao bate nada existente |
| Retry exponencial escala latencia | Media | Baixo | Max = 1+3+9 = 13s extras por chamada. Timeout guard 120s absorve |
