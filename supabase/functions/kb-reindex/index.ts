// kb-reindex — Reindex sob demanda da Knowledge Base.
// Spec: .kiro/specs/knowledge-base-rag/ (task 3.5)
//
// Estrategia: marca documents alvo como status='pending' (e zera embedding_model_version).
// O cron kb-process-pending entao re-roda o pipeline kb-ingest com o modelo atual,
// que apaga chunks antigos e insere novos transacionalmente. Mantem chunks antigos
// disponiveis ate kb-ingest concluir (R10.3).
//
// Scope:
//   - 'document': um id especifico
//   - 'company': todos documentos da company do JWT
//   - 'global': todos documentos (requer service_role; admin only)
//   - 'failed': retry todos com status='failed' do tenant (R10.5)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { requireTenant } from '../_shared/tenant-guard.ts';
import { logKbAccess } from '../_shared/log-redact.ts';

interface ReindexBody {
  scope: 'document' | 'company' | 'global' | 'failed';
  target_id?: string;
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  // Tenant guard generico — resolve userId/companyId/organizationId a partir do JWT.
  const guard = await requireTenant(req, admin, { cors });
  if (!guard.ok) return guard.response;
  const { userId, companyId, organizationId } = guard.value;

  // Role check (global so para owner)
  const { data: membership } = await admin.from('organization_members')
    .select('role').eq('user_id', userId)
    .eq('organization_id', organizationId).single();
  const role = membership?.role ?? null;

  let body: ReindexBody;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'invalid body' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  if (!['document', 'company', 'global', 'failed'].includes(body.scope)) {
    return new Response(JSON.stringify({ error: 'invalid scope' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  let updateQuery = admin.from('knowledge_documents').update({
    status: 'pending',
    status_error: null,
  });

  if (body.scope === 'document') {
    if (!body.target_id) {
      return new Response(JSON.stringify({ error: 'target_id required for scope=document' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    // Tenant guard: documento precisa pertencer a company
    updateQuery = updateQuery.eq('id', body.target_id).eq('company_id', companyId);
  } else if (body.scope === 'failed') {
    updateQuery = updateQuery.eq('company_id', companyId).eq('status', 'failed');
  } else if (body.scope === 'company') {
    updateQuery = updateQuery.eq('company_id', companyId);
  } else {
    // global
    if (role !== 'owner') {
      return new Response(JSON.stringify({ error: 'forbidden — global reindex requires owner role' }), {
        status: 403, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    // sem filtros — afeta todos
  }

  const { error, count } = await updateQuery.select('id', { count: 'exact', head: true });
  if (error) {
    logKbAccess({
      companyId,
      userId,
      event: 'reindex',
      status: 'failed',
      errorKind: 'db_error',
    });
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  logKbAccess({
    companyId,
    userId,
    event: 'reindex',
    chunkCount: count ?? 0,
    status: 'success',
  });

  return new Response(JSON.stringify({ queued: count ?? 0 }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
