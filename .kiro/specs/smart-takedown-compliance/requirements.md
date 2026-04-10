# Requirements: Smart Takedown + Compliance

> **Status:** APPROVED (fast-track)
> **Criado:** 2026-04-10
> **Owner:** Thor (BACKEND) + Iron Man (FRONTEND) + Thanos (META_SPECIALIST)
> **Prioridade:** P0 — feature de maior valor percebido (protecao contra bloqueio Meta)

## Introducao

Motor de analise de conformidade de anuncios Meta com pausa automatica (takedown) quando violacoes criticas sao detectadas. Protege o cliente contra bloqueios de conta na Meta — o "seguro" que justifica a assinatura.

## Adaptacoes do Roadmap

- BullMQ → pg_cron + Edge Function (padrao do projeto)
- OCR separado → Claude Vision (multimodal) — 1 chamada analisa texto + imagem
- Webhooks + Email → Fase 1 in-app, Fase 2 pg_net
- Claude API → Anthropic API via fetch no Edge Function, key no Vault

## Requirements

### REQ-1: Blacklist de termos por tenant

**Objetivo:** Como gestor, quero configurar uma lista de termos proibidos especifica da minha empresa, para que anuncios com esses termos sejam flagados automaticamente.

#### Criterios de Aceite
1. The system shall criar tabela `compliance_rules` com `company_id`, `rule_type` ('blacklist_term' | 'brand_guideline' | 'custom'), `value` (texto do termo), `severity` ('info' | 'warning' | 'critical'), `is_active boolean`
2. The UI shall permitir adicionar, editar e remover termos da blacklist
3. The system shall incluir blacklist padrao Meta (termos proibidos pela plataforma) como seed, marcados como `source='meta_default'` e nao-editaveis pelo usuario
4. The blacklist shall ser case-insensitive e suportar termos compostos ("resultados garantidos")
5. RLS shall garantir que cada empresa so veja suas proprias regras

### REQ-2: Analise de copy via Claude API

**Objetivo:** Como sistema, quero analisar o texto de cada anuncio ativo usando IA para detectar linguagem enganosa, promessas nao cumpriveis e termos proibidos pelas politicas Meta.

#### Criterios de Aceite
1. The Edge Function `compliance-scan` shall buscar todos os anuncios ativos (`creatives` com status ACTIVE) que nao foram analisados nas ultimas 24h
2. The system shall enviar o copy (headline + body + CTA) para a API Anthropic (claude-sonnet-4-5) com prompt estruturado pedindo:
   - Deteccao de termos da blacklist do tenant
   - Deteccao de linguagem enganosa/exagerada
   - Deteccao de promessas nao cumpriveis
   - Deteccao de termos proibidos pelas politicas Meta Ads
   - Score de conformidade (0-100%)
   - Lista de violacoes com severidade (info/warning/critical)
3. The system shall salvar resultado em `compliance_scores` e violacoes individuais em `compliance_violations`
4. The system shall usar response_format JSON (tool_use) para parsing confiavel
5. Latencia alvo: < 5s por anuncio para analise de copy

### REQ-3: Analise de imagem via Claude Vision (OCR integrado)

**Objetivo:** Como sistema, quero analisar imagens de anuncios usando Claude Vision para extrair texto visivel (OCR) e detectar elementos visuais problematicos.

#### Criterios de Aceite
1. The system shall baixar a imagem do anuncio (`creatives.image_url`) e enviar para Claude Vision (claude-sonnet-4-5) como imagem + prompt
2. The prompt shall pedir:
   - Extracao de TODO texto visivel na imagem (OCR)
   - Aplicacao da blacklist de termos no texto extraido
   - Deteccao de claims visuais problematicos (antes/depois sem disclaimer, numeros sem fonte)
   - Deteccao de elementos fora do Brand Guide (se configurado)
3. The system shall combinar score de copy + score de imagem em score final ponderado (60% copy, 40% visual)
4. Se imagem nao disponivel (video, carousel sem thumb), the system shall usar somente analise de copy (score 100% copy)
5. Latencia alvo: < 10s por anuncio para analise de imagem

### REQ-4: Score de conformidade e classificacao

**Objetivo:** Como gestor, quero ver um score de 0-100% por anuncio e saber rapidamente quais precisam de atencao.

#### Criterios de Aceite
1. The system shall calcular score final: `0-100%` onde 100 = totalmente conforme
2. Classificacao de severidade por violacao: `info` (0-20 pontos), `warning` (20-40 pontos), `critical` (40+ pontos)
3. Score geral do anuncio: `healthy` (80-100), `warning` (50-79), `critical` (0-49)
4. The system shall manter historico de scores por anuncio (tabela `compliance_scores` com timestamps)
5. Dashboard aggregado: % de anuncios healthy/warning/critical por empresa

### REQ-5: Auto-takedown (pausa automatica)

**Objetivo:** Como gestor, quero que anuncios com violacoes criticas sejam pausados automaticamente na Meta, protegendo minha conta de bloqueio.

#### Criterios de Aceite
1. The system shall ter flag `auto_takedown_enabled` por empresa (default: false — opt-in)
2. When auto_takedown habilitado AND score < 50 (critical), the system shall chamar `POST /{ad_id}?status=PAUSED` na Meta Graph API
3. The system shall registrar a acao em `compliance_actions` com `action_type='auto_paused'`, `ad_id`, `reason`, `timestamp`
4. The system shall permitir "appeal" — usuario pode re-ativar manualmente apos corrigir
5. The system shall NUNCA pausar sem registrar — auditoria completa
6. When auto_takedown desabilitado, the system shall apenas alertar (toast + badge)
7. Rate limit: max 10 takedowns por empresa por hora (protecao contra falso positivo em massa)

### REQ-6: UI de Compliance

**Objetivo:** Como gestor, quero uma tela dedicada de compliance mostrando score, violacoes e acoes.

#### Criterios de Aceite
1. Nova view "Compliance" acessivel via sidebar
2. Dashboard cards: total de anuncios analisados, % healthy/warning/critical, ultima analise
3. Tabela de anuncios com: nome, score (badge colorido), violacoes (count), ultima analise, acoes
4. Detalhe do anuncio: lista de violacoes com severidade + descricao + trecho do copy afetado
5. Painel de configuracao: toggle auto_takedown, gerenciamento de blacklist
6. Botao "Analisar Agora" (trigger manual do compliance-scan)
7. 4 estados visuais: Loading, Error, Empty ("Nenhum anuncio analisado"), Data

### REQ-7: Cron e pipeline

**Objetivo:** Como sistema, quero analisar anuncios automaticamente em background.

#### Criterios de Aceite
1. The system shall criar pg_cron `compliance-scan-tick` rodando a cada 6 horas
2. The cron shall processar max 50 anuncios por execucao (batch)
3. The system shall priorizar anuncios: nunca analisados > ultimos analisados ha mais tempo
4. The system shall respeitar rate limit da Anthropic API (max 60 RPM tier 1)
5. The system shall registrar scan em `compliance_scan_logs` (mesmo padrao do meta_scan_logs)
6. Dual auth: JWT (manual via UI) OR x-cron-secret (cron)

## Non-Functional Requirements

- **Multi-tenancy:** Todas tabelas com company_id + RLS
- **Custo:** Claude Sonnet 4.5 ~ $3/1M tokens. Estimativa: ~$0.005/anuncio (copy) + ~$0.01/anuncio (imagem) = ~$0.015/anuncio
- **Idempotencia:** Re-scan do mesmo anuncio sobrescreve score anterior (nao duplica)
- **Seguranca:** ANTHROPIC_API_KEY no Vault (nao em env). Meta Graph API token via decrypt_meta_token existente
- **Observabilidade:** Reusa padrao de meta_scan_logs (status, error_summary, stats)
