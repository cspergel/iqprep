/**
 * Strategy Toolbox: optional, child-opened, and always plural.
 *
 * Design intent: offer *several* ways to attack a problem (subtest-specific tricks mixed with general
 * flexible-thinking moves) and let the child choose — so no single recipe gets locked in. Real tests
 * vary item formats, so flexibility matters more than any one method. Hidden until asked for, never
 * shown in test mode.
 */
import { useMemo, useState } from 'react';
import { speakText } from '../core/speech';
import type { SubtestGuide } from '../core/types';

/** General problem-solving moves (AoPS / Beast Academy spirit) that apply to almost any puzzle. */
export const FLEXIBLE_MOVES: { title: string; tip: string }[] = [
  { title: 'Try a different way', tip: 'If one way of looking isn’t working, switch! Look from a new direction.' },
  { title: 'Cross some out', tip: 'Find answers that CAN’T be right and ignore them. Fewer choices = easier.' },
  { title: 'Guess, then check', tip: 'Pick your best guess, then test it. Does it really fit everything?' },
  { title: 'Make it smaller', tip: 'Look at just one small part first. Then add the next part.' },
  { title: 'Say it out loud', tip: 'Tell yourself (or Pip!) what you notice. Talking helps thinking.' },
  { title: 'Picture it', tip: 'Close your eyes and imagine it. Move things around in your mind.' },
  { title: 'Look for what changes', tip: 'What stays the same? What changes? Patterns hide in the changes.' },
  { title: 'Work backward', tip: 'Start from the answers and see which one could lead back to the question.' },
  { title: 'Slow down to speed up', tip: 'A careful look first saves time fixing mistakes later.' },
  { title: 'It’s OK to skip a hard one', tip: 'Do your best guess and move on — the next one is a fresh start.' },
];

export function StrategyToolbox({ guide, seed = 0, label = 'Strategy toolbox', nudge = false }: {
  guide: SubtestGuide;
  seed?: number;
  label?: string;
  /** Gently highlight the button (e.g. after a miss) — still closed until the child opens it. */
  nudge?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const pool = useMemo(() => {
    // Interleave the game's own tricks with general moves so options always feel varied.
    const own = [...guide.strategies];
    const general = [...FLEXIBLE_MOVES];
    const rot = (xs: typeof own, n: number) => (xs.length ? [...xs.slice(n % xs.length), ...xs.slice(0, n % xs.length)] : xs);
    return { own: rot(own, seed), general: rot(general, seed * 7) };
  }, [guide, seed]);

  const pickFrom = <T,>(xs: T[], start: number, n: number) => Array.from({ length: Math.min(n, xs.length) }, (_, i) => xs[(start + i) % xs.length]);
  const cards = [...pickFrom(pool.own, round * 2, 2), ...pickFrom(pool.general, round, 1)];

  if (!open) {
    return (
      <button
        type="button"
        className={`btn ghost small ${nudge ? 'wiggle' : ''}`}
        style={nudge ? { background: 'var(--warn-bg)' } : undefined}
        onClick={() => setOpen(true)}
        aria-expanded={false}
      >
        🧰 {label}
      </button>
    );
  }
  return (
    <div className="card flat tint pop-in" style={{ width: '100%', textAlign: 'left' }} aria-live="polite">
      <div className="row" style={{ marginBottom: 8 }}>
        <strong className="spacer">🧰 There’s more than one way! Pick one to try:</strong>
        <button type="button" className="btn ghost small icon" onClick={() => setOpen(false)} aria-label="Close toolbox">✕</button>
      </div>
      <div className="grid-auto" style={{ gap: 10 }}>
        {cards.map((c) => (
          <div key={c.title} className="card flat" style={{ padding: 12 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800 }}>{c.title}</div>
            <div className="small">{c.tip}</div>
            <button type="button" className="btn ghost small" style={{ marginTop: 6, minHeight: 34 }} onClick={() => speakText(`${c.title}. ${c.tip}`)} aria-label={`Read ${c.title}`}>🔊</button>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 10, justifyContent: 'space-between' }}>
        <span className="small muted">Mix and match — good thinkers use lots of tools.</span>
        <button type="button" className="btn ghost small" onClick={() => setRound((r) => r + 1)}>🔄 Show me different ways</button>
      </div>
    </div>
  );
}
