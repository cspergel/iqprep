import { describe, expect, it } from 'vitest';
import { expectedAnswer, generate, score, spanDifficulty, spanForDifficulty } from './index';

const req = (difficulty: number, seed: number, variant?: string) => ({ difficulty, seed, age: 7, mode: 'practice' as const, variant });

describe('Digit Span generator', () => {
  it('is deterministic for a given seed', () => {
    expect(generate(req(7, 42, 'forward')).payload).toEqual(generate(req(7, 42, 'forward')).payload);
    expect(generate(req(7, 42, 'forward')).payload.digits).not.toEqual(generate(req(7, 43, 'forward')).payload.digits);
  });

  it('honours the requested variant', () => {
    for (const v of ['forward', 'backward', 'sequencing']) expect(generate(req(8, 1, v)).payload.task).toBe(v);
  });

  it('lengthens spans as difficulty rises and reports the true difficulty of what it built', () => {
    const lengths = [4, 7, 10, 13, 16].map((d) => generate(req(d, 9, 'forward')).payload.digits.length);
    for (let i = 1; i < lengths.length; i++) expect(lengths[i]).toBeGreaterThan(lengths[i - 1]);
    const item = generate(req(9.4, 3, 'backward'));
    expect(item.difficulty).toBe(spanDifficulty('backward', item.payload.digits.length));
  });

  it('inverts the span curve and clamps to the allowed range', () => {
    expect(spanForDifficulty('forward', spanDifficulty('forward', 6))).toBe(6);
    expect(spanForDifficulty('forward', -50)).toBe(2);
    expect(spanForDifficulty('backward', 100)).toBe(8);
  });

  it('never produces 3-in-a-row runs and never pre-sorted sequencing lists', () => {
    for (let seed = 0; seed < 300; seed++) {
      const it = generate(req(10, seed));
      const d = it.payload.digits;
      for (let i = 2; i < d.length; i++) {
        const a = d[i - 1] - d[i - 2];
        expect(Math.abs(a) === 1 && a === d[i] - d[i - 1]).toBe(false);
      }
      if (it.payload.task === 'sequencing') expect(d.join()).not.toBe(d.slice().sort((x, y) => x - y).join());
      expect(d.every((x) => x >= 1 && x <= 9)).toBe(true);
    }
  });
});

describe('Digit Span scoring', () => {
  const back = { ...generate(req(7, 5, 'backward')), payload: { task: 'backward' as const, digits: [3, 8, 5] } };
  const seq = { ...generate(req(7, 5, 'sequencing')), payload: { task: 'sequencing' as const, digits: [6, 2, 6, 1] } };

  it('computes expected answers per task', () => {
    expect(expectedAnswer(back.payload)).toEqual([5, 8, 3]);
    expect(expectedAnswer(seq.payload)).toEqual([1, 2, 6, 6]);
  });

  it('credits only the exact answer', () => {
    expect(score(back, [5, 8, 3]).correct).toBe(true);
    expect(score(back, [5, 8, 3]).points).toBe(1);
    expect(score(back, [5, 8]).correct).toBe(false);
    expect(score(back, [5, 8, 3, 1]).correct).toBe(false);
    expect(score(seq, [1, 2, 6]).correct).toBe(false); // dropped the repeated 6
    expect(score(seq, [1, 2, 6, 6]).correct).toBe(true);
  });

  it('explains the forward-instead-of-backward mistake', () => {
    const out = score(back, [3, 8, 5]);
    expect(out.correct).toBe(false);
    expect(out.feedback).toMatch(/forward order/);
  });

  it('scores a timeout as zero and records span', () => {
    expect(score(back, null)).toEqual({ points: 0, correct: false, meta: { span: 3 } });
  });
});
