# Requirements: Brand Guide + Smart Takedown v2

> **Status:** APPROVED (fast-track)
> **Criado:** 2026-04-10
> **Owner:** Thor (BACKEND) + Iron Man (FRONTEND)

## Introducao

Evolucao do compliance engine: parametrizacao de Brand Guide por tenant (termos obrigatorios, cores, logo) e refinamento do takedown (filtro por severidade, historico visual).

## O que ja existe (nao refazer)

- `compliance_rules` com blacklist de termos (rule_type='blacklist_term') ✅
- `compliance-scan` Edge Function com analise de copy + imagem ✅
- `companies.auto_takedown_enabled` + `takedown_threshold` ✅
- `compliance_actions` log de takedowns ✅
- UI Compliance com Dashboard/Table/Detail/Settings/BlacklistManager ✅

## Requirements

### REQ-1: Termos obrigatorios no Brand Guide

**Objetivo:** Como gestor, quero definir termos que DEVEM aparecer nos anuncios (ex: "parceiro oficial", "registro CNPJ").

#### Criterios de Aceite
1. The system shall suportar `rule_type='required_term'` na tabela `compliance_rules` existente
2. The `compliance-scan` prompt de copy shall verificar se TODOS os termos obrigatorios aparecem no copy
3. When termo obrigatorio ausente, the system shall gerar violacao `violation_type='missing_required_term'` com severity configurada pelo usuario
4. The `BlacklistManager` UI shall ter aba/secao separada para "Termos Obrigatorios"
5. Pontuacao: cada termo obrigatorio ausente deduz pontos conforme severity do termo

### REQ-2: Cores da marca para validacao visual

**Objetivo:** Como gestor, quero cadastrar as cores da minha marca (hex) para que a IA verifique se os criativos respeitam a paleta.

#### Criterios de Aceite
1. The system shall adicionar coluna `brand_colors text[]` em `companies` (array de hex codes, max 10)
2. The `compliance-scan` prompt de imagem shall incluir as cores cadastradas e pedir para a IA avaliar se o criativo usa predominantemente essas cores
3. When cores fora da paleta detectadas, gerar violacao `violation_type='brand_mismatch'` severity 'warning'
4. The UI shall ter color picker (input hex) na tela de configuracoes de compliance
5. Se nenhuma cor cadastrada, the system shall pular essa validacao

### REQ-3: Logo obrigatorio no criativo

**Objetivo:** Como gestor, quero que a IA verifique se meu logo aparece nos criativos de imagem.

#### Criterios de Aceite
1. The system shall adicionar coluna `brand_logo_url text` em `companies` (URL da imagem do logo)
2. The `compliance-scan` prompt de imagem shall receber o logo como segunda imagem e pedir para a IA avaliar se o logo (ou similar) aparece no criativo
3. When logo ausente no criativo, gerar violacao `violation_type='brand_mismatch'` severity configuravel (default 'warning')
4. The UI shall ter upload/URL input para o logo na tela de configuracoes
5. Se nenhum logo cadastrado, the system shall pular essa validacao

### REQ-4: Takedown filtrado por severidade

**Objetivo:** Como gestor, quero poder configurar o auto-takedown para agir apenas em violacoes `critical`, ignorando warnings.

#### Criterios de Aceite
1. The system shall adicionar coluna `takedown_severity_filter text DEFAULT 'critical'` em `companies` com CHECK ('any' | 'critical')
2. When `takedown_severity_filter='critical'`, the system shall pausar apenas se existir pelo menos 1 violacao critical (alem do score < threshold)
3. When `takedown_severity_filter='any'`, comportamento atual (score < threshold basta)
4. The UI Settings shall ter select para escolher o filtro de severidade

### REQ-5: Historico visual de takedowns

**Objetivo:** Como gestor, quero ver um log completo de todos os takedowns realizados (quem, quando, qual anuncio, qual violacao).

#### Criterios de Aceite
1. The Compliance view shall ter nova aba "Historico" mostrando `compliance_actions`
2. Colunas: data/hora, anuncio (nome + thumbnail), acao (auto_paused/appealed/reactivated), motivo, score no momento
3. The log shall ser paginado e filtravelmente por tipo de acao
4. Botao "Reativar" em cada linha (cria action_type='reactivated' + POST /{ad_id}?status=ACTIVE na Meta)

## Non-Functional Requirements

- Adiciona CHECK constraint pra `missing_required_term` no enum de violation_type
- Brand colors array max 10 itens (UI valida)
- Logo URL deve ser validada (formato URL)
- Historico paginado (limit 50 por pagina)
