import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';

/**
 * Budget Smart v0 — recomendacao de orcamento via IA.
 *
 * Input: objective + goal_per_week + current_budget_weekly
 * Output: recomendacao + projecao + alertas (JSON estruturado)
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-sonnet-4-5-20241022';

const MARKET_FALLBACK: Record<string, { avg_cpl: number; avg_cpa: number; avg_roas: number }> = {
  OUTCOME_LEADS:      { avg_cpl: 15, avg_cpa: 15, avg_roas: 0 },
  OUTCOME_SALES:      { avg_cpl: 40, avg_cpa: 40, avg_roas: 2.5 },
  OUTCOME_TRAFFIC:    { avg_cpl: 2,  avg_cpa: 2,  avg_roas: 0 },
  OUTCOME_ENGAGEMENT: { avg_cpl: 1,  avg_cpa: 1,  avg_roas: 0 },
  UNKNOWN:            { avg_cpl: 15, avg_cpa: 15, avg_roas: 0 },
};

interface Recommendation {
  recommended_budget_weekly: number;
  recommended_daily: number;
  projected_volume: number;
  projected_range_min: number;
  projected_range_max: number;
  justification: string;
  alerts: string[];
  data_source: 'tenant_history' | 'market_fallback' | 'mixed';
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Auth JWT
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
  const companyId = company.id as string;

  // Parse body
  let body: { objective?: string; goal_per_week?: number; current_budget_weekly?: number } = {};
  try { body = await req.json(); } catch { body = {}; }

  const objective = body.objective ?? 'OUTCOME_LEADS';
  const goalPerWeek = Math.max(1, body.goal_per_week ?? 100);
  const currentBudget = Math.max(70, body.current_budget_weekly ?? 700);

  // Refresh + fetch benchmark
  await supabase.rpc('refresh_budget_benchmarks', { p_company_id: companyId }).then(() => {}, () => {});

  const { data: benchmark } = await supabase
    .from('budget_benchmarks')
    .select('avg_cpl, avg_cpa, avg_roas, avg_ctr, samples_count, total_spend')
    .eq('company_id', companyId)
    .eq('objective', objective)
    .maybeSingle();

  const fallback = MARKET_FALLBACK[objective] ?? MARKET_FALLBACK.UNKNOWN;
  const tenantCpl = benchmark?.avg_cpl ? Number(benchmark.avg_cpl) : null;
  const tenantSamples = benchmark?.samples_count ?? 0;

  const effectiveCpl = tenantCpl && tenantSamples >= 7 ? tenantCpl : fallback.avg_cpl;
  const dataSource: Recommendation['data_source'] = tenantSamples >= 7 ? 'tenant_history'
    : tenantSamples > 0 ? 'mixed' : 'market_fallback';

  // Deterministic alerts
  const alerts: string[] = [];
  if (tenantCpl && tenantCpl > fallback.avg_cpl * 2) {
    alerts.push(`Seu CPL esta ${Math.round((tenantCpl / fallback.avg_cpl - 1) * 100)}% acima da media de mercado (R$ ${fallback.avg_cpl.toFixed(2)})`);
  }
  const neededBudget = goalPerWeek * effectiveCpl;
  if (currentBudget < neededBudget * 0.7) {
    alerts.push(`Orcamento atual pode ser insuficiente para a meta (precisa de ~R$ ${neededBudget.toFixed(0)}/semana)`);
  }
  if (dataSource === 'market_fallback') {
    alerts.push('Sem historico suficiente do tenant. Usando benchmarks de mercado brasileiro.');
  }

  // Claude recommendation
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    ?? ((await supabase.rpc('get_vault_secret', { secret_name: 'ANTHROPIC_API_KEY' })).data as string | null)
    ?? '';

  if (!apiKey) {
    // Fallback sem IA — retorna calculo deterministico
    const projected = currentBudget / effectiveCpl;
    return new Response(JSON.stringify({
      recommended_budget_weekly: Math.round(neededBudget),
      recommended_daily: Math.round(neededBudget / 7),
      projected_volume: Math.round(projected),
      projected_range_min: Math.round(projected * 0.8),
      projected_range_max: Math.round(projected * 1.2),
      justification: `Com base no CPL de R$ ${effectiveCpl.toFixed(2)}, para atingir ${goalPerWeek} ${objective === 'OUTCOME_SALES' ? 'vendas' : 'leads'} por semana voce precisa investir aproximadamente R$ ${neededBudget.toFixed(0)}/semana.`,
      alerts,
      data_source: dataSource,
    } as Recommendation), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const systemPrompt = `Voce e um especialista em Meta Ads e gestao de trafego.
Analise o contexto e retorne APENAS um JSON valido (sem markdown).
Use linguagem simples e acionavel. Seja direto.`;

  const userText = `OBJETIVO: ${objective}
META: ${goalPerWeek} por semana
ORCAMENTO ATUAL INFORMADO: R$ ${currentBudget.toFixed(2)}/semana

BENCHMARKS:
- CPL usado no calculo: R$ ${effectiveCpl.toFixed(2)} (fonte: ${dataSource})
- CPL medio tenant (se houver): ${tenantCpl ? `R$ ${tenantCpl.toFixed(2)}` : 'sem dados'}
- Samples tenant: ${tenantSamples} dias
- CPL medio mercado: R$ ${fallback.avg_cpl.toFixed(2)}
${benchmark?.avg_roas ? `- ROAS medio tenant: ${Number(benchmark.avg_roas).toFixed(2)}x` : ''}
${benchmark?.total_spend ? `- Investimento total 30d: R$ ${Number(benchmark.total_spend).toFixed(2)}` : ''}

Retorne este JSON EXATO:
{
  "recommended_budget_weekly": <numero em BRL por semana>,
  "recommended_daily": <numero em BRL por dia>,
  "projected_volume": <numero esperado por semana>,
  "projected_range_min": <min com -20%>,
  "projected_range_max": <max com +20%>,
  "justification": "<1-2 frases em pt-BR explicando o porque do valor recomendado>",
  "alerts": [<strings com alertas relevantes, pode ser array vazio>]
}

Regras:
- recommended_daily >= 10 (limite Meta)
- recommended_budget_weekly >= 70
- Seja realista: se a meta do usuario for muito agressiva vs historico, recomende valor pra atingir 70-80% da meta
- Se o tenant tem historico bom (samples>=14), confie mais nele`;

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 800,
        system: systemPrompt,
        messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic ${res.status}`);
    }

    const data = await res.json();
    const raw = data.content?.find((b: { type: string }) => b.type === 'text')?.text ?? '';
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = match ? match[1].trim() : raw.trim();
    const parsed = JSON.parse(jsonStr) as Partial<Recommendation>;

    // Merge alertas deterministicos + IA
    const finalAlerts = [...alerts, ...(parsed.alerts ?? [])].filter((a, i, arr) => arr.indexOf(a) === i);

    const result: Recommendation = {
      recommended_budget_weekly: Math.max(70, parsed.recommended_budget_weekly ?? neededBudget),
      recommended_daily: Math.max(10, parsed.recommended_daily ?? neededBudget / 7),
      projected_volume: parsed.projected_volume ?? Math.round(currentBudget / effectiveCpl),
      projected_range_min: parsed.projected_range_min ?? Math.round((currentBudget / effectiveCpl) * 0.8),
      projected_range_max: parsed.projected_range_max ?? Math.round((currentBudget / effectiveCpl) * 1.2),
      justification: parsed.justification ?? `Com CPL de R$ ${effectiveCpl.toFixed(2)}, recomendamos R$ ${neededBudget.toFixed(0)}/semana.`,
      alerts: finalAlerts,
      data_source: dataSource,
    };

    return new Response(JSON.stringify(result), {
      status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[budget-recommend] Claude error:', err);
    // Fallback deterministico
    const projected = currentBudget / effectiveCpl;
    return new Response(JSON.stringify({
      recommended_budget_weekly: Math.round(neededBudget),
      recommended_daily: Math.round(neededBudget / 7),
      projected_volume: Math.round(projected),
      projected_range_min: Math.round(projected * 0.8),
      projected_range_max: Math.round(projected * 1.2),
      justification: `Com base no CPL de R$ ${effectiveCpl.toFixed(2)}, para atingir ${goalPerWeek}/semana voce precisa de ~R$ ${neededBudget.toFixed(0)}/semana.`,
      alerts,
      data_source: dataSource,
    } as Recommendation), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
