/**
 * Constantes para anexos no chat (multimodal).
 * Spec: .kiro/specs/chat-multimodal/
 */

export const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

export const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/json',
] as const;

export const ALLOWED_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  ...ALLOWED_DOCUMENT_TYPES,
] as const;

export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
export const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50 MB
export const MAX_FILES = 5;
export const MAX_IMAGE_DIMENSION = 2048;

export const EXTRACTION_TIMEOUT_MS = 15_000;

export type AttachmentKind = 'image' | 'document';

export type ExtractionStatus = 'pending' | 'done' | 'failed' | 'skipped';

export function classifyMimeType(mime: string): AttachmentKind | null {
  if ((ALLOWED_IMAGE_TYPES as readonly string[]).includes(mime)) return 'image';
  if ((ALLOWED_DOCUMENT_TYPES as readonly string[]).includes(mime)) return 'document';
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function sanitizeFilename(name: string): string {
  // Remove path components e caracteres perigosos
  return name
    .replace(/[/\\]/g, '_')
    .replace(/[\x00-\x1f<>:"|?*]/g, '_')
    .slice(0, 200);
}
