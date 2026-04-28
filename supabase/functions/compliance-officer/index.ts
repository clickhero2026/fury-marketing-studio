// Edge Function: compliance-officer (Sprint C2)
// Spec: .kiro/specs/multi-agent-specialists/
//
// Sub-agente especializado em compliance: adicionar proibicoes, scanear
// criativos retroativamente, mostrar status. Invocado pelo orchestrator
// (ai-chat) via tool `delegate_to_compliance`.
//
// IMPORTANTE: o specialist captura compliance_action durante execucao das
// tools (prohibition + rescan stats) e retorna no body.metadata.compliance_action.
// O orchestrator propaga isso pro complianceActionRef.current pra persistir
// em chat_messages.metadata e renderizar o card violeta inline.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import OpenAI from 'https://esm.sh/openai@4.79.1';
import { getCorsHeaders } from '../_shared/cors.ts';
import { CHAT_TOOLS } from '../_shared/tools.ts';
import {
  addProhibition,
  rescanCompliance,
  getComplianceStatus,
  type ComplianceActionCapture,
} from '../_shared/data-fetchers.ts';

const MODEL = 'gpt-4o';
const COST_PER_1M_INPUT = 2.50;
const COST_PER_1M_OUTPUT = 10.00;

const SPECIALIST_PROMPT = `Voce e o Compliance Officer do ClickHero — sub-agente especializado em
gerenciar regras de compliance dos anuncios (palavras proibidas, scans
retroativos, status de conformidade na Meta).

## SUA RESPONSABILIDADE

Receber pedidos do orchestrator relacionados a compliance e responder com:
- Acao executada (proibicao adicionada, scan rodado, status consultado)
- Resumo curto em markdown
- Contexto suficiente pro orchestrator polir tom WhatsApp

## TOOLS DISPONIVEIS

- **add_prohibition**: adiciona regra de palavra/assunto/visual proibido
  (categorias: word, topic, visual). Aparece em Compliance + Cerebro do FURY.
- **rescan_compliance**: re-analisa criativos ATIVOS contra regras atuais
  (modes: active_only, all). Demora 30-60s.
- **get_compliance_status**: lista anuncios com problema de compliance
  (DISAPPROVED, WITH_ISSUES, etc), scores e violacoes.

## FLUXO PADRAO

Quando user diz "nunca use a palavra X" / "tira X dos meus anuncios":
1. add_prohibition({category:'word', value:'X'})
2. rescan_compliance({mode:'active_only'})
3. Retorne resumo: "Adicionei 'X' como palavra proibida. Rodei scan: N analisados, M violacoes."

Quando user pede status / "como estao meus anuncios na Meta":
1. get_compliance_status() — sem filtro, mostra geral
2. Retorne markdown com top problemas (max 5 itens)

## DIRETRIZES DE RESPOSTA

- Markdown CURTO (max 200 palavras)
- Linguagem simples (usuario leigo)
- Quando adicionar proibicao + scan, NAO repita os numeros — o orchestrator
  vai mostrar card violeta com os dados estruturados
- Quando der erro, retorne mensagem LITERAL — orchestrator vai polir

Sempre em portugues brasileiro.`;

const SPECIALIST_TOOL_NAMES = new Set([
  'add_prohibition',
  'rescan_compliance',
  'get_compliance_status',
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
          agent_name: 'compliance-officer',
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
      console.warn('[compliance-officer] agent_run insert failed:', telErr);
    }

    // Captura local de compliance_action durante tool execution.
    // Sera retornada no body.metadata pra orchestrator propagar.
    const complianceActionRef: { current: ComplianceActionCapture | null } = { current: null };

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
      // Compliance pode precisar add + rescan = 2 tool rounds
      for (let round = 0; round < 4; round++) {
        const response = await openai.chat.completions.create({
          model: MODEL,
          // deno-lint-ignore no-explicit-any
          messages: messages as any,
          tools: SPECIALIST_TOOLS,
          temperature: 0.3,
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

            const result = await executeComplianceTool(
              fn.name,
              args,
              supabaseAdmin,
              body.company_id,
              body.user_auth_header ?? '',
              complianceActionRef,
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
        metadata: complianceActionRef.current
          ? { compliance_action: complianceActionRef.current }
          : undefined,
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
    console.error('[compliance-officer] unexpected:', err);
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
async function executeComplianceTool(
  name: string,
  args: Record<string, unknown>,
  supabase: any,
  companyId: string,
  userAuthHeader: string,
  capture: { current: ComplianceActionCapture | null },
): Promise<string> {
  try {
    switch (name) {
      case 'add_prohibition':
        return await addProhibition(supabase, companyId, args as { category?: 'word' | 'topic' | 'visual'; value?: string }, capture);
      case 'rescan_compliance':
        return await rescanCompliance(userAuthHeader, args as { mode?: 'active_only' | 'all' }, capture);
      case 'get_compliance_status':
        return await getComplianceStatus(supabase, companyId, args as { health_filter?: string; include_violations?: boolean; limit?: number });
      default:
        return `Tool "${name}" nao reconhecida pelo compliance-officer.`;
    }
  } catch (err) {
    console.error(`[compliance-officer] tool ${name} threw:`, err);
    return `Erro ao executar ${name}: ${err instanceof Error ? err.message : String(err)}`;
  }
}
