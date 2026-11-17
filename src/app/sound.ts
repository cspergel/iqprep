/** Little synthesized sound effects (no audio files to host). */
let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

function audio(): AudioContext | null {
  if (!enabled || typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.12) {
  const a = audio();
  if (!a) return;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = a.currentTime + start;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export const sfx = {
  tap: () => tone(660, 0, 0.08, 'triangle', 0.06),
  correct: () => { tone(660, 0, 0.14, 'triangle'); tone(990, 0.1, 0.22, 'triangle'); },
  partial: () => { tone(560, 0, 0.14, 'triangle'); tone(700, 0.1, 0.2, 'triangle'); },
  tryAgain: () => { tone(420, 0, 0.16, 'sine', 0.09); tone(360, 0.12, 0.2, 'sine', 0.07); },
  star: () => { tone(880, 0, 0.1, 'triangle', 0.08); tone(1320, 0.07, 0.16, 'triangle', 0.07); },
  fanfare: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.3, 'triangle', 0.1)); },
};
