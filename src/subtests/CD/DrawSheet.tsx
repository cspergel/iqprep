/**
 * Pencil-mode sheet: every box is a little drawing area (finger, mouse or stylus via pointer events).
 *
 * - Draw in the glowing box. Lifting and pausing (~350 ms), or starting to draw in the next box,
 *   finishes the box and hands its strokes to `onCommit`. While the box has fewer strokes than its
 *   symbol needs (the first line of a plus) the pause is longer, so two-part marks aren't cut off.
 * - No eraser. "↩ Redo last box" wipes the box being drawn, or reopens the box just finished
 *   (only that one). A late second stroke in the box just finished also rejoins it.
 * - In the timed sheet nothing is judged or corrected on screen; the ink stays exactly as drawn.
 *   In the sample, `onCommit` may answer 'retry': the box turns red and the next stroke starts it over.
 */
import { useEffect, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react';
import { strokesToPath, templateStrokes, type CdVersion, type Pt, type Stroke } from './ink';
import { BAD_INK, CD_SHAPES, INK, Ink, ShapeBox, targetName } from './glyphs';

export type CommitVerdict = 'next' | 'retry';
export const PAUSE_MS = 350;
export const PART_PAUSE_MS = 1100;

export interface DrawSheetProps {
  v: CdVersion;
  /** Target (shape/digit) of each box. */
  targets: number[];
  /** key[target] = symbol. Only used to time the auto-advance (how many strokes the mark has). */
  codeKey: number[];
  perRow: number;
  /** Rows shown at once (the active row, the one before it and the ones after). */
  rows: number;
  locked?: boolean;
  /** Pause after lifting before the box is finished. */
  pauseMs?: number;
  onCommit: (index: number, strokes: Stroke[]) => CommitVerdict;
  /** Given ⇒ the box just finished may be reopened (redo / late stroke); the parent drops its result. */
  onReopen?: (index: number) => void;
  /** Colour finished boxes (sample feedback). Omitted ⇒ plain ink, no judging. */
  verdictOf?: (index: number) => 'good' | 'bad' | undefined;
  /** Filled with a function that finishes the box in progress (call when time runs out). */
  flushRef?: MutableRefObject<(() => void) | null>;
  onActiveChange?: (index: number) => void;
}

interface Live { id: number; box: number; rect: { left: number; top: number; width: number; height: number }; pts: Pt[] }

export function DrawSheet(props: DrawSheetProps) {
  const { v, targets, codeKey, perRow, rows, locked, pauseMs = PAUSE_MS, onReopen, verdictOf, flushRef } = props;
  const cb = useRef(props);
  cb.current = props;
  const inks = useRef<Stroke[][]>([]);
  const activeRef = useRef(0);
  const [active, setActive] = useState(0);
  const [, bump] = useState(0);
  const retryBox = useRef(-1);
  const lastDone = useRef(-1);
  const live = useRef<Live | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const livePaths = useRef<Record<number, SVGPathElement | null>>({});
  const penSeen = useRef(false);
  const sheet = useRef<HTMLDivElement>(null);
  const lockedRef = useRef(!!locked);
  lockedRef.current = !!locked;

  const rerender = () => bump((n) => n + 1);
  const moveTo = (i: number) => {
    activeRef.current = i;
    setActive(i);
    cb.current.onActiveChange?.(i);
  };
  const clearTimer = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
  };
  const inkOf = (i: number) => inks.current[i] ?? [];

  /** Finish the active box. True when the sheet moved on. */
  const commit = (): boolean => {
    clearTimer();
    const i = activeRef.current;
    const strokes = inkOf(i);
    if (strokes.length === 0 || i >= cb.current.targets.length || retryBox.current === i) return false;
    const verdict = cb.current.onCommit(i, strokes.map((s) => s.slice()));
    if (verdict === 'next') {
      lastDone.current = i;
      moveTo(i + 1);
    } else retryBox.current = i;
    rerender();
    return verdict === 'next';
  };

  const schedule = () => {
    clearTimer();
    const i = activeRef.current;
    const strokes = inkOf(i);
    if (strokes.length === 0 || retryBox.current === i) return;
    const need = templateStrokes(v, codeKey[targets[i]] ?? 0).length;
    timer.current = setTimeout(commit, strokes.length >= need ? pauseMs : Math.max(pauseMs, PART_PAUSE_MS));
  };

  const reopen = (i: number) => {
    clearTimer();
    cb.current.onReopen?.(i);
    lastDone.current = -1;
    moveTo(i);
  };

  const endStroke = (thenSchedule: boolean) => {
    const l = live.current;
    if (!l) return;
    live.current = null;
    livePaths.current[l.box]?.setAttribute('d', '');
    inks.current[l.box] = [...inkOf(l.box), l.pts];
    rerender();
    if (thenSchedule && l.box === activeRef.current) schedule();
  };

  useEffect(() => {
    if (flushRef) flushRef.current = () => { endStroke(false); commit(); };
    return () => { if (flushRef) flushRef.current = null; };
  });
  useEffect(() => {
    if (locked) { clearTimer(); live.current = null; }
  }, [locked]);
  useEffect(() => () => clearTimer(), []);
  // Belt and braces for browsers that ignore touch-action: never scroll the page mid-stroke.
  useEffect(() => {
    const el = sheet.current;
    if (!el) return;
    const stop = (e: TouchEvent) => { if (live.current) e.preventDefault(); };
    el.addEventListener('touchmove', stop, { passive: false });
    return () => el.removeEventListener('touchmove', stop);
  }, []);

  const toBox = (x: number, y: number, r: Live['rect']): Pt => ({
    x: ((x - r.left) * 100) / (r.width || 100),
    y: ((y - r.top) * 100) / (r.height || 100),
  });
  const drawLive = () => {
    const l = live.current;
    if (l) livePaths.current[l.box]?.setAttribute('d', strokesToPath([l.pts]));
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (lockedRef.current || live.current) return;
    const type = e.pointerType || 'mouse';
    if (type === 'mouse' && e.button > 0) return;
    if (type === 'pen') penSeen.current = true;
    else if (type === 'touch' && penSeen.current) return; // resting wrist while using a stylus
    const el = (e.target as Element).closest?.('[data-ink]') as HTMLElement | null;
    if (!el) return;
    const idx = Number(el.dataset.ink);
    const a = activeRef.current;
    if (!(idx < cb.current.targets.length)) return;
    if (idx === a) {
      clearTimer();
      if (retryBox.current === a) { inks.current[a] = []; retryBox.current = -1; }
    } else if (idx === a + 1 && inkOf(a).length > 0) {
      if (!commit()) return;
    } else if (idx === a - 1 && cb.current.onReopen && lastDone.current === idx && inkOf(a).length === 0) {
      reopen(idx);
    } else return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not supported */ }
    const b = el.getBoundingClientRect();
    const rect = { left: b.left, top: b.top, width: b.width, height: b.height };
    live.current = { id: e.pointerId ?? 1, box: idx, rect, pts: [toBox(e.clientX, e.clientY, rect)] };
    drawLive();
  };

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const l = live.current;
    if (!l || (e.pointerId ?? 1) !== l.id) return;
    const native = e.nativeEvent as PointerEvent;
    const list = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [];
    const evs: { clientX: number; clientY: number }[] = list.length > 0 ? list : [e];
    for (const ev of evs) {
      const p = toBox(ev.clientX, ev.clientY, l.rect);
      const q = l.pts[l.pts.length - 1];
      if (Math.hypot(p.x - q.x, p.y - q.y) >= 0.6) l.pts.push(p);
    }
    drawLive();
  };

  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const l = live.current;
    if (!l || (e.pointerId ?? 1) !== l.id) return;
    endStroke(true);
  };

  const redo = () => {
    if (lockedRef.current) return;
    clearTimer();
    const a = activeRef.current;
    if (inkOf(a).length > 0) {
      inks.current[a] = [];
      retryBox.current = -1;
    } else if (onReopen && lastDone.current === a - 1) {
      reopen(a - 1);
      inks.current[a - 1] = [];
    }
    rerender();
  };
  const canRedo = !locked && (inkOf(active).length > 0 || (!!onReopen && lastDone.current === active - 1 && active > 0));

  const total = targets.length;
  const totalRows = Math.ceil(total / perRow);
  const curRow = Math.floor(Math.min(active, total - 1) / perRow);
  const from = Math.max(0, Math.min(curRow - 1, totalRows - rows));
  const shown: number[][] = [];
  for (let r = from; r < Math.min(totalRows, from + rows); r++) {
    const start = r * perRow;
    shown.push(Array.from({ length: Math.min(perRow, total - start) }, (_, k) => start + k));
  }

  return (
    <div className="stack" style={{ gap: 8, alignItems: 'center', width: '100%' }}>
      <div
        ref={sheet}
        className="stack cd-ink-sheet"
        style={{ gap: 8, alignItems: 'center' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        {shown.map((row) => (
          <div key={row[0]} className="row" style={{ gap: 6, flexWrap: 'nowrap', width: '100%', justifyContent: 'center',
            opacity: row[row.length - 1] < active ? 0.6 : 1 }}>
            {row.map((i) => {
              const verdict = retryBox.current === i ? 'bad' : i < active ? verdictOf?.(i) : undefined;
              const state = verdict ?? (i === active && !locked ? 'now' : 'todo');
              return (
                <InkBox
                  key={i}
                  v={v}
                  index={i}
                  target={targets[i]}
                  strokes={inkOf(i)}
                  state={state}
                  pathRef={(el) => { livePaths.current[i] = el; }}
                />
              );
            })}
            {Array.from({ length: perRow - row.length }, (_, k) => <div key={`pad${k}`} style={{ flex: '1 1 0', maxWidth: 84 }} />)}
          </div>
        ))}
      </div>
      <button type="button" className="btn ghost small" onClick={redo} disabled={!canRedo}>↩ Redo last box</button>
    </div>
  );
}

type InkState = 'todo' | 'now' | 'good' | 'bad';

function InkBox({ v, index, target, strokes, state, pathRef }: {
  v: CdVersion; index: number; target: number; strokes: Stroke[]; state: InkState; pathRef: (el: SVGPathElement | null) => void;
}) {
  const bg = state === 'now' ? 'var(--sun)' : state === 'good' ? 'var(--good-bg)' : state === 'bad' ? 'var(--bad-bg)' : 'var(--card)';
  const border = state === 'now' ? '3px solid var(--ink)' : state === 'bad' ? '2px solid var(--bad)' : '2px solid var(--ink)';
  const color = state === 'bad' ? BAD_INK : INK;
  const layers = (
    <>
      <Ink strokes={strokes} color={color} />
      <path ref={pathRef} stroke={INK} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  );
  return (
    <div
      aria-label={`${targetName(v, target)} box${strokes.length > 0 ? ', drawn in' : ''}`}
      aria-current={state === 'now' ? 'step' : undefined}
      style={{ flex: '1 1 0', minWidth: 0, maxWidth: 84, border, borderRadius: 8, background: bg, overflow: 'hidden', transition: 'background .1s' }}
    >
      {v === 'A' ? (
        <div data-ink={index} style={{ aspectRatio: '1' }}>
          <ShapeBox shape={CD_SHAPES[target]}>{layers}</ShapeBox>
        </div>
      ) : (
        <>
          <div style={{ textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, lineHeight: '24px', borderBottom: '2px solid var(--ink)' }}>{target + 1}</div>
          <div data-ink={index} style={{ aspectRatio: '1' }}>
            <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden style={{ display: 'block', overflow: 'visible' }}>{layers}</svg>
          </div>
        </>
      )}
    </div>
  );
}
