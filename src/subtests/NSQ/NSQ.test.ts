import { describe, expect, it } from 'vitest';
import { scaledFromSpeeded } from '../../core/scoring';
import { NAMING_LIMIT, type NamingResponse } from '../NSL/naming';
import { NSQ_ITEMS, generate, nsqMax, score } from './index';

const req = (age: number, seed: number) => ({ difficulty: 1, seed, age, mode: 'practice' as const });
const keys = (cells: { n: number }[]) => cells.map((c) => String(c.n));

describe('Quick Count generator', () => {
  it('uses 1–4 squares for the youngest and 1–5 from age 7', () => {
    expect(nsqMax(6.9)).toBe(4);
    expect(nsqMax(7)).toBe(5);
    expect(Math.max(...generate(req(6, 2)).payload.trials.flat().map((c) => c.n))).toBe(4);
    expect(Math.max(...generate(req(9, 2)).payload.trials.flat().map((c) => c.n))).toBe(5);
  });

  it('two short trials: exactly n squares in distinct slots, balanced and without back-to-back repeats', () => {
    for (let seed = 0; seed < 150; seed++) {
      const it = generate(req(seed % 2 ? 6 : 10, seed));
      expect(it.payload.trials).toHaveLength(2);
      expect(keys(it.payload.trials[0])).not.toEqual(keys(it.payload.trials[1]));
      expect(it.maxPoints).toBe(2 * NSQ_ITEMS);
      expect(it.timeLimitSec).toBe(2 * NAMING_LIMIT);
      for (const sheet of it.payload.trials) {
        expect(sheet).toHaveLength(NSQ_ITEMS);
        const counts = new Map<number, number>();
        sheet.forEach((c, i) => {
          expect(c.n).toBeGreaterThanOrEqual(1);
          expect(c.n).toBeLessThanOrEqual(it.payload.maxN);
          expect(c.slots).toHaveLength(c.n);
          expect(new Set(c.slots).size).toBe(c.n);
          expect(c.slots.every((s) => s >= 0 && s <= 8)).toBe(true);
          if (i > 0) expect(c.n).not.toBe(sheet[i - 1].n);
          counts.set(c.n, (counts.get(c.n) ?? 0) + 1);
        });
        expect(Math.max(...counts.values()) - Math.min(...counts.values())).toBeLessThanOrEqual(1);
      }
      expect(it.skills).toEqual(['nsq:subitize']);
    }
    expect(NSQ_ITEMS).toBe(20);
  });

  it('the sample page has 6 boxes showing every amount', () => {
    for (let seed = 0; seed < 100; seed++) {
      const it = generate(req(seed % 2 ? 6 : 10, seed));
      const s = it.payload.practice;
      expect(s).toHaveLength(6);
      expect(new Set(s.map((c) => c.n))).toEqual(new Set(Array.from({ length: it.payload.maxN }, (_, i) => i + 1)));
      for (const c of s) expect(c.slots).toHaveLength(c.n);
    }
  });

  it('is deterministic and sets difficulty to age', () => {
    expect(generate(req(7, 5))).toEqual(generate(req(7, 5)));
    expect(generate(req(7, 5)).payload.trials).not.toEqual(generate(req(7, 6)).payload.trials);
    expect(generate(req(7.4, 5)).difficulty).toBe(7.4);
  });
});

describe('Quick Count scoring', () => {
  const item = generate(req(8, 12));
  const [r1, r2] = item.payload.trials.map(keys);

  it('tap mode compares each tap with the true count, summing both trials', () => {
    const ans = r2.slice(0, 15);
    ans[4] = ans[4] === '1' ? '2' : '1';
    const out = score(item, { mode: 'tap', trials: [{ answers: r1, elapsedSec: 30 }, { answers: ans, elapsedSec: 30 }] });
    expect(out.meta).toMatchObject({ correct: 34, errors: 1, attempted: 35, durationSec: 60, ratePerMin: 34, trial1Correct: 20, trial2Correct: 14 });
    expect(out.points).toBe(34);
    // Trial 2 is checked against its own sheet, not trial 1's.
    const swapped = score(item, { mode: 'tap', trials: [{ answers: [], elapsedSec: 1 }, { answers: r1, elapsedSec: 30 }] });
    expect(swapped.points).toBe(r1.filter((k, i) => k === r2[i]).length);
  });

  it('grown-up mode counts named boxes minus marked slips over both trials', () => {
    const r: NamingResponse = { mode: 'adult', trials: [{ reached: 20, wrong: [0, 19], elapsedSec: 24 }, { reached: 20, wrong: [], elapsedSec: 24 }] };
    expect(score(item, r).meta).toMatchObject({ correct: 38, errors: 2, mode: 1, durationSec: 48, ratePerMin: 48 });
  });

  it('null scores zero', () => {
    expect(score(item, null)).toMatchObject({ points: 0, correct: false });
  });

  it('lines up with the per-minute NSQ norms', () => {
    // 52 per minute is typical at 10: 40 right in 46.2 s over two trials.
    const it10 = generate(req(10, 1));
    const [a, b] = it10.payload.trials.map(keys);
    const out = score(it10, { mode: 'tap', trials: [{ answers: a, elapsedSec: 23.1 }, { answers: b, elapsedSec: 23.1 }] });
    expect(out.meta?.ratePerMin).toBe(52);
    expect(scaledFromSpeeded('NSQ', out.points, 10, out.meta!.durationSec)).toBe(10);
  });
});
