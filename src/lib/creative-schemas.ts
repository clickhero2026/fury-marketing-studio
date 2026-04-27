// Schemas Zod para o dominio ai-creative-generation.
// Usado em forms (StudioView, CreativeDetailDialog) e antes de mutations
// pra falhar cedo no client.

import { z } from 'zod';
import {
  MAX_GENERATE_COUNT,
  MAX_ITERATE_COUNT,
  MAX_EXPORT_IDS,
} from '@/types/creative';

// ============================================================
// Enums espelhando os tipos
// ============================================================
export const aspectFormatSchema = z.enum(['feed_1x1', 'story_9x16', 'reels_4x5']);
export const modelChoiceSchema = z.enum(['auto', 'nano_banana', 'gpt_image']);
export const styleHintSchema = z.enum([
  'minimalista', 'cinematografico', 'clean', 'lifestyle', 'produto_em_uso',
]);
export const creativeStatusSchema = z.enum(['generated', 'approved', 'discarded', 'published']);
export const generateModeSchema = z.enum(['create', 'adapt']);
export const iterateModeSchema = z.enum(['iterate', 'regenerate', 'vary']);

// ============================================================
// Generate
// ============================================================
const countGenerateSchema = z.union([
  z.literal(1), z.literal(2), z.literal(3), z.literal(4),
]) as z.ZodType<1 | 2 | 3 | 4>;

export const generateRequestSchema = z.object({
  concept: z.string()
    .min(3, 'Conceito muito curto (min 3 caracteres)')
    .max(2000, 'Conceito muito longo (max 2000 caracteres)'),
  format: aspectFormatSchema,
  count: countGenerateSchema,
  style_hint: styleHintSchema.optional(),
  use_logo: z.boolean().optional(),
  model: modelChoiceSchema.optional(),
  mode: generateModeSchema.optional(),
  source_creative_id: z.string().uuid().optional(),
  conversation_id: z.string().uuid().optional(),
  idempotency_key: z.string().min(8).max(128).optional(),
  override_briefing_warning: z.boolean().optional(),
  override_blocklist_warning: z.boolean().optional(),
}).refine(
  (v) => v.mode !== 'adapt' || !!v.source_creative_id,
  { message: 'source_creative_id obrigatorio quando mode=adapt', path: ['source_creative_id'] },
).refine(
  (v) => v.count <= MAX_GENERATE_COUNT,
  { message: `count nao pode exceder ${MAX_GENERATE_COUNT}`, path: ['count'] },
);

// ============================================================
// Iterate
// ============================================================
const countIterateSchema = z.union([
  z.literal(1), z.literal(2), z.literal(3),
]) as z.ZodType<1 | 2 | 3>;

export const iterateRequestSchema = z.object({
  parent_creative_id: z.string().uuid(),
  instruction: z.string().max(2000).optional(),
  mode: iterateModeSchema.optional(),
  count: countIterateSchema.optional(),
  model: modelChoiceSchema.optional(),
  override_blocklist_warning: z.boolean().optional(),
}).refine(
  (v) => !v.count || v.count <= MAX_ITERATE_COUNT,
  { message: `count nao pode exceder ${MAX_ITERATE_COUNT}`, path: ['count'] },
);

// ============================================================
// Update metadata (UPDATE direto na tabela via PostgREST)
// ============================================================
export const updateMetadataSchema = z.object({
  title: z.string().min(1).max(120).nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  description: z.string().max(1000).nullable().optional(),
  ready_for_publish: z.boolean().optional(),
});

// ============================================================
// Filters (query state em StudioView)
// ============================================================
export const filtersSchema = z.object({
  status: z.array(creativeStatusSchema).optional(),
  format: z.array(aspectFormatSchema).optional(),
  offer: z.string().max(120).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  search: z.string().max(200).optional(),
});

// ============================================================
// Export
// ============================================================
export const exportRequestSchema = z.object({
  creative_ids: z.array(z.string().uuid())
    .min(1, 'Selecione ao menos 1 criativo')
    .max(MAX_EXPORT_IDS, `Maximo ${MAX_EXPORT_IDS} criativos por export`),
});

// ============================================================
// Tipos derivados
// ============================================================
export type GenerateRequestInput = z.infer<typeof generateRequestSchema>;
export type IterateRequestInput = z.infer<typeof iterateRequestSchema>;
export type UpdateMetadataInput = z.infer<typeof updateMetadataSchema>;
export type FiltersInput = z.infer<typeof filtersSchema>;
export type ExportRequestInput = z.infer<typeof exportRequestSchema>;
