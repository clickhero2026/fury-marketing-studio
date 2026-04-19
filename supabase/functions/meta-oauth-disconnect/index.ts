import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';

const GRAPH_VERSION = Deno.env.get('META_GRAPH_API_VERSION') ?? 'v22.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    // Verify authentication
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

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Get user's company
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('current_organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.current_organization_id) {
      return new Response(
        JSON.stringify({ error: 'Organização não encontrada' }),
        { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('id')
      .eq('organization_id', profile.current_organization_id)
      .single();

    if (!company) {
      return new Response(
        JSON.stringify({ error: 'Empresa não encontrada' }),
        { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // Get current integration
    const { data: integration } = await supabaseAdmin
      .from('integrations')
      .select('id, access_token, facebook_user_id')
      .eq('company_id', company.id)
      .eq('platform', 'meta')
      .single();

    if (!integration) {
      return new Response(
        JSON.stringify({ error: 'Integração Meta não encontrada' }),
        { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // Decrypt token to revoke on Meta
    const { data: decryptedToken } = await supabaseAdmin
      .rpc('decrypt_meta_token', { encrypted_token: integration.access_token });

    // Revoke token on Meta (best effort — don't fail if Meta is down)
    if (decryptedToken) {
      try {
        const revokeUrl = `${GRAPH_BASE}/${integration.facebook_user_id}/permissions?access_token=${decryptedToken}`;
        const revokeResp = await fetch(revokeUrl, { method: 'DELETE' });
        const revokeData = await revokeResp.json();
        if (!revokeData.success) {
          console.warn('Meta token revocation returned:', revokeData);
        }
      } catch (revokeError) {
        console.warn('Failed to revoke Meta token (non-blocking):', revokeError);
      }
    }

    // DELETE em integrations — cascata automatica via FKs ON DELETE CASCADE
    // para: meta_ad_accounts, meta_pages, meta_business_managers, meta_api_rate_limit,
    // meta_scan_logs, campaigns, adsets, creatives, fury_*, compliance_*
    const { error: deleteError } = await supabaseAdmin
      .from('integrations')
      .delete()
      .eq('id', integration.id);

    if (deleteError) {
      console.error('[disconnect] Failed to delete integration:', deleteError);
      return new Response(
        JSON.stringify({
          error: `Falha ao remover integracao: ${deleteError.message}`,
          details: deleteError.details ?? null,
          hint: deleteError.hint ?? null,
          code: deleteError.code ?? null,
        }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Cleanup oauth_sessions
    await supabaseAdmin
      .from('oauth_sessions')
      .delete()
      .eq('user_id', user.id);

    return new Response(
      JSON.stringify({ success: true, message: 'Integração Meta desconectada com sucesso' }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
