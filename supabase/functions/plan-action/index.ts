// Edge Function: plan-action (Sprint B2)
// Spec: .kiro/specs/multi-agent-foundation/ (B2 — multi-step plan mode)
//
// Recebe { plan_id, decision: 'approve' | 'reject' }.
// Se aprovado: executa cada approval filho em ordem (plan_step_order),
// agrega resultados e atualiza plan.status para 'executed' | 'partial' | 'failed'.
// Se rejeitado: marca plan e todos approvals como 'rejected'.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';

const GRAPH_VERSION = 'v22.0';

interface RequestBody {
  plan_id: string;
  decision: 'approve' | 'reject';
}

interface ApprovalRow {
  id: string;
  company_id: string;
  action_type: 'pause_campaign' | 'reactivate_campaign' | 'update_budget';
  payload: Record<string, unknown>;
  human_summary: string;
  status: string;
  plan_step_order: number | null;
}

interface PlanRow {
  id: string;
  company_id: string;
  conversation_id: string | null;
  human_summary: string;
  status: string;
  expires_at: string;
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse(401, { error: 'Missing authorization' }, cors);

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false },
      }
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) return jsonResponse(401, { error: 'Invalid token' }, cors);

    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON' }, cors);
    }

    if (!body.plan_id || !['approve', 'reject'].includes(body.decision)) {
      return jsonResponse(400, { error: 'plan_id and decision required' }, cors);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: planData, error: planFetchErr } = await supabaseUser
      .from('plans')
      .select('id, company_id, conversation_id, human_summary, status, expires_at')
      .eq('id', body.plan_id)
      .maybeSingle();

    if (planFetchErr) return jsonResponse(500, { error: 'Failed to load plan' }, cors);
    if (!planData) return jsonResponse(404, { error: 'Plan not found' }, cors);

    const plan = planData as PlanRow;
    if (plan.status !== 'pending') {
      return jsonResponse(409, { error: `Plan not pending (status=${plan.status})` }, cors);
    }
    if (new Date(plan.expires_at) < new Date()) {
      await supabaseAdmin.from('plans').update({
        status: 'expired',
        decided_by: user.id,
        decided_at: new Date().toISOString(),
      }).eq('id', plan.id);
      await supabaseAdmin.from('approvals').update({
        status: 'expired',
        decided_by: user.id,
        decided_at: new Date().toISOString(),
      }).eq('plan_id', plan.id).eq('status', 'pending');
      return jsonResponse(410, { error: 'Plan expired' }, cors);
    }

    const { data: stepsData } = await supabaseAdmin
      .from('approvals')
      .select('id, company_id, action_type, payload, human_summary, status, plan_step_order')
      .eq('plan_id', plan.id)
      .order('plan_step_order', { ascending: true });

    const steps = (stepsData ?? []) as ApprovalRow[];

    if (body.decision === 'reject') {
      const now = new Date().toISOString();
      await supabaseAdmin.from('plans').update({
        status: 'rejected', decided_by: user.id, decided_at: now,
      }).eq('id', plan.id);
      await supabaseAdmin.from('approvals').update({
        status: 'rejected', decided_by: user.id, decided_at: now,
      }).eq('plan_id', plan.id).eq('status', 'pending');

      await postSystemMessage(supabaseAdmin, plan, `Plano rejeitado pelo usuario: ${plan.human_summary}`);
      return jsonResponse(200, { ok: true, status: 'rejected', steps_count: steps.length }, cors);
    }

    const decidedAt = new Date().toISOString();
    await supabaseAdmin.from('plans').update({
      status: 'approved', decided_by: user.id, decided_at: decidedAt,
    }).eq('id', plan.id);
    await supabaseAdmin.from('approvals').update({
      status: 'approved', decided_by: user.id, decided_at: decidedAt,
    }).eq('plan_id', plan.id).eq('status', 'pending');

    const results: Array<{ step_id: string; ok: boolean; error?: string }> = [];
    let token: string | null = null;

    for (const step of steps) {
      try {
        if (!token) token = await getMetaToken(supabaseAdmin, plan.company_id);
        const result = await executeAction(supabaseAdmin, step, token);
        await supabaseAdmin.from('approvals').update({
          status: 'executed',
          executed_at: new Date().toISOString(),
          execution_result: result,
        }).eq('id', step.id);
        results.push({ step_id: step.id, ok: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await supabaseAdmin.from('approvals').update({
          status: 'failed',
          executed_at: new Date().toISOString(),
          execution_error: msg.substring(0, 500),
        }).eq('id', step.id);
        results.push({ step_id: step.id, ok: false, error: msg });
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;
    const planStatus = failCount === 0 ? 'executed' : okCount === 0 ? 'failed' : 'partial';

    await supabaseAdmin.from('plans').update({
      status: planStatus,
      executed_at: new Date().toISOString(),
    }).eq('id', plan.id);

    const recap = results.map((r, i) => `${i + 1}. ${r.ok ? 'OK' : 'FALHA'}${r.error ? ` (${r.error.substring(0, 80)})` : ''}`).join('\n');
    await postSystemMessage(
      supabaseAdmin,
      plan,
      `Plano "${plan.human_summary}" — ${planStatus}\n${recap}`
    );

    return jsonResponse(200, {
      ok: failCount === 0,
      status: planStatus,
      total: results.length,
      executed: okCount,
      failed: failCount,
      results,
    }, cors);
  } catch (err) {
    console.error('[plan-action] unexpected:', err);
    return jsonResponse(500, { error: 'Internal server error' }, getCorsHeaders(req));
  }
});

function jsonResponse(status: number, body: unknown, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

async function postSystemMessage(supabase: SupabaseClient, plan: PlanRow, text: string) {
  if (!plan.conversation_id) return;
  await supabase.from('chat_messages').insert({
    conversation_id: plan.conversation_id,
    role: 'system',
    content: text,
    metadata: { plan_id: plan.id },
  });
}

async function getMetaToken(supabase: SupabaseClient, companyId: string): Promise<string> {
  const { data: integration } = await supabase
    .from('integrations')
    .select('access_token')
    .eq('company_id', companyId)
    .eq('platform', 'meta')
    .single();
  if (!integration?.access_token) throw new Error('Meta token not found');
  const { data: decrypted } = await supabase.rpc('decrypt_meta_token', {
    encrypted_token: integration.access_token,
  });
  if (!decrypted) throw new Error('Failed to decrypt token');
  return decrypted as string;
}

async function executeAction(
  supabase: SupabaseClient,
  step: ApprovalRow,
  token: string
): Promise<Record<string, unknown>> {
  const payload = step.payload as {
    campaign_id?: string;
    campaign_external_id: string;
    campaign_name: string;
    daily_budget_cents?: number;
  };
  if (!payload.campaign_external_id) throw new Error('Missing campaign_external_id');

  let bodyParam = '';
  let furyType: 'pause' | 'revert' | null = null;
  if (step.action_type === 'pause_campaign') {
    bodyParam = 'status=PAUSED';
    furyType = 'pause';
  } else if (step.action_type === 'reactivate_campaign') {
    bodyParam = 'status=ACTIVE';
    furyType = 'revert';
  } else if (step.action_type === 'update_budget') {
    if (typeof payload.daily_budget_cents !== 'number') throw new Error('Missing daily_budget_cents');
    bodyParam = `daily_budget=${payload.daily_budget_cents}`;
  }

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${payload.campaign_external_id}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${token}`,
      },
      body: bodyParam,
    }
  );
  const respBody = await res.json();
  if (!res.ok) {
    throw new Error(`Meta API: ${JSON.stringify(respBody.error ?? respBody).substring(0, 300)}`);
  }

  if (furyType) {
    await supabase.from('fury_actions').insert({
      company_id: step.company_id,
      campaign_id: payload.campaign_id ?? null,
      campaign_external_id: payload.campaign_external_id,
      campaign_name: payload.campaign_name,
      rule_key: 'manual_chat_plan_approval',
      rule_display_name: 'Aprovacao via Plan',
      action_type: furyType,
      status: 'executed',
      performed_by: 'user_chat_plan',
      meta_api_response: respBody,
      revert_before: furyType === 'pause'
        ? new Date(Date.now() + 30 * 60_000).toISOString()
        : null,
    });
  }

  return { meta_response: respBody };
}
