# Design: Brand Guide + Smart Takedown v2

> **Status:** APPROVED (fast-track)

## Database delta

```sql
-- 1. Novo violation_type para termos obrigatorios
ALTER TABLE compliance_violations DROP CONSTRAINT IF EXISTS compliance_violations_violation_type_check;
ALTER TABLE compliance_violations ADD CONSTRAINT compliance_violations_violation_type_check
  CHECK (violation_type IN (
    'blacklist_term','misleading_language','unfulfillable_promise',
    'meta_policy_violation','visual_claim','brand_mismatch',
    'ocr_text_violation','missing_required_term'
  ));

-- 2. Brand Guide nas companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS brand_colors text[] DEFAULT '{}';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS brand_logo_url text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS takedown_severity_filter text DEFAULT 'critical'
  CHECK (takedown_severity_filter IN ('any','critical'));
```

## Edge Function patches: `compliance-scan`

### Copy analysis — termos obrigatorios

```
// Antes de chamar analyzeCopy, buscar required_terms:
const requiredTerms = rules.filter(r => r.rule_type === 'required_term').map(r => r.value);

// Adicionar ao prompt:
TERMOS OBRIGATORIOS (devem aparecer no copy):
{{required_terms}}
Se algum termo obrigatorio estiver ausente, criar violacao:
{"type": "missing_required_term", "severity": "warning", "description": "Termo obrigatorio ausente: X"}
```

### Image analysis — cores + logo

```
// Buscar brand config:
const { brand_colors, brand_logo_url } = companySettings;

// Adicionar ao prompt de imagem:
CORES DA MARCA (hex): {{brand_colors}}
Avalie se o criativo usa predominantemente estas cores.

// Se brand_logo_url, enviar como segunda imagem:
messages: [
  { type: 'image', source: { type: 'base64', ...logo } },  // logo de referencia
  { type: 'image', source: { type: 'base64', ...creative } }, // criativo
  { type: 'text', text: 'Compare: o logo da 1a imagem aparece na 2a?' }
]
```

### Takedown — filtro por severidade

```typescript
// No executeTakedown, alem do score < threshold:
if (takedownSeverityFilter === 'critical') {
  const hasCritical = violations.some(v => v.severity === 'critical');
  if (!hasCritical) return false; // nao pausa sem violacao critical
}
```

## Frontend delta

### ComplianceSettings.tsx

- Adicionar: Select para `takedown_severity_filter` ('any' | 'critical')
- Adicionar: secao "Brand Guide" com:
  - Color picker inputs (hex) ate 10 cores
  - Input URL/upload para logo
  - Preview do logo

### BlacklistManager.tsx

- Adicionar toggle/tabs: "Proibidos" | "Obrigatorios"
- Obrigatorios usam `rule_type='required_term'` no mesmo CRUD
- Badges com label diferente ("Obrigatorio" vs "Proibido")

### Nova aba: TakedownHistory.tsx

- Tabela paginada de `compliance_actions`
- Join com creatives (nome + thumb)
- Botao "Reativar" por linha
- Filtro por action_type

### ComplianceView.tsx

- Adicionar tab "Historico" apontando para TakedownHistory
