import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';

/**
 * FURY v0 — Motor de regras deterministicas para otimizacao de anuncios.
 *
 * Avalia campanhas contra regras configuraveis usando historico 7 dias
 * de campaign_metrics. NAO e ML — regras puras.
 *
 * Regras: saturation, high_cpa, low_ctr, budget_exhausted, scaling_opportunity
 * Acoes: pause (Meta API), alert (log), suggest (log)
 * Cron: hourly via fury-evaluate-tick
 */

const GRAPH_VERSION = Deno.env.get('META_GRAPH_API_VERSION') ?? 'v22.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const MAX_CAMPAIGNS_PER_RUN = 100;
const REVERT_WINDOW_MS = 30 * 60_000; // 30 minutes
const DEDUP_WINDOW_HOURS = 24;

// ============================================================
// Types
// ============================================================

interface FuryRule {
  id: string;
  rule_key: string;
  display_name: string;
  is_enabled: boolean;
  auto_execute: boolean;
  threshold_value: number;
  threshold_unit: string;
  consecutive_days: number;
  action_type: 'pause' | 'alert' | 'suggest';
}

interface CampaignWithMetrics {
  id: string;
  external_id: string;
  name: string;
  status: string | null;
  daily_budget: number | null;
  lifetime_budget: number | null;
  // Aggregated 7-day metrics
  dailyMetrics: DayMetric[];
  avgCtr: number;
  avgCpm: number;
  avgCpc: number;
  avgFrequency: number;
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  dailyCpa: number;
  budgetPctUsed: number;
  trendDirection: 'improving' | 'stable' | 'worsening' | 'insufficient_data';
  trendPctChange: number;
  daysWithData: number;
}

interface DayMetric {
  data: string;
  impressoes: number;
  cliques: number;
  cpc: number;
  cpm: number;
  investimento: number;
  conversas_iniciadas: number;
  reach: number | null;
  frequency: number | null;
}

interface ScanStats {
  campaigns_evaluated: number;
  rules_triggered: number;
  actions_executed: number;
  errors: string[];
}

// ============================================================
// Metrics aggregation (7-day window)
// ============================================================

function aggregateMetrics(
  dailyMetrics: DayMetric[],
  dailyBudget: number | null,
  lifetimeBudget: number | null,
): Omit<CampaignWithMetrics, 'id' | 'external_id' | 'name' | 'status' | 'daily_budget' | 'lifetime_budget' | 'dailyMetrics'> {
  const days = dailyMetrics.length;

  if (days < 1) {
    return {
      avgCtr: 0, avgCpm: 0, avgCpc: 0, avgFrequency: 0,
      totalSpend: 0, totalImpressions: 0, totalClicks: 0, totalConversions: 0,
      dailyCpa: 0, budgetPctUsed: 0,
      trendDirection: 'insufficient_data', trendPctChange: 0, daysWithData: 0,
    };
  }

  const totalImpressions = dailyMetrics.reduce((s, d) => s + (d.impressoes ?? 0), 0);
  const totalClicks = dailyMetrics.reduce((s, d) => s + (d.cliques ?? 0), 0);
  const totalSpend = dailyMetrics.reduce((s, d) => s + (d.investimento ?? 0), 0);
  const totalConversions = dailyMetrics.reduce((s, d) => s + (d.conversas_iniciadas ?? 0), 0);

  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const avgCpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const dailyCpa = totalConversions > 0 ? totalSpend / totalConversions : 0;

  // Frequency: usar valor real se disponivel, senao fallback impressions/reach
  const freqValues = dailyMetrics.map((d) => d.frequency).filter((f): f is number => f != null && f > 0);
  const reachValues = dailyMetrics.map((d) => d.reach).filter((r): r is number => r != null && r > 0);
  const totalReach = reachValues.reduce((s, r) => s + r, 0);

  let avgFrequency: number;
  if (freqValues.length > 0) {
    // Media ponderada por impressoes
    let weightedSum = 0;
    let weightTotal = 0;
    for (const d of dailyMetrics) {
      if (d.frequency != null && d.frequency > 0) {
        const w = d.impressoes ?? 1;
        weightedSum += d.frequency * w;
        weightTotal += w;
      }
    }
    avgFrequency = weightTotal > 0 ? weightedSum / weightTotal : 0;
  } else if (totalReach > 0) {
    avgFrequency = totalImpressions / totalReach;
  } else {
    avgFrequency = 0; // sem dados de frequency ou reach — nao dispara regra saturation
  }

  // Budget % used (7-day spend vs 7-day budget)
  const budgetTotal = dailyBudget ? dailyBudget * days : lifetimeBudget ?? 0;
  const budgetPctUsed = budgetTotal > 0 ? (totalSpend / budgetTotal) * 100 : 0;

  // Trend: comparar CPAs diarios pra detectar melhora/piora
  let trendDirection: 'improving' | 'stable' | 'worsening' | 'insufficient_data' = 'insufficient_data';
  let trendPctChange = 0;

  if (days >= 3) {
    const dailyCpas = dailyMetrics.map((d) => {
      const conv = d.conversas_iniciadas ?? 0;
      return conv > 0 ? (d.investimento ?? 0) / conv : null;
    }).filter((v): v is number => v !== null);

    if (dailyCpas.length >= 3) {
      // Variacao media dia-a-dia
      let totalChange = 0;
      let improvingDays = 0;
      let worseningDays = 0;
      for (let i = 1; i < dailyCpas.length; i++) {
        const prev = dailyCpas[i - 1];
        if (prev > 0) {
          const change = ((dailyCpas[i] - prev) / prev) * 100;
          totalChange += change;
          if (change < -5) improvingDays++; // CPA diminuindo = bom
          if (change > 5) worseningDays++;
        }
      }
      trendPctChange = totalChange / (dailyCpas.length - 1);

      if (improvingDays >= 3) trendDirection = 'improving';
      else if (worseningDays >= 3) trendDirection = 'worsening';
      else trendDirection = 'stable';
    }
  }

  return {
    avgCtr, avgCpm, avgCpc, avgFrequency, totalSpend, totalImpressions,
    totalClicks, totalConversions, dailyCpa, budgetPctUsed,
    trendDirection, trendPctChange, daysWithData: days,
  };
}

// ============================================================
// Rule engine
// ============================================================

interface RuleResult {
  triggered: boolean;
  metricName: string;
  metricValue: number;
}

/**
 * Conta quantos dos ultimos N dias (do fim do array) satisfazem o predicado.
 * Retorna o comprimento da sequencia consecutiva mais recente.
 * Ex: [false, true, true, true] → 3 consecutivos recentes.
 */
function countConsecutiveFromEnd(dailyMetrics: DayMetric[], predicate: (d: DayMetric) => boolean): number {
  let count = 0;
  for (let i = dailyMetrics.length - 1; i >= 0; i--) {
    if (predicate(dailyMetrics[i])) count++;
    else break; // interrompe na primeira falha
  }
  return count;
}

function getLocalHour(timezone: string): number {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: timezone });
    return parseInt(formatter.format(now), 10);
  } catch {
    return new Date().getUTCHours() - 3; // fallback BRT
  }
}

function evaluateRule(rule: FuryRule, campaign: CampaignWithMetrics, timezone: string): RuleResult {
  const noTrigger = (name: string, value: number): RuleResult => ({ triggered: false, metricName: name, metricValue: value });
  const metrics = campaign.dailyMetrics;

  if (campaign.daysWithData < rule.consecutive_days) {
    return noTrigger('days_with_data', campaign.daysWithData);
  }

  switch (rule.rule_key) {
    case 'saturation': {
      // Frequency > threshold por N dias consecutivos RECENTES
      // Prioridade: (1) freq real, (2) impressoes/reach, (3) skip dia (sem dados)
      const consecutiveDays = countConsecutiveFromEnd(metrics, (d) => {
        let freq = d.frequency ?? 0;
        if (freq === 0 && d.reach && d.reach > 0 && d.impressoes > 0) {
          freq = d.impressoes / d.reach;
        }
        if (freq === 0) return false; // dia sem dados de freq/reach nao interrompe sequencia errada — retorna false
        return freq > rule.threshold_value;
      });
      const val = campaign.avgFrequency;
      return { triggered: consecutiveDays >= rule.consecutive_days, metricName: 'frequency', metricValue: val };
    }
    case 'high_cpa': {
      // CPA > threshold por N dias consecutivos
      const consecutiveDays = countConsecutiveFromEnd(metrics, (d) => {
        const conv = d.conversas_iniciadas ?? 0;
        if (conv === 0) return false; // dia sem conversao nao conta como "CPA alto"
        const cpa = (d.investimento ?? 0) / conv;
        return cpa > rule.threshold_value;
      });
      const val = campaign.dailyCpa;
      if (campaign.totalConversions === 0) return noTrigger('cpa', 0);
      return { triggered: consecutiveDays >= rule.consecutive_days, metricName: 'cpa', metricValue: val };
    }
    case 'low_ctr': {
      // CTR < threshold por N dias consecutivos
      const consecutiveDays = countConsecutiveFromEnd(metrics, (d) => {
        const imp = d.impressoes ?? 0;
        const clk = d.cliques ?? 0;
        if (imp === 0) return false;
        const ctr = (clk / imp) * 100;
        return ctr < rule.threshold_value && ctr > 0;
      });
      const val = campaign.avgCtr;
      return { triggered: consecutiveDays >= rule.consecutive_days, metricName: 'ctr', metricValue: val };
    }
    case 'budget_exhausted': {
      // A4: Budget > threshold% E hora local < 18h (orcamento esgotado cedo = problema)
      const val = campaign.budgetPctUsed;
      const localHour = getLocalHour(timezone);
      const isBefore18h = localHour < 18;
      return { triggered: val > rule.threshold_value && isBefore18h, metricName: 'budget_pct', metricValue: val };
    }
    case 'scaling_opportunity': {
      // A5: CPA esta X% abaixo da media 7d por N dias consecutivos + tendencia improving
      if (campaign.totalConversions === 0 || campaign.trendDirection !== 'improving') {
        return noTrigger('cpa_trend', campaign.dailyCpa);
      }
      const avgCpa7d = campaign.dailyCpa; // media 7d
      // threshold_value = % abaixo (ex: 20 = CPA precisa estar 20% abaixo da media)
      const targetCpa = avgCpa7d * (1 - rule.threshold_value / 100);
      const consecutiveDays = countConsecutiveFromEnd(metrics, (d) => {
        const conv = d.conversas_iniciadas ?? 0;
        if (conv === 0) return false;
        const dailyCpa = (d.investimento ?? 0) / conv;
        return dailyCpa > 0 && dailyCpa < targetCpa;
      });
      const val = campaign.dailyCpa;
      return { triggered: consecutiveDays >= rule.consecutive_days, metricName: 'cpa_vs_avg', metricValue: val };
    }
    default:
      return noTrigger('unknown', 0);
  }
}

// ============================================================
// Meta API pause/unpause
// ============================================================

async function pauseCampaign(metaToken: string, externalId: string): Promise<{ ok: boolean; response: unknown }> {
  try {
    const res = await fetch(`${GRAPH_BASE}/${externalId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Bearer ${metaToken}` },
      body: 'status=PAUSED',
    });
    const body = await res.json();
    return { ok: res.ok, response: body };
  } catch (err) {
    return { ok: false, response: { error: (err as Error).message } };
  }
}

async function reactivateCampaign(metaToken: string, externalId: string): Promise<{ ok: boolean; response: unknown }> {
  try {
    const res = await fetch(`${GRAPH_BASE}/${externalId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Bearer ${metaToken}` },
      body: 'status=ACTIVE',
    });
    const body = await res.json();
    return { ok: res.ok, response: body };
  } catch (err) {
    return { ok: false, response: { error: (err as Error).message } };
  }
}

// ============================================================
// HTTP handler
// ============================================================

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // ---- Auth ----
  let companyId: string;
  let body: { company_id?: string; revert_action_id?: string } = {};
  try { body = await req.json(); } catch { body = {}; }

  const cronSecret = req.headers.get('x-cron-secret');
  const expectedCronSecret = Deno.env.get('CRON_SECRET');

  if (cronSecret && expectedCronSecret && cronSecret === expectedCronSecret) {
    if (!body.company_id) {
      return new Response(JSON.stringify({ error: 'company_id required' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    companyId = body.company_id;
  } else {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: { user }, error: ue } = await supabaseUser.auth.getUser();
    if (ue || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    const { data: profile } = await supabase.from('profiles').select('current_organization_id').eq('id', user.id).single();
    if (!profile?.current_organization_id) {
      return new Response(JSON.stringify({ error: 'Org not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const { data: company } = await supabase.from('companies').select('id').eq('organization_id', profile.current_organization_id).single();
    if (!company) {
      return new Response(JSON.stringify({ error: 'Company not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    companyId = company.id;
  }

  // ---- Revert handler ----
  if (body.revert_action_id) {
    const { data: action } = await supabase
      .from('fury_actions')
      .select('id, campaign_external_id, campaign_id, campaign_name, rule_key, status, revert_before')
      .eq('id', body.revert_action_id)
      .eq('company_id', companyId)
      .single();

    if (!action) {
      return new Response(JSON.stringify({ error: 'Acao nao encontrada' }), {
        status: 404, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    if (action.status !== 'executed') {
      return new Response(JSON.stringify({ error: 'Acao nao pode ser revertida (status: ' + action.status + ')' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    if (action.revert_before && new Date(action.revert_before).getTime() < Date.now()) {
      return new Response(JSON.stringify({ error: 'Janela de reversao expirada (30 min)' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // Get meta token
    const { data: integration } = await supabase
      .from('integrations').select('access_token').eq('company_id', companyId).eq('platform', 'meta').single();
    if (!integration?.access_token) {
      return new Response(JSON.stringify({ error: 'Meta token nao encontrado' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const { data: decrypted } = await supabase.rpc('decrypt_meta_token', { encrypted_token: integration.access_token });
    if (!decrypted) {
      return new Response(JSON.stringify({ error: 'Falha ao descriptografar token' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const result = await reactivateCampaign(decrypted as string, action.campaign_external_id!);

    // Mark original as reverted
    await supabase.from('fury_actions').update({ status: 'reverted', reverted_at: new Date().toISOString() }).eq('id', action.id);

    // Log revert action
    await supabase.from('fury_actions').insert({
      company_id: companyId,
      campaign_id: action.campaign_id,
      campaign_external_id: action.campaign_external_id,
      campaign_name: action.campaign_name,
      rule_key: action.rule_key,
      action_type: 'revert',
      status: result.ok ? 'executed' : 'pending',
      meta_api_response: result.response,
      performed_by: 'user',
    });

    return new Response(JSON.stringify({ success: result.ok, reverted: action.id }), {
      status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // ---- Get meta token ----
  let metaToken: string | null = null;
  const { data: integration } = await supabase
    .from('integrations').select('access_token').eq('company_id', companyId).eq('platform', 'meta').single();
  if (integration?.access_token) {
    const { data: decrypted } = await supabase.rpc('decrypt_meta_token', { encrypted_token: integration.access_token });
    if (decrypted) metaToken = decrypted as string;
  }

  // ---- Get account timezone (for budget_exhausted time check) ----
  const { data: adAccount } = await supabase
    .from('meta_ad_accounts')
    .select('timezone_name')
    .eq('company_id', companyId)
    .limit(1)
    .maybeSingle();
  const accountTimezone = (adAccount?.timezone_name as string | null) ?? 'America/Sao_Paulo';

  // ---- Get active rules ----
  const { data: rulesData } = await supabase
    .from('fury_rules')
    .select('id, rule_key, display_name, is_enabled, auto_execute, threshold_value, threshold_unit, consecutive_days, action_type')
    .eq('company_id', companyId)
    .eq('is_enabled', true);

  const rules = (rulesData ?? []) as FuryRule[];
  if (rules.length === 0) {
    return new Response(JSON.stringify({ status: 'success', message: 'Nenhuma regra ativa', stats: { campaigns_evaluated: 0 } }), {
      status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // ---- Get campaigns (budget e coluna unica ja em reais do meta-sync) ----
  const { data: campaignsRaw } = await supabase
    .from('campaigns')
    .select('id, external_id, name, status, budget')
    .eq('company_id', companyId)
    .limit(MAX_CAMPAIGNS_PER_RUN);

  const campaigns = (campaignsRaw ?? []).map((c) => ({
    ...c,
    // Normaliza pra interface compartilhada — budget vira daily (ja em reais)
    daily_budget: (c as { budget?: number | null }).budget ?? null,
    lifetime_budget: null,
  }));

  if (campaigns.length === 0) {
    return new Response(JSON.stringify({ status: 'success', message: 'Nenhuma campanha', stats: { campaigns_evaluated: 0 } }), {
      status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // ---- Create scan log ----
  const triggeredBy = cronSecret ? 'cron' : 'manual';
  const { data: scanLog } = await supabase
    .from('fury_scan_logs')
    .insert({ company_id: companyId, status: 'running', triggered_by: triggeredBy })
    .select('id').single();

  const stats: ScanStats = { campaigns_evaluated: 0, rules_triggered: 0, actions_executed: 0, errors: [] };

  // ---- Get 7-day metrics for all campaigns in one query ----
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString().split('T')[0];
  const campaignExternalIds = campaigns.map((c) => c.external_id).filter(Boolean);

  const { data: allMetrics } = await supabase
    .from('campaign_metrics')
    .select('campanha, grupo_anuncios, data, impressoes, cliques, cpc, cpm, investimento, conversas_iniciadas, reach, frequency')
    .in('campanha', campaignExternalIds)
    .gte('data', sevenDaysAgo)
    .order('data', { ascending: true });

  // Group metrics by campaign external_id
  const metricsByCampaign = new Map<string, DayMetric[]>();
  for (const m of (allMetrics ?? [])) {
    const key = m.campanha as string;
    if (!metricsByCampaign.has(key)) metricsByCampaign.set(key, []);
    metricsByCampaign.get(key)!.push(m as DayMetric);
  }

  // ---- Get recent actions for dedup (last 24h) ----
  const dedupSince = new Date(Date.now() - DEDUP_WINDOW_HOURS * 3600_000).toISOString();
  const { data: recentActions } = await supabase
    .from('fury_actions')
    .select('campaign_external_id, rule_key')
    .eq('company_id', companyId)
    .in('status', ['pending', 'executed'])
    .gte('created_at', dedupSince);

  const dedupSet = new Set(
    (recentActions ?? []).map((a) => `${a.campaign_external_id}:${a.rule_key}`),
  );

  // ---- Evaluate each campaign ----
  for (const campaign of campaigns) {
    if (!campaign.external_id) continue;

    const dailyMetrics = metricsByCampaign.get(campaign.external_id) ?? [];
    // campaign.daily_budget ja esta em reais (meta-sync ja converteu)
    const agg = aggregateMetrics(
      dailyMetrics,
      campaign.daily_budget ? Number(campaign.daily_budget) : null,
      campaign.lifetime_budget ? Number(campaign.lifetime_budget) : null,
    );

    const triggeredRules: string[] = [];

    // Apply each rule
    for (const rule of rules) {
      const result = evaluateRule(rule, {
        ...campaign, external_id: campaign.external_id, dailyMetrics, ...agg,
      } as CampaignWithMetrics, accountTimezone);

      if (!result.triggered) continue;

      triggeredRules.push(rule.rule_key);
      stats.rules_triggered++;

      // Dedup check
      const dedupKey = `${campaign.external_id}:${rule.rule_key}`;
      if (dedupSet.has(dedupKey)) continue;
      dedupSet.add(dedupKey);

      // Create action
      const actionRow: Record<string, unknown> = {
        company_id: companyId,
        campaign_id: campaign.id,
        campaign_external_id: campaign.external_id,
        campaign_name: campaign.name,
        rule_key: rule.rule_key,
        rule_display_name: rule.display_name,
        action_type: rule.action_type,
        status: 'pending',
        metric_name: result.metricName,
        metric_value: Math.round(result.metricValue * 100) / 100,
        threshold_value: rule.threshold_value,
        performed_by: 'fury',
      };

      // Auto-execute pause via Meta API
      if (rule.auto_execute && rule.action_type === 'pause' && metaToken) {
        const pauseResult = await pauseCampaign(metaToken, campaign.external_id);
        actionRow.status = pauseResult.ok ? 'executed' : 'pending';
        actionRow.meta_api_response = pauseResult.response;
        actionRow.revert_before = new Date(Date.now() + REVERT_WINDOW_MS).toISOString();
        if (pauseResult.ok) stats.actions_executed++;
      }

      await supabase.from('fury_actions').insert(actionRow);
    }

    // Save evaluation snapshot
    const overallHealth = triggeredRules.length === 0 ? 'healthy'
      : triggeredRules.some((r) => r === 'high_cpa' || r === 'saturation') ? 'critical'
      : 'attention';

    await supabase.from('fury_evaluations').insert({
      company_id: companyId,
      campaign_id: campaign.id,
      campaign_external_id: campaign.external_id,
      campaign_name: campaign.name,
      avg_ctr: Math.round(agg.avgCtr * 1000) / 1000,
      avg_cpm: Math.round(agg.avgCpm * 100) / 100,
      avg_cpc: Math.round(agg.avgCpc * 100) / 100,
      avg_frequency: Math.round(agg.avgFrequency * 100) / 100,
      total_spend: Math.round(agg.totalSpend * 100) / 100,
      total_impressions: agg.totalImpressions,
      total_clicks: agg.totalClicks,
      total_conversions: agg.totalConversions,
      daily_cpa: Math.round(agg.dailyCpa * 100) / 100,
      budget_pct_used: Math.round(agg.budgetPctUsed * 10) / 10,
      trend_direction: agg.trendDirection,
      trend_pct_change: Math.round(agg.trendPctChange * 100) / 100,
      days_with_data: agg.daysWithData,
      rules_triggered: triggeredRules,
      overall_health: overallHealth,
    });

    stats.campaigns_evaluated++;
  }

  // ---- A3: Evaluate adsets (grupo_anuncios) ----
  // Group metrics by adset name (grupo_anuncios) — apply saturation + high_cpa only
  const adsetRules = rules.filter((r) => r.rule_key === 'saturation' || r.rule_key === 'high_cpa');
  if (adsetRules.length > 0) {
    const metricsByAdset = new Map<string, DayMetric[]>();
    for (const m of (allMetrics ?? [])) {
      const key = (m as { grupo_anuncios?: string }).grupo_anuncios;
      if (!key) continue;
      if (!metricsByAdset.has(key)) metricsByAdset.set(key, []);
      metricsByAdset.get(key)!.push(m as DayMetric);
    }

    // Get adset external_ids for Meta API pause
    const { data: adsets } = await supabase
      .from('adsets')
      .select('id, external_id, name, daily_budget, lifetime_budget')
      .eq('company_id', companyId)
      .is('deleted_at', null);

    const adsetByName = new Map((adsets ?? []).map((a) => [a.name, a]));

    for (const [adsetName, adsetMetrics] of metricsByAdset) {
      const adset = adsetByName.get(adsetName);
      if (!adset?.external_id) continue;

      const agg = aggregateMetrics(
        adsetMetrics,
        adset.daily_budget ? Number(adset.daily_budget) : null,
        adset.lifetime_budget ? Number(adset.lifetime_budget) : null,
      );

      for (const rule of adsetRules) {
        const result = evaluateRule(rule, {
          id: adset.id, external_id: adset.external_id, name: adsetName,
          status: null, daily_budget: adset.daily_budget, lifetime_budget: adset.lifetime_budget,
          dailyMetrics: adsetMetrics, ...agg,
        } as CampaignWithMetrics, accountTimezone);

        if (!result.triggered) continue;
        stats.rules_triggered++;

        const dedupKey = `${adset.external_id}:${rule.rule_key}`;
        if (dedupSet.has(dedupKey)) continue;
        dedupSet.add(dedupKey);

        const actionRow: Record<string, unknown> = {
          company_id: companyId,
          campaign_external_id: adset.external_id,
          campaign_name: `[Adset] ${adsetName}`,
          rule_key: rule.rule_key,
          rule_display_name: rule.display_name,
          action_type: rule.action_type,
          status: 'pending',
          metric_name: result.metricName,
          metric_value: Math.round(result.metricValue * 100) / 100,
          threshold_value: rule.threshold_value,
          performed_by: 'fury',
        };

        if (rule.auto_execute && rule.action_type === 'pause' && metaToken) {
          const pauseResult = await pauseCampaign(metaToken, adset.external_id);
          actionRow.status = pauseResult.ok ? 'executed' : 'pending';
          actionRow.meta_api_response = pauseResult.response;
          actionRow.revert_before = new Date(Date.now() + REVERT_WINDOW_MS).toISOString();
          if (pauseResult.ok) stats.actions_executed++;
        }

        await supabase.from('fury_actions').insert(actionRow);
      }
    }
  }

  // ---- Update scan log ----
  const finalStatus = stats.errors.length === 0 ? 'success' : stats.errors.length < 3 ? 'partial' : 'failed';
  if (scanLog?.id) {
    await supabase.from('fury_scan_logs').update({
      status: finalStatus,
      finished_at: new Date().toISOString(),
      campaigns_evaluated: stats.campaigns_evaluated,
      rules_triggered: stats.rules_triggered,
      actions_executed: stats.actions_executed,
      error: stats.errors.length > 0 ? stats.errors.join('; ').slice(0, 1000) : null,
    }).eq('id', scanLog.id);
  }

  return new Response(
    JSON.stringify({ status: finalStatus, stats }),
    { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } },
  );
});
