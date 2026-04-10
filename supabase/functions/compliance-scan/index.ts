import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';

/**
 * Compliance Scan — analisa anuncios via Claude API para detectar violacoes
 * e opcionalmente pausa anuncios criticos na Meta (Smart Takedown).
 *
 * Features:
 * - Analise de copy (headline + body + CTA) via Claude Sonnet
 * - OCR + analise visual via Claude Vision (imagens)
 * - Blacklist de termos por tenant
 * - Score ponderado (60% copy + 40% visual)
 * - Auto-takedown com rate limit (max 10/hora)
 * - Dual auth: JWT | x-cron-secret
 */

const GRAPH_VERSION = Deno.env.get('META_GRAPH_API_VERSION') ?? 'v22.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-sonnet-4-5-20241022';
const BATCH_SIZE = 5;
const MAX_ADS_PER_RUN = 50;
const TAKEDOWN_RATE_LIMIT = 10; // max takedowns per company per hour

// ============================================================
// Types
// ============================================================

interface CopyAnalysis {
  score: number;
  violations: ViolationRaw[];
}

interface ImageAnalysis {
  ocr_text: string;
  score: number;
  violations: ViolationRaw[];
}

interface ViolationRaw {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  description: string;
  evidence: string;
}

interface ScanStats {
  ads_analyzed: number;
  ads_critical: number;
  ads_warning: number;
  ads_healthy: number;
  ads_paused: number;
  errors: string[];
}

interface Creative {
  id: string;
  external_id: string | null;
  name: string | null;
  headline: string | null;
  text: string | null;
  call_to_action: string | null;
  image_url: string | null;
  type: string | null;
}

// ============================================================
// Claude API helper
// ============================================================

async function callClaude(
  apiKey: string,
  systemPrompt: string,
  userContent: Array<{ type: string; [key: string]: unknown }>,
): Promise<string> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const textBlock = data.content?.find((b: { type: string }) => b.type === 'text');
  return textBlock?.text ?? '';
}

function parseJsonResponse<T>(raw: string): T | null {
  // Extrai JSON de markdown code blocks se necessario
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = match ? match[1].trim() : raw.trim();
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    return null;
  }
}

// ============================================================
// Copy Analysis
// ============================================================

async function analyzeCopy(
  apiKey: string,
  creative: Creative,
  blacklistTerms: string[],
): Promise<CopyAnalysis> {
  const copy = [
    creative.headline ? `Headline: ${creative.headline}` : '',
    creative.text ? `Body: ${creative.text}` : '',
    creative.call_to_action ? `CTA: ${creative.call_to_action}` : '',
  ].filter(Boolean).join('\n');

  if (!copy.trim()) {
    return { score: 100, violations: [] };
  }

  const systemPrompt = `Voce e um especialista em compliance de anuncios Meta Ads.
Analise o copy do anuncio e retorne APENAS um JSON valido (sem markdown, sem explicacao).

Regras de pontuacao:
- Cada violacao critical deduz 40 pontos do score
- Cada warning deduz 20 pontos
- Cada info deduz 5 pontos
- Score comeca em 100, minimo 0
- Sem violacoes = score 100
- Considere: linguagem enganosa, promessas impossiveis, termos proibidos Meta, urgencia falsa, claims sem evidencia`;

  const userText = `COPY DO ANUNCIO:
${copy}

TERMOS PROIBIDOS DO TENANT:
${blacklistTerms.length > 0 ? blacklistTerms.join(', ') : '(nenhum configurado)'}

Retorne este JSON exato:
{"score": <0-100>, "violations": [{"type": "blacklist_term|misleading_language|unfulfillable_promise|meta_policy_violation", "severity": "info|warning|critical", "description": "<descricao>", "evidence": "<trecho>"}]}`;

  const raw = await callClaude(apiKey, systemPrompt, [{ type: 'text', text: userText }]);
  const parsed = parseJsonResponse<CopyAnalysis>(raw);

  if (!parsed || typeof parsed.score !== 'number') {
    return { score: 70, violations: [{ type: 'meta_policy_violation', severity: 'info', description: 'Analise inconclusiva — resposta da IA nao parseavel', evidence: '' }] };
  }

  return {
    score: Math.max(0, Math.min(100, parsed.score)),
    violations: Array.isArray(parsed.violations) ? parsed.violations : [],
  };
}

// ============================================================
// Image Analysis (Vision + OCR)
// ============================================================

async function fetchImageAsBase64(url: string): Promise<{ base64: string; mediaType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    const buf = await res.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));

    const mediaType = contentType.includes('png') ? 'image/png'
      : contentType.includes('webp') ? 'image/webp'
      : contentType.includes('gif') ? 'image/gif'
      : 'image/jpeg';

    return { base64, mediaType };
  } catch {
    return null;
  }
}

async function analyzeImage(
  apiKey: string,
  imageUrl: string,
  blacklistTerms: string[],
): Promise<ImageAnalysis | null> {
  const img = await fetchImageAsBase64(imageUrl);
  if (!img) return null;

  const systemPrompt = `Voce e um especialista em compliance visual de anuncios Meta Ads.
Analise a imagem e retorne APENAS um JSON valido (sem markdown, sem explicacao).

Regras de pontuacao:
- Cada violacao critical deduz 40 pontos
- Cada warning deduz 20 pontos
- Cada info deduz 5 pontos
- Score comeca em 100, minimo 0`;

  const userText = `TERMOS PROIBIDOS:
${blacklistTerms.length > 0 ? blacklistTerms.join(', ') : '(nenhum)'}

Tarefas:
1. Extraia TODO texto visivel na imagem (OCR)
2. Verifique se algum termo proibido aparece
3. Detecte claims visuais problematicos (antes/depois, numeros sem fonte)
4. Avalie elementos enganosos

Retorne este JSON exato:
{"ocr_text": "<texto extraido>", "score": <0-100>, "violations": [{"type": "ocr_text_violation|visual_claim|brand_mismatch", "severity": "info|warning|critical", "description": "<descricao>", "evidence": "<texto ou elemento>"}]}`;

  const raw = await callClaude(apiKey, systemPrompt, [
    {
      type: 'image',
      source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
    },
    { type: 'text', text: userText },
  ]);

  const parsed = parseJsonResponse<ImageAnalysis>(raw);
  if (!parsed || typeof parsed.score !== 'number') return null;

  return {
    ocr_text: parsed.ocr_text ?? '',
    score: Math.max(0, Math.min(100, parsed.score)),
    violations: Array.isArray(parsed.violations) ? parsed.violations : [],
  };
}

// ============================================================
// Score calculation
// ============================================================

function calculateFinalScore(copyScore: number, imageScore: number | null): {
  finalScore: number;
  healthStatus: 'healthy' | 'warning' | 'critical';
} {
  const finalScore = imageScore !== null
    ? Math.round(copyScore * 0.6 + imageScore * 0.4)
    : copyScore;

  const healthStatus = finalScore >= 80 ? 'healthy'
    : finalScore >= 50 ? 'warning'
    : 'critical';

  return { finalScore, healthStatus };
}

// ============================================================
// Takedown
// ============================================================

async function executeTakedown(
  supabase: SupabaseClient,
  metaToken: string,
  companyId: string,
  creative: Creative,
  scoreId: string,
  reason: string,
): Promise<boolean> {
  if (!creative.external_id) return false;

  // Rate limit: max 10 takedowns per company per hour
  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await supabase
    .from('compliance_actions')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('action_type', 'auto_paused')
    .gte('created_at', oneHourAgo);

  if ((count ?? 0) >= TAKEDOWN_RATE_LIMIT) {
    console.warn(`[compliance] Takedown rate limit hit for company ${companyId}`);
    return false;
  }

  // Pause ad via Meta Graph API
  try {
    const res = await fetch(`${GRAPH_BASE}/${creative.external_id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${metaToken}`,
      },
      body: `status=PAUSED`,
    });

    const body = await res.json();

    await supabase.from('compliance_actions').insert({
      company_id: companyId,
      creative_id: creative.id,
      score_id: scoreId,
      action_type: 'auto_paused',
      external_ad_id: creative.external_id,
      reason,
      meta_api_response: body,
      performed_by: 'system',
    });

    return res.ok;
  } catch (err) {
    console.error(`[compliance] Takedown failed for ${creative.external_id}:`, err);
    return false;
  }
}

// ============================================================
// Main scan orchestrator
// ============================================================

async function scanCreative(
  supabase: SupabaseClient,
  apiKey: string,
  metaToken: string | null,
  companyId: string,
  creative: Creative,
  blacklistTerms: string[],
  autoTakedown: boolean,
  takedownThreshold: number,
  stats: ScanStats,
): Promise<void> {
  try {
    // 1. Analyze copy
    const copyResult = await analyzeCopy(apiKey, creative, blacklistTerms);

    // 2. Analyze image (if available and is image type)
    let imageResult: ImageAnalysis | null = null;
    if (creative.image_url && creative.type !== 'VIDEO') {
      imageResult = await analyzeImage(apiKey, creative.image_url, blacklistTerms);
    }

    // 3. Calculate final score
    const { finalScore, healthStatus } = calculateFinalScore(
      copyResult.score,
      imageResult?.score ?? null,
    );

    // 4. Upsert score
    const { data: scoreRow, error: scoreErr } = await supabase
      .from('compliance_scores')
      .upsert({
        company_id: companyId,
        creative_id: creative.id,
        external_ad_id: creative.external_id,
        copy_score: copyResult.score,
        image_score: imageResult?.score ?? null,
        final_score: finalScore,
        health_status: healthStatus,
        scan_model: ANTHROPIC_MODEL,
        scanned_at: new Date().toISOString(),
      }, { onConflict: 'company_id,creative_id' })
      .select('id')
      .single();

    if (scoreErr || !scoreRow) {
      stats.errors.push(`score upsert ${creative.id}: ${scoreErr?.message ?? 'no id'}`);
      return;
    }

    // 5. Delete old violations for this score, insert new
    await supabase.from('compliance_violations').delete().eq('score_id', scoreRow.id);

    const allViolations = [
      ...copyResult.violations.map((v) => ({ ...v, source: 'copy' })),
      ...(imageResult?.violations ?? []).map((v) => ({ ...v, source: 'image' })),
    ];

    if (allViolations.length > 0) {
      const POINTS: Record<string, number> = { critical: 40, warning: 20, info: 5 };
      const violationRows = allViolations.map((v) => ({
        company_id: companyId,
        score_id: scoreRow.id,
        creative_id: creative.id,
        violation_type: v.type || 'meta_policy_violation',
        severity: v.severity || 'info',
        description: (v.description || '').slice(0, 500),
        evidence: (v.evidence || '').slice(0, 300),
        points_deducted: POINTS[v.severity] ?? 5,
      }));

      await supabase.from('compliance_violations').insert(violationRows);
    }

    // 6. Stats
    stats.ads_analyzed++;
    if (healthStatus === 'critical') stats.ads_critical++;
    else if (healthStatus === 'warning') stats.ads_warning++;
    else stats.ads_healthy++;

    // 7. Auto-takedown if enabled and critical
    if (autoTakedown && metaToken && finalScore < takedownThreshold) {
      const reason = `Score ${finalScore}/100 (threshold ${takedownThreshold}). ${allViolations.filter((v) => v.severity === 'critical').length} violacao(oes) critica(s).`;
      const paused = await executeTakedown(supabase, metaToken, companyId, creative, scoreRow.id, reason);
      if (paused) stats.ads_paused++;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    stats.errors.push(`scan ${creative.id}: ${msg.slice(0, 200)}`);
  }
}

// ============================================================
// HTTP handler
// ============================================================

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // ---- Auth: dual JWT | x-cron-secret ----
  let companyId: string;
  let body: { company_id?: string } = {};
  try { body = await req.json(); } catch { body = {}; }

  const cronSecret = req.headers.get('x-cron-secret');
  const expectedCronSecret = Deno.env.get('CRON_SECRET');

  if (cronSecret && expectedCronSecret && cronSecret === expectedCronSecret) {
    if (!body.company_id) {
      return new Response(JSON.stringify({ error: 'company_id required' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    companyId = body.company_id;
  } else {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false },
      },
    );
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
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
    companyId = company.id;
  }

  // ---- Get ANTHROPIC_API_KEY from Vault ----
  let apiKey: string;
  const { data: anthropicKey, error: keyErr } = await supabaseAdmin.rpc('get_vault_secret', { secret_name: 'ANTHROPIC_API_KEY' });
  if (keyErr || !anthropicKey) {
    const envKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!envKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    apiKey = envKey;
  } else {
    apiKey = anthropicKey as string;
  }

  // ---- Get Meta token (for takedowns) ----
  let metaToken: string | null = null;
  const { data: integration } = await supabaseAdmin
    .from('integrations')
    .select('id, access_token, status')
    .eq('company_id', companyId)
    .eq('platform', 'meta')
    .single();

  if (integration?.access_token) {
    const { data: decrypted } = await supabaseAdmin.rpc('decrypt_meta_token', {
      encrypted_token: integration.access_token,
    });
    if (decrypted) metaToken = decrypted as string;
  }

  // ---- Get company settings ----
  const { data: companySettings } = await supabaseAdmin
    .from('companies')
    .select('auto_takedown_enabled, takedown_threshold')
    .eq('id', companyId)
    .single();

  const autoTakedown = companySettings?.auto_takedown_enabled ?? false;
  const takedownThreshold = companySettings?.takedown_threshold ?? 50;

  // ---- Get blacklist terms ----
  const { data: rules } = await supabaseAdmin
    .from('compliance_rules')
    .select('value')
    .eq('company_id', companyId)
    .eq('rule_type', 'blacklist_term')
    .eq('is_active', true);

  const blacklistTerms = (rules ?? []).map((r) => r.value);

  // ---- Fetch creatives not scanned in 24h ----
  const oneDayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();

  const { data: creatives } = await supabaseAdmin
    .from('creatives')
    .select('id, external_id, name, headline, text, call_to_action, image_url, type')
    .eq('company_id', companyId)
    .eq('platform', 'meta')
    .order('created_at', { ascending: true })
    .limit(MAX_ADS_PER_RUN);

  if (!creatives || creatives.length === 0) {
    return new Response(JSON.stringify({ status: 'success', message: 'Nenhum criativo para analisar', stats: { ads_analyzed: 0 } }), {
      status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // Filter out recently scanned
  const { data: recentScores } = await supabaseAdmin
    .from('compliance_scores')
    .select('creative_id')
    .eq('company_id', companyId)
    .gte('scanned_at', oneDayAgo);

  const recentIds = new Set((recentScores ?? []).map((s) => s.creative_id));
  const toScan = creatives.filter((c) => !recentIds.has(c.id));

  if (toScan.length === 0) {
    return new Response(JSON.stringify({ status: 'success', message: 'Todos criativos ja analisados nas ultimas 24h', stats: { ads_analyzed: 0 } }), {
      status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // ---- Create scan log ----
  const triggeredBy = cronSecret ? 'cron' : 'manual';
  const { data: scanLog } = await supabaseAdmin
    .from('compliance_scan_logs')
    .insert({ company_id: companyId, status: 'running', triggered_by: triggeredBy })
    .select('id')
    .single();

  const stats: ScanStats = {
    ads_analyzed: 0, ads_critical: 0, ads_warning: 0,
    ads_healthy: 0, ads_paused: 0, errors: [],
  };

  // ---- Process in batches ----
  const chunks = <T>(arr: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  for (const batch of chunks(toScan.slice(0, MAX_ADS_PER_RUN), BATCH_SIZE)) {
    // Sequential within batch to respect Anthropic rate limit
    for (const creative of batch) {
      await scanCreative(
        supabaseAdmin, apiKey, metaToken, companyId,
        creative as Creative, blacklistTerms,
        autoTakedown, takedownThreshold, stats,
      );
    }
  }

  // ---- Update scan log ----
  const finalStatus = stats.errors.length === 0
    ? 'success'
    : stats.errors.length < 3
      ? 'partial'
      : 'failed';

  if (scanLog?.id) {
    await supabaseAdmin
      .from('compliance_scan_logs')
      .update({
        status: finalStatus,
        finished_at: new Date().toISOString(),
        ads_analyzed: stats.ads_analyzed,
        ads_critical: stats.ads_critical,
        ads_warning: stats.ads_warning,
        ads_healthy: stats.ads_healthy,
        ads_paused: stats.ads_paused,
        error: stats.errors.length > 0 ? stats.errors.join('; ').slice(0, 1000) : null,
      })
      .eq('id', scanLog.id);
  }

  return new Response(
    JSON.stringify({ status: finalStatus, stats }),
    { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } },
  );
});
