import { describe, expect, it } from 'vitest';
import { scaledFromSpeeded } from '../../core/scoring';
import type { Item } from '../../core/types';
import {
  GLYPH_COUNT, baseGlyph, glyphFamily, glyphPrims, glyphSignature, isSetAlt, lookalikes, rotationTwins, setTwin,
  type Prim, type Pt,
} from './glyphs';
import { SS_ROWS, SS_SPEC, generate, score, type SsPayload, type SsRow } from './index';

/** All 8 turns/mirrors of the square applied to a drawing, as signatures (same scheme as glyphSignature). */
function allTurnSignatures(prims: Prim[]): Set<string> {
  const maps: ((p: Pt) => Pt)[] = [
    ([x, y]) => [x, y], ([x, y]) => [100 - y, x], ([x, y]) => [100 - x, 100 - y], ([x, y]) => [y, 100 - x],
    ([x, y]) => [100 - x, y], ([x, y]) => [x, 100 - y], ([x, y]) => [y, x], ([x, y]) => [100 - y, 100 - x],
  ];
  const key = ([x, y]: Pt) => `${Math.round(x)},${Math.round(y)}`;
  return new Set(maps.map((m) => {
    const parts: string[] = [];
    for (const p of prims) {
      if (p.t === 'path') {
        const pts = (p.closed ? [...p.pts, p.pts[0]] : p.pts).map(m);
        for (let i = 1; i < pts.length; i++) parts.push(`e:${[key(pts[i - 1]), key(pts[i])].sort().join('|')}`);
      } else parts.push(`${p.t}:${key(m(p.c))}:${p.r}`);
    }
    return parts.sort().join(' ');
  }));
}

const req = (age: number, seed: number) => ({ difficulty: 1, seed, age, mode: 'practice' as const });

describe('Symbol Spy glyphs', () => {
  it('has at least 30 glyphs that are all different pictures', () => {
    expect(GLYPH_COUNT).toBeGreaterThanOrEqual(30);
    const sigs = Array.from({ length: GLYPH_COUNT }, (_, g) => glyphSignature(g));
    expect(new Set(sigs).size).toBe(GLYPH_COUNT);
  });

  it('look-alikes are the other members of the same family', () => {
    for (let g = 0; g < GLYPH_COUNT; g++) {
      const l = lookalikes(g);
      expect(l).toHaveLength(5);
      for (const x of l) {
        expect(glyphFamily(x)).toBe(glyphFamily(g));
        expect(glyphSignature(x)).not.toBe(glyphSignature(g));
      }
    }
  });

  it('rotation twins are turns/mirrors of the glyph; the set twin is NOT any turn or mirror of it', () => {
    for (let g = 0; g < GLYPH_COUNT; g++) {
      const turns = allTurnSignatures(glyphPrims(g));
      const rt = rotationTwins(g);
      expect(rt).toHaveLength(2);
      for (const x of rt) {
        expect(isSetAlt(x)).toBe(isSetAlt(g));
        expect(turns.has(glyphSignature(x))).toBe(true);
      }
      const st = setTwin(g);
      expect(glyphFamily(st)).toBe(glyphFamily(g));
      expect(isSetAlt(st)).toBe(!isSetAlt(g));
      expect(setTwin(st)).toBe(g);
      expect(turns.has(glyphSignature(st))).toBe(false);
    }
  });
});

describe('Symbol Spy generator', () => {
  it('switches version at age 8 (A: 1 target / 3 symbols, B: 2 targets / 5 symbols)', () => {
    const a = generate(req(7.9, 5));
    const b = generate(req(8, 5));
    expect(a.payload.version).toBe('A');
    expect(b.payload.version).toBe('B');
    expect(a.payload.rows).toHaveLength(SS_ROWS.A);
    expect(b.payload.rows).toHaveLength(SS_ROWS.B);
    for (const it of [a, b]) {
      const spec = SS_SPEC[it.payload.version];
      for (const r of [...it.payload.rows, ...it.payload.practice]) {
        expect(r.targets).toHaveLength(spec.targets);
        expect(r.search).toHaveLength(spec.group);
      }
    }
    expect(a.skills).toContain('ss:A');
    expect(b.skills).toContain('ss:B');
    expect(b.skills).toContain('ss:lookalike');
  });

  it('is deterministic', () => {
    expect(generate(req(7, 9))).toEqual(generate(req(7, 9)));
    expect(generate(req(7, 9)).payload.rows).not.toEqual(generate(req(7, 10)).payload.rows);
  });

  it('every row has exactly one right answer, and half the rows contain a match', () => {
    let lookalikeRows = 0;
    let rowsSeen = 0;
    for (let seed = 0; seed < 150; seed++) {
      for (const age of [7, 11]) {
        const it = generate(req(age, seed));
        const matches = it.payload.rows.filter((r) => r.answer >= 0).length;
        expect(matches).toBe(it.payload.rows.length / 2);
        for (const r of [...it.payload.rows, ...it.payload.practice]) {
          rowsSeen++;
          expect(new Set(r.search).size).toBe(r.search.length);
          expect(new Set(r.targets.map(glyphFamily)).size).toBe(r.targets.length);
          expect(r.targets.every((t) => !isSetAlt(t))).toBe(true);
          const hits = r.search.map((g, i) => (r.targets.includes(g) ? i : -1)).filter((i) => i >= 0);
          expect(hits.length).toBeLessThanOrEqual(1);
          expect(r.answer).toBe(hits.length ? hits[0] : -1);
          const fams = r.targets.map(glyphFamily);
          if (r.search.some((g) => !r.targets.includes(g) && fams.includes(glyphFamily(g)))) lookalikeRows++;
        }
      }
    }
    const share = lookalikeRows / rowsSeen;
    expect(share).toBeGreaterThan(0.45);
    expect(share).toBeLessThan(0.75);
  });

  it('practice has a match, a no-match with a turned copy and a match with a changed-part look-alike', () => {
    const p = generate(req(7, 2)).payload.practice;
    expect(p[0].answer).toBeGreaterThanOrEqual(0);
    expect(p[1].answer).toBe(-1);
    expect(p[1].search.some((g) => rotationTwins(p[1].targets[0]).includes(g))).toBe(true);
    expect(p[2].answer).toBeGreaterThanOrEqual(0);
    expect(p[2].search).toContain(setTwin(p[2].targets[0]));
  });

  it('plants both kinds of look-alike: turned copies and changed-part (set) look-alikes', () => {
    let rot = 0;
    let set = 0;
    for (let seed = 0; seed < 40; seed++) {
      for (const r of generate(req(9, seed)).payload.rows) {
        for (const g of r.search) {
          if (r.targets.includes(g)) continue;
          if (r.targets.some((t) => rotationTwins(t).includes(g))) rot++;
          if (r.targets.some((t) => setTwin(t) === g)) set++;
        }
      }
    }
    expect(rot).toBeGreaterThan(200);
    expect(set).toBeGreaterThan(200);
  });
});

describe('Symbol Spy scoring', () => {
  const item = generate(req(9, 21));
  const right = item.payload.rows.map((r) => r.answer);
  const wrongAt = (i: number) => {
    const r = item.payload.rows[i];
    return r.answer === -1 ? 0 : -1;
  };

  it('scores right minus wrong', () => {
    expect(score(item, { answers: right, elapsedSec: 110 }).points).toBe(right.length);
    const ans = right.slice(0, 20);
    ans[2] = wrongAt(2);
    ans[7] = wrongAt(7);
    const out = score(item, { answers: ans, elapsedSec: 120 });
    expect(out.meta).toMatchObject({ correct: 18, errors: 2, attempted: 20 });
    expect(out.points).toBe(16);
  });

  it('never goes below zero', () => {
    const ans = right.slice(0, 10).map((_, i) => wrongAt(i));
    const out = score(item, { answers: ans, elapsedSec: 120 });
    expect(out.points).toBe(0);
    expect(out.meta?.errors).toBe(10);
  });

  it('counts set errors and rotation errors separately (generated rows)', () => {
    const rowsWith = (pred: (r: SsRow, g: number) => boolean) =>
      item.payload.rows
        .map((r, i) => ({ i, j: r.search.findIndex((g) => !r.targets.includes(g) && pred(r, g)) }))
        .filter((x) => x.j >= 0);
    const setRows = rowsWith((r, g) => r.targets.some((t) => setTwin(t) === g));
    const rotRows = rowsWith((r, g) => r.targets.some((t) => rotationTwins(t).includes(g)));
    expect(setRows.length).toBeGreaterThanOrEqual(2);
    expect(rotRows.length).toBeGreaterThanOrEqual(3);
    const ans = right.slice();
    for (const { i, j } of setRows.slice(0, 2)) ans[i] = j;
    for (const { i, j } of rotRows.slice(0, 3)) ans[i] = j;
    const out = score(item, { answers: ans, elapsedSec: 120 });
    expect(out.meta).toMatchObject({ errors: 5, setErrors: 2, rotationErrors: 3, correct: right.length - 5 });
    expect(out.points).toBe(right.length - 10);
    expect(out.feedback).toMatch(/turned/);
    expect(out.feedback).toMatch(/one part changed/);
  });

  it('counts set and rotation errors on hand-built rows (one and two targets)', () => {
    const A = baseGlyph(2, 0);
    const B = baseGlyph(9, 1);
    const other = baseGlyph(5, 2);
    const rows: SsRow[] = [
      // one target, no match: set twin, rotation twin, unrelated
      { targets: [A], search: [setTwin(A), rotationTwins(A)[0], other], answer: -1 },
      // two targets, match at 4; look-alikes of the SECOND target
      { targets: [A, B], search: [other, rotationTwins(B)[1], setTwin(B), baseGlyph(11, 0), B], answer: 4 },
      { targets: [A], search: [other, A, rotationTwins(A)[1]], answer: 1 },
    ];
    const hand: Item<SsPayload> = { ...item, payload: { ...item.payload, rows } };
    const tally = (answers: number[]) => score(hand, { answers, elapsedSec: 60 }).meta;
    expect(tally([0, 4, 1])).toMatchObject({ correct: 2, errors: 1, setErrors: 1, rotationErrors: 0 });
    expect(tally([1, 4, 1])).toMatchObject({ correct: 2, errors: 1, setErrors: 0, rotationErrors: 1 });
    expect(tally([2, 1, 2])).toMatchObject({ correct: 0, errors: 3, setErrors: 0, rotationErrors: 2 });
    expect(tally([0, 2, 0])).toMatchObject({ correct: 0, errors: 3, setErrors: 2, rotationErrors: 0 });
    expect(tally([-1, -1, 1])).toMatchObject({ correct: 2, errors: 1, setErrors: 0, rotationErrors: 0 }); // NO on a match row
    expect(tally([-1, 3, 1])).toMatchObject({ errors: 1, setErrors: 0, rotationErrors: 0 }); // unrelated symbol
    expect(score(hand, null).meta).toMatchObject({ setErrors: 0, rotationErrors: 0 });
  });

  it('ignores impossible answers and handles null', () => {
    const out = score(item, { answers: [99, -5, 1.5, right[3]], elapsedSec: 30 });
    expect(out.meta?.attempted).toBe(1);
    expect(score(item, null).points).toBe(0);
  });

  it('lines up with the app’s speeded norms', () => {
    const out = score(item, { answers: right.slice(0, 26), elapsedSec: 120 });
    expect(scaledFromSpeeded('SS', out.points, 10, out.meta!.durationSec)).toBe(10);
  });
});
