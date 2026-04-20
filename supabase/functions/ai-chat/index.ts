import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import OpenAI from 'https://esm.sh/openai@4';
import { getCorsHeaders } from '../_shared/cors.ts';
import { SYSTEM_PROMPT } from '../_shared/prompt.ts';
import { CHAT_TOOLS } from '../_shared/tools.ts';
import {
  getCampaignsSummary,
  getCampaignDetails,
  getMetricsComparison,
  getTopPerformers,
  getDailyMetrics,
  getAccountInfo,
  getFuryActions,
  getFuryEvaluations,
  getComplianceStatus,
  pauseCampaignAction,
  reactivateCampaignAction,
} from '../_shared/data-fetchers.ts';

const MAX_HISTORY_MESSAGES = 20;
const OPENAI_URL = 'https://api.openai.com/v1';

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false },
      }
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // Parse body
    const { message, conversation_id } = await req.json();
    if (!message || typeof message !== 'string') {
      return new Response(
        JSON.stringify({ error: 'message is required' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const openaiKey = Deno.env.get('OPENAI_API_KEY') ?? '';

    // Get company_id
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('current_organization_id')
      .eq('id', user.id)
      .single();

    let companyId: string | null = null;
    if (profile?.current_organization_id) {
      const { data: company } = await supabaseAdmin
        .from('companies')
        .select('id')
        .eq('organization_id', profile.current_organization_id)
        .single();
      companyId = company?.id ?? null;
    }

    // Get or create conversation
    let convId = conversation_id;
    if (!convId) {
      const { data: conv } = await supabaseAdmin
        .from('chat_conversations')
        .insert({
          user_id: user.id,
          company_id: companyId,
          title: message.substring(0, 60),
        })
        .select('id')
        .single();
      convId = conv?.id;
    }

    // Save user message
    if (convId) {
      await supabaseAdmin.from('chat_messages').insert({
        conversation_id: convId,
        role: 'user',
        content: message,
      });
    }

    // ============ MEMORY RETRIEVAL ============

    // 1. Gerar embedding da mensagem do usuário
    let memoryContext = '';
    try {
      const embResp = await fetch(`${OPENAI_URL}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: message,
        }),
      });
      const embResult = await embResp.json();
      const queryEmbedding = embResult.data?.[0]?.embedding;

      if (queryEmbedding) {
        // 2. Buscar memórias relevantes via pgvector
        const { data: relevantMemories } = await supabaseAdmin.rpc('search_memories', {
          p_user_id: user.id,
          p_query_embedding: queryEmbedding,
          p_limit: 15,
        });

        // 3. Sempre incluir profile + high-importance (independente de similaridade)
        const { data: profileMemories } = await supabaseAdmin
          .from('memories')
          .select('id, content, memory_type, category, importance')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .or('memory_type.eq.profile,importance.gte.8')
          .order('importance', { ascending: false })
          .limit(10);

        // 4. Deduplicar e formatar
        const allMemories = deduplicateMemories([
          ...(profileMemories ?? []),
          ...(relevantMemories ?? []),
        ]);

        if (allMemories.length > 0) {
          memoryContext = formatMemoriesForPrompt(allMemories);

          // 5. Bump access count (fire-and-forget)
          const ids = allMemories.map((m) => m.id).filter(Boolean);
          if (ids.length > 0) {
            supabaseAdmin.rpc('bump_memory_access', { p_memory_ids: ids }).then(() => {});
          }
        }
      }
    } catch (memErr) {
      console.warn('Memory retrieval failed (non-blocking):', memErr);
    }

    // ============ CONVERSATION HISTORY ============

    let history: Array<{ role: string; content: string }> = [];
    if (convId) {
      const { data: msgs } = await supabaseAdmin
        .from('chat_messages')
        .select('role, content')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true })
        .limit(MAX_HISTORY_MESSAGES);

      if (msgs) {
        history = msgs.slice(0, -1).map((m) => ({
          role: m.role as string,
          content: m.content,
        }));
      }
    }

    // Load conversation summary
    let summaryContext = '';
    if (convId) {
      const { data: conv } = await supabaseAdmin
        .from('chat_conversations')
        .select('summary')
        .eq('id', convId)
        .single();
      if (conv?.summary) {
        summaryContext = `\n\n## RESUMO DA CONVERSA ANTERIOR\n${conv.summary}`;
      }
    }

    // ============ BUILD MESSAGES ============

    const systemContent = SYSTEM_PROMPT + memoryContext + summaryContext;

    const openaiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemContent },
      ...history.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: message },
    ];

    // ============ OPENAI STREAMING + FUNCTION CALLING ============

    const openai = new OpenAI({ apiKey: openaiKey });

    const firstResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: openaiMessages,
      tools: CHAT_TOOLS,
      temperature: 0.4,
      max_tokens: 2000,
      stream: true,
    });

    const encoder = new TextEncoder();
    let assistantContent = '';

    const readable = new ReadableStream({
      async start(controller) {
        try {
          let toolCalls: Array<{ id: string; function: { name: string; arguments: string } }> = [];
          let hasToolCalls = false;

          for await (const chunk of firstResponse) {
            const delta = chunk.choices[0]?.delta;
            const finishReason = chunk.choices[0]?.finish_reason;

            if (delta?.tool_calls) {
              hasToolCalls = true;
              for (const tc of delta.tool_calls) {
                if (!toolCalls[tc.index]) {
                  toolCalls[tc.index] = { id: '', function: { name: '', arguments: '' } };
                }
                if (tc.id) toolCalls[tc.index].id = tc.id;
                if (tc.function?.name) toolCalls[tc.index].function.name += tc.function.name;
                if (tc.function?.arguments) toolCalls[tc.index].function.arguments += tc.function.arguments;
              }
            }

            if (finishReason === 'tool_calls' && hasToolCalls) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'status', content: 'Buscando dados...' })}\n\n`));

              const toolResults: Array<{ tool_call_id: string; role: 'tool'; content: string }> = [];
              for (const tc of toolCalls) {
                let args: Record<string, unknown> = {};
                try { args = JSON.parse(tc.function.arguments); } catch { /* empty */ }
                const result = await executeTool(tc.function.name, args, supabaseAdmin, companyId ?? '');
                const result = await executeTool(tc.function.name, args, supabaseAdmin as any, companyId ?? '');
                toolResults.push({ tool_call_id: tc.id, role: 'tool', content: result });
              }

              const secondMessages = [
                ...openaiMessages,
                {
                  role: 'assistant' as const,
                  content: null as unknown as string,
                  tool_calls: toolCalls.map((tc) => ({
                    id: tc.id,
                    type: 'function' as const,
                    function: tc.function,
                  })),
                },
                ...toolResults,
              ];

              const secondResponse = await openai.chat.completions.create({
                model: 'gpt-4o',
                // deno-lint-ignore no-explicit-any
                messages: secondMessages as any,
                temperature: 0.4,
                max_tokens: 2000,
                stream: true,
              });

              for await (const chunk2 of secondResponse) {
                const content = chunk2.choices[0]?.delta?.content;
                if (content) {
                  assistantContent += content;
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', content })}\n\n`));
                }
              }
            }

            if (delta?.content && !hasToolCalls) {
              assistantContent += delta.content;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', content: delta.content })}\n\n`));
            }
          }

          // Save assistant response
          if (convId && assistantContent) {
            await supabaseAdmin.from('chat_messages').insert({
              conversation_id: convId,
              role: 'assistant',
              content: assistantContent,
            });

            // Update message count
            const { count } = await supabaseAdmin
              .from('chat_messages')
              .select('id', { count: 'exact', head: true })
              .eq('conversation_id', convId);

            await supabaseAdmin
              .from('chat_conversations')
              .update({ message_count: count ?? 0 })
              .eq('id', convId);

            // ============ TRIGGER MEMORY EXTRACTION (async) ============
            // Fire-and-forget — não bloqueia a resposta
            fetch(
              `${Deno.env.get('SUPABASE_URL')}/functions/v1/extract-memories`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ conversation_id: convId }),
              }
            ).catch((err) => console.warn('Memory extraction trigger failed:', err));
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', conversation_id: convId })}\n\n`));
          controller.close();
        } catch (streamError) {
          console.error('Stream error:', streamError);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', content: 'Erro ao processar resposta' })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        ...cors,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});

// ============ HELPERS ============

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  supabase: ReturnType<typeof createClient>,
  companyId: string
): Promise<string> {
  try {
    switch (name) {
      case 'get_campaigns_summary':
        return await getCampaignsSummary(supabase, companyId, args as { status?: string; date_range: string; limit?: number });
      case 'get_campaign_details':
        return await getCampaignDetails(supabase, companyId, args as { campaign_name: string; date_range?: string });
      case 'get_metrics_comparison':
        return await getMetricsComparison(supabase, companyId, args as { period_a: string; period_b: string; campaign_name?: string });
      case 'get_top_performers':
        return await getTopPerformers(supabase, companyId, args as { metric: string; order: string; limit?: number; date_range?: string });
      case 'get_daily_metrics':
        return await getDailyMetrics(supabase, companyId, args as { campaign_name?: string; days?: number });
      case 'get_account_info':
        return await getAccountInfo(supabase, companyId);
      case 'get_fury_actions':
        return await getFuryActions(supabase, companyId, args as { status?: string; limit?: number });
      case 'get_fury_evaluations':
        return await getFuryEvaluations(supabase, companyId, args as { health_filter?: string; limit?: number });
      case 'get_compliance_status':
        return await getComplianceStatus(supabase, companyId, args as { health_filter?: string; include_violations?: boolean; limit?: number });
      case 'pause_campaign':
        return await pauseCampaignAction(supabase, companyId, args as { campaign_name: string });
      case 'reactivate_campaign':
        return await reactivateCampaignAction(supabase, companyId, args as { campaign_name: string });
      default:
        return `Funcao "${name}" nao reconhecida.`;
    }
  } catch (error) {
    console.error(`Tool execution error (${name}):`, error);
    return `Erro ao executar ${name}: ${(error as Error).message}`;
  }
}

interface MemoryRecord {
  id: string;
  content: string;
  memory_type: string;
  category?: string;
  importance?: number;
}

function deduplicateMemories(memories: MemoryRecord[]): MemoryRecord[] {
  const seen = new Set<string>();
  return memories.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

function formatMemoriesForPrompt(memories: MemoryRecord[]): string {
  if (memories.length === 0) return '';

  const grouped: Record<string, MemoryRecord[]> = {};
  for (const m of memories) {
    const key = m.memory_type;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(m);
  }

  let output = '\n\n<user_memory>\n';

  if (grouped.profile?.length) {
    output += '## Sobre este usuario\n';
    output += grouped.profile.map((m) => `- ${m.content}`).join('\n') + '\n\n';
  }

  if (grouped.preference?.length) {
    output += '## Preferencias do usuario\n';
    output += grouped.preference.map((m) => `- ${m.content}`).join('\n') + '\n\n';
  }

  if (grouped.fact?.length) {
    output += '## Fatos conhecidos\n';
    output += grouped.fact.map((m) => `- ${m.content}`).join('\n') + '\n\n';
  }

  if (grouped.procedure?.length) {
    output += '## Workflows do usuario\n';
    output += grouped.procedure.map((m) => `- ${m.content}`).join('\n') + '\n\n';
  }

  if (grouped.episode?.length) {
    output += '## Interacoes passadas relevantes\n';
    output += grouped.episode.map((m) => `- ${m.content}`).join('\n') + '\n\n';
  }

  output += '</user_memory>\n';
  output += 'Instrucoes de memoria: Use a secao <user_memory> para personalizar respostas. Referencie conversas passadas naturalmente. Nunca mencione o sistema de memoria ao usuario.';

  return output;
}
