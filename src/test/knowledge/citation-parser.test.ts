// Tests do parser de citacoes (task 10.2).
// Spec: knowledge-base-rag (R6.2, R6.4)

import { describe, expect, it } from 'vitest';
import { CITATION_REGEX } from '@/types/knowledge';

interface ParsedRef {
  documentId: string;
  chunkIndex: number;
}

interface Segment {
  type: 'text' | 'ref';
  content: string;
  ref?: ParsedRef;
}

function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  const regex = new RegExp(CITATION_REGEX.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    segments.push({
      type: 'ref',
      content: match[0],
      ref: { documentId: match[1], chunkIndex: parseInt(match[2], 10) },
    });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }
  return segments;
}

const VALID_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const VALID_UUID_2 = '11111111-2222-3333-4444-555555555555';

describe('parseSegments (citation parser)', () => {
  it('texto sem refs retorna 1 segmento de texto', () => {
    const out = parseSegments('Sem citacoes aqui.');
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ type: 'text', content: 'Sem citacoes aqui.' });
  });

  it('captura ref valida no formato correto', () => {
    const out = parseSegments(`A oferta custa R$199 [doc:${VALID_UUID}#chunk:5].`);
    expect(out).toHaveLength(3);
    expect(out[0].type).toBe('text');
    expect(out[1]).toEqual({
      type: 'ref',
      content: `[doc:${VALID_UUID}#chunk:5]`,
      ref: { documentId: VALID_UUID, chunkIndex: 5 },
    });
    expect(out[2].type).toBe('text');
  });

  it('captura multiplas refs em sequencia', () => {
    const text = `Veja [doc:${VALID_UUID}#chunk:0] e [doc:${VALID_UUID_2}#chunk:12].`;
    const out = parseSegments(text);
    const refs = out.filter((s) => s.type === 'ref');
    expect(refs).toHaveLength(2);
    expect(refs[0].ref?.documentId).toBe(VALID_UUID);
    expect(refs[1].ref?.documentId).toBe(VALID_UUID_2);
    expect(refs[1].ref?.chunkIndex).toBe(12);
  });

  it('refs com chunk_index multi-digito', () => {
    const out = parseSegments(`[doc:${VALID_UUID}#chunk:1234]`);
    const ref = out.find((s) => s.type === 'ref');
    expect(ref?.ref?.chunkIndex).toBe(1234);
  });

  it('ignora pseudo-refs com formato invalido', () => {
    // UUID muito curto, sem chunk, formato errado
    const cases = [
      '[doc:abc#chunk:1]',                    // UUID muito curto
      '[doc:not-a-uuid-here#chunk:5]',        // sem 36 chars hex
      '[doc:11111111-2222-3333-4444-555555555555]', // sem chunk
      'doc:11111111-2222-3333-4444-555555555555#chunk:1', // sem brackets
    ];
    for (const c of cases) {
      const out = parseSegments(c);
      const refs = out.filter((s) => s.type === 'ref');
      expect(refs, `nao deveria match: ${c}`).toHaveLength(0);
    }
  });

  it('preserva texto antes/depois/entre refs', () => {
    const text = `Inicio [doc:${VALID_UUID}#chunk:1] meio [doc:${VALID_UUID_2}#chunk:2] fim.`;
    const out = parseSegments(text);
    const texts = out.filter((s) => s.type === 'text').map((s) => s.content);
    expect(texts.join('|')).toBe('Inicio | meio | fim.');
  });

  it('texto vazio retorna array vazio', () => {
    expect(parseSegments('')).toHaveLength(0);
  });

  it('chunk_index = 0 e valido', () => {
    const out = parseSegments(`[doc:${VALID_UUID}#chunk:0]`);
    const ref = out.find((s) => s.type === 'ref');
    expect(ref?.ref?.chunkIndex).toBe(0);
  });
});
