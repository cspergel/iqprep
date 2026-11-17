import { describe, expect, it } from 'vitest';
import {
  type Shape, type Unit, areaOf, canon, cellsFrom, connected, generate, isChiral, levelForDifficulty, mirror, normalize,
  rotate, sameShape, score, solveCombos, tiles,
} from './index';

const req = (difficulty: number, seed: number) => ({ difficulty, seed, age: 7, mode: 'practice' as const });
const hasHalfCell = (s: Shape) => {
  const m = new Map<string, number>();
  for (const [x, y] of s) m.set(`${x},${y}`, (m.get(`${x},${y}`) ?? 0) + 1);
  return [...m.values()].some((n) => n < 4);
};
const keyset = (s: Shape) => new Set(s.map((u) => u.join(',')));

const S_TET = cellsFrom([[1, 0], [2, 0], [0, 1], [1, 1]]);
const SQUARE = cellsFrom([[0, 0], [1, 0], [0, 1], [1, 1]]);
const L_TRI = cellsFrom([[0, 0], [1, 0], [0, 1]]);
const MONO = cellsFrom([[0, 0]]);

describe('Visual Puzzles geometry and solver', () => {
  it('rotates four times back to the same shape and mirrors chiral shapes into different ones', () => {
    let s = S_TET;
    for (let k = 0; k < 4; k++) s = rotate(s);
    expect(canon(s)).toBe(canon(S_TET));
    expect(canon(rotate(S_TET))).not.toBe(canon(S_TET));
    expect(isChiral(S_TET)).toBe(true);
    expect(isChiral(SQUARE)).toBe(false);
    expect(sameShape(S_TET, mirror(S_TET))).toBe(false);
    expect(sameShape(S_TET, rotate(rotate(S_TET)))).toBe(true);
  });

  it('tiles with turned pieces but never with flipped ones', () => {
    expect(tiles(S_TET, [rotate(S_TET)])).toBe(true);
    expect(tiles(S_TET, [mirror(S_TET)])).toBe(false);
    expect(tiles(SQUARE, [rotate(L_TRI), MONO])).toBe(true);
    expect(tiles(SQUARE, [L_TRI])).toBe(false); // too small
    expect(tiles(SQUARE, [L_TRI, MONO, MONO])).toBe(false); // too big
    const bar = cellsFrom([[0, 0], [1, 0], [2, 0], [3, 0]]);
    expect(tiles(SQUARE, [bar])).toBe(false); // right size, wrong shape
  });

  it('handles half-square triangles', () => {
    const cell = cellsFrom([[0, 0]]);
    const half: Shape = [[0, 0, 0], [0, 0, 1]];
    expect(tiles(cell, [half, half])).toBe(true); // one turned twice fills the other half
    // a 2×1 "roof": two cells with the top-right half cut off the right cell
    const roof: Shape = [...cellsFrom([[0, 0]]), [1, 0, 2], [1, 0, 3]];
    expect(tiles(roof, [cellsFrom([[0, 0]]), [[0, 0, 2], [0, 0, 3]]])).toBe(true);
    expect(tiles(roof, [cellsFrom([[0, 0]]), cellsFrom([[0, 0]])])).toBe(false);
    expect(connected([[0, 0, 0], [0, 0, 2]] as Unit[])).toBe(false);
    expect(connected(half)).toBe(true);
  });

  it('finds every working combination', () => {
    const pieces = [L_TRI, MONO, MONO, rotate(L_TRI), cellsFrom([[0, 0], [1, 0]]), cellsFrom([[0, 0], [1, 0]])];
    // square = mono + mono + domino (either domino); L + mono needs only two pieces, so it does not count
    expect(solveCombos(SQUARE, pieces)).toEqual([[1, 2, 4], [1, 2, 5]]);
    expect(solveCombos(SQUARE, [L_TRI, rotate(L_TRI), MONO, cellsFrom([[0, 0], [1, 0], [2, 0]]), L_TRI, L_TRI])).toEqual([]);
    const strip = cellsFrom([[0, 0], [1, 0], [2, 0], [3, 0]]);
    expect(solveCombos(strip, pieces)).toEqual([[1, 2, 4], [1, 2, 5]]);
  });
});

describe('Visual Puzzles generator', () => {
  it('is deterministic for a given seed', () => {
    for (const d of [4, 8, 11, 15]) expect(generate(req(d, 77))).toEqual(generate(req(d, 77)));
    expect(canon(generate(req(8, 1)).payload.target) + generate(req(8, 1)).payload.pieces.map(canon).join())
      .not.toBe(canon(generate(req(8, 2)).payload.target) + generate(req(8, 2)).payload.pieces.map(canon).join());
  });

  it('always has exactly one 3-piece answer, and it matches the stored answer and regions', () => {
    const diffs = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18];
    for (const d of diffs) {
      for (let seed = 0; seed < 40; seed++) {
        const { payload: p } = generate(req(d, seed * 7919 + d));
        expect(p.pieces.length).toBe(6);
        expect(p.answer.length).toBe(3);
        expect(solveCombos(p.target, p.pieces)).toEqual([p.answer]);
        p.pieces.forEach((s) => expect(connected(s)).toBe(true));
        expect(connected(p.target)).toBe(true);
        // regions partition the target and are the right pieces (turned)
        const covered = p.regions.flat().map((u) => u.join(','));
        expect(new Set(covered).size).toBe(covered.length);
        expect(new Set(covered)).toEqual(keyset(p.target));
        p.regions.forEach((r, k) => expect(sameShape(normalize(r), p.pieces[p.answer[k]])).toBe(true));
        // no distractor is a copy of a real piece
        p.pieces.forEach((s, i) => {
          if (p.kinds[i] !== 'real') p.answer.forEach((j) => expect(sameShape(s, p.pieces[j])).toBe(false));
        });
      }
    }
  });

  it('uses near-miss distractors of the planned kinds', () => {
    for (let seed = 0; seed < 120; seed++) {
      const { payload: p } = generate(req(seed % 2 ? 11 : 15, seed));
      const real = p.answer.map((i) => p.pieces[i]);
      p.kinds.forEach((k, i) => {
        const a = areaOf(p.pieces[i]);
        if (k === 'bigger') expect(real.some((r) => areaOf(r) === a - 1)).toBe(true);
        if (k === 'smaller') expect(real.some((r) => areaOf(r) === a + 1 || areaOf(r) === a + 0.5)).toBe(true);
        if (k === 'mirror') expect(real.some((r) => sameShape(mirror(r), p.pieces[i]))).toBe(true);
      });
    }
  });

  it('gets harder with difficulty: bigger, irregular, turned, mirror traps, half squares', () => {
    const levels = [4, 6, 8, 10, 12, 14, 16];
    const avg = levels.map((d) => {
      let sum = 0;
      for (let s = 0; s < 25; s++) sum += generate(req(d, s)).difficulty;
      return sum / 25;
    });
    for (let i = 1; i < avg.length; i++) expect(avg[i]).toBeGreaterThan(avg[i - 1]);
    for (const [i, d] of levels.entries()) expect(Math.abs(avg[i] - d)).toBeLessThan(1.8);
    expect(levelForDifficulty(4)).toBe('rect');
    expect(levelForDifficulty(16)).toBe('half');
    for (let s = 0; s < 40; s++) {
      const easy = generate(req(4.5, s));
      expect(easy.payload.level).toBe('rect');
      // easy: pieces shown the same way round as they sit in the shape
      easy.payload.regions.forEach((r, k) => expect(canon(r)).toBe(canon(easy.payload.pieces[easy.payload.answer[k]])));
      expect(easy.skills).toContain('vp:rect');
      const hard = generate(req(16, s));
      expect([hard.payload.target, ...hard.payload.pieces].some(hasHalfCell)).toBe(true);
      expect(generate(req(10, s)).payload.pieces.some(hasHalfCell)).toBe(false);
      expect(hard.skills).toContain('vp:irregular');
    }
    const mirrorCount = Array.from({ length: 40 }, (_, s) => generate(req(12, s))).filter((it) => it.skills.includes('vp:mirror-trap')).length;
    expect(mirrorCount).toBeGreaterThan(25);
  });

  it('sets the 30 s limit with a prompt at 20 s, and teaching text that adds up', () => {
    const it = generate(req(8, 3));
    expect(it.timeLimitSec).toBe(30);
    expect(it.promptAtSec).toBe(20);
    for (const d of [4, 10, 16]) expect(generate(req(d, 5))).toMatchObject({ timeLimitSec: 30, promptAtSec: 20 });
    const sum = it.payload.answer.reduce((s, i) => s + areaOf(it.payload.pieces[i]), 0);
    expect(sum).toBe(areaOf(it.payload.target));
    expect(it.hints[0]).toContain(String(areaOf(it.payload.target)));
  });
});

describe('Visual Puzzles scoring', () => {
  const item = generate(req(12, 4));
  const { answer, kinds } = item.payload;
  const wrong = [0, 1, 2, 3, 4, 5].filter((i) => !answer.includes(i));

  it('credits only the exact three pieces', () => {
    expect(score(item, answer.slice())).toMatchObject({ points: 1, correct: true });
    expect(score(item, answer.slice().reverse()).correct).toBe(true);
    const two = [answer[0], answer[1], wrong[0]].sort();
    const out = score(item, two);
    expect(out.correct).toBe(false);
    expect(out.points).toBe(0);
    expect(out.meta!.rightPieces).toBe(2);
    expect(score(item, [answer[0], answer[1]]).correct).toBe(false);
    expect(score(item, [answer[0], answer[0], answer[1]]).correct).toBe(false);
  });

  it('notices a mirror-image pick', () => {
    const m = kinds.indexOf('mirror');
    expect(m).toBeGreaterThanOrEqual(0);
    const out = score(item, [answer[0], answer[1], m]);
    expect(out.meta!.mirrorPicked).toBe(1);
    expect(out.feedback).toMatch(/flip/);
  });

  it('scores a timeout as zero', () => {
    expect(score(item, null)).toEqual({ points: 0, correct: false, meta: { rightPieces: 0, mirrorPicked: 0 } });
  });
});
