// Schemas Zod do dominio knowledge-base-rag (task 4.2).
// Spec: .kiro/specs/knowledge-base-rag/

import { z } from 'zod';
import { KB_ALL_ALLOWED_MIMES, KB_MAX_FILE_BYTES } from '@/types/knowledge';

const kbDocType = z.enum(['pdf', 'docx', 'xlsx', 'csv', 'json', 'txt', 'md', 'image']);
const kbDocStatus = z.enum(['pending', 'extracting', 'embedding', 'indexed', 'failed']);

// ====== Upload (file + meta) ======
export const uploadMetadataSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(500).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});

export type UploadMetadataInput = z.infer<typeof uploadMetadataSchema>;

export function validateFileForUpload(file: File): { ok: true } | { ok: false; reason: 'too_large' | 'unsupported_mime' } {
  if (file.size > KB_MAX_FILE_BYTES) return { ok: false, reason: 'too_large' };
  if (!KB_ALL_ALLOWED_MIMES.includes(file.type)) return { ok: false, reason: 'unsupported_mime' };
  return { ok: true };
}

// ====== Update metadata ======
export const updateMetadataSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  is_source_of_truth: z.boolean().optional(),
});

export type UpdateMetadataInput = z.infer<typeof updateMetadataSchema>;

// ====== Filtros da listagem ======
export const filtersSchema = z.object({
  type: z.array(kbDocType).optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  status: z.array(kbDocStatus).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  is_source_of_truth: z.boolean().optional(),
});

export type FiltersInput = z.infer<typeof filtersSchema>;

// ====== Search params (consumido pela tool no chat) ======
export const searchParamsSchema = z.object({
  query: z.string().trim().min(1).max(2000),
  top_k: z.number().int().min(1).max(20).default(8),
  filters: filtersSchema.optional(),
});

export type SearchParamsInput = z.infer<typeof searchParamsSchema>;
