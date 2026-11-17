import { describe, expect, it } from 'vitest';
import { req, verbalModuleSuite } from '../_verbal/moduleSuite';
import { IN_BANK } from './bank';
import Information, { generate } from './index';

const SKILLS = ['in:nature', 'in:body', 'in:science', 'in:time', 'in:numbers', 'in:geography', 'in:world', 'in:history'];

verbalModuleSuite({
  prefix: 'IN',
  module: Information,
  bank: IN_BANK,
  maxPoints: 1,
  skills: SKILLS,
  minSize: 140,
  parentScorable: false,
});

describe('IN content', () => {
  it('has exactly one correct answer and three wrong answers per question', () => {
    for (const b of IN_BANK) {
      expect(b.choices.filter((c) => c.points === 1)).toHaveLength(1);
      expect(b.choices.filter((c) => c.points === 0)).toHaveLength(3);
    }
  });

  it('is answerable from words alone (no picture needed)', () => {
    for (const b of IN_BANK) expect(b.picture).toBeUndefined();
  });

  it('covers every topic in the 5–10 range', () => {
    for (const s of SKILLS) {
      const n = IN_BANK.filter((b) => b.skill === s && b.difficulty >= 5 && b.difficulty <= 10).length;
      expect(n, s).toBeGreaterThanOrEqual(3);
    }
  });

  it('scores 1 for the right answer and stays multiple choice even if grown-up scoring is requested', () => {
    const item = generate(req(7, 4));
    expect(item.maxPoints).toBe(1);
    const right = item.payload.choices.find((c) => c.points === 1)!;
    expect(Information.score(item, { choice: right.text })).toMatchObject({ points: 1, correct: true });
    expect(item.payload.parentScorable).toBe(false);
  });
});
