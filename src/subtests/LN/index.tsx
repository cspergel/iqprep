/**
 * Letter–Number Sequencing ("Mix & Sort"). A mixed list of letters and numbers is read aloud at about
 * one per second; the child gives the numbers from smallest to biggest, then the letters in ABC order
 * (heard "B 3 A 1" → "1 3 A B").
 *
 * Letter set — chosen so every letter is easy to hear and none rhymes with a number or another
 * letter in the same list:
 *   A C D F H K L M R T X Y   (never I, O, Q, W, U, N, S, E, B, G, P, V, Z, J)
 *   - "ay" letters A, K rhyme with 8 → at most one per list, and never with the digit 8.
 *   - "ee" letters C, D, T rhyme with 3 → at most one per list, and never with the digit 3.
 *   - F, H, L, M, R, X, Y have no rhyming partner in the set (M is kept, N is dropped; F is kept, S dropped).
 * Numbers are 1–9. No token repeats within a list.
 *
 * Difficulty model (age-equivalent, 50% pass point):
 *   numbers only ×2 ≈ 4.5 · numbers only ×3 ≈ 5.4   (the "qualifying-style" young items)
 *   mixed span 2 ≈ 6 · 3 ≈ 7.5 · 4 ≈ 9.5 · 5 ≈ 12 · 6 ≈ 14.5 · 7 ≈ 16.5 · 8 ≈ 17.8
 *
 * Scoring is exact: numbers first (ascending), then letters (alphabetical). Note the published test
 * also credits "letters first" — here that gets 0 with a specific tip, so practice teaches one clear rule.
 */
import { useEffect, useRef, useState } from 'react';
import { createRng } from '../../core/rng';
import { speakSequence, speechSupported, stopSpeaking } from '../../core/speech';
import type { GenerateRequest, Item, PlayerProps, ScoreOutcome, SubtestGuide, SubtestModule } from '../../core/types';
import { NumberPad, PipSays } from '../../ui/kit';

export type LnKind = 'numbers' | 'mixed';
export interface LnPayload {
  kind: LnKind;
  /** Tokens in the order they are read aloud, e.g. ['B', '3', 'A', '1']. */
  tokens: string[];
}
export type LnResponse = string[];

export const LN_LETTERS = ['A', 'C', 'D', 'F', 'H', 'K', 'L', 'M', 'R', 'T', 'X', 'Y'] as const;
export const LN_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
const AY_GROUP = new Set(['A', 'K']);
const EE_GROUP = new Set(['C', 'D', 'T']);

export const isDigit = (t: string) => /^[0-9]$/.test(t);

// ---------- difficulty model ----------

export interface LnLevel {
  kind: LnKind;
  span: number;
  difficulty: number;
}

export const LN_LEVELS: LnLevel[] = [
  { kind: 'numbers', span: 2, difficulty: 4.5 },
  { kind: 'numbers', span: 3, difficulty: 5.4 },
  { kind: 'mixed', span: 2, difficulty: 6 },
  { kind: 'mixed', span: 3, difficulty: 7.5 },
  { kind: 'mixed', span: 4, difficulty: 9.5 },
  { kind: 'mixed', span: 5, difficulty: 12 },
  { kind: 'mixed', span: 6, difficulty: 14.5 },
  { kind: 'mixed', span: 7, difficulty: 16.5 },
  { kind: 'mixed', span: 8, difficulty: 17.8 },
];

export function levelForDifficulty(difficulty: number): LnLevel {
  let best = LN_LEVELS[0];
  for (const lvl of LN_LEVELS) {
    if (Math.abs(lvl.difficulty - difficulty) < Math.abs(best.difficulty - difficulty)) best = lvl;
  }
  return best;
}

export function expectedAnswer(p: LnPayload): string[] {
  const nums = p.tokens.filter(isDigit).sort((a, b) => Number(a) - Number(b));
  const lets = p.tokens.filter((t) => !isDigit(t)).sort();
  return [...nums, ...lets];
}

/** True when the list breaks a hearing rule (repeat, two rhyming letters, a letter rhyming with a digit). */
export function hasSoundClash(tokens: string[]): boolean {
  if (new Set(tokens).size !== tokens.length) return true;
  const ay = tokens.filter((t) => AY_GROUP.has(t)).length;
  const ee = tokens.filter((t) => EE_GROUP.has(t)).length;
  if (ay > 1 || ee > 1) return true;
  if (ay > 0 && tokens.includes('8')) return true;
  if (ee > 0 && tokens.includes('3')) return true;
  return false;
}

function makeTokens(kind: LnKind, span: number, seed: number): string[] {
  const rng = createRng(seed);
  for (let attempt = 0; attempt < 300; attempt++) {
    let tokens: string[];
    if (kind === 'numbers') {
      tokens = rng.sample(LN_DIGITS, span);
    } else {
      const letterCount = span === 2 ? 1 : rng.chance(0.5) ? Math.floor(span / 2) : Math.ceil(span / 2);
      const digits = rng.sample(LN_DIGITS, span - letterCount);
      let pool = LN_LETTERS.filter((l) => !(AY_GROUP.has(l) && digits.includes('8')) && !(EE_GROUP.has(l) && digits.includes('3')));
      const letters: string[] = [];
      while (letters.length < letterCount) {
        const l = rng.pick(pool);
        letters.push(l);
        pool = pool.filter((x) => x !== l && !(AY_GROUP.has(l) && AY_GROUP.has(x)) && !(EE_GROUP.has(l) && EE_GROUP.has(x)));
      }
      tokens = rng.shuffle([...digits, ...letters]);
    }
    if (hasSoundClash(tokens)) continue;
    const nums = tokens.filter(isDigit);
    const lets = tokens.filter((t) => !isDigit(t));
    const numsSorted = nums.join() === nums.slice().sort((a, b) => Number(a) - Number(b)).join();
    const letsSorted = lets.join() === lets.slice().sort().join();
    // Never hand out a list that is already in answer order; mixed lists always need some sorting.
    if (tokens.join() === expectedAnswer({ kind, tokens }).join()) continue;
    // Letters-first sorted order is also accepted, so don't present a list already in that order either.
    {
      const ans = expectedAnswer({ kind, tokens });
      const lf = [...ans.filter((t) => !isDigit(t)), ...ans.filter(isDigit)];
      if (tokens.join() === lf.join()) continue;
    }
    if (kind === 'mixed' && span >= 3 && numsSorted && letsSorted) continue;
    // Avoid easy counting runs like 3-4-5 in the heard order.
    let run = false;
    for (let i = 2; i < tokens.length; i++) {
      const [a, b, c] = [tokens[i - 2], tokens[i - 1], tokens[i]].map(Number);
      if (!Number.isNaN(a + b + c) && b - a === c - b && Math.abs(b - a) === 1) run = true;
    }
    if (!run) return tokens;
  }
  return kind === 'numbers' ? ['3', '1', '2'].slice(0, span) : ['M', '2'];
}

export function generate(req: GenerateRequest): Item<LnPayload> {
  const level = levelForDifficulty(req.difficulty);
  const { kind, span } = level;
  const tokens = makeTokens(kind, span, req.seed ^ 0x1f3d5b79);
  const answer = expectedAnswer({ kind, tokens });
  const nums = answer.filter(isDigit);
  const lets = answer.filter((t) => !isDigit(t));
  const skills = [`ln:span-${span}`];
  if (kind === 'mixed') skills.push('ln:numbers-first');
  if (nums.length >= 2) skills.push('ln:numbers-sort');
  if (lets.length >= 2) skills.push('ln:letters-sort');
  return {
    id: `LN:${kind}:${span}:${req.seed}`,
    subtest: 'LN',
    difficulty: level.difficulty,
    seed: req.seed,
    payload: { kind, tokens },
    maxPoints: 1,
    skills,
    hints:
      kind === 'numbers'
        ? ['Hunt for the smallest number first.', `Then the next smallest. The first one is ${nums[0]}.`]
        : [
            'Numbers go first, from smallest to biggest. Then the letters, in ABC order.',
            'While you listen, put the numbers in one “pocket” and the letters in another.',
            `There were ${nums.length} number${nums.length > 1 ? 's' : ''} and ${lets.length} letter${lets.length > 1 ? 's' : ''}.`,
          ],
    explanation:
      kind === 'numbers'
        ? `You heard ${tokens.join(' - ')}. Smallest to biggest: ${answer.join(' - ')}.`
        : `You heard ${tokens.join(' - ')}. Numbers first: ${nums.join(' - ')}. Then letters: ${lets.join(' - ')}.`,
    steps:
      kind === 'numbers'
        ? [`Heard: ${tokens.join(' ')}`, `Smallest to biggest: ${answer.join(' ')}`]
        : [`Heard: ${tokens.join(' ')}`, `Numbers, smallest first: ${nums.join(' ')}`, `Letters, ABC order: ${lets.join(' ')}`, `Answer: ${answer.join(' ')}`],
    speak:
      kind === 'numbers'
        ? 'Listen to the numbers. Then tell me them from the smallest to the biggest.'
        : 'Listen to the numbers and letters. Tell me the numbers first, smallest to biggest. Then the letters in A B C order.',
  };
}

export function score(item: Item<LnPayload>, response: LnResponse | null): ScoreOutcome {
  const expected = expectedAnswer(item.payload);
  const span = item.payload.tokens.length;
  if (!response || response.length === 0) return { points: 0, correct: false, meta: { span, recalled: 0, lettersFirst: 0 } };
  const recalled = expected.filter((t) => response.includes(t)).length;
  const nums = expected.filter(isDigit);
  const lets = expected.filter((t) => !isDigit(t));
  // The real subtest credits a correctly sorted response even when the letters come first.
  const lettersFirst = nums.length > 0 && lets.length > 0 && response.join() === [...lets, ...nums].join();
  const correct = lettersFirst || (response.length === expected.length && response.every((t, i) => t === expected[i]));
  const sameItems = response.length === expected.length && response.slice().sort().join() === expected.slice().sort().join();
  let feedback: string | undefined;
  if (lettersFirst) feedback = 'You sorted them perfectly — that counts! Saying the numbers first, then the letters, is the usual way.';
  else if (!correct && response.join() === item.payload.tokens.join()) feedback = 'You said them in the order you heard them. Next time, sort them: numbers smallest to biggest, then letters A-B-C.';
  else if (!correct && sameItems) feedback = 'You remembered every one! Just the order was off — numbers first (smallest to biggest), then letters in ABC order.';
  else if (!correct && recalled > 0) feedback = `You remembered ${recalled} of the ${span}. Keep listening right to the end!`;
  return { points: correct ? 1 : 0, correct, meta: { span, recalled, lettersFirst: lettersFirst ? 1 : 0 }, feedback };
}

// ---------- Player ----------

type Phase = 'ready' | 'listening' | 'answer';

export function Player({ item, mode, onSubmit, reveal, hintLevel }: PlayerProps<LnPayload, LnResponse>) {
  const { kind, tokens } = item.payload;
  const [phase, setPhase] = useState<Phase>(reveal ? 'answer' : 'ready');
  const [entry, setEntry] = useState<string[]>([]);
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
    // Audio is the task, so speakSequence always speaks (it ignores the read-aloud setting).
    await speakSequence(tokens, 1000, setPulse, () => cancelled.current);
    if (noSpeech) await new Promise((r) => setTimeout(r, 400));
    setPulse(-1);
    if (!cancelled.current) setPhase('answer');
  };

  const add = (t: string) => setEntry((e) => (e.includes(t) || e.length >= 10 ? e : [...e, t]));
  const shown = reveal ? (reveal.response ?? []) : entry;
  const expected = expectedAnswer(item.payload);
  const canReplay = mode === 'tutor' && hintLevel >= 1 && replays < 1 && phase === 'answer' && !reveal;

  return (
    <div className="stage">
      <div className="prompt">{kind === 'numbers' ? 'Smallest to biggest' : 'Numbers first, then letters'}</div>

      {phase === 'ready' && (
        <div className="stack" style={{ alignItems: 'center' }}>
          <PipSays mood="wave">
            {kind === 'numbers'
              ? 'I’ll say some numbers. Then tap them from smallest to biggest!'
              : 'I’ll say numbers and letters all mixed up. Tap the numbers first (smallest to biggest), then the letters in ABC order!'}
          </PipSays>
          <button type="button" className="btn primary big" onClick={listen}>👂 I'm ready</button>
        </div>
      )}

      {phase === 'listening' && (
        <div className="stack" style={{ alignItems: 'center' }} aria-live="polite">
          <div style={{ fontSize: 64 }} className={pulse >= 0 ? 'wiggle' : ''}>👂</div>
          <div className="row" style={{ justifyContent: 'center' }}>
            {tokens.map((t, i) => (
              <span
                key={i}
                style={{
                  width: noSpeech ? 54 : 22, height: noSpeech ? 54 : 22, borderRadius: noSpeech ? 12 : '50%',
                  border: '3px solid var(--ink)', display: 'grid', placeItems: 'center',
                  background: i <= pulse ? 'var(--lake)' : 'var(--card)', color: '#fff',
                  fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, transition: 'background .2s',
                }}
              >
                {noSpeech && i === pulse ? t : ''}
              </span>
            ))}
          </div>
          <p className="muted">{noSpeech ? 'Watch closely…' : 'Listening…'}</p>
        </div>
      )}

      {phase === 'answer' && (
        <>
          {kind === 'mixed' && hintLevel >= 1 && !reveal && (
            <div className="hint small center">🔢 Numbers first (small → big), then 🔤 letters (A → Z)</div>
          )}
          <div className="entry" aria-live="polite" aria-label="Your answer">
            {shown.length === 0 && !reveal && <span className="muted small">tap numbers, then letters</span>}
            {shown.map((t, i) => (
              <span key={i} style={{ color: reveal ? (expected[i] === t ? 'var(--good)' : 'var(--bad)') : undefined }}>{t}</span>
            ))}
          </div>
          {reveal ? (
            <div className="card flat tint center">
              <div className="small muted">Right answer</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 800, letterSpacing: '.1em' }}>{expected.join(' ')}</div>
            </div>
          ) : (
            <>
              <div className="row" style={{ justifyContent: 'center', alignItems: 'flex-start', gap: 20 }}>
                <div className="stack" style={{ alignItems: 'center', gap: 6 }} aria-label="Number keys">
                  <span className="chip">🔢 Numbers</span>
                  <NumberPad keys={[...LN_DIGITS]} onKey={add} />
                </div>
                {kind === 'mixed' && (
                  <div className="stack" style={{ alignItems: 'center', gap: 6, flex: '1 1 260px', maxWidth: 380 }} aria-label="Letter keys">
                    <span className="chip">🔤 Letters</span>
                    <NumberPad keys={[...LN_LETTERS]} onKey={add} />
                  </div>
                )}
              </div>
              <div className="row" style={{ justifyContent: 'center' }}>
                {canReplay && (
                  <button type="button" className="btn ghost small" onClick={() => { setReplays((r) => r + 1); listen(); }}>
                    🔁 Hear it again
                  </button>
                )}
                <button type="button" className="btn ghost small" disabled={entry.length === 0} onClick={() => setEntry((e) => e.slice(0, -1))}>
                  ⌫ Undo
                </button>
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
  kidIntro: 'Mix & Sort! I say numbers and letters all jumbled up. You sort them: numbers first, smallest to biggest, then letters in ABC order.',
  howToPlay: [
    'Tap “I’m ready” and listen. Nothing is shown — just listen!',
    'Tap the numbers first, from smallest to biggest.',
    'Then tap the letters in ABC order.',
    'Use Undo if you tap the wrong one, then tap Done.',
  ],
  strategies: [
    { title: 'Two pockets', tip: 'While you listen, drop numbers in one “pocket” and letters in another. Then empty the number pocket first.' },
    { title: 'Sort as you go', tip: 'Keep a sorted line in your head and slide each new one into its place as you hear it: “3… 1-3… 1-3-A…”.' },
    { title: 'Echo, then sort', tip: 'Just remember the list exactly as you heard it, by whispering it in your head. Sort it only after the last one is said.' },
    { title: 'Number line', tip: 'Picture a number line from 1 to 9. Light up each number you hear, then read the lit-up ones from left to right.' },
    { title: 'Alphabet song', tip: 'For the letters, softly run through the ABC song and stop at each letter you heard.' },
    { title: 'Whiteboard', tip: 'Picture each one being written on a whiteboard: numbers on the top row, letters on the bottom row.' },
  ],
  parentNotes:
    'Letter–Number Sequencing measures auditory working memory with mental manipulation: holding a spoken list while re-ordering it by two different rules (number order and alphabetical order). It is a secondary Working Memory subtest and, with Digit Span, forms the Auditory Working Memory Index. Young children start with “qualifying-style” items (sort 2–3 numbers, or one number and one letter). The letters used are chosen so none sound alike or rhyme with a number.',
  commonMistakes: [
    'Saying the letters before the numbers.',
    'Repeating the list in the order it was heard instead of sorting it.',
    'Losing the last item or two because sorting started too early.',
    'Mixing up the ABC order of letters that are far apart (e.g., R and M).',
  ],
  everydayActivities: [
    'Say three numbers and two letters in the car (“7, K, 2, A, 5”) and take turns sorting them aloud.',
    'Play “Grocery sort”: list a few items and prices, then repeat the prices from cheapest to dearest.',
    'Sing the alphabet song and practise finding where a letter lives (“Is M before or after R?”).',
    'Card game: deal 4 number cards and 2 letter cards face up for 5 seconds, flip them, and say them back sorted.',
  ],
};

export const LetterNumberSequencing: SubtestModule<LnPayload, LnResponse> = {
  id: 'LN',
  generate,
  score,
  Player,
  guide,
};

export default LetterNumberSequencing;
