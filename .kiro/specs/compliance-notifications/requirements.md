# Requirements: Compliance Notifications

> **Status:** APPROVED (fast-track)
> **Criado:** 2026-04-10
> **Owner:** Thor (BACKEND) + Iron Man (FRONTEND)

## Introducao

Sistema de notificacoes do compliance engine: webhooks configuráveis, email de alerta com template, e cron rapido para deteccao em < 5 minutos apos publicacao.

## O que ja existe

- `compliance-scan` Edge Function com takedown ✅
- `compliance_actions` log imutavel ✅
- Cron `compliance-scan-tick` every 6h (varredura completa) ✅
- OCR via Claude Vision ✅

## Requirements

### REQ-1: Webhook configuravel por tenant

**Objetivo:** Como gestor, quero enviar um POST para uma URL externa sempre que um takedown ocorrer, para integrar com meus sistemas (Slack, Discord, CRM, etc).

#### Criterios de Aceite
1. The system shall adicionar `notification_webhook_url text` em `companies`
2. The `compliance-scan` shall POST para a URL configurada apos cada takedown com payload:
   ```json
   {
     "event": "compliance.takedown",
     "timestamp": "ISO8601",
     "ad_id": "Meta ad ID",
     "ad_name": "nome do criativo",
     "score": 35,
     "violations": [{ "type": "...", "severity": "critical", "description": "..." }],
     "action": "auto_paused",
     "company_id": "uuid"
   }
   ```
3. The webhook shall ter timeout de 5s e nao bloquear o scan (fire-and-forget)
4. The webhook shall logar resultado (success/failure) em `compliance_actions.meta_api_response`
5. The UI Settings shall ter campo para configurar a URL do webhook

### REQ-2: Email de alerta com template

**Objetivo:** Como gestor, quero receber email quando um anuncio for pausado, com detalhes da violacao.

#### Criterios de Aceite
1. The system shall adicionar `notification_email text` em `companies` (email para alertas)
2. The system shall usar Resend API para enviar emails (RESEND_API_KEY no Vault/secrets)
3. O email shall conter:
   - Assunto: "[ClickHero] Anuncio pausado: {nome do anuncio}"
   - Corpo HTML com: thumbnail (se disponivel), nome do anuncio, ID Meta, score, lista de violacoes (tipo + severidade + descricao), acao tomada, link para dashboard
4. O email shall ser enviado em < 2 minutos apos takedown (inline, nao em fila)
5. Se Resend falhar, the system shall logar erro mas NAO bloquear o takedown
6. The UI Settings shall ter campo para configurar o email de notificacao

### REQ-3: Cron rapido para deteccao em < 5 minutos

**Objetivo:** Como sistema, quero detectar novos anuncios em menos de 5 minutos apos publicacao.

#### Criterios de Aceite
1. The system shall criar pg_cron `compliance-fast-tick` rodando a cada 5 minutos
2. O fast-tick shall processar APENAS criativos nunca analisados (sem score em compliance_scores)
3. O fast-tick shall ter limit de 10 ads por execucao (rapido, focado)
4. O fast-tick shall reusar a mesma Edge Function `compliance-scan` com body `{ fast_mode: true }`
5. O cron existente de 6h (`compliance-scan-tick`) continua para re-analise de ads ja analisados
6. Ambos crons convivem sem conflito (fast so pega novos, full re-analisa existentes)

### REQ-4: Configuracao de notificacoes na UI

**Objetivo:** Como gestor, quero configurar webhook URL e email de alerta na tela de configuracoes.

#### Criterios de Aceite
1. The ComplianceSettings shall ter secao "Notificacoes" com:
   - Input para webhook URL (com validacao https://)
   - Input para email de alerta (com validacao de formato)
   - Botao "Testar Webhook" (envia payload de teste)
   - Botao "Testar Email" (envia email de teste)
2. The system shall persistir em `companies`

## Non-Functional Requirements

- Webhook timeout: 5s max, fire-and-forget
- Email via Resend: free tier 100/dia, fallback graceful
- Fast-tick: nao deve processar mais que 10 ads pra nao estourar tempo do Edge Function
- Resend API key no Vault/secrets (mesmo padrao ANTHROPIC_API_KEY)
