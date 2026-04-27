// Unit test do helper suggestVertical (heuristica de nicho regulado).
// Spec: briefing-onboarding (task 10.1, R5.4)

import { describe, expect, it } from 'vitest';
import { suggestVertical } from '@/hooks/use-briefing-prohibitions';

describe('suggestVertical', () => {
  it('detecta vertical de saude', () => {
    expect(suggestVertical('Clinica de fisioterapia')).toBe('health');
    expect(suggestVertical('Nutricionista esportiva')).toBe('health');
    expect(suggestVertical('Dentista de Sao Paulo')).toBe('health');
  });

  it('detecta vertical financeira', () => {
    expect(suggestVertical('Curso de investimentos')).toBe('finance');
    expect(suggestVertical('Trading em forex')).toBe('finance');
  });

  it('detecta emagrecimento', () => {
    expect(suggestVertical('Programa de emagrecimento')).toBe('weight_loss');
    expect(suggestVertical('Estetica e fitness')).toBe('weight_loss');
  });

  it('detecta infoproduto', () => {
    expect(suggestVertical('Curso digital de copywriting')).toBe('infoproduct');
    expect(suggestVertical('Mentoria para coaches')).toBe('infoproduct');
  });

  it('retorna null para nicho nao regulado', () => {
    expect(suggestVertical('Loja de roupas femininas')).toBeNull();
    expect(suggestVertical('Restaurante italiano')).toBeNull();
  });

  it('retorna null para input vazio', () => {
    expect(suggestVertical(null)).toBeNull();
    expect(suggestVertical('')).toBeNull();
  });
});
