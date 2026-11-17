/**
 * Synthetic "7-year-old" drawings for testing the Coding recogniser: the template strokes,
 * wobbled, tilted, squashed, shifted, with over/undershoot, reversed or reordered strokes and
 * uneven pointer sampling. Seeded, so tests are repeatable. Test helper only.
 */
import { createRng, type Rng } from '../../core/rng';
import { templateStrokes, type CdVersion, type Pt, type Stroke } from './ink';

export interface KidOpts {
  /** Extra turn in degrees (clockwise on screen), e.g. 180 for an upside-down mark. */
  turn?: number;
  /** Mirror left–right. */
  mirror?: boolean;
  /** 0 = clean template, 1 = typical messy young child (default 1). */
  mess?: number;
}

const gauss = (rng: Rng) => (rng.next() + rng.next() + rng.next() - 1.5) / 0.5;

function densify(s: Stroke, step = 1.5): Pt[] {
  if (s.length < 2) return s.map((p) => ({ ...p }));
  const out: Pt[] = [];
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1], b = s[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let k = 0; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  out.push({ ...s[s.length - 1] });
  return out;
}

/** Keep the fraction [from, to] of a densified stroke (to > 1 extends past the end along the last direction). */
function trim(s: Pt[], from: number, to: number): Pt[] {
  const n = s.length;
  if (n < 3) return s;
  const a = Math.max(0, Math.floor(from * (n - 1)));
  const b = Math.min(n - 1, Math.ceil(Math.min(1, to) * (n - 1)));
  const out = s.slice(a, b + 1);
  if (to > 1) {
    const p = s[n - 1], q = s[n - 2];
    const extra = Math.round((to - 1) * n);
    for (let k = 1; k <= extra; k++) out.push({ x: p.x + (p.x - q.x) * k, y: p.y + (p.y - q.y) * k });
  }
  return out;
}

export function kidStrokes(v: CdVersion, sym: number, seed: number, opts: KidOpts = {}): Stroke[] {
  const rng = createRng(seed);
  const mess = opts.mess ?? 1;
  const tilt = ((opts.turn ?? 0) + gauss(rng) * 7 * mess) * (Math.PI / 180);
  const sx = (0.75 + rng.next() * 0.4) * (1 + gauss(rng) * 0.08 * mess);
  const sy = sx * (1 + gauss(rng) * 0.1 * mess);
  const dx = gauss(rng) * 5 * mess, dy = gauss(rng) * 5 * mess;
  const cos = Math.cos(tilt), sin = Math.sin(tilt);
  const place = (p: Pt): Pt => {
    let x = p.x - 50, y = p.y - 50;
    if (opts.mirror) x = -x;
    x *= sx; y *= sy;
    return { x: 50 + dx + x * cos - y * sin, y: 50 + dy + x * sin + y * cos };
  };
  const strokes = templateStrokes(v, sym).map((s) => {
    let pts = densify(s);
    const closed = s.length > 2 && Math.hypot(s[0].x - s[s.length - 1].x, s[0].y - s[s.length - 1].y) < 1;
    if (pts.length > 4) {
      const from = Math.max(0, gauss(rng) * 0.04 * mess);
      const to = closed ? 1 - Math.abs(gauss(rng)) * 0.06 * mess : 1 + gauss(rng) * 0.06 * mess;
      pts = trim(pts, from, to);
    }
    // slow wobble + hand tremor
    const f = 1 + rng.next() * 2, ph = rng.next() * 6.3, amp = 1.6 * mess;
    pts = pts.map((p, i) => {
      const t = pts.length > 1 ? i / (pts.length - 1) : 0;
      return {
        x: p.x + amp * Math.sin(6.283 * f * t + ph) + gauss(rng) * 0.5 * mess,
        y: p.y + amp * Math.cos(6.283 * f * t + ph * 1.3) + gauss(rng) * 0.5 * mess,
      };
    }).map(place);
    if (rng.chance(0.5)) pts.reverse();
    // uneven pointer-event spacing
    const sampled: Pt[] = [];
    for (let i = 0; i < pts.length; i += 1 + Math.floor(rng.next() * 3)) sampled.push(pts[i]);
    if (pts.length > 1 && sampled[sampled.length - 1] !== pts[pts.length - 1]) sampled.push(pts[pts.length - 1]);
    return sampled;
  });
  return rng.shuffle(strokes);
}

/** A dense scrawl: 1–3 strokes of a wandering, back-and-forth path. */
export function scribble(seed: number): Stroke[] {
  const rng = createRng(seed);
  const n = rng.int(1, 3);
  return Array.from({ length: n }, () => {
    let x = 30 + rng.next() * 40, y = 30 + rng.next() * 40, h = rng.next() * 6.3;
    const pts: Pt[] = [{ x, y }];
    const len = rng.int(25, 60);
    for (let i = 0; i < len; i++) {
      h += (rng.next() - 0.5) * 3.2;
      const step = 3 + rng.next() * 6;
      x = Math.max(15, Math.min(85, x + Math.cos(h) * step));
      y = Math.max(15, Math.min(85, y + Math.sin(h) * step));
      pts.push({ x, y });
    }
    return pts;
  });
}
