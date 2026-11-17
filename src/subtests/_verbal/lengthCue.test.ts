/**
 * Test-wiseness guard: the best answer must not be given away by its length.
 * If the best choice were usually the longest, a child could score well just by picking the
 * longest answer. These checks run over the banks directly.
 */
import { describe, expect, it } from 'vitest';
import { CO_BANK } from '../CO/bank';
import { IN_BANK } from '../IN/bank';
import { SI_BANK } from '../SI/bank';
import { VC_BANK } from '../VC/bank';
import type { VerbalBankItem } from './types';

interface BankEntry {
  name: string;
  bank: readonly VerbalBankItem[];
  /** Points of the best choice (2 for SI/VC/CO, 1 for IN). */
  max: 1 | 2;
}

/** Banks checked for the "best is the longest" cue. */
const BANKS: BankEntry[] = [
  { name: 'SI', bank: SI_BANK, max: 2 },
  { name: 'IN', bank: IN_BANK, max: 1 },
  { name: 'CO', bank: CO_BANK, max: 2 },
  { name: 'VC', bank: VC_BANK, max: 2 },
];

/** Banks that are also checked for the reverse cue (best never longest / never shortest). */
const BALANCED = ['SI', 'IN', 'CO', 'VC'];

function lengthRates(bank: readonly VerbalBankItem[], max: 1 | 2) {
  let longest = 0;
  let shortest = 0;
  for (const b of bank) {
    const best = b.choices.find((c) => c.points === max)!;
    const others = b.choices.filter((c) => c !== best).map((c) => c.text.length);
    // Ties count as "longest" (conservative); "shortest" must be strictly shorter than every other choice.
    if (best.text.length >= Math.max(...others)) longest++;
    if (best.text.length < Math.min(...others)) shortest++;
  }
  return { longest: longest / bank.length, shortest: shortest / bank.length };
}

describe('length cue', () => {
  it('computes rates from the real choices (sanity check on a hand-made bank)', () => {
    const mk = (best: string, rest: string[]): VerbalBankItem => ({
      id: 'X:x', difficulty: 5, prompt: 'p', explanation: 'e', skill: 's', rubric: { two: [], one: [], zero: [] },
      choices: [{ text: best, points: 2, why: 'w' }, ...rest.map((t) => ({ text: t, points: 0 as const, why: 'w' }))],
    });
    const r = lengthRates([mk('a long best answer', ['b', 'c', 'd']), mk('x', ['yy', 'zz', 'ww']), mk('mid', ['m', 'longer one', 'z'])], 2);
    expect(r.longest).toBeCloseTo(1 / 3);
    expect(r.shortest).toBeCloseTo(1 / 3);
  });

  for (const { name, bank, max } of BANKS) {
    it(`${name}: the best answer is the longest choice in at most 40% of items`, () => {
      expect(lengthRates(bank, max).longest).toBeLessThanOrEqual(0.4);
    });
  }

  for (const { name, bank, max } of BANKS.filter((b) => BALANCED.includes(b.name))) {
    it(`${name}: the best answer is sometimes the shortest and sometimes the longest (no reverse cue)`, () => {
      const r = lengthRates(bank, max);
      expect(r.shortest).toBeGreaterThanOrEqual(0.15);
      expect(r.longest).toBeGreaterThanOrEqual(0.1);
    });
  }
});
