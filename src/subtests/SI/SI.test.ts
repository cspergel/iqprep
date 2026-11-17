import { describe, expect, it } from 'vitest';
import { verbalModuleSuite, req } from '../_verbal/moduleSuite';
import { SI_BANK } from './bank';
import Similarities, { generate } from './index';

verbalModuleSuite({
  prefix: 'SI',
  module: Similarities,
  bank: SI_BANK,
  maxPoints: 2,
  skills: ['si:category', 'si:function', 'si:property', 'si:abstract'],
  minSize: 90,
  parentScorable: true,
});

describe('SI content', () => {
  it('asks "How are X and Y alike?" with no picture items', () => {
    for (const b of SI_BANK) {
      expect(b.prompt).toMatch(/^How are .+ and .+ alike\?$/);
      expect(b.picture).toBeUndefined();
    }
  });

  it('teaches the abstraction in every explanation and tags the scaffold', () => {
    for (const b of SI_BANK) expect(b.explanation).toMatch(/both/i);
    expect(generate(req(6, 1)).payload.scaffold).toMatch(/They are both/);
  });

  it('has more abstract items at the top of the scale than at the bottom', () => {
    const share = (lo: number, hi: number) => {
      const xs = SI_BANK.filter((b) => b.difficulty >= lo && b.difficulty < hi);
      return xs.filter((b) => b.skill === 'si:abstract').length / xs.length;
    };
    expect(share(12, 17)).toBeGreaterThan(share(4, 8));
  });
});
