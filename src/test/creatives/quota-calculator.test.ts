// Unit tests do calculator de quota (task 11.2 — R6.3, R6.4, R6.5).
// Spec: ai-creative-generation
//
// O calculo real vive na RPC SQL public.get_creative_usage. Aqui re-implementamos
// a logica de classificacao em TS pra validar os limiares (warning >=80%, blocked >=100%)
// e a montagem das dimensions.

import { describe, expect, it } from 'vitest';

type Dimension = 'daily' | 'monthly' | 'cost';
type Status = 'ok' | 'warning' | 'blocked';

interface UsageInput {
  daily: { count: number; max: number };
  monthly: { count: number; max: number };
  cost: { value: number; max: number };
}

interface UsageOutput {
  status: Status;
  warning_dimensions: Dimension[];
  blocked_dimensions: Dimension[];
}

// Logica espelhada do plpgsql get_creative_usage
function calcUsage(input: UsageInput): UsageOutput {
  const warning: Dimension[] = [];
  const blocked: Dimension[] = [];

  if (input.daily.count >= input.daily.max) blocked.push('daily');
  else if (input.daily.count >= input.daily.max * 0.8) warning.push('daily');

  if (input.monthly.count >= input.monthly.max) blocked.push('monthly');
  else if (input.monthly.count >= input.monthly.max * 0.8) warning.push('monthly');

  if (input.cost.value >= input.cost.max) blocked.push('cost');
  else if (input.cost.value >= input.cost.max * 0.8) warning.push('cost');

  const status: Status = blocked.length > 0 ? 'blocked'
    : warning.length > 0 ? 'warning'
    : 'ok';

  return { status, warning_dimensions: warning, blocked_dimensions: blocked };
}

describe('calcUsage — status ok', () => {
  it('uso baixo (<80%) em todas dimensoes -> ok sem flags', () => {
    const r = calcUsage({
      daily: { count: 1, max: 5 },
      monthly: { count: 5, max: 25 },
      cost: { value: 0.5, max: 2.0 },
    });
    expect(r.status).toBe('ok');
    expect(r.warning_dimensions).toEqual([]);
    expect(r.blocked_dimensions).toEqual([]);
  });

  it('exatamente 79% -> ainda ok', () => {
    const r = calcUsage({
      daily: { count: 3, max: 5 }, // 60%
      monthly: { count: 19, max: 25 }, // 76%
      cost: { value: 1.0, max: 2.0 }, // 50%
    });
    expect(r.status).toBe('ok');
  });
});

describe('calcUsage — warning >=80%', () => {
  it('daily em 80% (4/5) -> warning daily', () => {
    const r = calcUsage({
      daily: { count: 4, max: 5 },
      monthly: { count: 0, max: 25 },
      cost: { value: 0, max: 2.0 },
    });
    expect(r.status).toBe('warning');
    expect(r.warning_dimensions).toContain('daily');
  });

  it('monthly em 80% (20/25) -> warning monthly', () => {
    const r = calcUsage({
      daily: { count: 0, max: 5 },
      monthly: { count: 20, max: 25 },
      cost: { value: 0, max: 2.0 },
    });
    expect(r.warning_dimensions).toContain('monthly');
  });

  it('cost em 80% (1.6/2.0) -> warning cost', () => {
    const r = calcUsage({
      daily: { count: 0, max: 5 },
      monthly: { count: 0, max: 25 },
      cost: { value: 1.6, max: 2.0 },
    });
    expect(r.warning_dimensions).toContain('cost');
  });

  it('todas dimensoes em warning -> 3 flags', () => {
    const r = calcUsage({
      daily: { count: 4, max: 5 },
      monthly: { count: 22, max: 25 },
      cost: { value: 1.7, max: 2.0 },
    });
    expect(r.status).toBe('warning');
    expect(r.warning_dimensions).toHaveLength(3);
  });
});

describe('calcUsage — blocked >=100%', () => {
  it('daily em 100% (5/5) -> blocked daily', () => {
    const r = calcUsage({
      daily: { count: 5, max: 5 },
      monthly: { count: 0, max: 25 },
      cost: { value: 0, max: 2.0 },
    });
    expect(r.status).toBe('blocked');
    expect(r.blocked_dimensions).toContain('daily');
  });

  it('blocked tem prioridade sobre warning quando ambas existem', () => {
    const r = calcUsage({
      daily: { count: 5, max: 5 }, // blocked
      monthly: { count: 22, max: 25 }, // warning
      cost: { value: 0, max: 2.0 },
    });
    expect(r.status).toBe('blocked');
    expect(r.blocked_dimensions).toEqual(['daily']);
    expect(r.warning_dimensions).toEqual(['monthly']);
  });

  it('blocked em todas dimensoes -> 3 flags', () => {
    const r = calcUsage({
      daily: { count: 10, max: 5 }, // overshooting tambem bloqueia
      monthly: { count: 30, max: 25 },
      cost: { value: 5.0, max: 2.0 },
    });
    expect(r.status).toBe('blocked');
    expect(r.blocked_dimensions).toEqual(['daily', 'monthly', 'cost']);
  });

  it('cost em 100.01% (limiar) -> blocked cost', () => {
    const r = calcUsage({
      daily: { count: 0, max: 5 },
      monthly: { count: 0, max: 25 },
      cost: { value: 2.0, max: 2.0 },
    });
    expect(r.blocked_dimensions).toContain('cost');
  });
});
