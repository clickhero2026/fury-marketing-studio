// Tenant guard generico para Edge Functions.
// Spec: knowledge-base-rag (task 9.1 — R9.4)
//
// Resolve user_id + company_id + organization_id a partir do JWT do usuario.
// Edge Functions que rodam com service_role devem chamar ANTES de qualquer
// leitura/escrita de dados de tenant — service_role bypassa RLS.
//
// Reexporta requireBriefingTenant como alias retrocompativel.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type TenantGuardOk = {
  ok: true;
  value: {
    userId: string;
    companyId: string;
    organizationId: string;
  };
};

export type TenantGuardFail = {
  ok: false;
  response: Response;
};

export type TenantGuardResult = TenantGuardOk | TenantGuardFail;

interface GuardOptions {
  cors: Record<string, string>;
}

/**
 * Resolve { userId, companyId, organizationId } a partir do JWT.
 * Retorna 401 sem token / token invalido; 404 sem org/company.
 */
export async function requireTenant(
  req: Request,
  supabaseAdmin: SupabaseClient,
  opts: GuardOptions,
): Promise<TenantGuardResult> {
  const cors = opts.cors;

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      }),
    };
  }

  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );

  const { data: { user }, error: ue } = await supabaseUser.auth.getUser();
  if (ue || !user) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      }),
    };
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('current_organization_id')
    .eq('id', user.id)
    .single();

  if (!profile?.current_organization_id) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: 'Organizacao nao encontrada' }), {
        status: 404,
        headers: { ...cors, 'Content-Type': 'application/json' },
      }),
    };
  }

  const { data: company } = await supabaseAdmin
    .from('companies')
    .select('id')
    .eq('organization_id', profile.current_organization_id)
    .single();

  if (!company) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: 'Empresa nao encontrada' }), {
        status: 404,
        headers: { ...cors, 'Content-Type': 'application/json' },
      }),
    };
  }

  return {
    ok: true,
    value: {
      userId: user.id,
      companyId: company.id as string,
      organizationId: profile.current_organization_id as string,
    },
  };
}

/** Alias retrocompativel — uso pre-knowledge-base-rag. */
export { requireTenant as requireBriefingTenant };
