import { useMemo } from 'react';

const COLORS = ['#e8743b', '#f4c542', '#3a86b4', '#3f7d5c', '#c8435a', '#9cbf8a'];

/** Lightweight CSS confetti burst. */
export function Confetti({ count = 60 }: { count?: number }) {
  const bits = useMemo(
    () => Array.from({ length: count }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      dur: 1.8 + Math.random() * 1.6,
      rot: Math.random() * 360,
      color: COLORS[i % COLORS.length],
      w: 6 + Math.random() * 8,
      h: 8 + Math.random() * 10,
      round: Math.random() < 0.3,
    })),
    [count],
  );
  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 50 }}>
      <style>{`@keyframes confetti-fall { from { transform: translateY(-10vh) rotate(0deg); opacity: 1; } to { transform: translateY(110vh) rotate(720deg); opacity: .9; } }`}</style>
      {bits.map((b, i) => (
        <span
          key={i}
          style={{
            position: 'absolute', top: 0, left: `${b.left}%`, width: b.w, height: b.h, background: b.color,
            borderRadius: b.round ? '50%' : 2, transform: `rotate(${b.rot}deg)`,
            animation: `confetti-fall ${b.dur}s ${b.delay}s cubic-bezier(.3,.6,.6,1) forwards`,
          }}
        />
      ))}
    </div>
  );
}
