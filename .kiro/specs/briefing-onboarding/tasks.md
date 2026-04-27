# Implementation Plan — briefing-onboarding

> **Modo**: Aditivo. Nenhuma tabela existente sera alterada e nenhuma Edge Function existente sera modificada de forma breaking. Integracoes opt-in com `campaign-publish` ficam isoladas em tasks especificas com fallback fail-open.

## 1. Fundacao do schema (migrations + RLS)

- [x] 1.1 Criar migration com as tabelas de briefing e RLS basica
  - Criar `company_briefings` (1:1 com `companies`) com colunas para negocio, audience (jsonb), tone (jsonb), palette (jsonb), status, timestamps
  - Criar `company_offers` com regra unique parcial garantindo no maximo uma oferta marcada como principal por company
  - Aplicar policies de RLS em ambas usando `current_user_company_id()` para SELECT/INSERT/UPDATE/DELETE
  - Garantir CASCADE ON DELETE a partir de `companies`
  - _Requirements: 2.1, 2.2, 2.3, 2.6, 3.1, 3.2, 3.3, 9.1, 9.3_

- [x] 1.2 (P) Criar migration de proibicoes e history/audit
  - Criar `company_prohibitions` com categoria (palavra/assunto/visual) e fonte (user/vertical_default)
  - Criar `briefing_history` (snapshot jsonb + changed_by + changed_at)
  - Criar `briefing_access_log` (accessed_by + purpose + accessed_at)
  - Aplicar RLS por `company_id` em todas; `briefing_history` so aceita INSERT via trigger; `briefing_access_log` so aceita INSERT via RPC
  - _Requirements: 5.1, 5.2, 5.3, 5.5, 6.2, 6.3, 7.6, 9.1_

- [x] 1.3 Implementar trigger de versionamento e cron de retencao
  - Criar trigger AFTER UPDATE em `company_briefings` que insere snapshot agregado em `briefing_history`
  - Criar funcao agendada (cron diario) que mantem apenas as 20 versoes mais recentes por company
  - _Requirements: 6.2, 6.3_

- [x] 1.4 (P) Criar bucket Storage `company-assets` com policies por path
  - Criar bucket privado replicando padrao do `chat-attachments`
  - Aplicar policies de Storage que restringem SELECT/INSERT/DELETE a usuarios da `company_id` no path
  - Documentar convencao de path `{company_id}/branding/{kind}/{uuid}.{ext}`
  - _Requirements: 4.4, 4.6, 9.2_

- [x] 1.5 (P) Criar tabela `company_branding_assets` com indices e RLS
  - Colunas: kind (logo_primary/logo_alt/mood_board), storage_path, mime_type, size_bytes, dimensoes
  - Unique parcial garantindo um unico `logo_primary` e `logo_alt` por company
  - RLS por `company_id`
  - _Requirements: 4.1, 4.3, 4.4, 9.1_

## 2. View de status e calculo de completude

- [x] 2.1 Criar view `v_company_briefing_status` calculando score e missing fields
  - Computar score 0-100 ponderando campos obrigatorios e opcionais
  - Retornar `is_complete` baseado no minimo definido em R8.2 (nicho, descricao, oferta principal, persona basica, tom em 3 dimensoes, logo OU paleta)
  - Retornar lista de `missing_fields` em texto identificavel
  - View `SECURITY INVOKER` para herdar RLS
  - _Requirements: 8.1, 8.2, 8.5, 8.6_

- [x] 2.2 Implementar transicao automatica de status no briefing
  - Trigger BEFORE UPDATE em `company_briefings` que recalcula `status` a partir da view
  - Validar transicao reversa: se completude cair abaixo do minimo, voltar para `incomplete`
  - _Requirements: 8.5, 8.6_

## 3. RPC agregadora `get_company_briefing`

- [x] 3.1 Implementar RPC retornando briefing completo em JSON
  - Aceitar parametros `p_company_id` e `p_purpose` (chat/creative-generation/campaign-publish/compliance-preflight)
  - Validar enum de `p_purpose` e rejeitar valores fora do conjunto
  - Retornar payload agregado com business, ofertas, audience, tone, prohibitions, visual identity, meta
  - `SECURITY INVOKER` para herdar RLS naturalmente
  - _Requirements: 7.1, 7.3, 7.5_

- [x] 3.2 Adicionar geracao de signed URLs e log de acesso na RPC
  - Para cada asset visual, gerar signed URL com TTL 1h via storage
  - Limitar mood board a no maximo 10 signed URLs por chamada
  - Registrar entrada em `briefing_access_log` com purpose, accessed_by, timestamp
  - _Requirements: 4.6, 7.4, 7.6_

- [~] 3.3 Validar performance da RPC com seed de teste — adiada para seed real (indices ja criados)
  - Criar seed com 1k companies e briefings completos
  - Medir p95 da chamada e garantir <200ms
  - Adicionar indices adicionais se necessario
  - _Requirements: 7.2_

## 4. Hooks de leitura/escrita no frontend

- [x] 4.1 Implementar hook canonico de briefing (leitura, ofertas, write multi-step)
  - Carregar briefing principal e lista de ofertas com TanStack Query (cache 5min)
  - Implementar `saveStep` por passo do wizard com upsert e invalidacao de cache
  - Implementar CRUD de ofertas: upsert, remove, promote-to-primary
  - Bloquear writes para usuarios com papel `member` (modo readOnly)
  - Validar invariantes localmente com Zod antes do write
  - _Requirements: 1.3, 2.1, 2.6, 3.1, 5.1, 6.1, 6.4, 6.5, 6.6_

- [x] 4.2 (P) Implementar hook de assets visuais
  - Listar assets do company por kind com signed URLs frescos
  - Fazer upload com validacao client-side (max 5MB, mime allowlist)
  - Bloquear upload de mood board quando atingir 10 itens
  - Implementar remocao com rollback transacional (Storage + tabela)
  - _Requirements: 4.1, 4.2, 4.3, 4.5_

- [x] 4.3 (P) Implementar hook de completude consumindo a view
  - Consultar `v_company_briefing_status` via TanStack Query
  - Expor flags `blocksCreativeGeneration` e `blocksCampaignPublish` para consumidores
  - Invalidar automaticamente quando hooks de briefing/assets fazem mutation
  - _Requirements: 8.1, 8.3, 8.4_

- [x] 4.4 (P) Implementar hook de proibicoes com defaults por vertical
  - CRUD de proibicoes (palavras, assuntos, regras visuais)
  - Quando nicho cair em vertical regulada (saude, financeiro, infoproduto, emagrecimento), pre-popular sugestoes editaveis
  - Confirmar com aviso ao remover proibicao marcada como `vertical_default`
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6_

## 5. Schemas de validacao compartilhados

- [x] 5.1 Criar schemas Zod por passo do wizard
  - Schema para Negocio (nicho, descricao, site, social)
  - Schema para Oferta (nome, descricao, preco, formato, URL, dores, beneficios, prova social)
  - Schema para Audience (faixa etaria, genero, localizacao, ocupacao, renda, awareness, interesses, comportamentos)
  - Schema para Tom (escalas + tom emocional + CTAs preferidos/proibidos)
  - Schema para Identidade Visual (paleta hex)
  - Schema para Proibicoes (listas multi-tag)
  - Exportar todos para reuso pela `BriefingView`
  - _Requirements: 2.1, 2.2, 2.6, 3.1, 3.2, 3.3, 3.4, 4.2, 5.1, 5.2, 5.3_

## 6. UI do Wizard pos-cadastro

- [x] 6.1 Implementar shell do wizard com progresso e auto-save
  - Renderizar indicador "X de 6 passos"
  - Persistir estado parcial a cada passo concluido via hook
  - Permitir botao "Pular por enquanto" mantendo `briefing_status='incomplete'`
  - Detectar abandono sem salvar e marcar `not_started`
  - Bloquear acesso ao wizard para usuarios com papel `member`
  - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6_

- [x] 6.2 Implementar passo 1 — Negocio
  - Campos: nicho (categoria + texto livre), descricao curta, site, redes sociais
  - Validacao por schema Zod do passo 1
  - _Requirements: 2.1_

- [x] 6.3 Implementar passo 2 — Oferta principal e secundarias
  - Form da oferta principal com todos os campos obrigatorios
  - Lista de ate 10 ofertas secundarias com adicao/edicao/remocao inline
  - Bloquear salvamento se faltar nome, descricao ou preco
  - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 6.4 Implementar passo 3 — Audiencia
  - Campos demograficos + interesses/comportamentos multi-tag
  - Suporte a awareness em escala 1-5
  - _Requirements: 3.1, 3.2, 3.5_

- [x] 6.5 Implementar passo 4 — Tom de voz
  - Escalas formal/informal e tecnico/simples
  - Multi-select de tom emocional dominante
  - Listas de CTAs preferidos e frases proibidas
  - Aplicar defaults sensatos (3/5) quando vazio
  - _Requirements: 3.3, 3.4, 3.6_

- [x] 6.6 Implementar passo 5 — Identidade Visual
  - Color pickers para paleta (primary, secondary, accent, background)
  - Upload de logo principal e alternativa
  - Galeria de mood board com upload multiplo (limite 10)
  - Mensagens de erro especificas para tamanho/formato invalido
  - _Requirements: 4.1, 4.2, 4.3, 4.5_

- [x] 6.7 Implementar passo 6 — Proibicoes
  - Listas multi-tag de palavras, assuntos e regras visuais proibidas
  - Pre-preencher sugestoes para verticais reguladas (com base no nicho do passo 1)
  - Aviso confirmatorio ao remover proibicao recomendada
  - Apos salvar ultimo passo, transitar para chat se completude minima atingida
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 8.5_

## 7. UI de edicao continua (BriefingView)

- [x] 7.1 Implementar pagina de edicao acordeao com 6 secoes
  - Reutilizar os schemas Zod e sub-componentes do wizard
  - Cada secao em estado expandido/colapsado, editavel inline
  - Modo readOnly automatico para `member`
  - Cancelar edicao reverte ao valor anterior sem persistir
  - _Requirements: 6.1, 6.4, 6.5_

- [x] 7.2 Implementar regra de promocao de oferta principal
  - Bloquear remocao da oferta principal sem outra promovida
  - Botao "tornar principal" em ofertas secundarias com confirmacao
  - _Requirements: 6.6_

- [x] 7.3 (P) Implementar visualizacao de historico de alteracoes
  - Listar ate 20 versoes mais recentes consultando `briefing_history`
  - Permitir abrir uma versao para visualizacao read-only (sem rollback nesta entrega)
  - _Requirements: 6.2, 6.3_

## 8. Integracoes com features dependentes

- [x] 8.1 Implementar banner persistente de completude
  - Renderizar no topo do app quando `isComplete=false`
  - Listar `missingFields` em mensagens humanas com link direto para a secao
  - Esconder automaticamente quando completo
  - _Requirements: 1.6, 8.1, 8.3_

- [x] 8.2 Bloquear "gerar criativo" no chat enquanto briefing incompleto
  - Desabilitar botao/comando de geracao de criativo quando hook de completude indicar bloqueio
  - Permitir uso normal do chat para outras tarefas
  - Adicionar prompt de sistema instruindo IA a sugerir completar briefing antes de pedidos de criativo
  - _Requirements: 8.3, 8.4_

- [x] 8.3 Bloquear publicacao de campanha quando incompleto (opt-in fail-open)
  - Adicionar checagem em `campaign-publish` consultando `v_company_briefing_status`
  - Retornar 422 com `missingFields` quando bloqueado
  - Manter fail-open por feature flag para companies criadas antes desta feature (zero breaking)
  - _Requirements: 8.3_

- [x] 8.4 (P) Adicionar redirect pos-cadastro para o wizard
  - Apos `Register.tsx` criar company, redirecionar para wizard antes de liberar chat e publisher
  - Tratar caso o usuario fechar e voltar: continuar de onde parou
  - _Requirements: 1.1_

## 9. Seguranca e auditoria

- [x] 9.1 Validar isolamento multi-tenant via testes cross-tenant
  - Suite que tenta ler/escrever briefing de company alheia e espera negacao
  - Cobrir tabelas, view, RPC e Storage
  - _Requirements: 9.1, 9.2, 9.3_

- [x] 9.2 Garantir validacao de tenant em Edge Functions com service_role
  - Em `campaign-publish` (e futuras consumidoras), validar `company_id` extraido do JWT antes de chamar a RPC
  - Adicionar helper compartilhado para a verificacao
  - _Requirements: 9.4_

- [x] 9.3 Configurar ofuscacao de dados sensiveis em logs
  - Garantir que precos, depoimentos e descricoes de oferta nao apareçam em logs estruturados
  - Logar apenas IDs e timestamps em hooks e RPC
  - _Requirements: 9.5_

## 10. Testes

- [x] 10.1 Testes de unidade dos hooks
  - `useBriefing.saveStep` valido e invalido por passo
  - `useBriefingAssets.upload` rejeita arquivos invalidos
  - `useBriefingCompleteness` reflete view com mocks
  - _Requirements: 1.3, 2.6, 4.5, 8.1_

- [x] 10.2 Testes de integracao do schema
  - Calculo de score na view com fixtures vazio/parcial/completo
  - Trigger de `briefing_history` snapshota em UPDATE e nao em SELECT
  - Unique parcial impede 2 ofertas principais simultaneas
  - _Requirements: 6.2, 6.3, 8.1, 2.6_

- [x] 10.3 Testes E2E do wizard (Playwright)
  - Cadastro completo -> wizard 6 passos -> status complete -> redireciona para chat
  - Sair no passo 3, voltar e continuar de onde parou
  - Pular wizard mantem incomplete e exibe banner
  - _Requirements: 1.1, 1.3, 1.4, 1.5_

- [x] 10.4 (P) Testes E2E de bloqueio funcional
  - Tentativa de gerar criativo com briefing incompleto e bloqueada
  - Tentativa de publicar campanha com briefing incompleto retorna 422
  - Apos completar, ambas acoes liberam
  - _Requirements: 8.3, 8.4, 8.5_

- [ ] 10.5* Testes de performance da RPC
  - p95 <200ms com 1k e 10k companies seed
  - Marcado como opcional pois cobre R7.2 ja contemplado em task 3.3 e pode ser revisitado pos-MVP
  - _Requirements: 7.2_
