/**
 * Original line-drawn symbols for Symbol Translation, one per dictionary word.
 * Every glyph lives in a 100×100 box and is drawn with thick ink strokes so they read at small sizes.
 */
import type { ReactElement } from 'react';
import { WORDS } from './dictionary';

const ARROW_TIP = (x: number, y: number, dx: number, dy: number) => {
  // Two short barbs pointing back from (x, y) along direction (dx, dy).
  const len = 14;
  const n = Math.hypot(dx, dy) || 1;
  const ux = dx / n;
  const uy = dy / n;
  const bx = x - ux * len;
  const by = y - uy * len;
  const px = -uy * len * 0.75;
  const py = ux * len * 0.75;
  return `M${bx + px} ${by + py} L${x} ${y} L${bx - px} ${by - py}`;
};

const GLYPHS: Record<string, ReactElement> = {
  water: <path d="M12 30 q9.5 -11 19 0 t19 0 t19 0 t19 0 M12 50 q9.5 -11 19 0 t19 0 t19 0 t19 0 M12 70 q9.5 -11 19 0 t19 0 t19 0 t19 0" />,
  home: <path d="M16 50 L50 18 L84 50 M26 42 V84 H74 V42 M43 84 V64 H57 V84" />,
  sun: (
    <>
      <circle cx={50} cy={50} r={16} />
      <path d={Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        return `M${(50 + 26 * Math.cos(a)).toFixed(1)} ${(50 + 26 * Math.sin(a)).toFixed(1)} L${(50 + 39 * Math.cos(a)).toFixed(1)} ${(50 + 39 * Math.sin(a)).toFixed(1)}`;
      }).join(' ')} />
    </>
  ),
  moon: <path d="M62 16 A36 36 0 1 0 62 84 A40 40 0 0 1 62 16 Z" />,
  tree: <path d="M50 12 L80 62 H20 Z M50 62 V90" />,
  fish: <path d="M14 50 Q42 20 70 50 Q42 80 14 50 Z M70 50 L88 34 V66 Z" />,
  bird: <path d="M10 48 Q30 26 50 52 Q70 26 90 48" />,
  cat: <path d="M28 84 V42 L33 16 L47 34 H53 L67 16 L72 42 V84 Z" />,
  ball: (
    <>
      <circle cx={50} cy={50} r={36} />
      <path d="M50 14 Q28 50 50 86 M50 14 Q72 50 50 86" />
    </>
  ),
  hill: <path d="M6 82 Q32 22 58 82 M42 82 Q68 40 94 82" />,
  runs: <path d={`M30 50 H84 ${ARROW_TIP(86, 50, 1, 0)} M10 36 H24 M6 50 H20 M10 64 H24`} />,
  jumps: <path d={`M14 84 Q46 -6 82 80 ${ARROW_TIP(84, 84, 0.3, 1)}`} />,
  sleeps: (
    <>
      <path d="M14 26 V84 M14 64 H88 V84" />
      <rect x={22} y={46} width={22} height={14} rx={6} />
    </>
  ),
  sees: (
    <>
      <path d="M10 50 Q50 12 90 50 Q50 88 10 50 Z" />
      <circle cx={50} cy={50} r={10} fill="var(--ink)" />
    </>
  ),
  eats: <path d="M36 12 V34 Q36 46 50 46 Q64 46 64 34 V12 M50 12 V44 M50 46 V90" />,
  likes: <path d="M50 84 C20 62 10 44 20 30 C30 16 46 20 50 34 C54 20 70 16 80 30 C90 44 80 62 50 84 Z" />,
  big: <path d={`M50 12 V88 ${ARROW_TIP(50, 10, 0, -1)} ${ARROW_TIP(50, 90, 0, 1)}`} />,
  little: <path d={`M8 50 H38 ${ARROW_TIP(42, 50, 1, 0)} M92 50 H62 ${ARROW_TIP(58, 50, -1, 0)}`} />,
  happy: <path d="M16 38 Q50 90 84 38" />,
  fast: <path d="M60 8 L26 54 H50 L38 92 L76 40 H52 Z" />,
  the: <circle cx={50} cy={50} r={13} fill="var(--ink)" />,
  and: <path d="M50 16 V84 M16 50 H84" />,
  is: <path d="M16 36 H84 M16 64 H84" />,
  on: (
    <>
      <path d="M10 78 H90" />
      <rect x={36} y={44} width={28} height={26} rx={3} />
    </>
  ),
};

export const GLYPH_WORDS = Object.keys(GLYPHS);

export function SymbolGlyph({ word, size = 72, title }: { word: string; size?: number; title?: string }) {
  const g = GLYPHS[word];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={title ?? `symbol: ${WORDS[word]?.looks ?? 'unknown'}`}
      fill="none"
      stroke="var(--ink)"
      strokeWidth={7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {g ?? <text x={50} y={62} textAnchor="middle" fontSize={40} fill="var(--ink)" stroke="none">?</text>}
    </svg>
  );
}
