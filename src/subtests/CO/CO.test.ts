import { describe, expect, it } from 'vitest';
import { req, verbalModuleSuite } from '../_verbal/moduleSuite';
import { CO_BANK } from './bank';
import Comprehension, { generate } from './index';

verbalModuleSuite({
  prefix: 'CO',
  module: Comprehension,
  bank: CO_BANK,
  maxPoints: 2,
  skills: ['co:safety', 'co:health', 'co:social', 'co:rules', 'co:civic'],
  minSize: 60,
  parentScorable: true,
});

describe('CO content', () => {
  it('asks either what to do or why, and every why-question explains its reason', () => {
    for (const b of CO_BANK) {
      expect(b.prompt).toMatch(/^(What should|What could|Why)\b/);
      expect(b.prompt.endsWith('?')).toBe(true);
    }
  });

  it('marks two-reason items and says so in the best-answer feedback', () => {
    const twos = CO_BANK.filter((b) => b.choices.find((c) => c.points === 2)!.why.includes('TWO'));
    expect(twos.length).toBeGreaterThanOrEqual(15);
    // Two-reason items are commoner among older items, as in real tests.
    const older = twos.filter((b) => b.difficulty >= 9).length;
    expect(older).toBeGreaterThan(twos.length / 2);
  });

  it('gives "why" hints and a two-reason scaffold for why-questions', () => {
    for (let seed = 0; seed < 30; seed++) {
      const it = generate(req(9, seed));
      if (/^Why/.test(it.payload.prompt)) {
        expect(it.payload.scaffold).toMatch(/also because/);
        expect(it.hints.join(' ')).toMatch(/TWO/);
      } else {
        expect(it.payload.scaffold).toMatch(/First I would/);
      }
    }
  });

  it('scores a one-reason answer as 1 point on a two-reason item', () => {
    const b = CO_BANK.find((x) => x.id === 'CO:keep-promises')!;
    const item = { ...generate(req(11, 1)), payload: { ...generate(req(11, 1)).payload, choices: b.choices } };
    expect(Comprehension.score(item, { choice: 'Because you said you would' }).points).toBe(1);
    expect(Comprehension.score(item, { choice: b.choices[0].text }).points).toBe(2);
  });
});
