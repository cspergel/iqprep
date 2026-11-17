/**
 * Visual Puzzles ("Puzzle Pieces"). A finished shape is shown with six pieces; the child picks the
 * three pieces that fit together to make it. Pieces may be turned (in your head) but never flipped.
 *
 * Shapes live on a square grid. Every grid square is split into four quarter-triangles
 * (N, E, S, W around its centre) so harder items can use half-square triangles: a half square is two
 * neighbouring quarters. A tiling solver checks all 20 three-piece combinations and the generator
 * only keeps items where exactly one combination tiles the target.
 *
 * Layout follows the DS reference module: pure generate/score at the top, Player below, guide last.
 */
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { createRng, type Rng } from '../../core/rng';
import type { GenerateRequest, Item, PlayerProps, ScoreOutcome, SubtestGuide, SubtestModule } from '../../core/types';
import { ChoiceGrid } from '../../ui/kit';

/** [x, y, quarter] with quarter 0 = N, 1 = E, 2 = S, 3 = W. */
export type Unit = [number, number, number];
export type Shape = Unit[];
export type VpPieceKind = 'real' | 'bigger' | 'smaller' | 'mirror' | 'reshaped' | 'angle';
export type VpLevel = 'rect' | 'template' | 'irregular' | 'half';

export interface VpPayload {
  level: VpLevel;
  target: Shape;
  /** The six pieces, as shown (possibly turned). */
  pieces: Shape[];
  kinds: VpPieceKind[];
  /** Sorted indices of the three right pieces. */
  answer: number[];
  /** For each answer index (same order), where that piece sits inside the target. */
  regions: Shape[];
}
/** Sorted indices of the three chosen pieces. */
export type VpResponse = number[];

// ---------- shape geometry ----------

const ukey = (u: Unit) => `${u[0]},${u[1]},${u[2]}`;
const ckey = (x: number, y: number) => `${x},${y}`;

export function normalize(s: Shape): Shape {
  let mx = Infinity, my = Infinity;
  for (const [x, y] of s) { mx = Math.min(mx, x); my = Math.min(my, y); }
  const seen = new Set<string>();
  const out: Shape = [];
  for (const [x, y, q] of s) {
    const u: Unit = [x - mx, y - my, q];
    const k = ukey(u);
    if (!seen.has(k)) { seen.add(k); out.push(u); }
  }
  return out.sort((a, b) => a[1] - b[1] || a[0] - b[0] || a[2] - b[2]);
}
export const canon = (s: Shape) => normalize(s).map(ukey).join(';');
/** Quarter-turn clockwise (screen coordinates, y down). */
export const rotate = (s: Shape): Shape => s.map(([x, y, q]) => [-y - 1, x, (q + 1) % 4] as Unit);
/** Mirror left↔right (a flip — not allowed when solving). */
export const mirror = (s: Shape): Shape => s.map(([x, y, q]) => [-x - 1, y, q === 1 ? 3 : q === 3 ? 1 : q] as Unit);

export function rotations(s: Shape): Shape[] {
  const out: Shape[] = [];
  const keys = new Set<string>();
  let cur = s;
  for (let k = 0; k < 4; k++) {
    const n = normalize(cur);
    const key = n.map(ukey).join(';');
    if (!keys.has(key)) { keys.add(key); out.push(n); }
    cur = rotate(cur);
  }
  return out;
}
export const sameShape = (a: Shape, b: Shape) => a.length === b.length && rotations(a).some((r) => canon(r) === canon(b));
export const isChiral = (s: Shape) => !sameShape(s, mirror(s));
export const areaOf = (s: Shape) => s.length / 4;

export function cellsFrom(cells: [number, number][]): Shape {
  const out: Shape = [];
  for (const [x, y] of cells) for (let q = 0; q < 4; q++) out.push([x, y, q]);
  return out;
}

function neighbours([x, y, q]: Unit): Unit[] {
  const across: Unit = q === 0 ? [x, y - 1, 2] : q === 1 ? [x + 1, y, 3] : q === 2 ? [x, y + 1, 0] : [x - 1, y, 1];
  return [[x, y, (q + 1) % 4], [x, y, (q + 3) % 4], across];
}

export function connected(s: Shape): boolean {
  if (s.length === 0) return false;
  const all = new Set(s.map(ukey));
  const seen = new Set<string>([ukey(s[0])]);
  const stack = [s[0]];
  while (stack.length) {
    const u = stack.pop()!;
    for (const v of neighbours(u)) {
      const k = ukey(v);
      if (all.has(k) && !seen.has(k)) { seen.add(k); stack.push(v); }
    }
  }
  return seen.size === all.size;
}

/** Map of cell → bitmask of quarters present. */
function cellMasks(s: Shape): Map<string, number> {
  const m = new Map<string, number>();
  for (const [x, y, q] of s) m.set(ckey(x, y), (m.get(ckey(x, y)) ?? 0) | (1 << q));
  return m;
}

// ---------- tiling solver ----------

/** Can these pieces (turned but never flipped) cover the target exactly, with no gaps or overlaps? */
export function tiles(target: Shape, pieces: Shape[]): boolean {
  const total = pieces.reduce((s, p) => s + p.length, 0);
  if (total !== target.length) return false;
  const T = new Set(target.map(ukey));
  if (T.size !== target.length) return false;
  const order = target.slice().sort((a, b) => a[1] - b[1] || a[0] - b[0] || a[2] - b[2]);
  const rots = pieces.map(rotations);
  const covered = new Set<string>();
  const used = pieces.map(() => false);
  const rec = (): boolean => {
    const first = order.find((u) => !covered.has(ukey(u)));
    if (!first) return true;
    for (let i = 0; i < pieces.length; i++) {
      if (used[i]) continue;
      for (const r of rots[i]) {
        for (const v of r) {
          if (v[2] !== first[2]) continue;
          const dx = first[0] - v[0], dy = first[1] - v[1];
          const keys = r.map(([x, y, q]) => ukey([x + dx, y + dy, q]));
          if (!keys.every((k) => T.has(k) && !covered.has(k))) continue;
          keys.forEach((k) => covered.add(k));
          used[i] = true;
          if (rec()) return true;
          used[i] = false;
          keys.forEach((k) => covered.delete(k));
        }
      }
    }
    return false;
  };
  return rec();
}

/** Every 3-piece combination (sorted indices) that tiles the target. */
export function solveCombos(target: Shape, pieces: Shape[]): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < pieces.length; i++)
    for (let j = i + 1; j < pieces.length; j++)
      for (let k = j + 1; k < pieces.length; k++)
        if (tiles(target, [pieces[i], pieces[j], pieces[k]])) out.push([i, j, k]);
  return out;
}

// ---------- target shapes ----------

const TEMPLATES: string[][] = [
  ['X..', 'X..', 'XXX'],
  ['X.', 'X.', 'X.', 'XX'],
  ['XXX', '.X.', '.X.'],
  ['.X.', 'XXX', '.X.'],
  ['X.X', 'XXX'],
  ['X.X', 'X.X', 'XXX'],
  ['XX.', 'XX.', 'XXX'],
  ['X..', 'XX.', 'XXX'],
  ['XX..', '.XXX'],
  ['XXX', '.X.', 'XXX'],
  ['X..', 'X..', 'X..', 'XXX'],
  ['XX.', 'XXX', '.XX'],
  ['XXX', 'XX.', 'X..'],
  ['XXXX', 'X..X'],
  ['XXXX', '.XX.'],
  ['XXX', 'XXX', 'X..'],
  ['XXXX', 'XX..', 'XX..'],
  ['.XX', 'XXX', 'XXX'],
  ['XXXX', 'X..X', 'X..X'],
  ['XXX', 'XXX', '.X.', '.X.'],
  ['XX..', 'XXXX', '..XX'],
  ['XXX', 'X..', 'XXX'],
  ['X..', 'XXX', 'XXX'],
];

function fromTemplate(t: string[]): [number, number][] {
  const out: [number, number][] = [];
  t.forEach((row, y) => [...row].forEach((ch, x) => ch === 'X' && out.push([x, y])));
  return out;
}

function cellsOfShape(s: Shape): [number, number][] {
  return [...cellMasks(s).keys()].map((k) => k.split(',').map(Number) as [number, number]);
}

function hasHole(cells: [number, number][]): boolean {
  const set = new Set(cells.map(([x, y]) => ckey(x, y)));
  const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
  const x0 = Math.min(...xs) - 1, x1 = Math.max(...xs) + 1, y0 = Math.min(...ys) - 1, y1 = Math.max(...ys) + 1;
  const seen = new Set<string>([ckey(x0, y0)]);
  const stack: [number, number][] = [[x0, y0]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as [number, number][]) {
      if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
      const k = ckey(nx, ny);
      if (set.has(k) || seen.has(k)) continue;
      seen.add(k);
      stack.push([nx, ny]);
    }
  }
  return seen.size + set.size < (x1 - x0 + 1) * (y1 - y0 + 1);
}

function randomPolyomino(area: number, maxW: number, maxH: number, rng: Rng): [number, number][] | null {
  const cells: [number, number][] = [[0, 0]];
  const set = new Set([ckey(0, 0)]);
  for (let guard = 0; cells.length < area && guard < 400; guard++) {
    const [x, y] = rng.pick(cells);
    const [nx, ny] = rng.pick<[number, number]>([[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]);
    if (set.has(ckey(nx, ny))) continue;
    const xs = [...cells.map((c) => c[0]), nx], ys = [...cells.map((c) => c[1]), ny];
    if (Math.max(...xs) - Math.min(...xs) + 1 > maxW || Math.max(...ys) - Math.min(...ys) + 1 > maxH) continue;
    cells.push([nx, ny]);
    set.add(ckey(nx, ny));
  }
  if (cells.length < area || hasHole(cells)) return null;
  return cells;
}

const isRect = (cells: [number, number][]) => {
  const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
  return (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1) === cells.length;
};

// ---------- partitioning ----------

function guillotine(w: number, h: number, rng: Rng): [number, number][][] | null {
  type R = { x: number; y: number; w: number; h: number };
  const split = (r: R, vertical: boolean): [R, R] | null => {
    const len = vertical ? r.w : r.h;
    if (len < 2) return null;
    const a = rng.int(1, len - 1);
    return vertical
      ? [{ ...r, w: a }, { x: r.x + a, y: r.y, w: r.w - a, h: r.h }]
      : [{ ...r, h: a }, { x: r.x, y: r.y + a, w: r.w, h: r.h - a }];
  };
  const first = split({ x: 0, y: 0, w, h }, w >= h ? true : false);
  if (!first) return null;
  const idx = rng.int(0, 1);
  const second = split(first[idx], rng.chance(0.5));
  if (!second) return null;
  const rects = [first[1 - idx], ...second];
  return rects.map((r) => {
    const cells: [number, number][] = [];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) cells.push([x, y]);
    return cells;
  });
}

function growPartition(cells: [number, number][], rng: Rng, minSize: number): [number, number][][] | null {
  const set = new Set(cells.map(([x, y]) => ckey(x, y)));
  const owner = new Map<string, number>();
  const seeds = rng.sample(cells, 3);
  const groups: [number, number][][] = seeds.map((c, i) => { owner.set(ckey(c[0], c[1]), i); return [c]; });
  for (let guard = 0; owner.size < cells.length && guard < 2000; guard++) {
    // grow the smallest group that can grow (with a little randomness)
    const order = [0, 1, 2].sort((a, b) => groups[a].length - groups[b].length + (rng.next() - 0.5) * 1.5);
    let grew = false;
    for (const g of order) {
      const frontier: [number, number][] = [];
      for (const [x, y] of groups[g]) {
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as [number, number][]) {
          const k = ckey(nx, ny);
          if (set.has(k) && !owner.has(k)) frontier.push([nx, ny]);
        }
      }
      if (frontier.length) {
        const c = rng.pick(frontier);
        owner.set(ckey(c[0], c[1]), g);
        groups[g].push(c);
        grew = true;
        break;
      }
    }
    if (!grew) return null;
  }
  if (groups.some((g) => g.length < minSize)) return null;
  return groups;
}

/** Turn some cells into half squares: cut off outside corners, and split a cell between two pieces. */
function addHalves(target: Shape, parts: Shape[], rng: Rng): { target: Shape; parts: Shape[]; halves: number } {
  let t = target.slice();
  let ps = parts.map((p) => p.slice());
  let halves = 0;
  const wanted = rng.int(1, 3);
  for (let attempt = 0; attempt < 40 && halves < wanted; attempt++) {
    const masks = cellMasks(t);
    const fullCells = [...masks.entries()].filter(([, m]) => m === 15).map(([k]) => k.split(',').map(Number) as [number, number]);
    const [x, y] = rng.pick(fullCells);
    const side = (q: number): [number, number] => (q === 0 ? [x, y - 1] : q === 1 ? [x + 1, y] : q === 2 ? [x, y + 1] : [x - 1, y]);
    const pi = ps.findIndex((p) => p.some((u) => u[0] === x && u[1] === y));
    if (pi < 0 || (cellMasks(ps[pi]).get(ckey(x, y)) ?? 0) !== 15) continue;
    if (rng.chance(0.5)) {
      // outside corner: two neighbouring sides face the outside → slice that half off
      const q = rng.int(0, 3);
      const q2 = (q + 1) % 4;
      if (masks.has(ckey(...side(q))) || masks.has(ckey(...side(q2)))) continue;
      const drop = (u: Unit) => u[0] === x && u[1] === y && (u[2] === q || u[2] === q2);
      const nt = t.filter((u) => !drop(u));
      const np = ps[pi].filter((u) => !drop(u));
      if (!connected(nt) || !connected(np) || np.length < 6) continue;
      t = nt;
      ps[pi] = np;
      halves++;
    } else {
      // diagonal seam: hand the half facing a neighbouring piece to that piece
      const q = rng.int(0, 3);
      const [nx, ny] = side(q);
      const pj = ps.findIndex((p) => p.some((u) => u[0] === nx && u[1] === ny));
      if (pj < 0 || pj === pi) continue;
      if ((cellMasks(ps[pj]).get(ckey(nx, ny)) ?? 0) !== 15) continue;
      const q2 = rng.chance(0.5) ? (q + 1) % 4 : (q + 3) % 4;
      const moving = (u: Unit) => u[0] === x && u[1] === y && (u[2] === q || u[2] === q2);
      const a = ps[pi].filter((u) => !moving(u));
      const b = [...ps[pj], ...ps[pi].filter(moving)];
      if (!connected(a) || !connected(b) || a.length < 6) continue;
      ps = ps.map((p, i) => (i === pi ? a : i === pj ? b : p));
      halves++;
    }
  }
  return { target: t, parts: ps, halves };
}

// ---------- distractors ----------

function grow(p: Shape, rng: Rng): Shape | null {
  const masks = cellMasks(p);
  const options: [number, number][] = [];
  for (const k of masks.keys()) {
    const [x, y] = k.split(',').map(Number);
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as [number, number][]) {
      if (!masks.has(ckey(nx, ny))) options.push([nx, ny]);
    }
  }
  for (const c of rng.shuffle(options)) {
    const out = [...p, ...cellsFrom([c])];
    if (connected(out)) return out;
  }
  return null;
}

function shrink(p: Shape, rng: Rng): Shape | null {
  const masks = cellMasks(p);
  if (masks.size < 2) return null;
  for (const k of rng.shuffle([...masks.keys()])) {
    const out = p.filter((u) => ckey(u[0], u[1]) !== k);
    if (out.length >= 4 && connected(out)) return out;
  }
  return null;
}

function reshape(p: Shape, rng: Rng): Shape | null {
  for (let i = 0; i < 12; i++) {
    const s = shrink(p, rng);
    const g = s && grow(s, rng);
    if (g && !sameShape(g, p)) return g;
  }
  return null;
}

function wrongAngle(p: Shape, rng: Rng): Shape | null {
  const halves = [...cellMasks(p).entries()].filter(([, m]) => m !== 15);
  for (const [k, m] of rng.shuffle(halves)) {
    const [x, y] = k.split(',').map(Number);
    const qs = [0, 1, 2, 3].filter((q) => m & (1 << q));
    if (qs.length !== 2) continue;
    for (const turn of rng.shuffle([1, 3])) {
      const nq = qs.map((q) => (q + turn) % 4);
      const out: Shape = [...p.filter((u) => !(u[0] === x && u[1] === y)), ...nq.map((q) => [x, y, q] as Unit)];
      if (connected(out) && !sameShape(out, p)) return out;
    }
  }
  return null;
}

function makeDistractor(kind: VpPieceKind, base: Shape, rng: Rng): Shape | null {
  switch (kind) {
    case 'bigger': return grow(base, rng);
    case 'smaller': return shrink(base, rng);
    case 'reshaped': return reshape(base, rng);
    case 'mirror': return isChiral(base) ? mirror(base) : null;
    case 'angle': return wrongAngle(base, rng);
    default: return null;
  }
}

// ---------- difficulty model ----------

export interface VpFeatures {
  area: number;
  nonRect: boolean;
  /** Right pieces shown turned away from how they sit in the shape. */
  rotated: number;
  mirrorTrap: boolean;
  /** Same-size wrong pieces (can't be ruled out by counting squares). */
  sameAreaTraps: number;
  halves: number;
}

export function vpDifficulty(f: VpFeatures): number {
  const d =
    4 + 0.3 * (f.area - 6) + (f.nonRect ? 1.2 : 0) + 1.0 * f.rotated + (f.mirrorTrap ? 1 : 0) +
    0.4 * Math.min(2, f.sameAreaTraps) + (f.halves > 0 ? 2 + 0.5 * f.halves : 0);
  return Math.round(d * 100) / 100;
}

export function levelForDifficulty(d: number): VpLevel {
  if (d < 6) return 'rect';
  if (d < 9.5) return 'template';
  if (d < 13) return 'irregular';
  return 'half';
}

interface Draft {
  target: Shape;
  parts: Shape[];
  halves: number;
  nonRect: boolean;
  turns: number[];
  plan: VpPieceKind[];
}

function draftFor(level: VpLevel, rng: Rng): Draft | null {
  let cells: [number, number][] | null = null;
  let groups: [number, number][][] | null = null;
  if (level === 'rect') {
    const [w, h] = rng.pick<[number, number]>([[3, 2], [2, 3], [4, 2], [2, 4], [3, 3], [4, 3], [3, 4]]);
    groups = guillotine(w, h, rng);
    if (!groups) return null;
    cells = groups.flat();
    if (cells.length >= 6 && groups.some((g) => g.length < 2)) return null;
  } else {
    if (level === 'template') {
      cells = fromTemplate(rng.pick(TEMPLATES));
      let s = cellsFrom(cells);
      for (let k = rng.int(0, 3); k > 0; k--) s = rotate(s);
      if (rng.chance(0.5)) s = mirror(s);
      cells = cellsOfShape(normalize(s));
    } else {
      const area = level === 'irregular' ? rng.int(7, 12) : rng.int(10, 14);
      cells = randomPolyomino(area, level === 'half' ? 5 : 4, 4, rng);
      if (!cells || isRect(cells)) return null;
      const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
      const bbox = (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1);
      if (cells.length / bbox < 0.55) return null;
    }
    groups = growPartition(cells, rng, 2);
    if (!groups) return null;
  }
  let target = normalize(cellsFrom(cells));
  const mx = Math.min(...cells.map((c) => c[0])), my = Math.min(...cells.map((c) => c[1]));
  let parts = groups.map((g) => cellsFrom(g.map(([x, y]) => [x - mx, y - my] as [number, number])));
  let halves = 0;
  if (level === 'half') {
    const h = addHalves(target, parts, rng);
    if (h.halves === 0) return null;
    ({ target, parts, halves } = h);
  }
  // harder levels: the three right pieces should look different from each other
  if (level === 'irregular' || level === 'half') {
    if (sameShape(parts[0], parts[1]) || sameShape(parts[0], parts[2]) || sameShape(parts[1], parts[2])) return null;
  }
  const turns =
    level === 'rect' ? [0, 0, 0]
    : level === 'template' ? rng.shuffle([rng.int(1, 3), rng.chance(0.6) ? rng.int(1, 3) : 0, rng.chance(0.3) ? rng.int(1, 3) : 0])
    : [rng.int(0, 3), rng.int(0, 3), rng.int(0, 3)];
  const plan: VpPieceKind[] =
    level === 'rect' ? ['bigger', 'smaller', rng.pick<VpPieceKind>(['bigger', 'smaller'])]
    : level === 'template' ? ['bigger', 'smaller', rng.pick<VpPieceKind>(['reshaped', 'bigger', 'smaller'])]
    : level === 'irregular' ? ['mirror', 'reshaped', rng.pick<VpPieceKind>(['bigger', 'smaller'])]
    : ['mirror', 'angle', rng.pick<VpPieceKind>(['bigger', 'smaller', 'reshaped'])];
  return { target, parts, halves, nonRect: !isRect(cellsOfShape(target)) || halves > 0, turns, plan };
}

const turnTimes = (s: Shape, k: number) => { let c = s; for (let i = 0; i < k; i++) c = rotate(c); return normalize(c); };
const looksTurned = (orig: Shape, shown: Shape) => canon(orig) !== canon(shown);

function draftFeatures(d: Draft): VpFeatures {
  const rotated = d.parts.filter((p, i) => looksTurned(p, turnTimes(p, d.turns[i]))).length;
  return {
    area: areaOf(d.target), nonRect: d.nonRect, rotated,
    mirrorTrap: d.plan.includes('mirror'),
    sameAreaTraps: d.plan.filter((k) => k === 'mirror' || k === 'reshaped' || k === 'angle').length,
    halves: d.halves,
  };
}

function finish(d: Draft, rng: Rng): { payload: VpPayload; features: VpFeatures } | null {
  for (let attempt = 0; attempt < 30; attempt++) {
    const distractors: { shape: Shape; kind: VpPieceKind }[] = [];
    let ok = true;
    for (const kind0 of d.plan) {
      let made: Shape | null = null;
      let kind = kind0;
      const kindsToTry: VpPieceKind[] = kind0 === 'mirror' || kind0 === 'angle' ? [kind0, 'reshaped'] : [kind0];
      for (const k of kindsToTry) {
        for (const bi of rng.shuffle([0, 1, 2])) {
          const s = makeDistractor(k, d.parts[bi], rng);
          if (!s) continue;
          const clash = [...d.parts, ...distractors.map((x) => x.shape)].some((o) => sameShape(o, s));
          if (!clash) { made = s; kind = k; break; }
        }
        if (made) break;
      }
      if (!made) { ok = false; break; }
      distractors.push({ shape: made, kind });
    }
    if (!ok) continue;
    const slots = [
      ...d.parts.map((p, i) => ({ shape: turnTimes(p, d.turns[i]), kind: 'real' as VpPieceKind, region: p })),
      ...distractors.map((x) => ({
        shape: turnTimes(x.shape, d.turns.some((t) => t > 0) ? rng.int(0, 3) : 0),
        kind: x.kind, region: null as Shape | null,
      })),
    ];
    const order = rng.shuffle(slots);
    const pieces = order.map((s) => s.shape);
    const answer = order.map((s, i) => (s.kind === 'real' ? i : -1)).filter((i) => i >= 0);
    const combos = solveCombos(d.target, pieces);
    if (combos.length !== 1 || combos[0].join() !== answer.join()) continue;
    const kinds = order.map((s) => s.kind);
    const features = draftFeatures(d);
    features.mirrorTrap = kinds.includes('mirror');
    features.sameAreaTraps = kinds.filter((k) => k === 'mirror' || k === 'reshaped' || k === 'angle').length;
    return {
      payload: { level: 'rect', target: d.target, pieces, kinds, answer, regions: answer.map((i) => order[i].region!) },
      features,
    };
  }
  return null;
}

// ---------- generate / score ----------

/** Pieces are numbered 1–6 (the child says or points to the numbers, as on the real test). */
const num = (i: number) => String(i + 1);
/** The same instruction on every item (format study §B). */
export const VP_STEM = 'Which 3 pieces make this puzzle?';
/** Real rule: 30 s, "Do you have an answer?" at 20 s; timing stops once 3 pieces are chosen. */
const VP_TIME_LIMIT = 30;
const VP_PROMPT_AT = 20;
/** In test mode the set is shown highlighted this long before it is handed in automatically. */
export const VP_AUTO_SUBMIT_MS = 600;
const fmtArea = (a: number) => (Number.isInteger(a) ? `${a}` : `${Math.floor(a)}½`);

export function generate(req: GenerateRequest): Item<VpPayload> {
  const rng = createRng(req.seed);
  const want = Math.max(3, Math.min(18, req.difficulty));
  let level = levelForDifficulty(want);
  let built: { payload: VpPayload; features: VpFeatures } | null = null;
  for (let round = 0; round < 6 && !built; round++) {
    const drafts: { d: Draft; gap: number }[] = [];
    for (let k = 0; k < 600 && drafts.length < 16; k++) {
      const d = draftFor(level, rng);
      if (d) drafts.push({ d, gap: Math.abs(vpDifficulty(draftFeatures(d)) - want) });
    }
    drafts.sort((a, b) => a.gap - b.gap);
    for (const { d } of drafts) {
      built = finish(d, rng);
      if (built) break;
    }
    if (!built && round >= 3) level = level === 'half' ? 'irregular' : level === 'irregular' ? 'template' : 'rect';
  }
  if (!built) throw new Error('VP: could not build a puzzle');
  const { payload, features } = built;
  payload.level = level;
  const area = areaOf(payload.target);
  const answerAreas = payload.answer.map((i) => areaOf(payload.pieces[i]));
  const nums = payload.answer.map(num);
  const mirrorIdx = payload.kinds.indexOf('mirror');
  const skills = [level === 'rect' ? 'vp:rect' : 'vp:irregular'];
  if (features.rotated > 0) skills.push('vp:rotation');
  if (features.mirrorTrap) skills.push('vp:mirror-trap');
  const half = features.halves > 0;
  const steps = [
    `Count the big shape: ${fmtArea(area)} squares${half ? ' (a triangle counts as half a square)' : ''}.`,
    `Pieces ${nums.join(', ')} have ${answerAreas.map(fmtArea).join(' + ')} = ${fmtArea(area)} squares.`,
  ];
  if (mirrorIdx >= 0) steps.push(`Piece ${num(mirrorIdx)} looks close, but it is flipped like in a mirror — pieces can turn, but never flip.`);
  steps.push(`Turn pieces ${nums.join(', ')} in your head and they fit together with no gaps.`);
  return {
    id: `VP:${level}:${canon(payload.target)}:${payload.pieces.map(canon).join('/')}`.slice(0, 200) + `:${req.seed}`,
    subtest: 'VP',
    difficulty: vpDifficulty(features),
    seed: req.seed,
    payload,
    maxPoints: 1,
    timeLimitSec: VP_TIME_LIMIT,
    promptAtSec: VP_PROMPT_AT,
    skills,
    hints: [
      `Count the squares in the big shape (${fmtArea(area)}). Your 3 pieces must add up to the same number.`,
      half ? 'Look for the slanted edges — a triangle piece has to fill each one.' : 'Find the piece that fits a corner or a bump of the big shape first.',
      features.mirrorTrap ? 'Pieces can turn around, but they can never flip over like a pancake.' : 'Turn each piece in your head until its edges match the big shape.',
      `One of the right pieces is piece ${nums[0]}.`,
    ],
    explanation: `Pieces ${nums.slice(0, 2).join(', ')} and ${nums[2]} fit together to make the shape: ${answerAreas.map(fmtArea).join(' + ')} = ${fmtArea(area)} squares, with no gaps and no extra bits.`,
    steps,
    speak: VP_STEM,
  };
}

export function score(item: Item<VpPayload>, response: VpResponse | null): ScoreOutcome {
  const { answer, kinds } = item.payload;
  if (!response) return { points: 0, correct: false, meta: { rightPieces: 0, mirrorPicked: 0 } };
  const picks = [...new Set(response)].sort((a, b) => a - b);
  const rightPieces = picks.filter((i) => answer.includes(i)).length;
  const correct = picks.length === 3 && rightPieces === 3;
  const mirrorPicked = picks.some((i) => kinds[i] === 'mirror') ? 1 : 0;
  let feedback: string | undefined;
  if (!correct && mirrorPicked) feedback = 'One of your pieces was flipped like in a mirror — pieces can turn, but they can never flip!';
  else if (!correct && rightPieces === 2) feedback = 'Two of your pieces were right! Count the squares to find the third.';
  return { points: correct ? 1 : 0, correct, meta: { rightPieces, mirrorPicked }, feedback };
}

// ---------- drawing ----------

const PIECE_FILL = '#ee8a2f';
const REGION_FILLS = ['#d94a3d', '#2f74c0', '#3a9a5b'];

function corners(x: number, y: number, q: number): [[number, number], [number, number]] {
  return q === 0 ? [[x, y], [x + 1, y]] : q === 1 ? [[x + 1, y], [x + 1, y + 1]] : q === 2 ? [[x + 1, y + 1], [x, y + 1]] : [[x, y + 1], [x, y]];
}

/** Draws a shape (or a shape split into coloured regions) as filled triangles with outline edges only. */
export function ShapeSvg({
  regions, unit, grid = false, label, frame, fluid = false,
}: { regions: { shape: Shape; fill: string }[]; unit: number; grid?: boolean; label: string; frame?: [number, number]; fluid?: boolean }) {
  const all = regions.flatMap((r) => r.shape);
  const xs = all.map((u) => u[0]), ys = all.map((u) => u[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const w = frame ? frame[0] : Math.max(...xs) - x0 + 1, h = frame ? frame[1] : Math.max(...ys) - y0 + 1;
  const ox = frame ? (frame[0] - (Math.max(...xs) - x0 + 1)) / 2 : 0, oy = frame ? (frame[1] - (Math.max(...ys) - y0 + 1)) / 2 : 0;
  const owner = new Map<string, number>();
  regions.forEach((r, i) => r.shape.forEach((u) => owner.set(ukey(u), i)));
  const P = (x: number, y: number) => `${((x - x0 + ox) * unit).toFixed(1)},${((y - y0 + oy) * unit).toFixed(1)}`;
  const tris: ReactElement[] = [];
  const edges: string[] = [];
  const gridLines: string[] = [];
  regions.forEach((r, ri) => {
    r.shape.forEach(([x, y, q], k) => {
      const [c1, c2] = corners(x, y, q);
      const cx = x + 0.5, cy = y + 0.5;
      tris.push(<polygon key={`${ri}-${k}`} points={`${P(cx, cy)} ${P(...c1)} ${P(...c2)}`} fill={r.fill} stroke={r.fill} strokeWidth={0.8} />);
      const [n1, n2, across] = [[x, y, (q + 3) % 4], [x, y, (q + 1) % 4], neighbours([x, y, q])[2]] as Unit[];
      const segs: [Unit, string][] = [
        [n1, `M${P(cx, cy)}L${P(...c1)}`],
        [n2, `M${P(cx, cy)}L${P(...c2)}`],
        [across, `M${P(...c1)}L${P(...c2)}`],
      ];
      for (const [nb, d] of segs) {
        if (owner.get(ukey(nb)) !== ri) edges.push(d);
        else if (grid && nb === across) gridLines.push(d);
      }
    });
  });
  return (
    <svg width={w * unit + 8} height={h * unit + 8} viewBox={`-4 -4 ${w * unit + 8} ${h * unit + 8}`} role="img" aria-label={label}
      style={fluid ? { display: 'block', maxWidth: '100%', height: 'auto' } : undefined}>
      {tris}
      {grid && <path d={gridLines.join('')} stroke="rgba(255,253,246,0.85)" strokeWidth={1.5} strokeDasharray="4 3" fill="none" />}
      <path d={edges.join('')} stroke="var(--ink)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function bboxOf(s: Shape): [number, number] {
  const xs = s.map((u) => u[0]), ys = s.map((u) => u[1]);
  return [Math.max(...xs) - Math.min(...xs) + 1, Math.max(...ys) - Math.min(...ys) + 1];
}

// ---------- Player ----------

export function Player({ item, mode, onSubmit, reveal, hintLevel }: PlayerProps<VpPayload, VpResponse>) {
  const { target, pieces, answer, regions } = item.payload;
  const [picked, setPicked] = useState<number[]>([]);
  // Test mode: like the real task, the response ends the moment the third piece is chosen.
  const autoSubmit = mode === 'test';
  const [handedIn, setHandedIn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const maxDim = useMemo(() => Math.max(...pieces.map((p) => Math.max(...bboxOf(p)))), [pieces]);
  // Pieces and target share one scale, so sizes can be compared by eye (as in the real task).
  const unit = Math.max(18, Math.min(34, Math.floor(96 / maxDim)));
  const frame: [number, number] = [maxDim, maxDim];

  const toggle = (k: string) => {
    if (handedIn) return;
    const i = Number(k);
    const next = picked.includes(i) ? picked.filter((x) => x !== i) : picked.length >= 3 ? picked : [...picked, i];
    setPicked(next);
    if (autoSubmit && next.length === 3) {
      setHandedIn(true);
      const set = next.slice().sort((a, b) => a - b);
      timer.current = setTimeout(() => onSubmit(set), VP_AUTO_SUBMIT_MS);
    }
  };

  const regionColour = (i: number) => REGION_FILLS[answer.indexOf(i)] ?? PIECE_FILL;
  const chosen = reveal?.response ?? [];

  return (
    <div className="stage">
      <div className="prompt">{VP_STEM}</div>
      <div className="card flat" style={{ padding: 12 }}>
        <ShapeSvg
          regions={reveal ? regions.map((r, k) => ({ shape: r, fill: REGION_FILLS[k] })) : [{ shape: target, fill: PIECE_FILL }]}
          unit={unit}
          grid={!reveal && hintLevel >= 1}
          label={reveal ? 'The shape, showing where the right pieces go' : 'The shape to make'}
        />
      </div>
      {/* fixed 2 rows of 3, numbered 1–6, at every width: the pieces shrink, the layout never reflows */}
      <div style={{ width: '100%', maxWidth: 480 }}>
        <ChoiceGrid
          numbers
          columns={3}
          disabled={handedIn}
          options={pieces.map((p, i) => ({
            key: String(i),
            ariaLabel: `Piece ${num(i)}, ${fmtArea(areaOf(p))} squares`,
            content: (
              <ShapeSvg
                regions={[{ shape: p, fill: reveal && answer.includes(i) ? regionColour(i) : PIECE_FILL }]}
                unit={unit}
                frame={frame}
                label={`Piece ${num(i)}`}
                fluid
              />
            ),
          }))}
          selected={picked.map(String)}
          onSelect={toggle}
          reveal={reveal ? { correctKeys: answer.map(String), chosenKeys: chosen.map(String) } : undefined}
        />
      </div>
      {!reveal && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <span className="chip" aria-live="polite">{picked.length} of 3 picked</span>
          {!autoSubmit && (
            <button type="button" className="btn go" disabled={picked.length !== 3} onClick={() => onSubmit(picked.slice().sort((a, b) => a - b))}>
              Done ✓
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- guide ----------

export const guide: SubtestGuide = {
  kidIntro: 'Puzzle Pieces! Look at the big shape, then find the three pieces that fit together to make it — no touching, just your brain.',
  howToPlay: [
    'Look at the big shape at the top.',
    'Tap the 3 pieces that fit together to make it. Tap again to un-pick.',
    'Pieces can turn around, but they never flip over.',
    'Tap Done when you have 3. (In a Challenge, picking your third piece hands it in.)',
  ],
  strategies: [
    { title: 'Count the squares', tip: 'Count the squares in the big shape and in each piece. Your three pieces must add up to exactly the same number.' },
    { title: 'Tricky part first', tip: 'Find the strangest bump, corner or slanted edge of the big shape. Which piece could fill just that spot?' },
    { title: 'Biggest piece first', tip: 'Start with the biggest piece. Once you know where it goes, the leftover gap tells you what the other two must look like.' },
    { title: 'Turn it in your head', tip: 'Imagine picking a piece up and turning it like a steering wheel until its edges match the big shape.' },
    { title: 'Cross out the cheats', tip: 'Rule pieces out: one square too big, one too small, or flipped like in a mirror. Fewer pieces left means an easier choice.' },
    { title: 'Check the gaps', tip: 'Before Done, picture all three pieces in place. Any gaps or bits sticking out? Then one piece is wrong.' },
  ],
  parentNotes:
    'Visual Puzzles measures mental assembly: holding pieces in mind, rotating them mentally and checking whether they fit, without touching them. It is one of the Visual Spatial Index subtests (with Block Design). The real task has a strict 30-second limit, so quick strategies such as counting squares and ruling out impossible pieces really help.',
  commonMistakes: [
    'Picking pieces that look right but would need to be flipped over (mirror images).',
    'Choosing a piece that is one square too big or too small — counting would catch it.',
    'Picking two good pieces and guessing the third without checking for gaps.',
    'Staring at one piece too long instead of trying the next one.',
  ],
  everydayActivities: [
    'Tangrams: make a shape from the outline only.',
    'Jigsaw puzzles — say which piece will fit before trying it.',
    'Pattern blocks or pentomino sets: cover an outline using exactly three pieces.',
    'Cut a paper square into 3 pieces, mix them, and race to rebuild it — then try it only by looking.',
  ],
};

export const VisualPuzzles: SubtestModule<VpPayload, VpResponse> = {
  id: 'VP',
  generate,
  score,
  Player,
  guide,
};

export default VisualPuzzles;
