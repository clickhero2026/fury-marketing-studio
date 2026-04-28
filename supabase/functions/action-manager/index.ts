// Edge Function: action-manager (Sprint C3)
// Spec: .kiro/specs/multi-agent-specialists/
//
// Sub-agente especializado em ACOES DESTRUTIVAS (HITL — Human In The Loop).
// Invocado pelo orchestrator (ai-chat) via tool `delegate_to_action`.
//
// IMPORTANTE: nenhuma tool aqui executa Meta API direto — todas criam
// approval/plan PENDENTE em `approvals` que o user aprova via painel.
//
// SCOPE: pause/reactivate de ad/campanha + update_budget + propose_plan.
// NAO inclui propose_rule (continua no orchestrator porque precisa de
// userMessageId + attachmentIds pra feature de asset upload).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import OpenAI from 'https://esm.sh/openai@4.79.1';
import { getCorsHeaders } from '../_shared/cors.ts';
import { CHAT_TOOLS } from '../_shared/tools.ts';
import {
  proposePauseAd,
  proposeReactivateAd,
  proposePauseCampaign,
  proposeReactivateCampaign,
  proposeUpdateBudget,
  proposePlan,
} from '../_shared/data-fetchers.ts';

const MODEL = 'gpt-4o';
const COST_PER_1M_INPUT = 2.50;
const COST_PER_1M_OUTPUT = 10.00;

const SPECIALIST_PROMPT = `Voce e o Action Manager do ClickHero — sub-agente especializado em
acoes destrutivas em campanhas Meta Ads (pausar, reativar, mudar budget,
ou planos com multiplos passos).

## SUA RESPONSABILIDADE

Receber pedidos do orchestrator e criar APROVACOES PENDENTES (HITL).
Nenhuma acao executa direto na Meta — sempre passa por confirmacao do
user no painel de aprovacoes.

## TOOLS DISPONIVEIS

- **pause_campaign / reactivate_campaign**: pausar/reativar campanha inteira
- **pause_ad / reactivate_ad**: pausar/reativar UM anuncio especifico
- **update_budget**: mudar budget diario de uma campanha
- **propose_plan**: criar plano com 2+ passos sequenciais (ex: "pausa A,
  ajusta budget de B pra R$50, reativa C")

## DIRETRIZES

- Granularidade: anuncio (pause_ad) vs campanha (pause_campaign) — pergunte
  ao orchestrator se confuso
- 1 acao = tool individual; 2+ acoes encadeadas = propose_plan
- Cada tool retorna ID do approval criado — incluir no markdown final
- NUNCA finja que executou — todas as acoes ficam PENDENTES ate o user
  aprovar via painel

## DIRETRIZES DE RESPOSTA

- Markdown CURTO (max 150 palavras)
- Sempre informe que a acao precisa ser aprovada no painel
- Se faltar info (qual campanha? qual anuncio?), retorne pergunta sem
  chamar tool — orchestrator vai pedir ao user
- Se tool retornou erro (campanha nao encontrada, ja pausada), repasse
  literal

Sempre em portugues brasileiro.`;

const SPECIALIST_TOOL_NAMES = new Set([
  'pause_campaign',
  'reactivate_campaign',
  'pause_ad',
  'reactivate_ad',
  'update_budget',
  'propose_plan',
]);
const SPECIALIST_TOOLS = CHAT_TOOLS.filter((t) => SPECIALIST_TOOL_NAMES.has(t.function.name));

interface RequestBody {
  question: string;
  context?: string;
  parent_run_id?: string;
  conversation_id?: string;
  company_id: string;
  user_auth_header?: string;
}

function calcCost(promptTokens: number, completionTokens: number): number {
  return Math.round(
    ((promptTokens * COST_PER_1M_INPUT + completionTokens * COST_PER_1M_OUTPUT) / 1_000_000) * 1_000_000,
  ) / 1_000_000;
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!authHeader.includes(serviceKey)) {
      return jsonResponse(401, { ok: false, error: 'Internal endpoint — service role only' }, cors);
    }

    let body: RequestBody;
    try { body = await req.json(); } catch {
      return jsonResponse(400, { ok: false, error: 'Invalid JSON' }, cors);
    }

    if (!body.question || !body.company_id) {
      return jsonResponse(400, { ok: false, error: 'question and company_id required' }, cors);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceKey,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') ?? '' });

    // ===== AGENT RUN TELEMETRY =====
    const runStart = Date.now();
    let runId: string | null = null;
    try {
      const { data: runRow } = await supabaseAdmin
        .from('agent_runs')
        .insert({
          company_id: body.company_id,
          agent_name: 'action-manager',
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
      console.warn('[action-manager] agent_run insert failed:', telErr);
    }

    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    const toolsUsed: string[] = [];

    try {
      const userMessage = body.context
        ? `Contexto fornecido pelo orchestrator:\n${body.context}\n\nPedido do user:\n${body.question}`
        : body.question;

      const messages: Array<{
        role: 'system' | 'user' | 'assistant' | 'tool';
        content: string | null;
        tool_call_id?: string;
        tool_calls?: unknown[];
      }> = [
        { role: 'system', content: SPECIALIST_PROMPT },
        { role: 'user', content: userMessage },
      ];

      let finalAnswer = '';
      // Action raramente precisa mais de 2 rounds
      for (let round = 0; round < 3; round++) {
        const response = await openai.chat.completions.create({
          model: MODEL,
          // deno-lint-ignore no-explicit-any
          messages: messages as any,
          tools: SPECIALIST_TOOLS,
          temperature: 0.2,
          max_tokens: 1200,
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

            const result = await executeActionTool(
              fn.name,
              args,
              supabaseAdmin,
              body.company_id,
              body.conversation_id ?? null,
            );
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
    console.error('[action-manager] unexpected:', err);
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
async function executeActionTool(
  name: string,
  args: Record<string, unknown>,
  supabase: any,
  companyId: string,
  conversationId: string | null,
): Promise<string> {
  try {
    switch (name) {
      case 'pause_campaign':
        return await proposePauseCampaign(supabase, companyId, args as { campaign_name: string }, conversationId);
      case 'reactivate_campaign':
        return await proposeReactivateCampaign(supabase, companyId, args as { campaign_name: string }, conversationId);
      case 'pause_ad':
        return await proposePauseAd(supabase, companyId, args as { ad_name: string }, conversationId);
      case 'reactivate_ad':
        return await proposeReactivateAd(supabase, companyId, args as { ad_name: string }, conversationId);
      case 'update_budget':
        return await proposeUpdateBudget(supabase, companyId, args as { campaign_name: string; daily_budget_brl: number }, conversationId);
      case 'propose_plan':
        return await proposePlan(supabase, companyId, args as never, conversationId);
      default:
        return `Tool "${name}" nao reconhecida pelo action-manager.`;
    }
  } catch (err) {
    console.error(`[action-manager] tool ${name} threw:`, err);
    return `Erro ao executar ${name}: ${err instanceof Error ? err.message : String(err)}`;
  }
}
