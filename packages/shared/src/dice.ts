/**
 * Würfel-Parser für Ausdrücke wie `2d6+3`, `W20`, `d100`, `d%`, `4d6kh3`, `2d20kl1`, `d8+d6-1`.
 * "w" wird wie "d" behandelt (deutsche Schreibweise).
 */

export const MAX_DICE = 100;
export const MAX_SIDES = 1000;
export const MAX_TERMS = 20;

export type Keep = { mode: 'high' | 'low'; count: number } | null;

export type Term =
  | { type: 'dice'; sign: 1 | -1; count: number; sides: number; keep: Keep }
  | { type: 'number'; sign: 1 | -1; value: number };

export interface RolledDie {
  value: number;
  kept: boolean;
}

export type RolledTerm =
  | {
      type: 'dice';
      sign: 1 | -1;
      count: number;
      sides: number;
      keep: Keep;
      rolls: RolledDie[];
      subtotal: number;
    }
  | { type: 'number'; sign: 1 | -1; value: number };

export interface RollResult {
  expression: string;
  terms: RolledTerm[];
  total: number;
}

export class DiceError extends Error {}

/** Zufallsfunktion: liefert eine Ganzzahl in [1, sides]. */
export type Rng = (sides: number) => number;

const TERM_RE = /^(\d*)[dw](\d+|%)(?:(kh|kl|k)(\d+))?$/;

export function normalizeExpression(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/\+-/g, '-')
    .replace(/-\+/g, '-')
    .replace(/--/g, '+')
    .replace(/\+\+/g, '+');
}

export function parseDice(input: string): Term[] {
  const expr = normalizeExpression(input);
  if (!expr) throw new DiceError('Leerer Ausdruck');
  if (!/^[0-9dwkhl%+-]+$/.test(expr)) throw new DiceError('Ungültige Zeichen im Ausdruck');

  const parts = expr.match(/[+-]?[^+-]+/g);
  if (!parts || parts.join('') !== expr) throw new DiceError('Ungültiger Ausdruck');
  if (parts.length > MAX_TERMS) throw new DiceError(`Höchstens ${MAX_TERMS} Teile`);

  let diceTotal = 0;
  const terms = parts.map((raw): Term => {
    let sign: 1 | -1 = 1;
    let body = raw;
    if (body.startsWith('+')) body = body.slice(1);
    else if (body.startsWith('-')) {
      sign = -1;
      body = body.slice(1);
    }
    if (/^\d+$/.test(body)) {
      const value = Number(body);
      if (value > 1_000_000) throw new DiceError('Zahl zu groß');
      return { type: 'number', sign, value };
    }
    const m = TERM_RE.exec(body);
    if (!m) throw new DiceError(`Unbekannter Teil: ${raw}`);
    const count = m[1] ? Number(m[1]) : 1;
    const sides = m[2] === '%' ? 100 : Number(m[2]);
    if (count < 1 || count > MAX_DICE) throw new DiceError(`Anzahl der Würfel: 1 bis ${MAX_DICE}`);
    if (sides < 2 || sides > MAX_SIDES) throw new DiceError(`Seitenzahl: 2 bis ${MAX_SIDES}`);
    diceTotal += count;
    if (diceTotal > MAX_DICE) throw new DiceError(`Höchstens ${MAX_DICE} Würfel insgesamt`);
    let keep: Keep = null;
    if (m[3]) {
      const n = Number(m[4]);
      if (n < 1 || n > count)
        throw new DiceError('Behalten-Anzahl muss zwischen 1 und der Würfelanzahl liegen');
      keep = { mode: m[3] === 'kl' ? 'low' : 'high', count: n };
    }
    return { type: 'dice', sign, count, sides, keep };
  });
  return terms;
}

export function rollDice(input: string, rng: Rng): RollResult {
  const terms = parseDice(input);
  let total = 0;
  const rolled = terms.map((t): RolledTerm => {
    if (t.type === 'number') {
      total += t.sign * t.value;
      return t;
    }
    const values = Array.from({ length: t.count }, () => rng(t.sides));
    const keptIdx = new Set<number>();
    if (t.keep) {
      const order = values
        .map((v, i) => ({ v, i }))
        .sort((a, b) => (t.keep!.mode === 'high' ? b.v - a.v : a.v - b.v) || a.i - b.i);
      order.slice(0, t.keep.count).forEach((o) => keptIdx.add(o.i));
    } else {
      values.forEach((_, i) => keptIdx.add(i));
    }
    const rolls = values.map((value, i) => ({ value, kept: keptIdx.has(i) }));
    const subtotal = rolls.reduce((s, r) => s + (r.kept ? r.value : 0), 0);
    total += t.sign * subtotal;
    return { ...t, rolls, subtotal };
  });
  return { expression: normalizeExpression(input), terms: rolled, total };
}

/** Kurze, lesbare Beschreibung, z. B. "2d6+3 → [4, 2] + 3 = 9". */
export function describeRoll(r: RollResult): string {
  const parts = r.terms.map((t, i) => {
    const sign = t.sign === -1 ? '- ' : i === 0 ? '' : '+ ';
    if (t.type === 'number') return `${sign}${t.value}`;
    const dice = t.rolls.map((d) => (d.kept ? `${d.value}` : `~${d.value}~`)).join(', ');
    return `${sign}[${dice}]`;
  });
  return `${r.expression} → ${parts.join(' ')} = ${r.total}`;
}
