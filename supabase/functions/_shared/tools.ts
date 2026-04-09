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
];
