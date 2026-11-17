/**
 * Digit Span ("Number Echo"). Digits are read aloud at about one per second; the child echoes them
 * forward, backward, or from smallest to biggest (sequencing).
 *
 * REFERENCE MODULE: other subtests follow this layout — pure generate/score functions at the top,
 * the Player component below, the guide at the bottom.
 */
import { useEffect, useRef, useState } from 'react';
import { createRng } from '../../core/rng';
import { speakSequence, speechSupported, stopSpeaking } from '../../core/speech';
import type { GenerateRequest, Item, PlayerProps, ScoreOutcome, SubtestGuide, SubtestModule } from '../../core/types';
import { NumberPad, PipSays } from '../../ui/kit';

export type DsTask = 'forward' | 'backward' | 'sequencing';
export interface DsPayload {
  task: DsTask;
  digits: number[];
}
export type DsResponse = number[];

// ---------- difficulty model ----------
// Age-equivalent difficulty of a span of length L (50% pass point), per task.
const SPAN_CURVE: Record<DsTask, { base: number; perDigit: number; baseLen: number; min: number; max: number }> = {
  forward: { base: 7, perDigit: 3, baseLen: 5, min: 2, max: 9 },
  backward: { base: 6.5, perDigit: 2.8, baseLen: 3, min: 2, max: 8 },
  sequencing: { base: 6, perDigit: 2.7, baseLen: 3, min: 2, max: 9 },
};

export function spanDifficulty(task: DsTask, length: number): number {
  const c = SPAN_CURVE[task];
  return c.base + (length - c.baseLen) * c.perDigit;
}

export function spanForDifficulty(task: DsTask, difficulty: number): number {
  const c = SPAN_CURVE[task];
  const raw = Math.round(c.baseLen + (difficulty - c.base) / c.perDigit);
  return Math.max(c.min, Math.min(c.max, raw));
}

export function expectedAnswer(p: DsPayload): number[] {
  if (p.task === 'forward') return p.digits.slice();
  if (p.task === 'backward') return p.digits.slice().reverse();
  return p.digits.slice().sort((a, b) => a - b);
}

function makeDigits(task: DsTask, length: number, seed: number): number[] {
  const rng = createRng(seed);
  for (let attempt = 0; attempt < 200; attempt++) {
    const digits: number[] = [];
    if (task === 'sequencing' && length >= 4 && length <= 9) {
      // Sequencing items can repeat one digit, which makes ordering trickier.
      const pool = rng.sample([1, 2, 3, 4, 5, 6, 7, 8, 9], length - 1);
      pool.push(rng.pick(pool));
      digits.push(...rng.shuffle(pool));
    } else {
      digits.push(...rng.sample([1, 2, 3, 4, 5, 6, 7, 8, 9], Math.min(9, length)));
    }
    // Avoid easy runs like 4-5-6 or 6-5-4, and (for sequencing) lists that are already sorted.
    let run = false;
    for (let i = 2; i < digits.length; i++) {
      const d1 = digits[i - 1] - digits[i - 2];
      const d2 = digits[i] - digits[i - 1];
      if (Math.abs(d1) === 1 && d1 === d2) run = true;
    }
    const sorted = digits.join() === digits.slice().sort((a, b) => a - b).join();
    if (!run && !(task === 'sequencing' && sorted && length > 1)) return digits;
  }
  return Array.from({ length }, (_, i) => ((i * 4 + seed) % 9) + 1);
}

const TASK_WORDS: Record<DsTask, string> = {
  forward: 'the same order',
  backward: 'backward — the last number first',
  sequencing: 'from the smallest number to the biggest',
};

export function generate(req: GenerateRequest): Item<DsPayload> {
  const rng = createRng(req.seed);
  const task = (req.variant as DsTask | undefined) ?? rng.pick<DsTask>(['forward', 'backward', 'sequencing']);
  const length = spanForDifficulty(task, req.difficulty);
  const digits = makeDigits(task, length, req.seed ^ 0x5bd1e995);
  const answer = expectedAnswer({ task, digits });
  const hints: Record<DsTask, string[]> = {
    forward: [
      'Say the numbers quietly to yourself while you listen.',
      `Try chunking: hear them in little groups, like ${digits.slice(0, 2).join('-')} … ${digits.slice(2, 4).join('-') || '…'}.`,
    ],
    backward: [
      'First remember them forward. Then read them from the end, like walking backward.',
      'Picture the numbers in a row on a whiteboard, then point to them from right to left.',
    ],
    sequencing: [
      'Hunt for the smallest number first, then the next smallest.',
      'If a number was said twice, say it twice!',
    ],
  };
  const words = TASK_WORDS[task];
  return {
    id: `DS:${task}:${length}:${req.seed}`,
    subtest: 'DS',
    difficulty: spanDifficulty(task, length),
    seed: req.seed,
    payload: { task, digits },
    maxPoints: 1,
    skills: [`ds:${task}`, `ds:span-${length}`],
    hints: hints[task],
    explanation: `The numbers were ${digits.join(' - ')}. In ${words}, that's ${answer.join(' - ')}.`,
    steps:
      task === 'forward' ? undefined
      : task === 'backward' ? [`Forward: ${digits.join(' ')}`, `Start at the end: ${answer.join(' ')}`]
      : [`Heard: ${digits.join(' ')}`, `Smallest to biggest: ${answer.join(' ')}`],
    speak: `Listen carefully. Then tell me the numbers in ${words}.`,
  };
}

export function score(item: Item<DsPayload>, response: DsResponse | null): ScoreOutcome {
  const expected = expectedAnswer(item.payload);
  const length = item.payload.digits.length;
  if (!response) return { points: 0, correct: false, meta: { span: length } };
  const correct = response.length === expected.length && response.every((d, i) => d === expected[i]);
  let feedback: string | undefined;
  if (!correct && item.payload.task === 'backward' && response.join() === item.payload.digits.join()) {
    feedback = 'You remembered them all — but in forward order! Next time flip them around.';
  } else if (!correct && response.length === expected.length && response.slice().sort().join() === expected.slice().sort().join()) {
    feedback = 'You had all the right numbers, just in a different order. So close!';
  }
  return { points: correct ? 1 : 0, correct, meta: { span: length }, feedback };
}

// ---------- Player ----------

type Phase = 'ready' | 'listening' | 'answer';

const TASK_TITLES: Record<DsTask, string> = {
  forward: 'Say them the same way',
  backward: 'Say them backward',
  sequencing: 'Smallest to biggest',
};

export function Player({ item, mode, onSubmit, reveal, hintLevel }: PlayerProps<DsPayload, DsResponse>) {
  const { task, digits } = item.payload;
  const [phase, setPhase] = useState<Phase>(reveal ? 'answer' : 'ready');
  const [entry, setEntry] = useState<number[]>([]);
  const [pulse, setPulse] = useState(-1);
  const [replays, setReplays] = useState(0);
  const cancelled = useRef(false);
  const noSpeech = !speechSupported();

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
      stopSpeaking();
    };
  }, []);

  const listen = async () => {
    setPhase('listening');
    setEntry([]);
    await new Promise((r) => setTimeout(r, 500));
    await speakSequence(digits.map(String), 1000, setPulse, () => cancelled.current);
    if (noSpeech) await new Promise((r) => setTimeout(r, 400));
    setPulse(-1);
    if (!cancelled.current) setPhase('answer');
  };

  const shown = reveal ? (reveal.response ?? []) : entry;
  const expected = expectedAnswer(item.payload);
  // Tutor mode may replay once after the first hint; tests never replay.
  const canReplay = mode === 'tutor' && hintLevel >= 1 && replays < 1 && phase === 'answer' && !reveal;

  return (
    <div className="stage">
      <div className="prompt">{TASK_TITLES[task]}</div>

      {phase === 'ready' && (
        <div className="stack" style={{ alignItems: 'center' }}>
          <PipSays mood="wave">
            I'll say some numbers. Listen closely, then tap them {task === 'forward' ? 'in the same order' : task === 'backward' ? 'backward' : 'from smallest to biggest'}!
          </PipSays>
          <button type="button" className="btn primary big" onClick={listen}>👂 I'm ready</button>
        </div>
      )}

      {phase === 'listening' && (
        <div className="stack" style={{ alignItems: 'center' }} aria-live="polite">
          <div style={{ fontSize: 64 }} className={pulse >= 0 ? 'wiggle' : ''}>👂</div>
          <div className="row" style={{ justifyContent: 'center' }}>
            {digits.map((d, i) => (
              <span
                key={i}
                style={{
                  width: noSpeech ? 54 : 22, height: noSpeech ? 54 : 22, borderRadius: noSpeech ? 12 : '50%',
                  border: '3px solid var(--ink)', display: 'grid', placeItems: 'center',
                  background: i <= pulse ? 'var(--lake)' : 'var(--card)', color: '#fff',
                  fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800,
                  transition: 'background .2s',
                }}
              >
                {noSpeech && i === pulse ? d : ''}
              </span>
            ))}
          </div>
          <p className="muted">Listening…</p>
        </div>
      )}

      {phase === 'answer' && (
        <>
          <div className="entry" aria-live="polite" aria-label="Your answer">
            {shown.length === 0 && !reveal && <span className="muted small">tap the numbers</span>}
            {shown.map((d, i) => (
              <span key={i} style={{ color: reveal ? (expected[i] === d ? 'var(--good)' : 'var(--bad)') : undefined }}>{d}</span>
            ))}
          </div>
          {reveal ? (
            <div className="card flat tint center">
              <div className="small muted">Right answer</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 800, letterSpacing: '.1em' }}>{expected.join(' ')}</div>
            </div>
          ) : (
            <>
              <NumberPad
                onKey={(k) => setEntry((e) => (e.length < 12 ? [...e, Number(k)] : e))}
                onDelete={() => setEntry((e) => e.slice(0, -1))}
                onDone={() => entry.length > 0 && onSubmit(entry)}
              />
              <div className="row">
                {canReplay && (
                  <button type="button" className="btn ghost small" onClick={() => { setReplays((r) => r + 1); listen(); }}>
                    🔁 Hear it again
                  </button>
                )}
                <button type="button" className="btn go" disabled={entry.length === 0} onClick={() => onSubmit(entry)}>
                  Done ✓
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ---------- guide ----------

export const guide: SubtestGuide = {
  kidIntro: "Number Echo! I say some numbers, and you echo them back — sometimes the same way, sometimes backward, sometimes smallest to biggest.",
  howToPlay: [
    'Tap “I’m ready” and listen. The numbers won’t be shown!',
    'Then tap the numbers on the keypad.',
    'Tap Done when you have them all.',
  ],
  strategies: [
    { title: 'Chunk it', tip: 'Hear numbers in little groups of 2 or 3, like a phone number: 4-7 … 2-9 … 1.' },
    { title: 'Whisper practice', tip: 'Silently repeat the numbers in your head while you listen — keep the list “fresh”.' },
    { title: 'Whiteboard brain', tip: 'For backward, picture the numbers written on a board, then read them from right to left.' },
    { title: 'Smallest hunt', tip: 'For smallest-to-biggest, find the smallest first, then the next. Watch for a number said twice!' },
    { title: 'Don’t start too fast', tip: 'Wait until all the numbers are said before you start tapping.' },
  ],
  parentNotes:
    'Digit Span measures auditory working memory: holding and manipulating information you hear. Forward span reflects attention and storage; backward and sequencing add mental manipulation. It is one of the seven FSIQ subtests and half of the Working Memory Index.',
  commonMistakes: [
    'Starting to answer before the list ends and losing the tail.',
    'Saying backward lists in forward order.',
    'Dropping a repeated digit in sequencing.',
    'Getting anxious after a miss — each new list is a fresh start.',
  ],
  everydayActivities: [
    'Read phone numbers or license plates aloud and have your child echo them back (then backward!).',
    '“Grocery list” game: add one item each turn and recite the whole list.',
    'Simon-style clapping or color-pattern games.',
    'Ask your child to put three spoken numbers in order while walking or driving.',
  ],
};

export const DigitSpan: SubtestModule<DsPayload, DsResponse> = {
  id: 'DS',
  generate,
  score,
  Player,
  guide,
  variants: [
    { id: 'forward', label: 'Forward' },
    { id: 'backward', label: 'Backward' },
    { id: 'sequencing', label: 'Sequencing' },
  ],
};

export default DigitSpan;
