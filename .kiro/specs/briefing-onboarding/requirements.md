# Requirements Document

## Project Description (Input)
Briefing estruturado da empresa coletado no onboarding (e editavel depois) para alimentar a IA do Fury com contexto necessario para gerar criativos, campanhas e decisoes alinhadas com o negocio do cliente. Inclui: nicho, oferta principal, publico-alvo, dores resolvidas, prova social, tom de voz, paleta/identidade visual, logo, ofertas secundarias, CTAs preferidos, proibicoes (o que NAO falar/mostrar), historico de campanhas anteriores. E a fundacao para os epicos de RAG, geracao de criativo e IA proativa — sem este briefing a IA gera criativo cego.

## Introduction

O **Briefing Onboarding** e a fundacao do produto Fury: e o conjunto estruturado de informacoes sobre a empresa do cliente que a IA usa para tomar **toda** decisao subsequente — gerar criativo, escolher copy, sugerir publico, criar campanha, validar compliance.

Sem briefing completo, a IA opera as cegas e gera output generico — o que mata a proposta de valor central do produto ("substituto de gestor de trafego que entende meu negocio"). Por isso o briefing precisa ser:

1. **Obrigatorio para destravar funcionalidades chave** (gerar criativo, publicar campanha)
2. **Coletado em fluxo guiado e curto** (wizard, nao formulario gigante)
3. **Editavel a qualquer momento** (negocios mudam, ofertas mudam)
4. **Acessivel pela IA via funcao de leitura** (tool no chat) com baixa latencia
5. **Isolado por tenant** (uma empresa nunca ve briefing de outra)

Esta spec define **APENAS** a coleta, armazenamento, edicao e exposicao do briefing. RAG sobre documentos, geracao de criativos e tool calling no chat sao especs separadas (`knowledge-base-rag`, `ai-creative-generation`, etc.).

## Requirements

### Requirement 1: Captura Inicial do Briefing (Wizard Pos-Cadastro)

**Objective:** Como dono de empresa recem-cadastrado, quero preencher um briefing estruturado em poucos passos, para que a IA do Fury possa atuar sobre meu negocio desde o primeiro uso.

#### Acceptance Criteria

1. When o usuario completa o cadastro (`Register.tsx`) e cria a primeira `company`, the Briefing Service shall redirecionar para um wizard de briefing antes de permitir acesso ao chat e ao publicador de campanhas.
2. The Briefing Service shall organizar a coleta em no maximo 6 passos sequenciais agrupados por tema (Negocio, Oferta, Publico, Tom & Voz, Identidade Visual, Proibicoes).
3. While o usuario preenche o wizard, the Briefing Service shall salvar o progresso a cada passo concluido (auto-save) para que o cliente nao perca dados se sair e voltar.
4. When o usuario clica em "Pular por enquanto", the Briefing Service shall permitir o salto mas marcar `briefing_status = 'incomplete'` e bloquear acoes que dependem de briefing (gerar criativo, publicar campanha) ate completude minima.
5. The Briefing Service shall exibir indicador de progresso (`X de 6 passos`) em todos os passos do wizard.
6. If o usuario abandona o wizard sem salvar nenhum passo, the Briefing Service shall manter `briefing_status = 'not_started'` e exibir CTA persistente no topo do app convidando a completar.

### Requirement 2: Dados Estruturados do Negocio e Oferta

**Objective:** Como IA do Fury, quero acessar dados normalizados sobre nicho, ofertas e proposta de valor da empresa, para gerar criativos e campanhas alinhados ao que ela vende de fato.

#### Acceptance Criteria

1. The Briefing Service shall capturar e armazenar os campos: nome comercial, nicho/segmento (categoria pre-definida + texto livre), descricao da empresa em 1-3 frases, site/landing page principal, redes sociais (Instagram, Facebook, TikTok).
2. The Briefing Service shall capturar uma **oferta principal** com: nome da oferta, descricao curta, preco, formato de entrega (curso, servico, produto fisico, SaaS, outros), URL de venda/landing.
3. Where o cliente possuir multiplas ofertas, the Briefing Service shall permitir cadastrar ate 10 ofertas secundarias com os mesmos campos da oferta principal.
4. The Briefing Service shall capturar dores que a oferta resolve (lista de 1-5 itens texto curto) e beneficios/transformacoes prometidas (lista de 1-5 itens).
5. Where o cliente fornecer prova social, the Briefing Service shall permitir registrar depoimentos, numeros de impacto (ex: "+1000 alunos") e logos de imprensa/parceiros.
6. If o usuario salvar uma oferta sem nome, descricao OU preco, the Briefing Service shall bloquear o salvamento e indicar quais campos sao obrigatorios.

### Requirement 3: Publico-Alvo e Tom de Voz

**Objective:** Como IA do Fury, quero entender com quem o cliente fala e como fala, para que copy e criativos tenham aderencia ao publico real do negocio.

#### Acceptance Criteria

1. The Briefing Service shall capturar persona principal com: faixa etaria, genero predominante, localizacao (estado/cidade/pais), profissao/ocupacao tipica, renda aproximada (faixa), nivel de consciencia da dor (escala 1-5).
2. The Briefing Service shall capturar interesses, comportamentos e palavras que o publico usa (campos texto livre, multi-tag).
3. The Briefing Service shall capturar tom de voz em multiplas dimensoes: formal vs informal (escala 1-5), tecnico vs simples (escala 1-5), tom emocional dominante (selecao multi: aspiracional, urgente, acolhedor, autoritativo, divertido, racional).
4. The Briefing Service shall capturar exemplos de frases/CTAs que o cliente costuma usar (ate 10 frases) e exemplos de frases que ele NAO quer usar.
5. Where o cliente fornecer link para conta Instagram/TikTok, the Briefing Service shall permitir armazenar a URL para que tarefas futuras possam analisar o tom existente (analise em si fora do escopo desta spec).
6. If algum campo de tom for deixado em branco, the Briefing Service shall aplicar valores default sensatos (ex: tom 3/5 em todas as escalas) e sinalizar como "padrao — refine depois".

### Requirement 4: Identidade Visual

**Objective:** Como IA do Fury, quero ter logo, paleta e referencias visuais do cliente, para gerar criativos coerentes com a marca dele.

#### Acceptance Criteria

1. The Briefing Service shall permitir upload de logo principal (PNG/SVG/JPG, max 5MB) e logo alternativa (versao para fundo escuro).
2. The Briefing Service shall capturar paleta de cores: cor primaria, cor secundaria, cor de destaque/CTA, cor de fundo (entrada via color picker e/ou hex).
3. Where o cliente desejar, the Briefing Service shall permitir upload de ate 10 imagens de referencia visual (mood board, fotos de produto, criativos anteriores que funcionaram).
4. The Briefing Service shall armazenar todos os arquivos no bucket privado `company-assets` no Supabase Storage com path `{company_id}/branding/...` e RLS por `company_id`.
5. If o upload de arquivo exceder 5MB OU o formato nao for permitido, the Briefing Service shall rejeitar com mensagem de erro especifica indicando o limite/formatos aceitos.
6. The Briefing Service shall gerar URLs assinadas (signed URLs) com expiracao de 1h quando a IA precisar acessar os assets, nunca expondo o bucket publicamente.

### Requirement 5: Proibicoes e Compliance

**Objective:** Como dono de empresa, quero declarar o que a IA NAO pode fazer ou dizer em meu nome, para evitar criativos fora da minha politica de marca e violacoes de compliance Meta.

#### Acceptance Criteria

1. The Briefing Service shall capturar lista de palavras proibidas (texto multi-tag) que nunca devem aparecer em copy gerado.
2. The Briefing Service shall capturar lista de assuntos proibidos (ex: "concorrentes", "promessas de resultado garantido", "antes e depois").
3. The Briefing Service shall capturar restricoes visuais (ex: "nao usar fotos de pessoas", "nao usar emojis", "nao usar imagens com fundo branco").
4. Where o nicho do cliente for identificado como vertical regulada pela Meta (saude, financeiro, emagrecimento, infoproduto), the Briefing Service shall apresentar lista pre-preenchida de proibicoes recomendadas que o cliente pode aceitar/editar.
5. The Briefing Service shall expor todas as proibicoes para a futura camada de pre-flight de compliance, garantindo que estejam disponiveis em uma unica leitura por `company_id`.
6. If o usuario tentar remover uma proibicao recomendada por vertical regulada, the Briefing Service shall exibir aviso explicando o risco antes de permitir a remocao.

### Requirement 6: Edicao e Versionamento do Briefing

**Objective:** Como dono de empresa, quero editar meu briefing a qualquer momento e entender quando ele foi atualizado pela ultima vez, para manter a IA atualizada conforme meu negocio evolui.

#### Acceptance Criteria

1. The Briefing Service shall expor uma view `BriefingView` acessivel a qualquer momento via menu, exibindo todos os dados em formato editavel agrupado pelas mesmas 6 secoes do wizard.
2. When o usuario salva uma alteracao, the Briefing Service shall persistir a mudanca, atualizar `updated_at` e registrar uma entrada em `briefing_history` com `changed_by`, `changed_at` e diff dos campos alterados.
3. The Briefing Service shall manter no minimo as ultimas 20 versoes do briefing em `briefing_history` para auditoria.
4. While o usuario edita um campo, the Briefing Service shall permitir cancelar a edicao sem persistir, mantendo o valor anterior.
5. Where o usuario tiver papel `member` (nao `owner`/`admin`) na organizacao, the Briefing Service shall permitir somente leitura do briefing.
6. If o usuario remover a oferta principal, the Briefing Service shall exigir que outra oferta seja promovida a principal antes do salvamento.

### Requirement 7: Exposicao do Briefing para a IA

**Objective:** Como camada de IA (chat, gerador de criativo, publicador de campanha), quero ler o briefing completo de uma empresa em uma chamada eficiente, para tomar decisoes contextualizadas sem multiplas roundtrips.

#### Acceptance Criteria

1. The Briefing Service shall expor uma funcao SQL/RPC `get_company_briefing(company_id)` que retorna o briefing completo (negocio, ofertas, publico, tom, identidade, proibicoes) em um unico JSON estruturado.
2. The Briefing Service shall garantir que `get_company_briefing` retorne em menos de 200ms para 95% das chamadas em condicoes normais de carga.
3. While o briefing estiver com `briefing_status = 'incomplete'` ou `'not_started'`, the Briefing Service shall ainda assim retornar os dados parciais existentes, com flag `is_complete: false` no payload.
4. The Briefing Service shall incluir no payload as URLs assinadas dos assets visuais (logo, mood board) ja com expiracao curta, prontas para serem injetadas em prompts de geracao de imagem.
5. When um agente IA chamar `get_company_briefing` para uma `company_id` a qual o usuario chamador nao tem acesso, the Briefing Service shall retornar erro de autorizacao e nao expor dados.
6. The Briefing Service shall registrar cada leitura do briefing pela IA em `briefing_access_log` com `accessed_by`, `accessed_at`, `purpose` (chat / creative-generation / campaign-publish), para auditoria de uso.

### Requirement 8: Completude e Bloqueios Funcionais

**Objective:** Como produto, quero garantir que funcionalidades dependentes de briefing nao operem com dados insuficientes, para evitar geracao de output generico que prejudique a percepcao de valor da IA.

#### Acceptance Criteria

1. The Briefing Service shall calcular um score de completude (0-100%) baseado em campos obrigatorios e opcionais preenchidos, exibido em todas as telas relevantes.
2. The Briefing Service shall definir como **completude minima** (`is_complete: true`) ter no minimo: nicho, descricao da empresa, 1 oferta principal completa, persona (idade + localizacao), tom de voz (3 dimensoes), e logo OU paleta de cores.
3. While `is_complete` for `false`, the Briefing Service shall bloquear as acoes: gerar criativo via IA, publicar campanha, e exibir CTA contextual indicando o que falta.
4. The Briefing Service shall permitir uso normal do chat IA mesmo com briefing incompleto, mas a IA shall reconhecer a incompletude e sugerir ao usuario completar o briefing antes de pedidos de geracao de criativo.
5. When o usuario completar o ultimo campo obrigatorio, the Briefing Service shall transicionar `briefing_status` para `'complete'` automaticamente e desbloquear as acoes restritas.
6. If o usuario remover dados que reduzam a completude abaixo do minimo, the Briefing Service shall reverter `briefing_status` para `'incomplete'` e re-bloquear as acoes dependentes.

### Requirement 9: Seguranca e Isolamento Multi-Tenant

**Objective:** Como cliente, quero garantia de que meu briefing — incluindo dados sensiveis sobre meu negocio, ofertas e estrategia — esta isolado de outros clientes da plataforma.

#### Acceptance Criteria

1. The Briefing Service shall aplicar Row-Level Security (RLS) em todas as tabelas relacionadas (`company_briefings`, `company_offers`, `briefing_history`, `briefing_access_log`) restringindo leitura/escrita por `current_user_company_id()`.
2. The Briefing Service shall aplicar policies de Storage no bucket `company-assets` que restrinjam acesso apenas a usuarios pertencentes a `company_id` correspondente ao path.
3. The Briefing Service shall negar qualquer acesso direto a uma `company_id` diferente da que o usuario possui via `organization_members` + bridge `companies`.
4. If uma Edge Function precisar acessar briefing com `service_role`, the Briefing Service shall exigir que a function valide o `company_id` do JWT do usuario antes de qualquer leitura.
5. The Briefing Service shall ofuscar dados sensiveis (precos, depoimentos completos) em logs estruturados — apenas IDs e timestamps ficam em log claro.
6. While um membro for removido da organizacao, the Briefing Service shall imediatamente revogar acesso ao briefing daquela organizacao para esse usuario.
