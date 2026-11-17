/**
 * Abstract symbol set for Symbol Spy. Every glyph is an original line drawing in a 100×100 box.
 * Glyphs come in families of six: a base drawing, its mirror image and its quarter-turn (rotation
 * look-alikes), plus a "set" look-alike — the same drawing with one small part changed — in the same
 * three turns. These mimic the rotation and set distractors of the real task.
 * Bases are chosen without symmetry so that every glyph really is a different picture — the tests
 * check this with `glyphSignature`.
 */

export type Pt = [number, number];
export type Prim =
  | { t: 'path'; pts: Pt[]; closed?: boolean }
  | { t: 'dot'; c: Pt; r: number }
  | { t: 'ring'; c: Pt; r: number };

const BASES: Prim[][] = [
  // 0 flag
  [{ t: 'path', pts: [[40, 84], [40, 16]] }, { t: 'path', pts: [[40, 16], [72, 28], [40, 40]], closed: true }],
  // 1 stairs + dot
  [{ t: 'path', pts: [[18, 74], [40, 74], [40, 52], [62, 52], [62, 30]] }, { t: 'dot', c: [78, 30], r: 6 }],
  // 2 hook
  [{ t: 'path', pts: [[28, 26], [72, 26], [72, 74], [46, 74], [46, 58]] }],
  // 3 harpoon
  [{ t: 'path', pts: [[18, 50], [82, 50], [62, 30]] }],
  // 4 right triangle with a dot
  [{ t: 'path', pts: [[24, 76], [76, 76], [24, 28]], closed: true }, { t: 'dot', c: [38, 63], r: 6 }],
  // 5 bolt
  [{ t: 'path', pts: [[56, 14], [34, 52], [62, 48], [42, 86]] }],
  // 6 box with a tail
  [{ t: 'path', pts: [[26, 30], [58, 30], [58, 62], [26, 62]], closed: true }, { t: 'path', pts: [[58, 62], [82, 62]] }],
  // 7 lollipop
  [{ t: 'ring', c: [36, 36], r: 13 }, { t: 'path', pts: [[45, 45], [74, 74], [74, 56]] }],
  // 8 comb
  [{ t: 'path', pts: [[22, 58], [78, 58], [78, 34]] }, { t: 'path', pts: [[52, 58], [52, 40]] }],
  // 9 eye
  [{ t: 'ring', c: [50, 50], r: 24 }, { t: 'dot', c: [61, 40], r: 6 }],
  // 10 chevron and bar
  [{ t: 'path', pts: [[28, 28], [54, 50], [28, 72]] }, { t: 'path', pts: [[72, 30], [72, 58]] }],
  // 11 broken arch + dot
  [{ t: 'path', pts: [[22, 74], [22, 42], [50, 22], [78, 42]] }, { t: 'dot', c: [62, 64], r: 6 }],
  // 12 cross with low dot
  [{ t: 'path', pts: [[50, 18], [50, 82]] }, { t: 'path', pts: [[28, 40], [72, 40]] }, { t: 'dot', c: [66, 66], r: 6 }],
  // 13 square spiral
  [{ t: 'path', pts: [[50, 50], [66, 50], [66, 30], [30, 30], [30, 72], [78, 72]] }],
];

/**
 * Set look-alikes: each family's base drawing with one small part changed (a dot becomes a ring, an
 * extra stroke, a squared corner…). They are NOT turns or mirrors of the base, so tapping one is a
 * "set" error, while tapping a turned/mirrored version of a target is a "rotation" error.
 */
const ALTS: Prim[][] = [
  // 0 flag with a square flag
  [{ t: 'path', pts: [[40, 84], [40, 16]] }, { t: 'path', pts: [[40, 16], [70, 16], [70, 40], [40, 40]], closed: true }],
  // 1 stairs + ring
  [{ t: 'path', pts: [[18, 74], [40, 74], [40, 52], [62, 52], [62, 30]] }, { t: 'ring', c: [78, 30], r: 7 }],
  // 2 hook with a longer end
  [{ t: 'path', pts: [[28, 26], [72, 26], [72, 74], [46, 74], [46, 58], [32, 58]] }],
  // 3 arrow (two barbs)
  [{ t: 'path', pts: [[18, 50], [82, 50]] }, { t: 'path', pts: [[62, 30], [82, 50], [62, 70]] }],
  // 4 right triangle with the dot outside
  [{ t: 'path', pts: [[24, 76], [76, 76], [24, 28]], closed: true }, { t: 'dot', c: [64, 40], r: 6 }],
  // 5 bolt with an arrowhead
  [{ t: 'path', pts: [[56, 14], [34, 52], [62, 48], [42, 86]] }, { t: 'path', pts: [[30, 76], [42, 86], [50, 72]] }],
  // 6 box with a tail and a dot inside
  [{ t: 'path', pts: [[26, 30], [58, 30], [58, 62], [26, 62]], closed: true }, { t: 'path', pts: [[58, 62], [82, 62]] }, { t: 'dot', c: [42, 46], r: 6 }],
  // 7 filled lollipop
  [{ t: 'dot', c: [36, 36], r: 12 }, { t: 'path', pts: [[45, 45], [74, 74], [74, 56]] }],
  // 8 comb with an extra tooth
  [{ t: 'path', pts: [[22, 58], [78, 58], [78, 34]] }, { t: 'path', pts: [[52, 58], [52, 40]] }, { t: 'path', pts: [[36, 58], [36, 40]] }],
  // 9 eye with a dash
  [{ t: 'ring', c: [50, 50], r: 24 }, { t: 'path', pts: [[56, 36], [66, 46]] }],
  // 10 chevron, bar and dot
  [{ t: 'path', pts: [[28, 28], [54, 50], [28, 72]] }, { t: 'path', pts: [[72, 30], [72, 58]] }, { t: 'dot', c: [72, 74], r: 6 }],
  // 11 closed arch + dot
  [{ t: 'path', pts: [[22, 74], [22, 42], [50, 22], [78, 42], [78, 74]] }, { t: 'dot', c: [62, 64], r: 6 }],
  // 12 cross with a low ring
  [{ t: 'path', pts: [[50, 18], [50, 82]] }, { t: 'path', pts: [[28, 40], [72, 40]] }, { t: 'ring', c: [66, 66], r: 7 }],
  // 13 square spiral with a centre dot
  [{ t: 'path', pts: [[50, 50], [66, 50], [66, 30], [30, 30], [30, 72], [78, 72]] }, { t: 'dot', c: [50, 50], r: 6 }],
];

/** The ways a drawing is turned: as drawn, mirrored left–right, or a quarter turn. */
export type GlyphVariant = 'id' | 'mx' | 'r90';
export const GLYPH_VARIANTS: GlyphVariant[] = ['id', 'mx', 'r90'];
export const FAMILY_COUNT = BASES.length;
const PER_FAMILY = GLYPH_VARIANTS.length * 2;
/** Glyph id = family * 6 + (set look-alike ? 3 : 0) + variant index. */
export const GLYPH_COUNT = BASES.length * PER_FAMILY;

export function glyphFamily(id: number): number {
  return Math.floor(id / PER_FAMILY);
}
export function glyphVariant(id: number): GlyphVariant {
  return GLYPH_VARIANTS[id % GLYPH_VARIANTS.length];
}
/** True for the changed-part ("set") drawings of a family. */
export function isSetAlt(id: number): boolean {
  return id % PER_FAMILY >= GLYPH_VARIANTS.length;
}
/** Plain (unchanged) drawing of a family in a given turn — the glyphs used as targets. */
export function baseGlyph(family: number, variant: number): number {
  return family * PER_FAMILY + variant;
}
/** The turned / mirrored versions of the same drawing (rotation look-alikes). */
export function rotationTwins(id: number): number[] {
  const start = id - (id % GLYPH_VARIANTS.length);
  return GLYPH_VARIANTS.map((_, i) => start + i).filter((g) => g !== id);
}
/** The same turn of the family's other drawing (set look-alike: one part changed). */
export function setTwin(id: number): number {
  return isSetAlt(id) ? id - GLYPH_VARIANTS.length : id + GLYPH_VARIANTS.length;
}
/** Every other member of a glyph's family (all its look-alikes). */
export function lookalikes(id: number): number[] {
  const f = glyphFamily(id) * PER_FAMILY;
  return Array.from({ length: PER_FAMILY }, (_, i) => f + i).filter((g) => g !== id);
}

function tf(v: GlyphVariant, [x, y]: Pt): Pt {
  if (v === 'mx') return [100 - x, y];
  if (v === 'r90') return [100 - y, x]; // quarter turn clockwise about the centre
  return [x, y];
}

export function glyphPrims(id: number): Prim[] {
  const v = glyphVariant(id);
  const drawing = (isSetAlt(id) ? ALTS : BASES)[glyphFamily(id)];
  return drawing.map((p): Prim =>
    p.t === 'path' ? { ...p, pts: p.pts.map((q) => tf(v, q)) } : { ...p, c: tf(v, p.c) });
}

/** Canonical description of what is drawn (set of edges, dots, rings): equal ⇔ the same picture. */
export function glyphSignature(id: number): string {
  const key = ([x, y]: Pt) => `${Math.round(x)},${Math.round(y)}`;
  const parts: string[] = [];
  for (const p of glyphPrims(id)) {
    if (p.t === 'path') {
      const pts = p.closed ? [...p.pts, p.pts[0]] : p.pts;
      for (let i = 1; i < pts.length; i++) parts.push(`e:${[key(pts[i - 1]), key(pts[i])].sort().join('|')}`);
    } else parts.push(`${p.t}:${key(p.c)}:${p.r}`);
  }
  return parts.sort().join(' ');
}

export function SsGlyph({ id, size = '100%', color = '#1d2b2a' }: { id: number; size?: number | string; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ display: 'block' }}>
      {glyphPrims(id).map((p, i) =>
        p.t === 'path' ? (
          <path
            key={i}
            d={`M${p.pts.map((q) => q.join(' ')).join(' L')}${p.closed ? ' Z' : ''}`}
            fill="none"
            stroke={color}
            strokeWidth={7}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : p.t === 'dot' ? (
          <circle key={i} cx={p.c[0]} cy={p.c[1]} r={p.r + 1} fill={color} />
        ) : (
          <circle key={i} cx={p.c[0]} cy={p.c[1]} r={p.r} fill="none" stroke={color} strokeWidth={7} />
        ),
      )}
    </svg>
  );
}
