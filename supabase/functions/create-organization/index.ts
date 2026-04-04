import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';

const MAX_NAME_LENGTH = 100;

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    // Verify user is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client (bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Create user client (respects RLS, verifies JWT)
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false },
      }
    );

    // Get authenticated user
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    let name: string, slug: string;
    try {
      const body = await req.json();
      name = body.name;
      slug = body.slug;
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // Validate name
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'name is required' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    if (name.length > MAX_NAME_LENGTH) {
      return new Response(
        JSON.stringify({ error: `name must be ${MAX_NAME_LENGTH} characters or less` }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // Validate slug
    if (!slug || typeof slug !== 'string') {
      return new Response(
        JSON.stringify({ error: 'slug is required' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    const slugRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
    if (!slugRegex.test(slug) || slug.length < 3 || slug.length > 50) {
      return new Response(
        JSON.stringify({ error: 'Slug must be 3-50 chars, lowercase alphanumeric with hyphens' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // === ATOMIC OPERATION: Create org + company (bridge) + membership + update profile ===

    // 1. Create organization (rely on UNIQUE constraint for slug dedup — no TOCTOU race)
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .insert({ name: name.trim(), slug })
      .select()
      .single();

    if (orgError) {
      // Handle UNIQUE constraint violation (slug taken)
      if (orgError.code === '23505') {
        return new Response(
          JSON.stringify({ error: 'This slug is already taken' }),
          { status: 409, headers: { ...cors, 'Content-Type': 'application/json' } }
        );
      }
      console.error('Failed to create organization:', orgError);
      return new Response(
        JSON.stringify({ error: 'Failed to create organization' }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Create corresponding company (bridge: organization_id links them)
    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .insert({
        name: name.trim(),
        slug,
        organization_id: org.id,
        status: 'active',
      })
      .select()
      .single();

    if (companyError) {
      // Rollback: delete the org we just created
      const { error: rollbackError } = await supabaseAdmin.from('organizations').delete().eq('id', org.id);
      if (rollbackError) console.error('CRITICAL: Rollback failed, orphaned org:', org.id, rollbackError);
      console.error('Failed to create company:', companyError);
      return new Response(
        JSON.stringify({ error: 'Failed to create company' }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Create membership (owner)
    const { data: membership, error: memberError } = await supabaseAdmin
      .from('organization_members')
      .insert({
        user_id: user.id,
        organization_id: org.id,
        role: 'owner',
      })
      .select()
      .single();

    if (memberError) {
      // Rollback: delete company and org
      const { error: r1 } = await supabaseAdmin.from('companies').delete().eq('id', company.id);
      const { error: r2 } = await supabaseAdmin.from('organizations').delete().eq('id', org.id);
      if (r1 || r2) console.error('CRITICAL: Rollback failed:', { companyError: r1, orgError: r2, orgId: org.id });
      console.error('Failed to create membership:', memberError);
      return new Response(
        JSON.stringify({ error: 'Failed to create membership' }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Set current_organization_id on profile (upsert for safety)
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert(
        { id: user.id, current_organization_id: org.id },
        { onConflict: 'id' }
      );

    if (profileError) {
      // Rollback everything — profile must point to the org for RLS to work
      const { error: r1 } = await supabaseAdmin.from('organization_members').delete().eq('id', membership.id);
      const { error: r2 } = await supabaseAdmin.from('companies').delete().eq('id', company.id);
      const { error: r3 } = await supabaseAdmin.from('organizations').delete().eq('id', org.id);
      if (r1 || r2 || r3) console.error('CRITICAL: Partial rollback failure:', { r1, r2, r3, orgId: org.id });
      console.error('Failed to update profile:', profileError);
      return new Response(
        JSON.stringify({ error: 'Failed to set organization as current' }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ organization: org, company, membership }),
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
