// Unit tests da utility de redact — task 9.3 (R9.5).
// Spec: briefing-onboarding
//
// Nota: testa o helper como modulo standalone. O arquivo real vive em
// supabase/functions/_shared/log-redact.ts (Deno) — copiamos a logica
// equivalente aqui ou importamos via path relativo. Como _shared usa
// runtime Deno, redeclaramos a funcao para testar a logica pura.

import { describe, it, expect } from 'vitest';

// Logica copiada de supabase/functions/_shared/log-redact.ts para teste isolado.
const REDACTED = '[REDACTED]';
const SENSITIVE_PATHS: Array<RegExp> = [
  /^primaryOffer\.price$/,
  /^primaryOffer\.short_description$/,
  /^primaryOffer\.social_proof/,
  /^secondaryOffers\.\d+\.price$/,
  /^secondaryOffers\.\d+\.short_description$/,
  /^secondaryOffers\.\d+\.social_proof/,
  /^prohibitions\./,
  /^tone\.preferredCtas$/,
  /^tone\.forbiddenPhrases$/,
  /^audience\.languageSamples$/,
];

function redactInternal(value: unknown, path: string): unknown {
  if (value === null || value === undefined) return value;
  if (SENSITIVE_PATHS.some((re) => re.test(path))) return REDACTED;
  if (Array.isArray(value)) return value.map((item, i) => redactInternal(item, `${path}.${i}`));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const nextPath = path ? `${path}.${k}` : k;
      out[k] = redactInternal(v, nextPath);
    }
    return out;
  }
  return value;
}

function redactBriefingForLog<T>(payload: T): T {
  return redactInternal(payload, '') as T;
}

describe('redactBriefingForLog', () => {
  it('preserva campos publicos e ofusca sensiveis', () => {
    const input = {
      isComplete: true,
      business: { niche: 'Moda feminina', description: 'Loja online' },
      primaryOffer: {
        name: 'Vestido Verao',
        short_description: 'detalhes secretos',
        price: 199.9,
        social_proof: { testimonials: ['Adorei!', 'Recomendo'] },
      },
      tone: {
        formality: 3,
        preferredCtas: ['Compre agora'],
        forbiddenPhrases: ['garantia'],
      },
      audience: {
        ageRange: { min: 18, max: 35 },
        languageSamples: ['to apaixonada'],
      },
      prohibitions: { words: ['cura'], topics: ['concorrencia'] },
    };

    const out = redactBriefingForLog(input);

    expect(out.isComplete).toBe(true);
    expect(out.business.niche).toBe('Moda feminina');
    expect(out.primaryOffer.name).toBe('Vestido Verao');
    expect(out.primaryOffer.price).toBe('[REDACTED]');
    expect(out.primaryOffer.short_description).toBe('[REDACTED]');
    expect(out.primaryOffer.social_proof).toBe('[REDACTED]');
    expect(out.tone.formality).toBe(3);
    expect(out.tone.preferredCtas).toBe('[REDACTED]');
    expect(out.tone.forbiddenPhrases).toBe('[REDACTED]');
    expect(out.audience.ageRange).toEqual({ min: 18, max: 35 });
    expect(out.audience.languageSamples).toBe('[REDACTED]');
    expect(out.prohibitions).toEqual({ words: '[REDACTED]', topics: '[REDACTED]' });
  });

  it('lida com null/undefined sem quebrar', () => {
    expect(redactBriefingForLog(null)).toBeNull();
    expect(redactBriefingForLog(undefined)).toBeUndefined();
  });

  it('ofusca em ofertas secundarias por indice', () => {
    const input = {
      secondaryOffers: [
        { name: 'X', price: 50, short_description: 'detalhe' },
        { name: 'Y', price: 80, short_description: 'mais detalhe' },
      ],
    };
    const out = redactBriefingForLog(input);
    expect(out.secondaryOffers[0].name).toBe('X');
    expect(out.secondaryOffers[0].price).toBe('[REDACTED]');
    expect(out.secondaryOffers[1].short_description).toBe('[REDACTED]');
  });

  it('nao mexe em valores primitivos top-level', () => {
    expect(redactBriefingForLog('hello')).toBe('hello');
    expect(redactBriefingForLog(42)).toBe(42);
    expect(redactBriefingForLog(true)).toBe(true);
  });
});
