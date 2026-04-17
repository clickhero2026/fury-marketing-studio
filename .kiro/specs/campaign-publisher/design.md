# Design: Campaign Publisher

## Database

```sql
-- 1. Drafts
CREATE TABLE campaign_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  created_by uuid REFERENCES auth.users(id),
  name text NOT NULL,
  ad_account_id text NOT NULL,
  campaign_data jsonb NOT NULL,  -- { objective, status, buying_type, special_ad_categories, start_time, end_time }
  adset_data jsonb NOT NULL,     -- { daily_budget, targeting, optimization_goal, billing_event, placements, start_time }
  ad_data jsonb NOT NULL,        -- { headline, body, cta, image_url, video_url, link_url, pixel_id }
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE campaign_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cd_select" ON campaign_drafts FOR SELECT USING (company_id = current_user_company_id());
CREATE POLICY "cd_insert" ON campaign_drafts FOR INSERT WITH CHECK (company_id = current_user_company_id());
CREATE POLICY "cd_update" ON campaign_drafts FOR UPDATE USING (company_id = current_user_company_id());
CREATE POLICY "cd_delete" ON campaign_drafts FOR DELETE USING (company_id = current_user_company_id());

-- 2. Publications (historico imutavel)
CREATE TABLE campaign_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  draft_id uuid REFERENCES campaign_drafts(id),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','validating','compliance_check','publishing','live','failed')),
  current_step text,                -- 'creating_campaign', 'creating_adset', 'creating_creative', 'creating_ad'
  compliance_score int,
  compliance_violations jsonb,
  meta_campaign_id text,
  meta_adset_id text,
  meta_creative_id text,
  meta_ad_id text,
  error_stage text,
  error_message text,
  started_at timestamptz DEFAULT now(),
  finished_at timestamptz,
  created_by uuid REFERENCES auth.users(id)
);
ALTER TABLE campaign_publications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cp_select" ON campaign_publications FOR SELECT USING (company_id = current_user_company_id());
CREATE INDEX idx_publications_company ON campaign_publications(company_id, started_at DESC);
CREATE INDEX idx_publications_status ON campaign_publications(status) WHERE status IN ('publishing','compliance_check');

-- 3. Publication steps (auditoria granular pra rollback)
CREATE TABLE campaign_publication_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id uuid NOT NULL REFERENCES campaign_publications(id) ON DELETE CASCADE,
  step_name text NOT NULL,          -- campaign | adset | creative | ad | rollback_*
  status text NOT NULL CHECK (status IN ('pending','success','failed','rolled_back')),
  external_id text,                 -- ID retornado pela Meta
  meta_api_response jsonb,
  error_message text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE campaign_publication_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cps_select" ON campaign_publication_steps FOR SELECT USING (
  publication_id IN (SELECT id FROM campaign_publications WHERE company_id = current_user_company_id())
);
```

## Edge Function: `campaign-publish`

### Fluxo

```
1. Auth (JWT obrigatorio — so usuario inicia)
2. body: { draft_id } OR { campaign_data, adset_data, ad_data, ad_account_id }
3. INSERT campaign_publications status='validating'
4. Zod validate (reject se invalido)
5. status='compliance_check' — rodar analyzeCopy + analyzeImage (compliance-scan helpers)
   - Se score < threshold: status='failed', return violations
   - Se ok: INSERT compliance_scores
6. status='publishing' — criar 4 entidades na Meta em sequencia:
   a. POST /act_{id}/campaigns → save meta_campaign_id + step
   b. POST /act_{id}/adsets (com campaign_id) → save meta_adset_id + step
   c. POST /act_{id}/adcreatives (com image/text) → save meta_creative_id + step
   d. POST /act_{id}/ads (com adset_id + creative_id) → save meta_ad_id + step
7. Se sucesso: status='live', finished_at=now
8. Se erro em qualquer step:
   - Rollback: DELETE /{ad_id}, /{creative_id}, /{adset_id}, /{campaign_id} (ordem inversa)
   - Log steps como 'rolled_back'
   - status='failed', error_stage + error_message
```

### Zod schemas

```typescript
const CampaignSchema = z.object({
  name: z.string().min(1).max(250),
  objective: z.enum(['OUTCOME_SALES','OUTCOME_LEADS','OUTCOME_AWARENESS','OUTCOME_TRAFFIC','OUTCOME_ENGAGEMENT','OUTCOME_APP_PROMOTION']),
  status: z.enum(['ACTIVE','PAUSED']).default('PAUSED'),
  buying_type: z.enum(['AUCTION','RESERVED']).default('AUCTION'),
  special_ad_categories: z.array(z.string()).default([]),
  start_time: z.string().datetime().optional(),
  stop_time: z.string().datetime().optional(),
});

const AdsetSchema = z.object({
  name: z.string().min(1).max(400),
  daily_budget: z.number().min(100).optional(),  // centavos
  lifetime_budget: z.number().min(100).optional(),
  targeting: z.object({
    geo_locations: z.object({ countries: z.array(z.string().length(2)).optional() }),
    age_min: z.number().int().min(13).max(65).default(18),
    age_max: z.number().int().min(13).max(65).default(65),
    genders: z.array(z.number().int().min(1).max(2)).optional(),
    interests: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
  }),
  optimization_goal: z.enum(['LINK_CLICKS','LANDING_PAGE_VIEWS','CONVERSIONS','REACH','IMPRESSIONS','LEAD_GENERATION']),
  billing_event: z.enum(['IMPRESSIONS','LINK_CLICKS']).default('IMPRESSIONS'),
  start_time: z.string().datetime().optional(),
});

const AdSchema = z.object({
  name: z.string().min(1).max(400),
  headline: z.string().min(1).max(40),
  body: z.string().min(1).max(125),
  description: z.string().max(27).optional(),
  cta: z.enum(['LEARN_MORE','SHOP_NOW','SIGN_UP','SUBSCRIBE','DOWNLOAD','CONTACT_US','GET_OFFER','BOOK_NOW']).default('LEARN_MORE'),
  image_url: z.string().url().optional(),
  video_url: z.string().url().optional(),
  link_url: z.string().url(),
  pixel_id: z.string().optional(),
});
```

## Frontend

### Componentes

| Componente | Descricao |
|---|---|
| `CampaignPublisherView.tsx` | View principal (nova tab sidebar "Publicar") |
| `PublishWizard.tsx` | Wizard 3 steps com stepper visual |
| `CampaignStep.tsx` | Formulario do nivel Campanha |
| `AdsetStep.tsx` | Formulario do nivel Ad Set (targeting) |
| `AdStep.tsx` | Formulario do nivel Ad (criativo) |
| `PublishConfirmModal.tsx` | Modal com score compliance + confirmar |
| `PublicationStatus.tsx` | Live status tracker (progress bar) |
| `PublicationHistory.tsx` | Lista historica com filtros |

### Hooks

| Hook | Descricao |
|---|---|
| `useCampaignDrafts()` | CRUD drafts |
| `useCampaignPublish()` | Mutation → invoke campaign-publish |
| `useCampaignPublication(id)` | Query com refetchInterval 2s enquanto nao finalizar |
| `useCampaignPublications()` | Lista historica |

## Trade-offs

| Decisao | Pros | Contras |
|---|---|---|
| Compliance inline (nao via compliance-scan) | Latencia baixa, controle total | Duplicacao de codigo de analise — mitigado extraindo helpers compartilhados |
| Rollback sequencial | Simples, previsivel | Se o proprio rollback falhar, fica orfao — mitigado por log granular |
| Status via polling (vs websocket/SSE) | Ja temos React Query, simples | Latencia ate 2s — aceitavel |
| Drafts separados de publications | Re-publicacao facil, historico limpo | 2 tabelas em vez de 1 — justificado |
