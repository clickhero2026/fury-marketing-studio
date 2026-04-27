// Unit tests do compliance light textual (task 11.3 — R10.2, R10.3, R10.4).
// Spec: ai-creative-generation
//
// Re-implementa a logica de checkComplianceText (originalmente em
// supabase/functions/_shared/creative-compliance.ts, runtime Deno).

import { describe, expect, it } from 'vitest';

interface BlocklistTerm {
  term: string;
  category: string;
  severity: 'warn' | 'block_unless_override';
}

interface BriefingProhibitions {
  words: string[];
  topics: string[];
  visualRules: string[];
}

interface ComplianceTextResult {
  baseline_hits: { term: string; severity: 'warn' | 'block_unless_override' }[];
  briefing_hits: string[];
  hard_block: boolean;
  requires_override: boolean;
}

function checkComplianceText(
  concept: string,
  instruction: string | undefined,
  briefing: BriefingProhibitions,
  blocklist: BlocklistTerm[],
): ComplianceTextResult {
  const haystack = `${concept} ${instruction ?? ''}`.toLowerCase();

  const briefingTerms = [
    ...briefing.words,
    ...briefing.topics,
    ...briefing.visualRules,
  ].map((s) => s.toLowerCase().trim()).filter((s) => s.length > 0);

  const briefing_hits: string[] = [];
  for (const term of briefingTerms) {
    if (haystack.includes(term)) briefing_hits.push(term);
  }

  const baseline_hits: ComplianceTextResult['baseline_hits'] = [];
  for (const entry of blocklist) {
    const t = entry.term.toLowerCase().trim();
    if (haystack.includes(t)) {
      baseline_hits.push({ term: entry.term, severity: entry.severity });
    }
  }

  const hard_block = briefing_hits.length > 0;
  const requires_override = !hard_block
    && baseline_hits.some((h) => h.severity === 'block_unless_override');

  return { baseline_hits, briefing_hits, hard_block, requires_override };
}

const SAMPLE_BLOCKLIST: BlocklistTerm[] = [
  { term: '100% garantido', category: 'claim', severity: 'block_unless_override' },
  { term: 'antes e depois', category: 'antes_depois', severity: 'block_unless_override' },
  { term: 'milagre', category: 'claim', severity: 'warn' },
];

const EMPTY_PROHIBITIONS: BriefingProhibitions = {
  words: [], topics: [], visualRules: [],
};

describe('checkComplianceText — match no concept', () => {
  it('detecta termo block_unless_override no concept', () => {
    const r = checkComplianceText('100% garantido em 30 dias', undefined, EMPTY_PROHIBITIONS, SAMPLE_BLOCKLIST);
    expect(r.baseline_hits.map((h) => h.term)).toContain('100% garantido');
    expect(r.requires_override).toBe(true);
    expect(r.hard_block).toBe(false);
  });

  it('detecta termo warn no concept (NAO requer override)', () => {
    const r = checkComplianceText('uma solucao milagre pra acne', undefined, EMPTY_PROHIBITIONS, SAMPLE_BLOCKLIST);
    expect(r.baseline_hits.some((h) => h.severity === 'warn')).toBe(true);
    expect(r.requires_override).toBe(false);
  });

  it('case-insensitive', () => {
    const r = checkComplianceText('ANTES E DEPOIS impressionante', undefined, EMPTY_PROHIBITIONS, SAMPLE_BLOCKLIST);
    expect(r.baseline_hits.length).toBeGreaterThan(0);
  });

  it('concept limpo nao gera hits', () => {
    const r = checkComplianceText('cafe expresso numa caneca branca', undefined, EMPTY_PROHIBITIONS, SAMPLE_BLOCKLIST);
    expect(r.baseline_hits).toEqual([]);
    expect(r.briefing_hits).toEqual([]);
    expect(r.hard_block).toBe(false);
    expect(r.requires_override).toBe(false);
  });
});

describe('checkComplianceText — match na instruction', () => {
  it('detecta termo na instruction (iterate)', () => {
    const r = checkComplianceText(
      'cafe expresso',
      'adicione texto antes e depois',
      EMPTY_PROHIBITIONS,
      SAMPLE_BLOCKLIST,
    );
    expect(r.baseline_hits.map((h) => h.term)).toContain('antes e depois');
  });

  it('instruction undefined nao quebra', () => {
    const r = checkComplianceText('cafe expresso', undefined, EMPTY_PROHIBITIONS, SAMPLE_BLOCKLIST);
    expect(r.baseline_hits).toEqual([]);
  });
});

describe('checkComplianceText — briefing prohibitions sempre bloqueiam (R10.2)', () => {
  it('hit em prohibitions.words -> hard_block', () => {
    const briefing: BriefingProhibitions = {
      words: ['concorrente'], topics: [], visualRules: [],
    };
    const r = checkComplianceText('com nosso concorrente abc', undefined, briefing, []);
    expect(r.hard_block).toBe(true);
    expect(r.briefing_hits).toContain('concorrente');
  });

  it('hit em prohibitions.topics -> hard_block', () => {
    const briefing: BriefingProhibitions = {
      words: [], topics: ['religiao'], visualRules: [],
    };
    const r = checkComplianceText('sermao sobre religiao no anuncio', undefined, briefing, []);
    expect(r.hard_block).toBe(true);
  });

  it('hit em prohibitions.visualRules -> hard_block', () => {
    const briefing: BriefingProhibitions = {
      words: [], topics: [], visualRules: ['pessoas reais'],
    };
    const r = checkComplianceText('foto com pessoas reais sorrindo', undefined, briefing, []);
    expect(r.hard_block).toBe(true);
    expect(r.briefing_hits).toContain('pessoas reais');
  });

  it('briefing hit prevalece — ignora baseline override', () => {
    const briefing: BriefingProhibitions = {
      words: ['garantido'], topics: [], visualRules: [],
    };
    // "100% garantido" matcheia ambos: baseline (block_unless_override) E briefing
    const r = checkComplianceText('100% garantido', undefined, briefing, SAMPLE_BLOCKLIST);
    expect(r.hard_block).toBe(true);
    expect(r.requires_override).toBe(false); // hard_block mata o requires_override
  });

  it('hit em multiplas categorias -> todas listadas', () => {
    const briefing: BriefingProhibitions = {
      words: ['x'], topics: ['y'], visualRules: ['z'],
    };
    const r = checkComplianceText('x y z misturado', undefined, briefing, []);
    expect(r.briefing_hits).toEqual(expect.arrayContaining(['x', 'y', 'z']));
  });
});

describe('checkComplianceText — severity matrix', () => {
  it('block_unless_override sem briefing -> requires_override=true', () => {
    const r = checkComplianceText('100% garantido', undefined, EMPTY_PROHIBITIONS, SAMPLE_BLOCKLIST);
    expect(r.hard_block).toBe(false);
    expect(r.requires_override).toBe(true);
  });

  it('apenas warn (sem block_unless_override) -> requires_override=false', () => {
    const r = checkComplianceText('isso e milagre', undefined, EMPTY_PROHIBITIONS, SAMPLE_BLOCKLIST);
    expect(r.requires_override).toBe(false);
  });

  it('warn + block_unless_override juntos -> requires_override=true', () => {
    const r = checkComplianceText('milagre 100% garantido', undefined, EMPTY_PROHIBITIONS, SAMPLE_BLOCKLIST);
    expect(r.requires_override).toBe(true);
    expect(r.baseline_hits.length).toBe(2);
  });
});
