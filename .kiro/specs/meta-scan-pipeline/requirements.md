# Requirements: Meta Scan Pipeline (deltas)

> **Status:** APPROVED (fast-track)
> **Criado:** 2026-04-06
> **Idioma:** pt-BR
> **Owner:** Thor + Iron Man + Thanos
> **Spec-mae:** [meta-deep-scan](../meta-deep-scan/)

## Introduction

Completar o pipeline de varredura Meta com 3 gaps identificados em cruzamento com o roadmap Claude:
1. **Auto-trigger inicial** apos usuario selecionar ativos no OAuth
2. **Intervalo configuravel** por integracao (min 6h)
3. **Retry exponencial** (3 retries com 1s/3s/9s, so em 5xx)

Todos os outros itens do roadmap ja estavam implementados em `meta-deep-scan` ou sao semanticamente confusos (ver spec-mae).

## Requirements

### Requirement 1: Auto-trigger `meta-sync` apos asset selection

**Objective:** Como usuario que acabou de conectar Meta e selecionar ad accounts, quero ver o dashboard populado imediatamente sem precisar clicar "Sincronizar".

#### Acceptance Criteria
1. When `meta-save-assets` Edge Function termina com sucesso (accounts + pages salvos), the system shall disparar `meta-sync` via `net.http_post` interno (fire-and-forget)
2. The system shall autenticar a chamada interna via `x-cron-secret` header (mesmo padrao do `meta-deep-scan`)
3. The system shall **nao** aguardar o resultado de `meta-sync` — retorna imediatamente ao usuario
4. If `meta-sync` falhar, the system shall registrar em `meta_scan_logs` como `triggered_by='auto'` + `status='failed'`
5. The system shall **nao** disparar `meta-deep-scan` automaticamente — ele roda via cron normalmente

### Requirement 2: Intervalo configuravel por integracao

**Objective:** Como gestor, quero escolher se minha varredura roda de 6h em 6h ou 1x por dia, para balancear frescor vs rate limit.

#### Acceptance Criteria
1. The system shall adicionar coluna `integrations.scan_interval_hours int DEFAULT 24 CHECK (scan_interval_hours BETWEEN 6 AND 168)`
2. The `meta-deep-scan` Edge Function shall usar esse valor em vez do hardcoded 24h ao calcular `next_scan_at`
3. The `meta-deep-scan` shall manter jitter de 0-1h para evitar stampede
4. The system shall adicionar UI em `Integrations.tsx` com select de opcoes: 6h, 12h, 24h (default), 48h, 72h, 168h (7d)
5. When usuario muda o valor, the system shall UPDATE `integrations.scan_interval_hours` e recalcular `next_scan_at = now() + interval '<new_hours> hours'`

### Requirement 3: Retry exponencial em 5xx

**Objective:** Como sistema resiliente, quero sobreviver a 5xx transientes Meta API sem matar sub-syncs inteiros.

#### Acceptance Criteria
1. The `callMeta` helper shall fazer ate **3 retries** (total 4 tentativas) em 5xx
2. The system shall usar backoff exponencial: tentativa 1 = 1s, tentativa 2 = 3s, tentativa 3 = 9s
3. The system shall **nao** retry em 4xx (400, 401, 403, 404) — esses sao erros permanentes
4. The system shall **nao** retry em 429 — rate limit exige abortar imediatamente
5. The system shall adicionar contador `stats.retries_count` em `ScanStats`

## Non-Functional Requirements

- **Backwards compatible:** integracoes existentes pegam `scan_interval_hours = 24` (default)
- **Seguro:** UI bloqueia valores < 6h
- **Observavel:** retries aparecem em `stats.retries_count` e tambem em logs Edge Function via `console.log`
- **Composavel:** nao mexe na logica de stagger ja existente
