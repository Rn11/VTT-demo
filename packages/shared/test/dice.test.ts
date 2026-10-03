import { describe, expect, it } from 'vitest';
import {
  DiceError,
  describeRoll,
  fieldRollExpression,
  getTemplate,
  parseDice,
  rollDice,
  type Rng,
} from '../src';

/** Liefert der Reihe nach die angegebenen Werte. */
const seq = (...values: number[]): Rng => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

describe('parseDice', () => {
  it('versteht einfache Ausdrücke', () => {
    expect(parseDice('2d6+3')).toEqual([
      { type: 'dice', sign: 1, count: 2, sides: 6, keep: null },
      { type: 'number', sign: 1, value: 3 },
    ]);
  });

  it('versteht deutsche Schreibweise, Großbuchstaben und Leerzeichen', () => {
    expect(parseDice(' 2W6 + 1 ')).toEqual(parseDice('2d6+1'));
    expect(parseDice('W20')).toEqual([{ type: 'dice', sign: 1, count: 1, sides: 20, keep: null }]);
  });

  it('versteht Prozentwürfel', () => {
    expect(parseDice('d%')).toEqual(parseDice('d100'));
  });

  it('versteht Behalten-Regeln', () => {
    expect(parseDice('4d6kh3')[0]).toMatchObject({ keep: { mode: 'high', count: 3 } });
    expect(parseDice('2d20kl1')[0]).toMatchObject({ keep: { mode: 'low', count: 1 } });
    expect(parseDice('2d20k1')[0]).toMatchObject({ keep: { mode: 'high', count: 1 } });
  });

  it('versteht mehrere Terme und Minus', () => {
    expect(parseDice('d8+d6-1')).toHaveLength(3);
    expect(parseDice('d20+-2')).toEqual(parseDice('d20-2'));
    expect(parseDice('-1+d4')[0]).toEqual({ type: 'number', sign: -1, value: 1 });
  });

  it.each([
    '',
    'abc',
    '2d',
    'd1',
    'd1001',
    '101d6',
    '2d6+',
    '3d6kh4',
    '2d6kh0',
    'd6*2',
    '60d6+60d6',
    '1d6;rm',
  ])('lehnt "%s" ab', (expr) => {
    expect(() => parseDice(expr)).toThrow(DiceError);
  });
});

describe('rollDice', () => {
  it('rechnet Summe mit Modifikator', () => {
    const r = rollDice('2d6+3', seq(4, 2));
    expect(r.total).toBe(9);
    expect(describeRoll(r)).toBe('2d6+3 → [4, 2] + 3 = 9');
  });

  it('behält die höchsten Würfel', () => {
    const r = rollDice('4d6kh3', seq(1, 5, 3, 6));
    expect(r.total).toBe(14);
    const t = r.terms[0]!;
    expect(t.type === 'dice' && t.rolls.map((d) => d.kept)).toEqual([false, true, true, true]);
  });

  it('behält bei Gleichstand den ersten Würfel', () => {
    const r = rollDice('2d20kl1', seq(7, 7));
    const t = r.terms[0]!;
    expect(t.type === 'dice' && t.rolls.map((d) => d.kept)).toEqual([true, false]);
    expect(r.total).toBe(7);
  });

  it('zieht Terme ab', () => {
    expect(rollDice('d20-2', seq(10)).total).toBe(8);
    expect(rollDice('d8-d6', seq(5, 2)).total).toBe(3);
  });

  it('bleibt mit echtem Zufall im gültigen Bereich', () => {
    const rng: Rng = (s) => 1 + Math.floor(Math.random() * s);
    for (let i = 0; i < 500; i++) {
      const t = rollDice('3d6', rng).total;
      expect(t).toBeGreaterThanOrEqual(3);
      expect(t).toBeLessThanOrEqual(18);
    }
  });
});

describe('fieldRollExpression', () => {
  it('setzt Werte ein und normalisiert Vorzeichen', () => {
    const field = getTemplate('morkborg').sections[1]!.fields[0]!;
    expect(fieldRollExpression(field, -2)).toBe('d20-2');
    expect(fieldRollExpression(field, 3)).toBe('d20+3');
    expect(fieldRollExpression(field, 'quatsch')).toBe('d20+0');
  });

  it('nutzt feste Ausdrücke ohne Platzhalter', () => {
    const field = getTemplate('coc7').sections[1]!.fields[0]!;
    expect(fieldRollExpression(field, 50)).toBe('d100');
    expect(field.under).toBe(true);
  });
});
