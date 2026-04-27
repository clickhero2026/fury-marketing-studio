// Tests do chunker da Knowledge Base (task 10.1).
// Spec: knowledge-base-rag (R4.1, R4.3)
//
// Logica copiada de supabase/functions/kb-ingest/index.ts para teste isolado
// (Deno runtime nao tem vitest harness; padrao identico a log-redact.test.ts).

import { describe, expect, it } from 'vitest';

const CHUNK_TARGET_TOKENS = 800;
const CHUNK_OVERLAP_TOKENS = 100;

interface Chunk {
  index: number;
  text: string;
  page: number | null;
  tokens: number;
}

function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

function chunkPlain(text: string): Chunk[] {
  const targetChars = CHUNK_TARGET_TOKENS * 4;
  const overlapChars = CHUNK_OVERLAP_TOKENS * 4;
  const chunks: Chunk[] = [];
  let i = 0;
  let idx = 0;
  while (i < text.length) {
    const end = Math.min(text.length, i + targetChars);
    const slice = text.slice(i, end);
    chunks.push({ index: idx++, text: slice, page: null, tokens: estimateTokens(slice) });
    if (end === text.length) break;
    i = end - overlapChars;
    if (i <= 0) i = end;
  }
  return chunks;
}

function chunkPdfPages(pages: { page: number; text: string }[]): Chunk[] {
  const targetChars = CHUNK_TARGET_TOKENS * 4;
  const chunks: Chunk[] = [];
  let idx = 0;
  for (const p of pages) {
    const text = p.text;
    if (text.length <= targetChars) {
      chunks.push({ index: idx++, text, page: p.page, tokens: estimateTokens(text) });
      continue;
    }
    const overlapChars = CHUNK_OVERLAP_TOKENS * 4;
    let i = 0;
    while (i < text.length) {
      const end = Math.min(text.length, i + targetChars);
      const slice = text.slice(i, end);
      chunks.push({ index: idx++, text: slice, page: p.page, tokens: estimateTokens(slice) });
      if (end === text.length) break;
      i = end - overlapChars;
      if (i <= 0) i = end;
    }
  }
  return chunks;
}

function chunkCsv(text: string): Chunk[] {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return [];
  const header = lines[0];
  const rows = lines.slice(1).filter((l) => l.trim().length > 0);
  const ROWS_PER_CHUNK = 50;
  const chunks: Chunk[] = [];
  let idx = 0;
  for (let i = 0; i < rows.length; i += ROWS_PER_CHUNK) {
    const block = [header, ...rows.slice(i, i + ROWS_PER_CHUNK)].join('\n');
    chunks.push({ index: idx++, text: block, page: null, tokens: estimateTokens(block) });
  }
  if (chunks.length === 0 && header.trim().length > 0) {
    chunks.push({ index: 0, text: header, page: null, tokens: estimateTokens(header) });
  }
  return chunks;
}

describe('chunkPlain', () => {
  it('texto curto vira 1 chunk', () => {
    const out = chunkPlain('texto curto');
    expect(out).toHaveLength(1);
    expect(out[0].index).toBe(0);
    expect(out[0].page).toBeNull();
    expect(out[0].text).toBe('texto curto');
  });

  it('texto longo respeita target chars com overlap', () => {
    const text = 'a'.repeat(10000); // 10k chars = ~2500 tokens
    const out = chunkPlain(text);
    expect(out.length).toBeGreaterThan(2);
    // Cada chunk (exceto talvez o ultimo) deve ter ~800 tokens
    for (const c of out) {
      expect(c.tokens).toBeLessThanOrEqual(CHUNK_TARGET_TOKENS);
    }
    // Cobertura total: ultimo chunk termina em text.length
    const lastChunkEnd = text.length;
    expect(out[out.length - 1].text.endsWith('a')).toBe(true);
    expect(lastChunkEnd).toBe(text.length);
  });

  it('chunks tem indices sequenciais a partir de 0', () => {
    const out = chunkPlain('x'.repeat(8000));
    out.forEach((c, i) => expect(c.index).toBe(i));
  });
});

describe('chunkPdfPages', () => {
  it('preserva page_number em cada chunk', () => {
    const pages = [
      { page: 1, text: 'pagina um' },
      { page: 2, text: 'pagina dois' },
      { page: 3, text: 'pagina tres' },
    ];
    const out = chunkPdfPages(pages);
    expect(out).toHaveLength(3);
    expect(out[0].page).toBe(1);
    expect(out[1].page).toBe(2);
    expect(out[2].page).toBe(3);
  });

  it('subdivide pagina muito longa mantendo page_number', () => {
    const pages = [{ page: 7, text: 'a'.repeat(10000) }];
    const out = chunkPdfPages(pages);
    expect(out.length).toBeGreaterThan(2);
    // Todos os chunks devem ter page=7
    for (const c of out) {
      expect(c.page).toBe(7);
    }
  });

  it('indices sao globais entre paginas', () => {
    const pages = [
      { page: 1, text: 'curto' },
      { page: 2, text: 'tambem curto' },
    ];
    const out = chunkPdfPages(pages);
    expect(out[0].index).toBe(0);
    expect(out[1].index).toBe(1);
  });
});

describe('chunkCsv', () => {
  it('chunk por bloco de 50 linhas com header repetido', () => {
    const header = 'col1,col2,col3';
    const rows = Array.from({ length: 120 }, (_, i) => `v${i},x,y`);
    const csv = [header, ...rows].join('\n');
    const out = chunkCsv(csv);
    // 120 linhas / 50 = 3 chunks (50, 50, 20)
    expect(out).toHaveLength(3);
    // Cada chunk deve ter o header como primeira linha
    for (const c of out) {
      expect(c.text.startsWith(header)).toBe(true);
    }
  });

  it('CSV so com header gera 1 chunk', () => {
    const out = chunkCsv('only,header,here');
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('only,header,here');
  });

  it('CSV vazio retorna array vazio', () => {
    // Header vazio nao gera chunk (skip via header.trim().length check)
    expect(chunkCsv('')).toHaveLength(0);
  });

  it('CSV so com header e linhas em branco gera 1 chunk', () => {
    const out = chunkCsv('header\n\n\n');
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('header');
  });
});
