import { describe, expect, it } from 'vitest';
import { PICS, TAGS, TAG_BY_ID, TAGS_OF, UNKNOWN_STRICT, strip } from './bank';
import { bandFor, generate, linkedCombos, score, sharedTags, togetherLabel } from './index';

const req = (difficulty: number, seed: number, exclude?: string[]) => ({ difficulty, seed, age: 7, mode: 'practice' as const, exclude });

describe('Picture Concepts emoji bank', () => {
  it('is big, has no duplicates, and every picture has several tags', () => {
    expect(PICS.length).toBeGreaterThanOrEqual(250);
    const keys = PICS.map((p) => strip(p.e));
    expect(new Set(keys).size).toBe(keys.length);
    for (const p of PICS) {
      expect(p.name.length).toBeGreaterThan(1);
      expect(TAGS_OF.get(strip(p.e))!.size).toBeGreaterThanOrEqual(2);
    }
  });

  it('only names real bank pictures as strict members', () => {
    expect(UNKNOWN_STRICT).toEqual([]);
    const all = new Set(PICS.map((p) => strip(p.e)));
    for (const t of TAGS) for (const k of t.strict) expect(all.has(k)).toBe(true);
  });

  it('has target concepts of every kind with enough members, and never targets colours', () => {
    const targets = TAGS.filter((t) => t.target);
    for (const kind of ['category', 'function', 'property', 'abstract'] as const) {
      expect(targets.filter((t) => t.kind === kind).length).toBeGreaterThanOrEqual(8);
    }
    for (const t of targets) expect(t.strict.length).toBeGreaterThanOrEqual(3);
    expect(TAGS.filter((t) => t.kind === 'color').every((t) => !t.target)).toBe(true);
    // spot-check curation
    expect(TAG_BY_ID.get('on-feet')!.strict).toContain(strip('🧦'));
    expect(TAG_BY_ID.get('from-cow')!.strict).toContain(strip('🧀'));
    expect(TAG_BY_ID.get('eggs')!.strict).toEqual(expect.arrayContaining([strip('🐢'), strip('🦅')]));
    expect(TAG_BY_ID.get('eggs')!.strict).not.toContain(strip('🐶'));
  });

  it('finds shared tags across pictures', () => {
    expect(sharedTags(['🧦', '👟'])).toContain('on-feet');
    expect(sharedTags(['🥛', '🧀'])).toContain('from-cow');
    expect(sharedTags(['🧦', '🌋'])).toEqual([]);
    expect(sharedTags(['🧦', '🦈'])).toEqual(['blue']); // loose colour links count too
  });
});

describe('Picture Concepts generator', () => {
  it('is deterministic for a given seed', () => {
    for (const d of [4, 8, 13]) expect(generate(req(d, 99))).toEqual(generate(req(d, 99)));
    const set = new Set(Array.from({ length: 12 }, (_, s) => generate(req(8, s)).payload.answer.join()));
    expect(set.size).toBeGreaterThan(8);
  });

  it('has exactly one linked combination — the answer — across hundreds of items', () => {
    for (const d of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18]) {
      for (let seed = 0; seed < 40; seed++) {
        const { payload: p } = generate(req(d, seed * 31 + d));
        const combos = linkedCombos(p.rows);
        expect(combos).toEqual([p.answer]);
        expect(sharedTags(p.answer)).toContain(p.tag);
        // answers are strict members of the target idea
        p.answer.forEach((a, r) => {
          expect(p.rows[r]).toContain(a);
          expect(TAG_BY_ID.get(p.tag)!.strict).toContain(strip(a));
        });
        const flat = p.rows.flat().map(strip);
        expect(new Set(flat).size).toBe(flat.length);
        expect(new Set(p.rows.map((r) => r.length)).size).toBe(1);
      }
    }
  });

  it('gets harder with difficulty and reports the true difficulty', () => {
    const levels = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
    const avg = levels.map((d) => {
      let sum = 0;
      for (let s = 0; s < 30; s++) sum += generate(req(d, s)).difficulty;
      return sum / 30;
    });
    for (let i = 1; i < avg.length; i++) expect(avg[i]).toBeGreaterThan(avg[i - 1]);
    for (const [i, d] of levels.entries()) expect(Math.abs(avg[i] - d)).toBeLessThan(1);
  });

  it('uses 2 rows of concrete categories for little ones and 3 rows of 4 with traps for older kids', () => {
    let traps = 0;
    for (let s = 0; s < 60; s++) {
      const young = generate(req(4.5, s));
      expect(young.payload.rows.length).toBe(2);
      expect(young.payload.rows[0].length).toBeLessThanOrEqual(3);
      expect(TAG_BY_ID.get(young.payload.tag)!.kind).toBe('category');
      expect(young.skills).toEqual(['pc:category']);

      const mid = generate(req(8, s));
      expect(bandFor(8)).toBe(1);
      expect(mid.payload.rows.length * mid.payload.rows[0].length).toBeGreaterThanOrEqual(6);

      const old = generate(req(14, s));
      expect(old.payload.rows.length).toBe(3);
      expect(old.payload.rows[0].length).toBe(4);
      expect(old.skills).toContain('pc:three-rows');
      // a trap: some two pictures in different rows share an idea, but not as the answer pair
      const { rows, answer } = old.payload;
      let found = false;
      for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++)
        for (const x of rows[a]) for (const y of rows[b])
          if (!(x === answer[a] && y === answer[b]) && sharedTags([x, y]).length) found = true;
      if (found) traps++;
    }
    expect(traps).toBeGreaterThan(50);
  });

  it('avoids recently seen concepts when asked', () => {
    const first = generate(req(5, 3));
    const again = generate(req(5, 3, [first.id]));
    expect(again.payload.tag).not.toBe(first.payload.tag);
  });

  it('explains with the pictures and the shared idea', () => {
    const it = generate(req(7, 2));
    const label = TAG_BY_ID.get(it.payload.tag)!.label;
    for (const a of it.payload.answer) expect(it.explanation).toContain(a);
    expect(it.explanation).toContain(togetherLabel(label, it.payload.answer.length === 2 ? 'both' : 'all'));
    expect(it.hints[it.hints.length - 1]).toContain(label);
    // soft 60 s limit with a neutral prompt at 30 s; one stem for every item
    for (const d of [4, 9, 14]) expect(generate(req(d, 6))).toMatchObject({ timeLimitSec: 60, promptAtSec: 30, speak: 'Pick one from each row that go together.' });
    expect(togetherLabel('are animals', 'both')).toBe('are both animals');
    expect(togetherLabel('go on your feet', 'all')).toBe('all go on your feet');
  });
});

describe('Picture Concepts scoring', () => {
  const two = generate(req(5, 11));
  const three = generate(req(13, 11));

  it('credits only a full set of right picks', () => {
    expect(score(two, two.payload.answer.slice())).toMatchObject({ points: 1, correct: true, meta: { rowsRight: 2, rows: 2 } });
    const wrong3 = three.payload.answer.slice();
    wrong3[2] = three.payload.rows[2].find((e) => e !== wrong3[2])!;
    const out = score(three, wrong3);
    expect(out).toMatchObject({ points: 0, correct: false, meta: { rowsRight: 2, rows: 3 } });
    expect(out.feedback).toMatch(/2 of 3/);
    expect(score(three, [three.payload.answer[0], null, three.payload.answer[2]]).correct).toBe(false);
    expect(score(two, [two.payload.answer[0]]).correct).toBe(false);
  });

  it('accepts emoji with or without the variation selector', () => {
    const withSel = two.payload.answer.map((e) => strip(e));
    expect(score(two, withSel).correct).toBe(true);
  });

  it('scores a timeout as zero', () => {
    expect(score(three, null)).toEqual({ points: 0, correct: false, meta: { rowsRight: 0, rows: 3 } });
  });
});
