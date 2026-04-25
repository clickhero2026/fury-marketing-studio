// Edge Function: meta-ads-specialist (Sprint B5)
// Spec: .kiro/specs/multi-agent-foundation/ (B5 — multi-agent delegation)
//
// Sub-agente especializado em Meta Ads. Invocado pelo orchestrator (ai-chat)
// via tool `delegate_to_meta_specialist`. Faz LLM call proprio com prompt
// focado em analise quantitativa de campanhas, retornando markdown conciso.
//
// Logs em agent_runs com agent_name='meta-ads-specialist' + parent_run_id
// para correlacionar com a chamada do orchestrator.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import OpenAI from 'https://esm.sh/openai@4';
import { getCorsHeaders } from '../_shared/cors.ts';
import { CHAT_TOOLS } from '../_shared/tools.ts';
import {
  getCampaignsSummary,
  getCampaignDetails,
  getMetricsComparison,
  getTopPerformers,
  getDailyMetrics,
  getFuryEvaluations,
} from '../_shared/data-fetchers.ts';

const MODEL = 'gpt-4o';
const COST_PER_1M_INPUT = 2.50;
const COST_PER_1M_OUTPUT = 10.00;

const SPECIALIST_PROMPT = `Voce e um especialista em Meta Ads (analise quantitativa de campanhas Facebook/Instagram Ads).

Sua missao: receber uma pergunta especifica do agente orchestrator e responder com analise FOCADA, usando os dados disponiveis via tools.

Diretrizes:
- Seja conciso e DIRETO ao ponto. Markdown bem formatado.
- Use numeros concretos (gasto, CTR, ROAS, CPA) — nunca generalize sem dados.
- Estruture: Diagnostico breve → Numeros → Hipoteses → Recomendacao acionavel
- NAO proponha acoes destrutivas (pause/budget) — apenas recomende. O orchestrator decide se cria approval.
- Se faltar dado, peca dado especifico ao orchestrator (ex: "preciso de campaign_name X").

Voce TEM acesso a essas tools: get_campaigns_summary, get_campaign_details, get_metrics_comparison, get_top_performers, get_daily_metrics, get_fury_evaluations.

Resposta deve ter no maximo 600 palavras. Sempre em portugues.`;

// Filtrar tools — apenas as analiticas (nao destrutivas, nao proposals)
const ANALYTIC_TOOL_NAMES = new Set([
  'get_campaigns_summary',
  'get_campaign_details',
  'get_metrics_comparison',
  'get_top_performers',
  'get_daily_metrics',
  'get_fury_evaluations',
]);
const SPECIALIST_TOOLS = CHAT_TOOLS.filter((t) => ANALYTIC_TOOL_NAMES.has(t.function.name));

interface RequestBody {
  question: string;
  context?: string;
  parent_run_id?: string;
  conversation_id?: string;
  company_id: string;
}

function calcCost(promptTokens: number, completionTokens: number): number {
  return Math.round(
    ((promptTokens * COST_PER_1M_INPUT + completionTokens * COST_PER_1M_OUTPUT) / 1_000_000) * 1_000_000
  ) / 1_000_000;
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    // Auth: aceita apenas service-role (chamada interna do orchestrator)
    const authHeader = req.headers.get('Authorization') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!authHeader.includes(serviceKey)) {
      return jsonResponse(401, { error: 'Internal endpoint — service role only' }, cors);
    }

    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON' }, cors);
    }

    if (!body.question || !body.company_id) {
      return jsonResponse(400, { error: 'question and company_id required' }, cors);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const openaiKey = Deno.env.get('OPENAI_API_KEY') ?? '';
    const openai = new OpenAI({ apiKey: openaiKey });

    // ===== AGENT RUN TELEMETRY =====
    const runStart = Date.now();
    let runId: string | null = null;
    try {
      const { data: runRow } = await supabaseAdmin
        .from('agent_runs')
        .insert({
          company_id: body.company_id,
          agent_name: 'meta-ads-specialist',
          conversation_id: body.conversation_id ?? null,
          status: 'running',
          model: MODEL,
          started_at: new Date(runStart).toISOString(),
          metadata: body.parent_run_id ? { parent_run_id: body.parent_run_id } : {},
        })
        .select('id')
        .single();
      runId = runRow?.id ?? null;
    } catch (telErr) {
      console.warn('[specialist] agent_run insert failed:', telErr);
    }

    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    const toolsUsed: string[] = [];

    try {
      const userMessage = body.context
        ? `Contexto fornecido pelo orchestrator:\n${body.context}\n\nPergunta especifica:\n${body.question}`
        : body.question;

      const messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_call_id?: string; tool_calls?: unknown[] }> = [
        { role: 'system', content: SPECIALIST_PROMPT },
        { role: 'user', content: userMessage },
      ];

      // Permite ate 2 rounds de tool call (specialist nao precisa muito mais que isso)
      let finalAnswer = '';
      for (let round = 0; round < 3; round++) {
        const response = await openai.chat.completions.create({
          model: MODEL,
          // deno-lint-ignore no-explicit-any
          messages: messages as any,
          tools: SPECIALIST_TOOLS,
          temperature: 0.3,
          max_tokens: 1500,
        });

        const usage = response.usage;
        if (usage) {
          promptTokens += usage.prompt_tokens ?? 0;
          completionTokens += usage.completion_tokens ?? 0;
          totalTokens += usage.total_tokens ?? 0;
        }

        const choice = response.choices[0];
        if (!choice) break;

        const msg = choice.message;
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          messages.push({
            role: 'assistant',
            content: msg.content ?? null,
            tool_calls: msg.tool_calls as unknown[],
          });

          for (const tc of msg.tool_calls) {
            // deno-lint-ignore no-explicit-any
            const fn = (tc as any).function;
            if (!fn?.name) continue;
            toolsUsed.push(fn.name);
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(fn.arguments ?? '{}'); } catch { /* empty */ }

            const result = await executeAnalyticTool(fn.name, args, supabaseAdmin, body.company_id);
            messages.push({
              role: 'tool',
              // deno-lint-ignore no-explicit-any
              tool_call_id: (tc as any).id,
              content: result,
            });
          }
          continue;
        }

        finalAnswer = msg.content ?? '(sem resposta)';
        break;
      }

      // Finaliza run com sucesso
      if (runId) {
        const finishedAt = Date.now();
        await supabaseAdmin.from('agent_runs').update({
          status: 'success',
          finished_at: new Date(finishedAt).toISOString(),
          latency_ms: finishedAt - runStart,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens,
          cost_usd: calcCost(promptTokens, completionTokens),
          tools_used: toolsUsed,
        }).eq('id', runId);
      }

      return jsonResponse(200, {
        ok: true,
        answer: finalAnswer,
        tokens: totalTokens,
        cost_usd: calcCost(promptTokens, completionTokens),
        tools_used: toolsUsed,
        run_id: runId,
      }, cors);
    } catch (innerErr) {
      const errMsg = innerErr instanceof Error ? innerErr.message : String(innerErr);
      if (runId) {
        const finishedAt = Date.now();
        await supabaseAdmin.from('agent_runs').update({
          status: 'error',
          finished_at: new Date(finishedAt).toISOString(),
          latency_ms: finishedAt - runStart,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens,
          cost_usd: calcCost(promptTokens, completionTokens),
          tools_used: toolsUsed,
          error_message: errMsg.substring(0, 500),
        }).eq('id', runId);
      }
      throw innerErr;
    }
  } catch (err) {
    console.error('[specialist] unexpected:', err);
    const msg = err instanceof Error ? err.message : 'Internal error';
    return jsonResponse(500, { ok: false, error: msg }, getCorsHeaders(req));
  }
});

function jsonResponse(status: number, body: unknown, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// deno-lint-ignore no-explicit-any
async function executeAnalyticTool(name: string, args: Record<string, unknown>, supabase: any, companyId: string): Promise<string> {
  try {
    switch (name) {
      case 'get_campaigns_summary':
        return await getCampaignsSummary(supabase, companyId, args as never);
      case 'get_campaign_details':
        return await getCampaignDetails(supabase, companyId, args as never);
      case 'get_metrics_comparison':
        return await getMetricsComparison(supabase, companyId, args as never);
      case 'get_top_performers':
        return await getTopPerformers(supabase, companyId, args as never);
      case 'get_daily_metrics':
        return await getDailyMetrics(supabase, companyId, args as never);
      case 'get_fury_evaluations':
        return await getFuryEvaluations(supabase, companyId, args as never);
      default:
        return `Tool "${name}" nao disponivel para o specialist.`;
    }
  } catch (err) {
    return `Erro ao executar ${name}: ${err instanceof Error ? err.message : String(err)}`;
  }
}
