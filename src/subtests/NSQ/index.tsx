/**
 * Naming Speed Quantity ("Quick Count"). Boxes hold 1–4 squares (under 7) or 1–5 squares (7+);
 * the child says (or taps) how many are in each box as fast as possible — seeing the amount at a
 * glance (subitizing) rather than counting one by one. Like the real task: an untimed 6-box sample
 * page, then TWO short timed trials of about 20 boxes each. Points = boxes named correctly over both
 * trials; meta.durationSec (total real seconds) turns it into a per-minute rate.
 */
import type { GenerateRequest, Item, PlayerProps, ScoreOutcome, SubtestGuide, SubtestModule } from '../../core/types';
import { createRng } from '../../core/rng';
import { balancedSequence } from '../CD/speedKit';
import {
  NAMING_LIMIT, NAMING_SAMPLE, NAMING_TRIALS, NamingPlayer, NamingReview, scoreNaming,
  type NamingConfig, type NamingOption, type NamingResponse,
} from '../NSL/naming';

export interface NsqCell {
  n: number;
  /** Positions in a 3×3 layout (0–8), one per square. */
  slots: number[];
}
export interface NsqPayload {
  maxN: number;
  /** The timed trials (same kind of sheet twice, each its own shuffle). */
  trials: NsqCell[][];
  /** The untimed sample page. */
  practice: NsqCell[];
  cols: number;
}
export type NsqResponse = NamingResponse;

export const NSQ_COLS = 5;
/** Boxes on ONE trial sheet. */
export const NSQ_ITEMS = 20;

export function nsqMax(age: number): number {
  return age < 7 ? 4 : 5;
}

function makeCell(next: () => number, n: number): NsqCell {
  const slots = Array.from({ length: 9 }, (_, i) => i);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return { n, slots: slots.slice(0, n).sort((a, b) => a - b) };
}

export function generate(req: GenerateRequest): Item<NsqPayload> {
  const rng = createRng(req.seed);
  const maxN = nsqMax(req.age);
  const trials = Array.from({ length: NAMING_TRIALS }, () => balancedSequence(rng.next, maxN, NSQ_ITEMS).map((k) => makeCell(rng.next, k + 1)));
  // Sample page: every amount at least once (6 boxes, 1..maxN), never the same amount twice in a row.
  const practice = balancedSequence(rng.next, maxN, NAMING_SAMPLE).map((k) => makeCell(rng.next, k + 1));
  const total = trials.reduce((s, t) => s + t.length, 0);
  const age = Math.max(3, Math.min(18, req.age));
  return {
    id: `NSQ:${maxN}:${req.seed}`,
    subtest: 'NSQ',
    difficulty: age,
    seed: req.seed,
    payload: { maxN, trials, practice, cols: NSQ_COLS },
    maxPoints: total,
    timeLimitSec: NAMING_LIMIT * NAMING_TRIALS,
    skills: ['nsq:subitize'],
    hints: [
      'Don’t count one by one — let your eyes “just know” small groups.',
      'Four or five? See a group of 2 and a group of 2 (or 3): that’s 4 (or 5).',
      'Go row by row and glance at the next box while you say this one.',
    ],
    explanation: `You said how many squares were in each box (1 to ${maxN}). Your score is how many you got right per minute.`,
    speak: 'Say how many squares are in each box, as fast as you can. Don’t count — just see it!',
  };
}

export function score(item: Item<NsqPayload>, response: NsqResponse | null): ScoreOutcome {
  return scoreNaming(item.payload.trials.map((t) => t.map((c) => String(c.n))), NAMING_LIMIT, response);
}

// ---------- drawing ----------

const SLOT = [22, 50, 78];

function Squares({ c }: { c: NsqCell }) {
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden style={{ display: 'block' }}>
      {c.slots.map((s) => (
        <rect key={s} x={SLOT[s % 3] - 10} y={SLOT[Math.floor(s / 3)] - 10} width={20} height={20} rx={3} fill="#1d2b2a" />
      ))}
    </svg>
  );
}

export function nsqConfig(p: NsqPayload): NamingConfig {
  const options: NamingOption[] = Array.from({ length: p.maxN }, (_, i) => ({
    key: String(i + 1),
    aria: String(i + 1),
    label: <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 30 }}>{i + 1}</span>,
  }));
  return {
    title: 'Quick Count',
    intro: `Quick Count! Each box has 1 to ${p.maxN} squares. Say how many — but don’t count, just SEE it!`,
    sheets: p.trials.map((t) => t.map((c) => String(c.n))),
    sampleExpected: p.practice.map((c) => String(c.n)),
    cols: p.cols,
    renderCell: (i, sheet) => {
      const c = sheet === 'sample' ? p.practice[i] : p.trials[sheet]?.[i];
      return c ? <Squares c={c} /> : null;
    },
    groupsFor: () => [options],
    say: (k) => k,
    limitSec: NAMING_LIMIT,
  };
}

export function Player({ item, onSubmit, reveal }: PlayerProps<NsqPayload, NsqResponse>) {
  const cfg = nsqConfig(item.payload);
  if (reveal) return <NamingReview cfg={cfg} response={reveal.response} meta={reveal.outcome.meta ?? {}} />;
  return <NamingPlayer cfg={cfg} onSubmit={onSubmit} />;
}

// ---------- guide ----------

export const guide: SubtestGuide = {
  kidIntro: 'Quick Count! How many squares are in each box? Say it super fast — no counting, just seeing!',
  howToPlay: [
    'Pick how to play: say the numbers out loud with a grown-up timing, or tap the number buttons yourself.',
    'Start at the top-left box and go along each row, left to right.',
    'Say (or tap) how many squares are in each box.',
    'First a little practice page, then two short timed pages — keep going until you reach the end!',
  ],
  strategies: [
    { title: 'See, don’t count', tip: 'Small groups of 1, 2 or 3 can be “just known” with one look. Trust your eyes!' },
    { title: 'Split it up', tip: 'For bigger groups, see 2 and 2 (that’s 4) or 2 and 3 (that’s 5) instead of counting each one.' },
    { title: 'Shape spotting', tip: 'Three squares often make a line or a triangle; four often make a box or a zig-zag. Learn the pictures numbers make.' },
    { title: 'Look one ahead', tip: 'While you say this number, your eyes are already on the next box.' },
    { title: 'Keep the beat', tip: 'Say the numbers in a steady rhythm. If one slips out wrong, keep going.' },
    { title: 'Glance at the gaps', tip: 'Sometimes the empty spaces are easier to see — a full row of three with one missing is a quick clue.' },
  ],
  parentNotes:
    'Naming Speed Quantity measures how quickly a child recognises small quantities and says the number — “subitizing” (seeing 1–4 items at a glance) plus rapid number naming. It is a complementary measure (not part of the IQ) that joins Naming Speed Literacy in the Naming Speed Index (NSI). Quick quantity naming is linked to early maths fluency and number sense. As on the real test, each round is a short practice page and then two short timed pages (trials); the score uses both. The truest version is spoken with a grown-up timing; tap mode is a solo practice variant. Score = boxes named correctly per minute.',
  commonMistakes: [
    'Counting every square one by one (slow) instead of seeing groups.',
    'Mixing up 4 and 5 when rushing.',
    'Stopping to fix a slip instead of moving on.',
    'Losing the place at the end of a row.',
  ],
  everydayActivities: [
    'Dice flash: roll one or two dice and shout the total as fast as you can (dot patterns build instant seeing).',
    'Dot-card or domino flashes: show a card for one second — how many?',
    'Ten-frame or egg-carton games: fill some spaces and say how many at a glance.',
    '“How many?” on walks: birds on a wire, people at a bus stop — answer without pointing.',
    'Board games with dice, moving pieces without counting each dot.',
  ],
};

export const NamingSpeedQuantity: SubtestModule<NsqPayload, NsqResponse> = {
  id: 'NSQ',
  generate,
  score,
  Player,
  guide,
};

export default NamingSpeedQuantity;
