import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';

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

    // Generate cryptographic state token (anti-CSRF)
    const stateBytes = new Uint8Array(32);
    crypto.getRandomValues(stateBytes);
    const state = Array.from(stateBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // Save state in oauth_sessions with 10min expiry
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Clean expired sessions first
    await supabaseAdmin
      .from('oauth_sessions')
      .delete()
      .lt('expires_at', new Date().toISOString());

    // Create new session
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    const { error: insertError } = await supabaseAdmin
      .from('oauth_sessions')
      .insert({
        id: state,
        user_id: user.id,
        access_token: 'pending', // placeholder, required by schema
        accounts: {}, // placeholder, required by schema
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error('Failed to save OAuth state:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to initiate OAuth flow' }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // Build Meta OAuth URL
    const appId = Deno.env.get('META_APP_ID') ?? '904130965439344';
    const redirectUri = Deno.env.get('META_OAUTH_REDIRECT_URI')
      ?? `${Deno.env.get('SUPABASE_URL')}/functions/v1/meta-oauth-callback`;
    const graphVersion = Deno.env.get('META_GRAPH_API_VERSION') ?? 'v22.0';

    const scopes = [
      'ads_read',
      'ads_management',
      'business_management',
      'pages_read_engagement',
    ].join(',');

    const oauthUrl = new URL(`https://www.facebook.com/${graphVersion}/dialog/oauth`);
    oauthUrl.searchParams.set('client_id', appId);
    oauthUrl.searchParams.set('redirect_uri', redirectUri);
    oauthUrl.searchParams.set('state', state);
    oauthUrl.searchParams.set('scope', scopes);
    oauthUrl.searchParams.set('response_type', 'code');

    return new Response(
      JSON.stringify({ url: oauthUrl.toString(), state }),
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
