// Edge Function: approval-action
// Spec: .kiro/specs/multi-agent-foundation/ (Sprint A1)
//
// Recebe { approval_id, decision: 'approve' | 'reject' }.
// Valida permissao do user (membro da company), valida estado do approval,
// se aprovado executa a acao real (Meta API), atualiza status e
// posta system message na conversa de origem.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';

const GRAPH_VERSION = 'v22.0';

interface RequestBody {
  approval_id: string;
  decision: 'approve' | 'reject';
}

interface ApprovalRow {
  id: string;
  company_id: string;
  conversation_id: string | null;
  message_id: string | null;
  action_type: 'pause_campaign' | 'reactivate_campaign' | 'update_budget';
  payload: Record<string, unknown>;
  human_summary: string;
  status: string;
  expires_at: string;
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse(401, { error: 'Missing authorization header' }, cors);
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
      return jsonResponse(401, { error: 'Invalid or expired token' }, cors);
    }

    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON body' }, cors);
    }

    if (!body.approval_id || !['approve', 'reject'].includes(body.decision)) {
      return jsonResponse(400, { error: 'approval_id and decision (approve|reject) are required' }, cors);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // RLS via supabaseUser garante que so ve da propria company
    const { data: approval, error: fetchError } = await supabaseUser
      .from('approvals')
      .select('id, company_id, conversation_id, message_id, action_type, payload, human_summary, status, expires_at')
      .eq('id', body.approval_id)
      .maybeSingle();

    if (fetchError) {
      console.error('[approval-action] fetch error:', fetchError);
      return jsonResponse(500, { error: 'Failed to load approval' }, cors);
    }
    if (!approval) {
      return jsonResponse(404, { error: 'Approval not found or you do not have access' }, cors);
    }

    const a = approval as ApprovalRow;

    if (a.status !== 'pending') {
      return jsonResponse(409, { error: `Approval is not pending (status=${a.status})` }, cors);
    }
    if (new Date(a.expires_at) < new Date()) {
      await supabaseAdmin.from('approvals').update({
        status: 'expired',
        decided_by: user.id,
        decided_at: new Date().toISOString(),
      }).eq('id', a.id);
      return jsonResponse(410, { error: 'Approval has expired' }, cors);
    }

    if (body.decision === 'reject') {
      const { error: updErr } = await supabaseAdmin.from('approvals').update({
        status: 'rejected',
        decided_by: user.id,
        decided_at: new Date().toISOString(),
      }).eq('id', a.id);

      if (updErr) {
        console.error('[approval-action] reject update error:', updErr);
        return jsonResponse(500, { error: 'Failed to reject approval' }, cors);
      }

      await postSystemMessage(supabaseAdmin, a, `Acao rejeitada pelo usuario: ${a.human_summary}`);
      return jsonResponse(200, { ok: true, status: 'rejected' }, cors);
    }

    // APPROVE: marca approved + executa
    const { error: approveErr } = await supabaseAdmin.from('approvals').update({
      status: 'approved',
      decided_by: user.id,
      decided_at: new Date().toISOString(),
    }).eq('id', a.id);

    if (approveErr) {
      console.error('[approval-action] approve update error:', approveErr);
      return jsonResponse(500, { error: 'Failed to mark as approved' }, cors);
    }

    let executionResult: Record<string, unknown> = {};
    let executionError: string | null = null;

    try {
      executionResult = await executeAction(supabaseAdmin, a);
    } catch (err) {
      executionError = err instanceof Error ? err.message : String(err);
      console.error('[approval-action] execution error:', err);
    }

    const finalStatus = executionError ? 'failed' : 'executed';
    await supabaseAdmin.from('approvals').update({
      status: finalStatus,
      executed_at: new Date().toISOString(),
      execution_result: executionError ? null : executionResult,
      execution_error: executionError,
    }).eq('id', a.id);

    const userMsg = executionError
      ? `Acao aprovada mas falhou ao executar: ${a.human_summary}\nErro: ${executionError}`
      : `Acao executada com sucesso: ${a.human_summary}`;
    await postSystemMessage(supabaseAdmin, a, userMsg);

    return jsonResponse(executionError ? 500 : 200, {
      ok: !executionError,
      status: finalStatus,
      result: executionResult,
      error: executionError,
    }, cors);
  } catch (err) {
    console.error('[approval-action] unexpected error:', err);
    return jsonResponse(500, { error: 'Internal server error' }, getCorsHeaders(req));
  }
});

function jsonResponse(status: number, body: unknown, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

async function postSystemMessage(
  supabase: SupabaseClient,
  approval: ApprovalRow,
  text: string
): Promise<void> {
  if (!approval.conversation_id) return;
  await supabase.from('chat_messages').insert({
    conversation_id: approval.conversation_id,
    role: 'system',
    content: text,
    metadata: { approval_id: approval.id },
  });
}

async function executeAction(supabase: SupabaseClient, approval: ApprovalRow): Promise<Record<string, unknown>> {
  switch (approval.action_type) {
    case 'pause_campaign':
      return executeCampaignStatus(supabase, approval, 'PAUSED', 'pause');
    case 'reactivate_campaign':
      return executeCampaignStatus(supabase, approval, 'ACTIVE', 'revert');
    case 'update_budget':
      return executeUpdateBudget(supabase, approval);
    default:
      throw new Error(`Unknown action_type: ${approval.action_type}`);
  }
}

async function getMetaToken(supabase: SupabaseClient, companyId: string): Promise<string> {
  const { data: integration } = await supabase
    .from('integrations')
    .select('access_token')
    .eq('company_id', companyId)
    .eq('platform', 'meta')
    .single();

  if (!integration?.access_token) throw new Error('Meta token not found for this company');

  const { data: decrypted } = await supabase.rpc('decrypt_meta_token', {
    encrypted_token: integration.access_token,
  });

  if (!decrypted) throw new Error('Failed to decrypt Meta token');
  return decrypted as string;
}

async function executeCampaignStatus(
  supabase: SupabaseClient,
  approval: ApprovalRow,
  status: 'PAUSED' | 'ACTIVE',
  furyActionType: 'pause' | 'revert'
): Promise<Record<string, unknown>> {
  const payload = approval.payload as {
    campaign_id?: string;
    campaign_external_id: string;
    campaign_name: string;
  };
  if (!payload.campaign_external_id) throw new Error('Missing campaign_external_id in payload');

  const token = await getMetaToken(supabase, approval.company_id);

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${payload.campaign_external_id}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${token}`,
      },
      body: `status=${status}`,
    }
  );

  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Meta API error: ${JSON.stringify(body.error ?? body).substring(0, 300)}`);
  }

  await supabase.from('fury_actions').insert({
    company_id: approval.company_id,
    campaign_id: payload.campaign_id ?? null,
    campaign_external_id: payload.campaign_external_id,
    campaign_name: payload.campaign_name,
    rule_key: 'manual_chat_approval',
    rule_display_name: 'Aprovacao via Chat',
    action_type: furyActionType,
    status: 'executed',
    performed_by: 'user_chat_approved',
    meta_api_response: body,
    revert_before: furyActionType === 'pause'
      ? new Date(Date.now() + 30 * 60_000).toISOString()
      : null,
  });

  return { meta_response: body, status };
}

async function executeUpdateBudget(
  supabase: SupabaseClient,
  approval: ApprovalRow
): Promise<Record<string, unknown>> {
  const payload = approval.payload as {
    campaign_external_id: string;
    daily_budget_cents: number;
    campaign_name: string;
  };
  if (!payload.campaign_external_id || typeof payload.daily_budget_cents !== 'number') {
    throw new Error('Missing campaign_external_id or daily_budget_cents');
  }

  const token = await getMetaToken(supabase, approval.company_id);

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${payload.campaign_external_id}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${token}`,
      },
      body: `daily_budget=${payload.daily_budget_cents}`,
    }
  );

  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Meta API error: ${JSON.stringify(body.error ?? body).substring(0, 300)}`);
  }

  return { meta_response: body, daily_budget_cents: payload.daily_budget_cents };
}
