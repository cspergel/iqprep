/**
 * Matrix Reasoning ("Pattern Finder"). Procedurally generated visual matrices: a row pattern, a 2×2
 * analogy or a 3×3 grid with one gap. The child picks the missing piece from 5 options.
 * Like the real test, single-row "series" items (what changes each step: turning, counting, corner walks,
 * hills, every-other-box threads; gap at the end or in the middle) are mixed in across ages ~6–15
 * (about 1 in 5 requests there), tagged `mr:series`.
 *
 * Layout follows the DS reference module: pure generate/score at the top, Player, then guide.
 *
 * Anti-shortcut design: distractors are built from single-attribute "near misses" plus two-attribute
 * variations, and a set is only accepted when the answer is neither the most "typical" option (the one
 * sharing most attribute values with the others) nor the odd one out. Every item is checked with an
 * independent rule solver (model.ts) so that exactly one option fits.
 */
import { useState, type CSSProperties } from 'react';
import { createRng, type Rng } from '../../core/rng';
import type { GenerateRequest, Item, PlayerProps, ScoreOutcome, SubtestGuide, SubtestModule } from '../../core/types';
import { ChoiceGrid } from '../../ui/kit';
import { SHAPE_COLORS, SHAPE_NAMES, ShapeGlyph, shapeOutline, type ShapeColor, type ShapeFill, type ShapeKind, type ShapeSpec } from '../../ui/shapes';
import {
  cellAttrs, cellKey, consistentOptions, FIG_ATTRS, fillGap, isConsistent, majorityScores, normRot,
  type AttrValue, type FigAttr, type FigCell, type MrCell, type SpokeCell,
} from './model';

export type { MrCell, FigCell, SpokeCell } from './model';

export interface MrPayload {
  template: string;
  rows: number;
  cols: number;
  /** Every cell except the gap (row-major). */
  cells: MrCell[];
  options: MrCell[];
  /** Index into options. */
  answer: number;
  /** Row patterns: length of the repeating unit (used for the hint highlight). */
  unit?: number;
  /** Number of rules the child has to track at once. */
  rules: number;
  /** Index of the missing box in the full grid/row. Absent = the last box (bottom-right / end of the row). */
  gap?: number;
  /** Series (single-row "what changes each step") items: 'step' = box-to-box rules, 'alt' = every-other-box threads. */
  series?: 'step' | 'alt';
}
export type MrResponse = number;

// ---------- vocabulary ----------

const BASIC: ShapeKind[] = ['circle', 'square', 'triangle', 'star', 'heart', 'diamond', 'hexagon', 'cross'];
/** Shapes whose turning is easy to see. */
const TURNERS: ShapeKind[] = ['arrow', 'moon', 'semicircle', 'heart'];
/**
 * Colour-blind-safe palette (format study §E): colour often carries the answer here (a colour near miss
 * differs from the answer ONLY in colour), so every pair of colours must stay apart for red–green and
 * blue–yellow colour blindness. No green, orange or purple. Yellow is drawn with a dark halo (see CellArt)
 * so its outline still shows on the cream background when the shape is not solid.
 */
export const MR_COLORS: readonly ShapeColor[] = ['red', 'blue', 'yellow', 'black'];
const COLORS = MR_COLORS as ShapeColor[];
const FILLS: ShapeFill[] = ['solid', 'empty', 'striped', 'dotted'];
const FILL_ORDER: ShapeFill[] = ['empty', 'striped', 'solid'];

const SIZE_WORD = ['small', 'medium', 'big'];
const FILL_WORD: Record<ShapeFill, string> = { empty: 'empty', striped: 'striped', dotted: 'dotty', solid: 'filled-in' };
const CORNER_WORD = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];
const DIR_WORD = ['up', 'up-right', 'right', 'down-right', 'down', 'down-left', 'left', 'up-left'];
const ATTR_WORD: Record<FigAttr, string> = {
  shape: 'shape', color: 'color', fill: 'inside pattern', size: 'size', count: 'number of shapes', rot: 'direction it points', pos: 'corner',
};
const ATTR_PLURAL: Record<FigAttr, string> = {
  shape: 'shapes', color: 'colors', fill: 'patterns', size: 'sizes', count: 'numbers', rot: 'directions', pos: 'corners',
};

const uniq = <T,>(xs: T[]) => xs.filter((x, i) => xs.indexOf(x) === i);
const listWords = (ws: string[]) => (ws.length <= 1 ? ws.join('') : `${ws.slice(0, -1).join(', ')} and ${ws[ws.length - 1]}`);
const article = (w: string) => (/^[aeiou]/i.test(w) ? 'an' : 'a');
const plural = (s: ShapeKind) => `${SHAPE_NAMES[s]}s`;

function valWord(attr: FigAttr, v: AttrValue): string {
  switch (attr) {
    case 'shape': return SHAPE_NAMES[v as ShapeKind];
    case 'color': return String(v);
    case 'fill': return FILL_WORD[v as ShapeFill];
    case 'size': return SIZE_WORD[v as number];
    case 'count': return String(v);
    case 'rot': return `${v}°`;
    case 'pos': return CORNER_WORD[v as number];
  }
}

export function describe(c: MrCell, withSize = false): string {
  if (c.kind === 'spokes') {
    if (c.spokes.length === 0) return 'an empty box';
    const n = c.spokes.length === 1 ? 'one stick' : `${c.spokes.length} sticks`;
    return `${n} pointing ${listWords(c.spokes.map((i) => DIR_WORD[i]))}`;
  }
  const words: string[] = [];
  if (withSize) words.push(SIZE_WORD[c.size]);
  if (c.fill !== 'solid') words.push(FILL_WORD[c.fill]);
  words.push(c.color);
  const phrase = [...words, c.count === 1 ? SHAPE_NAMES[c.shape] : plural(c.shape)].join(' ');
  let s = c.count === 1 ? `${article(phrase)} ${phrase}` : `${c.count} ${phrase}`;
  if (c.pos >= 0) s += ` in the ${CORNER_WORD[c.pos]} corner`;
  if (c.shape === 'arrow') s += ` pointing ${DIR_WORD[(2 + Math.round(c.rot / 45)) % 8]}`;
  return s;
}

// ---------- rules ----------

type GRule =
  | { k: 'const'; v: AttrValue }
  | { k: 'row'; vs: AttrValue[] }
  | { k: 'col'; vs: AttrValue[] }
  | { k: 'cycle'; seq: AttrValue[] }
  | { k: 'prog'; starts: number[]; step: number }
  | { k: 'dist'; vs: AttrValue[]; shift: number }
  | { k: 'add'; a: number[]; b: number[]; op: 1 | -1 }
  /** Series only: up-and-down "hill", one period of values (repeats). */
  | { k: 'bounce'; seq: number[] }
  /** Series only: boxes 1, 3, 5… start at `a` and change by `sa`; boxes 2, 4, 6… start at `b` and change by `sb`. */
  | { k: 'inter'; a: number; sa: number; b: number; sb: number };
type Spec = Record<FigAttr, GRule>;

const K = (v: AttrValue): GRule => ({ k: 'const', v });
const ROW = (vs: AttrValue[]): GRule => ({ k: 'row', vs });
const COL = (vs: AttrValue[]): GRule => ({ k: 'col', vs });
const CYC = (seq: AttrValue[]): GRule => ({ k: 'cycle', seq });
const PROG = (starts: number[], step: number): GRule => ({ k: 'prog', starts, step });
const DIST = (vs: AttrValue[], shift: number): GRule => ({ k: 'dist', vs, shift });
const BOUNCE = (seq: number[]): GRule => ({ k: 'bounce', seq });
const INTER = (a: number, sa: number, b: number, sb: number): GRule => ({ k: 'inter', a, sa, b, sb });

function valueAt(attr: FigAttr, rule: GRule, r: number, c: number): AttrValue {
  let v: AttrValue;
  switch (rule.k) {
    case 'const': v = rule.v; break;
    case 'row': v = rule.vs[r]; break;
    case 'col': v = rule.vs[c]; break;
    case 'cycle': v = rule.seq[c % rule.seq.length]; break;
    case 'prog': v = rule.starts[r] + rule.step * c; break;
    case 'dist': v = rule.vs[(c + rule.shift * r) % rule.vs.length]; break;
    case 'add': v = c === 0 ? rule.a[r] : c === 1 ? rule.b[r] : rule.a[r] + rule.op * rule.b[r]; break;
    case 'bounce': v = rule.seq[c % rule.seq.length]; break;
    case 'inter': v = c % 2 === 0 ? rule.a + rule.sa * (c / 2) : rule.b + rule.sb * ((c - 1) / 2); break;
  }
  if (attr === 'rot') v = (((v as number) % 360) + 360) % 360;
  if (attr === 'pos' && (rule.k === 'prog' || rule.k === 'inter')) v = (((v as number) % 4) + 4) % 4;
  if (attr === 'fill' && typeof v === 'number') v = FILL_ORDER[v];
  return v;
}

function fig(o: Record<FigAttr, AttrValue>): FigCell {
  const shape = o.shape as ShapeKind;
  return {
    kind: 'fig', shape, color: o.color as ShapeColor, fill: o.fill as ShapeFill,
    size: o.size as number, count: o.count as number, rot: normRot(shape, o.rot as number), pos: o.pos as number,
  };
}

function buildFig(spec: Spec, R: number, C: number): FigCell[] {
  const out: FigCell[] = [];
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const o = {} as Record<FigAttr, AttrValue>;
      for (const a of FIG_ATTRS) o[a] = valueAt(a, spec[a], r, c);
      out.push(fig(o));
    }
  }
  return out;
}

interface RuleNote { skill: string; text: string; hint: string; main: boolean; /** short name of the rule (series explanations) */ short?: string }

interface Plan {
  R: number;
  C: number;
  unit?: number;
  spec?: Partial<Spec>;
  /** Overlay items: complete grid and plausible "wrong operation" options. */
  spokes?: { cells: SpokeCell[]; extras: SpokeCell[]; op: 'or' | 'sub' | 'xor'; colorDist: boolean };
  /** Attributes governed by a rule (distractors vary these). */
  vary: FigAttr[];
  /** Order in which to explain rules (defaults to vary). */
  explain?: FigAttr[];
  /** Series items: index of the gap (default last) and how the row is read. */
  gap?: number;
  series?: 'step' | 'alt';
}

interface Template { id: string; diff: number; plan: (rng: Rng) => Plan }
const T = (id: string, diff: number, plan: (rng: Rng) => Plan): Template => ({ id, diff, plan });

function rowPattern(rng: Rng, pattern: number[], attrs: ('shape' | 'color')[], C: number): Plan {
  const n = Math.max(...pattern) + 1;
  const shapes = rng.sample(BASIC, n);
  const colors = rng.sample(COLORS, n);
  const spec: Partial<Spec> = {};
  if (attrs.includes('shape')) spec.shape = CYC(pattern.map((i) => shapes[i]));
  if (attrs.includes('color')) spec.color = CYC(pattern.map((i) => colors[i]));
  return { R: 1, C, unit: pattern.length, spec, vary: attrs };
}

const turns = (rng: Rng) => rng.int(0, 7) * 45;

function overlayPlan(rng: Rng, op: 'or' | 'sub' | 'xor', colorDist: boolean): Plan {
  const set = (n: number, from = [0, 1, 2, 3, 4, 5, 6, 7]) => rng.sample(from, n).sort((a, b) => a - b);
  const toMask = (s: number[]) => s.reduce((m, i) => m | (1 << i), 0);
  const fromMask = (m: number) => [0, 1, 2, 3, 4, 5, 6, 7].filter((i) => m & (1 << i));
  const rows: number[][] = [];
  let extras: number[] = [];
  for (let r = 0; r < 3; r++) {
    for (let attempt = 0; attempt < 100; attempt++) {
      let a: number, b: number, c: number;
      if (op === 'sub') {
        const A = set(rng.int(4, 5));
        a = toMask(A);
        b = toMask(rng.sample(A, rng.int(1, 2)));
        c = a & ~b;
      } else {
        a = toMask(set(rng.int(2, op === 'xor' ? 4 : 3)));
        b = toMask(set(rng.int(2, 3)));
        const overlap = bitCount(a & b);
        if ((b & ~a) === 0 || (a & ~b) === 0) continue;
        if (op === 'or' && overlap > 1) continue;
        if (op === 'xor' && overlap < 1) continue;
        c = op === 'or' ? a | b : a ^ b;
      }
      if (c === 0 || c === a || c === b) continue;
      rows.push([a, b, c]);
      if (r === 2) {
        extras = op === 'or' ? [a ^ b, a, b] : op === 'xor' ? [a | b, a & b, a, b] : [a, b, a | b];
      }
      break;
    }
  }
  const colors = rng.sample(COLORS, 3);
  const shift = rng.pick([1, 2]);
  const cells: SpokeCell[] = [];
  rows.forEach((row, r) => row.forEach((m, c) => {
    cells.push({ kind: 'spokes', color: colorDist ? colors[(c + shift * r) % 3] : colors[0], spokes: fromMask(m) });
  }));
  const ansColor = cells[8].color;
  return {
    R: 3, C: 3, vary: [],
    spokes: {
      cells, op, colorDist,
      extras: extras.filter((m) => m !== 0).map((m) => ({ kind: 'spokes', color: ansColor, spokes: fromMask(m) })),
    },
  };
}

function bitCount(m: number): number {
  let n = 0;
  for (let i = 0; i < 8; i++) if (m & (1 << i)) n++;
  return n;
}

const TEMPLATES: Template[] = [
  // ---- row patterns & 2×2 analogies (about ages 4–7) ----
  T('row-ab-both', 3.5, (rng) => rowPattern(rng, [0, 1], ['shape', 'color'], 6)),
  T('row-ab', 4, (rng) => rowPattern(rng, [0, 1], [rng.pick(['shape', 'color'] as const)], 6)),
  T('grid2-color', 4.5, (rng) => ({ R: 2, C: 2, spec: { color: COL(rng.sample(COLORS, 2)), shape: ROW(rng.sample(BASIC, 2)) }, vary: ['color'], explain: ['color', 'shape'] })),
  T('row-aabb', 4.5, (rng) => rowPattern(rng, [0, 0, 1, 1], rng.chance(0.5) ? ['shape', 'color'] : ['shape'], 8)),
  T('grid2-shape', 5, (rng) => ({ R: 2, C: 2, spec: { shape: COL(rng.sample(BASIC, 2)), color: ROW(rng.sample(COLORS, 2)) }, vary: ['shape'], explain: ['shape', 'color'] })),
  T('row-abc', 5, (rng) => rowPattern(rng, [0, 1, 2], rng.chance(0.5) ? ['shape', 'color'] : ['shape'], 6)),
  T('row-aab', 5.5, (rng) => rowPattern(rng, rng.chance(0.5) ? [0, 0, 1] : [0, 1, 1], [rng.pick(['shape', 'color'] as const)], 6)),
  T('grid2-size', 5.5, (rng) => ({ R: 2, C: 2, spec: { size: COL(rng.chance(0.5) ? [2, 0] : [0, 2]), shape: ROW(rng.sample(BASIC, 2)) }, vary: ['size'], explain: ['size', 'shape'] })),
  T('row-count', 5.5, (rng) => {
    const up = rng.chance(0.6);
    return { R: 1, C: 5, spec: { count: PROG([up ? rng.int(1, 2) : 5], up ? 1 : -1) }, vary: ['count'] };
  }),
  T('grid2-fill', 6, (rng) => ({ R: 2, C: 2, spec: { fill: COL(rng.sample(FILLS, 2)), shape: ROW(rng.sample(BASIC, 2)) }, vary: ['fill'], explain: ['fill', 'shape'] })),
  T('grid3-rowsame', 6, (rng) => ({ R: 3, C: 3, spec: { shape: ROW(rng.sample(BASIC, 3)), color: ROW(rng.sample(COLORS, 3)) }, vary: ['shape', 'color'] })),
  T('grid2-count', 6.5, (rng) => {
    const [a, b] = rng.sample([1, 2, 3, 4], 2);
    return { R: 2, C: 2, spec: { count: COL([a, b]), shape: ROW(rng.sample(BASIC, 2)) }, vary: ['count'], explain: ['count', 'shape'] };
  }),
  T('grid2-rot', 6.5, (rng) => {
    const r0 = rng.int(0, 3) * 90;
    return { R: 2, C: 2, spec: { rot: COL([r0, r0 + rng.pick([90, 180, 270])]), shape: ROW(rng.sample(TURNERS, 2)) }, vary: ['rot'], explain: ['rot', 'shape'] };
  }),
  T('grid2-two', 7, (rng) => {
    const [a1, a2] = rng.sample(['color', 'size', 'fill'] as const, 2);
    const vals = (a: 'color' | 'size' | 'fill'): AttrValue[] => (a === 'color' ? rng.sample(COLORS, 2) : a === 'size' ? (rng.chance(0.5) ? [2, 0] : [0, 2]) : rng.sample(FILLS, 2));
    return { R: 2, C: 2, spec: { [a1]: COL(vals(a1)), [a2]: COL(vals(a2)), shape: ROW(rng.sample(BASIC, 2)) }, vary: [a1, a2], explain: [a1, a2, 'shape'] };
  }),
  T('grid2-two-b', 7.5, (rng) => {
    const a2 = rng.pick(['color', 'fill'] as const);
    const r0 = rng.int(0, 3) * 90;
    return {
      R: 2, C: 2,
      spec: { rot: COL([r0, r0 + rng.pick([90, 180])]), [a2]: COL(a2 === 'color' ? rng.sample(COLORS, 2) : rng.sample(FILLS, 2)), shape: ROW(rng.sample(TURNERS, 2)) },
      vary: ['rot', a2], explain: ['rot', a2, 'shape'],
    };
  }),
  // ---- 3×3 single rules (about ages 7–10) ----
  T('grid3-size', 7.5, (rng) => {
    const up = rng.chance(0.5);
    return { R: 3, C: 3, spec: { size: PROG(up ? [0, 0, 0] : [2, 2, 2], up ? 1 : -1), shape: ROW(rng.sample(BASIC, 3)) }, vary: ['size'], explain: ['size', 'shape'] };
  }),
  T('grid3-count', 8, (rng) => {
    const up = rng.chance(0.6);
    const starts = [0, 1, 2].map(() => (up ? rng.int(1, 3) : rng.int(3, 4)));
    return { R: 3, C: 3, spec: { count: PROG(starts, up ? 1 : -1), shape: ROW(rng.sample(BASIC, 3)) }, vary: ['count'], explain: ['count', 'shape'] };
  }),
  T('grid3-fill', 8, (rng) => {
    const up = rng.chance(0.5);
    return { R: 3, C: 3, spec: { fill: PROG(up ? [0, 0, 0] : [2, 2, 2], up ? 1 : -1), shape: ROW(rng.sample(BASIC, 3)) }, vary: ['fill'], explain: ['fill', 'shape'] };
  }),
  T('grid3-dist-shape', 8.5, (rng) => ({
    R: 3, C: 3, spec: { shape: DIST(rng.sample(BASIC, 3), rng.pick([1, 2])), color: rng.chance(0.5) ? ROW(rng.sample(COLORS, 3)) : K(rng.pick(COLORS)) }, vary: ['shape'], explain: ['shape', 'color'],
  })),
  T('grid3-dist-color', 8.5, (rng) => ({
    R: 3, C: 3, spec: { color: DIST(rng.sample(COLORS, 3), rng.pick([1, 2])), shape: rng.chance(0.5) ? ROW(rng.sample(BASIC, 3)) : K(rng.pick(BASIC)) }, vary: ['color'], explain: ['color', 'shape'],
  })),
  T('grid3-rot', 9, (rng) => ({
    R: 3, C: 3, spec: { rot: PROG([turns(rng), turns(rng), turns(rng)], rng.pick([90, -90, 45, -45])), shape: ROW(rng.sample(TURNERS, 3)) }, vary: ['rot'], explain: ['rot', 'shape'],
  })),
  T('grid3-pos', 9.5, (rng) => ({
    R: 3, C: 3, spec: { pos: PROG([rng.int(0, 3), rng.int(0, 3), rng.int(0, 3)], rng.pick([1, -1])), color: ROW(rng.sample(COLORS, 3)), size: K(1) }, vary: ['pos'], explain: ['pos', 'color'],
  })),
  // ---- two rules at once (about ages 10–11) ----
  T('grid3-dist2', 10, (rng) => ({ R: 3, C: 3, spec: { shape: DIST(rng.sample(BASIC, 3), 1), color: DIST(rng.sample(COLORS, 3), 2) }, vary: ['shape', 'color'] })),
  T('grid3-size-dist', 10, (rng) => {
    const up = rng.chance(0.5);
    return { R: 3, C: 3, spec: { size: PROG(up ? [0, 0, 0] : [2, 2, 2], up ? 1 : -1), color: DIST(rng.sample(COLORS, 3), rng.pick([1, 2])) }, vary: ['size', 'color'] };
  }),
  T('grid3-count-dist', 10.5, (rng) => ({
    R: 3, C: 3, spec: { count: PROG([rng.int(1, 3), rng.int(1, 3), rng.int(1, 3)], 1), shape: DIST(rng.sample(BASIC, 3), rng.pick([1, 2])) }, vary: ['count', 'shape'],
  })),
  T('grid3-fill-dist', 10.5, (rng) => {
    const up = rng.chance(0.5);
    return { R: 3, C: 3, spec: { fill: PROG(up ? [0, 0, 0] : [2, 2, 2], up ? 1 : -1), shape: DIST(rng.sample(BASIC, 3), rng.pick([1, 2])) }, vary: ['fill', 'shape'] };
  }),
  T('grid3-rot-dist', 11, (rng) => ({
    R: 3, C: 3, spec: { rot: PROG([turns(rng), turns(rng), turns(rng)], rng.pick([90, -90, 45, -45])), color: DIST(rng.sample(COLORS, 3), rng.pick([1, 2])), shape: ROW(rng.sample(TURNERS, 3)) }, vary: ['rot', 'color'], explain: ['rot', 'color', 'shape'],
  })),
  T('grid3-pos-dist', 11, (rng) => ({
    R: 3, C: 3, spec: { pos: PROG([rng.int(0, 3), rng.int(0, 3), rng.int(0, 3)], rng.pick([1, -1])), shape: DIST(rng.sample(BASIC, 3), rng.pick([1, 2])), size: K(1) }, vary: ['pos', 'shape'],
  })),
  // ---- overlays, counting maths, three or more rules (about ages 11–16+) ----
  T('overlay-or', 11.5, (rng) => overlayPlan(rng, 'or', false)),
  T('count-add', 12, (rng) => ({
    R: 3, C: 3, spec: { count: { k: 'add', a: [0, 1, 2].map(() => rng.int(1, 3)), b: [0, 1, 2].map(() => rng.int(1, 3)), op: 1 }, shape: ROW(rng.sample(BASIC, 3)) }, vary: ['count'], explain: ['count', 'shape'],
  })),
  T('overlay-sub', 12.5, (rng) => overlayPlan(rng, 'sub', false)),
  T('count-sub', 13, (rng) => {
    const a = [0, 1, 2].map(() => rng.int(3, 6));
    return { R: 3, C: 3, spec: { count: { k: 'add', a, b: a.map((x) => rng.int(1, x - 1)), op: -1 }, shape: ROW(rng.sample(BASIC, 3)) }, vary: ['count'], explain: ['count', 'shape'] };
  }),
  T('three-size', 13, (rng) => {
    const up = rng.chance(0.5);
    return { R: 3, C: 3, spec: { shape: DIST(rng.sample(BASIC, 3), 1), color: DIST(rng.sample(COLORS, 3), 2), size: PROG(up ? [0, 0, 0] : [2, 2, 2], up ? 1 : -1) }, vary: ['shape', 'color', 'size'] };
  }),
  T('count-add-dist', 13.5, (rng) => ({
    R: 3, C: 3,
    spec: { count: { k: 'add', a: [0, 1, 2].map(() => rng.int(1, 3)), b: [0, 1, 2].map(() => rng.int(1, 3)), op: 1 }, shape: DIST(rng.sample(BASIC, 3), rng.pick([1, 2])), color: ROW(rng.sample(COLORS, 3)) },
    vary: ['count', 'shape'], explain: ['count', 'shape', 'color'],
  })),
  T('three-count', 13.5, (rng) => ({
    R: 3, C: 3, spec: { shape: DIST(rng.sample(BASIC, 3), 1), color: DIST(rng.sample(COLORS, 3), 2), count: PROG([rng.int(1, 2), rng.int(1, 2), rng.int(1, 2)], 1) }, vary: ['shape', 'color', 'count'],
  })),
  T('overlay-xor', 14, (rng) => overlayPlan(rng, 'xor', false)),
  T('three-fill', 14, (rng) => {
    const up = rng.chance(0.5);
    return { R: 3, C: 3, spec: { shape: DIST(rng.sample(BASIC, 3), 1), color: DIST(rng.sample(COLORS, 3), 2), fill: PROG(up ? [0, 0, 0] : [2, 2, 2], up ? 1 : -1) }, vary: ['shape', 'color', 'fill'] };
  }),
  T('three-rot', 14.5, (rng) => ({
    R: 3, C: 3, spec: { shape: DIST(rng.sample(TURNERS, 3), 1), color: DIST(rng.sample(COLORS, 3), 2), rot: PROG([turns(rng), turns(rng), turns(rng)], rng.pick([90, -90, 45, -45])) }, vary: ['shape', 'color', 'rot'],
  })),
  T('three-pos', 15, (rng) => ({
    R: 3, C: 3, spec: { pos: PROG([rng.int(0, 3), rng.int(0, 3), rng.int(0, 3)], rng.pick([1, -1])), shape: DIST(rng.sample(BASIC, 3), 1), color: DIST(rng.sample(COLORS, 3), 2), size: K(1) }, vary: ['pos', 'shape', 'color'],
  })),
  T('count-sub-dist2', 15.5, (rng) => {
    const a = [0, 1, 2].map(() => rng.int(3, 6));
    return {
      R: 3, C: 3, spec: { count: { k: 'add', a, b: a.map((x) => rng.int(1, x - 1)), op: -1 }, shape: DIST(rng.sample(BASIC, 3), 1), color: DIST(rng.sample(COLORS, 3), 2) },
      vary: ['count', 'shape', 'color'],
    };
  }),
  T('four-rules', 16, (rng) => {
    const up = rng.chance(0.5);
    return {
      R: 3, C: 3,
      spec: { shape: DIST(rng.sample(BASIC, 3), 1), color: DIST(rng.sample(COLORS, 3), 2), size: PROG(up ? [0, 0, 0] : [2, 2, 2], up ? 1 : -1), count: PROG([rng.int(1, 2), rng.int(1, 2), rng.int(1, 2)], 1) },
      vary: ['shape', 'color', 'size', 'count'],
    };
  }),
  T('overlay-xor-dist', 16.5, (rng) => overlayPlan(rng, 'xor', true)),
];

// ---- series: one row of 4–6 boxes, "what changes each step?" (about ages 6–15) ----
// Like the real test, serial items are mixed in across the whole range, not only for the youngest.
const dirPick = (rng: Rng) => rng.pick([1, -1]);
const quarter = (rng: Rng) => rng.int(0, 3) * 90;
const ROT_SHAPES: ShapeKind[] = ['arrow', 'moon'];

const SERIES: Template[] = [
  // ~6–7.5: two things changing at once, gaps in the middle
  T('series-grow-color', 6, (rng) => ({
    R: 1, C: 5, gap: 4, series: 'step', spec: { count: PROG([rng.int(1, 2)], 1), color: CYC(rng.sample(COLORS, 2)) }, vary: ['count', 'color'],
  })),
  T('series-gap-grow', 6.5, (rng) => {
    const up = rng.chance(0.6);
    return { R: 1, C: 5, gap: rng.int(1, 3), series: 'step', spec: { count: PROG([up ? rng.int(1, 2) : rng.int(5, 6)], up ? 1 : -1), shape: CYC(rng.sample(BASIC, 2)) }, vary: ['count', 'shape'] };
  }),
  T('series-shape2-color3', 7, (rng) => ({
    R: 1, C: 6, gap: 5, series: 'step', spec: { shape: CYC(rng.sample(BASIC, 2)), color: CYC(rng.sample(COLORS, 3)) }, vary: ['shape', 'color'],
  })),
  T('series-turn', 7.5, (rng) => ({
    R: 1, C: 5, gap: 4, series: 'step', spec: { rot: PROG([quarter(rng)], 90 * dirPick(rng)), shape: K(rng.pick(TURNERS)) }, vary: ['rot'],
  })),
  // ~8–10: turning, hills, corner walks, gaps in the middle
  T('series-hill', 8, (rng) => {
    const useCount = rng.chance(0.4);
    const hill = useCount ? [1, 2, 3, 2] : [0, 1, 2, 1];
    const phase = rng.int(0, 3);
    const seq = [0, 1, 2, 3].map((i) => hill[(i + phase) % 4]);
    return { R: 1, C: 6, gap: 5, series: 'step', spec: useCount ? { count: BOUNCE(seq) } : { size: BOUNCE(seq) }, vary: [useCount ? 'count' : 'size'] };
  }),
  T('series-turn-gap', 8.5, (rng) => ({
    R: 1, C: 6, gap: rng.int(1, 4), series: 'step', spec: { rot: PROG([turns(rng)], 45 * dirPick(rng)), shape: K(rng.pick(TURNERS)) }, vary: ['rot'],
  })),
  T('series-corners', 9, (rng) => ({
    R: 1, C: 6, gap: rng.int(2, 5), series: 'step',
    spec: { pos: PROG([rng.int(0, 3)], dirPick(rng)), color: CYC(rng.sample(COLORS, 2)), size: K(1) }, vary: ['pos', 'color'],
  })),
  T('series-turn-fill', 9.5, (rng) => ({
    R: 1, C: 6, gap: rng.int(1, 5), series: 'step',
    spec: { rot: PROG([quarter(rng)], 90 * dirPick(rng)), fill: CYC(rng.sample(FILLS, 2)), shape: K(rng.pick(TURNERS)) }, vary: ['rot', 'fill'],
  })),
  T('series-skip', 10, (rng) => {
    const up = rng.chance(0.5);
    const long = rng.chance(0.6); // 1,3,5,7,9 (5 boxes) or 2,4,6,8 (4 boxes)
    const C = long ? 5 : 4;
    const start = up ? (long ? 1 : 2) : long ? 9 : 8;
    return { R: 1, C, gap: rng.int(1, C - 1), series: 'step', spec: { count: PROG([start], up ? 2 : -2) }, vary: ['count'] };
  }),
  T('series-corner-color3', 10.5, (rng) => ({
    R: 1, C: 6, gap: 5, series: 'step',
    spec: { pos: PROG([rng.int(0, 3)], dirPick(rng)), color: CYC(rng.sample(COLORS, 3)), size: K(1) }, vary: ['pos', 'color'],
  })),
  // ~11–13: two progressions at once, skips, different-length repeats
  T('series-count-turn', 11, (rng) => {
    const up = rng.chance(0.6);
    return {
      R: 1, C: 5, gap: 4, series: 'step',
      spec: { count: PROG([up ? 1 : 5], up ? 1 : -1), rot: PROG([quarter(rng)], 90 * dirPick(rng)), shape: K(rng.pick(TURNERS)) }, vary: ['count', 'rot'],
    };
  }),
  T('series-skip-shapes', 11.5, (rng) => {
    const up = rng.chance(0.5);
    return { R: 1, C: 5, gap: rng.int(1, 3), series: 'step', spec: { count: PROG([up ? 1 : 9], up ? 2 : -2), shape: CYC(rng.sample(BASIC, 2)) }, vary: ['count', 'shape'] };
  }),
  T('series-fill3-shape2', 12, (rng) => ({
    R: 1, C: 6, gap: 5, series: 'step', spec: { fill: CYC(rng.sample(FILLS, 3)), shape: CYC(rng.sample(BASIC, 2)) }, vary: ['fill', 'shape'],
  })),
  T('series-corner-turn', 12.5, (rng) => ({
    R: 1, C: 6, gap: rng.int(1, 4), series: 'step',
    spec: { pos: PROG([rng.int(0, 3)], dirPick(rng)), rot: PROG([quarter(rng)], 90 * dirPick(rng)), shape: K(rng.pick(ROT_SHAPES)), size: K(1) }, vary: ['pos', 'rot'],
  })),
  T('series-three', 13, (rng) => {
    const up = rng.chance(0.6);
    return {
      R: 1, C: 6, gap: 5, series: 'step',
      spec: { count: PROG([up ? 1 : 6], up ? 1 : -1), fill: CYC(rng.sample(FILLS, 3)), color: CYC(rng.sample(COLORS, 2)) }, vary: ['count', 'fill', 'color'],
    };
  }),
  // ~13.5–15: every-other-box threads, alternating steps, three rules with a middle gap
  T('series-zigzag-count', 13.5, (rng) => {
    const lo = rng.int(1, 3);
    const hi = rng.int(7, 9);
    const sUp = rng.pick([1, 2]);
    const sDown = -rng.pick([1, 2]);
    const upFirst = rng.chance(0.5);
    const count = upFirst ? INTER(lo, sUp, hi, sDown) : INTER(hi, sDown, lo, sUp);
    return { R: 1, C: 6, gap: rng.int(2, 5), series: 'alt', spec: { count, shape: CYC(rng.sample(BASIC, 2)) }, vary: ['count', 'shape'] };
  }),
  T('series-zigzag-turn', 14, (rng) => {
    const [sa, sb] = rng.sample([90, -90, 45, -45], 2);
    return {
      R: 1, C: 6, gap: rng.int(2, 5), series: 'alt',
      spec: { rot: INTER(turns(rng), sa, turns(rng), sb), color: CYC(rng.sample(COLORS, 2)), shape: K('arrow') }, vary: ['rot', 'color'],
    };
  }),
  T('series-three-gap', 14.5, (rng) => {
    const up = rng.chance(0.6);
    return {
      R: 1, C: 6, gap: rng.int(1, 4), series: 'step',
      spec: { count: PROG([up ? 1 : 6], up ? 1 : -1), shape: CYC(rng.sample(BASIC, 3)), color: CYC(rng.sample(COLORS, 2)) }, vary: ['count', 'shape', 'color'],
    };
  }),
  T('series-zigzag-two', 15, (rng) => {
    // the turn alternates between a quarter and an eighth turn, while the counts run in two threads
    const first = rng.pick([90, 45]);
    const dir = dirPick(rng);
    const r0 = turns(rng);
    const both = dir * 135;
    const lo = rng.int(1, 2);
    const hi = rng.int(6, 7);
    const count = rng.chance(0.5) ? INTER(lo, 1, hi, -1) : INTER(hi, -1, lo, 1);
    return {
      R: 1, C: 6, gap: rng.int(2, 5), series: 'alt',
      spec: { rot: INTER(r0, both, r0 + dir * first, both), count, shape: K('arrow') }, vary: ['rot', 'count'],
    };
  }),
];

export const TEMPLATE_IDS = [...TEMPLATES, ...SERIES].map((t) => t.id);
export const SERIES_IDS = SERIES.map((t) => t.id);

/** Share of requests (difficulty ~6–15) that become a series item. */
const SERIES_P = 0.2;

function nearest(list: Template[], d: number, rng: Rng): Template {
  const best = Math.min(...list.map((t) => Math.abs(t.diff - d)));
  return rng.pick(list.filter((t) => Math.abs(t.diff - d) <= best + 0.5));
}

export function pickTemplate(difficulty: number, rng: Rng, seriesRoll = 1): Template {
  const d = Math.max(3, Math.min(18, difficulty));
  if (d >= 5.75 && d <= 15.5 && seriesRoll < SERIES_P) return nearest(SERIES, d, rng);
  return nearest(TEMPLATES, d, rng);
}

// ---------- explanations ----------

function noteFor(attr: FigAttr, rule: GRule, at: (r: number, c: number) => FigCell, R: number, C: number): RuleNote | null {
  const w = ATTR_WORD[attr];
  const v = (r: number, c: number) => valWord(attr, at(r, c)[attr]);
  const last = R - 1;
  const ans = at(last, C - 1);
  switch (rule.k) {
    case 'const':
    case 'bounce':
    case 'inter':
      return null; // series rules are explained by seriesNote
    case 'cycle':
      return null; // row patterns get one combined note
    case 'col':
      return {
        skill: 'mr:analogy', main: true,
        text: `Going across, the ${w} changes from ${v(0, 0)} to ${v(0, 1)}. The bottom row changes the same way.`,
        hint: `Watch the ${w} in the top row. Now do the same thing to the bottom row.`,
      };
    case 'row':
      return R === 2
        ? { skill: 'mr:analogy', main: false, text: `Going down, the ${w} changes from ${v(0, 0)} to ${v(1, 0)}, so the bottom row keeps ${v(1, 0)}.`, hint: 'What stays the same along the bottom row?' }
        : { skill: 'mr:constant', main: false, text: `Each row keeps its own ${w}, so the last row stays ${v(last, 0)}.`, hint: `What stays the same in every box of a row?` };
    case 'prog': {
      const up = rule.step > 0;
      if (R === 1 && attr === 'count') {
        const seq = Array.from({ length: C - 1 }, (_, i) => String(at(0, i).count));
        return {
          skill: 'mr:progression', main: true,
          text: `There is one ${up ? 'more' : 'less'} shape each time: ${seq.join(', ')}… so next comes ${ans.count}.`,
          hint: 'Count the shapes in each box. Is it going up or down?',
        };
      }
      switch (attr) {
        case 'size':
          return { skill: 'mr:progression', main: true, text: `Across each row the shapes get ${up ? 'bigger: small, medium, big' : 'smaller: big, medium, small'}.`, hint: 'Look at the sizes as you go across a row.' };
        case 'count':
          return {
            skill: 'mr:progression', main: true,
            text: `Across each row there is one ${up ? 'more' : 'less'} shape each time. The last row goes ${at(last, 0).count}, ${at(last, 1).count}, so next comes ${ans.count}.`,
            hint: 'Count the shapes in each box going across a row.',
          };
        case 'fill':
          return { skill: 'mr:progression', main: true, text: `Across each row the shapes ${up ? 'fill up: empty, then striped, then filled-in' : 'empty out: filled-in, then striped, then empty'}.`, hint: 'Look at the insides of the shapes as you go across.' };
        case 'rot': {
          const big = Math.abs(rule.step) === 90;
          return {
            skill: 'mr:progression', main: true,
            text: `Across each row the shape turns ${big ? 'a quarter turn' : 'an eighth of a turn (half of a quarter turn)'} ${up ? 'clockwise, the way clock hands go' : 'counter-clockwise, against the clock'}.`,
            hint: 'Watch which way the shape points as you go across. How far does it turn each step?',
          };
        }
        case 'pos':
          return { skill: 'mr:position', main: true, text: `Across each row the shape hops to the next corner, going ${up ? 'clockwise (like clock hands)' : 'counter-clockwise'}. In the last box it lands in the ${CORNER_WORD[ans.pos]} corner.`, hint: 'Follow which corner the shape sits in, box by box.' };
        default:
          return null;
      }
    }
    case 'dist':
      return {
        skill: 'mr:distribution', main: true,
        text: `Every row has one of each ${w}: ${listWords(rule.vs.map((x) => valWord(attr, x)))}. The last row is still missing the ${v(last, C - 1)} one.`,
        hint: `Each row uses the same three ${ATTR_PLURAL[attr]}. Which one is missing from the last row?`,
      };
    case 'add': {
      const a = at(last, 0).count;
      const b = at(last, 1).count;
      return rule.op > 0
        ? { skill: 'mr:count', main: true, text: `In each row, the shapes in box 1 plus the shapes in box 2 make box 3. Last row: ${a} + ${b} = ${a + b}.`, hint: 'Count the shapes in each box. How do the first two numbers make the third?' }
        : { skill: 'mr:count', main: true, text: `In each row, box 1 take away box 2 makes box 3. Last row: ${a} − ${b} = ${a - b}.`, hint: 'Count the shapes in each box. How do the first two numbers make the third?' };
    }
  }
}

function overlayNotes(op: 'or' | 'sub' | 'xor', colorDist: boolean, colors: ShapeColor[]): RuleNote[] {
  const notes: RuleNote[] = [
    op === 'or'
      ? { skill: 'mr:overlay', main: true, text: 'In each row, stack box 1 on top of box 2 and you get box 3 — every stick from both boxes shows up.', hint: 'Imagine sliding the first two boxes on top of each other.' }
      : op === 'sub'
        ? { skill: 'mr:overlay', main: true, text: 'In each row, start with box 1 and take away the sticks that are in box 2. What is left is box 3.', hint: 'Which sticks from box 1 disappear in box 3? Look for them in box 2.' }
        : { skill: 'mr:overlay', main: true, text: 'In each row, stack box 1 and box 2: a stick that is in both boxes cancels out, and a stick that is in only one box stays.', hint: 'Stack the first two boxes. What happens to sticks that are in BOTH boxes?' },
  ];
  if (colorDist) {
    notes.push({ skill: 'mr:distribution', main: true, text: `Every row also uses each color once: ${listWords(colors)}.`, hint: 'Each row uses the same three colors. Which color is missing?' });
  }
  return notes;
}

/** Kid words for a turn, e.g. 90 → "a quarter turn clockwise". */
function turnWord(deg: number): string {
  const d = ((((deg % 360) + 540) % 360) - 180);
  const m = Math.abs(d);
  const amount = m === 45 ? 'an eighth of a turn' : m === 90 ? 'a quarter turn' : m === 135 ? 'three eighths of a turn' : m === 180 ? 'a half turn' : 'no turn';
  if (m === 0 || m === 180) return amount;
  return `${amount} ${d > 0 ? 'clockwise' : 'counter-clockwise'}`;
}

const CLOCK = (dir: number) => (dir > 0 ? 'clockwise (the way clock hands go)' : 'counter-clockwise (against the clock)');

/** Explanation for one rule of a single-row series. `gap` is the missing box. */
function seriesNote(attr: FigAttr, rule: GRule, cells: FigCell[], gap: number): RuleNote | null {
  const w = ATTR_WORD[attr];
  const seq = (pick: (c: FigCell) => string, idx = cells.map((_, i) => i)) => idx.map((i) => (i === gap ? '?' : pick(cells[i]))).join(', ');
  const thread = (start: number) => cells.map((_, i) => i).filter((i) => i % 2 === start);
  const boxNums = (start: number) => listWords(thread(start).map((i) => String(i + 1)));
  const countStep = (s: number) => (s > 0 ? `${s === 1 ? 'one' : s} more each time` : `${s === -1 ? 'one' : -s} fewer each time`);
  switch (rule.k) {
    case 'cycle': {
      const vals = rule.seq.map((v) => valWord(attr, v));
      const n = vals.length;
      return n === 2
        ? { skill: 'mr:pattern-row', main: true, short: `the ${w} takes turns`, text: `The ${w} takes turns: ${vals[0]}, ${vals[1]}, ${vals[0]}, ${vals[1]}…`, hint: `Look only at the ${w}. Does it take turns?` }
        : { skill: 'mr:pattern-row', main: true, short: `the ${w} repeats every ${n} boxes`, text: `The ${w} repeats every ${n} boxes: ${listWords(vals)}, then it starts again.`, hint: `Look only at the ${w}. After how many boxes does it start again?` };
    }
    case 'bounce':
      return attr === 'size'
        ? { skill: 'mr:progression', main: true, short: 'the size goes up and down like a hill', text: `The size goes up and down like a hill: ${seq((c) => SIZE_WORD[c.size])}. It grows to big, shrinks to small, then grows again.`, hint: 'Look at the sizes. Do they grow and then shrink again?' }
        : { skill: 'mr:progression', main: true, short: 'the number of shapes goes up and down like a hill', text: `The number of shapes goes up and down like a hill: ${seq((c) => String(c.count))}. It counts up to the top, then back down, then up again.`, hint: 'Count the shapes in each box. Do the numbers climb and then come back down?' };
    case 'prog': {
      const s = rule.step;
      switch (attr) {
        case 'count':
          return {
            skill: 'mr:progression', main: true, short: `the number of shapes goes ${s > 0 ? 'up' : 'down'} by ${Math.abs(s)} each time`,
            text: `The number of shapes goes ${s > 0 ? 'up' : 'down'} by ${Math.abs(s)} each time${Math.abs(s) === 2 ? ' (it skips a number)' : ''}: ${seq((c) => String(c.count))}.`,
            hint: 'Count the shapes in each box. How much does the number change each time?',
          };
        case 'rot':
          return {
            skill: 'mr:progression', main: true, short: `the shape turns ${turnWord(s)} each step`,
            text: `The shape turns ${turnWord(s)} each step (${s > 0 ? 'the way clock hands go' : 'against the clock'}).`,
            hint: 'Watch which way the shape points. How far does it turn from one box to the next?',
          };
        case 'pos':
          return {
            skill: 'mr:position', main: true, short: 'the shape hops to the next corner each step',
            text: `The shape hops to the next corner each step, going ${CLOCK(s)}: ${seq((c) => CORNER_WORD[c.pos])}.`,
            hint: 'Follow the corner the shape sits in, box by box.',
          };
        default:
          return null;
      }
    }
    case 'inter': {
      if (attr === 'count') {
        return {
          skill: 'mr:progression', main: true, short: 'the number of shapes follows two rules in every other box',
          text: `The number of shapes follows two rules that take turns. Boxes ${boxNums(0)}: ${seq((c) => String(c.count), thread(0))} (${countStep(rule.sa)}). Boxes ${boxNums(1)}: ${seq((c) => String(c.count), thread(1))} (${countStep(rule.sb)}).`,
          hint: `Skip every other box. Count boxes ${boxNums(0)} first, then boxes ${boxNums(1)}.`,
        };
      }
      if (attr === 'rot') {
        if (rule.sa === rule.sb) {
          const t1 = cells[1].rot - cells[0].rot;
          const t2 = rule.sa - t1;
          return {
            skill: 'mr:progression', main: true, short: 'the turns switch between quarter turns and eighth turns',
            text: `The turns take turns! The arrow turns ${turnWord(t1)}, then ${turnWord(t2)}, then ${turnWord(t1)}, then ${turnWord(t2)}… Each turn is the other kind from the one before.`,
            hint: 'Compare each box with the one before it. Is every turn the same size?',
          };
        }
        return {
          skill: 'mr:progression', main: true,
          short: `boxes ${thread(0).map((i) => i + 1).join(', ')} turn ${turnWord(rule.sa)} each time while boxes ${thread(1).map((i) => i + 1).join(', ')} turn ${turnWord(rule.sb)}`,
          text: `Every other box turns its own way. Boxes ${boxNums(0)} turn ${turnWord(rule.sa)} each time. Boxes ${boxNums(1)} turn ${turnWord(rule.sb)} each time.`,
          hint: `Skip every other box. How do boxes ${boxNums(0)} turn? How do boxes ${boxNums(1)} turn?`,
        };
      }
      return null;
    }
    default:
      return null;
  }
}

// ---------- distractors ----------

function figAlts(attr: FigAttr, ans: FigCell, cells: FigCell[], spec: Spec, rng: Rng): AttrValue[] {
  const inGrid = uniq(cells.map((c) => c[attr]));
  let extra: AttrValue[] = [];
  switch (attr) {
    case 'shape': extra = rng.shuffle(spec.rot.k !== 'const' ? TURNERS : BASIC); break;
    case 'color': extra = rng.shuffle(COLORS); break;
    case 'fill': extra = rng.shuffle(FILLS); break;
    case 'size': extra = rng.shuffle([0, 1, 2]); break;
    case 'count': {
      const r = spec.count;
      const wrongOp = r.k === 'add' ? [Math.abs(r.a[2] - r.b[2]), r.a[2] + r.b[2]] : [];
      extra = [ans.count + 1, ans.count - 1, ...wrongOp, ans.count + 2];
      break;
    }
    case 'rot': {
      const r = spec.rot;
      const st = r.k === 'prog' ? Math.abs(r.step) : 90;
      extra = r.k === 'inter'
        // threads / alternating steps: the classic slip is using the neighbour's step (45 vs 90)
        ? [45, -45, 90, -90, 180].map((x) => (((ans.rot + x) % 360) + 360) % 360)
        : [ans.rot + st, ans.rot - st, ans.rot + 180].map((x) => ((x % 360) + 360) % 360);
      break;
    }
    case 'pos': extra = rng.shuffle([0, 1, 2, 3]); break;
  }
  const order = attr === 'count' || attr === 'rot' ? [...extra, ...inGrid] : [...rng.shuffle(inGrid), ...extra];
  return uniq(order).filter((v) => v !== ans[attr] && (attr !== 'count' || ((v as number) >= 1 && (v as number) <= 9)));
}

function figCandidates(rng: Rng, ans: FigCell, cells: FigCell[], spec: Spec, vary: FigAttr[]) {
  const attrs = [...vary];
  const constAttrs = (['color', 'shape', 'fill', 'size'] as FigAttr[]).filter((a) => spec[a].k === 'const' && !attrs.includes(a));
  if (constAttrs.length) attrs.push(rng.pick(constAttrs));
  const alts = Object.fromEntries(attrs.map((a) => [a, figAlts(a, ans, cells, spec, rng)])) as Record<FigAttr, AttrValue[]>;
  const make = (changes: Partial<Record<FigAttr, AttrValue>>) => fig({ ...(ans as unknown as Record<FigAttr, AttrValue>), ...changes });
  const singles: MrCell[] = [];
  const doubles: MrCell[] = [];
  for (const a of attrs) for (const v of alts[a].slice(0, 4)) singles.push(make({ [a]: v }));
  for (let i = 0; i < attrs.length; i++) {
    for (let j = i + 1; j < attrs.length; j++) {
      for (const va of alts[attrs[i]].slice(0, 3)) for (const vb of alts[attrs[j]].slice(0, 3)) doubles.push(make({ [attrs[i]]: va, [attrs[j]]: vb }));
    }
  }
  return { singles, doubles };
}

function spokeCandidates(ans: SpokeCell, colorDist: boolean, colors: ShapeColor[]) {
  const singles: MrCell[] = [];
  const doubles: MrCell[] = [];
  const flip = (s: number[], i: number) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i].sort((a, b) => a - b));
  for (let i = 0; i < 8; i++) singles.push({ ...ans, spokes: flip(ans.spokes, i) });
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) doubles.push({ ...ans, spokes: flip(flip(ans.spokes, i), j) });
  const otherColors = colors.filter((c) => c !== ans.color);
  for (const c of otherColors) {
    if (colorDist) singles.push({ ...ans, color: c });
    for (let i = 0; i < 8; i += 3) doubles.push({ ...ans, color: c, spokes: flip(ans.spokes, i) });
  }
  return { singles: singles.filter((c) => c.kind !== 'spokes' || c.spokes.length > 0), doubles: doubles.filter((c) => c.kind !== 'spokes' || c.spokes.length > 0) };
}

/**
 * Choose 4 distractors: at least two single-attribute near misses, the rest two-attribute variations or
 * "wrong rule" results, such that the answer is neither the most typical option nor the odd one out.
 */
const STRICT_P = 0.6;

function pickDistractors(
  rng: Rng, ans: MrCell, R: number, C: number, shown: MrCell[], gap: number,
  singles: MrCell[], doubles: MrCell[], extras: MrCell[],
): MrCell[] | null {
  const ansKey = cellKey(ans);
  const seen = new Set<string>([ansKey]);
  const clean = (xs: MrCell[]) => {
    return xs.filter((c) => {
      const k = cellKey(c);
      if (seen.has(k)) return false;
      seen.add(k);
      return !isConsistent(R, C, fillGap(shown, c, gap));
    });
  };
  // extras ("wrong rule" results) first so they win de-duplication against flips that look the same
  const E = clean(extras);
  const S = clean(singles);
  const D = clean(doubles);
  if (S.length + D.length + E.length < 4) return null;
  for (let attempt = 0; attempt < 400; attempt++) {
    const strict = attempt < 300 && rng.chance(STRICT_P);
    const nE = E.length > 0 && rng.chance(0.5) ? 1 : 0;
    const nS = Math.min(S.length, rng.int(2, 4 - nE));
    const pick = [...rng.sample(S, nS), ...rng.sample(E, nE)];
    const keys = new Set(pick.map(cellKey));
    for (const c of rng.shuffle([...D, ...S])) {
      if (pick.length >= 4) break;
      const k = cellKey(c);
      if (!keys.has(k)) {
        keys.add(k);
        pick.push(c);
      }
    }
    if (pick.length < 4) continue;
    const sc = majorityScores([ans, ...pick]);
    const others = sc.slice(1);
    // The answer must never be the single most (or least) typical option; usually it is strictly
    // less typical than some distractor, so a "most common features" guess does no better than chance.
    if (sc[0] > Math.max(...others) || sc[0] < Math.min(...others)) continue;
    if (strict && sc[0] === Math.max(...others)) continue;
    return pick;
  }
  return null;
}

// ---------- generate ----------

/**
 * MR has no strict limit on the real test: a soft 60 s limit (the runner flags, never cuts off) and a
 * neutral "Do you have an answer?" prompt at about 30 s.
 */
const MR_TIME_LIMIT = 60;
const MR_PROMPT_AT = 30;

/**
 * One instruction stem per layout, the same on every item (format study §B): matrices "goes here",
 * a row with the gap at the end "comes next", a row with the gap in the middle "goes in the gap".
 */
export function mrStem(p: Pick<MrPayload, 'rows' | 'cols' | 'cells' | 'gap'>): string {
  if (p.rows !== 1) return 'Look at these. Which one goes here?';
  const gap = p.gap ?? p.cells.length;
  return gap === p.rows * p.cols - 1 ? 'Look at these. Which one comes next?' : 'Look at these. Which one goes in the gap?';
}

export function generate(req: GenerateRequest): Item<MrPayload> {
  const rng = createRng(req.seed);
  // Separate stream for the "series or not" roll, so matrix items stay exactly as they were.
  const seriesRoll = createRng((req.seed ^ 0x5e41e5) >>> 0).next();
  const tpl = pickTemplate(req.difficulty, rng, seriesRoll);
  for (let attempt = 0; attempt < 60; attempt++) {
    const plan = tpl.plan(rng);
    const { R, C } = plan;
    let full: MrCell[];
    let notes: RuleNote[];
    let singles: MrCell[];
    let doubles: MrCell[];
    let extras: MrCell[] = [];
    let withSize = false;
    /** series hints: how many boxes back the gap's "turn partner" sits (2 for separate every-other-box threads) */
    let rotBack = 1;
    if (plan.spokes) {
      full = plan.spokes.cells;
      if (full.length !== 9) continue;
      const colors = uniq(full.map((c) => c.color));
      notes = overlayNotes(plan.spokes.op, plan.spokes.colorDist, colors);
      ({ singles, doubles } = spokeCandidates(full[8] as SpokeCell, plan.spokes.colorDist, colors));
      extras = plan.spokes.extras;
    } else {
      const base: Spec = {
        shape: K(rng.pick(BASIC)), color: K(rng.pick(COLORS)), fill: K('solid'), size: K(2), count: K(1), rot: K(0), pos: K(-1),
      };
      const spec: Spec = { ...base, ...plan.spec };
      const figs = buildFig(spec, R, C);
      full = figs;
      withSize = spec.size.k !== 'const';
      if (spec.rot.k === 'inter' && spec.rot.sa !== spec.rot.sb) rotBack = 2;
      const at = (r: number, c: number) => figs[r * C + c];
      const g = plan.gap ?? figs.length - 1;
      if (plan.series) {
        notes = (plan.explain ?? plan.vary).map((a) => seriesNote(a, spec[a], figs, g)).filter((n): n is RuleNote => n !== null);
      } else if (plan.unit) {
        const unit = Array.from({ length: plan.unit }, (_, i) => describe(figs[i]));
        const say = Array.from({ length: Math.min(C - 1, plan.unit + 2) }, (_, i) => describe(figs[i]));
        notes = [{
          skill: 'mr:pattern-row', main: true,
          text: `It's a repeating pattern: ${listWords(unit)} — then it starts again.`,
          hint: `Say it out loud: ${say.join(', ')}… What comes next?`,
        }];
      } else {
        notes = (plan.explain ?? plan.vary).map((a) => noteFor(a, spec[a], at, R, C)).filter((n): n is RuleNote => n !== null);
      }
      ({ singles, doubles } = figCandidates(rng, figs[g], figs.filter((_, i) => i !== g), spec, plan.vary));
    }
    const gap = plan.gap ?? full.length - 1;
    const shown = full.filter((_, i) => i !== gap);
    const ans = full[gap];
    if (!isConsistent(R, C, full)) continue;
    const ds = pickDistractors(rng, ans, R, C, shown, gap, singles, doubles, extras);
    if (!ds) continue;

    const options = rng.shuffle([ans, ...ds]);
    const answer = options.findIndex((o) => cellKey(o) === cellKey(ans));
    // Final guard: the independent checker must accept the answer and nothing else.
    const fits = consistentOptions({ rows: R, cols: C, cells: shown, options, gap });
    if (fits.length !== 1 || fits[0] !== answer) continue;
    const main = notes.filter((n) => n.main);
    const nRules = Math.max(1, main.length);
    const d = describe(ans, withSize);

    const midGap = gap !== full.length - 1;
    const firstHint =
      plan.series === 'alt' ? 'Try skipping every other box: look at boxes 1, 3, 5, then at boxes 2, 4, 6.'
      : plan.series ? (midGap ? 'Look at the boxes on both sides of the gap. What changes from one box to the next?' : 'Go along the row box by box. What changes each step?')
      : R === 1 ? 'Say the pattern out loud, one box at a time.'
      : R === 2 ? 'Look at the top row. What changes from the first box to the second?'
      : 'Look across the top row, then the middle row. What changes? What stays the same?';
    let lastHint: string;
    if (plan.unit) lastHint = `The gap looks just like box ${((C - 1) % plan.unit) + 1}.`;
    else if (ans.kind === 'spokes') lastHint = `The gap has ${ans.spokes.length} stick${ans.spokes.length === 1 ? '' : 's'}.`;
    else if (plan.series && plan.vary[0] === 'rot') {
      const prev = full[gap - rotBack] as FigCell;
      lastHint = `Take box ${gap - rotBack + 1}${rotBack === 2 ? ' (two boxes back)' : ''} and turn it ${turnWord(ans.rot - prev.rot)}.`;
    } else if (plan.series && plan.vary[0] === 'count') {
      lastHint = `The gap has ${ans.count} shape${ans.count === 1 ? '' : 's'}.`;
    } else {
      const a = plan.vary[0];
      lastHint = `In the gap, the ${ATTR_WORD[a]} should be ${valWord(a, ans[a])}.`;
    }
    const hints = uniq([firstHint, ...main.map((n) => n.hint).slice(0, 2), lastHint]);

    const explanation =
      plan.series && nRules >= 2 ? `This one has ${nRules} rules at once: ${listWords(main.map((n) => n.short ?? n.text))}. Follow every rule and the missing piece is ${d}.`
      : nRules >= 2 ? `This one has ${nRules} rules working at the same time. Follow every rule and the missing piece is ${d}.`
      : `${notes.slice(0, 2).map((n) => n.text).join(' ')} So the missing piece is ${d}.`;
    const steps = nRules >= 2 ? [...notes.map((n) => n.text), `Put the rules together: ${d}.`] : undefined;

    const skills = uniq([...(plan.series ? ['mr:series'] : []), ...notes.map((n) => n.skill), ...(nRules >= 2 ? ['mr:multi-rule'] : [])]);

    const payload: MrPayload = {
      template: tpl.id, rows: R, cols: C, cells: shown, options, answer, unit: plan.unit, rules: nRules,
      ...(plan.series ? { gap, series: plan.series } : {}),
    };
    return {
      id: `MR:${tpl.id}:${req.seed}`,
      subtest: 'MR',
      difficulty: tpl.diff,
      seed: req.seed,
      payload,
      maxPoints: 1,
      timeLimitSec: MR_TIME_LIMIT,
      promptAtSec: MR_PROMPT_AT,
      skills,
      hints,
      explanation,
      steps,
      speak: mrStem(payload),
    };
  }
  throw new Error(`MR: could not build template ${tpl.id} for seed ${req.seed}`);
}

// ---------- score ----------

export function score(item: Item<MrPayload>, response: MrResponse | null): ScoreOutcome {
  const p = item.payload;
  const meta = { rules: p.rules };
  if (response === null || response === undefined) return { points: 0, correct: false, meta };
  const correct = response === p.answer;
  let feedback: string | undefined;
  const chosen = p.options[response];
  if (!correct && chosen) {
    const a = cellAttrs(chosen);
    const b = cellAttrs(p.options[p.answer]);
    const diff = Object.keys(b).filter((k) => a[k] !== b[k]);
    const words = uniq(diff.map((k) => (k.startsWith('s') && k.length === 2 ? 'sticks' : ATTR_WORD[k as FigAttr] ?? k)));
    if (words.length === 1) feedback = `So close! Your piece had everything right except the ${words[0]}.`;
  }
  return { points: correct ? 1 : 0, correct, meta, feedback };
}

// ---------- drawing ----------

const LAYOUTS: Record<number, { s: number; pts: [number, number][] }> = {
  1: { s: 0.8, pts: [[0, 0]] },
  2: { s: 0.44, pts: [[-23, 0], [23, 0]] },
  3: { s: 0.42, pts: [[-23, -20], [23, -20], [0, 21]] },
  4: { s: 0.4, pts: [[-23, -23], [23, -23], [-23, 23], [23, 23]] },
  5: { s: 0.34, pts: [[-27, -27], [27, -27], [0, 0], [-27, 27], [27, 27]] },
  6: { s: 0.32, pts: [[-28, -18], [0, -18], [28, -18], [-28, 18], [0, 18], [28, 18]] },
  7: { s: 0.27, pts: [[-30, -30], [0, -30], [30, -30], [-30, 0], [0, 0], [30, 0], [-30, 30], [0, 30], [30, 30]] },
};
LAYOUTS[8] = LAYOUTS[7];
LAYOUTS[9] = LAYOUTS[7];
const CORNERS: [number, number][] = [[-24, -24], [24, -24], [24, 24], [-24, 24]];

function figSpecs(c: FigCell): ShapeSpec[] {
  const k = [0.42, 0.7, 1][c.size] ?? 1; // well-separated so small vs medium is obvious at tile size
  const base = { kind: c.shape, color: c.color, fill: c.fill, rotation: c.rot };
  if (c.pos >= 0) return [{ ...base, scale: 0.42 * k, dx: CORNERS[c.pos][0], dy: CORNERS[c.pos][1] }];
  const L = LAYOUTS[Math.max(1, Math.min(9, c.count))];
  return L.pts.slice(0, c.count).map(([dx, dy]) => ({ ...base, scale: L.s * k, dx, dy }));
}

function Spokes({ cell }: { cell: SpokeCell }) {
  const col = SHAPE_COLORS[cell.color];
  return (
    <g>
      <circle cx={50} cy={50} r={40} fill="none" stroke="#1d2b2a" strokeOpacity={0.18} strokeWidth={1.5} strokeDasharray="3 4" />
      {cell.spokes.map((i) => {
        const a = ((i * 45 - 90) * Math.PI) / 180;
        const end = { x1: 50, y1: 50, x2: 50 + 38 * Math.cos(a), y2: 50 + 38 * Math.sin(a) };
        // dark edge under every stick so pale colours (yellow) still stand out from the card
        return (
          <g key={i}>
            <line {...end} stroke="#1d2b2a" strokeWidth={11} strokeLinecap="round" />
            <line {...end} stroke={col} strokeWidth={7} strokeLinecap="round" />
          </g>
        );
      })}
      <circle cx={50} cy={50} r={7} fill="#1d2b2a" />
    </g>
  );
}

/** Dark halo drawn under a pale (yellow) outlined shape so its edge is visible on the cream card. */
function Halo({ spec, strokeWidth }: { spec: ShapeSpec; strokeWidth: number }) {
  const scale = spec.scale ?? 1;
  const transform = `translate(${50 + (spec.dx ?? 0)} ${50 + (spec.dy ?? 0)}) rotate(${spec.rotation ?? 0}) scale(${scale}) translate(-50 -50)`;
  return (
    <g transform={transform}>
      {shapeOutline(spec.kind, { fill: 'none', stroke: '#1d2b2a', strokeWidth: (strokeWidth * 2.4) / scale, strokeLinejoin: 'round', vectorEffect: 'non-scaling-stroke' })}
    </g>
  );
}

export function CellArt({ cell }: { cell: MrCell }) {
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" role="img" aria-label={describe(cell, true)} style={{ display: 'block' }}>
      {cell.kind === 'fig'
        ? figSpecs(cell).map((s, i) => {
          const sw = 2.6 * (s.scale ?? 1);
          return (
            <g key={i}>
              {s.color === 'yellow' && s.fill !== 'solid' && <Halo spec={s} strokeWidth={sw} />}
              <ShapeGlyph spec={s} strokeWidth={sw} />
            </g>
          );
        })
        : <Spokes cell={cell} />}
    </svg>
  );
}

/**
 * Answer options sit in ONE row of 5 at every width (like the real response page), numbered 1–5 on a
 * tab under each option. On narrow phones the row bleeds into the card padding and the gap shrinks so
 * each tile stays at least ~60 px wide (and 64 px tall); only the art inside shrinks.
 */
const ROW5_CSS = `
.mr-row5 .choice { padding: 6px 4px 20px; min-height: 64px; }
.mr-row5 .choice .letter { top: auto; bottom: 2px; left: 0; right: 0; text-align: center; font-size: 0.85rem; color: var(--ink); }
@media (max-width: 420px) {
  .mr-row5.choices { gap: 4px !important; margin-inline: -10px; }
  .mr-row5 .choice { padding: 4px 3px 18px; }
}`;

// ---------- Player ----------

export function Player({ item, onSubmit, reveal, hintLevel }: PlayerProps<MrPayload, MrResponse>) {
  const p = item.payload;
  const [selected, setSelected] = useState<number | null>(null);
  const R = p.rows;
  const C = p.cols;
  const dispCols = C > 6 ? Math.ceil(C / 2) : C;
  const cellMax = R === 1 ? 84 : R === 2 ? 120 : 104;
  const gapAt = p.gap ?? p.cells.length;
  const all: (MrCell | null)[] = [...p.cells.slice(0, gapAt), null, ...p.cells.slice(gapAt)];
  const lastIsGap = gapAt === p.cells.length;
  const showHint = hintLevel >= 1 && !reveal;
  const chosen = reveal ? reveal.response : selected;
  const gapCell = reveal ? p.options[p.answer] : selected !== null ? p.options[selected] : null;

  const highlight = (i: number): CSSProperties => {
    if (!showHint) return {};
    const r = Math.floor(i / C);
    if (p.series === 'alt') {
      if (i === gapAt) return {};
      return i % 2 === 0 ? { boxShadow: '0 0 0 4px var(--sun)', background: 'var(--warn-bg)' } : { boxShadow: '0 0 0 4px var(--campfire)' };
    }
    if (p.series) {
      // the two boxes just before the gap (or either side of it) show one step of the rule
      const near = lastIsGap ? [gapAt - 2, gapAt - 1] : [gapAt - 1, gapAt + 1];
      return near.includes(i) ? { boxShadow: '0 0 0 4px var(--sun)', background: 'var(--warn-bg)' } : {};
    }
    if (R === 1) return i < (p.unit ?? 0) ? { boxShadow: '0 0 0 4px var(--sun)', background: 'var(--warn-bg)' } : {};
    if (r === 0) return { boxShadow: '0 0 0 4px var(--sun)', background: 'var(--warn-bg)' };
    if (r === R - 1) return { boxShadow: '0 0 0 4px var(--campfire)' };
    return { opacity: 0.6 };
  };

  return (
    <div className="stage">
      <div className="prompt">{mrStem(p)}</div>

      <div
        role="group"
        aria-label="Pattern puzzle"
        style={{
          display: 'grid', gridTemplateColumns: `repeat(${dispCols}, minmax(0, 1fr))`, gap: R === 1 ? 6 : 8,
          width: `min(100%, ${dispCols * (cellMax + 8) + 20}px)`, padding: 10,
          background: 'var(--paper-2)', border: 'var(--border)', borderRadius: 'var(--radius)',
        }}
      >
        {all.map((cell, i) => {
          const isGap = cell === null;
          return (
            <div
              key={i}
              aria-label={isGap ? 'Missing piece' : undefined}
              style={{
                aspectRatio: '1 / 1', minWidth: 0, display: 'grid', placeItems: 'center', padding: 3,
                background: isGap && reveal ? 'var(--good-bg)' : 'var(--card)',
                border: isGap ? `3px dashed ${reveal ? 'var(--good)' : 'var(--campfire)'}` : '3px solid var(--ink)',
                borderRadius: 12, transition: 'box-shadow .2s',
                ...highlight(i),
              }}
            >
              {cell && <CellArt cell={cell} />}
              {isGap && gapCell && <div style={{ width: '100%', height: '100%', opacity: reveal ? 1 : 0.75 }}><CellArt cell={gapCell} /></div>}
              {isGap && !gapCell && (
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'clamp(1.6rem, 6vw, 2.4rem)', color: 'var(--campfire)' }}>?</span>
              )}
            </div>
          );
        })}
      </div>

      {showHint && (
        <div className="hint small" role="note">
          {p.series === 'alt'
            ? '👀 Skip along the row: the yellow boxes follow one rule, the orange boxes follow another.'
            : p.series
              ? '👀 Go along the row: what changes from one yellow box to the next? Do the same step again.'
              : R === 1 ? '👀 The yellow boxes are the part that repeats.' : '👀 Find the rule in the yellow row, then use it on the orange row.'}
        </div>
      )}

      <div style={{ width: '100%', maxWidth: 520 }}>
        <style>{ROW5_CSS}</style>
        <ChoiceGrid
          className="mr-row5"
          options={p.options.map((o, i) => ({
            key: String(i),
            ariaLabel: `Option ${i + 1}: ${describe(o, true)}`,
            content: <div style={{ width: '100%', maxWidth: 72, aspectRatio: '1 / 1' }}><CellArt cell={o} /></div>,
          }))}
          selected={selected !== null ? [String(selected)] : []}
          onSelect={(k) => setSelected(Number(k))}
          reveal={reveal ? { correctKeys: [String(p.answer)], chosenKeys: chosen !== null && chosen !== undefined ? [String(chosen)] : [] } : undefined}
          columns={5}
          numbers
        />
      </div>

      {!reveal && (
        <button type="button" className="btn go" disabled={selected === null} onClick={() => selected !== null && onSubmit(selected)}>
          Done ✓
        </button>
      )}
    </div>
  );
}

// ---------- guide ----------

export const guide: SubtestGuide = {
  kidIntro: "Pattern Finder! Every picture puzzle follows a secret rule. Crack the rule and you'll know which piece is missing.",
  howToPlay: [
    'Look at the boxes. One box has a “?”.',
    'Figure out the rule that the boxes follow.',
    'Tap the piece that fits the rule — it will pop into the gap so you can check it.',
    'Tap Done when you are sure.',
  ],
  strategies: [
    { title: 'Look across the rows', tip: 'Read each full row like a sentence. What happens from the first box to the last? The last row should do the same thing.' },
    { title: 'Look down the columns', tip: 'Sometimes the rule is easier to see going down. Compare the top box of a column with the ones under it.' },
    { title: 'Name what changes', tip: 'Say it out loud: “it gets bigger”, “one more dot”, “it turns”. Check color, shape, size, how many and which way it points — big puzzles change two or three things at once.' },
    { title: 'Predict before peeking', tip: 'Picture the missing piece in your mind BEFORE you look at the answers. Then hunt for the one that matches your picture.' },
    { title: 'Cross out the impossible', tip: 'Wrong answers are right in every way but one. Check each answer against the rule and rule out any that break it — the one left standing wins.' },
    { title: 'Test it in the gap', tip: 'Tap an answer so it pops into the gap, then look at the whole puzzle. Does every row follow the rule now?' },
    { title: 'Count or stack', tip: 'If shapes come and go, count them (does 1 + 2 make 3?) or imagine sliding two boxes on top of each other.' },
  ],
  parentNotes:
    'Matrix Reasoning measures fluid reasoning: noticing patterns, forming a rule from a few examples (induction), and applying it to a new case. ' +
    'It is a core subtest of the Fluid Reasoning Index and the Full Scale IQ, and it is nonverbal, so it is less tied to vocabulary. ' +
    'Items here are generated fresh, so practice builds the strategy (look, name the rule, check every row) rather than memorising answers. ' +
    'Wrong answers are designed to be “near misses” that are right in all but one way, so encourage your child to check every rule rather than picking the answer that “looks most like the others”.',
  commonMistakes: [
    'Choosing an answer that copies a neighbouring box instead of following the rule.',
    'Finding one rule (like color) and forgetting a second rule (like size).',
    'Only looking at the last row instead of learning the rule from the full rows first.',
    'Rushing to the answers before imagining what the missing piece should look like.',
  ],
  everydayActivities: [
    'Make bead or LEGO patterns (red-red-blue, red-red-blue…) and take turns asking “what comes next?”',
    'Play “What’s my rule?”: sort toys into groups and let your child guess the rule (by color, size, or type).',
    'Spot patterns on walks: fences, tiles, leaves, brick walls, clothing stripes.',
    'Draw a 3×3 tic-tac-toe grid and fill it with doodles that follow a rule, leaving one box empty to guess.',
    'Sudoku-style picture puzzles for kids (each row has one of each) build the “one of each” rule.',
  ],
};

export const MatrixReasoning: SubtestModule<MrPayload, MrResponse> = {
  id: 'MR',
  generate,
  score,
  Player,
  guide,
};

export default MatrixReasoning;
