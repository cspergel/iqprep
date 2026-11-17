/**
 * Coding pictures: shapes, marks, symbols, the key strip and drawn ink. The version B symbols are
 * drawn from the same stroke templates the recogniser uses, so the key always matches what counts.
 */
import type { ReactNode } from 'react';
import { SHAPE_NAMES, ShapeGlyph, type ShapeKind } from '../../ui/shapes';
import { CD_MARKS, strokesToPath, templateStrokes, type CdVersion, type Stroke } from './ink';

export const INK = '#1d2b2a';
export const BAD_INK = '#c8435a';

export const CD_SHAPES: ShapeKind[] = ['star', 'circle', 'triangle', 'square', 'diamond'];
const MARK_NAMES = ['up-and-down line', 'flat line', 'plus', 'dot', 'little circle'];
const SYMBOL_NAMES = ['hat', 'arrow', 'two tall sticks', 'two flat lines', 'ring with a dot', 'T shape', 'triangle', 'X', 'plus'];

export interface CdKeyed {
  version: CdVersion;
  /** key[target] = symbol id. Targets: A = index into CD_SHAPES, B = digit − 1. */
  key: number[];
}

export function targetName(v: CdVersion, t: number): string {
  return v === 'A' ? SHAPE_NAMES[CD_SHAPES[t]] : String(t + 1);
}

export function symbolName(v: CdVersion, s: number): string {
  return v === 'A' ? MARK_NAMES[s] : SYMBOL_NAMES[s];
}

/** Where a mark sits inside each shape (box coordinates) and how big it is. */
export function markCentre(shape: ShapeKind): { cx: number; cy: number; s: number } {
  if (shape === 'triangle') return { cx: 50, cy: 62, s: 0.8 };
  if (shape === 'star') return { cx: 50, cy: 53, s: 0.7 };
  return { cx: 50, cy: 50, s: 1 };
}

export function MarkGlyph({ mark, cx = 50, cy = 50, s = 1, color = INK }: { mark: number; cx?: number; cy?: number; s?: number; color?: string }) {
  const L = 16 * s;
  const common = { stroke: color, strokeWidth: 8, strokeLinecap: 'round' as const, fill: 'none' };
  switch (CD_MARKS[mark]) {
    case 'vline': return <line x1={cx} y1={cy - L} x2={cx} y2={cy + L} {...common} />;
    case 'hline': return <line x1={cx - L} y1={cy} x2={cx + L} y2={cy} {...common} />;
    case 'plus': return <g><line x1={cx} y1={cy - L} x2={cx} y2={cy + L} {...common} /><line x1={cx - L} y1={cy} x2={cx + L} y2={cy} {...common} /></g>;
    case 'dot': return <circle cx={cx} cy={cy} r={8 * s} fill={color} />;
    case 'ring': return <circle cx={cx} cy={cy} r={11 * s} {...common} strokeWidth={6} />;
    default: return null;
  }
}

export function SymbolGlyph({ sym, color = INK }: { sym: number; color?: string }) {
  return <path d={strokesToPath(templateStrokes('B', sym))} stroke={color} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" fill="none" />;
}

export function SymbolSvg({ v, sym, size, color }: { v: CdVersion; sym: number; size: number | string; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ display: 'block' }}>
      {v === 'A' ? <MarkGlyph mark={sym} color={color} /> : <SymbolGlyph sym={sym} color={color} />}
    </svg>
  );
}

/** A shape outline (version A) for a box to draw in, with an optional mark or extra layers inside. */
export function ShapeBox({ shape, mark, color, children }: { shape: ShapeKind; mark?: number; color?: string; children?: ReactNode }) {
  const c = markCentre(shape);
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden style={{ display: 'block', overflow: 'visible' }}>
      <ShapeGlyph spec={{ kind: shape, fill: 'empty', color: 'black' }} strokeWidth={5} />
      {mark !== undefined && mark >= 0 && <MarkGlyph mark={mark} cx={c.cx} cy={c.cy} s={c.s} color={color} />}
      {children}
    </svg>
  );
}

/** A child's ink (strokes or saved path data) in box coordinates. */
export function Ink({ strokes, d, color = INK }: { strokes?: Stroke[]; d?: string; color?: string }) {
  const path = d ?? (strokes ? strokesToPath(strokes) : '');
  if (!path) return null;
  return <path d={path} stroke={color} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" fill="none" />;
}

/** Pip drawing a mark/symbol stroke by stroke (demo). */
export function DemoMark({ v, sym, target }: { v: CdVersion; sym: number; target: number }) {
  const strokes = templateStrokes(v, sym);
  const c = v === 'A' ? markCentre(CD_SHAPES[target]) : { cx: 50, cy: 50, s: 1 };
  return (
    <g transform={`translate(${c.cx} ${c.cy}) scale(${c.s}) translate(-50 -50)`}>
      {strokes.map((s, i) => (
        <path
          key={i}
          d={strokesToPath([s])}
          pathLength={1}
          className="cd-draw"
          style={{ animationDelay: `${i * 0.45}s` }}
          stroke={INK}
          strokeWidth={8}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
    </g>
  );
}

export function KeyStrip({ p, highlight }: { p: CdKeyed; highlight?: number }) {
  const n = p.key.length;
  return (
    <div
      className="row"
      role="img"
      aria-label={`Key: ${p.key.map((s, t) => `${targetName(p.version, t)} gets ${symbolName(p.version, s)}`).join(', ')}`}
      style={{ gap: 4, flexWrap: 'nowrap', justifyContent: 'center', width: '100%', maxWidth: p.version === 'A' ? 360 : 520,
        padding: 6, border: 'var(--border)', borderRadius: 14, background: 'var(--paper-2)' }}
    >
      {Array.from({ length: n }, (_, t) => (
        <div
          key={t}
          style={{ flex: '1 1 0', minWidth: 0, maxWidth: 64, border: '2px solid var(--ink)', borderRadius: 8, overflow: 'hidden',
            background: highlight === t ? 'var(--sun)' : 'var(--card)', transition: 'background .1s' }}
        >
          {p.version === 'A' ? (
            <div style={{ aspectRatio: '1', padding: 2 }}><ShapeBox shape={CD_SHAPES[t]} mark={p.key[t]} /></div>
          ) : (
            <>
              <div style={{ textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, lineHeight: '26px', borderBottom: '2px solid var(--ink)' }}>{t + 1}</div>
              <div style={{ aspectRatio: '1', padding: 2 }}><SymbolSvg v="B" sym={p.key[t]} size="100%" /></div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

export const CD_CSS = `
@keyframes cd-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
.cd-draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: cd-draw .5s ease-out forwards; }
.cd-ink-sheet { width: 100%; max-width: 560px; touch-action: none; user-select: none; -webkit-user-select: none;
  -webkit-touch-callout: none; overscroll-behavior: contain; }
.cd-ink-sheet svg { touch-action: none; }
.cd-modes { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; width: 100%; max-width: 440px; }
.cd-modes .btn { min-height: 60px; }
.cd-modes .btn[aria-pressed="true"] { background: var(--sun); box-shadow: inset 0 0 0 3px var(--ink); }
`;

export function CdStyles() {
  return <style>{CD_CSS}</style>;
}
