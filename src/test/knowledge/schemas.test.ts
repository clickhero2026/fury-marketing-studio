// Tests dos schemas Zod e validateFileForUpload (task 10.3 — slice de validacao).
// Spec: knowledge-base-rag (R1.1, R1.2, R1.6, R7.3)

import { describe, expect, it } from 'vitest';
import {
  filtersSchema,
  searchParamsSchema,
  updateMetadataSchema,
  uploadMetadataSchema,
  validateFileForUpload,
} from '@/lib/knowledge-schemas';
import { KB_MAX_FILE_BYTES } from '@/types/knowledge';

describe('uploadMetadataSchema', () => {
  it('aceita meta vazia (todos opcionais com tags default [])', () => {
    const r = uploadMetadataSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.tags).toEqual([]);
  });

  it('rejeita titulo acima de 200 chars', () => {
    const r = uploadMetadataSchema.safeParse({ title: 'a'.repeat(201) });
    expect(r.success).toBe(false);
  });

  it('limita tags a 20', () => {
    const r = uploadMetadataSchema.safeParse({
      tags: Array.from({ length: 21 }, (_, i) => `tag${i}`),
    });
    expect(r.success).toBe(false);
  });
});

describe('updateMetadataSchema', () => {
  it('description aceita null (limpar campo)', () => {
    const r = updateMetadataSchema.safeParse({ description: null });
    expect(r.success).toBe(true);
  });

  it('is_source_of_truth boolean opcional', () => {
    const r = updateMetadataSchema.safeParse({ is_source_of_truth: true });
    expect(r.success).toBe(true);
  });
});

describe('filtersSchema', () => {
  it('search precisa ter no minimo 1 char trim', () => {
    const r = filtersSchema.safeParse({ search: '   ' });
    expect(r.success).toBe(false);
  });

  it('aceita filtros multiplos', () => {
    const r = filtersSchema.safeParse({
      type: ['pdf', 'image'],
      tags: ['oferta'],
      status: ['indexed'],
      is_source_of_truth: true,
    });
    expect(r.success).toBe(true);
  });

  it('rejeita type fora do enum', () => {
    const r = filtersSchema.safeParse({ type: ['exe'] });
    expect(r.success).toBe(false);
  });
});

describe('searchParamsSchema', () => {
  it('top_k default = 8', () => {
    const r = searchParamsSchema.parse({ query: 'algo' });
    expect(r.top_k).toBe(8);
  });

  it('top_k limitado a 20', () => {
    const r = searchParamsSchema.safeParse({ query: 'x', top_k: 50 });
    expect(r.success).toBe(false);
  });

  it('rejeita query vazia', () => {
    const r = searchParamsSchema.safeParse({ query: '' });
    expect(r.success).toBe(false);
  });
});

describe('validateFileForUpload', () => {
  function makeFile(size: number, type: string): File {
    return new File([new Uint8Array(size)], 'test', { type });
  }

  it('aceita PDF dentro do limite', () => {
    const r = validateFileForUpload(makeFile(1024 * 100, 'application/pdf'));
    expect(r.ok).toBe(true);
  });

  it('rejeita arquivo > 25MB', () => {
    const r = validateFileForUpload(makeFile(KB_MAX_FILE_BYTES + 1, 'application/pdf'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('too_large');
  });

  it('rejeita mime nao suportado', () => {
    const r = validateFileForUpload(makeFile(1024, 'application/x-executable'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unsupported_mime');
  });

  it('aceita imagem WEBP', () => {
    const r = validateFileForUpload(makeFile(50000, 'image/webp'));
    expect(r.ok).toBe(true);
  });
});
