// dHash perceptual de imagem (Deno-friendly via imagescript).
// Spec: ai-creative-generation (task 3.1 — R8.2, R8.3)
//
// Pipeline:
//   1. Decode PNG/JPEG/WEBP via imagescript (zero deps nativas)
//   2. Resize 9x8 grayscale
//   3. Para cada linha, comparar pixel[i] com pixel[i+1]
//      (8 comparacoes/linha x 8 linhas = 64 bits)
//   4. Hash: 16 chars hex
//
// Hamming distance via XOR + popcount serve para comparar similaridade.
// Threshold tipico:
//   0     = identico
//   <=3   = quase identico (bloqueia em R8.3)
//   4-8   = similar (warn)
//   >10   = diferente

import { Image, decode } from 'https://deno.land/x/imagescript@1.2.17/mod.ts';

const HASH_WIDTH = 9;
const HASH_HEIGHT = 8;

/**
 * Calcula dHash de 64 bits (16 chars hex) a partir de bytes de imagem.
 * Aceita PNG, JPEG, WEBP, GIF.
 */
export async function dhash(bytes: Uint8Array): Promise<string> {
  const decoded = await decode(bytes);
  if (!(decoded instanceof Image)) {
    throw new Error('dhash: imagem nao decodificada (formato suportado: PNG/JPEG/WEBP)');
  }

  // Resize para 9x8. imagescript usa filtros bons por padrao.
  const resized = decoded.resize(HASH_WIDTH, HASH_HEIGHT);

  // Converte cada pixel em luminancia (grayscale) — Rec. 709
  const luminances = new Float32Array(HASH_WIDTH * HASH_HEIGHT);
  for (let y = 0; y < HASH_HEIGHT; y++) {
    for (let x = 0; x < HASH_WIDTH; x++) {
      const px = resized.getPixelAt(x + 1, y + 1); // imagescript usa 1-indexed
      const r = (px >> 24) & 0xff;
      const g = (px >> 16) & 0xff;
      const b = (px >> 8) & 0xff;
      luminances[y * HASH_WIDTH + x] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
  }

  // Para cada linha, 8 comparacoes (HASH_WIDTH-1) -> 64 bits totais
  let hashBits = '';
  for (let y = 0; y < HASH_HEIGHT; y++) {
    for (let x = 0; x < HASH_WIDTH - 1; x++) {
      const left = luminances[y * HASH_WIDTH + x];
      const right = luminances[y * HASH_WIDTH + x + 1];
      hashBits += left > right ? '1' : '0';
    }
  }

  // Bits -> hex 16 chars (4 bits por nibble)
  let hex = '';
  for (let i = 0; i < hashBits.length; i += 4) {
    const nibble = parseInt(hashBits.slice(i, i + 4), 2);
    hex += nibble.toString(16);
  }
  return hex;
}

/**
 * Distancia de Hamming entre dois hashes hex de 16 chars (64 bits).
 * Retorna 0 se identicos, ate 64 se totalmente diferentes.
 */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) {
    throw new Error(`hammingDistance: tamanhos diferentes (${a.length} vs ${b.length})`);
  }
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    const xor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    // Popcount de nibble (4 bits)
    let v = xor;
    v = v - ((v >> 1) & 0x5);
    v = (v & 0x3) + ((v >> 2) & 0x3);
    dist += v;
  }
  return dist;
}
