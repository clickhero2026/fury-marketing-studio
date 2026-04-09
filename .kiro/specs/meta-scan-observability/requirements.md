# Requirements: Meta Scan Observability

> **Status:** APPROVED (fast-track)
> **Criado:** 2026-04-06
> **Owner:** Thor + Iron Man + Vision

## Introduction

Cobre tratamento de erros, alertas e dashboard de status das varreduras Meta. Complementa `meta-deep-scan` e `meta-scan-pipeline` adicionando observabilidade end-to-end.

## Requirements

### Requirement 1: Classificacao estruturada de erros

**Objective:** Como operador, quero saber rapidamente o TIPO do erro (token expirado vs rate limit vs bug) para tomar acao certa.

#### Acceptance Criteria
1. The system shall classificar cada erro em `stats.errors[]` com campo `code`: `token_expired` | `permission_denied` | `rate_limit` | `not_found` | `network` | `server_error` | `unknown`
2. The `callMeta` helper shall mapear status HTTP + Meta error codes (190, 200, 4, 17, 613) para o `code`
3. The `meta_scan_logs` shall ter coluna `error_summary jsonb` agregando `{ code: count }` para query rapida
4. When `token_expired` (code 190) detectado, the system shall UPDATE `integrations.status='expired'` imediatamente

### Requirement 2: Deteccao de varredura travada (stale)

**Objective:** Como sistema, quero marcar integracoes que falharam silenciosamente para o usuario reconectar.

#### Acceptance Criteria
1. The system shall criar funcao SQL `detect_stale_meta_scans()` que marca `integrations.status='stale'` quando `last_deep_scan_at < now() - interval '1 hour' * (scan_interval_hours + 1)`
2. The system shall criar pg_cron `meta-scan-stale-detector` rodando hourly
3. The function shall ignorar integracoes com `status='expired'` (ja tratadas)
4. When marcado stale, the system shall registrar em `meta_scan_logs` com `triggered_by='stale_detector'` + `status='stale'`

### Requirement 3: View de health check

**Objective:** Como dashboard, quero uma view consolidada do estado de cada integracao.

#### Acceptance Criteria
1. The system shall criar view `meta_scan_health` por integration_id com colunas: `last_success_at`, `last_failure_at`, `last_error_summary`, `next_scan_at`, `consecutive_failures`, `health_status` ('healthy' | 'degraded' | 'stale' | 'expired')
2. The view shall respeitar RLS via `current_user_company_id()`
3. The view shall agregar dos ultimos 7 dias de `meta_scan_logs`

### Requirement 4: Dashboard UI de status

**Objective:** Como gestor, quero um card em Integrations mostrando saude da varredura.

#### Acceptance Criteria
1. The Integrations page shall mostrar card "Status da Varredura" com:
   - Ultima execucao bem-sucedida (relativa: "ha 2h")
   - Proxima execucao agendada (relativa: "em 4h")
   - Health status badge (verde/amarelo/vermelho)
   - Contador de falhas consecutivas
   - Lista colapsavel dos ultimos 5 erros (codigo + mensagem curta)
2. The system shall criar hook `useMetaScanHealth()` consultando view `meta_scan_health`
3. When `health_status='expired'`, the UI shall destacar botao "Reconectar"
4. When `health_status='stale'`, the UI shall mostrar warning + botao "Varredura Profunda"

## Non-Functional Requirements

- **Performance:** view `meta_scan_health` < 50ms para 1k integrations
- **RLS:** todas queries respeitam multi-tenancy
- **Backwards compatible:** scan_logs antigos (sem error_summary) sao tratados como `{}`
- **Auto-recovery:** quando scan volta a funcionar, `health_status` volta para `healthy` automaticamente
