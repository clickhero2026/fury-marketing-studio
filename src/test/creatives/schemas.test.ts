// Unit tests dos schemas Zod do dominio creatives (task 11.4 — R1.1, R4.1).
// Spec: ai-creative-generation

import { describe, expect, it } from 'vitest';
import {
  generateRequestSchema,
  iterateRequestSchema,
  updateMetadataSchema,
  filtersSchema,
  exportRequestSchema,
} from '@/lib/creative-schemas';

const VALID_UUID = '00000000-0000-4000-8000-000000000001';
const VALID_UUID_2 = '00000000-0000-4000-8000-000000000002';

describe('generateRequestSchema', () => {
  it('aceita request minimo valido', () => {
    const r = generateRequestSchema.safeParse({
      concept: 'cafe expresso',
      format: 'feed_1x1',
      count: 1,
    });
    expect(r.success).toBe(true);
  });

  it('rejeita concept muito curto (<3 chars)', () => {
    const r = generateRequestSchema.safeParse({
      concept: 'ab',
      format: 'feed_1x1',
      count: 1,
    });
    expect(r.success).toBe(false);
  });

  it('rejeita concept > 2000 chars', () => {
    const r = generateRequestSchema.safeParse({
      concept: 'a'.repeat(2001),
      format: 'feed_1x1',
      count: 1,
    });
    expect(r.success).toBe(false);
  });

  it('rejeita count fora de 1-4', () => {
    const r5 = generateRequestSchema.safeParse({ concept: 'abc', format: 'feed_1x1', count: 5 });
    expect(r5.success).toBe(false);
    const r0 = generateRequestSchema.safeParse({ concept: 'abc', format: 'feed_1x1', count: 0 });
    expect(r0.success).toBe(false);
  });

  it('rejeita format fora do enum', () => {
    const r = generateRequestSchema.safeParse({
      concept: 'abc', format: 'square', count: 1,
    });
    expect(r.success).toBe(false);
  });

  it('mode=adapt sem source_creative_id falha', () => {
    const r = generateRequestSchema.safeParse({
      concept: 'abc', format: 'story_9x16', count: 1, mode: 'adapt',
    });
    expect(r.success).toBe(false);
  });

  it('mode=adapt com source_creative_id passa', () => {
    const r = generateRequestSchema.safeParse({
      concept: 'abc', format: 'story_9x16', count: 1,
      mode: 'adapt', source_creative_id: VALID_UUID,
    });
    expect(r.success).toBe(true);
  });

  it('source_creative_id deve ser uuid valido', () => {
    const r = generateRequestSchema.safeParse({
      concept: 'abc', format: 'story_9x16', count: 1,
      mode: 'adapt', source_creative_id: 'nao-uuid',
    });
    expect(r.success).toBe(false);
  });

  it('idempotency_key min 8 chars', () => {
    const r = generateRequestSchema.safeParse({
      concept: 'abc', format: 'feed_1x1', count: 1, idempotency_key: 'abc',
    });
    expect(r.success).toBe(false);
  });

  it('aceita todos opcionais juntos', () => {
    const r = generateRequestSchema.safeParse({
      concept: 'cafe', format: 'feed_1x1', count: 2,
      style_hint: 'minimalista', use_logo: true, model: 'auto',
      mode: 'create', conversation_id: VALID_UUID_2,
      idempotency_key: 'key-12345678', override_briefing_warning: false,
    });
    expect(r.success).toBe(true);
  });
});

describe('iterateRequestSchema', () => {
  it('aceita request minimo (so parent_creative_id)', () => {
    const r = iterateRequestSchema.safeParse({ parent_creative_id: VALID_UUID });
    expect(r.success).toBe(true);
  });

  it('rejeita parent_creative_id nao-uuid', () => {
    const r = iterateRequestSchema.safeParse({ parent_creative_id: 'foo' });
    expect(r.success).toBe(false);
  });

  it('count limitado a 1-3', () => {
    const r4 = iterateRequestSchema.safeParse({ parent_creative_id: VALID_UUID, count: 4 });
    expect(r4.success).toBe(false);
  });

  it('mode aceita iterate/regenerate/vary', () => {
    for (const m of ['iterate', 'regenerate', 'vary'] as const) {
      const r = iterateRequestSchema.safeParse({ parent_creative_id: VALID_UUID, mode: m });
      expect(r.success).toBe(true);
    }
  });

  it('rejeita mode invalido', () => {
    const r = iterateRequestSchema.safeParse({ parent_creative_id: VALID_UUID, mode: 'transform' });
    expect(r.success).toBe(false);
  });

  it('instruction max 2000 chars', () => {
    const r = iterateRequestSchema.safeParse({
      parent_creative_id: VALID_UUID, instruction: 'a'.repeat(2001),
    });
    expect(r.success).toBe(false);
  });
});

describe('updateMetadataSchema', () => {
  it('aceita patch parcial', () => {
    const r = updateMetadataSchema.safeParse({ title: 'oferta hero' });
    expect(r.success).toBe(true);
  });

  it('title aceita null (limpar)', () => {
    const r = updateMetadataSchema.safeParse({ title: null });
    expect(r.success).toBe(true);
  });

  it('tags max 20', () => {
    const r = updateMetadataSchema.safeParse({
      tags: Array.from({ length: 21 }, (_, i) => `t${i}`),
    });
    expect(r.success).toBe(false);
  });

  it('description max 1000 chars', () => {
    const r = updateMetadataSchema.safeParse({ description: 'a'.repeat(1001) });
    expect(r.success).toBe(false);
  });

  it('rejeita tag vazia', () => {
    const r = updateMetadataSchema.safeParse({ tags: [''] });
    expect(r.success).toBe(false);
  });
});

describe('filtersSchema', () => {
  it('aceita filtros multiplos', () => {
    const r = filtersSchema.safeParse({
      status: ['approved', 'published'],
      format: ['feed_1x1'],
      tags: ['black-friday'],
    });
    expect(r.success).toBe(true);
  });

  it('rejeita status fora do enum', () => {
    const r = filtersSchema.safeParse({ status: ['rejected'] });
    expect(r.success).toBe(false);
  });

  it('rejeita format fora do enum', () => {
    const r = filtersSchema.safeParse({ format: ['16x9'] });
    expect(r.success).toBe(false);
  });

  it('aceita filtros vazios', () => {
    const r = filtersSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it('from/to exigem ISO datetime', () => {
    const ok = filtersSchema.safeParse({ from: '2026-04-01T00:00:00.000Z' });
    expect(ok.success).toBe(true);
    const bad = filtersSchema.safeParse({ from: '2026-04-01' });
    expect(bad.success).toBe(false);
  });
});

describe('exportRequestSchema', () => {
  it('aceita 1 id', () => {
    const r = exportRequestSchema.safeParse({ creative_ids: [VALID_UUID] });
    expect(r.success).toBe(true);
  });

  it('rejeita lista vazia', () => {
    const r = exportRequestSchema.safeParse({ creative_ids: [] });
    expect(r.success).toBe(false);
  });

  it('rejeita > 50 ids', () => {
    const ids = Array.from({ length: 51 }, () => VALID_UUID);
    const r = exportRequestSchema.safeParse({ creative_ids: ids });
    expect(r.success).toBe(false);
  });

  it('rejeita id nao-uuid', () => {
    const r = exportRequestSchema.safeParse({ creative_ids: ['foo'] });
    expect(r.success).toBe(false);
  });
});
