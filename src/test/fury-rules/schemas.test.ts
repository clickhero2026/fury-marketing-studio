// Unit tests do schema de proposed_rule.
// Spec: .kiro/specs/fury-learning/ (T7.1)

import { describe, expect, it } from 'vitest';
import { ProposedRuleSchema } from '@/lib/fury-rules-schemas';

describe('ProposedRuleSchema', () => {
  const baseBehavior = {
    rule_type: 'behavior' as const,
    confidence: 0.85,
    name: 'Sempre PT-BR',
    description: 'Responda sempre em portugues brasileiro formal',
    scope: { level: 'global' as const },
    reasoning: 'Usuario disse "sempre responda em pt-BR formal"',
  };

  it('aceita behavior valido', () => {
    expect(ProposedRuleSchema.safeParse(baseBehavior).success).toBe(true);
  });

  it('rejeita confidence > 1', () => {
    const r = ProposedRuleSchema.safeParse({ ...baseBehavior, confidence: 1.2 });
    expect(r.success).toBe(false);
  });

  it('rejeita confidence < 0', () => {
    const r = ProposedRuleSchema.safeParse({ ...baseBehavior, confidence: -0.1 });
    expect(r.success).toBe(false);
  });

  it('rejeita name vazio', () => {
    const r = ProposedRuleSchema.safeParse({ ...baseBehavior, name: '' });
    expect(r.success).toBe(false);
  });

  it('rejeita scope.level invalido', () => {
    const r = ProposedRuleSchema.safeParse({ ...baseBehavior, scope: { level: 'planet' } });
    expect(r.success).toBe(false);
  });

  it('exige trigger e action quando rule_type=action', () => {
    const r = ProposedRuleSchema.safeParse({
      ...baseBehavior,
      rule_type: 'action',
    });
    expect(r.success).toBe(false);
  });

  it('aceita rule_type=action com trigger e action', () => {
    const r = ProposedRuleSchema.safeParse({
      ...baseBehavior,
      rule_type: 'action',
      name: 'Pausa CPL alto',
      description: 'Pausa quando CPL > 30 por 3 dias',
      trigger: { metric: 'cpl', operator: '>', value: 30, consecutive_days: 3 },
      action: { type: 'pause' },
    });
    expect(r.success).toBe(true);
  });

  it('exige transform.transform_type quando rule_type=creative_pipeline', () => {
    const r = ProposedRuleSchema.safeParse({
      ...baseBehavior,
      rule_type: 'creative_pipeline',
      name: 'Logo no canto',
      description: 'Use sempre essa logo no canto superior direito',
    });
    expect(r.success).toBe(false);
  });

  it('aceita creative_pipeline com transform completo', () => {
    const r = ProposedRuleSchema.safeParse({
      ...baseBehavior,
      rule_type: 'creative_pipeline',
      name: 'Logo no canto',
      description: 'Use sempre essa logo',
      transform: {
        transform_type: 'logo_overlay',
        params: { position: 'top-right', padding_pct: 5, max_size_pct: 15 },
      },
    });
    expect(r.success).toBe(true);
  });

  it('rejeita description acima de 1000 chars', () => {
    const r = ProposedRuleSchema.safeParse({ ...baseBehavior, description: 'a'.repeat(1001) });
    expect(r.success).toBe(false);
  });

  it('rejeita reasoning acima de 200 chars', () => {
    const r = ProposedRuleSchema.safeParse({ ...baseBehavior, reasoning: 'a'.repeat(201) });
    expect(r.success).toBe(false);
  });
});
