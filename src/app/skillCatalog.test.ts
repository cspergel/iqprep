import { describe, expect, it } from 'vitest';
import DigitSpan from '../subtests/DS';
import { emptyData, type ProfileData } from '../core/storage';
import type { ItemResult } from '../core/types';
import { focusSelection, questionTypes } from './skillCatalog';

describe('questionTypes', () => {
  it('discovers Digit Span tasks (and hides span-length tags)', () => {
    const skills = questionTypes(DigitSpan).map((q) => q.skill).sort();
    expect(skills).toEqual(['ds:backward', 'ds:forward', 'ds:sequencing']);
  });
});

let k = 0;
const r = (skill: string, correct: boolean, subtest: ItemResult['subtest'] = 'FW'): ItemResult => ({
  itemId: `${subtest}:${++k}`, subtest, difficulty: 7, seed: k, points: correct ? 1 : 0, maxPoints: 1, correct, timeMs: 1000,
  overTime: false, hintsUsed: 0, attempts: 1, skills: [skill], mode: 'practice', at: k,
});

describe('focusSelection', () => {
  const data: ProfileData = {
    ...emptyData('p'),
    sessions: [{
      id: 's', kind: 'practice', title: '', mode: 'practice', startedAt: 0, age: 7, subtests: ['FW', 'MR'], completed: true,
      results: [
        r('fw:substitution', false), r('fw:substitution', false), r('fw:substitution', true),
        r('fw:direct', true), r('fw:direct', true), r('fw:direct', true), r('fw:direct', true), r('fw:direct', true),
        r('mr:analogy', false, 'MR'), r('mr:analogy', true, 'MR'),
      ],
    }],
  };

  it('picks the weakest skills, weakest first, and skips mastered-looking ones', () => {
    const sel = focusSelection(data, ['FW', 'MR']);
    expect(sel.FW).toEqual(['fw:substitution']);
    expect(sel.MR).toEqual(['mr:analogy']);
  });

  it('respects disabled games', () => {
    expect(focusSelection(data, ['FW']).MR).toBeUndefined();
  });
});
