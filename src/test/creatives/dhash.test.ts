// Unit tests do dHash + hammingDistance (task 11.1 — R8.2, R8.3).
// Spec: ai-creative-generation
//
// O modulo real vive em supabase/functions/_shared/dhash.ts e usa imagescript
// (Deno-only). Aqui re-implementamos a logica pura (hammingDistance e o pipeline
// hex<->bits) e geramos buffers de pixels sinteticos pra simular o pipeline
// sem decodificar imagens reais.

import { describe, expect, it } from 'vitest';

// ============================================================
// Logica copiada de supabase/functions/_shared/dhash.ts
// ============================================================
const HASH_WIDTH = 9;
const HASH_HEIGHT = 8;

function bitsToHex(bits: string): string {
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

/**
 * Versao pura: recebe array de luminancia direto (sem decode).
 * Usado nos tests pra evitar dep de imagescript (Deno-only).
 */
function dhashFromLuminance(luminances: Float32Array): string {
  if (luminances.length !== HASH_WIDTH * HASH_HEIGHT) {
    throw new Error(`expected ${HASH_WIDTH * HASH_HEIGHT} pixels`);
  }
  let bits = '';
  for (let y = 0; y < HASH_HEIGHT; y++) {
    for (let x = 0; x < HASH_WIDTH - 1; x++) {
      const left = luminances[y * HASH_WIDTH + x];
      const right = luminances[y * HASH_WIDTH + x + 1];
      bits += left > right ? '1' : '0';
    }
  }
  return bitsToHex(bits);
}

function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) {
    throw new Error(`hammingDistance: tamanhos diferentes (${a.length} vs ${b.length})`);
  }
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    const xor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    let v = xor;
    v = v - ((v >> 1) & 0x5);
    v = (v & 0x3) + ((v >> 2) & 0x3);
    dist += v;
  }
  return dist;
}

// ============================================================
// Helpers de teste — buffers sinteticos
// ============================================================
function makeGradient(): Float32Array {
  const arr = new Float32Array(HASH_WIDTH * HASH_HEIGHT);
  for (let i = 0; i < arr.length; i++) arr[i] = i; // gradiente crescente
  return arr;
}

function makeUniform(value: number): Float32Array {
  return new Float32Array(HASH_WIDTH * HASH_HEIGHT).fill(value);
}

// ============================================================
// Tests
// ============================================================
describe('dhashFromLuminance', () => {
  it('hash sempre 16 chars hex', () => {
    const h = dhashFromLuminance(makeGradient());
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it('imagens identicas -> mesmo hash', () => {
    const lum = makeGradient();
    expect(dhashFromLuminance(lum)).toBe(dhashFromLuminance(lum));
  });

  it('uniform tem hash com tudo zero (nenhum left > right)', () => {
    const h = dhashFromLuminance(makeUniform(50));
    expect(h).toBe('0'.repeat(16));
  });

  it('rejeita tamanho errado', () => {
    expect(() => dhashFromLuminance(new Float32Array(10))).toThrow();
  });
});

describe('hammingDistance', () => {
  it('hashes identicos -> distancia 0', () => {
    expect(hammingDistance('aabbccdd11223344', 'aabbccdd11223344')).toBe(0);
  });

  it('um bit diferente -> distancia 1', () => {
    // 0x0 = 0000, 0x1 = 0001 — 1 bit
    expect(hammingDistance('0000000000000000', '0000000000000001')).toBe(1);
  });

  it('um nibble totalmente trocado (f vs 0) -> distancia 4', () => {
    expect(hammingDistance('0000000000000000', '000000000000000f')).toBe(4);
  });

  it('hashes opostos (todos os bits) -> 64', () => {
    expect(hammingDistance('0000000000000000', 'ffffffffffffffff')).toBe(64);
  });

  it('rejeita tamanhos diferentes', () => {
    expect(() => hammingDistance('abc', 'abcdef')).toThrow();
  });

  it('variacao leve (2 nibbles trocados) -> distancia <= 8', () => {
    // simula leve modificacao em 2 bytes
    const a = '0123456789abcdef';
    const b = '0123456789abcdee'; // ultimo nibble: f (1111) -> e (1110), 1 bit
    expect(hammingDistance(a, b)).toBe(1);
  });

  it('imagem visualmente diferente -> distancia >= 10', () => {
    const a = '0000000000000000';
    const b = 'aaaaaaaaaaaaaaaa'; // alterna bits — 32 bits diferentes
    expect(hammingDistance(a, b)).toBeGreaterThanOrEqual(10);
  });
});

describe('thresholds de dedupe (R8.3)', () => {
  it('threshold de bloqueio (<=3) detecta quase-identicos', () => {
    const a = '0000000000000000';
    const b = '0000000000000007'; // 3 bits diferentes
    const dist = hammingDistance(a, b);
    expect(dist).toBeLessThanOrEqual(3);
  });

  it('threshold near-duplicate (<=8) detecta similares', () => {
    const a = '0000000000000000';
    const b = '00000000000000ff'; // 8 bits diferentes
    expect(hammingDistance(a, b)).toBe(8);
    expect(hammingDistance(a, b)).toBeLessThanOrEqual(8);
  });

  it('threshold de "diferente" (>10) confirma imagens distintas', () => {
    const a = '0000000000000000';
    const b = '00000000000fffff'; // 20 bits diferentes
    expect(hammingDistance(a, b)).toBeGreaterThan(10);
  });
});
