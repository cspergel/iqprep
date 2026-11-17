import { describe, expect, it } from 'vitest';
import { scaledFromSpeeded } from '../../core/scoring';
import {
  NSL_CHARS, NSL_COLORS, NSL_OBJECTS, NSL_SCO_COLORS, NSL_SHEET, NSL_SIZES, cellKey, formatCells, generate, nslFormat,
  nslFormats, nslGroups, score, type NslCell, type NslFormat,
} from './index';
import { NAMING_LIMIT, namingRate, type NamingResponse } from './naming';

const req = (age: number, seed: number, variant?: string) => ({ difficulty: 1, seed, age, mode: 'practice' as const, variant });
const allCells = (it: ReturnType<typeof generate>) => it.payload.trials.flat();
const keysOf = (cells: NslCell[]) => cells.map(cellKey);

/** Which format a generated sheet really is, worked out from its cells (not from payload.format). */
function sheetKind(cells: NslCell[]): NslFormat | 'mixed' {
  const kinds = new Set(cells.map((c) => (c.char !== undefined ? 'letters-numbers' : c.size ? 'size-color-object' : 'color-object')));
  return kinds.size === 1 ? ([...kinds][0] as NslFormat) : 'mixed';
}

describe('Speedy Namer formats by age', () => {
  it('mirrors the real age structure', () => {
    expect(nslFormats(6)).toEqual(['color-object', 'size-color-object']);
    expect(nslFormats(6.9)).toEqual(['color-object', 'size-color-object']);
    expect(nslFormats(7)).toEqual(['size-color-object', 'letters-numbers']);
    expect(nslFormats(8.9)).toEqual(['size-color-object', 'letters-numbers']);
    expect(nslFormats(9)).toEqual(['letters-numbers']);
    expect(nslFormats(16)).toEqual(['letters-numbers']);
  });

  it('gives every format of the age band across items, and only those (both trials and the sample the same format)', () => {
    for (const age of [6, 6.5, 7, 7.5, 8, 8.5, 9, 12, 16]) {
      const seen = new Map<NslFormat, number>();
      for (let seed = 0; seed < 60; seed++) {
        const it = generate(req(age, seed * 7 + 3));
        const kind = sheetKind([...allCells(it), ...it.payload.practice]);
        expect(kind).toBe(it.payload.format);
        expect(it.skills).toEqual([`nsl:${kind}`]);
        seen.set(kind as NslFormat, (seen.get(kind as NslFormat) ?? 0) + 1);
      }
      expect([...seen.keys()].sort()).toEqual(nslFormats(age).slice().sort());
      for (const n of seen.values()) expect(n).toBeGreaterThanOrEqual(20); // roughly half each
    }
  });

  it('a known format id as variant forces the format', () => {
    for (const f of ['color-object', 'size-color-object', 'letters-numbers'] as NslFormat[]) {
      expect(sheetKind(allCells(generate(req(10, 5, f))))).toBe(f);
      expect(nslFormat(6, 4, f)).toBe(f);
    }
    expect(nslFormat(12, 4, 'nonsense')).toBe('letters-numbers');
  });
});

describe('Speedy Namer colours', () => {
  it('never uses green: only red, blue and yellow, in every colour set and on every sheet', () => {
    expect([...NSL_COLORS].sort()).toEqual(['blue', 'red', 'yellow']);
    expect([...NSL_SCO_COLORS].sort()).toEqual(['blue', 'red', 'yellow']);
    for (const f of ['color-object', 'size-color-object'] as NslFormat[]) {
      expect(formatCells(f).some((c) => c.color === ('green' as never))).toBe(false);
      for (const g of nslGroups(f)) expect(g.map((o) => o.key)).not.toContain('green');
    }
    for (let seed = 0; seed < 100; seed++) {
      const it = generate(req(6, seed));
      for (const c of [...allCells(it), ...it.payload.practice]) {
        if (c.color !== undefined) expect(['red', 'blue', 'yellow']).toContain(c.color);
        expect(cellKey(c)).not.toMatch(/green/);
      }
    }
  });
});

describe('Speedy Namer sheets', () => {
  it('two trials of the same format, each a short sheet and each its own shuffle', () => {
    for (let seed = 0; seed < 60; seed++) {
      for (const f of ['color-object', 'size-color-object', 'letters-numbers'] as NslFormat[]) {
        const it = generate(req(8, seed, f));
        const { trials } = it.payload;
        expect(trials).toHaveLength(2);
        for (const t of trials) {
          expect(t).toHaveLength(NSL_SHEET[f].items);
          expect(sheetKind(t)).toBe(f);
        }
        expect(keysOf(trials[0])).not.toEqual(keysOf(trials[1]));
        expect(it.maxPoints).toBe(trials[0].length + trials[1].length);
        expect(it.timeLimitSec).toBe(2 * NAMING_LIMIT);
      }
    }
    // Short sheets: about 20 pictures, about 40 letters/numbers.
    expect(NSL_SHEET['color-object'].items).toBe(20);
    expect(NSL_SHEET['size-color-object'].items).toBe(20);
    expect(NSL_SHEET['letters-numbers'].items).toBe(40);
  });

  it('size–colour–object: two sizes, three colours, the small object set, named “big red cat”', () => {
    const it = generate(req(7.5, 2));
    expect(it.payload.format).toBe('size-color-object');
    expect(it.payload.cols).toBe(5);
    const cells = allCells(it);
    for (const k of keysOf(cells)) expect(k).toMatch(/^(big|little) (red|blue|yellow) (cat|ball|car|fish)$/);
    expect(new Set(cells.map((c) => c.size))).toEqual(new Set(NSL_SIZES));
    expect(new Set(cells.map((c) => c.color)).size).toBe(3);
    expect(new Set(cells.map((c) => c.object))).toEqual(new Set(NSL_OBJECTS));
  });

  it('colour–object: three colours × the objects, named “blue fish”', () => {
    const it = generate(req(6, 4));
    expect(it.payload.format).toBe('color-object');
    for (const t of it.payload.trials) {
      for (const c of t) {
        expect(c.size).toBeUndefined();
        expect(cellKey(c)).toMatch(/^(red|blue|yellow) (cat|ball|car|fish)$/);
      }
      expect(new Set(t.map((c) => c.color))).toEqual(new Set(NSL_COLORS));
    }
  });

  it('letters–numbers mixes letters with digits', () => {
    const keys = keysOf(allCells(generate(req(10, 4))));
    expect(keys.some((k) => /[A-Z]/.test(k))).toBe(true);
    expect(keys.some((k) => /[0-9]/.test(k))).toBe(true);
    expect(keys.every((k) => (NSL_CHARS as readonly string[]).includes(k))).toBe(true);
  });

  it('every picture of a format has its own name, reachable by one tap per word', () => {
    for (const f of ['color-object', 'size-color-object', 'letters-numbers'] as NslFormat[]) {
      const cells = formatCells(f);
      const keys = keysOf(cells);
      expect(new Set(keys).size).toBe(keys.length);
      // The tap pad builds an answer by joining one pick per group: every combination must be a real name.
      const combos = nslGroups(f).reduce<string[]>((acc, g) => acc.flatMap((a) => g.map((o) => (a ? `${a} ${o.key}` : o.key))), ['']);
      expect(new Set(combos)).toEqual(new Set(keys));
    }
  });

  it('the sample page has 6 different pictures; size samples show big and little, letter samples show both kinds', () => {
    for (let seed = 0; seed < 200; seed += 2) {
      const sco = generate(req(7, seed, 'size-color-object')).payload.practice;
      expect(sco).toHaveLength(6);
      expect(new Set(sco.map((c) => c.size)).size).toBe(2);
      expect(new Set(keysOf(sco)).size).toBe(6);
      const ln = keysOf(generate(req(10, seed, 'letters-numbers')).payload.practice);
      expect(ln).toHaveLength(6);
      expect(new Set(ln).size).toBe(6);
      expect(ln.filter((k) => /[A-Z]/.test(k))).toHaveLength(3);
      expect(generate(req(6, seed, 'color-object')).payload.practice).toHaveLength(6);
    }
  });

  it('is deterministic, never repeats an item back to back, and sets difficulty to age', () => {
    for (let seed = 0; seed < 100; seed++) {
      for (const age of [6, 7.5, 12]) {
        const it = generate(req(age, seed));
        expect(it).toEqual(generate(req(age, seed)));
        for (const t of it.payload.trials) {
          const keys = keysOf(t);
          for (let i = 1; i < keys.length; i++) expect(keys[i]).not.toBe(keys[i - 1]);
        }
        expect(it.difficulty).toBe(age);
      }
    }
  });
});

describe('Speedy Namer scoring', () => {
  const item = generate(req(9, 77)); // letters–numbers, 2 × 40
  const [k1, k2] = item.payload.trials.map(keysOf);
  const tap = (trials: { answers: string[]; elapsedSec: number }[]): NamingResponse => ({ mode: 'tap', trials });

  it('tap mode: points and time are summed over the two trials', () => {
    const out = score(item, tap([{ answers: k1, elapsedSec: 30 }, { answers: k2, elapsedSec: 30 }]));
    expect(out.points).toBe(80);
    expect(out.meta).toMatchObject({ correct: 80, errors: 0, durationSec: 60, mode: 0, ratePerMin: 80, trials: 2, trial1Correct: 40, trial2Correct: 40 });
    const ans = k2.slice();
    ans[0] = ans[1];
    ans[5] = 'zzz';
    const out2 = score(item, tap([{ answers: k1.slice(0, 30), elapsedSec: 25 }, { answers: ans, elapsedSec: 41.5 }]));
    expect(out2.points).toBe(30 + 38);
    expect(out2.meta).toMatchObject({ correct: 68, errors: 2, attempted: 70, durationSec: 66.5, trial1Correct: 30, trial2Correct: 38, trial1Sec: 25, trial2Sec: 41.5 });
    // only one trial finished: still counts that one
    expect(score(item, tap([{ answers: k1, elapsedSec: 40 }])).meta).toMatchObject({ correct: 40, durationSec: 40, trials: 1 });
  });

  it('each trial is scored against its own sheet', () => {
    // Trial 2 answered with trial 1's keys: only positions where the sheets agree are right.
    const agree = k1.filter((k, i) => k === k2[i]).length;
    expect(agree).toBeLessThan(40);
    expect(score(item, tap([{ answers: [], elapsedSec: 1 }, { answers: k1, elapsedSec: 30 }])).points).toBe(agree);
  });

  it('size–colour–object: errors are counted per wrong word (size / colour / picture)', () => {
    const sco = generate(req(7, 10, 'size-color-object'));
    const [a, b] = sco.payload.trials.map(keysOf);
    const flip = (k: string, at: number, opts: readonly string[]) => {
      const w = k.split(' ');
      w[at] = opts.find((o) => o !== w[at])!;
      return w.join(' ');
    };
    const t1 = a.slice(0, 10);
    t1[3] = flip(t1[3], 0, NSL_SIZES); // size slip
    const t2 = b.slice(0, 12);
    t2[0] = flip(t2[0], 1, NSL_SCO_COLORS); // colour slip
    t2[4] = flip(flip(t2[4], 1, NSL_SCO_COLORS), 2, NSL_OBJECTS); // colour + picture in one name
    const out = score(sco, tap([{ answers: t1, elapsedSec: 20 }, { answers: t2, elapsedSec: 22 }]));
    expect(out.points).toBe(9 + 10);
    expect(out.meta).toMatchObject({ correct: 19, errors: 3, durationSec: 42, attempted: 22, sizeErrors: 1, colorErrors: 2, objectErrors: 1 });
  });

  it('colour–object reports colour and picture slips only; letters–numbers none', () => {
    const co = generate(req(6, 3, 'color-object'));
    const out = score(co, tap([{ answers: [], elapsedSec: 5 }, { answers: [], elapsedSec: 5 }]));
    expect(out.meta).toHaveProperty('colorErrors', 0);
    expect(out.meta).toHaveProperty('objectErrors', 0);
    expect(out.meta).not.toHaveProperty('sizeErrors');
    expect(score(item, tap([{ answers: ['zzz'], elapsedSec: 5 }])).meta).not.toHaveProperty('colorErrors');
  });

  it('grown-up mode: named minus marked-wrong on each trial, attribute slips unknown (0)', () => {
    const sco = generate(req(7, 10, 'size-color-object'));
    const out = score(sco, { mode: 'adult', trials: [{ reached: 20, wrong: [1, 5, 5], elapsedSec: 30 }, { reached: 15, wrong: [3, 17], elapsedSec: 60 }] });
    expect(out.points).toBe(18 + 14);
    expect(out.meta).toMatchObject({ correct: 32, errors: 3, attempted: 35, durationSec: 90, mode: 1, ratePerMin: 21, sizeErrors: 0, colorErrors: 0, objectErrors: 0 });
    expect(score(item, { mode: 'adult', trials: [{ reached: 400, wrong: [], elapsedSec: 50 }, { reached: 40, wrong: [], elapsedSec: 50 }] }).meta?.correct).toBe(80);
  });

  it('protects the rate from an impossibly fast stop', () => {
    const out = score(item, { mode: 'adult', trials: [{ reached: 40, wrong: [], elapsedSec: 0.5 }, { reached: 40, wrong: [], elapsedSec: 0.5 }] });
    expect(out.meta?.durationSec).toBe(20); // 40 × 0.25 s per trial
    expect(out.meta?.ratePerMin).toBe(150); // 240 per minute is capped
  });

  it('null, unknown mode or no trials scores zero', () => {
    expect(score(item, null).points).toBe(0);
    expect(score(item, null).meta?.durationSec).toBe(2 * NAMING_LIMIT);
    expect(score(item, { mode: 'x' as never, trials: [{ answers: k1, elapsedSec: 10 }] }).points).toBe(0);
    expect(score(item, { mode: 'tap', trials: [] }).points).toBe(0);
  });

  it('points + total durationSec line up with the per-minute NSL norms', () => {
    // 46 correct per minute is typical at age 7: here 80 named right in 104.4 s over two trials.
    const it7 = generate(req(7, 3, 'letters-numbers'));
    const [a, b] = it7.payload.trials.map(keysOf);
    const out = score(it7, tap([{ answers: a, elapsedSec: 52.2 }, { answers: b, elapsedSec: 52.2 }]));
    expect(out.meta?.ratePerMin).toBe(46);
    expect(scaledFromSpeeded('NSL', out.points, 7, out.meta!.durationSec)).toBe(10);
    expect(namingRate(0, 30)).toBe(0);
    expect(namingRate(10, 0)).toBe(0);
  });
});
