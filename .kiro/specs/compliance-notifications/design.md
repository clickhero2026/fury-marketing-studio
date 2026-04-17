# Design: Compliance Notifications

> **Status:** APPROVED (fast-track)

## Database delta

```sql
ALTER TABLE companies ADD COLUMN IF NOT EXISTS notification_webhook_url text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS notification_email text;
```

## Edge Function patches: `compliance-scan`

### Webhook dispatch (apos takedown)

```typescript
async function dispatchWebhook(
  webhookUrl: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* fire-and-forget */ }
}
```

### Email dispatch (via Resend)

```typescript
async function sendAlertEmail(
  resendKey: string,
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: 'ClickHero <alerts@clickhero.com.br>',
        to: [to],
        subject,
        html,
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* nao bloqueia takedown */ }
}
```

### Email HTML template

```html
<div style="font-family:sans-serif;max-width:600px;margin:auto">
  <h2 style="color:#ef4444">Anuncio Pausado Automaticamente</h2>
  <table>
    <tr><td>Anuncio:</td><td><strong>{{ad_name}}</strong></td></tr>
    <tr><td>ID Meta:</td><td>{{ad_id}}</td></tr>
    <tr><td>Score:</td><td><strong style="color:#ef4444">{{score}}/100</strong></td></tr>
  </table>
  <h3>Violacoes Detectadas</h3>
  <ul>
    {{#violations}}
    <li>[{{severity}}] {{description}}</li>
    {{/violations}}
  </ul>
  <p><a href="https://app.clickhero.com.br/compliance">Ver no Dashboard</a></p>
</div>
```

### Fast mode

```typescript
// No handler HTTP:
if (body.fast_mode) {
  // Override: busca APENAS criativos SEM score (nunca analisados)
  // Limit 10
}
```

## Cron fast-tick

```sql
CREATE OR REPLACE FUNCTION trigger_compliance_fast_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','vault','extensions' AS $$
DECLARE
  v_secret text;
  v_project_url text := 'https://ckxewdahdiambbxmqxgb.supabase.co';
  r record;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets
    WHERE name = 'CRON_SECRET' LIMIT 1;
  IF v_secret IS NULL THEN RETURN; END IF;

  FOR r IN
    SELECT DISTINCT i.company_id
    FROM integrations i
    WHERE i.platform = 'meta' AND i.status = 'active'
    -- So empresas que tem criativos novos sem score
    AND EXISTS (
      SELECT 1 FROM creatives c
      WHERE c.company_id = i.company_id AND c.platform = 'meta'
      AND NOT EXISTS (
        SELECT 1 FROM compliance_scores cs WHERE cs.creative_id = c.id
      )
    )
  LOOP
    PERFORM net.http_post(
      url := v_project_url || '/functions/v1/compliance-scan',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-cron-secret', v_secret
      ),
      body := jsonb_build_object('company_id', r.company_id, 'fast_mode', true)
    );
  END LOOP;
END $$;

SELECT cron.schedule('compliance-fast-tick','*/5 * * * *',
  $$SELECT trigger_compliance_fast_tick();$$);
```

## Frontend delta

### ComplianceSettings.tsx

Adicionar secao "Notificacoes":
- Input webhook URL (validacao https://)
- Input email (validacao formato)
- Botao "Testar Webhook" — invoke compliance-scan com `{ test_webhook: true }`
- Botao "Testar Email" — invoke compliance-scan com `{ test_email: true }`
