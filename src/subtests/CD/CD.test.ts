import { describe, expect, it } from 'vitest';
import { scaledFromSpeeded } from '../../core/scoring';
import { CD_BOXES, TAP_CREDIT, UNRECOGNISED, cdVersion, generate, rotationTwin, score, symbolCount, type CdResponse } from './index';
import { CD_SYMBOLS, classifyBox, strokesToPath } from './ink';
import { kidStrokes, scribble } from './inkSynth';
import { balancedSequence, clampElapsed } from './speedKit';
import { createRng } from '../../core/rng';

const req = (age: number, seed: number) => ({ difficulty: 99, seed, age, mode: 'practice' as const });
const perfect = (item: ReturnType<typeof generate>) => item.payload.boxes.map((t) => item.payload.key[t]);

describe('Coding generator', () => {
  it('switches from version A (shapes) to version B (digits) at age 8', () => {
    const a = generate(req(7.99, 1));
    const b = generate(req(8, 1));
    expect(a.payload.version).toBe('A');
    expect(b.payload.version).toBe('B');
    expect(a.payload.key).toHaveLength(5);
    expect(b.payload.key).toHaveLength(9);
    expect(a.payload.boxes).toHaveLength(CD_BOXES.A);
    expect(b.payload.boxes).toHaveLength(CD_BOXES.B);
    expect(a.skills).toEqual(['cd:A']);
    expect(b.skills).toEqual(['cd:B']);
    expect(cdVersion(6)).toBe('A');
    expect(cdVersion(16)).toBe('B');
  });

  it('is deterministic for a seed and varies across seeds', () => {
    expect(generate(req(7, 42))).toEqual(generate(req(7, 42)));
    expect(generate(req(7, 42)).payload.boxes).not.toEqual(generate(req(7, 43)).payload.boxes);
  });

  it('builds a valid key and a balanced sheet without back-to-back repeats', () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const age of [6, 10]) {
        const it = generate(req(age, seed));
        const k = symbolCount(it.payload.version);
        expect([...it.payload.key].sort((x, y) => x - y)).toEqual(Array.from({ length: k }, (_, i) => i));
        const counts = new Array(k).fill(0);
        it.payload.boxes.forEach((t, i) => {
          expect(t).toBeGreaterThanOrEqual(0);
          expect(t).toBeLessThan(k);
          if (i > 0) expect(t).not.toBe(it.payload.boxes[i - 1]);
          counts[t]++;
        });
        expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
        // 6 sample boxes (no back-to-back repeats) and 3 different demo boxes
        expect(it.payload.practice).toHaveLength(6);
        it.payload.practice.forEach((t, i) => { if (i > 0) expect(t).not.toBe(it.payload.practice[i - 1]); });
        expect(new Set(it.payload.practice).size).toBe(Math.min(6, k));
        expect(new Set(it.payload.demo).size).toBe(3);
      }
    }
  });

  it('sets difficulty to the child’s age, maxPoints to the sheet size and a 120 s limit', () => {
    const it = generate(req(7.5, 3));
    expect(it.difficulty).toBe(7.5);
    expect(it.maxPoints).toBe(it.payload.boxes.length);
    expect(it.timeLimitSec).toBe(120);
  });
});

describe('Coding scoring', () => {
  const item = generate(req(7, 11));
  const itemB = generate(req(9, 11));

  it('counts boxes coded correctly, recomputed from the answers', () => {
    const all = perfect(item);
    const out = score(item, { mode: 'draw', answers: all, elapsedSec: 100 });
    expect(out.points).toBe(all.length);
    expect(out.meta).toMatchObject({ correct: all.length, errors: 0, durationSec: 100, attempted: all.length, mode: 1 });
    expect(out.correct).toBe(true);
  });

  it('does not subtract errors but records them', () => {
    const ans = perfect(item).slice(0, 30);
    for (const i of [0, 4, 9, 20, 29]) ans[i] = (ans[i] + 2) % 5;
    const out = score(item, { mode: 'draw', answers: ans, elapsedSec: 120 });
    expect(out.points).toBe(25);
    expect(out.meta?.errors).toBe(5);
    expect(out.meta?.attempted).toBe(30);
  });

  it('gives no credit for answers that are off by one box', () => {
    const shifted = perfect(item).slice(1);
    expect(score(item, { mode: 'draw', answers: shifted, elapsedSec: 120 }).points).toBe(0);
  });

  it('counts rotation errors (the same mark turned sideways)', () => {
    const ans = perfect(itemB).slice(0, 10);
    const i = ans.findIndex((s) => rotationTwin('B', s) !== null);
    expect(i).toBeGreaterThanOrEqual(0);
    ans[i] = rotationTwin('B', ans[i])!;
    const out = score(itemB, { answers: ans, elapsedSec: 120 });
    expect(out.meta?.rotationErrors).toBe(1);
    expect(out.meta?.errors).toBe(1);
    expect(out.feedback).toMatch(/turned/);
  });

  it('ignores skipped boxes and answers past the end of the sheet', () => {
    const ans = [...perfect(item), 0, 1, 2];
    ans[3] = -1;
    const out = score(item, { mode: 'draw', answers: ans, elapsedSec: 120 });
    expect(out.points).toBe(item.payload.boxes.length - 1);
    expect(out.meta?.errors).toBe(0);
  });

  it('scores a timeout/skip as zero', () => {
    expect(score(item, null).points).toBe(0);
    expect(score(item, null).correct).toBe(false);
  });

  it('reports the real elapsed seconds, clamped to the limit', () => {
    expect(score(item, { answers: [], elapsedSec: 500 }).meta?.durationSec).toBe(120);
    expect(score(item, { answers: [], elapsedSec: Number.NaN }).meta?.durationSec).toBe(120);
    expect(score(item, { answers: [], elapsedSec: 61.04 }).meta?.durationSec).toBe(61);
    expect(clampElapsed(-3, 45)).toBe(0);
  });

  it('lines up with the app’s speeded norms in draw mode (a typical 7-year-old ≈ scaled 10)', () => {
    const ans = perfect(item).slice(0, 31);
    const out = score(item, { mode: 'draw', answers: ans, elapsedSec: 120 });
    expect(scaledFromSpeeded('CD', out.points, 7, out.meta!.durationSec)).toBe(10);
    // the same count tapped scores lower, because tapping is easier than drawing
    const tap = score(item, { mode: 'tap', answers: ans, elapsedSec: 120 });
    expect(scaledFromSpeeded('CD', tap.points, 7, 120)).toBeLessThan(10);
  });

  it('scales tap-mode points to round(correct × 0.8) but keeps the true count in meta', () => {
    for (const n of [0, 1, 2, 3, 10, 31, 47]) {
      const ans = perfect(item).slice(0, n);
      const tap = score(item, { mode: 'tap', answers: ans, elapsedSec: 120 });
      expect(tap.points).toBe(Math.round(n * TAP_CREDIT));
      expect(tap.meta).toMatchObject({ correct: n, mode: 0 });
      const draw = score(item, { mode: 'draw', answers: ans, elapsedSec: 120 });
      expect(draw.points).toBe(n);
      expect(draw.meta).toMatchObject({ correct: n, mode: 1 });
    }
    expect(score(item, { mode: 'tap', answers: perfect(item).slice(0, 10), elapsedSec: 120 }).points).toBe(8);
    // responses saved before pencil mode (no mode) were taps
    expect(score(item, { answers: perfect(item).slice(0, 10), elapsedSec: 120 }).meta?.mode).toBe(0);
  });

  it('scores a sheet from per-box classifications of drawn strokes', () => {
    const p = itemB.payload;
    const want = (i: number) => p.key[p.boxes[i]];
    const turnable = (s: number) => ['caret', 'chevron', 'tee', 'tri'].includes(CD_SYMBOLS[s]);
    const res: CdResponse = { mode: 'draw', answers: [], rotated: [], ink: [], elapsedSec: 118 };
    let turned = 0;
    for (let i = 0; i < 40; i++) {
      let strokes = kidStrokes('B', want(i), 500 + i);
      if (i === 7) strokes = scribble(11); // unreadable
      if (i === 12) strokes = kidStrokes('B', (want(i) + 1) % 9, 3); // wrong symbol
      if (turned < 2 && i > 20 && turnable(want(i))) { strokes = kidStrokes('B', want(i), i, { turn: 180 }); turned++; }
      const c = classifyBox('B', strokes, want(i));
      res.answers.push(c.answer);
      res.rotated!.push(c.rotation ? 1 : 0);
      res.ink!.push(strokesToPath(strokes));
    }
    expect(turned).toBe(2);
    expect(res.answers[7]).toBe(UNRECOGNISED);
    const out = score(itemB, res);
    expect(out.meta).toMatchObject({ correct: 36, errors: 4, rotationErrors: 2, attempted: 40, durationSec: 118, mode: 1 });
    expect(out.points).toBe(36);
    expect(out.feedback).toMatch(/turned/);
  });

  it('counts unreadable drawings as errors and ignores a stray rotation flag on a right box', () => {
    const ans = perfect(item).slice(0, 5);
    ans[1] = UNRECOGNISED;
    const out = score(item, { mode: 'draw', answers: ans, rotated: [1, 0, 0, 0, 0], elapsedSec: 60 });
    expect(out.meta).toMatchObject({ correct: 4, errors: 1, rotationErrors: 0, attempted: 5 });
  });
});

describe('balancedSequence', () => {
  it('never repeats a value back to back and covers each value evenly', () => {
    for (let seed = 1; seed < 100; seed++) {
      const rng = createRng(seed);
      const s = balancedSequence(rng.next, 4, 42);
      expect(s).toHaveLength(42);
      for (let i = 1; i < s.length; i++) expect(s[i]).not.toBe(s[i - 1]);
      const c = [0, 1, 2, 3].map((v) => s.filter((x) => x === v).length);
      expect(Math.max(...c) - Math.min(...c)).toBeLessThanOrEqual(1);
    }
  });
});
