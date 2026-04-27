// Tipos do dominio knowledge-base-rag.
// Spec: .kiro/specs/knowledge-base-rag/

export type KbDocStatus = 'pending' | 'extracting' | 'embedding' | 'indexed' | 'failed';

export type KbDocType =
  | 'pdf'
  | 'docx'
  | 'xlsx'
  | 'csv'
  | 'json'
  | 'txt'
  | 'md'
  | 'image';

export type KbDocSource = 'upload' | 'chat_attachment';
export type KbStorageBucket = 'knowledge-base' | 'chat-attachments';

export interface KnowledgeDocument {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  type: KbDocType;
  source: KbDocSource;
  source_attachment_id: string | null;
  storage_bucket: KbStorageBucket;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  page_count: number | null;
  tags: string[];
  is_source_of_truth: boolean;
  status: KbDocStatus;
  status_error: string | null;
  embedding_model_version: string | null;
  extracted_text: string | null;
  created_at: string;
  updated_at: string;
  indexed_at: string | null;
  signed_url?: string;
}

export interface KnowledgeFilters {
  type?: KbDocType[];
  tags?: string[];
  status?: KbDocStatus[];
  search?: string;
  is_source_of_truth?: boolean;
}

export type UsageDimension = 'storage' | 'documents' | 'embeddings';
export type UsageStatus = 'ok' | 'warning' | 'blocked';

export interface KnowledgeUsage {
  storage: { bytes: number; max: number };
  documents: { count: number; max: number };
  embeddingsThisMonth: { tokens: number; max: number };
  status: UsageStatus;
  warningDimensions: UsageDimension[];
  blockedDimensions: UsageDimension[];
}

export interface KnowledgeSearchResult {
  chunk_id: string;
  document_id: string;
  document_title: string;
  document_type: KbDocType;
  chunk_text: string;
  chunk_index: number;
  page_number: number | null;
  score: number;
  is_source_of_truth: boolean;
}

// Erros estruturados (Result-style)
export type KbError =
  | { kind: 'unauthorized' }
  | { kind: 'quota_exceeded'; dimension: UsageDimension }
  | { kind: 'too_large'; maxBytes: number }
  | { kind: 'unsupported_mime' }
  | { kind: 'duplicate'; reason: 'already_promoted_from_chat' }
  | { kind: 'not_found' }
  | { kind: 'network'; message: string };

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

// ============================================================
// Constantes (alinhadas ao backend)
// ============================================================

export const KB_MAX_FILE_BYTES = 25 * 1024 * 1024; // R1.2
export const KB_SIGNED_URL_TTL_SECONDS = 3600; // R9.3
export const KB_BUCKET = 'knowledge-base' as const;

export const KB_ALLOWED_MIMES: Record<KbDocType, string[]> = {
  pdf: ['application/pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  csv: ['text/csv'],
  json: ['application/json'],
  txt: ['text/plain'],
  md: ['text/markdown'],
  image: ['image/png', 'image/jpeg', 'image/webp'],
};

export const KB_ALL_ALLOWED_MIMES = Object.values(KB_ALLOWED_MIMES).flat();

export function mimeToKbType(mime: string): KbDocType | null {
  for (const [type, mimes] of Object.entries(KB_ALLOWED_MIMES) as [KbDocType, string[]][]) {
    if (mimes.includes(mime)) return type;
  }
  return null;
}

// Map para parsing de citacoes inline `[doc:<uuid>#chunk:<index>]` (R6.1)
export const CITATION_REGEX = /\[doc:([0-9a-f-]{36})#chunk:(\d+)\]/g;
