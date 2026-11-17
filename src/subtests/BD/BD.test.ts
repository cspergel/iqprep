import { describe, expect, it } from 'vitest';
import {
  type BdPayload, type Face, FACES, designDifficulty, generate, isDiagonal, isRotationOf, isSymmetric, redShare,
  formatFor, rotateDesign, score, timeLimitFor, exceedsDesign, placedBox, judgeBoard,
} from './index';

const req = (difficulty: number, seed: number) => ({ difficulty, seed, age: 7, mode: 'practice' as const });

const mk = (target: Face[], rows: number, cols: number, rotated = false) => {
  const base = generate(req(7, 1));
  const payload: BdPayload = { rows, cols, target, rotated };
  return { ...base, payload };
};

describe('Block Design geometry', () => {
  it('turns a design four times back to itself, and a single turn moves blocks and faces', () => {
    const t: Face[] = ['R', 'TL', 'W', 'BR'];
    const once = rotateDesign(t, 2, 2);
    // old top-left (R) moves to top-right; old top-right TL moves to bottom-right and turns to TR
    expect(once.faces).toEqual(['W', 'R', 'BL', 'TR']);
    let cur = { faces: t, rows: 2, cols: 2 };
    for (let k = 0; k < 4; k++) cur = rotateDesign(cur.faces, cur.rows, cur.cols);
    expect(cur.faces).toEqual(t);
  });

  it('detects symmetry correctly', () => {
    expect(isSymmetric(['BR', 'BL', 'TR', 'TL'], 2, 2)).toBe(true); // centre diamond
    expect(isSymmetric(['R', 'W', 'W', 'W'], 2, 2)).toBe(true); // diagonal mirror
    expect(isSymmetric(['R', 'TL', 'W', 'W'], 2, 2)).toBe(false);
  });
});

describe('Block Design generator', () => {
  it('is deterministic for a given seed', () => {
    for (const d of [4, 7, 12, 16]) {
      expect(generate(req(d, 42))).toEqual(generate(req(d, 42)));
    }
    const a = new Set(Array.from({ length: 20 }, (_, s) => generate(req(8, s)).payload.target.join()));
    expect(a.size).toBeGreaterThan(5);
  });

  it('grows the grid and complexity as difficulty rises, and reports the true difficulty', () => {
    const levels = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
    const avg = levels.map((d) => {
      let sum = 0, cells = 0;
      for (let s = 0; s < 30; s++) {
        const it = generate(req(d, s));
        expect(it.difficulty).toBe(designDifficulty(it.payload));
        sum += it.difficulty;
        cells += it.payload.rows * it.payload.cols;
      }
      return { d: sum / 30, cells: cells / 30 };
    });
    for (let i = 1; i < avg.length; i++) {
      expect(avg[i].d).toBeGreaterThanOrEqual(avg[i - 1].d - 0.05);
      expect(avg[i].cells).toBeGreaterThanOrEqual(avg[i - 1].cells);
    }
    expect(avg[0].cells).toBe(2);
    expect(avg[avg.length - 1].cells).toBe(9);
    // built items land near what was asked for in the core range
    for (const [i, d] of levels.entries()) if (d >= 4 && d <= 16) expect(Math.abs(avg[i].d - d)).toBeLessThan(1.3);
  });

  it('youngest items use solid faces only; diamond view only for the hardest', () => {
    for (let s = 0; s < 100; s++) {
      const easy = generate(req(4, s));
      expect(easy.payload.target.some(isDiagonal)).toBe(false);
      expect(easy.payload.rotated).toBe(false);
      expect(generate(req(12, s)).payload.rotated).toBe(false);
      expect(generate(req(17, s)).payload.rotated).toBe(true);
    }
  });

  it('builds design-like targets: never uniform, balanced red, 3×3 has diagonal shapes', () => {
    for (let s = 0; s < 300; s++) {
      for (const d of [6, 9, 12, 15]) {
        const p = generate(req(d, s)).payload;
        expect(new Set(p.target).size).toBeGreaterThan(1);
        expect(p.target.every((f) => FACES.includes(f))).toBe(true);
        expect(p.target.length).toBe(p.rows * p.cols);
        expect(redShare(p.target)).toBeGreaterThanOrEqual(0.25);
        expect(redShare(p.target)).toBeLessThanOrEqual(0.75);
        if (p.rows === 3) expect(p.target.filter(isDiagonal).length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('mostly makes symmetric designs at 11–13 and asymmetric ones at 15', () => {
    let symMid = 0, symHard = 0;
    for (let s = 0; s < 100; s++) {
      const m = generate(req(12, s)).payload;
      const h = generate(req(15, s)).payload;
      if (isSymmetric(m.target, m.rows, m.cols)) symMid++;
      if (isSymmetric(h.target, h.rows, h.cols)) symHard++;
    }
    expect(symMid).toBeGreaterThan(70);
    expect(symHard).toBeLessThan(30);
  });

  it('sets time limits by size', () => {
    expect(timeLimitFor({ rows: 1, cols: 2, target: ['R', 'W'], rotated: false })).toBe(30);
    expect(timeLimitFor({ rows: 2, cols: 2, target: ['R', 'W', 'W', 'R'], rotated: false })).toBe(30);
    expect(timeLimitFor({ rows: 2, cols: 2, target: ['TL', 'TR', 'W', 'R'], rotated: false })).toBe(45);
    expect(timeLimitFor({ rows: 2, cols: 2, target: ['BR', 'BL', 'TR', 'TL'], rotated: false })).toBe(75);
    expect(generate(req(13, 3)).timeLimitSec).toBe(120);
  });

  it('tags skills and gives teaching text', () => {
    const it3 = generate(req(17, 5));
    expect(it3.skills).toEqual(expect.arrayContaining(['bd:3x3', 'bd:diagonal', 'bd:rotated']));
    const it1 = generate(req(4, 5));
    expect(it1.skills).toEqual(['bd:solid', 'bd:two-block', 'bd:model']);
    expect(it1.hints.length).toBeGreaterThanOrEqual(2);
    expect(it3.steps!.length).toBe(3 + 2);
  });
});

describe('Block Design scoring', () => {
  const asym: Face[] = ['R', 'TL', 'W', 'BR'];
  const item = mk(asym, 2, 2);

  it('credits only an exact build', () => {
    expect(score(item, asym.slice())).toMatchObject({ points: 1, correct: true, meta: { rotationError: 0, cells: 4, wrongCells: 0 } });
    const oneOff: Face[] = ['R', 'TR', 'W', 'BR'];
    const out = score(item, oneOff);
    expect(out.correct).toBe(false);
    expect(out.meta).toEqual({ rotationError: 0, cells: 4, wrongCells: 1 });
    expect(out.feedback).toMatch(/one block/);
    expect(score(item, ['R', 'TL', 'W', null]).correct).toBe(false);
  });

  it('flags builds that are the target turned 90/180/270°', () => {
    let cur = { faces: asym, rows: 2, cols: 2 };
    for (let k = 1; k <= 3; k++) {
      cur = rotateDesign(cur.faces, cur.rows, cur.cols);
      const out = score(item, cur.faces);
      expect(out.correct).toBe(false);
      expect(out.meta!.rotationError).toBe(1);
      expect(out.feedback).toMatch(/turned around/);
    }
    // a mirror image is not a rotation
    expect(score(item, ['TR', 'R', 'BL', 'W']).meta!.rotationError).toBe(0);
    expect(isRotationOf(asym, 2, 2, asym)).toBe(false);
  });

  it('detects half-turned 2-block builds and 3×3 rotations', () => {
    const two = mk(['R', 'TL'], 1, 2);
    expect(score(two, ['BR', 'R']).meta!.rotationError).toBe(1);
    expect(score(two, ['TL', 'R']).meta!.rotationError).toBe(0);
    for (let s = 0; s < 50; s++) {
      const g = generate(req(15, s));
      const rot = rotateDesign(g.payload.target, 3, 3).faces;
      const same = rot.every((f, i) => f === g.payload.target[i]);
      expect(score(g, rot).meta!.rotationError).toBe(same ? 0 : 1);
    }
  });

  it('scores a timeout as zero', () => {
    expect(score(item, null)).toEqual({ points: 0, correct: false, meta: { rotationError: 0, cells: 4, wrongCells: 4 } });
  });

  it('rates harder designs higher', () => {
    const p = (target: Face[], rows: number, cols: number, rotated = false) => designDifficulty({ rows, cols, target, rotated });
    expect(p(['R', 'W'], 1, 2)).toBeLessThan(p(['R', 'TL'], 1, 2));
    expect(p(['R', 'TL'], 1, 2)).toBeLessThan(p(['R', 'W', 'W', 'R'], 2, 2));
    expect(p(['R', 'W', 'W', 'R'], 2, 2)).toBeLessThan(p(['BR', 'BL', 'TR', 'TL'], 2, 2));
    const nine: Face[] = ['BR', 'W', 'BL', 'W', 'R', 'W', 'TR', 'W', 'TL'];
    expect(p(['BR', 'BL', 'TR', 'TL'], 2, 2)).toBeLessThan(p(nine, 3, 3));
    expect(p(nine, 3, 3)).toBeLessThan(p(nine, 3, 3, true));
  });
});

describe('Block Design formats: two-block, model and 2×2 diamond items', () => {
  it('tags every 1×2 item as two-block (and only those), keeping the other tags', () => {
    for (let s = 0; s < 200; s++) {
      for (const d of [3, 4, 4.5, 5, 6, 9, 12]) {
        const g = generate(req(d, s));
        const two = g.payload.rows * g.payload.cols === 2;
        expect(g.skills.includes('bd:two-block')).toBe(two);
        expect(g.skills).toContain('bd:solid');
        expect(g.skills.includes('bd:diagonal')).toBe(g.payload.target.some(isDiagonal));
      }
    }
  });

  it('starts the youngest on model items, mixes in pictures from ≈5.5 and stops models by 6.5', () => {
    for (let s = 0; s < 150; s++) {
      for (const d of [3, 4, 5, 5.25]) {
        const g = generate(req(d, s));
        expect(g.payload.model).toBe(true);
        expect(g.payload.rotated).toBe(false);
        expect(g.skills).toContain('bd:model');
      }
      for (const d of [6.5, 7, 9, 12, 17]) {
        const g = generate(req(d, s));
        expect(g.payload.model).toBeFalsy();
        expect(g.skills).not.toContain('bd:model');
      }
    }
    let model4 = 0, picture4 = 0;
    for (let s = 0; s < 200; s++) {
      for (const d of [5.5, 6]) {
        const g = generate(req(d, s));
        expect(g.payload.rows * g.payload.cols).toBe(4);
        expect(g.skills.includes('bd:model')).toBe(!!g.payload.model);
        if (g.payload.model) model4++; else picture4++;
      }
    }
    expect(model4).toBeGreaterThan(80);
    expect(picture4).toBeGreaterThan(80);
  });

  it('rates a 4-block model easier than the same design as a picture', () => {
    for (let s = 0; s < 100; s++) {
      const g = generate(req(6, s));
      const asPicture = designDifficulty({ ...g.payload, model: false });
      const asModel = designDifficulty({ ...g.payload, model: true });
      expect(asModel).toBeLessThan(asPicture);
      expect(g.difficulty).toBe(g.payload.model ? asModel : asPicture);
      expect(g.difficulty).toBeGreaterThanOrEqual(4.5);
      expect(g.difficulty).toBeLessThanOrEqual(7);
    }
  });

  it('mixes 2×2 diamonds in at ≈8.5–11, never below 8.5, and keeps 3×3 diamonds at the top', () => {
    let dia2 = 0;
    for (let s = 0; s < 150; s++) {
      for (const d of [3, 5, 6, 7, 8, 8.4]) expect(generate(req(d, s)).payload.rotated).toBe(false);
      for (const d of [8.5, 9, 9.5, 10, 10.5]) {
        const g = generate(req(d, s));
        if (g.payload.rows === 2 && g.payload.rotated) {
          dia2++;
          expect(g.skills).toEqual(expect.arrayContaining(['bd:rotated', 'bd:2x2']));
          expect(g.skills.includes('bd:diagonal')).toBe(g.payload.target.some(isDiagonal));
          expect(g.id).toMatch(/^BD:2x2:dia:/);
          expect(g.difficulty).toBeGreaterThanOrEqual(7.5);
          expect(g.difficulty).toBeLessThanOrEqual(11.1);
          expect(Math.abs(g.difficulty - d)).toBeLessThan(1.3);
        }
        if (g.payload.rows === 3) expect(g.payload.rotated).toBe(false);
      }
      for (const d of [11, 12, 14]) {
        const g = generate(req(d, s));
        expect(g.payload.rows).toBe(3);
        expect(g.payload.rotated).toBe(false);
      }
      const top = generate(req(16, s));
      expect(top.payload.rows).toBe(3);
      expect(top.payload.rotated).toBe(true);
    }
    // a solid share of the 8.5–10.5 band is diamonds, but not all of it
    expect(dia2).toBeGreaterThan(0.3 * 150 * 5);
    expect(dia2).toBeLessThan(0.7 * 150 * 5);
    // the coin flip for the format is deterministic too
    expect(formatFor(9, 123)).toEqual(formatFor(9, 123));
  });

  it('rates a 2×2 diamond harder than the same design upright, but below 3×3 designs', () => {
    for (let s = 0; s < 150; s++) {
      const g = generate(req(9.5, s));
      if (!g.payload.rotated) continue;
      const upright = designDifficulty({ ...g.payload, rotated: false });
      expect(g.difficulty).toBeGreaterThan(upright);
      expect(g.difficulty).toBe(designDifficulty(g.payload));
    }
    const hardestUpright2 = designDifficulty({ rows: 2, cols: 2, target: ['TL', 'TR', 'TR', 'BL'], rotated: false });
    const hardestDiamond2 = designDifficulty({ rows: 2, cols: 2, target: ['TL', 'TR', 'TR', 'BL'], rotated: true });
    let easiest3 = Infinity;
    for (let s = 0; s < 150; s++) {
      for (const d of [10.5, 11]) {
        const g = generate(req(d, s));
        if (g.payload.rows === 3) easiest3 = Math.min(easiest3, g.difficulty);
      }
    }
    expect(hardestUpright2).toBeLessThan(hardestDiamond2);
    expect(hardestDiamond2).toBeLessThanOrEqual(easiest3);
  });

  it('scores diamond builds: the exact build is correct, turned builds are rotation errors', () => {
    let checked = 0, rotChecked = 0;
    for (let s = 0; s < 200 && checked < 40; s++) {
      const g = generate(req(9.5, s));
      if (!(g.payload.rotated && g.payload.rows === 2)) continue;
      checked++;
      expect(score(g, g.payload.target.slice())).toMatchObject({ points: 1, correct: true, meta: { rotationError: 0, wrongCells: 0 } });
      let cur = { faces: g.payload.target, rows: 2, cols: 2 };
      for (let k = 1; k <= 3; k++) {
        cur = rotateDesign(cur.faces, cur.rows, cur.cols);
        const same = cur.faces.every((f, i) => f === g.payload.target[i]);
        const out = score(g, cur.faces);
        expect(out.correct).toBe(same);
        expect(out.meta!.rotationError).toBe(same ? 0 : 1);
        if (!same) { rotChecked++; expect(out.feedback).toMatch(/turned around/); }
      }
      const oneOff = g.payload.target.slice();
      oneOff[3] = oneOff[3] === 'R' ? 'W' : 'R';
      expect(score(g, oneOff)).toMatchObject({ points: 0, correct: false });
      expect(score(g, oneOff).meta!.wrongCells).toBe(1);
    }
    expect(checked).toBe(40);
    expect(rotChecked).toBeGreaterThan(20);
  });

  it('gives model and diamond items fitting teaching text', () => {
    const m = generate(req(4, 2));
    expect(m.speak).toMatch(/Pip's blocks/);
    expect(m.hints.join(' ')).toMatch(/Pip/);
    let dia = null;
    for (let s = 0; s < 50 && !dia; s++) {
      const g = generate(req(9, s));
      if (g.payload.rotated) dia = g;
    }
    expect(dia).not.toBeNull();
    expect(dia!.hints[0]).toMatch(/diamond/);
    expect(dia!.steps![0]).toMatch(/the top one/);
    expect(dia!.steps!.length).toBe(2 + 2);
  });
});

describe('Block Design model items: two trials', () => {
  it('scores model items 2 on trial 1, 1 on trial 2, 0 otherwise (maxPoints 2), with meta.trial', () => {
    let checked = 0;
    for (let s = 0; s < 60; s++) {
      for (const d of [3, 4.5, 5.25]) {
        const g = generate(req(d, s));
        expect(g.payload.model).toBe(true);
        expect(g.maxPoints).toBe(2);
        const t = g.payload.target;
        const wrong = t.map((f) => (f === 'R' ? 'W' : 'R')) as Face[];
        const first = score(g, { cells: t.slice(), trial: 1 });
        expect(first).toMatchObject({ points: 2, correct: true, meta: { trial: 1, wrongCells: 0 } });
        expect(score(g, t.slice())).toMatchObject({ points: 2, meta: { trial: 1 } }); // plain array = trial 1
        const second = score(g, { cells: t.slice(), trial: 2 });
        expect(second).toMatchObject({ points: 1, correct: true, meta: { trial: 2 } });
        expect(second.feedback).toMatch(/second try/);
        expect(score(g, { cells: wrong, trial: 2 })).toMatchObject({ points: 0, correct: false, meta: { trial: 2 } });
        expect(score(g, { cells: wrong, trial: 1 }).points).toBe(0);
        expect(score(g, null)).toMatchObject({ points: 0, correct: false, meta: { trial: 1 } });
        checked++;
      }
    }
    expect(checked).toBe(180);
  });

  it('keeps 1-point scoring (and no trial meta) for picture items', () => {
    for (let s = 0; s < 50; s++) {
      for (const d of [7, 9, 12, 16]) {
        const g = generate(req(d, s));
        expect(g.payload.model).toBeFalsy();
        expect(g.maxPoints).toBe(1);
        const cells = g.payload.board ? placeOnBoard(g.payload, g.payload.target, 0, 0) : g.payload.target.slice();
        const out = score(g, { cells, trial: 2 });
        expect(out.points).toBe(1);
        expect(out.meta!.trial).toBeUndefined();
      }
    }
  });
});

/** Put a design-shaped build (`cols` wide) onto an empty open board with its top-left corner at (r0, c0). */
function placeOnBoard(p: BdPayload, faces: readonly (Face | null)[], r0: number, c0: number, cols = p.cols): (Face | null)[] {
  const b = p.board!;
  const out: (Face | null)[] = new Array(b.rows * b.cols).fill(null);
  faces.forEach((f, i) => { out[(r0 + Math.floor(i / cols)) * b.cols + c0 + (i % cols)] = f; });
  return out;
}

describe('Block Design open build board (picture items ≥ 8)', () => {
  const boardItems = (d: number, count: number) => {
    const out = [];
    for (let s = 0; out.length < count && s < 500; s++) {
      const g = generate(req(d, s));
      if (g.payload.board) out.push(g);
    }
    return out;
  };

  it('uses an open board only for upright picture items at ≥ 8: 4×4 for 2×2, 5×5 for 3×3', () => {
    let open2 = 0, open3 = 0;
    for (let s = 0; s < 150; s++) {
      for (const d of [3, 4, 5, 6, 7, 7.9]) expect(generate(req(d, s)).payload.board).toBeUndefined();
      for (const d of [8, 9, 10, 11, 13, 15, 17]) {
        const g = generate(req(d, s));
        const p = g.payload;
        if (p.rotated || p.model) {
          expect(p.board).toBeUndefined();
          continue;
        }
        expect(p.board).toEqual(p.rows === 2 ? { rows: 4, cols: 4 } : { rows: 5, cols: 5 });
        expect(g.skills).toContain('bd:open-board');
        expect(g.id).toMatch(/:open:/);
        expect(g.difficulty).toBe(designDifficulty(p));
        if (p.rows === 2) open2++; else open3++;
      }
    }
    expect(open2).toBeGreaterThan(50);
    expect(open3).toBeGreaterThan(300);
    // the board is part of the deterministic item
    expect(generate(req(9, 7))).toEqual(generate(req(9, 7)));
    // an open board rates a little harder than the same design in a tray
    const g = boardItems(9, 1)[0];
    expect(designDifficulty(g.payload)).toBeGreaterThan(designDifficulty({ ...g.payload, board: undefined }));
  });

  it('credits the exact design built anywhere on the board, and only that', () => {
    for (const g of [...boardItems(8, 20), ...boardItems(12, 20)]) {
      const p = g.payload;
      const b = p.board!;
      for (let r0 = 0; r0 + p.rows <= b.rows; r0++) {
        for (let c0 = 0; c0 + p.cols <= b.cols; c0++) {
          const out = score(g, { cells: placeOnBoard(p, p.target, r0, c0), dimensionError: false });
          expect(out).toMatchObject({ points: 1, correct: true, meta: { dimensionError: 0, rotationError: 0, wrongCells: 0 } });
        }
      }
      // one block changed → wrong
      const off = p.target.slice();
      off[0] = off[0] === 'R' ? 'W' : 'R';
      expect(score(g, { cells: placeOnBoard(p, off, 1, 1) })).toMatchObject({ points: 0, correct: false, meta: { wrongCells: 1 } });
      // the right design plus a stray block elsewhere → wrong (and too big)
      const stray = placeOnBoard(p, p.target, 0, 0);
      stray[stray.length - 1] = 'R';
      expect(score(g, { cells: stray })).toMatchObject({ correct: false, meta: { dimensionError: 1 } });
      // empty board
      expect(score(g, { cells: new Array(b.rows * b.cols).fill(null) }).correct).toBe(false);
    }
  });

  it('records a dimension error for a 3-wide row on a 2×2 design (in the final build or earlier)', () => {
    const items = boardItems(8, 15).filter((g) => g.payload.rows === 2);
    expect(items.length).toBeGreaterThan(5);
    for (const g of items) {
      const p = g.payload;
      const t = p.target;
      // three blocks in a row, the fourth under the first: a 2-tall, 3-wide shape
      const cells = placeOnBoard(p, [t[0], t[1], t[2], t[3], null, null], 0, 0, 3);
      expect(exceedsDesign(cells, 4, 2, 2)).toBe(true);
      const out = score(g, { cells, dimensionError: true });
      expect(out).toMatchObject({ points: 0, correct: false, meta: { dimensionError: 1 } });
      expect(out.feedback).toMatch(/too big/);
      // the scorer catches an oversize final build even without the player's flag
      expect(score(g, { cells }).meta!.dimensionError).toBe(1);
      // spread out earlier (player's sticky flag), fixed by the end: still recorded, still correct
      expect(score(g, { cells: placeOnBoard(p, t, 2, 1), dimensionError: true })).toMatchObject({ points: 1, correct: true, meta: { dimensionError: 1 } });
      // a right-size build with nothing flagged is no dimension error
      expect(score(g, { cells: placeOnBoard(p, t, 1, 2) }).meta!.dimensionError).toBe(0);
    }
    const tall: (Face | null)[] = new Array(16).fill(null);
    tall[1] = 'R'; tall[5] = 'R'; tall[9] = 'W';
    expect(exceedsDesign(tall, 4, 2, 2)).toBe(true);
    expect(placedBox(tall, 4)).toEqual({ r0: 0, c0: 1, rows: 3, cols: 1 });
  });

  it('flags a turned build anywhere on the board as a rotation error', () => {
    let rot = 0;
    for (const g of [...boardItems(9, 20), ...boardItems(13, 20)]) {
      const p = g.payload;
      let cur = { faces: p.target, rows: p.rows, cols: p.cols };
      for (let k = 1; k <= 3; k++) {
        cur = rotateDesign(cur.faces, cur.rows, cur.cols);
        const same = cur.faces.every((f, i) => f === p.target[i]);
        const out = score(g, { cells: placeOnBoard(p, cur.faces, 1, 0) });
        expect(out.correct).toBe(same);
        expect(out.meta!.rotationError).toBe(same ? 0 : 1);
        expect(out.meta!.dimensionError).toBe(0);
        if (!same) { rot++; expect(out.feedback).toMatch(/turned around/); }
      }
    }
    expect(rot).toBeGreaterThan(60);
    const g = boardItems(9, 1)[0];
    const p = g.payload;
    expect(judgeBoard(p.target, p.rows, p.cols, placeOnBoard(p, p.target, 1, 2), p.board!).anchor).toEqual({ r: 1, c: 2 });
  });

  it('still reads a design-sized array on a board item as a tray build', () => {
    const g = boardItems(9, 1)[0];
    expect(score(g, g.payload.target.slice())).toMatchObject({ points: 1, correct: true, meta: { dimensionError: 0 } });
    expect(score(g, null)).toMatchObject({ points: 0, meta: { dimensionError: 0 } });
  });
});
