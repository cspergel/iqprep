/**
 * Matrix Reasoning data model + an independent rule checker ("solver").
 *
 * The solver looks only at the visible grid (it does not know which template built the item) and asks:
 * if this option went in the gap, could every attribute be explained by one of the simple rule families
 * a child might use? (all the same, same along each row/column, steady change, one-of-each, box1 ± box2,
 * repeating pattern, stacking overlays; for single-row series also up-and-down hills and two interleaved
 * "every other box" threads.) The generator rejects any item where a distractor also passes, so every
 * item has exactly one defensible answer. Series items may have the gap in the middle of the row.
 */
import type { ShapeColor, ShapeFill, ShapeKind } from '../../ui/shapes';

export interface FigCell {
  kind: 'fig';
  shape: ShapeKind;
  color: ShapeColor;
  fill: ShapeFill;
  /** 0 small, 1 medium, 2 big */
  size: number;
  /** how many copies of the shape */
  count: number;
  /** degrees clockwise (normalised for symmetric shapes) */
  rot: number;
  /** -1 = centred; 0..3 = corner (top-left, top-right, bottom-right, bottom-left) */
  pos: number;
}

/** Overlay items: short "sticks" pointing out from the centre in up to 8 directions (0 = up, clockwise). */
export interface SpokeCell {
  kind: 'spokes';
  color: ShapeColor;
  spokes: number[];
}

export type MrCell = FigCell | SpokeCell;
export type AttrValue = string | number;

export const FIG_ATTRS = ['shape', 'color', 'fill', 'size', 'count', 'rot', 'pos'] as const;
export type FigAttr = (typeof FIG_ATTRS)[number];

/** Rotational symmetry (degrees) of the shapes; rotating by this looks identical. */
const SYMMETRY: Partial<Record<ShapeKind, number>> = {
  square: 90, cross: 90, diamond: 180, oval: 180, hexagon: 60, pentagon: 72, star: 72, triangle: 120,
};

export function normRot(shape: ShapeKind, rot: number): number {
  let r = ((rot % 360) + 360) % 360;
  if (shape === 'circle') return 0;
  const s = SYMMETRY[shape];
  if (s) r %= s;
  return r;
}

/** Fill as an ordinal so "empty → striped → solid" reads as a steady change. */
export const FILL_IDX: Record<ShapeFill, number> = { empty: 0, striped: 1, solid: 2, dotted: 3 };

export function spokeMask(c: SpokeCell): number {
  return c.spokes.reduce((m, i) => m | (1 << i), 0);
}

/** Visible attributes of a cell (what a child can actually see). */
export function cellAttrs(c: MrCell): Record<string, AttrValue> {
  if (c.kind === 'spokes') {
    const o: Record<string, AttrValue> = { color: c.color };
    for (let i = 0; i < 8; i++) o[`s${i}`] = c.spokes.includes(i) ? 1 : 0;
    return o;
  }
  return { shape: c.shape, color: c.color, fill: c.fill, size: c.size, count: c.count, rot: normRot(c.shape, c.rot), pos: c.pos };
}

export function cellKey(c: MrCell): string {
  const a = cellAttrs(c);
  return `${c.kind}:` + Object.keys(a).sort().map((k) => `${k}=${a[k]}`).join('|');
}

// ---------- solver ----------

const MOD: Record<string, number> = { rot: 360, pos: 4 };
const NUMERIC = new Set(['size', 'count', 'rot', 'pos', 'fill']);
const ADDABLE = new Set(['size', 'count']);

function toNum(attr: string, v: AttrValue): number {
  if (attr === 'fill') return FILL_IDX[v as ShapeFill];
  return v as number;
}

function stepOf(attr: string, a: number, b: number): number {
  const m = MOD[attr];
  return m ? (((b - a) % m) + m) % m : b - a;
}

const allEqual = (vs: AttrValue[]) => vs.every((v) => v === vs[0]);
const column = <T,>(g: T[][], c: number) => g.map((r) => r[c]);

function sameSetOfDistinct(lines: AttrValue[][]): boolean {
  const keys = lines.map((l) => {
    if (new Set(l).size !== l.length) return null;
    return l.map(String).sort().join(',');
  });
  return keys.every((k) => k !== null && k === keys[0]);
}

/** Steady change: every step is the same non-zero amount (wrapping round for turns and corners). */
function isProgression(attr: string, ns: number[]): boolean {
  if (ns.length < 2) return false;
  const s = stepOf(attr, ns[0], ns[1]);
  return s !== 0 && ns.every((x, i) => i === 0 || stepOf(attr, ns[i - 1], x) === s);
}

/** Attributes that can sensibly "go up and down like a hill". */
const BOUNCY = new Set(['size', 'count']);

/**
 * Up-and-down ("hill") sequence: every step has the same size, the direction only flips at the lowest
 * or highest value, and it flips at least twice so the rule has really been shown (1, 2, 3, 4, 3 is
 * not accepted as a hill — it could just as well be a mistake in a counting row).
 */
function bounces(ns: number[]): boolean {
  if (ns.length < 5) return false;
  const lo = Math.min(...ns);
  const hi = Math.max(...ns);
  const s = Math.abs(ns[1] - ns[0]);
  if (s === 0 || hi === lo) return false;
  let flips = 0;
  for (let i = 1; i < ns.length; i++) {
    const d = ns[i] - ns[i - 1];
    if (Math.abs(d) !== s) return false;
    if (i >= 2 && Math.sign(d) !== Math.sign(ns[i - 1] - ns[i - 2])) {
      if (ns[i - 1] !== lo && ns[i - 1] !== hi) return false;
      flips++;
    }
  }
  return flips >= 2;
}

/** A single "thread" of a series: all the same, or (for numbers/turns/corners) a steady change. */
function simpleThread(attr: string, vs: AttrValue[]): boolean {
  if (allEqual(vs)) return true;
  return NUMERIC.has(attr) && isProgression(attr, vs.map((v) => toNum(attr, v)));
}

/**
 * Rules a child can use on a single row (a series):
 *  - repeating unit (shown at least twice),
 *  - steady change (+1, +2, quarter turn, next corner…),
 *  - up-and-down hill (sizes / counts),
 *  - two interleaved threads: boxes 1, 3, 5 follow one simple rule and boxes 2, 4, 6 another
 *    (only with 6+ boxes, so each thread shows its rule with at least two visible boxes).
 */
export function explainsSeries(attr: string, row: AttrValue[]): boolean {
  const C = row.length;
  if (allEqual(row)) return true;
  for (let p = 1; 2 * p <= C; p++) if (row.every((v, i) => i < p || v === row[i - p])) return true;
  if (NUMERIC.has(attr)) {
    const ns = row.map((v) => toNum(attr, v));
    if (isProgression(attr, ns)) return true;
    if (BOUNCY.has(attr) && bounces(ns)) return true;
  }
  if (C >= 6) {
    const even = row.filter((_, i) => i % 2 === 0);
    const odd = row.filter((_, i) => i % 2 === 1);
    if (simpleThread(attr, even) && simpleThread(attr, odd)) return true;
  }
  return false;
}

/** Is this attribute grid explained by any simple rule? */
export function explains(attr: string, g: AttrValue[][]): boolean {
  const R = g.length;
  const C = g[0].length;
  const flat = g.flat();
  if (allEqual(flat)) return true;
  const numeric = NUMERIC.has(attr);

  if (R === 1) return explainsSeries(attr, g[0]);

  if (g.every((row) => allEqual(row))) return true;
  if (Array.from({ length: C }, (_, c) => column(g, c)).every((col) => allEqual(col))) return true;

  if (numeric) {
    const ng = g.map((r) => r.map((v) => toNum(attr, v)));
    const s = stepOf(attr, ng[0][0], ng[0][1]);
    if (ng.every((r) => r.every((x, i) => i === 0 || stepOf(attr, r[i - 1], x) === s))) return true;
    if (C === 3 && ADDABLE.has(attr)) {
      if (ng.every((r) => r[2] === r[0] + r[1])) return true;
      if (ng.every((r) => r[2] === r[0] - r[1])) return true;
    }
  }

  if (R === 3 && C === 3) {
    if (sameSetOfDistinct(g)) return true;
    if (sameSetOfDistinct([0, 1, 2].map((c) => column(g, c)))) return true;
  }
  return false;
}

function explainsMasks(g: number[][]): boolean {
  const R = g.length;
  const C = g[0].length;
  if (allEqual(g.flat())) return true;
  if (g.every((row) => allEqual(row))) return true;
  if (Array.from({ length: C }, (_, c) => column(g, c)).every((col) => allEqual(col))) return true;
  if (R === 3 && C === 3) {
    const ops: ((a: number, b: number) => number)[] = [
      (a, b) => a | b,
      (a, b) => a ^ b,
      (a, b) => a & ~b,
      (a, b) => a & b,
    ];
    if (ops.some((op) => g.every((r) => r[2] === op(r[0], r[1])))) return true;
  }
  return false;
}

/** `cells` is the complete grid (rows × cols, row-major) including a candidate for the gap. */
export function isConsistent(rows: number, cols: number, cells: MrCell[]): boolean {
  if (cells.length !== rows * cols) return false;
  const kind = cells[0].kind;
  if (cells.some((c) => c.kind !== kind)) return false;
  const grid = <T,>(f: (c: MrCell) => T): T[][] =>
    Array.from({ length: rows }, (_, r) => cells.slice(r * cols, r * cols + cols).map(f));
  if (kind === 'spokes') {
    return explainsMasks(grid((c) => spokeMask(c as SpokeCell))) && explains('color', grid((c) => c.color));
  }
  return FIG_ATTRS.every((a) => explains(a, grid((c) => cellAttrs(c)[a])));
}

/** Put a candidate into the gap. `gap` is its index in the full grid/row (default: the last box). */
export function fillGap(cells: MrCell[], cand: MrCell, gap: number = cells.length): MrCell[] {
  return [...cells.slice(0, gap), cand, ...cells.slice(gap)];
}

/** Indices of options that would make the grid fully rule-consistent. */
export function consistentOptions(p: { rows: number; cols: number; cells: MrCell[]; options: MrCell[]; gap?: number }): number[] {
  const out: number[] = [];
  p.options.forEach((o, i) => {
    if (isConsistent(p.rows, p.cols, fillGap(p.cells, o, p.gap))) out.push(i);
  });
  return out;
}

/**
 * The "test-wise" shortcut: pick the option whose attribute values are most common among the options.
 * Returns each option's popularity score (sum over attributes of how many options share its value).
 */
export function majorityScores(options: MrCell[]): number[] {
  const attrs = options.map(cellAttrs);
  const counts: Record<string, Map<AttrValue, number>> = {};
  for (const a of attrs) {
    for (const [k, v] of Object.entries(a)) {
      counts[k] ??= new Map();
      counts[k].set(v, (counts[k].get(v) ?? 0) + 1);
    }
  }
  return attrs.map((a) => Object.entries(a).reduce((s, [k, v]) => s + (counts[k].get(v) ?? 0), 0));
}
