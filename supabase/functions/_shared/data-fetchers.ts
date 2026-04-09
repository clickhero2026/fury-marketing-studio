import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Data fetchers — queries seguras para cada tool do Function Calling.
 * Todas retornam dados formatados em Markdown para o LLM.
 */

// Helper: calcular datas baseado em date_range
function getDateRange(range: string): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString().split('T')[0];
  let start: Date;

  switch (range) {
    case 'last_7_days':
      start = new Date(now.getTime() - 7 * 86400000);
      break;
    case 'last_14_days':
      start = new Date(now.getTime() - 14 * 86400000);
      break;
    case 'last_30_days':
    case 'this_month':
      start = new Date(now.getTime() - 30 * 86400000);
      break;
    case 'previous_7_days':
      start = new Date(now.getTime() - 14 * 86400000);
      return { start: start.toISOString().split('T')[0], end: new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0] };
    case 'previous_14_days':
      start = new Date(now.getTime() - 28 * 86400000);
      return { start: start.toISOString().split('T')[0], end: new Date(now.getTime() - 14 * 86400000).toISOString().split('T')[0] };
    case 'previous_30_days':
      start = new Date(now.getTime() - 60 * 86400000);
      return { start: start.toISOString().split('T')[0], end: new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0] };
    default:
      start = new Date(now.getTime() - 7 * 86400000);
  }

  return { start: start.toISOString().split('T')[0], end };
}

function formatCurrency(val: number | null): string {
  if (val === null || val === undefined) return '—';
  return `R$ ${val.toFixed(2)}`;
}

function formatNumber(val: number | null): string {
  if (val === null || val === undefined) return '—';
  if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
  return val.toString();
}

// ========== TOOL IMPLEMENTATIONS ==========

export async function getCampaignsSummary(
  supabase: SupabaseClient,
  companyId: string,
  args: { status?: string; date_range: string; limit?: number }
): Promise<string> {
  const { start, end } = getDateRange(args.date_range);
  const limit = args.limit ?? 10;

  // Buscar métricas agregadas por campanha
  const { data, error } = await supabase
    .from('campaign_metrics')
    .select('campanha, impressoes, cliques, cpc, cpm, investimento, conversas_iniciadas, custo_conversa, website_purchase_roas, unique_ctr')
    .eq('company_id', companyId)
    .gte('data', start)
    .lte('data', end)
    .order('investimento', { ascending: false });

  if (error || !data || data.length === 0) {
    return `Nenhuma metrica encontrada para o periodo ${args.date_range}. Verifique se as campanhas estao sincronizadas.`;
  }

  // Agregar por campanha
  const bycamp = new Map<string, { impressoes: number; cliques: number; investimento: number; conversas: number; roas: number; count: number }>();
  for (const row of data) {
    const name = row.campanha ?? 'Sem nome';
    const curr = bycamp.get(name) ?? { impressoes: 0, cliques: 0, investimento: 0, conversas: 0, roas: 0, count: 0 };
    curr.impressoes += row.impressoes ?? 0;
    curr.cliques += row.cliques ?? 0;
    curr.investimento += Number(row.investimento) || 0;
    curr.conversas += row.conversas_iniciadas ?? 0;
    curr.roas += Number(row.website_purchase_roas) || 0;
    curr.count += 1;
    bycamp.set(name, curr);
  }

  // Formatar como markdown
  const sorted = [...bycamp.entries()].sort((a, b) => b[1].investimento - a[1].investimento).slice(0, limit);

  let totalInvest = 0, totalImpr = 0, totalClicks = 0, totalConversas = 0;
  let md = `| Campanha | Investimento | Impressoes | Cliques | CTR | CPC | Conversas | ROAS |\n`;
  md += `|----------|-------------|------------|---------|-----|-----|-----------|------|\n`;

  for (const [name, m] of sorted) {
    const ctr = m.impressoes > 0 ? ((m.cliques / m.impressoes) * 100).toFixed(2) + '%' : '—';
    const cpc = m.cliques > 0 ? formatCurrency(m.investimento / m.cliques) : '—';
    const roas = m.count > 0 ? (m.roas / m.count).toFixed(2) + 'x' : '—';
    md += `| ${name.substring(0, 30)} | ${formatCurrency(m.investimento)} | ${formatNumber(m.impressoes)} | ${formatNumber(m.cliques)} | ${ctr} | ${cpc} | ${m.conversas} | ${roas} |\n`;
    totalInvest += m.investimento;
    totalImpr += m.impressoes;
    totalClicks += m.cliques;
    totalConversas += m.conversas;
  }

  md += `\n**Resumo (${args.date_range}):** ${sorted.length} campanhas, investimento total ${formatCurrency(totalInvest)}, ${formatNumber(totalImpr)} impressoes, ${formatNumber(totalClicks)} cliques, ${totalConversas} conversas`;
  if (totalClicks > 0) md += `, CPC medio ${formatCurrency(totalInvest / totalClicks)}`;
  if (totalImpr > 0) md += `, CTR medio ${((totalClicks / totalImpr) * 100).toFixed(2)}%`;

  return md;
}

export async function getCampaignDetails(
  supabase: SupabaseClient,
  companyId: string,
  args: { campaign_name: string; date_range?: string }
): Promise<string> {
  const { start, end } = getDateRange(args.date_range ?? 'last_7_days');

  const { data, error } = await supabase
    .from('campaign_metrics')
    .select('*')
    .eq('company_id', companyId)
    .ilike('campanha', `%${args.campaign_name}%`)
    .gte('data', start)
    .lte('data', end)
    .order('data', { ascending: false });

  if (error || !data || data.length === 0) {
    return `Nenhuma campanha encontrada com nome "${args.campaign_name}" no periodo.`;
  }

  const name = data[0].campanha;
  let totalImpr = 0, totalClicks = 0, totalInvest = 0, totalConversas = 0;
  let md = `## Detalhes: ${name}\n\n`;
  md += `| Data | Impressoes | Cliques | CPC | Investimento | Conversas | ROAS |\n`;
  md += `|------|------------|---------|-----|-------------|-----------|------|\n`;

  for (const row of data.slice(0, 14)) {
    const date = row.data ? new Date(row.data).toLocaleDateString('pt-BR') : '—';
    md += `| ${date} | ${formatNumber(row.impressoes)} | ${formatNumber(row.cliques)} | ${formatCurrency(Number(row.cpc))} | ${formatCurrency(Number(row.investimento))} | ${row.conversas_iniciadas ?? 0} | ${row.website_purchase_roas ? Number(row.website_purchase_roas).toFixed(2) + 'x' : '—'} |\n`;
    totalImpr += row.impressoes ?? 0;
    totalClicks += row.cliques ?? 0;
    totalInvest += Number(row.investimento) || 0;
    totalConversas += row.conversas_iniciadas ?? 0;
  }

  md += `\n**Total:** ${formatNumber(totalImpr)} impressoes, ${formatNumber(totalClicks)} cliques, ${formatCurrency(totalInvest)} investido, ${totalConversas} conversas`;
  if (data[0].quality_ranking) md += `\nQuality Ranking: ${data[0].quality_ranking}`;
  if (data[0].engagement_rate_ranking) md += ` | Engagement: ${data[0].engagement_rate_ranking}`;

  return md;
}

export async function getMetricsComparison(
  supabase: SupabaseClient,
  companyId: string,
  args: { period_a: string; period_b: string; campaign_name?: string }
): Promise<string> {
  const rangeA = getDateRange(args.period_a);
  const rangeB = getDateRange(args.period_b);

  let queryA = supabase.from('campaign_metrics').select('impressoes, cliques, investimento, conversas_iniciadas, website_purchase_roas').eq('company_id', companyId).gte('data', rangeA.start).lte('data', rangeA.end);
  let queryB = supabase.from('campaign_metrics').select('impressoes, cliques, investimento, conversas_iniciadas, website_purchase_roas').eq('company_id', companyId).gte('data', rangeB.start).lte('data', rangeB.end);

  if (args.campaign_name) {
    queryA = queryA.ilike('campanha', `%${args.campaign_name}%`);
    queryB = queryB.ilike('campanha', `%${args.campaign_name}%`);
  }

  const [{ data: dataA }, { data: dataB }] = await Promise.all([queryA, queryB]);

  const sumA = aggregate(dataA ?? []);
  const sumB = aggregate(dataB ?? []);

  const pct = (a: number, b: number) => {
    if (b === 0) return '—';
    const diff = ((a - b) / b) * 100;
    return `${diff > 0 ? '↑' : '↓'} ${Math.abs(diff).toFixed(1)}%`;
  };

  let md = `## Comparacao: ${args.period_a} vs ${args.period_b}\n`;
  if (args.campaign_name) md += `Campanha: ${args.campaign_name}\n`;
  md += `\n| Metrica | Periodo Atual | Periodo Anterior | Variacao |\n`;
  md += `|---------|--------------|-----------------|----------|\n`;
  md += `| Impressoes | ${formatNumber(sumA.impressoes)} | ${formatNumber(sumB.impressoes)} | ${pct(sumA.impressoes, sumB.impressoes)} |\n`;
  md += `| Cliques | ${formatNumber(sumA.cliques)} | ${formatNumber(sumB.cliques)} | ${pct(sumA.cliques, sumB.cliques)} |\n`;
  md += `| Investimento | ${formatCurrency(sumA.investimento)} | ${formatCurrency(sumB.investimento)} | ${pct(sumA.investimento, sumB.investimento)} |\n`;
  md += `| Conversas | ${sumA.conversas} | ${sumB.conversas} | ${pct(sumA.conversas, sumB.conversas)} |\n`;

  const ctrA = sumA.impressoes > 0 ? (sumA.cliques / sumA.impressoes * 100) : 0;
  const ctrB = sumB.impressoes > 0 ? (sumB.cliques / sumB.impressoes * 100) : 0;
  md += `| CTR | ${ctrA.toFixed(2)}% | ${ctrB.toFixed(2)}% | ${pct(ctrA, ctrB)} |\n`;

  const cpcA = sumA.cliques > 0 ? sumA.investimento / sumA.cliques : 0;
  const cpcB = sumB.cliques > 0 ? sumB.investimento / sumB.cliques : 0;
  md += `| CPC | ${formatCurrency(cpcA)} | ${formatCurrency(cpcB)} | ${pct(cpcA, cpcB)} |\n`;

  return md;
}

function aggregate(rows: Array<{ impressoes: number | null; cliques: number | null; investimento: number | null; conversas_iniciadas: number | null; website_purchase_roas: number | null }>) {
  let impressoes = 0, cliques = 0, investimento = 0, conversas = 0;
  for (const r of rows) {
    impressoes += r.impressoes ?? 0;
    cliques += r.cliques ?? 0;
    investimento += Number(r.investimento) || 0;
    conversas += r.conversas_iniciadas ?? 0;
  }
  return { impressoes, cliques, investimento, conversas };
}

export async function getTopPerformers(
  supabase: SupabaseClient,
  companyId: string,
  args: { metric: string; order: string; limit?: number; date_range?: string }
): Promise<string> {
  const { start, end } = getDateRange(args.date_range ?? 'last_7_days');
  const limit = args.limit ?? 5;

  const { data, error } = await supabase
    .from('campaign_metrics')
    .select('campanha, impressoes, cliques, investimento, conversas_iniciadas, cpc, cpm, custo_conversa, website_purchase_roas, unique_ctr')
    .eq('company_id', companyId)
    .gte('data', start)
    .lte('data', end);

  if (error || !data || data.length === 0) {
    return 'Nenhuma metrica encontrada para o periodo.';
  }

  // Agregar por campanha
  const bycamp = new Map<string, { total: number; count: number; impressoes: number; cliques: number; investimento: number }>();
  for (const row of data) {
    const name = row.campanha ?? 'Sem nome';
    const curr = bycamp.get(name) ?? { total: 0, count: 0, impressoes: 0, cliques: 0, investimento: 0 };
    curr.total += Number((row as Record<string, unknown>)[args.metric]) || 0;
    curr.count += 1;
    curr.impressoes += row.impressoes ?? 0;
    curr.cliques += row.cliques ?? 0;
    curr.investimento += Number(row.investimento) || 0;
    bycamp.set(name, curr);
  }

  const ascending = args.order === 'worst';
  const sorted = [...bycamp.entries()].sort((a, b) => ascending ? a[1].total - b[1].total : b[1].total - a[1].total).slice(0, limit);

  let md = `## ${args.order === 'best' ? 'Melhores' : 'Piores'} por ${args.metric}\n\n`;
  md += `| # | Campanha | ${args.metric} | Investimento | Impressoes |\n`;
  md += `|---|----------|${'-'.repeat(args.metric.length + 2)}|-------------|------------|\n`;

  sorted.forEach(([name, m], i) => {
    const val = ['investimento', 'cpc', 'cpm', 'custo_conversa'].includes(args.metric)
      ? formatCurrency(m.total / (m.count || 1))
      : formatNumber(m.total);
    md += `| ${i + 1} | ${name.substring(0, 30)} | ${val} | ${formatCurrency(m.investimento)} | ${formatNumber(m.impressoes)} |\n`;
  });

  return md;
}

export async function getDailyMetrics(
  supabase: SupabaseClient,
  companyId: string,
  args: { campaign_name?: string; days?: number }
): Promise<string> {
  const days = Math.min(args.days ?? 7, 30);
  const start = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

  let query = supabase
    .from('campaign_metrics')
    .select('data, impressoes, cliques, investimento, conversas_iniciadas, website_purchase_roas')
    .eq('company_id', companyId)
    .gte('data', start)
    .order('data', { ascending: true });

  if (args.campaign_name) {
    query = query.ilike('campanha', `%${args.campaign_name}%`);
  }

  const { data, error } = await query;

  if (error || !data || data.length === 0) {
    return `Nenhuma metrica diaria encontrada para os ultimos ${days} dias.`;
  }

  // Agregar por dia
  const byDay = new Map<string, { impressoes: number; cliques: number; investimento: number; conversas: number }>();
  for (const row of data) {
    const day = row.data ? new Date(row.data).toLocaleDateString('pt-BR') : 'Sem data';
    const curr = byDay.get(day) ?? { impressoes: 0, cliques: 0, investimento: 0, conversas: 0 };
    curr.impressoes += row.impressoes ?? 0;
    curr.cliques += row.cliques ?? 0;
    curr.investimento += Number(row.investimento) || 0;
    curr.conversas += row.conversas_iniciadas ?? 0;
    byDay.set(day, curr);
  }

  let md = `## Metricas Diarias (ultimos ${days} dias)\n`;
  if (args.campaign_name) md += `Campanha: ${args.campaign_name}\n`;
  md += `\n| Data | Impressoes | Cliques | CTR | Investimento | Conversas |\n`;
  md += `|------|------------|---------|-----|-------------|----------|\n`;

  for (const [day, m] of byDay) {
    const ctr = m.impressoes > 0 ? ((m.cliques / m.impressoes) * 100).toFixed(2) + '%' : '—';
    md += `| ${day} | ${formatNumber(m.impressoes)} | ${formatNumber(m.cliques)} | ${ctr} | ${formatCurrency(m.investimento)} | ${m.conversas} |\n`;
  }

  return md;
}

export async function getAccountInfo(
  supabase: SupabaseClient,
  companyId: string
): Promise<string> {
  const { data: integration } = await supabase
    .from('integrations')
    .select('facebook_user_name, account_name, business_name, status, token_expires_at, last_sync')
    .eq('company_id', companyId)
    .eq('platform', 'meta')
    .single();

  if (!integration) {
    return 'Nenhuma conta Meta conectada. Va em Integracoes para conectar sua conta.';
  }

  const { data: accounts } = await supabase
    .from('meta_ad_accounts')
    .select('account_name, account_id, account_status, currency')
    .eq('company_id', companyId);

  let md = `## Conta Meta Conectada\n\n`;
  md += `- **Usuario:** ${integration.facebook_user_name ?? '—'}\n`;
  md += `- **Business:** ${integration.business_name ?? '—'}\n`;
  md += `- **Status:** ${integration.status ?? '—'}\n`;
  if (integration.token_expires_at) {
    const daysLeft = Math.ceil((new Date(integration.token_expires_at).getTime() - Date.now()) / 86400000);
    md += `- **Token expira em:** ${daysLeft} dias\n`;
  }
  if (integration.last_sync) {
    md += `- **Ultima sync:** ${new Date(integration.last_sync).toLocaleString('pt-BR')}\n`;
  }

  if (accounts && accounts.length > 0) {
    md += `\n### Ad Accounts (${accounts.length})\n`;
    for (const acc of accounts) {
      md += `- ${acc.account_name ?? acc.account_id} (${acc.currency ?? '—'}) — Status: ${acc.account_status ?? '—'}\n`;
    }
  }

  return md;
}
