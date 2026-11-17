/**
 * Shared SVG shape library for visual reasoning items (matrices, scales, symbol tasks).
 * Every shape is drawn in a 100×100 box centred at (50, 50).
 */
import type { ReactElement } from 'react';

export const SHAPE_KINDS = [
  'circle', 'square', 'triangle', 'diamond', 'star', 'hexagon', 'pentagon',
  'cross', 'heart', 'moon', 'arrow', 'oval', 'trapezoid', 'semicircle',
] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

export const SHAPE_COLORS = {
  red: '#d94a3d',
  blue: '#2f74c0',
  yellow: '#f2c230',
  green: '#3a9a5b',
  purple: '#7d55b8',
  orange: '#ee8a2f',
  black: '#1d2b2a',
} as const;
export type ShapeColor = keyof typeof SHAPE_COLORS;

export type ShapeFill = 'solid' | 'empty' | 'striped' | 'dotted';

export const SHAPE_NAMES: Record<ShapeKind, string> = {
  circle: 'circle', square: 'square', triangle: 'triangle', diamond: 'diamond', star: 'star',
  hexagon: 'hexagon', pentagon: 'pentagon', cross: 'plus sign', heart: 'heart', moon: 'moon',
  arrow: 'arrow', oval: 'oval', trapezoid: 'trapezoid', semicircle: 'half circle',
};

function polygon(n: number, r: number, startDeg = -90): string {
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((startDeg + (360 / n) * i) * Math.PI) / 180;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

function starPoints(r1: number, r2: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? r1 : r2;
    const a = ((-90 + 36 * i) * Math.PI) / 180;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

/** Raw outline element for a shape kind; style is applied by the caller. */
export function shapeOutline(kind: ShapeKind, props: Record<string, string | number>): ReactElement {
  switch (kind) {
    case 'circle': return <circle cx={50} cy={50} r={38} {...props} />;
    case 'square': return <rect x={14} y={14} width={72} height={72} rx={3} {...props} />;
    case 'triangle': return <polygon points="50,10 90,84 10,84" {...props} />;
    case 'diamond': return <polygon points="50,8 88,50 50,92 12,50" {...props} />;
    case 'star': return <polygon points={starPoints(42, 18)} {...props} />;
    case 'hexagon': return <polygon points={polygon(6, 40, 0)} {...props} />;
    case 'pentagon': return <polygon points={polygon(5, 41)} {...props} />;
    case 'cross': return <polygon points="38,12 62,12 62,38 88,38 88,62 62,62 62,88 38,88 38,62 12,62 12,38 38,38" {...props} />;
    case 'heart': return <path d="M50 86 C20 64 8 46 16 30 C24 14 44 14 50 30 C56 14 76 14 84 30 C92 46 80 64 50 86 Z" {...props} />;
    case 'moon': return <path d="M62 12 A38 38 0 1 0 62 88 A30 30 0 1 1 62 12 Z" {...props} />;
    case 'arrow': return <polygon points="12,40 56,40 56,20 90,50 56,80 56,60 12,60" {...props} />;
    case 'oval': return <ellipse cx={50} cy={50} rx={40} ry={26} {...props} />;
    case 'trapezoid': return <polygon points="28,22 72,22 90,80 10,80" {...props} />;
    case 'semicircle': return <path d="M10 66 A40 40 0 0 1 90 66 Z" {...props} />;
  }
}

export interface ShapeSpec {
  kind: ShapeKind;
  color?: ShapeColor;
  fill?: ShapeFill;
  /** Degrees clockwise. */
  rotation?: number;
  /** 0.2–1, relative to the 100×100 box. */
  scale?: number;
  /** Optional offset inside a cell, in box units. */
  dx?: number;
  dy?: number;
}

let patternCounter = 0;

/** Renders one shape as a <g> for use inside an existing <svg viewBox="0 0 100 100">. */
export function ShapeGlyph({ spec, strokeWidth = 4 }: { spec: ShapeSpec; strokeWidth?: number }) {
  const color = SHAPE_COLORS[spec.color ?? 'black'];
  const fillMode = spec.fill ?? 'solid';
  const scale = spec.scale ?? 1;
  const id = `pat-${++patternCounter}`;
  let fill: string = color;
  if (fillMode === 'empty') fill = '#fffdf6';
  if (fillMode === 'striped' || fillMode === 'dotted') fill = `url(#${id})`;
  const transform =
    `translate(${50 + (spec.dx ?? 0)} ${50 + (spec.dy ?? 0)}) rotate(${spec.rotation ?? 0}) scale(${scale}) translate(-50 -50)`;
  return (
    <g transform={transform}>
      {fillMode === 'striped' && (
        <defs>
          <pattern id={id} width={10} height={10} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={10} height={10} fill="#fffdf6" />
            <rect width={5} height={10} fill={color} />
          </pattern>
        </defs>
      )}
      {fillMode === 'dotted' && (
        <defs>
          <pattern id={id} width={12} height={12} patternUnits="userSpaceOnUse">
            <rect width={12} height={12} fill="#fffdf6" />
            <circle cx={6} cy={6} r={3} fill={color} />
          </pattern>
        </defs>
      )}
      {shapeOutline(spec.kind, {
        fill,
        stroke: fillMode === 'solid' ? '#1d2b2a' : color,
        strokeWidth: strokeWidth / scale,
        strokeLinejoin: 'round',
        vectorEffect: 'non-scaling-stroke',
      })}
    </g>
  );
}

/** Standalone shape in its own svg. */
export function Shape({ spec, size = 64, title }: { spec: ShapeSpec; size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title ?? describeShape(spec)}>
      <ShapeGlyph spec={spec} />
    </svg>
  );
}

export function describeShape(spec: ShapeSpec): string {
  const parts = [];
  if (spec.fill && spec.fill !== 'solid') parts.push(spec.fill);
  if (spec.color) parts.push(spec.color);
  parts.push(SHAPE_NAMES[spec.kind]);
  return parts.join(' ');
}
