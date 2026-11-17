/**
 * Block Design ("Block Builder"). The child sees a red-and-white design (drawn without block lines,
 * like the real task) and rebuilds it in an empty grid of blocks. Each block face is all red, all
 * white, or half-and-half split on a diagonal (4 ways round).
 *
 * Formats along the difficulty curve (mirroring the real test's progression):
 *  - youngest (≈3–6.5): MODEL items — Pip's design is shown as real blocks (outlines + bevel), the
 *    child copies the blocks; 2-block items are always models, 4-block ones are models up to ≈6.5;
 *  - 2×2 picture items from ≈5.5; 2×2 DIAMOND items (picture and tray turned 45°) mixed in at ≈8.5–11;
 *  - 3×3 picture items from ≈10.25; 3×3 diamonds at the very top (≥15.75).
 *
 * Real-format details (format study #7):
 *  - model items allow two trials: a miss on trial 1 → Pip rebuilds the model block by block and the
 *    child tries again; scored 2/1/0 (maxPoints 2), `meta.trial`;
 *  - upright picture items requested at ≥ 8 use an OPEN BOARD (4×4 for 2×2, 5×5 for 3×3) with exactly
 *    the blocks needed: the child must judge the design's size; any position on the board is fine;
 *    `meta.dimensionError` = the build was ever wider/taller than the design (the real BDde).
 *    Diamonds keep their turned, design-sized tray. Hint ≥ 1 still draws block lines on the picture.
 *
 * Layout follows the DS reference module: pure generate/score at the top, Player below, guide last.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { createRng, type Rng } from '../../core/rng';
import type { GenerateRequest, Item, PlayerProps, ScoreOutcome, SubtestGuide, SubtestModule } from '../../core/types';
import { ChoiceGrid, PipSays } from '../../ui/kit';
import { SHAPE_COLORS } from '../../ui/shapes';

/** R = all red, W = all white, TL/TR/BR/BL = half red, with the red triangle in that corner. */
export type Face = 'R' | 'W' | 'TL' | 'TR' | 'BR' | 'BL';
export const FACES: readonly Face[] = ['R', 'W', 'TL', 'TR', 'BR', 'BL'];
export const isDiagonal = (f: Face) => f !== 'R' && f !== 'W';

export interface BdPayload {
  rows: number;
  cols: number;
  /** Row-major target faces. */
  target: Face[];
  /** Diamond items: the design (and build tray) are shown turned 45°. */
  rotated: boolean;
  /**
   * Model items (youngest): the design is shown as Pip's built blocks, block edges visible. They get
   * two trials (as in the real test): a miss on trial 1 → Pip rebuilds the model, child tries again.
   * Scored 2 (trial 1) / 1 (trial 2) / 0, so their maxPoints is 2.
   */
  model?: boolean;
  /**
   * Open build board (upright picture items at difficulty ≥ 8): instead of a design-sized tray the
   * child gets a bigger empty board (4×4 for 2×2 designs, 5×5 for 3×3) and exactly the blocks needed,
   * and has to work out the design's size. Judged by the blocks placed, wherever they sit.
   */
  board?: { rows: number; cols: number };
}
/** Row-major cells; null = empty slot. Either the design-sized tray or the whole open board. */
export type BdCells = (Face | null)[];
/** A build with process info from the player. */
export interface BdAttempt {
  cells: BdCells;
  /** Model items: the trial this build was made on (1 or 2). */
  trial?: 1 | 2;
  /** Open board: at some point the placed blocks spread wider or taller than the design. */
  dimensionError?: boolean;
}
/** A plain array is a build on trial 1 with no process info (kept for simple callers). */
export type BdResponse = BdCells | BdAttempt;

/** Board size for an open-board item: two spare rows/columns beyond the design. */
export function boardFor(rows: number, cols: number): { rows: number; cols: number } {
  return { rows: rows + 2, cols: cols + 2 };
}

/** Bounding box of the placed blocks on a board (null when the board is empty). */
export function placedBox(cells: readonly (Face | null)[], boardCols: number): { r0: number; c0: number; rows: number; cols: number } | null {
  let r0 = Infinity, c0 = Infinity, r1 = -1, c1 = -1;
  cells.forEach((f, i) => {
    if (f === null) return;
    const r = Math.floor(i / boardCols), c = i % boardCols;
    r0 = Math.min(r0, r); c0 = Math.min(c0, c); r1 = Math.max(r1, r); c1 = Math.max(c1, c);
  });
  return r1 < 0 ? null : { r0, c0, rows: r1 - r0 + 1, cols: c1 - c0 + 1 };
}

/** True when the placed blocks already span more rows or columns than the design has (a dimension error). */
export function exceedsDesign(cells: readonly (Face | null)[], boardCols: number, rows: number, cols: number): boolean {
  const box = placedBox(cells, boardCols);
  return !!box && (box.rows > rows || box.cols > cols);
}

export interface BoardJudgement {
  /** Blocks that differ from the target at the best-fitting position, plus blocks outside it. */
  wrongCells: number;
  rotationError: 0 | 1;
  /** The final build is wider or taller than the design. */
  oversize: boolean;
  /** Board row/column of the design's top-left corner at the best-fitting position. */
  anchor: { r: number; c: number };
}

/**
 * Judge an open-board build: try every position of a design-sized window on the board (any
 * translation is fine) and keep the best fit. Correct ⇔ some window holds exactly the target and
 * no block lies outside it.
 */
export function judgeBoard(
  target: readonly Face[], rows: number, cols: number, cells: readonly (Face | null)[], board: { rows: number; cols: number },
): BoardJudgement {
  const placed = cells.filter((f) => f !== null).length;
  let best = Infinity, anchor = { r: 0, c: 0 }, rotated = false;
  for (let ar = 0; ar + rows <= board.rows; ar++) {
    for (let ac = 0; ac + cols <= board.cols; ac++) {
      const win: (Face | null)[] = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) win.push(cells[(ar + r) * board.cols + ac + c]);
      const inside = win.filter((f) => f !== null).length;
      const wrong = win.reduce((s, f, i) => s + (f === target[i] ? 0 : 1), 0) + (placed - inside);
      if (wrong < best) { best = wrong; anchor = { r: ar, c: ac }; }
      if (inside === placed && isRotationOf(target, rows, cols, win)) rotated = true;
    }
  }
  return { wrongCells: best, rotationError: best > 0 && rotated ? 1 : 0, oversize: exceedsDesign(cells, board.cols, rows, cols), anchor };
}

// ---------- face geometry ----------

export const ROT_CW: Record<Face, Face> = { R: 'R', W: 'W', TL: 'TR', TR: 'BR', BR: 'BL', BL: 'TL' };
const MIR_H: Record<Face, Face> = { R: 'R', W: 'W', TL: 'TR', TR: 'TL', BL: 'BR', BR: 'BL' };
const MIR_V: Record<Face, Face> = { R: 'R', W: 'W', TL: 'BL', BL: 'TL', TR: 'BR', BR: 'TR' };
const TRANSPOSE: Record<Face, Face> = { R: 'R', W: 'W', TL: 'TL', BR: 'BR', TR: 'BL', BL: 'TR' };

/** Turn a whole design 90° clockwise (the blocks move and each face turns too). */
export function rotateDesign(faces: readonly Face[], rows: number, cols: number): { faces: Face[]; rows: number; cols: number } {
  const out: Face[] = new Array(rows * cols);
  // new grid is cols × rows; new(r, c) comes from old(rows-1-c, r)
  for (let r = 0; r < cols; r++) {
    for (let c = 0; c < rows; c++) out[r * rows + c] = ROT_CW[faces[(rows - 1 - c) * cols + r]];
  }
  return { faces: out, rows: cols, cols: rows };
}

/** True when `build` is the target turned by 90°, 180° or 270° (but not the target itself). */
export function isRotationOf(target: readonly Face[], rows: number, cols: number, build: readonly (Face | null)[]): boolean {
  if (build.length !== target.length || build.some((f) => f === null)) return false;
  if (build.every((f, i) => f === target[i])) return false;
  let cur = { faces: target.slice(), rows, cols };
  for (let k = 1; k <= 3; k++) {
    cur = rotateDesign(cur.faces, cur.rows, cur.cols);
    if (cur.rows === rows && cur.cols === cols && cur.faces.every((f, i) => f === build[i])) return true;
  }
  return false;
}

// ---------- symmetry groups (used to make "design-like" targets) ----------

interface Sym {
  cell: number[];
  face: Record<Face, Face>;
}

function idSym(n: number): Sym {
  return { cell: Array.from({ length: n }, (_, i) => i), face: { R: 'R', W: 'W', TL: 'TL', TR: 'TR', BR: 'BR', BL: 'BL' } };
}

function compose(a: Sym, b: Sym): Sym {
  const face = {} as Record<Face, Face>;
  for (const f of FACES) face[f] = b.face[a.face[f]];
  return { cell: a.cell.map((j) => b.cell[j]), face };
}

const symKey = (s: Sym) => `${s.cell.join(',')}|${FACES.map((f) => s.face[f]).join('')}`;

type Prim = 'rot90' | 'mirH' | 'mirV' | 'diag';

function primitive(kind: Prim, rows: number, cols: number): Sym {
  const cell: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let nr = r, nc = c;
      if (kind === 'rot90') { nr = c; nc = rows - 1 - r; }
      if (kind === 'mirH') { nc = cols - 1 - c; }
      if (kind === 'mirV') { nr = rows - 1 - r; }
      if (kind === 'diag') { nr = c; nc = r; }
      cell.push(nr * cols + nc);
    }
  }
  const face = kind === 'rot90' ? ROT_CW : kind === 'mirH' ? MIR_H : kind === 'mirV' ? MIR_V : TRANSPOSE;
  return { cell, face };
}

function closure(gens: Sym[], n: number): Sym[] {
  const out = new Map<string, Sym>();
  const start = idSym(n);
  out.set(symKey(start), start);
  const queue = [start];
  while (queue.length) {
    const s = queue.shift()!;
    for (const g of gens) {
      const t = compose(s, g);
      const k = symKey(t);
      if (!out.has(k)) { out.set(k, t); queue.push(t); }
    }
  }
  return [...out.values()];
}

const GROUPS_SQUARE: Prim[][] = [['mirH'], ['mirV'], ['mirH', 'mirV'], ['diag'], ['rot90'], ['rot90', 'mirH']];

const symCache = new Map<string, Sym[]>();
function allSymmetries(rows: number, cols: number): Sym[] {
  const ck = `${rows}x${cols}`;
  const hit = symCache.get(ck);
  if (hit) return hit;
  const gens: Sym[] = [primitive('mirH', rows, cols), primitive('mirV', rows, cols)];
  if (rows === cols) gens.push(primitive('rot90', rows, cols), primitive('diag', rows, cols));
  const out = closure(gens, rows * cols).filter((s) => symKey(s) !== symKey(idSym(rows * cols)));
  symCache.set(ck, out);
  return out;
}

/** True when some flip or turn maps the design onto itself. */
export function isSymmetric(faces: readonly Face[], rows: number, cols: number): boolean {
  return allSymmetries(rows, cols).some((g) => faces.every((f, i) => faces[g.cell[i]] === g.face[f]));
}

function fillSymmetric(group: Sym[], n: number, pick: () => Face, rng: Rng): Face[] | null {
  const out: (Face | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (out[i]) continue;
    const tries = [pick(), ...rng.shuffle(FACES)];
    for (const f of tries) {
      const assign = new Map<number, Face>();
      let ok = true;
      for (const g of group) {
        const j = g.cell[i];
        const v = g.face[f];
        const prev = assign.get(j);
        if (prev && prev !== v) { ok = false; break; }
        assign.set(j, v);
      }
      if (ok) { assign.forEach((v, j) => (out[j] = v)); break; }
    }
    if (!out[i]) return null;
  }
  return out as Face[];
}

// ---------- difficulty model ----------

export function redShare(faces: readonly Face[]): number {
  return faces.reduce((s, f) => s + (f === 'R' ? 1 : f === 'W' ? 0 : 0.5), 0) / faces.length;
}

/**
 * Age-equivalent difficulty of a design: more blocks, more diagonals, less symmetry, diamond view ⇒
 * harder; a model (block edges visible, so the design is already cut into blocks) ⇒ easier.
 * 2-block items are always presented as models here, so their base already assumes it.
 */
export function designDifficulty(p: BdPayload): number {
  const cells = p.rows * p.cols;
  const diag = p.target.filter(isDiagonal).length;
  const sym = isSymmetric(p.target, p.rows, p.cols);
  let d: number;
  // An open board (no outline to fill, the child must judge the size) is a little harder.
  const open = p.board ? 0.3 : 0;
  if (cells <= 2) d = 4 + (diag > 0 ? 1 : 0) + (diag === 2 ? 0.4 : 0);
  else if (cells <= 4) d = 5.5 + 0.8 * diag + (sym ? 0 : 0.8) + (p.rotated ? 1.5 : 0) - (p.model ? 0.5 : 0) + open;
  else d = 10 + 0.35 * diag + (sym ? 0 : 2) + (p.rotated ? 1.5 : 0) - (p.model ? 0.5 : 0) + open;
  return Math.round(d * 100) / 100;
}

export function timeLimitFor(p: BdPayload): number {
  const diag = p.target.filter(isDiagonal).length;
  if (p.rows * p.cols <= 2) return 30;
  if (p.rows * p.cols <= 4) return diag <= 1 ? 30 : diag === 2 ? 45 : 75;
  return 120;
}

export interface BdFormat {
  rows: number;
  cols: number;
  rotated: boolean;
  model: boolean;
}

/**
 * Grid size and presentation for a requested difficulty. Where two formats overlap (model vs picture
 * at ≈5.5–6.5, upright vs diamond 2×2 at ≈8.5–11) a coin flip from its own seeded stream decides, so
 * the design stream itself is unchanged.
 */
export function formatFor(difficulty: number, seed: number): BdFormat {
  const roll = createRng((seed ^ 0x5bd1e995) >>> 0).next();
  if (difficulty < 5.25) return { rows: 1, cols: 2, rotated: false, model: true };
  if (difficulty < 8.5) return { rows: 2, cols: 2, rotated: false, model: difficulty < 5.5 || (difficulty < 6.5 && roll < 0.5) };
  if (difficulty < 11) {
    if (roll < 0.5) return { rows: 2, cols: 2, rotated: true, model: false };
    return difficulty < 10.25 ? { rows: 2, cols: 2, rotated: false, model: false } : { rows: 3, cols: 3, rotated: false, model: false };
  }
  return { rows: 3, cols: 3, rotated: difficulty >= 15.75, model: false };
}

function makeCandidate(rows: number, cols: number, rng: Rng): Face[] | null {
  const n = rows * cols;
  const pDiag = rng.pick([0, 0, 0.25, 0.5, 0.75, 1]);
  const pick = (): Face => (rng.chance(pDiag) ? rng.pick<Face>(['TL', 'TR', 'BR', 'BL']) : rng.pick<Face>(['R', 'W']));
  let faces: Face[] | null;
  if (rows === 1) {
    const g = rng.chance(0.5) ? [idSym(n)] : closure([primitive('mirH', rows, cols)], n);
    faces = fillSymmetric(g, n, pick, rng);
  } else {
    const choice = rng.int(0, GROUPS_SQUARE.length);
    const r90 = primitive('rot90', rows, cols);
    const gens = choice === GROUPS_SQUARE.length ? [compose(r90, r90)] /* half-turn symmetry */ : GROUPS_SQUARE[choice].map((g) => primitive(g, rows, cols));
    const group = closure(gens, n);
    faces = fillSymmetric(group, n, pick, rng);
    // Sometimes break the symmetry a little: still pattern-like, but harder to read.
    if (faces && rng.chance(0.35)) {
      const changes = rng.int(1, 2);
      for (let k = 0; k < changes; k++) {
        const i = rng.int(0, n - 1);
        faces[i] = isDiagonal(faces[i]) ? (rng.chance(0.6) ? ROT_CW[faces[i]] : rng.pick<Face>(['R', 'W'])) : rng.pick<Face>(['TL', 'TR', 'BR', 'BL']);
      }
    }
  }
  if (!faces) return null;
  if (faces.every((f) => f === faces![0])) return null;
  const share = redShare(faces);
  if (n >= 4 && (share < 0.25 || share > 0.75)) return null;
  if (n >= 9 && faces.filter(isDiagonal).length < 3) return null;
  return faces;
}

// ---------- words ----------

export const FACE_WORDS: Record<Face, string> = {
  R: 'all red',
  W: 'all white',
  TL: 'half red, red corner at the top left',
  TR: 'half red, red corner at the top right',
  BR: 'half red, red corner at the bottom right',
  BL: 'half red, red corner at the bottom left',
};

/** Where a block sits as the child sees it (a diamond view turns the grid 45° clockwise). */
function cellName(i: number, rows: number, cols: number, rotated = false): string {
  const r = Math.floor(i / cols), c = i % cols;
  if (rows === 1) return c === 0 ? 'left' : 'right';
  if (rotated) {
    const v = r === 0 ? 0 : r === rows - 1 ? 2 : 1; // 0 top row, 1 middle, 2 bottom
    const h = c === 0 ? 0 : c === cols - 1 ? 2 : 1;
    const names = [
      ['top', 'upper right', 'right'],
      ['upper left', 'center', 'lower right'],
      ['left', 'lower left', 'bottom'],
    ];
    return names[v][h];
  }
  const v = r === 0 ? 'top' : r === rows - 1 ? 'bottom' : 'middle';
  const h = c === 0 ? 'left' : c === cols - 1 ? 'right' : 'middle';
  if (v === 'middle' && h === 'middle') return 'center';
  return `${v} ${h}`;
}

// ---------- generate / score ----------

export function generate(req: GenerateRequest): Item<BdPayload> {
  const rng = createRng(req.seed);
  const want = Math.max(3, Math.min(18, req.difficulty));
  const { rows, cols, rotated, model } = formatFor(want, req.seed);
  // Open build board: upright picture items from difficulty 8 (diamonds keep their turned tray).
  const board = !model && !rotated && rows > 1 && want >= 8 ? boardFor(rows, cols) : undefined;
  const view = (p: Omit<BdPayload, 'rotated' | 'model' | 'board'>): BdPayload =>
    model ? { ...p, rotated, model } : board ? { ...p, rotated, board } : { ...p, rotated };
  let best: BdPayload | null = null;
  let bestGap = Infinity;
  for (let k = 0; k < 90; k++) {
    const faces = makeCandidate(rows, cols, rng);
    if (!faces) continue;
    const p = view({ rows, cols, target: faces });
    const gap = Math.abs(designDifficulty(p) - want);
    if (gap < bestGap - 1e-9) { best = p; bestGap = gap; }
  }
  if (!best) {
    // Practically unreachable; a fixed tidy design keeps the generator total.
    best = view(rows === 1 ? { rows, cols, target: ['R', 'W'] } : { rows, cols, target: Array.from({ length: rows * cols }, (_, i) => (i % 2 ? 'W' : 'R')) });
  }
  const p = best;
  const n = rows * cols;
  const diag = p.target.filter(isDiagonal).length;
  const solid = n - diag;
  const corner = 0;
  const cornerName = cellName(corner, rows, cols, rotated);
  const stepRows: string[] = [];
  for (let r = 0; r < rows; r++) {
    const parts = p.target.slice(r * cols, (r + 1) * cols).map((f) => FACE_WORDS[f].replace(/, red corner at the /, ' (red corner ') + (isDiagonal(f) ? ')' : ''));
    stepRows.push(
      rows === 1 ? `Left to right: ${parts.join(', then ')}.`
        : rotated ? `Row ${r + 1}, from the ${cellName(r * cols, rows, cols, true)} block going down to the right: ${parts.join(', then ')}.`
          : `Row ${r + 1}, left to right: ${parts.join(', then ')}.`,
    );
  }
  const skills = ['bd:solid'];
  if (diag > 0) skills.push('bd:diagonal');
  if (n === 2) skills.push('bd:two-block');
  if (n >= 4) skills.push(n === 4 ? 'bd:2x2' : 'bd:3x3');
  if (rotated) skills.push('bd:rotated');
  if (model) skills.push('bd:model');
  if (board) skills.push('bd:open-board');
  const look = model ? "Pip's blocks" : 'the picture';
  const sizeWords = `${cols} blocks wide and ${rows} blocks tall`;
  return {
    id: `BD:${rows}x${cols}:${rotated ? 'dia:' : ''}${model ? 'model:' : ''}${board ? 'open:' : ''}${p.target.join('')}`,
    subtest: 'BD',
    difficulty: designDifficulty(p),
    seed: req.seed,
    payload: p,
    maxPoints: model ? 2 : 1,
    timeLimitSec: timeLimitFor(p),
    skills,
    hints: [
      model
        ? "Look at Pip's blocks one at a time. Is each block red, white, or half and half?"
        : `Look at the corners of the picture first. Is each corner red, white, or half and half?${rotated ? ' The picture is turned like a diamond — your tray is turned the same way.' : ''}`,
      model
        ? `Pip used ${n} blocks${n > 2 ? ` — ${rows} rows of ${cols}` : ''}. Copy them one block at a time.`
        : `Imagine lines cutting the picture into ${n} blocks${n > 2 ? ` — ${rows} rows of ${cols}` : ''}. Build one block at a time.${board ? ` Your design is ${sizeWords} — keep it that size!` : ''}`,
      `Start with a corner block: the ${cornerName} block is ${FACE_WORDS[p.target[corner]]}.`,
    ],
    explanation:
      `This design is ${n} blocks: ${solid} all one colour and ${diag} half-and-half. ` +
      (diag > 0 ? 'The half-red blocks fit together to make the triangles and diamonds you see.' : 'Each block is either all red or all white.') +
      (rotated ? ' The diamond is just the square design turned on its corner — each block goes in the same spot.' : ''),
    steps: [
      `${board ? `The design is ${sizeWords}, so it fills a ${rows}-by-${cols} square anywhere on your board. ` : ''}Start with a corner block: the ${cornerName} one is ${FACE_WORDS[p.target[corner]]}.${rotated ? ' (Your tray is turned like the picture, so match spot for spot.)' : ''}`,
      ...stepRows,
      `Check your build row by row against ${look}.`,
    ],
    speak: model ? "Look at Pip's blocks. Use your blocks to build the very same thing." : 'Look at the picture. Use the blocks to build the same design.',
  };
}

/** The cells of a response, whatever its shape. */
export function responseCells(response: BdResponse): BdCells {
  return Array.isArray(response) ? response : response.cells;
}

/**
 * Model items: 2 = right on trial 1, 1 = right on trial 2, 0 otherwise (`meta.trial` = the trial of
 * the scored build). Other items: 1/0. Open-board items also report `meta.dimensionError` (the
 * build ever got wider/taller than the design — sticky from the player, or visible in the final build).
 * A plain design-sized array is accepted for any item and read as a tray build.
 */
export function score(item: Item<BdPayload>, response: BdResponse | null): ScoreOutcome {
  const p = item.payload;
  const { target, rows, cols } = p;
  const cells = target.length;
  const extra = (trial: number, dimensionError: number): Record<string, number> => ({
    ...(p.model ? { trial } : {}),
    ...(p.board ? { dimensionError } : {}),
  });
  if (!response) return { points: 0, correct: false, meta: { rotationError: 0, cells, wrongCells: cells, ...extra(1, 0) } };
  const attempt: BdAttempt = Array.isArray(response) ? { cells: response } : response;
  const trial = p.model && attempt.trial === 2 ? 2 : 1;
  let dimensionError = attempt.dimensionError ? 1 : 0;
  const build = attempt.cells;
  let wrongCells = 0;
  let correct: boolean;
  let rotationError: number;
  if (p.board && build.length === p.board.rows * p.board.cols) {
    const j = judgeBoard(target, rows, cols, build, p.board);
    if (j.oversize) dimensionError = 1;
    wrongCells = j.wrongCells;
    correct = wrongCells === 0;
    rotationError = j.rotationError;
  } else {
    for (let i = 0; i < cells; i++) if (build[i] !== target[i]) wrongCells++;
    correct = wrongCells === 0 && build.length === cells;
    rotationError = !correct && isRotationOf(target, rows, cols, build) ? 1 : 0;
  }
  let feedback: string | undefined;
  if (rotationError) feedback = 'Your design is turned around! It has the right blocks, but it points the wrong way.';
  else if (!correct && p.board && exceedsDesign(build, p.board.cols, rows, cols)) feedback = `Your design got too big — this one is only ${cols} blocks wide and ${rows} blocks tall.`;
  else if (!correct && wrongCells === 1) feedback = 'So close — just one block is different. Check the half-red ones!';
  else if (correct && trial === 2) feedback = 'You got it on your second try — great fixing!';
  const points = !correct ? 0 : p.model ? (trial === 1 ? 2 : 1) : 1;
  return { points, correct, meta: { rotationError, cells, wrongCells, ...extra(trial, dimensionError) }, feedback };
}

// ---------- drawing ----------

const RED = SHAPE_COLORS.red;
const WHITE = '#fffdf6';

function redPoints(face: Face, x: number, y: number, s: number): string | null {
  const tl = `${x},${y}`, tr = `${x + s},${y}`, br = `${x + s},${y + s}`, bl = `${x},${y + s}`;
  switch (face) {
    case 'R': return `${tl} ${tr} ${br} ${bl}`;
    case 'W': return null;
    case 'TL': return `${tl} ${tr} ${bl}`;
    case 'TR': return `${tl} ${tr} ${br}`;
    case 'BR': return `${tr} ${br} ${bl}`;
    case 'BL': return `${tl} ${br} ${bl}`;
  }
}

/** One block face, drawn inside an existing svg. */
function FaceGlyph({ face, x, y, s }: { face: Face; x: number; y: number; s: number }) {
  const pts = redPoints(face, x, y, s);
  return (
    <>
      <rect x={x} y={y} width={s} height={s} fill={WHITE} stroke={WHITE} strokeWidth={0.6} />
      {pts && <polygon points={pts} fill={RED} stroke={RED} strokeWidth={0.6} strokeLinejoin="round" />}
    </>
  );
}

export function FaceIcon({ face, size = 44 }: { face: Face; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 50 50" aria-hidden>
      <FaceGlyph face={face} x={3} y={3} s={44} />
      <rect x={3} y={3} width={44} height={44} fill="none" stroke="var(--ink)" strokeWidth={3} rx={2} />
    </svg>
  );
}

/** The design picture. No block lines unless `grid` (the hint scaffold or the answer view). */
function DesignPicture({ p, cell, grid, label }: { p: { rows: number; cols: number; target: Face[] }; cell: number; grid: 'none' | 'faint' | 'solid'; label: string }) {
  const w = p.cols * cell, h = p.rows * cell, pad = 4;
  return (
    <svg width={w + pad * 2} height={h + pad * 2} viewBox={`${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`} role="img" aria-label={label}>
      {p.target.map((f, i) => (
        <FaceGlyph key={i} face={f} x={(i % p.cols) * cell} y={Math.floor(i / p.cols) * cell} s={cell} />
      ))}
      {grid !== 'none' && (
        <g stroke={grid === 'faint' ? 'rgba(29,43,42,0.45)' : 'var(--ink)'} strokeWidth={grid === 'faint' ? 1.5 : 2} strokeDasharray={grid === 'faint' ? '5 4' : undefined}>
          {Array.from({ length: p.cols - 1 }, (_, c) => <line key={`v${c}`} x1={(c + 1) * cell} y1={0} x2={(c + 1) * cell} y2={h} />)}
          {Array.from({ length: p.rows - 1 }, (_, r) => <line key={`h${r}`} x1={0} y1={(r + 1) * cell} x2={w} y2={(r + 1) * cell} />)}
        </g>
      )}
      <rect x={0} y={0} width={w} height={h} fill="none" stroke="var(--ink)" strokeWidth={3} />
    </svg>
  );
}

/** A model: the design as Pip's real blocks — each block outlined, with a little 3D depth. */
function ModelBlocks({ p, cell, label, shown }: { p: { rows: number; cols: number; target: Face[] }; cell: number; label: string; shown?: number }) {
  const gap = 3, depth = 5, pad = 4;
  const w = p.cols * cell + depth, h = p.rows * cell + depth;
  return (
    <svg width={w + pad * 2} height={h + pad * 2} viewBox={`${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`} role="img" aria-label={label}>
      {p.target.map((f, i) => {
        const x = (i % p.cols) * cell + gap, y = Math.floor(i / p.cols) * cell + gap, s = cell - gap * 2;
        if (shown !== undefined && i >= shown) {
          // Not rebuilt yet (Pip's demonstration): an empty dashed spot.
          return <rect key={i} x={x} y={y} width={s} height={s} rx={3} fill="none" stroke="rgba(29,43,42,0.4)" strokeWidth={2} strokeDasharray="5 4" />;
        }
        const side = `${x + s},${y} ${x + s + depth},${y + depth} ${x + s + depth},${y + s + depth} ${x + depth},${y + s + depth} ${x},${y + s}`;
        return (
          <g key={i} data-block="">
            <polygon points={side} fill="rgba(29,43,42,0.3)" stroke="var(--ink)" strokeWidth={1.5} strokeLinejoin="round" />
            <FaceGlyph face={f} x={x} y={y} s={s} />
            <polyline points={`${x + 3},${y + s - 3} ${x + 3},${y + 3} ${x + s - 3},${y + 3}`} fill="none" stroke="#fff" strokeOpacity={0.6} strokeWidth={2} />
            <rect x={x} y={y} width={s} height={s} rx={3} fill="none" stroke="var(--ink)" strokeWidth={2.5} />
          </g>
        );
      })}
    </svg>
  );
}

function Diamond({ on, side, children }: { on: boolean; side: number; children: ReactNode }) {
  if (!on) return <>{children}</>;
  const grow = Math.ceil((side * (Math.SQRT2 - 1)) / 2) + 4;
  return <div style={{ transform: 'rotate(45deg)', margin: grow }}>{children}</div>;
}

// ---------- Player ----------

/** Palette key for the "take a block away" tool (open board only). */
const ERASER = 'X';
type Tool = Face | typeof ERASER;
/** Pace of Pip's block-by-block rebuild after a missed first trial on a model item. */
export const DEMO_STEP_MS = 650;

export function Player({ item, onSubmit, reveal, hintLevel }: PlayerProps<BdPayload, BdResponse>) {
  const p = item.payload;
  const n = p.rows * p.cols;
  const board = p.board;
  const slots = board ? board.rows * board.cols : n;
  const empty = (): BdCells => new Array<Face | null>(slots).fill(null);
  const [build, setBuild] = useState<BdCells>(empty);
  const [selected, setSelected] = useState<Tool>('R');
  const [trial, setTrial] = useState<1 | 2>(1);
  /** Pip's rebuild after a missed trial 1: how many model blocks are back so far (null = not demonstrating). */
  const [demo, setDemo] = useState<number | null>(null);
  /** Sticky: at some point the build was wider or taller than the design (a dimension error). */
  const [tooBig, setTooBig] = useState(false);

  useEffect(() => {
    if (demo === null || demo >= n) return;
    const t = setTimeout(() => setDemo((d) => (d === null ? d : d + 1)), DEMO_STEP_MS);
    return () => clearTimeout(t);
  }, [demo, n]);

  const picCell = p.rows === 3 ? 44 : 60;
  const buildCell = board ? (board.cols >= 5 ? 56 : 64) : p.rows === 3 ? 62 : 74;
  const placed = build.filter((f) => f !== null).length;
  const demoing = demo !== null && !reveal;

  const tap = (i: number) => {
    if (reveal || demoing) return;
    const cur = build[i];
    let next: Face | null;
    if (selected === ERASER) next = null;
    else if (cur === null) {
      if (placed >= n) return; // every block is already in use
      next = selected;
    } else if (isDiagonal(cur) && isDiagonal(selected)) next = ROT_CW[cur]; // tap again = turn it
    else if (!isDiagonal(cur) && !isDiagonal(selected)) next = cur === selected ? (cur === 'R' ? 'W' : 'R') : selected;
    else next = selected;
    if (next === cur) return;
    const out = build.slice();
    out[i] = next;
    setBuild(out);
    if (board && exceedsDesign(out, board.cols, p.rows, p.cols)) setTooBig(true);
  };

  const finish = () => {
    if (p.model && trial === 1 && !build.every((f, i) => f === p.target[i])) {
      // Missed trial 1 on a model item: Pip rebuilds the model block by block, then trial 2.
      setTrial(2);
      setDemo(0);
      setBuild(empty());
      return;
    }
    if (board) onSubmit({ cells: build, dimensionError: tooBig });
    else if (p.model) onSubmit({ cells: build, trial });
    else onSubmit(build);
  };

  const revealCells = reveal?.response ? responseCells(reveal.response) : null;
  const shown: BdCells = reveal ? (revealCells ?? empty()) : build;
  // A design-sized array (e.g. from an old record) is shown in a plain tray even on open-board items.
  const onBoard = !!board && shown.length === slots;
  const gridCols = onBoard ? board!.cols : p.cols;
  const anchor = reveal && onBoard ? judgeBoard(p.target, p.rows, p.cols, shown, board!).anchor : { r: 0, c: 0 };
  const expectedAt = (i: number): Face | null => {
    if (!onBoard) return p.target[i];
    const r = Math.floor(i / gridCols) - anchor.r, c = (i % gridCols) - anchor.c;
    return r >= 0 && r < p.rows && c >= 0 && c < p.cols ? p.target[r * p.cols + c] : null;
  };
  const full = board ? placed === n : build.every((f) => f !== null);

  const tray = (
    <div
      role="group"
      aria-label={onBoard ? 'Your build board' : 'Your build'}
      style={{
        display: 'grid', gridTemplateColumns: `repeat(${gridCols}, ${buildCell}px)`, gap: 0,
        border: 'var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--paper-2)',
      }}
    >
      {shown.map((f, i) => {
        const wrong = !!reveal && f !== expectedAt(i);
        const label = onBoard
          ? `Board square row ${Math.floor(i / gridCols) + 1}, column ${(i % gridCols) + 1}: ${f ? FACE_WORDS[f] : 'empty'}`
          : `Block ${i + 1}, ${cellName(i, p.rows, p.cols, p.rotated)}: ${f ? FACE_WORDS[f] : 'empty'}`;
        return (
          <button
            key={i}
            type="button"
            disabled={!!reveal}
            onClick={() => tap(i)}
            aria-label={label}
            style={{
              width: buildCell, height: buildCell, padding: 0, margin: 0, cursor: reveal ? 'default' : 'pointer',
              border: wrong ? `4px ${f ? 'solid' : 'dashed'} var(--bad)` : '1px dashed rgba(29,43,42,0.35)',
              background: 'transparent', touchAction: 'manipulation', display: 'block',
            }}
          >
            {f ? (
              <svg width="100%" height="100%" viewBox="0 0 50 50" aria-hidden style={{ display: 'block' }}>
                <FaceGlyph face={f} x={0} y={0} s={50} />
              </svg>
            ) : (
              <span aria-hidden style={{ color: 'var(--ink-soft)', fontSize: 22 }}>+</span>
            )}
          </button>
        );
      })}
    </div>
  );

  const tools = [
    ...FACES.map((f) => ({ key: f as string, content: <FaceIcon face={f} />, ariaLabel: `Use ${FACE_WORDS[f]} block` })),
    ...(board ? [{ key: ERASER, content: <span aria-hidden style={{ fontSize: 30, lineHeight: 1 }}>🧽</span>, ariaLabel: 'Take a block away' }] : []),
  ];

  return (
    <div className="stage">
      <div className="prompt">
        {p.model ? (trial === 2 ? "Try again: copy Pip's blocks!" : "Copy Pip's blocks!") : p.rotated ? 'Build this diamond!' : 'Build this!'}
      </div>
      <div className="card flat" style={{ padding: 12 }}>
        {p.model ? (
          <ModelBlocks
            p={p}
            cell={picCell}
            label={demoing ? 'Pip building the blocks again' : "Pip's blocks to copy"}
            shown={demoing ? demo! : undefined}
          />
        ) : (
          <Diamond on={p.rotated} side={Math.max(p.rows, p.cols) * picCell}>
            <DesignPicture
              p={p}
              cell={picCell}
              grid={reveal ? 'solid' : hintLevel >= 1 ? 'faint' : 'none'}
              label={reveal ? 'The design, with block lines' : 'The design to build'}
            />
          </Diamond>
        )}
      </div>

      {demoing ? (
        <div className="stack" style={{ alignItems: 'center' }} aria-live="polite">
          <PipSays mood="think" size={64}>
            {demo! < n ? 'Watch me build it again, one block at a time…' : 'Now you try again!'}
          </PipSays>
          <button type="button" className="btn primary big" disabled={demo! < n} onClick={() => setDemo(null)}>
            My turn! 🧱
          </button>
        </div>
      ) : (
        <>
          {!reveal && (
            <>
              <div style={{ width: '100%', maxWidth: 460 }}>
                <ChoiceGrid minWidth={58} options={tools} selected={[selected]} onSelect={(k) => setSelected(k as Tool)} />
              </div>
              <p className="muted small center" style={{ margin: 0 }}>
                {board
                  ? 'Pick a block, then tap the board. Tap a block again to turn it. 🧽 takes one away.'
                  : 'Pick a block, then tap a square. Tap a block again to turn it.'}
              </p>
            </>
          )}

          {reveal && <div className="small muted">Your blocks{reveal.outcome.correct ? '' : ' (wrong ones have a red border)'}</div>}
          {board && !reveal && (
            <div className="small muted" aria-live="polite">{placed === n ? 'All your blocks are on the board' : `Blocks left: ${n - placed}`}</div>
          )}
          <Diamond on={p.rotated} side={Math.max(p.rows, p.cols) * buildCell}>{tray}</Diamond>

          {!reveal && (
            <div className="row" style={{ justifyContent: 'center' }}>
              <button type="button" className="btn ghost small" onClick={() => setBuild(empty())} disabled={placed === 0}>
                🧽 Clear
              </button>
              <button type="button" className="btn go" disabled={!full} onClick={finish}>
                Done ✓
              </button>
            </div>
          )}
          {!reveal && placed === 0 && hintLevel === 0 && (
            <PipSays mood="think" size={64}>{trial === 2 ? 'Start with a corner, just like I did!' : 'Start with a corner!'}</PipSays>
          )}
        </>
      )}
    </div>
  );
}

// ---------- guide ----------

export const guide: SubtestGuide = {
  kidIntro: 'Block Builder! Look at a red-and-white picture, then build the very same design with your blocks.',
  howToPlay: [
    'Look at the picture at the top.',
    'Pick a block: all red, all white, or half-and-half.',
    'Tap a square to put the block there. Tap it again to turn it.',
    'On a big board you can build anywhere — just make it the same size as the picture.',
    'Tap Done when your design matches the picture.',
  ],
  strategies: [
    { title: 'Corners first', tip: 'Build the four corner blocks first — they are the easiest to see. Then fill in the middle.' },
    { title: 'Count the red triangles', tip: 'Count the half-red triangles in the picture. That tells you how many half-and-half blocks you need before you start.' },
    { title: 'Row by row', tip: 'Go like reading: build the top row left to right, then the next row. Finish one row before starting another.' },
    { title: 'Outside edge first', tip: 'Look along the outside edge of the picture. Match the edge blocks first, then the inside ones are easy.' },
    { title: 'Find the big shape', tip: 'See a big diamond, stripe or arrow? Work out which blocks make that shape, build it, then fill the white around it.' },
    { title: 'Window lines', tip: 'Imagine window lines cutting the picture into squares. Each square is one block — red, white or half-and-half.' },
    { title: 'Count the size first', tip: 'Before you build, ask: how many blocks wide? How many tall? A 4-block design is 2 by 2 — never 3 in a row.' },
    { title: 'Turn your head to check',tip: 'When you are done, compare your build and the picture block by block. Is any red corner pointing the wrong way?' },
  ],
  parentNotes:
    'Block Design measures visual-spatial analysis and synthesis: breaking a whole design into parts and rebuilding it, plus visual-motor construction under time pressure. It is one of the seven FSIQ subtests and half of the Visual Spatial Index. Here the blocks are on-screen; the strategies (corner-first, mentally gridding the design) transfer directly to real cubes. As on the real test, the first (model) items allow a second try after Pip rebuilds the model (2 points first try, 1 point second), and from about age 8 the build goes on an open board with no outline, so the child must judge the design’s size — spreading it too wide is recorded as a dimension error. Cheap 1-inch red/white cube sets are a great off-screen companion.',
  commonMistakes: [
    'Building a design that is correct but turned around (a rotation error).',
    'Making the design too big — e.g. three blocks in a row for a 2-by-2 design (a dimension error).',
    'Turning a half-red block so the red corner points the wrong way.',
    'Seeing a big diamond as one shape instead of four half-red blocks.',
    'Rushing past a mistake instead of checking row by row.',
  ],
  everydayActivities: [
    'Copy simple LEGO or Duplo patterns from a picture or from a model you build.',
    'Tangrams and pattern-block puzzles (copy the outline).',
    'Make red/white designs with paper squares cut on the diagonal, then copy each other’s designs.',
    'Quilt-block and tile patterns: spot the repeating squares and triangles.',
  ],
};

export const BlockDesign: SubtestModule<BdPayload, BdResponse> = {
  id: 'BD',
  generate,
  score,
  Player,
  guide,
};

export default BlockDesign;
