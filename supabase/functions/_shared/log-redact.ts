// Utility para ofuscar campos sensiveis do briefing antes de logar.
// Spec: briefing-onboarding (task 9.3 — R9.5)
//
// Regra: precos, depoimentos completos, descricoes de oferta, listas de
// proibicoes e CTAs preferidos sao dados estrategicos do cliente — nao
// devem aparecer em logs estruturados (Supabase logs sao acessados por
// quem tem service_role, mas e boa pratica minimizar superficie).

const REDACTED = '[REDACTED]';

const SENSITIVE_PATHS: Array<RegExp> = [
  /^primaryOffer\.price$/,
  /^primaryOffer\.short_description$/,
  /^primaryOffer\.social_proof/,
  /^secondaryOffers\.\d+\.price$/,
  /^secondaryOffers\.\d+\.short_description$/,
  /^secondaryOffers\.\d+\.social_proof/,
  /^prohibitions\./,
  /^tone\.preferredCtas$/,
  /^tone\.forbiddenPhrases$/,
  /^audience\.languageSamples$/,
];

function redactInternal(value: unknown, path: string): unknown {
  if (value === null || value === undefined) return value;
  if (SENSITIVE_PATHS.some((re) => re.test(path))) return REDACTED;

  if (Array.isArray(value)) {
    return value.map((item, i) => redactInternal(item, `${path}.${i}`));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const nextPath = path ? `${path}.${k}` : k;
      out[k] = redactInternal(v, nextPath);
    }
    return out;
  }
  return value;
}

/**
 * Recebe o BriefingPayload (ou subset) e retorna copia com campos
 * sensiveis substituidos por [REDACTED]. Use sempre que precisar logar
 * o briefing em console.log/console.error/structured logs.
 */
export function redactBriefingForLog<T>(payload: T): T {
  return redactInternal(payload, '') as T;
}

/**
 * Helper para logar acesso ao briefing apenas com IDs e timestamps —
 * nunca com payload (R9.5). Use no lugar de console.log({ briefing }).
 */
export function logBriefingAccess(meta: {
  companyId: string;
  userId?: string | null;
  purpose: string;
  durationMs?: number;
  isComplete?: boolean;
}): void {
  console.log(JSON.stringify({
    event: 'briefing.access',
    company_id: meta.companyId,
    user_id: meta.userId ?? null,
    purpose: meta.purpose,
    duration_ms: meta.durationMs ?? null,
    is_complete: meta.isComplete ?? null,
    ts: new Date().toISOString(),
  }));
}

/**
 * Helper para logar geracao/iteracao/export de criativos por IA.
 * Spec: ai-creative-generation (task 3.5 — R9.5)
 *
 * NUNCA loga prompt cru, instruction crua, briefing snapshot ou bytes.
 */
export function logCreativeAccess(meta: {
  companyId: string;
  userId?: string | null;
  event: 'generate' | 'iterate' | 'vary' | 'adapt' | 'export' | 'approve' | 'discard';
  modelUsed?: string | null;
  format?: string | null;
  count?: number;
  costUsd?: number;
  durationMs?: number;
  fallbackTriggered?: boolean;
  status?: 'success' | 'failed' | 'partial';
  errorKind?: string;
}): void {
  console.log(JSON.stringify({
    event: `creative.${meta.event}`,
    company_id: meta.companyId,
    user_id: meta.userId ?? null,
    model_used: meta.modelUsed ?? null,
    format: meta.format ?? null,
    count: meta.count ?? null,
    cost_usd: meta.costUsd ?? null,
    duration_ms: meta.durationMs ?? null,
    fallback_triggered: meta.fallbackTriggered ?? null,
    status: meta.status ?? null,
    error_kind: meta.errorKind ?? null,
    ts: new Date().toISOString(),
  }));
}

/**
 * Helper para logar acesso a knowledge base apenas com IDs e contagens.
 * Spec: knowledge-base-rag (task 9.3 — R9.5)
 *
 * NUNCA loga chunk_text bruto, query crua, embedding ou metadata sensivel.
 */
export function logKbAccess(meta: {
  companyId: string;
  userId?: string | null;
  event: 'ingest' | 'reindex' | 'search' | 'embed';
  documentId?: string | null;
  chunkCount?: number;
  durationMs?: number;
  status?: 'success' | 'failed' | 'partial';
  errorKind?: string;
}): void {
  console.log(JSON.stringify({
    event: `kb.${meta.event}`,
    company_id: meta.companyId,
    user_id: meta.userId ?? null,
    document_id: meta.documentId ?? null,
    chunk_count: meta.chunkCount ?? null,
    duration_ms: meta.durationMs ?? null,
    status: meta.status ?? null,
    error_kind: meta.errorKind ?? null,
    ts: new Date().toISOString(),
  }));
}
