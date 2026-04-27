# Research & Design Decisions — briefing-onboarding

## Summary
- **Feature**: `briefing-onboarding`
- **Discovery Scope**: Extension (greenfield em cima de infraestrutura existente: `companies`, `organizations`, Supabase Auth, Storage, RLS via `current_user_company_id()`)
- **Key Findings**:
  - A tabela `companies` ja existe via migration `20260404000001_bridge_organizations_companies.sql` mas nao possui campos de briefing — sera estendida via novas tabelas em vez de inflar `companies`
  - Padroes de RLS via `current_user_company_id()` ja sao convencao do projeto e devem ser reutilizados
  - Bucket privado `chat-attachments` ja foi criado em `20260426000001_chat_attachments.sql` — replicar o mesmo modelo de policies para `company-assets`
  - Spec adjacente `proactive-briefing` (migration `20260424000006`) foca em briefing **gerado pela IA a partir das campanhas**, nao em briefing **fornecido pelo usuario** — este briefing-onboarding e a fonte canonica que alimentara o proactive

## Research Log

### Modelagem do briefing: campos em `companies` vs tabela dedicada
- **Context**: Decidir se ampliamos `companies` com 30+ colunas ou criamos `company_briefings` separada
- **Sources Consulted**: estrutura atual de `companies`, padrao de outras especs (campaign-publisher, fury-rules)
- **Findings**: 
  - `companies` ja e usada como bridge multi-tenant — adicionar 30+ colunas agressiva o schema
  - Versionamento (R6) exige tabela `_history` — mais limpo manter briefing isolado
  - Ofertas (R2) sao 1:N (uma principal + ate 10 secundarias) — exige tabela filha de qualquer forma
- **Implications**: Modelar como `company_briefings` (1:1 com companies) + `company_offers` (1:N) + `briefing_history` (snapshot). Mantem `companies` enxuta.

### RPC unica vs multiplas queries para a IA ler o briefing
- **Context**: R7 exige leitura completa em <200ms p95
- **Sources Consulted**: padroes Supabase RPC, custo de joins em PostgREST
- **Findings**: Uma RPC SQL `get_company_briefing(uuid)` retornando JSON agregado e ~3-5x mais rapida que multiplas chamadas REST + reduz roundtrips do agente IA
- **Implications**: Centralizar em RPC tipada com `SECURITY INVOKER` (respeita RLS naturalmente) e gerar URLs assinadas inline via `storage.create_signed_url`

### Storage de assets visuais (logo, mood board)
- **Context**: R4 — uploads de imagem com isolamento por tenant
- **Sources Consulted**: bucket `chat-attachments`, policies de Storage Supabase
- **Findings**: 
  - Bucket privado + RLS por path `{company_id}/...` e o padrao consolidado
  - Signed URLs de 1h sao adequadas — URLs sao injetadas em prompts efemeros para Gemini/GPT-image
- **Implications**: Criar bucket `company-assets`, replicar policies do `chat-attachments`, expor signed URL na RPC

### Bloqueio funcional por completude (R8)
- **Context**: Como bloquear "gerar criativo" e "publicar campanha" sem espalhar checagem em N hooks
- **Sources Consulted**: hooks existentes `use-campaign-publisher.ts`, `use-fury.ts`
- **Findings**: Criar hook unico `use-briefing-completeness()` que retorna `{ status, missingFields, isComplete }` — consumido por features que dependem do briefing
- **Implications**: Single source of truth no frontend. Backend tambem checa via RLS-friendly view `v_company_briefing_status`

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| Tabela unica gigante (`companies` + briefing) | Adicionar todos os campos em `companies` | Simples, 1 query | Schema poluido, dificil versionar, ofertas 1:N quebram modelo | Rejeitado |
| Tabelas normalizadas + RPC agregadora | `company_briefings` + filhas + RPC `get_company_briefing` retorna JSON | Schema limpo, versionavel, performance via RPC | Mais migrations | **Selecionado** |
| Document store (JSONB blob em `companies.briefing`) | Campo JSONB unico | Flexivel | Sem indexacao, dificil validar, sem RLS granular | Rejeitado |

## Design Decisions

### Decision: Modelagem normalizada com RPC agregadora
- **Context**: Combinar performance de leitura (R7) com integridade e versionamento (R6)
- **Alternatives Considered**:
  1. Tabela unica monolitica — rejeitado (poluicao + 1:N de ofertas)
  2. JSONB blob — rejeitado (sem validacao + sem versionamento granular)
- **Selected Approach**: Tabelas relacionais (`company_briefings`, `company_offers`, `company_branding_assets`, `company_prohibitions`) + RPC `get_company_briefing(uuid)` que agrega tudo em JSON
- **Rationale**: Padrao consolidado no projeto, permite RLS granular, suporta versionamento limpo, latencia <200ms via RPC
- **Trade-offs**: Mais migrations vs simplicidade de leitura para a IA
- **Follow-up**: Validar p95 da RPC com seed de 100 companies

### Decision: Bloqueio de funcionalidades via hook unico no frontend + view no backend
- **Context**: R8 — gerar criativo e publicar campanha bloqueados se incompleto
- **Alternatives Considered**:
  1. Checagem inline em cada feature — rejeitado (drift)
  2. Middleware/guard em todas Edge Functions — rejeitado (acoplamento)
- **Selected Approach**: Hook `use-briefing-completeness()` no front + view `v_company_briefing_status` no back consumida pelas Edge Functions criticas
- **Rationale**: Single source of truth, fail-closed por padrao
- **Trade-offs**: Duas implementacoes (front+back) mas calculo trivial e replicavel
- **Follow-up**: Garantir que regra de completude minima fique em SQL e nao duplique no TS

### Decision: Versionamento via tabela `briefing_history` com retencao de 20 entradas
- **Context**: R6.3 exige no minimo 20 versoes
- **Alternatives Considered**:
  1. Audit log generico — rejeitado (granularidade ruim)
  2. Trigger on UPDATE com diff em JSONB — selecionado
- **Selected Approach**: Trigger AFTER UPDATE em `company_briefings` que insere snapshot em `briefing_history` + cron que limpa entradas alem das 20 mais recentes por company
- **Rationale**: Captura automatica, sem dependencia de codigo aplicacional, retencao bounded
- **Trade-offs**: Storage marginal vs auditoria robusta

## Risks & Mitigations
- **Risco**: Wizard longo desestimula conclusao → Mitigacao: 6 passos curtos, auto-save por passo, valor visivel ("a IA vai usar isso para gerar seus criativos")
- **Risco**: RPC `get_company_briefing` vira hotpath e degrada performance → Mitigacao: indices em `company_id`, cache TanStack Query 5min no frontend, projeto tem <10k companies estimado
- **Risco**: Cliente sobe logo de baixa qualidade que prejudica criativo gerado → Mitigacao: fora do escopo desta spec; sera tratado em `ai-creative-generation` com pre-processing
- **Risco**: Mudanca de oferta principal sem atualizar briefing leva IA a usar dado stale → Mitigacao: TTL curto no cache + invalidacao no `useMutation` de oferta

## References
- Migration existente [bridge_organizations_companies](../../../supabase/migrations/20260404000001_bridge_organizations_companies.sql) — base de tenancy
- Migration [chat_attachments](../../../supabase/migrations/20260426000001_chat_attachments.sql) — modelo de bucket privado a replicar
- Migration [proactive_briefing](../../../supabase/migrations/20260424000006_proactive_briefing.sql) — feature relacionada (briefing gerado pela IA, nao colidir)
