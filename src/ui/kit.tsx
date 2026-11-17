/**
 * Shared kid-friendly UI pieces used by every game. Prefer these over one-off markup so the
 * games feel like one app. Styles live in src/styles/global.css.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

// ---------- ChoiceGrid ----------

export interface ChoiceOption {
  key: string;
  content: ReactNode;
  ariaLabel?: string;
}

export interface ChoiceGridProps {
  options: ChoiceOption[];
  /** Keys currently selected (single-select games pass one key). */
  selected?: string[];
  onSelect?: (key: string) => void;
  /** After answering: which keys are right, which were chosen. Locks the grid. */
  reveal?: { correctKeys: string[]; chosenKeys: string[] };
  disabled?: boolean;
  /** Min column width in px (default 110). */
  minWidth?: number;
  /** Show A, B, C… corner letters. */
  letters?: boolean;
  /** Show 1, 2, 3… corner numbers (the real test numbers its response options). Overrides `letters`. */
  numbers?: boolean;
  /** Fixed number of columns (e.g. 5 = one row of five, 3 = two rows of three) instead of auto-fit. */
  columns?: number;
  className?: string;
}

export function ChoiceGrid({ options, selected = [], onSelect, reveal, disabled, minWidth, letters, numbers, columns, className }: ChoiceGridProps) {
  const style: Record<string, string> = {};
  if (minWidth) style['--choice-min'] = `${minWidth}px`;
  if (columns) {
    style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
    style.gap = columns >= 5 ? '8px' : '12px';
  }
  return (
    <div className={`choices ${className ?? ''}`} style={style}>
      {options.map((opt, i) => {
        const isCorrect = reveal?.correctKeys.includes(opt.key);
        const isChosen = reveal?.chosenKeys.includes(opt.key);
        let state = '';
        if (reveal) {
          if (isCorrect) state = 'correct';
          else if (isChosen) state = 'wrong';
          else state = 'dim';
        } else if (selected.includes(opt.key)) state = 'selected';
        return (
          <button
            key={opt.key}
            type="button"
            className={`choice ${state} pop-in`}
            style={{ animationDelay: `${i * 40}ms` }}
            disabled={disabled || !!reveal}
            aria-pressed={selected.includes(opt.key)}
            aria-label={opt.ariaLabel}
            onClick={() => onSelect?.(opt.key)}
          >
            {numbers ? <span className="letter">{i + 1}</span> : letters && <span className="letter">{String.fromCharCode(65 + i)}</span>}
            {opt.content}
            {reveal && isCorrect && <span className="badge" aria-hidden>✓</span>}
            {reveal && isChosen && !isCorrect && <span className="badge" aria-hidden>✗</span>}
          </button>
        );
      })}
    </div>
  );
}

// ---------- TimerBar ----------

export interface TimerBarProps {
  seconds: number;
  running: boolean;
  onExpire?: () => void;
  /** Changing this restarts the timer. */
  resetKey?: string | number;
  showNumber?: boolean;
}

export function TimerBar({ seconds, running, onExpire, resetKey, showNumber }: TimerBarProps) {
  const [left, setLeft] = useState(seconds);
  const expired = useRef(false);
  const cb = useRef(onExpire);
  cb.current = onExpire;

  useEffect(() => {
    setLeft(seconds);
    expired.current = false;
  }, [seconds, resetKey]);

  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const startLeft = left;
    const t = setInterval(() => {
      const next = Math.max(0, startLeft - (Date.now() - started) / 1000);
      setLeft(next);
      if (next <= 0 && !expired.current) {
        expired.current = true;
        clearInterval(t);
        cb.current?.();
      }
    }, 200);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, resetKey]);

  const pct = seconds > 0 ? (left / seconds) * 100 : 0;
  return (
    <div className="row" style={{ gap: 8, width: '100%' }} aria-label={`${Math.ceil(left)} seconds left`}>
      <span aria-hidden>⏱️</span>
      <div className={`timer spacer ${pct < 25 ? 'low' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={seconds} aria-valuenow={Math.ceil(left)}>
        <span style={{ width: `${pct}%` }} />
      </div>
      {showNumber && <span className="chip">{Math.ceil(left)}s</span>}
    </div>
  );
}

// ---------- Countdown hook for players that run their own clock (speeded sheets) ----------

export function useCountdown(seconds: number, running: boolean, onDone: () => void) {
  const [left, setLeft] = useState(seconds);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const t = setInterval(() => {
      const next = Math.max(0, seconds - (Date.now() - started) / 1000);
      setLeft(next);
      if (next <= 0) {
        clearInterval(t);
        done.current();
      }
    }, 200);
    return () => clearInterval(t);
  }, [running, seconds]);
  return left;
}

// ---------- NumberPad ----------

export interface NumberPadProps {
  onKey: (key: string) => void;
  onDelete?: () => void;
  onDone?: () => void;
  /** Defaults to digits 1–9 then 0. Pass letters for letter entry. */
  keys?: string[];
  doneLabel?: string;
  disabled?: boolean;
}

export function NumberPad({ onKey, onDelete, onDone, keys, doneLabel = 'Done', disabled }: NumberPadProps) {
  const isLetters = !!keys && keys.some((k) => /[A-Z]/i.test(k));
  const list = keys ?? ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  return (
    <div className="stack" style={{ alignItems: 'center' }}>
      <div className={`pad ${isLetters ? 'letters' : ''}`}>
        {list.map((k) => (
          <button key={k} type="button" className="key" disabled={disabled} onClick={() => onKey(k)}>
            {k}
          </button>
        ))}
        {!keys && (
          <>
            <button type="button" className="key wide" disabled={disabled} onClick={onDelete} aria-label="Delete">⌫</button>
            <button type="button" className="key" disabled={disabled} onClick={() => onKey('0')}>0</button>
            <button type="button" className="key wide" disabled={disabled} onClick={onDone}>✓</button>
          </>
        )}
      </div>
      {keys && (
        <div className="row">
          {onDelete && <button type="button" className="btn ghost small" disabled={disabled} onClick={onDelete}>⌫ Undo</button>}
          {onDone && <button type="button" className="btn go small" disabled={disabled} onClick={onDone}>{doneLabel}</button>}
        </div>
      )}
    </div>
  );
}

// ---------- SpeakButton ----------

export function SpeakButton({ onSpeak, label = 'Read it to me' }: { onSpeak: () => void; label?: string }) {
  return (
    <button type="button" className="btn ghost small" onClick={onSpeak} aria-label={label} title={label}>
      🔊 <span className="small">{label}</span>
    </button>
  );
}

// ---------- Mascot ----------

export type MascotMood = 'happy' | 'think' | 'cheer' | 'oops' | 'wave' | 'sleep';

/** Pip the camp fox. Pure SVG so it scales crisply and needs no assets. */
export function Mascot({ mood = 'happy', size = 110, className }: { mood?: MascotMood; size?: number; className?: string }) {
  const eyes =
    mood === 'sleep' ? (
      <>
        <path d="M38 52 q6 5 12 0" stroke="#1d2b2a" strokeWidth={3.5} fill="none" strokeLinecap="round" />
        <path d="M62 52 q6 5 12 0" stroke="#1d2b2a" strokeWidth={3.5} fill="none" strokeLinecap="round" />
      </>
    ) : mood === 'cheer' ? (
      <>
        <path d="M38 54 q6 -8 12 0" stroke="#1d2b2a" strokeWidth={4} fill="none" strokeLinecap="round" />
        <path d="M62 54 q6 -8 12 0" stroke="#1d2b2a" strokeWidth={4} fill="none" strokeLinecap="round" />
      </>
    ) : (
      <>
        <circle cx={44} cy={52} r={4.5} fill="#1d2b2a" />
        <circle cx={68} cy={52} r={4.5} fill="#1d2b2a" />
        <circle cx={45.5} cy={50.5} r={1.4} fill="#fff" />
        <circle cx={69.5} cy={50.5} r={1.4} fill="#fff" />
      </>
    );
  const mouth =
    mood === 'oops' ? <path d="M50 74 q6 -5 12 0" stroke="#1d2b2a" strokeWidth={3.5} fill="none" strokeLinecap="round" />
    : mood === 'think' ? <path d="M50 73 h12" stroke="#1d2b2a" strokeWidth={3.5} strokeLinecap="round" />
    : <path d="M48 70 q8 9 16 0" stroke="#1d2b2a" strokeWidth={3.5} fill={mood === 'cheer' ? '#c8435a' : 'none'} strokeLinecap="round" />;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 112 112" role="img" aria-label={`Pip the fox looks ${mood}`}>
      {/* tail */}
      <path d="M86 92 q24 -6 20 -32 q-6 14 -24 16 z" fill="#e8743b" stroke="#1d2b2a" strokeWidth={3} strokeLinejoin="round" />
      <path d="M100 66 q-2 8 -10 10" fill="none" stroke="#fffdf6" strokeWidth={5} strokeLinecap="round" />
      {/* body */}
      <ellipse cx={56} cy={94} rx={26} ry={14} fill="#e8743b" stroke="#1d2b2a" strokeWidth={3} />
      {/* ears */}
      <path d="M24 40 L28 8 L48 28 Z" fill="#e8743b" stroke="#1d2b2a" strokeWidth={3} strokeLinejoin="round" />
      <path d="M88 40 L84 8 L64 28 Z" fill="#e8743b" stroke="#1d2b2a" strokeWidth={3} strokeLinejoin="round" />
      <path d="M30 32 L31 18 L40 28 Z" fill="#1d2b2a" />
      <path d="M82 32 L81 18 L72 28 Z" fill="#1d2b2a" />
      {/* head */}
      <path d="M18 46 Q20 22 56 22 Q92 22 94 46 Q92 70 56 86 Q20 70 18 46 Z" fill="#e8743b" stroke="#1d2b2a" strokeWidth={3} strokeLinejoin="round" />
      <path d="M30 58 Q42 62 56 86 Q70 62 82 58 Q76 76 56 86 Q36 76 30 58 Z" fill="#fffdf6" />
      {eyes}
      <ellipse cx={56} cy={64} rx={5} ry={3.6} fill="#1d2b2a" />
      {mouth}
      {/* camp hat */}
      <path d="M34 28 Q56 6 78 28 Z" fill="#2f5d50" stroke="#1d2b2a" strokeWidth={3} strokeLinejoin="round" />
      <rect x={30} y={26} width={52} height={6} rx={3} fill="#f4c542" stroke="#1d2b2a" strokeWidth={2.5} />
      {mood === 'wave' && <path d="M8 70 q-2 -14 8 -18" stroke="#1d2b2a" strokeWidth={3} fill="#e8743b" />}
      {mood === 'think' && <circle cx={100} cy={20} r={6} fill="#fffdf6" stroke="#1d2b2a" strokeWidth={2.5} />}
    </svg>
  );
}

/** Mascot with a speech bubble. */
export function PipSays({ children, mood = 'happy', size = 84 }: { children: ReactNode; mood?: MascotMood; size?: number }) {
  return (
    <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'nowrap', gap: 6 }}>
      <span style={{ flex: 'none' }}><Mascot mood={mood} size={size} className="float" /></span>
      <div className="card pop-in" style={{ borderRadius: '20px 20px 20px 4px', padding: '10px 14px', boxShadow: 'var(--shadow-sm)' }}>
        {children}
      </div>
    </div>
  );
}

// ---------- Stars ----------

export function Stars({ count, max = 3, size = 28 }: { count: number; max?: number; size?: number }) {
  return (
    <span className="row" style={{ gap: 2 }} aria-label={`${count} of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 100 100" aria-hidden>
          <polygon
            points="50,6 62,38 96,38 68,58 79,92 50,72 21,92 32,58 4,38 38,38"
            fill={i < count ? '#f4c542' : '#fffdf6'}
            stroke="#1d2b2a"
            strokeWidth={6}
            strokeLinejoin="round"
          />
        </svg>
      ))}
    </span>
  );
}
