/**
 * Coding "pencil mode": the marks/symbols as stroke templates, and a small point-cloud recogniser
 * ($P-style: resample → normalise → greedy cloud match; stroke order and direction don't matter).
 *
 * - Version A marks (drawn inside shapes): up-and-down line, flat line, plus, dot, little circle.
 *   The dot is found by size/fill rather than shape (a tap or a tiny filled scribble).
 * - Version B symbols: 9 marks, each drawable in 1–3 strokes. Every symbol is also tried turned
 *   90°/180°/270° and mirrored; a mark that only fits a turned/mirrored copy is a rotation error.
 * - Scribbles (too far from every template, or too dense) and ambiguous marks (two templates almost
 *   equally close) are not recognised and count as errors. Nothing is auto-corrected.
 *
 * Pure and deterministic. One box takes ~0.1 ms (A) to ~0.7 ms (B) on a desktop browser.
 */

export type Pt = { x: number; y: number };
export type Stroke = Pt[];
export type CdVersion = 'A' | 'B';

export const CD_MARKS = ['vline', 'hline', 'plus', 'dot', 'ring'] as const;
export const CD_SYMBOLS = ['caret', 'chevron', 'vbars', 'hbars', 'ringdot', 'tee', 'tri', 'cross', 'plus'] as const;
/** Index of the dot in CD_MARKS (recognised by size, not by the point-cloud matcher). */
export const DOT_MARK = 3;
/** Recorded answer for a drawing that matched nothing well enough (scribble or ambiguous). */
export const UNRECOGNISED = -2;

export function symbolCount(v: CdVersion): number {
  return v === 'A' ? CD_MARKS.length : CD_SYMBOLS.length;
}

/** The symbol that is the same mark turned 90° (a "rotation error" when given instead). */
export function rotationTwin(v: CdVersion, sym: number): number | null {
  const pairs: [number, number][] = v === 'A' ? [[0, 1]] : [[0, 1], [2, 3]];
  for (const [a, b] of pairs) {
    if (sym === a) return b;
    if (sym === b) return a;
  }
  return null;
}

// ---------- templates (0–100 box coordinates, y down) ----------

function circle(cx: number, cy: number, r: number, n = 24): Stroke {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
}
const P = (...xy: number[]): Stroke => {
  const s: Stroke = [];
  for (let i = 0; i < xy.length; i += 2) s.push({ x: xy[i], y: xy[i + 1] });
  return s;
};

/** Version A marks, centred on (50, 50). The dot is a tiny filled circle. */
export const MARK_STROKES: Stroke[][] = [
  [P(50, 30, 50, 70)],
  [P(30, 50, 70, 50)],
  [P(50, 30, 50, 70), P(30, 50, 70, 50)],
  [circle(50, 50, 3, 8)],
  [circle(50, 50, 14)],
];

/** Version B symbols. Mutually distinct, none is a turned/mirrored copy of another except the
 * deliberate twins caret/chevron (^ >) and vbars/hbars (|| =). */
export const SYMBOL_STROKES: Stroke[][] = [
  [P(24, 66, 50, 34, 76, 66)], // caret ^
  [P(36, 24, 66, 50, 36, 76)], // chevron >
  [P(38, 26, 38, 74), P(62, 26, 62, 74)], // two tall sticks
  [P(26, 38, 74, 38), P(26, 62, 74, 62)], // two flat lines
  [circle(50, 50, 22), circle(50, 50, 2.5, 8)], // ring with a dot
  [P(24, 28, 76, 28), P(50, 28, 50, 76)], // T
  [P(50, 24, 78, 74, 22, 74, 50, 24)], // triangle
  [P(28, 28, 72, 72), P(72, 28, 28, 72)], // X
  [P(50, 24, 50, 76), P(24, 50, 76, 50)], // plus
];

export function templateStrokes(v: CdVersion, sym: number): Stroke[] {
  return (v === 'A' ? MARK_STROKES : SYMBOL_STROKES)[sym] ?? [];
}

/** SVG path data for strokes (rounded to whole units — compact enough to keep in a response). */
export function strokesToPath(strokes: Stroke[]): string {
  return strokes
    .filter((s) => s.length > 0)
    .map((s) => {
      const pts = s.length === 1 ? [s[0], { x: s[0].x + 0.1, y: s[0].y }] : s;
      return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${Math.round(p.x * 10) / 10} ${Math.round(p.y * 10) / 10}`).join('');
    })
    .join('');
}

// ---------- geometry ----------

const N = 24;
const MAX_STROKES = 6;

function pathLen(s: Stroke): number {
  let L = 0;
  for (let i = 1; i < s.length; i++) L += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
  return L;
}

function resampleStroke(s: Stroke, k: number): Pt[] {
  const L = pathLen(s);
  if (k <= 1 || L === 0) return Array.from({ length: k }, () => ({ x: s[0].x, y: s[0].y }));
  const step = L / (k - 1);
  const out: Pt[] = [{ x: s[0].x, y: s[0].y }];
  let acc = 0;
  let prev = s[0];
  let i = 1;
  while (i < s.length && out.length < k) {
    const cur = s[i];
    const d = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    if (d > 0 && acc + d >= step) {
      const t = (step - acc) / d;
      const q = { x: prev.x + t * (cur.x - prev.x), y: prev.y + t * (cur.y - prev.y) };
      out.push(q);
      prev = q;
      acc = 0;
    } else {
      acc += d;
      prev = cur;
      i++;
    }
  }
  const last = s[s.length - 1];
  while (out.length < k) out.push({ x: last.x, y: last.y });
  return out;
}

/** Exactly n points shared out over the strokes by length (every stroke keeps at least 2). */
export function resample(strokes: Stroke[], n = N): Pt[] {
  const live = strokes.filter((s) => s.length > 0);
  if (live.length === 0) return [];
  const lens = live.map(pathLen);
  const total = lens.reduce((a, b) => a + b, 0);
  const counts = live.map(() => 2);
  const remaining = n - 2 * live.length;
  if (remaining > 0) {
    const share = lens.map((l) => (total > 0 ? (l / total) * remaining : remaining / live.length));
    const floors = share.map(Math.floor);
    let left = remaining - floors.reduce((a, b) => a + b, 0);
    floors.forEach((f, i) => { counts[i] += f; });
    const order = share.map((s, i) => [s - Math.floor(s), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    for (let j = 0; left > 0; j = (j + 1) % order.length, left--) counts[order[j][1]]++;
  }
  return live.flatMap((s, i) => resampleStroke(s, counts[i])).slice(0, n);
}

/** Centre on the centroid and scale uniformly so the larger side of the bounding box is 1. */
export function normalise(pts: Pt[]): Pt[] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, cx = 0, cy = 0;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    cx += p.x; cy += p.y;
  }
  cx /= pts.length; cy /= pts.length;
  const size = Math.max(maxX - minX, maxY - minY) || 1;
  return pts.map((p) => ({ x: (p.x - cx) / size, y: (p.y - cy) / size }));
}

function cloudDistance(a: Pt[], b: Pt[], start: number, cutoff: number): number {
  const n = a.length;
  const matched = new Uint8Array(n);
  const limit = cutoff * ((n + 1) / 2); // weights 1 − k/n sum to (n + 1) / 2
  let sum = 0;
  let i = start;
  for (let k = 0; k < n; k++) {
    let min = Infinity;
    let idx = 0;
    for (let j = 0; j < n; j++) {
      if (matched[j]) continue;
      const dx = a[i].x - b[j].x, dy = a[i].y - b[j].y;
      const d = dx * dx + dy * dy;
      if (d < min) { min = d; idx = j; }
    }
    matched[idx] = 1;
    sum += (1 - k / n) * Math.sqrt(min);
    if (sum >= limit) return Infinity; // can't beat the cutoff: stop early
    i = (i + 1) % n;
  }
  return sum / ((n + 1) / 2);
}

/**
 * $P greedy cloud match: weighted mean point distance (0 = identical; ~0.3+ = unrelated).
 * Results at or above `cutoff` come back as Infinity (lets the search skip hopeless templates).
 */
export function cloudMatch(a: Pt[], b: Pt[], cutoff = Infinity): number {
  const n = a.length;
  const step = Math.max(1, Math.floor(Math.sqrt(n)));
  let best = cutoff;
  for (let i = 0; i < n; i += step) {
    best = Math.min(best, cloudDistance(a, b, i, best), cloudDistance(b, a, i, best));
  }
  return best < cutoff ? best : Infinity;
}

// ---------- template sets ----------

type Xf = (p: Pt) => Pt;
const TRANSFORMS: { name: string; f: Xf }[] = [
  { name: 'turn90', f: (p) => ({ x: -p.y, y: p.x }) },
  { name: 'turn180', f: (p) => ({ x: -p.x, y: -p.y }) },
  { name: 'turn270', f: (p) => ({ x: p.y, y: -p.x }) },
  { name: 'mirror', f: (p) => ({ x: -p.x, y: p.y }) },
  { name: 'flip', f: (p) => ({ x: p.x, y: -p.y }) },
  { name: 'mirror-diag', f: (p) => ({ x: p.y, y: p.x }) },
  { name: 'mirror-anti', f: (p) => ({ x: -p.y, y: -p.x }) },
];

export interface Template {
  sym: number;
  /** '' for the upright symbol, otherwise the turn/mirror that made this copy. */
  variant: string;
  /** Squashed copy (0 = as designed, 1 = narrower, 2 = flatter): children rarely keep proportions. */
  squash: number;
  cloud: Pt[];
}

/** Variants closer than this to a kept template are the same picture and are dropped. */
const SAME_PICTURE = 0.07;
const SQUASH = 0.78;
const cache: Partial<Record<CdVersion, Template[]>> = {};

export function templates(v: CdVersion): Template[] {
  const hit = cache[v];
  if (hit) return hit;
  const n = symbolCount(v);
  const upright: Template[] = [];
  for (let s = 0; s < n; s++) {
    if (v === 'A' && s === DOT_MARK) continue;
    upright.push({ sym: s, variant: '', squash: 0, cloud: normalise(resample(templateStrokes(v, s))) });
  }
  const out = [...upright];
  for (const u of upright) {
    const mine: Template[] = [];
    for (const t of TRANSFORMS) {
      const cloud = u.cloud.map(t.f);
      const dup = upright.some((o) => cloudMatch(cloud, o.cloud) < SAME_PICTURE)
        || mine.some((o) => cloudMatch(cloud, o.cloud) < SAME_PICTURE);
      if (!dup) mine.push({ sym: u.sym, variant: t.name, squash: 0, cloud });
    }
    out.push(...mine);
  }
  const squashed = out.flatMap((t) => [
    { ...t, squash: 1, cloud: normalise(t.cloud.map((p) => ({ x: p.x * SQUASH, y: p.y }))) },
    { ...t, squash: 2, cloud: normalise(t.cloud.map((p) => ({ x: p.x, y: p.y * SQUASH }))) },
  ]);
  out.push(...squashed);
  cache[v] = out;
  return out;
}

// ---------- recognition ----------

export type RecognitionKind = 'empty' | 'dot' | 'match' | 'rotated' | 'ambiguous' | 'scribble';
export interface Recognition {
  kind: RecognitionKind;
  /** The upright symbol recognised (kind 'match' or 'dot'), else null. */
  symbol: number | null;
  /** kind 'rotated': symbols whose turned/mirrored copy fits best (ties when copies look the same). */
  rotatedOf: number[];
  /** Best template distance (lower = closer). */
  distance: number;
}

/** Farther than this from every template ⇒ scribble. */
export const REJECT_DISTANCE = 0.11;
/** Best ÷ runner-up above this ⇒ too close to call. */
export const AMBIGUOUS_RATIO = 0.8;
/** Ink length ÷ size above this ⇒ dense scribbling, not a symbol. */
const MAX_DENSITY = 9;
/** Smaller than this (box units, box = 100) ⇒ a tap/dot. */
const TINY = 10;

export function recognise(v: CdVersion, strokes: Stroke[]): Recognition {
  const live = strokes.filter((s) => s.length > 0);
  const none = (kind: RecognitionKind, distance = Infinity): Recognition => ({ kind, symbol: null, rotatedOf: [], distance });
  if (live.length === 0) return none('empty');
  if (live.length > MAX_STROKES) return none('scribble');

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of live) for (const p of s) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const size = Math.max(maxX - minX, maxY - minY);
  const ink = live.reduce((a, s) => a + pathLen(s), 0);
  const pts = resample(live);

  if (v === 'A') {
    // A dot: a tap / tiny mark, or a small blob scribbled in so that ink covers its middle.
    if (size < TINY) return { kind: 'dot', symbol: DOT_MARK, rotatedOf: [], distance: 0 };
    if (size <= 34 && ink / size >= 4) {
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      const middle = pts.filter((p) => Math.hypot(p.x - cx, p.y - cy) < size * 0.22).length / pts.length;
      if (middle >= 0.15) return { kind: 'dot', symbol: DOT_MARK, rotatedOf: [], distance: 0 };
    }
  } else if (size < TINY) return none('scribble');
  if (ink / Math.max(size, 1) > MAX_DENSITY) return none('scribble');

  const cloud = normalise(pts);
  // Distances past CAP can't change the outcome (see the ratio tests below), so stop early there.
  const CAP = REJECT_DISTANCE / AMBIGUOUS_RATIO;
  const bestUp = new Map<number, number>();
  const bestRot = new Map<number, number>();
  for (const t of templates(v)) {
    const m = t.variant ? bestRot : bestUp;
    const d = cloudMatch(cloud, t.cloud, Math.min(CAP, m.get(t.sym) ?? Infinity));
    if (d < (m.get(t.sym) ?? Infinity)) m.set(t.sym, d);
  }
  const byDist = (x: [number, number], y: [number, number]) => x[1] - y[1] || x[0] - y[0];
  const ups = [...bestUp.entries()].sort(byDist);
  const rots = [...bestRot.entries()].sort(byDist);
  const [u, du] = ups[0] ?? [-1, Infinity];
  const du2 = ups[1]?.[1] ?? Infinity;
  const [r, dr] = rots[0] ?? [-1, Infinity];
  const best = Math.min(du, dr);
  if (!(best <= REJECT_DISTANCE)) return none('scribble', best);
  // Turned copies of *other* symbols compete with the upright winner; its own turned copies only
  // win when clearly closer (a slightly tilted triangle is still a triangle).
  const drOther = rots.find(([s]) => s !== u)?.[1] ?? Infinity;
  if (du <= dr || (r === u && dr / du > AMBIGUOUS_RATIO)) {
    if (du / du2 > AMBIGUOUS_RATIO || du / drOther > AMBIGUOUS_RATIO) return none('ambiguous', du);
    return { kind: 'match', symbol: u, rotatedOf: [], distance: du };
  }
  if (dr / du > AMBIGUOUS_RATIO) return none('ambiguous', dr);
  // Turned copies of two symbols can be the same picture (e.g. "<" is ^ turned or > mirrored).
  const rotatedOf = rots.filter(([, d]) => d <= dr * 1.15).map(([s]) => s).sort((x, y) => x - y);
  return { kind: 'rotated', symbol: null, rotatedOf, distance: dr };
}

export interface BoxClass {
  /** Symbol recognised, or UNRECOGNISED. */
  answer: number;
  /** The wrong mark is the wanted one turned or mirrored. */
  rotation: boolean;
}

/** Classify one box's ink against the symbol it should hold. */
export function classifyBox(v: CdVersion, strokes: Stroke[], want: number): BoxClass {
  const r = recognise(v, strokes);
  const answer = r.symbol ?? UNRECOGNISED;
  const rotation = answer !== want && (r.rotatedOf.includes(want) || (answer >= 0 && rotationTwin(v, want) === answer));
  return { answer, rotation };
}
