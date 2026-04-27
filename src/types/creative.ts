// Tipos do dominio ai-creative-generation.
// Spec: .kiro/specs/ai-creative-generation/

export type AspectFormat = 'feed_1x1' | 'story_9x16' | 'reels_4x5';

export type ModelChoice = 'auto' | 'nano_banana' | 'gpt_image';

export type StyleHint =
  | 'minimalista'
  | 'cinematografico'
  | 'clean'
  | 'lifestyle'
  | 'produto_em_uso';

export type CreativeStatus = 'generated' | 'approved' | 'discarded' | 'published';

export type CreativeProviderModel = 'gemini-2.5-flash-image' | 'gpt-image-1';

export type GenerateMode = 'create' | 'adapt';

export type IterateMode = 'iterate' | 'regenerate' | 'vary';

// ============================================================
// Aggregate root
// ============================================================
export interface Creative {
  id: string;
  company_id: string;
  conversation_id: string | null;
  parent_creative_id: string | null;
  near_duplicate_of_id: string | null;
  adaptation_set_id: string | null;
  prompt: string;
  concept: string;
  format: AspectFormat;
  model_used: CreativeProviderModel;
  status: CreativeStatus;
  storage_path: string;
  mime_type: string;
  width: number;
  height: number;
  cost_usd: number;
  latency_ms: number | null;
  phash: string;
  is_near_duplicate: boolean;
  compliance_warning: boolean;
  ready_for_publish: boolean;
  title: string | null;
  tags: string[];
  description: string | null;
  briefing_snapshot: Record<string, unknown>;
  kb_chunk_ids: string[];
  created_at: string;
  updated_at: string;
  /** Apenas presente em respostas com signed URL — nao persistido. */
  signed_url?: string;
  signed_url_expires_at?: string;
}

// ============================================================
// Quotas + health
// ============================================================
export type UsageStatus = 'ok' | 'warning' | 'blocked';
export type UsageDimension = 'daily' | 'monthly' | 'cost';

export interface CreativeUsage {
  daily: { count: number; max: number };
  monthly: { count: number; max: number };
  cost_usd_month: { value: number; max: number };
  status: UsageStatus;
  warning_dimensions: UsageDimension[];
  blocked_dimensions: UsageDimension[];
}

export interface CreativeHealth {
  nano_banana_24h: { success: number; failed: number };
  gpt_image_24h: { success: number; failed: number };
  p95_latency_ms: number;
  window_start: string;
}

export interface CreativeProvenance {
  chain: Array<{
    id: string;
    parent_creative_id: string | null;
    concept: string;
    format: AspectFormat;
    model_used: CreativeProviderModel;
    status: CreativeStatus;
    created_at: string;
    depth: number;
  }>;
  root: {
    briefing_snapshot: Record<string, unknown>;
    kb_chunk_ids: string[];
    concept: string;
    prompt: string;
  } | null;
  depth: number;
}

// ============================================================
// Edge Function contracts
// ============================================================
export interface GenerateRequest {
  concept: string;
  format: AspectFormat;
  count: 1 | 2 | 3 | 4;
  style_hint?: StyleHint;
  use_logo?: boolean;
  model?: ModelChoice;
  mode?: GenerateMode;
  source_creative_id?: string;
  conversation_id?: string;
  idempotency_key?: string;
  override_briefing_warning?: boolean;
  override_blocklist_warning?: boolean;
}

export interface IterateRequest {
  parent_creative_id: string;
  instruction?: string;
  mode?: IterateMode;
  count?: 1 | 2 | 3;
  model?: ModelChoice;
  override_blocklist_warning?: boolean;
}

export interface CreativeMetadata {
  id: string;
  signed_url: string;
  signed_url_expires_at: string;
  format: AspectFormat;
  model_used: CreativeProviderModel;
  cost_usd: number;
  width: number;
  height: number;
  is_near_duplicate: boolean;
  near_duplicate_of_id: string | null;
  compliance_warning: boolean;
}

export interface GenerateResponse {
  creatives: CreativeMetadata[];
  failed_count: number;
  blocked_by_dedupe: number;
  warnings: string[];
}

export interface IterateResponse extends GenerateResponse {
  iteration_warning?: string;
}

export interface ExportRequest {
  creative_ids: string[];
}

export interface ExportResponse {
  download_url: string;
  expires_at: string;
  file_count: number;
  skipped: number;
}

// ============================================================
// Filtros + metadata patch
// ============================================================
export interface CreativeFilters {
  status?: CreativeStatus[];
  format?: AspectFormat[];
  offer?: string;
  from?: string;
  to?: string;
  tags?: string[];
  search?: string;
}

export type CreativeMetadataPatch = Partial<
  Pick<Creative, 'title' | 'tags' | 'description' | 'ready_for_publish'>
>;

// ============================================================
// Erros tipados (discriminated union)
// ============================================================
export type CreativeError =
  | { kind: 'unauthorized' }
  | { kind: 'quota_exceeded'; dimensions: UsageDimension[] }
  | { kind: 'briefing_incomplete'; missingFields: string[]; score: number }
  | { kind: 'plan_upgrade_required'; message: string }
  | { kind: 'forbidden_by_briefing'; hits: string[] }
  | { kind: 'forbidden_by_blocklist'; hits: Array<{ term: string; severity: string }> }
  | { kind: 'provider_unavailable'; failed_count: number }
  | { kind: 'duplicate_blocked'; existing_id: string }
  | { kind: 'timeout' }
  | { kind: 'validation'; issues: unknown }
  | { kind: 'network'; message: string };

export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// ============================================================
// Constantes
// ============================================================
export const MAX_GENERATE_COUNT = 4;
export const MAX_ITERATE_COUNT = 3;
export const MAX_EXPORT_IDS = 50;
export const SIGNED_URL_TTL_SEC = 3600;
export const ITERATION_WARNING_THRESHOLD = 5;

export const ASPECT_LABELS: Record<AspectFormat, { label: string; ratio: string; meta: string }> = {
  feed_1x1:   { label: 'Feed',   ratio: '1:1',  meta: 'Quadrado — feed/explore' },
  story_9x16: { label: 'Story',  ratio: '9:16', meta: 'Vertical — stories/reels full' },
  reels_4x5:  { label: 'Reels',  ratio: '4:5',  meta: 'Vertical curto — reels/feed mobile' },
};

export const MODEL_LABELS: Record<ModelChoice, { label: string; description: string }> = {
  auto:        { label: 'Automatico', description: 'Escolha inteligente conforme count + paleta' },
  nano_banana: { label: 'Rapido (Nano Banana)', description: 'Gemini 2.5 Flash Image — rapido e barato' },
  gpt_image:   { label: 'Qualidade (GPT-image)', description: 'GPT-image-1 high — premium, plano Pro+' },
};

export const STYLE_LABELS: Record<StyleHint, string> = {
  minimalista:      'Minimalista',
  cinematografico:  'Cinematografico',
  clean:            'Clean',
  lifestyle:        'Lifestyle',
  produto_em_uso:   'Produto em uso',
};

export const STATUS_LABELS: Record<CreativeStatus, string> = {
  generated: 'Gerado',
  approved:  'Aprovado',
  discarded: 'Descartado',
  published: 'Publicado',
};

export const PROVIDER_LABELS: Record<CreativeProviderModel, string> = {
  'gemini-2.5-flash-image': 'Nano Banana 2',
  'gpt-image-1':            'GPT-image-1',
};
