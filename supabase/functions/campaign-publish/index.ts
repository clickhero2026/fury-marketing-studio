import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.23.8';
import { getCorsHeaders } from '../_shared/cors.ts';

/**
 * Campaign Publisher — cria campanha Meta em 3 niveis com compliance gate e rollback.
 *
 * Fluxo: validate → compliance check → create campaign → create adset → create creative → create ad
 * Se qualquer step falhar: rollback em ordem inversa
 */

const GRAPH_VERSION = Deno.env.get('META_GRAPH_API_VERSION') ?? 'v22.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-sonnet-4-5-20241022';
const META_RETRY_DELAYS = [1000, 3000];

// ============================================================
// Zod schemas
// ============================================================

const CampaignSchema = z.object({
  name: z.string().min(1, 'Nome obrigatorio').max(250, 'Max 250 chars'),
  objective: z.enum(['OUTCOME_SALES', 'OUTCOME_LEADS', 'OUTCOME_AWARENESS', 'OUTCOME_TRAFFIC', 'OUTCOME_ENGAGEMENT', 'OUTCOME_APP_PROMOTION']),
  status: z.enum(['ACTIVE', 'PAUSED']).default('PAUSED'),
  buying_type: z.enum(['AUCTION', 'RESERVED']).default('AUCTION'),
  special_ad_categories: z.array(z.string()).default([]),
  start_time: z.string().datetime().optional(),
  stop_time: z.string().datetime().optional(),
});

const AdsetSchema = z.object({
  name: z.string().min(1).max(400),
  daily_budget: z.number().int().min(1000, 'Minimo R$ 10,00/dia (BRL)').optional(),
  lifetime_budget: z.number().int().min(7000, 'Minimo R$ 70,00').optional(),
  targeting: z.object({
    geo_locations: z.object({
      countries: z.array(z.string().length(2)).optional(),
    }).default({ countries: ['BR'] }),
    age_min: z.number().int().min(13).max(65).default(18),
    age_max: z.number().int().min(13).max(65).default(65),
    genders: z.array(z.number().int().min(1).max(2)).optional(),
    interests: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
  }),
  optimization_goal: z.enum(['LINK_CLICKS', 'LANDING_PAGE_VIEWS', 'CONVERSIONS', 'REACH', 'IMPRESSIONS', 'LEAD_GENERATION']),
  billing_event: z.enum(['IMPRESSIONS', 'LINK_CLICKS']).default('IMPRESSIONS'),
  start_time: z.string().datetime().optional(),
});

const AdSchema = z.object({
  name: z.string().min(1).max(400),
  headline: z.string().min(1, 'Headline obrigatorio').max(40, 'Max 40 chars'),
  body: z.string().min(1, 'Texto obrigatorio').max(125, 'Max 125 chars'),
  description: z.string().max(27).optional(),
  cta: z.enum(['LEARN_MORE', 'SHOP_NOW', 'SIGN_UP', 'SUBSCRIBE', 'DOWNLOAD', 'CONTACT_US', 'GET_OFFER', 'BOOK_NOW']).default('LEARN_MORE'),
  image_url: z.string().url().optional(),
  video_url: z.string().url().optional(),
  link_url: z.string().url('URL de destino invalida'),
  page_id: z.string().min(1, 'Pagina Facebook obrigatoria'),
  pixel_id: z.string().optional(),
});

// ============================================================
// Compliance inline (simplificado)
// ============================================================

async function fetchImageAsBase64(url: string): Promise<{ base64: string; mediaType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    const base64 = btoa(binary);
    const mediaType = contentType.includes('png') ? 'image/png'
      : contentType.includes('webp') ? 'image/webp'
      : contentType.includes('gif') ? 'image/gif' : 'image/jpeg';
    return { base64, mediaType };
  } catch {
    return null;
  }
}

async function callClaudeForCompliance(apiKey: string, systemPrompt: string, content: Array<{ type: string; [key: string]: unknown }>): Promise<{ score: number; violations: Array<{ severity: string; description: string }> } | null> {
  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 1024, system: systemPrompt, messages: [{ role: 'user', content }] }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = data.content?.find((b: { type: string }) => b.type === 'text')?.text ?? '';
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = match ? match[1].trim() : raw.trim();
    const parsed = JSON.parse(jsonStr);
    return {
      score: Math.max(0, Math.min(100, parsed.score ?? 100)),
      violations: Array.isArray(parsed.violations) ? parsed.violations : [],
    };
  } catch {
    return null;
  }
}

async function checkCompliance(
  supabase: SupabaseClient,
  companyId: string,
  ad: z.infer<typeof AdSchema>,
): Promise<{ score: number; violations: Array<{ severity: string; description: string }>; blocked: boolean }> {
  // Busca ANTHROPIC_API_KEY
  const { data: key } = await supabase.rpc('get_vault_secret', { secret_name: 'ANTHROPIC_API_KEY' });
  const apiKey = (key as string | null) ?? Deno.env.get('ANTHROPIC_API_KEY') ?? '';

  // Busca config + blacklist
  const { data: company } = await supabase
    .from('companies')
    .select('takedown_threshold, brand_colors, brand_logo_url')
    .eq('id', companyId)
    .single();

  const { data: rules } = await supabase
    .from('compliance_rules')
    .select('value, rule_type')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .in('rule_type', ['blacklist_term', 'required_term']);

  const blacklist = (rules ?? []).filter((r) => r.rule_type === 'blacklist_term').map((r) => r.value);
  const required = (rules ?? []).filter((r) => r.rule_type === 'required_term').map((r) => r.value);
  const threshold = (company?.takedown_threshold as number | null) ?? 50;

  if (!apiKey) {
    // Sem API key: nao bloqueia, mas retorna score neutro
    return { score: 100, violations: [], blocked: false };
  }

  // --- Copy analysis ---
  const copy = `Headline: ${ad.headline}\nBody: ${ad.body}${ad.description ? `\nDescription: ${ad.description}` : ''}`;
  const copySystem = `Voce e um especialista em compliance de anuncios Meta Ads.
Analise o copy do anuncio e retorne APENAS um JSON valido (sem markdown).
Regras: critical=-40pts, warning=-20pts, info=-5pts. Score 0-100.`;
  const copyUser = `COPY:
${copy}

TERMOS PROIBIDOS: ${blacklist.length > 0 ? blacklist.join(', ') : '(nenhum)'}
TERMOS OBRIGATORIOS: ${required.length > 0 ? required.join(', ') : '(nenhum)'}

Retorne: {"score": <0-100>, "violations": [{"severity": "info|warning|critical", "description": "<texto>"}]}`;

  const copyResult = await callClaudeForCompliance(apiKey, copySystem, [{ type: 'text', text: copyUser }]);
  const copyScore = copyResult?.score ?? 100;
  const copyViolations = copyResult?.violations ?? [];

  // --- Image analysis (se houver imagem e brand config) ---
  let imageScore: number | null = null;
  let imageViolations: Array<{ severity: string; description: string }> = [];

  if (ad.image_url) {
    const img = await fetchImageAsBase64(ad.image_url);
    if (img) {
      const brandColors = (company?.brand_colors as string[] | null) ?? [];
      const brandLogoUrl = (company?.brand_logo_url as string | null) ?? null;

      const imgSystem = `Voce e especialista em compliance visual de anuncios Meta Ads.
Retorne APENAS um JSON valido (sem markdown). Regras: critical=-40, warning=-20, info=-5. Score 0-100.`;

      const colorSection = brandColors.length > 0
        ? `\nCORES DA MARCA (hex): ${brandColors.join(', ')}\nVerifique aderencia.`
        : '';

      const imgUser = `TERMOS PROIBIDOS: ${blacklist.length > 0 ? blacklist.join(', ') : '(nenhum)'}${colorSection}

Tarefas: extraia texto (OCR), verifique termos proibidos no texto extraido, detecte claims visuais problematicos (antes/depois, numeros sem fonte), elementos enganosos.

Retorne: {"score": <0-100>, "violations": [{"severity": "info|warning|critical", "description": "<texto>"}]}`;

      const imgContent: Array<{ type: string; [key: string]: unknown }> = [];
      if (brandLogoUrl) {
        const logoImg = await fetchImageAsBase64(brandLogoUrl);
        if (logoImg) imgContent.push({ type: 'image', source: { type: 'base64', media_type: logoImg.mediaType, data: logoImg.base64 } });
      }
      imgContent.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.base64 } });
      imgContent.push({ type: 'text', text: imgUser });

      const result = await callClaudeForCompliance(apiKey, imgSystem, imgContent);
      if (result) {
        imageScore = result.score;
        imageViolations = result.violations;
      }
    }
  }

  // --- Final score: ponderado 60% copy + 40% visual (ou so copy) ---
  const finalScore = imageScore !== null
    ? Math.round(copyScore * 0.6 + imageScore * 0.4)
    : copyScore;
  const allViolations = [...copyViolations, ...imageViolations];
  const blocked = finalScore < threshold;

  return { score: finalScore, violations: allViolations, blocked };
}

// ============================================================
// Meta API helpers
// ============================================================

async function metaCall(
  token: string,
  path: string,
  method: 'POST' | 'DELETE',
  body?: Record<string, unknown>,
  attempt = 0,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const url = `${GRAPH_BASE}${path}`;
  const init: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${token}` },
  };

  if (body && method === 'POST') {
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) {
      form.append(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
    init.body = form;
    init.headers = { ...init.headers, 'Content-Type': 'application/x-www-form-urlencoded' };
  }

  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));

  // Retry em 5xx
  if (res.status >= 500 && attempt < META_RETRY_DELAYS.length) {
    await new Promise((r) => setTimeout(r, META_RETRY_DELAYS[attempt]));
    return metaCall(token, path, method, body, attempt + 1);
  }

  return { ok: res.ok, status: res.status, data };
}

// ============================================================
// Rollback helper
// ============================================================

async function rollback(
  token: string,
  ids: { ad_id?: string | null; creative_id?: string | null; adset_id?: string | null; campaign_id?: string | null },
  supabase: SupabaseClient,
  publicationId: string,
): Promise<void> {
  const deleteOrder = [
    { field: 'ad_id', value: ids.ad_id, name: 'rollback_ad' },
    { field: 'creative_id', value: ids.creative_id, name: 'rollback_creative' },
    { field: 'adset_id', value: ids.adset_id, name: 'rollback_adset' },
    { field: 'campaign_id', value: ids.campaign_id, name: 'rollback_campaign' },
  ];

  for (const item of deleteOrder) {
    if (!item.value) continue;
    try {
      const res = await metaCall(token, `/${item.value}`, 'DELETE');
      await supabase.from('campaign_publication_steps').insert({
        publication_id: publicationId,
        step_name: item.name,
        status: res.ok ? 'rolled_back' : 'failed',
        external_id: item.value,
        meta_api_response: res.data,
        error_message: res.ok ? null : `Rollback falhou para ${item.value}`,
      });
    } catch (err) {
      await supabase.from('campaign_publication_steps').insert({
        publication_id: publicationId,
        step_name: item.name,
        status: 'failed',
        external_id: item.value,
        error_message: (err as Error).message,
      });
    }
  }
}

// ============================================================
// HTTP handler
// ============================================================

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // ---- Auth: JWT obrigatorio ----
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing authorization' }), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: { user }, error: ue } = await supabaseUser.auth.getUser();
  if (ue || !user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles').select('current_organization_id').eq('id', user.id).single();
  if (!profile?.current_organization_id) {
    return new Response(JSON.stringify({ error: 'Organizacao nao encontrada' }), {
      status: 404, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  const { data: company } = await supabaseAdmin
    .from('companies').select('id').eq('organization_id', profile.current_organization_id).single();
  if (!company) {
    return new Response(JSON.stringify({ error: 'Empresa nao encontrada' }), {
      status: 404, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  const companyId = company.id as string;

  // ---- Briefing gate (briefing-onboarding R8.3) — OPT-IN FAIL-OPEN ----
  // Controlado por env BRIEFING_GATE_ENABLED. Default OFF — preserva comportamento
  // atual para companies criadas antes da feature de briefing.
  // Quando ligado: bloqueia publish se briefing incompleto, retornando 422
  // com missingFields para que o frontend direcione o usuario.
  if (Deno.env.get('BRIEFING_GATE_ENABLED') === 'true') {
    const { data: bs } = await supabaseAdmin
      .from('v_company_briefing_status')
      .select('is_complete, missing_fields')
      .eq('company_id', companyId)
      .maybeSingle();
    if (bs && !bs.is_complete) {
      return new Response(JSON.stringify({
        error: 'Briefing incompleto. Complete antes de publicar campanha.',
        kind: 'briefing_incomplete',
        missing_fields: bs.missing_fields ?? [],
      }), { status: 422, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    // Se nao existe row em v_company_briefing_status (briefing nunca iniciado), fail-open
    // (companies pre-feature continuam funcionando ate iniciarem o briefing).
  }

  // ---- Parse body ----
  let body: { draft_id?: string; ad_account_id?: string; campaign_data?: unknown; adset_data?: unknown; ad_data?: unknown; force?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON body invalido' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // ---- Idempotency: rejeita request duplicada em vigor ----
  // Se ja existe uma publication 'publishing'/'compliance_check' pra mesma company+user ha < 60s, bloqueia
  const sixtyAgo = new Date(Date.now() - 60_000).toISOString();
  const { data: inflight } = await supabaseAdmin
    .from('campaign_publications')
    .select('id, status, started_at')
    .eq('company_id', companyId)
    .eq('created_by', user.id)
    .in('status', ['validating', 'compliance_check', 'publishing'])
    .gte('started_at', sixtyAgo)
    .limit(1)
    .maybeSingle();
  if (inflight) {
    return new Response(JSON.stringify({
      error: 'Ja existe uma publicacao em andamento. Aguarde concluir.',
      publication_id: inflight.id,
      in_flight_status: inflight.status,
    }), { status: 409, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Carrega draft se draft_id
  let adAccountId: string | undefined = body.ad_account_id;
  let campaignRaw: unknown = body.campaign_data;
  let adsetRaw: unknown = body.adset_data;
  let adRaw: unknown = body.ad_data;
  let draftId: string | null = body.draft_id ?? null;
  let publicationName = 'Nova campanha';

  if (draftId) {
    const { data: draft } = await supabaseAdmin
      .from('campaign_drafts')
      .select('id, name, ad_account_id, campaign_data, adset_data, ad_data')
      .eq('id', draftId)
      .eq('company_id', companyId)
      .single();
    if (!draft) {
      return new Response(JSON.stringify({ error: 'Draft nao encontrado' }), {
        status: 404, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    adAccountId = draft.ad_account_id as string;
    campaignRaw = draft.campaign_data;
    adsetRaw = draft.adset_data;
    adRaw = draft.ad_data;
    publicationName = draft.name as string;
  }

  if (!adAccountId) {
    return new Response(JSON.stringify({ error: 'ad_account_id obrigatorio' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // ---- Cria publication inicial ----
  const { data: publication } = await supabaseAdmin
    .from('campaign_publications')
    .insert({
      company_id: companyId,
      draft_id: draftId,
      name: publicationName,
      status: 'validating',
      created_by: user.id,
    })
    .select('id').single();

  if (!publication?.id) {
    return new Response(JSON.stringify({ error: 'Falha ao criar publication' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  const publicationId = publication.id as string;

  const updatePublication = (patch: Record<string, unknown>) =>
    supabaseAdmin.from('campaign_publications').update(patch).eq('id', publicationId);

  // ---- Zod validacao ----
  const campaignResult = CampaignSchema.safeParse(campaignRaw);
  const adsetResult = AdsetSchema.safeParse(adsetRaw);
  const adResult = AdSchema.safeParse(adRaw);

  if (!campaignResult.success || !adsetResult.success || !adResult.success) {
    const errors: Record<string, unknown> = {};
    if (!campaignResult.success) errors.campaign = campaignResult.error.issues;
    if (!adsetResult.success) errors.adset = adsetResult.error.issues;
    if (!adResult.success) errors.ad = adResult.error.issues;

    await updatePublication({
      status: 'failed',
      error_stage: 'validation',
      error_message: JSON.stringify(errors).slice(0, 500),
      finished_at: new Date().toISOString(),
    });

    return new Response(JSON.stringify({ error: 'Validacao falhou', validation_errors: errors, publication_id: publicationId }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const campaignData = campaignResult.data;
  const adsetData = adsetResult.data;
  const adData = adResult.data;

  // Garantir ao menos 1 budget
  if (!adsetData.daily_budget && !adsetData.lifetime_budget) {
    await updatePublication({
      status: 'failed',
      error_stage: 'validation',
      error_message: 'daily_budget ou lifetime_budget obrigatorio',
      finished_at: new Date().toISOString(),
    });
    return new Response(JSON.stringify({ error: 'daily_budget ou lifetime_budget obrigatorio', publication_id: publicationId }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // ---- Compliance gate ----
  await updatePublication({ status: 'compliance_check' });
  const compliance = await checkCompliance(supabaseAdmin, companyId, adData);

  await updatePublication({
    compliance_score: compliance.score,
    compliance_violations: compliance.violations,
  });

  if (compliance.blocked && !body.force) {
    await updatePublication({
      status: 'failed',
      error_stage: 'compliance',
      error_message: `Score ${compliance.score} abaixo do threshold. ${compliance.violations.length} violacoes.`,
      finished_at: new Date().toISOString(),
    });
    return new Response(JSON.stringify({
      error: 'Bloqueado pelo compliance',
      compliance_score: compliance.score,
      violations: compliance.violations,
      publication_id: publicationId,
    }), { status: 422, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // ---- Meta token ----
  const { data: integration } = await supabaseAdmin
    .from('integrations')
    .select('access_token')
    .eq('company_id', companyId).eq('platform', 'meta').single();
  if (!integration?.access_token) {
    await updatePublication({
      status: 'failed', error_stage: 'auth',
      error_message: 'Integracao Meta nao encontrada',
      finished_at: new Date().toISOString(),
    });
    return new Response(JSON.stringify({ error: 'Integracao Meta nao encontrada' }), {
      status: 404, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  const { data: decrypted } = await supabaseAdmin.rpc('decrypt_meta_token', {
    encrypted_token: integration.access_token,
  });
  if (!decrypted) {
    await updatePublication({
      status: 'failed', error_stage: 'auth',
      error_message: 'Falha ao descriptografar token',
      finished_at: new Date().toISOString(),
    });
    return new Response(JSON.stringify({ error: 'Falha ao descriptografar token' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  const metaToken = decrypted as string;
  const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

  // ---- Publish sequence ----
  await updatePublication({ status: 'publishing', current_step: 'creating_campaign' });

  const logStep = (stepName: string, status: string, externalId?: string | null, response?: unknown, error?: string) =>
    supabaseAdmin.from('campaign_publication_steps').insert({
      publication_id: publicationId,
      step_name: stepName,
      status,
      external_id: externalId ?? null,
      meta_api_response: response ?? null,
      error_message: error ?? null,
    });

  const ids = { campaign_id: null as string | null, adset_id: null as string | null, creative_id: null as string | null, ad_id: null as string | null };

  // 1. Campaign
  {
    await logStep('campaign', 'pending');
    const payload: Record<string, unknown> = {
      name: campaignData.name,
      objective: campaignData.objective,
      status: campaignData.status,
      buying_type: campaignData.buying_type,
      special_ad_categories: JSON.stringify(campaignData.special_ad_categories),
    };
    if (campaignData.start_time) payload.start_time = campaignData.start_time;
    if (campaignData.stop_time) payload.stop_time = campaignData.stop_time;

    const res = await metaCall(metaToken, `/${actId}/campaigns`, 'POST', payload);
    if (!res.ok || !(res.data as { id?: string }).id) {
      await logStep('campaign', 'failed', null, res.data, JSON.stringify(res.data).slice(0, 200));
      await updatePublication({
        status: 'failed', error_stage: 'campaign',
        error_message: `Meta ${res.status}: ${JSON.stringify(res.data).slice(0, 300)}`,
        finished_at: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ error: 'Falha ao criar campaign', meta: res.data, publication_id: publicationId }), {
        status: 502, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    ids.campaign_id = (res.data as { id: string }).id;
    await logStep('campaign', 'success', ids.campaign_id, res.data);
    await updatePublication({ meta_campaign_id: ids.campaign_id, current_step: 'creating_adset' });
  }

  // 2. Adset
  {
    await logStep('adset', 'pending');
    const payload: Record<string, unknown> = {
      name: adsetData.name,
      campaign_id: ids.campaign_id,
      optimization_goal: adsetData.optimization_goal,
      billing_event: adsetData.billing_event,
      targeting: adsetData.targeting,
      status: campaignData.status,
    };
    if (adsetData.daily_budget) payload.daily_budget = adsetData.daily_budget;
    if (adsetData.lifetime_budget) payload.lifetime_budget = adsetData.lifetime_budget;
    if (adsetData.start_time) payload.start_time = adsetData.start_time;

    const res = await metaCall(metaToken, `/${actId}/adsets`, 'POST', payload);
    if (!res.ok || !(res.data as { id?: string }).id) {
      await logStep('adset', 'failed', null, res.data, JSON.stringify(res.data).slice(0, 200));
      await rollback(metaToken, ids, supabaseAdmin, publicationId);
      await updatePublication({
        status: 'failed', error_stage: 'adset',
        error_message: `Meta ${res.status}: ${JSON.stringify(res.data).slice(0, 300)}`,
        finished_at: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ error: 'Falha ao criar adset, rollback executado', meta: res.data, publication_id: publicationId }), {
        status: 502, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    ids.adset_id = (res.data as { id: string }).id;
    await logStep('adset', 'success', ids.adset_id, res.data);
    await updatePublication({ meta_adset_id: ids.adset_id, current_step: 'creating_creative' });
  }

  // 3. Ad Creative
  {
    await logStep('creative', 'pending');
    const objectStorySpec: Record<string, unknown> = {
      page_id: adData.page_id,
      link_data: {
        link: adData.link_url,
        message: adData.body,
        name: adData.headline,
        description: adData.description,
        call_to_action: { type: adData.cta, value: { link: adData.link_url } },
        ...(adData.image_url ? { picture: adData.image_url } : {}),
      },
    };

    const payload: Record<string, unknown> = {
      name: `${adData.name} — Creative`,
      object_story_spec: JSON.stringify(objectStorySpec),
    };

    const res = await metaCall(metaToken, `/${actId}/adcreatives`, 'POST', payload);
    if (!res.ok || !(res.data as { id?: string }).id) {
      await logStep('creative', 'failed', null, res.data, JSON.stringify(res.data).slice(0, 200));
      await rollback(metaToken, ids, supabaseAdmin, publicationId);
      await updatePublication({
        status: 'failed', error_stage: 'creative',
        error_message: `Meta ${res.status}: ${JSON.stringify(res.data).slice(0, 300)}`,
        finished_at: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ error: 'Falha ao criar creative, rollback executado', meta: res.data, publication_id: publicationId }), {
        status: 502, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    ids.creative_id = (res.data as { id: string }).id;
    await logStep('creative', 'success', ids.creative_id, res.data);
    await updatePublication({ meta_creative_id: ids.creative_id, current_step: 'creating_ad' });
  }

  // 4. Ad
  {
    await logStep('ad', 'pending');
    const payload: Record<string, unknown> = {
      name: adData.name,
      adset_id: ids.adset_id,
      creative: JSON.stringify({ creative_id: ids.creative_id }),
      status: campaignData.status,
    };

    const res = await metaCall(metaToken, `/${actId}/ads`, 'POST', payload);
    if (!res.ok || !(res.data as { id?: string }).id) {
      await logStep('ad', 'failed', null, res.data, JSON.stringify(res.data).slice(0, 200));
      await rollback(metaToken, ids, supabaseAdmin, publicationId);
      await updatePublication({
        status: 'failed', error_stage: 'ad',
        error_message: `Meta ${res.status}: ${JSON.stringify(res.data).slice(0, 300)}`,
        finished_at: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ error: 'Falha ao criar ad, rollback executado', meta: res.data, publication_id: publicationId }), {
        status: 502, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    ids.ad_id = (res.data as { id: string }).id;
    await logStep('ad', 'success', ids.ad_id, res.data);
  }

  // ---- Sucesso ----
  await updatePublication({
    status: 'live',
    meta_ad_id: ids.ad_id,
    current_step: null,
    finished_at: new Date().toISOString(),
  });

  return new Response(JSON.stringify({
    status: 'live',
    publication_id: publicationId,
    meta_ids: ids,
    manager_url: `https://business.facebook.com/adsmanager/manage/campaigns?selected_campaign_ids=${ids.campaign_id}`,
  }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
});
