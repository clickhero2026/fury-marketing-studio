/**
 * OpenAI Function Calling tools — definições das funções que o GPT pode invocar.
 */
export const CHAT_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_campaigns_summary',
      description:
        'Busca resumo das campanhas do usuario com metricas agregadas. Use quando o usuario pergunta sobre performance geral, campanhas ativas, ou quer uma visao geral.',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['ACTIVE', 'PAUSED', 'ALL'],
            description: 'Filtrar por status da campanha',
          },
          date_range: {
            type: 'string',
            enum: ['last_7_days', 'last_14_days', 'last_30_days', 'this_month'],
            description: 'Periodo de tempo para metricas',
          },
          limit: {
            type: 'number',
            description: 'Numero maximo de campanhas (default 10)',
          },
        },
        required: ['date_range'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_campaign_details',
      description:
        'Busca detalhes e metricas de uma campanha especifica por nome. Use quando o usuario menciona uma campanha pelo nome ou quer detalhes de uma campanha especifica.',
      parameters: {
        type: 'object',
        properties: {
          campaign_name: {
            type: 'string',
            description: 'Nome (parcial) da campanha para buscar',
          },
          date_range: {
            type: 'string',
            enum: ['last_7_days', 'last_14_days', 'last_30_days'],
            description: 'Periodo',
          },
        },
        required: ['campaign_name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_metrics_comparison',
      description:
        'Compara metricas entre dois periodos. Use quando o usuario pede comparacao (semana vs semana, mes vs mes, ontem vs hoje).',
      parameters: {
        type: 'object',
        properties: {
          period_a: {
            type: 'string',
            enum: ['last_7_days', 'last_14_days', 'last_30_days'],
            description: 'Periodo atual',
          },
          period_b: {
            type: 'string',
            enum: ['previous_7_days', 'previous_14_days', 'previous_30_days'],
            description: 'Periodo anterior para comparar',
          },
          campaign_name: {
            type: 'string',
            description: 'Nome da campanha (opcional, se vazio compara todas)',
          },
        },
        required: ['period_a', 'period_b'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_top_performers',
      description:
        'Busca campanhas com melhor ou pior performance por metrica. Use para ranking, "qual campanha gasta mais?", "qual tem melhor CTR?"',
      parameters: {
        type: 'object',
        properties: {
          metric: {
            type: 'string',
            enum: [
              'investimento',
              'impressoes',
              'cliques',
              'cpc',
              'cpm',
              'conversas_iniciadas',
              'custo_conversa',
              'website_purchase_roas',
              'unique_ctr',
            ],
            description: 'Metrica para ranquear',
          },
          order: {
            type: 'string',
            enum: ['best', 'worst'],
            description: 'Melhor ou pior performance',
          },
          limit: { type: 'number', description: 'Quantidade (default 5)' },
          date_range: {
            type: 'string',
            enum: ['last_7_days', 'last_14_days', 'last_30_days'],
          },
        },
        required: ['metric', 'order'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_daily_metrics',
      description:
        'Busca metricas diarias para analise de tendencia e evolucao. Use quando o usuario quer ver evolucao ao longo do tempo, graficos, ou tendencias.',
      parameters: {
        type: 'object',
        properties: {
          campaign_name: {
            type: 'string',
            description: 'Nome da campanha (opcional, se vazio mostra total)',
          },
          days: {
            type: 'number',
            description: 'Ultimos N dias (default 7, max 30)',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_account_info',
      description:
        'Busca informacoes sobre as contas Meta conectadas, ad accounts, e status da integracao. Use quando o usuario pergunta sobre conexao, contas, ou status.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  // ---- FURY tools ----
  {
    type: 'function' as const,
    function: {
      name: 'get_fury_actions',
      description:
        'Busca acoes recentes do algoritmo FURY (pausas automaticas, alertas, sugestoes). Use quando o usuario pergunta "o que o FURY fez?", "tem alguma acao pendente?", "quais campanhas foram pausadas?".',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['pending', 'executed', 'reverted', 'all'],
            description: 'Filtrar por status da acao (default all)',
          },
          limit: { type: 'number', description: 'Quantidade (default 10, max 50)' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_fury_evaluations',
      description:
        'Busca avaliacoes de performance das campanhas feitas pelo FURY (metricas 7d, tendencia, health status). Use quando o usuario pergunta "como estao minhas campanhas?", "qual campanha precisa de atencao?", "tendencias".',
      parameters: {
        type: 'object',
        properties: {
          health_filter: {
            type: 'string',
            enum: ['healthy', 'attention', 'critical', 'all'],
            description: 'Filtrar por saude (default all)',
          },
          limit: { type: 'number', description: 'Quantidade (default 10)' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_compliance_status',
      description:
        'Busca status de compliance dos anuncios (scores, violacoes, takedowns). Use quando o usuario pergunta "tem algum anuncio com problema?", "compliance", "violacoes", "anuncios pausados por compliance".',
      parameters: {
        type: 'object',
        properties: {
          health_filter: {
            type: 'string',
            enum: ['healthy', 'warning', 'critical', 'all'],
            description: 'Filtrar por health status (default all)',
          },
          include_violations: {
            type: 'boolean',
            description: 'Incluir detalhes das violacoes (default false)',
          },
          limit: { type: 'number', description: 'Quantidade (default 10)' },
        },
      },
    },
  },
  // ---- PROPOSE tools (criam approval pendente — HITL) ----
  // IMPORTANTE: estas tools NAO executam mudancas direto na Meta API.
  // Elas criam um pedido de aprovacao na tabela `approvals` que o usuario
  // precisa confirmar via UI nos proximos 5 minutos.
  {
    type: 'function' as const,
    function: {
      name: 'pause_campaign',
      description:
        'Cria solicitacao de aprovacao para PAUSAR uma campanha. NAO executa direto — o usuario precisa aprovar via painel. Use quando o usuario pedir "pausa a campanha X", "desliga", "para de rodar X". Sempre informe que a acao foi enviada para aprovacao.',
      parameters: {
        type: 'object',
        properties: {
          campaign_name: {
            type: 'string',
            description: 'Nome (parcial) da campanha para pausar',
          },
        },
        required: ['campaign_name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'reactivate_campaign',
      description:
        'Cria solicitacao de aprovacao para REATIVAR uma campanha pausada. NAO executa direto — o usuario precisa aprovar. Use quando o usuario pedir "reativa", "liga de novo", "volta a campanha X".',
      parameters: {
        type: 'object',
        properties: {
          campaign_name: {
            type: 'string',
            description: 'Nome (parcial) da campanha para reativar',
          },
        },
        required: ['campaign_name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_budget',
      description:
        'Cria solicitacao de aprovacao para ALTERAR o budget diario de uma campanha. NAO executa direto — o usuario precisa aprovar. Use quando o usuario pedir "muda o budget", "aumenta para R$ X", "diminui o orcamento".',
      parameters: {
        type: 'object',
        properties: {
          campaign_name: {
            type: 'string',
            description: 'Nome (parcial) da campanha',
          },
          daily_budget_brl: {
            type: 'number',
            description: 'Novo budget diario em BRL (reais). Ex: 50 = R$ 50,00 por dia.',
          },
        },
        required: ['campaign_name', 'daily_budget_brl'],
      },
    },
  },
];
