/**
 * Report charts — hand-rolled SVG, following the dataviz method:
 * thin marks, recessive grid, text in ink (never series colour), native hover titles, and a
 * table view alongside (the categorical series hues have <3:1 contrast, so labels/tables are required).
 */
import { useState, type ReactNode } from 'react';

/** Validated categorical order (passes CVD + normal-vision checks on the card surface). */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];
const GRID = 'rgba(29,43,42,.12)';
const BAND = 'rgba(29,43,42,.05)';

export interface DotRow {
  id: string;
  label: string;
  sublabel?: string;
  value: number;
  lo?: number;
  hi?: number;
  emphasis?: boolean;
  tag?: string;
}

/**
 * Horizontal dot plot with confidence bars on a fixed scale (composites 40–160 or scaled 1–19).
 * Classification bands are drawn as neutral alternating washes with labels on top.
 */
export function DotPlot({ rows, min, max, ticks, bands, mean, meanLabel }: {
  rows: DotRow[];
  min: number;
  max: number;
  ticks: number[];
  bands?: { from: number; to: number; label: string }[];
  mean?: number;
  meanLabel?: string;
}) {
  const labelW = 150;
  const valueW = 64;
  const rowH = 38;
  const top = bands ? 30 : 12;
  const W = 760;
  const plotW = W - labelW - valueW;
  const H = top + rows.length * rowH + 26;
  const x = (v: number) => labelW + ((Math.max(min, Math.min(max, v)) - min) / (max - min)) * plotW;
  const [hover, setHover] = useState<string | null>(null);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Score chart" style={{ display: 'block', maxWidth: '100%' }}>
      {bands?.map((b, i) => (
        <g key={b.label}>
          <rect x={x(b.from)} y={top - 4} width={x(b.to) - x(b.from)} height={rows.length * rowH + 4} fill={i % 2 ? 'transparent' : BAND} />
          <text x={(x(b.from) + x(b.to)) / 2} y={top - 10} textAnchor="middle" fontSize={11} fill="var(--ink-soft)">{b.label}</text>
        </g>
      ))}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={top - 4} y2={top + rows.length * rowH} stroke={GRID} strokeWidth={1} />
          <text x={x(t)} y={H - 8} textAnchor="middle" fontSize={12} fill="var(--ink-soft)">{t}</text>
        </g>
      ))}
      {mean !== undefined && (
        <g>
          <line x1={x(mean)} x2={x(mean)} y1={top - 4} y2={top + rows.length * rowH} stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="0" opacity={0.55} />
          {meanLabel && <text x={x(mean) + 4} y={top + rows.length * rowH - 4} fontSize={11} fill="var(--ink-soft)">{meanLabel}</text>}
        </g>
      )}
      {rows.map((r, i) => {
        const cy = top + i * rowH + rowH / 2;
        const on = hover === r.id;
        return (
          <g key={r.id} onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover(null)} style={{ cursor: 'default' }}>
            <title>{`${r.label}: ${r.value}${r.lo !== undefined ? ` (range ${r.lo}–${r.hi})` : ''}${r.tag ? ` · ${r.tag}` : ''}`}</title>
            <rect x={0} y={cy - rowH / 2} width={W} height={rowH} fill={on ? 'rgba(244,197,66,.18)' : 'transparent'} />
            <text x={0} y={cy - 2} fontSize={14} fontWeight={r.emphasis ? 800 : 600} fill="var(--ink)">{r.label}</text>
            {r.sublabel && <text x={0} y={cy + 13} fontSize={11} fill="var(--ink-soft)">{r.sublabel}</text>}
            {r.lo !== undefined && r.hi !== undefined && (
              <line x1={x(r.lo)} x2={x(r.hi)} y1={cy} y2={cy} stroke="var(--ink-soft)" strokeWidth={3} strokeLinecap="round" opacity={0.45} />
            )}
            <circle cx={x(r.value)} cy={cy} r={r.emphasis ? 8 : 6.5} fill={r.emphasis ? 'var(--campfire)' : SERIES[0]} stroke="var(--card)" strokeWidth={2} />
            <text x={W - valueW + 10} y={cy + 5} fontSize={15} fontWeight={800} fill="var(--ink)">{r.value}</text>
            {r.tag && <text x={W - 6} y={cy + 5} fontSize={11} textAnchor="end" fill="var(--ink-soft)">{r.tag}</text>}
          </g>
        );
      })}
    </svg>
  );
}

export interface LineSeries {
  id: string;
  label: string;
  points: { x: number; y: number; label: string }[];
}

/** Multi-series line chart (score history). One axis; legend + end labels; hover crosshair. */
export function LineChart({ series, min, max, ticks, emphasize }: {
  series: LineSeries[];
  min: number;
  max: number;
  ticks: number[];
  emphasize?: string;
}) {
  const W = 760;
  const H = 280;
  const pad = { l: 40, r: 70, t: 14, b: 30 };
  const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort((a, b) => a - b);
  const [hoverX, setHoverX] = useState<number | null>(null);
  if (xs.length === 0) return null;
  const xPos = (v: number) => pad.l + (xs.length === 1 ? 0.5 : xs.indexOf(v) / (xs.length - 1)) * (W - pad.l - pad.r);
  const yPos = (v: number) => pad.t + (1 - (Math.max(min, Math.min(max, v)) - min) / (max - min)) * (H - pad.t - pad.b);
  const colorOf = (i: number, id: string) => (id === emphasize ? 'var(--ink)' : SERIES[i % SERIES.length]);

  return (
    <div>
      <div className="row small" style={{ gap: 14, marginBottom: 6 }}>
        {series.map((s, i) => (
          <span key={s.id} className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <span style={{ width: 18, height: 4, borderRadius: 2, background: colorOf(i, s.id), display: 'inline-block' }} />
            {s.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Score history chart" style={{ display: 'block' }}
        onMouseLeave={() => setHoverX(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={yPos(t)} y2={yPos(t)} stroke={GRID} strokeWidth={1} />
            <text x={pad.l - 6} y={yPos(t) + 4} textAnchor="end" fontSize={11} fill="var(--ink-soft)">{t}</text>
          </g>
        ))}
        {xs.map((v, i) => (
          <g key={v}>
            <rect x={xPos(v) - 20} y={pad.t} width={40} height={H - pad.t - pad.b} fill="transparent" onMouseEnter={() => setHoverX(v)} />
            {(xs.length <= 8 || i % Math.ceil(xs.length / 8) === 0) && (
              <text x={xPos(v)} y={H - 10} textAnchor="middle" fontSize={11} fill="var(--ink-soft)">{new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</text>
            )}
          </g>
        ))}
        {hoverX !== null && <line x1={xPos(hoverX)} x2={xPos(hoverX)} y1={pad.t} y2={H - pad.b} stroke="var(--ink-soft)" strokeWidth={1} />}
        {series.map((s, i) => {
          const pts = s.points.slice().sort((a, b) => a.x - b.x);
          const d = pts.map((p, k) => `${k ? 'L' : 'M'}${xPos(p.x)},${yPos(p.y)}`).join(' ');
          const last = pts[pts.length - 1];
          return (
            <g key={s.id}>
              <path d={d} fill="none" stroke={colorOf(i, s.id)} strokeWidth={s.id === emphasize ? 3 : 2} strokeLinejoin="round" strokeLinecap="round" />
              {pts.map((p) => (
                <circle key={p.x} cx={xPos(p.x)} cy={yPos(p.y)} r={hoverX === p.x ? 5.5 : 4} fill={colorOf(i, s.id)} stroke="var(--card)" strokeWidth={2}>
                  <title>{`${s.label}: ${p.y} (${p.label})`}</title>
                </circle>
              ))}
              {last && <text x={xPos(last.x) + 8} y={yPos(last.y) + 4} fontSize={12} fontWeight={700} fill="var(--ink)">{s.label} {last.y}</text>}
            </g>
          );
        })}
        {hoverX !== null && (() => {
          const vals = series.map((s) => ({ s, p: s.points.find((p) => p.x === hoverX) })).filter((v) => v.p);
          const bx = Math.min(xPos(hoverX) + 10, W - 170);
          return (
            <g pointerEvents="none">
              <rect x={bx} y={pad.t + 4} width={160} height={18 + vals.length * 17} rx={8} fill="var(--card)" stroke="var(--ink)" strokeWidth={1.5} />
              <text x={bx + 10} y={pad.t + 19} fontSize={11} fill="var(--ink-soft)">{new Date(hoverX).toLocaleDateString()}</text>
              {vals.map((v, k) => (
                <text key={v.s.id} x={bx + 10} y={pad.t + 36 + k * 17} fontSize={12} fill="var(--ink)">{v.s.label}: <tspan fontWeight={800}>{v.p!.y}</tspan></text>
              ))}
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

/** Horizontal accuracy bars (single hue, magnitude). */
export function BarList({ rows, max = 1, format }: { rows: { id: string; label: string; value: number; note?: string }[]; max?: number; format: (v: number) => string }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      {rows.map((r) => (
        <div key={r.id} title={`${r.label}: ${format(r.value)}${r.note ? ` (${r.note})` : ''}`}>
          <div className="row small" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
            <span>{r.label}</span>
            <strong>{format(r.value)}{r.note && <span className="muted" style={{ fontWeight: 400 }}> · {r.note}</span>}</strong>
          </div>
          <div style={{ height: 12, background: 'rgba(29,43,42,.07)', borderRadius: 4, marginTop: 3 }}>
            <div style={{ width: `${Math.max(2, (100 * r.value) / max)}%`, height: '100%', background: SERIES[0], borderRadius: '0 4px 4px 0' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Wrap a chart with a "show table" toggle (accessibility + exact values). */
export function ChartWithTable({ chart, table, title }: { chart: ReactNode; table: ReactNode; title: string }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <div>
      <div className="row" style={{ marginBottom: 6 }}>
        <h3 className="spacer" style={{ margin: 0 }}>{title}</h3>
        <button className="btn ghost small" style={{ minHeight: 34 }} onClick={() => setShowTable((v) => !v)}>{showTable ? '📈 Chart' : '🔢 Table'}</button>
      </div>
      {showTable ? table : chart}
    </div>
  );
}
