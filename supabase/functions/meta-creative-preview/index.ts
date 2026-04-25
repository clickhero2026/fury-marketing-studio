// Edge Function: meta-creative-preview
// Spec: as-built (extensao do meta-sync-dashboard)
//
// Gera URL de preview do criativo via Meta Ad Preview API.
// Funciona ate para dark posts (anuncios sem post publico).
//
// Body: { creative_id: string }  // creatives.id (uuid interno)
// Returns: { ok: true, iframe_url: string, format: string }
//
// Auth: JWT do usuario (RLS garante que so acessa criativos da propria company).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';

const GRAPH_VERSION = Deno.env.get('META_GRAPH_API_VERSION') ?? 'v22.0';

// Formato default: feed standard (funciona pra video e imagem na maioria dos casos)
const DEFAULT_AD_FORMAT = 'DESKTOP_FEED_STANDARD';

interface RequestBody {
  creative_id: string;
  ad_format?: string;  // override opcional
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
    if (!body.creative_id) return jsonResponse(400, { error: 'creative_id required' }, cors);

    // RLS via supabaseUser garante company correta
    const { data: creative, error: cErr } = await supabaseUser
      .from('creatives')
      .select('id, ad_external_id, company_id, type, detected_media_type')
      .eq('id', body.creative_id)
      .maybeSingle();

    if (cErr) return jsonResponse(500, { error: 'Failed to load creative' }, cors);
    if (!creative) return jsonResponse(404, { error: 'Creative not found or no access' }, cors);
    if (!creative.ad_external_id) {
      return jsonResponse(409, {
        error: 'Creative sem ad_external_id — sincronize novamente para popular',
      }, cors);
    }

    // Service-role pra ler token decriptografado
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: integration } = await supabaseAdmin
      .from('integrations')
      .select('access_token')
      .eq('company_id', creative.company_id)
      .eq('platform', 'meta')
      .single();
    if (!integration?.access_token) {
      return jsonResponse(404, { error: 'Meta integration token nao encontrado' }, cors);
    }

    const { data: decrypted } = await supabaseAdmin.rpc('decrypt_meta_token', {
      encrypted_token: integration.access_token,
    });
    if (!decrypted) return jsonResponse(500, { error: 'Falha ao descriptografar token' }, cors);
    const token = decrypted as string;

    const adFormat = body.ad_format || DEFAULT_AD_FORMAT;

    // Meta Ad Preview API
    // GET /{ad_id}/previews?ad_format=DESKTOP_FEED_STANDARD&access_token=...
    // Returns: { data: [{ body: "<iframe src='...'>...</iframe>" }] }
    const url =
      `https://graph.facebook.com/${GRAPH_VERSION}/${creative.ad_external_id}/previews` +
      `?ad_format=${encodeURIComponent(adFormat)}&access_token=${encodeURIComponent(token)}`;

    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok || data.error) {
      console.error('[meta-creative-preview] API error:', data);
      return jsonResponse(502, {
        error: `Meta API: ${data.error?.message ?? 'unknown'}`,
        details: data.error,
      }, cors);
    }

    const previewBody = data.data?.[0]?.body as string | undefined;
    if (!previewBody) {
      return jsonResponse(404, {
        error: 'Meta nao retornou preview (anuncio talvez expirou ou foi excluido)',
      }, cors);
    }

    // Extrair src do iframe retornado pela Meta
    const srcMatch = previewBody.match(/src=["']([^"']+)["']/);
    const iframeUrl = srcMatch?.[1] ?? null;

    if (!iframeUrl) {
      return jsonResponse(500, {
        error: 'Falha ao extrair iframe URL da resposta Meta',
        raw: previewBody.substring(0, 500),
      }, cors);
    }

    return jsonResponse(200, {
      ok: true,
      iframe_url: iframeUrl,
      ad_format: adFormat,
    }, cors);
  } catch (err) {
    console.error('[meta-creative-preview] unexpected:', err);
    const msg = err instanceof Error ? err.message : 'Internal error';
    return jsonResponse(500, { error: msg }, getCorsHeaders(req));
  }
});

function jsonResponse(status: number, body: unknown, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
