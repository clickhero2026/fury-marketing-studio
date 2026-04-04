import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

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

    let invitation_id: string;
    try {
      const body = await req.json();
      invitation_id = body.invitation_id;
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    if (!invitation_id || typeof invitation_id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'invitation_id is required' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch invitation
    const { data: invitation, error: invError } = await supabaseAdmin
      .from('organization_invitations')
      .select('*')
      .eq('id', invitation_id)
      .eq('status', 'pending')
      .single();

    if (invError || !invitation) {
      return new Response(
        JSON.stringify({ error: 'Invitation not found or already used' }),
        { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // Verify email matches (case-insensitive — DB trigger normalizes to lowercase)
    if (!user.email || invitation.email.toLowerCase() !== user.email.toLowerCase()) {
      return new Response(
        JSON.stringify({ error: 'This invitation was sent to a different email' }),
        { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // Check expiration
    if (new Date(invitation.expires_at) < new Date()) {
      const { error: expireError } = await supabaseAdmin
        .from('organization_invitations')
        .update({ status: 'expired' })
        .eq('id', invitation_id);

      if (expireError) {
        console.error('Failed to mark invitation as expired:', expireError);
      }

      return new Response(
        JSON.stringify({ error: 'Invitation has expired' }),
        { status: 410, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // Check if already a member
    const { data: existingMember } = await supabaseAdmin
      .from('organization_members')
      .select('id')
      .eq('user_id', user.id)
      .eq('organization_id', invitation.organization_id)
      .maybeSingle();

    if (existingMember) {
      const { error: updateError } = await supabaseAdmin
        .from('organization_invitations')
        .update({ status: 'accepted' })
        .eq('id', invitation_id);

      if (updateError) {
        console.error('Failed to update invitation status:', updateError);
      }

      return new Response(
        JSON.stringify({ message: 'Already a member of this organization' }),
        { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // Create membership
    const { data: membership, error: memberError } = await supabaseAdmin
      .from('organization_members')
      .insert({
        user_id: user.id,
        organization_id: invitation.organization_id,
        role: invitation.role,
      })
      .select()
      .single();

    if (memberError) {
      console.error('Failed to create membership:', memberError);
      return new Response(
        JSON.stringify({ error: 'Failed to accept invitation' }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // Mark invitation as accepted
    const { error: acceptError } = await supabaseAdmin
      .from('organization_invitations')
      .update({ status: 'accepted' })
      .eq('id', invitation_id);

    if (acceptError) {
      console.error('Failed to mark invitation as accepted:', acceptError);
    }

    // If user has no current org, set this one
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('current_organization_id')
      .eq('id', user.id)
      .maybeSingle();

    if (profile && !profile.current_organization_id) {
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({ current_organization_id: invitation.organization_id })
        .eq('id', user.id);

      if (profileError) {
        console.error('Failed to set current organization:', profileError);
      }
    }

    return new Response(
      JSON.stringify({ membership }),
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
