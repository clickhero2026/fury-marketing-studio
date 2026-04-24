// Report generators — Sprint A2
// Compoem relatorios markdown reusando os data-fetchers existentes.
// Cada template segue um esqueleto fixo com headings markdown +
// secoes preenchidas pelos fetchers (que ja retornam markdown).

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  getCampaignsSummary,
  getMetricsComparison,
  getTopPerformers,
  getFuryActions,
  getComplianceStatus,
  getCampaignDetails,
  getDailyMetrics,
} from './data-fetchers.ts';

export type ReportTemplate = 'weekly_performance' | 'campaign_deep_dive';

interface ReportArgs {
  template: ReportTemplate;
  date_range?: string;     // ex: 'last_7_days', 'last_30_days'
  campaign_name?: string;  // obrigatorio se template = campaign_deep_dive
}

export async function generateReport(
  supabase: SupabaseClient,
  companyId: string,
  args: ReportArgs
): Promise<string> {
  switch (args.template) {
    case 'weekly_performance':
      return generateWeeklyPerformance(supabase, companyId, args.date_range ?? 'last_7_days');
    case 'campaign_deep_dive':
      if (!args.campaign_name) {
        return 'Erro: campaign_name e obrigatorio para o template campaign_deep_dive.';
      }
      return generateCampaignDeepDive(
        supabase,
        companyId,
        args.campaign_name,
        args.date_range ?? 'last_30_days'
      );
    default:
      return `Template "${args.template}" nao reconhecido. Templates validos: weekly_performance, campaign_deep_dive.`;
  }
}

// ---------- weekly_performance ----------

async function generateWeeklyPerformance(
  supabase: SupabaseClient,
  companyId: string,
  range: string
): Promise<string> {
  // Disparar fetchers em paralelo onde possivel
  const previousRange = range === 'last_7_days'
    ? 'previous_7_days'
    : range === 'last_14_days'
    ? 'previous_14_days'
    : 'previous_30_days';

  const [summary, comparison, topRoas, topCpa, fury, compliance] = await Promise.all([
    getCampaignsSummary(supabase, companyId, { date_range: range, limit: 10 }),
    getMetricsComparison(supabase, companyId, { period_a: range, period_b: previousRange }),
    getTopPerformers(supabase, companyId, { metric: 'website_purchase_roas', order: 'desc', limit: 3, date_range: range }),
    getTopPerformers(supabase, companyId, { metric: 'custo_conversa', order: 'asc', limit: 3, date_range: range }),
    getFuryActions(supabase, companyId, { limit: 5 }),
    getComplianceStatus(supabase, companyId, { health_filter: 'critical', limit: 5 }),
  ]);

  const today = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  return [
    `# Relatorio de Performance — ${rangeLabel(range)}`,
    `_Gerado em ${today} • ClickHero AI_`,
    ``,
    `## 1. Variacao vs Periodo Anterior`,
    comparison,
    ``,
    `## 2. Visao Geral das Campanhas`,
    summary,
    ``,
    `## 3. Top 3 por ROAS`,
    topRoas,
    ``,
    `## 4. Top 3 por Menor CPA (custo_conversa)`,
    topCpa,
    ``,
    `## 5. Acoes Recentes do FURY`,
    fury,
    ``,
    `## 6. Alertas de Compliance Criticos`,
    compliance,
    ``,
    `---`,
    `_Use este relatorio como ponto de partida. Para analise mais profunda de uma campanha especifica, peca: "deep dive na campanha X"._`,
  ].join('\n');
}

// ---------- campaign_deep_dive ----------

async function generateCampaignDeepDive(
  supabase: SupabaseClient,
  companyId: string,
  campaignName: string,
  range: string
): Promise<string> {
  const [details, daily, fury] = await Promise.all([
    getCampaignDetails(supabase, companyId, { campaign_name: campaignName, date_range: range }),
    getDailyMetrics(supabase, companyId, { campaign_name: campaignName, days: 14 }),
    getFuryActions(supabase, companyId, { limit: 10 }),
  ]);

  const today = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  return [
    `# Deep Dive — Campanha "${campaignName}"`,
    `_Gerado em ${today} • Periodo: ${rangeLabel(range)}_`,
    ``,
    `## 1. Detalhes e Metricas Agregadas`,
    details,
    ``,
    `## 2. Tendencia Diaria (ultimos 14 dias)`,
    daily,
    ``,
    `## 3. Acoes Recentes do FURY`,
    fury,
    ``,
    `---`,
    `_Pergunte "como melhorar essa campanha?" pra recomendacoes especificas._`,
  ].join('\n');
}

function rangeLabel(range: string): string {
  switch (range) {
    case 'last_7_days': return 'ultimos 7 dias';
    case 'last_14_days': return 'ultimos 14 dias';
    case 'last_30_days': return 'ultimos 30 dias';
    case 'this_month': return 'mes atual';
    default: return range;
  }
}
