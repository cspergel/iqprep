/**
 * Shared helpers for the speeded "sheet" games (CD, SS, CA, NSL, NSQ — all owned by one builder).
 * Pure helpers first, then small UI pieces: tap buttons with instant feedback and a double-tap
 * guard, the "Ready, set, go!" countdown, the slim time bar and the start/summary screens.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { PipSays, useCountdown, type MascotMood } from '../../ui/kit';

// ---------- pure helpers ----------

/** Actual elapsed seconds for scoring: finite, within [0, limit], one decimal. Missing ⇒ the full limit. */
export function clampElapsed(elapsedSec: unknown, limitSec: number): number {
  const x = typeof elapsedSec === 'number' && Number.isFinite(elapsedSec) ? elapsedSec : limitSec;
  return Math.round(Math.max(0, Math.min(limitSec, x)) * 10) / 10;
}

/**
 * A sheet counts as "correct" (good, careful work) when something was done and at least 90% of the
 * attempted answers were right. The real measure is `points`; this flag only drives the runner's
 * thumbs-up.
 */
export function accurateSheet(correct: number, errors: number): boolean {
  return correct > 0 && correct / (correct + errors) >= 0.9;
}

/** n blocks of a random permutation of 0..k-1, never repeating the same value twice in a row. */
export function balancedSequence(next: () => number, k: number, length: number): number[] {
  const out: number[] = [];
  while (out.length < length) {
    const block = Array.from({ length: k }, (_, i) => i);
    for (let i = block.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [block[i], block[j]] = [block[j], block[i]];
    }
    if (out.length > 0 && block[0] === out[out.length - 1] && k > 1) {
      [block[0], block[block.length - 1]] = [block[block.length - 1], block[0]];
    }
    out.push(...block);
  }
  return out.slice(0, length);
}

// ---------- hooks ----------

/** Returns `allow()`: true unless another tap was accepted less than `ms` ago (stops accidental double taps). */
export function useTapGuard(ms = 150): () => boolean {
  const last = useRef(0);
  return () => {
    const now = Date.now();
    if (now - last.current < ms) return false;
    last.current = now;
    return true;
  };
}

export function useStopwatch() {
  const started = useRef<number | null>(null);
  return {
    start: () => { started.current = Date.now(); },
    elapsed: () => (started.current === null ? 0 : (Date.now() - started.current) / 1000),
  };
}

/** Wraps onSubmit so it fires exactly once; `done` flips to true afterwards (lock the sheet). */
export function useSubmitOnce<R>(onSubmit: (r: R) => void): [(r: R) => void, boolean] {
  const sent = useRef(false);
  const [done, setDone] = useState(false);
  const submit = (r: R) => {
    if (sent.current) return;
    sent.current = true;
    setDone(true);
    onSubmit(r);
  };
  return [submit, done];
}

// ---------- styles ----------

const SPEED_CSS = `
.spd-btn { min-height: 58px; min-width: 56px; border: 3px solid var(--ink); border-radius: 14px; background: var(--card);
  box-shadow: var(--shadow-sm); display: grid; place-items: center; padding: 4px; cursor: pointer; touch-action: manipulation;
  user-select: none; -webkit-user-select: none; transition: transform .05s ease, box-shadow .05s ease, background .1s; }
.spd-btn.pressed { transform: translate(2px, 2px); box-shadow: none; background: var(--sun); }
.spd-btn.good { background: var(--good-bg); border-color: var(--good); }
.spd-btn.bad { background: var(--bad-bg); border-color: var(--bad); }
.spd-btn:disabled { opacity: .5; cursor: default; }
.spd-pal { display: grid; gap: 8px; width: 100%; max-width: 520px; }
.spd-big { font-family: var(--font-display); font-weight: 800; font-size: clamp(3rem, 15vw, 6rem); line-height: 1; }
@keyframes spd-in { from { opacity: .25; transform: translateX(12px); } to { opacity: 1; transform: none; } }
.spd-in { animation: spd-in .14s ease-out both; }
@keyframes spd-count { from { transform: scale(1.7); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.spd-count { animation: spd-count .3s cubic-bezier(.2,1.4,.4,1) both; }
@keyframes spd-shake { 0%,100% { transform: none; } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
.spd-shake { animation: spd-shake .25s ease; }
.spd-sheet { width: 100%; max-width: 640px; touch-action: manipulation; user-select: none; -webkit-user-select: none; }
`;

export function SpeedStyles() {
  return <style>{SPEED_CSS}</style>;
}

// ---------- TapButton ----------

export interface TapButtonProps {
  onTap: () => void;
  children: ReactNode;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
}

/** Time of the last pointer-down on any TapButton; the click that follows it must be ignored even if
 * the button under the finger was swapped for a new one (e.g. the sheet moved on to the next row). */
let lastPointerAt = 0;

/**
 * Acts on pointer-down (no waiting for the finger to lift) with a short pressed flash, and still
 * works from the keyboard via click. The click that follows a pointer-down is ignored.
 */
export function TapButton({ onTap, children, ariaLabel, className, style, disabled }: TapButtonProps) {
  const [pressed, setPressed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const flash = () => {
    setPressed(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPressed(false), 110);
  };
  return (
    <button
      type="button"
      className={`spd-btn ${pressed ? 'pressed' : ''} ${className ?? ''}`}
      style={style}
      disabled={disabled}
      aria-label={ariaLabel}
      onPointerDown={(e) => {
        if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
        lastPointerAt = Date.now();
        flash();
        onTap();
      }}
      onClick={() => {
        if (Date.now() - lastPointerAt < 800) return;
        flash();
        onTap();
      }}
    >
      {children}
    </button>
  );
}

// ---------- Ready, set, go ----------

export function ReadySetGo({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const cb = useRef(onDone);
  cb.current = onDone;
  useEffect(() => {
    const ts = [
      setTimeout(() => setStep(1), 700),
      setTimeout(() => setStep(2), 1400),
      setTimeout(() => cb.current(), 1900),
    ];
    return () => ts.forEach(clearTimeout);
  }, []);
  const words = ['Ready…', 'Set…', 'Go!'];
  return (
    <div className="stack" style={{ alignItems: 'center', justifyContent: 'center', minHeight: 220 }} aria-live="assertive">
      <div key={step} className="spd-big spd-count" style={{ color: step === 2 ? 'var(--good)' : 'var(--ink)' }}>
        {words[step]}
      </div>
    </div>
  );
}

// ---------- slim time bar (isolated so ticks don't re-render the sheet) ----------

export interface SheetBarProps {
  seconds: number;
  running: boolean;
  onExpire: () => void;
  /** Items done so far (shown as a chip). */
  done?: number;
  /** Count-up instead of count-down (grown-up timer). */
  countUp?: boolean;
}

export function SheetBar({ seconds, running, onExpire, done, countUp }: SheetBarProps) {
  const left = useCountdown(seconds, running, onExpire);
  const pct = seconds > 0 ? (left / seconds) * 100 : 0;
  const shown = countUp ? Math.floor(seconds - left) : Math.ceil(left);
  return (
    <div className="row" style={{ gap: 8, width: '100%', maxWidth: 640, flexWrap: 'nowrap' }}>
      <span aria-hidden>⏱️</span>
      <div
        className={`timer spacer ${pct < 20 ? 'low' : ''}`}
        role="progressbar"
        aria-label="Time left"
        aria-valuemin={0}
        aria-valuemax={seconds}
        aria-valuenow={Math.ceil(left)}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      <span className="chip" aria-label={countUp ? `${shown} seconds` : `${shown} seconds left`}>{shown}s</span>
      {done !== undefined && <span className="chip" aria-label={`${done} done`}>✓ {done}</span>}
    </div>
  );
}

// ---------- screens ----------

export function SpeedIntro({ mood = 'wave', children, extra, onStart, startLabel = '▶ Try a few first', onSkip }: {
  mood?: MascotMood;
  children: ReactNode;
  extra?: ReactNode;
  onStart?: () => void;
  startLabel?: string;
  onSkip?: () => void;
}) {
  return (
    <div className="stack" style={{ alignItems: 'center', width: '100%', maxWidth: 560 }}>
      <PipSays mood={mood}>{children}</PipSays>
      {extra}
      {onStart && (
        <button type="button" className="btn primary big" onClick={onStart}>{startLabel}</button>
      )}
      {onSkip && (
        <button type="button" className="btn ghost small" onClick={onSkip}>Skip practice → go!</button>
      )}
    </div>
  );
}

/** Shown between the practice and the timed sheet. */
export function ReadyCard({ children, onGo }: { children: ReactNode; onGo: () => void }) {
  // Armed after a moment so the tail of the last practice tap can't press it by accident.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setArmed(true), 500);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="stack" style={{ alignItems: 'center', maxWidth: 560 }}>
      <PipSays mood="cheer">{children}</PipSays>
      <button type="button" className="btn go big" disabled={!armed} onClick={onGo}>🚀 Start the clock</button>
    </div>
  );
}

export function PracticeNote({ state, children }: { state: 'idle' | 'good' | 'bad'; children: ReactNode }) {
  const cls = state === 'good' ? 'feedback good' : state === 'bad' ? 'feedback bad' : 'feedback';
  return (
    <div className={`${cls} small`} style={{ padding: '8px 14px', width: '100%', maxWidth: 520, textAlign: 'center' }} aria-live="polite">
      {children}
    </div>
  );
}

export function SheetDone() {
  return (
    <div className="stack" style={{ alignItems: 'center' }} aria-live="polite">
      <div className="spd-big spd-count">🏁</div>
      <p className="prompt" style={{ margin: 0 }}>Time to check!</p>
    </div>
  );
}

export function SpeedSummary({ stats, mood = 'cheer', children }: {
  stats: { label: string; value: string | number }[];
  mood?: MascotMood;
  children?: ReactNode;
}) {
  return (
    <div className="stack" style={{ alignItems: 'center', width: '100%' }}>
      <div className="row" style={{ justifyContent: 'center' }}>
        {stats.map((s) => (
          <div key={s.label} className="card flat tint center" style={{ padding: '8px 14px', minWidth: 96 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800 }}>{s.value}</div>
            <div className="small muted">{s.label}</div>
          </div>
        ))}
      </div>
      {children && <PipSays mood={mood} size={64}>{children}</PipSays>}
    </div>
  );
}
