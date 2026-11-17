/**
 * Naming Speed Literacy ("Speedy Namer"). A page of familiar things named as fast as possible.
 * The sheet formats follow the real age structure (with original pictures):
 *  - age 6 and under: colour–object ("blue fish") and size–colour–object ("big red cat");
 *  - ages 7–8: size–colour–object and letters–numbers;
 *  - age 9 and up: letters–numbers only.
 * Each item is one format; when an age band has two formats the seed picks which (even seeds → the
 * first, odd → the second), so both come up across items. A known format id passed as `variant`
 * forces that format. Like the real task, an item is an untimed 6-picture sample page, then TWO short
 * trials of that format (about 20 pictures, or 40 letters/numbers), each reshuffled and timed.
 * Colours are only red, blue and yellow (no green), as on the real task, for colour-blind children.
 * Played aloud with a grown-up timer, or solo by tapping answer buttons (one tap per word: size,
 * colour, picture). Points = pictures named correctly over both trials; meta.durationSec = total real
 * seconds, which turns it into a per-minute rate. Tap mode also counts slips per attribute
 * (meta.sizeErrors / colorErrors / objectErrors).
 */
import type { GenerateRequest, Item, PlayerProps, ScoreOutcome, SubtestGuide, SubtestModule } from '../../core/types';
import { createRng } from '../../core/rng';
import { SHAPE_COLORS } from '../../ui/shapes';
import { balancedSequence } from '../CD/speedKit';
import {
  NAMING_LIMIT, NAMING_SAMPLE, NAMING_TRIALS, NamingPlayer, NamingReview, scoreNaming,
  type NamingConfig, type NamingOption, type NamingResponse, type SheetRef,
} from './naming';

export type NslFormat = 'color-object' | 'size-color-object' | 'letters-numbers';
export const NSL_FORMATS: readonly NslFormat[] = ['color-object', 'size-color-object', 'letters-numbers'];
/** Red, blue and yellow only — no green — as on the real task, so colour-blind children aren't penalised. */
export const NSL_COLORS = ['red', 'blue', 'yellow'] as const;
/** Size–colour–object sheets use the same three colours. */
export const NSL_SCO_COLORS = NSL_COLORS;
export const NSL_OBJECTS = ['cat', 'ball', 'car', 'fish'] as const;
export const NSL_SIZES = ['big', 'little'] as const;
export const NSL_CHARS = ['A', 'D', 'N', 'S', '3', '5', '7', '9'] as const;
export type NslColor = (typeof NSL_COLORS)[number];
export type NslObject = (typeof NSL_OBJECTS)[number];
export type NslSize = (typeof NSL_SIZES)[number];

export interface NslCell {
  size?: NslSize;
  color?: NslColor;
  object?: NslObject;
  char?: string;
}
export interface NslPayload {
  format: NslFormat;
  /** The timed trials: the same format twice, each its own shuffle. */
  trials: NslCell[][];
  /** The untimed sample page. */
  practice: NslCell[];
  cols: number;
}
export type NslResponse = NamingResponse;

/**
 * Size of ONE trial sheet per format (about 20 pictures, or 40 letters/numbers, as the real error
 * maximums imply). Picture sheets get 5 columns so little ones stay visible on phones.
 */
export const NSL_SHEET: Record<NslFormat, { items: number; cols: number }> = {
  'color-object': { items: 20, cols: 5 },
  'size-color-object': { items: 20, cols: 5 },
  'letters-numbers': { items: 40, cols: 8 },
};

/** The words of a name, in the order they are said (used to count slips per attribute). */
export function nslAttributes(format: NslFormat): string[] {
  if (format === 'letters-numbers') return [];
  return format === 'color-object' ? ['color', 'object'] : ['size', 'color', 'object'];
}

/** The formats given at an age, in the order the real test gives them. */
export function nslFormats(age: number): NslFormat[] {
  if (age < 7) return ['color-object', 'size-color-object'];
  if (age < 9) return ['size-color-object', 'letters-numbers'];
  return ['letters-numbers'];
}

/** The format for one item: a forced `variant`, else the age band's formats alternating by seed. */
export function nslFormat(age: number, seed: number, variant?: string): NslFormat {
  if (variant && (NSL_FORMATS as readonly string[]).includes(variant)) return variant as NslFormat;
  const formats = nslFormats(age);
  return formats[Math.abs(Math.floor(seed)) % formats.length];
}

/** The answer key for a cell: "blue fish", "big red cat" or the character. */
export function cellKey(c: NslCell): string {
  if (c.char !== undefined) return c.char;
  return [c.size, c.color, c.object].filter(Boolean).join(' ');
}

/** Every distinct picture of a format (combination index → cell). */
export function formatCells(format: NslFormat): NslCell[] {
  if (format === 'letters-numbers') return NSL_CHARS.map((char) => ({ char }));
  if (format === 'color-object') {
    return NSL_OBJECTS.flatMap((object) => NSL_COLORS.map((color) => ({ color, object })));
  }
  return NSL_OBJECTS.flatMap((object) => NSL_SCO_COLORS.flatMap((color) => NSL_SIZES.map((size) => ({ size, color, object }))));
}

export function generate(req: GenerateRequest): Item<NslPayload> {
  const format = nslFormat(req.age, req.seed, req.variant);
  const rng = createRng(req.seed);
  const cells = formatCells(format);
  const { items: count, cols } = NSL_SHEET[format];
  const trials = Array.from({ length: NAMING_TRIALS }, () => balancedSequence(rng.next, cells.length, count).map((i) => ({ ...cells[i] })));
  let practice: NslCell[];
  if (format === 'letters-numbers') {
    const half = NAMING_SAMPLE / 2;
    practice = rng.shuffle([...rng.sample(NSL_CHARS.slice(0, 4), half), ...rng.sample(NSL_CHARS.slice(4), half)]).map((char) => ({ char }));
  } else {
    practice = rng.sample(cells, NAMING_SAMPLE).map((c) => ({ ...c }));
    // Size sheets: make sure the sample shows both a big and a little picture.
    if (format === 'size-color-object' && practice.every((c) => c.size === practice[0].size)) {
      const last = practice.length - 1;
      practice[last] = { ...practice[last], size: practice[last].size === 'big' ? 'little' : 'big' };
    }
  }
  const total = trials.reduce((s, t) => s + t.length, 0);
  const age = Math.max(3, Math.min(18, req.age));
  const what = format === 'letters-numbers' ? 'letter or number' : format === 'color-object' ? 'colour and picture' : 'size, colour and picture';
  const speak = format === 'letters-numbers'
    ? 'Name each letter or number as fast as you can, row by row, from left to right.'
    : format === 'color-object'
      ? 'Say the colour and the picture, like blue fish, as fast as you can, row by row, from left to right.'
      : 'Say big or little, then the colour, then the picture, like big red cat, as fast as you can, row by row, from left to right.';
  return {
    id: `NSL:${format}:${req.seed}`,
    subtest: 'NSL',
    difficulty: age,
    seed: req.seed,
    payload: { format, trials, practice, cols },
    maxPoints: total,
    timeLimitSec: NAMING_LIMIT * NAMING_TRIALS,
    skills: [`nsl:${format}`],
    hints: [
      format === 'letters-numbers'
        ? 'Go row by row, left to right, like reading a book.'
        : format === 'color-object'
          ? 'Say it the same way every time: colour first, then the picture — “red cat”.'
          : 'Say it the same way every time: big or little, then colour, then picture — “little blue car”.',
      'While you name one, let your eyes slide to the next one.',
      'Keep a steady beat. If you slip, just keep going.',
    ],
    explanation: `You named each ${what} as fast as you could, on two short pages. Your score is how many you got right per minute.`,
    speak,
  };
}

export function score(item: Item<NslPayload>, response: NslResponse | null): ScoreOutcome {
  const p = item.payload;
  return scoreNaming(p.trials.map((t) => t.map(cellKey)), NAMING_LIMIT, response, nslAttributes(p.format));
}

// ---------- drawing ----------

const INK = '#1d2b2a';
const PAPER = '#fffdf6';

/** Simple original pictures in a 100×100 box. `fill` is the body colour. */
function ObjectShape({ object, fill }: { object: NslObject; fill: string }) {
  switch (object) {
    case 'cat':
      return (
        <>
          <polygon points="20,46 24,10 46,30" fill={fill} />
          <polygon points="80,46 76,10 54,30" fill={fill} />
          <circle cx={50} cy={57} r={31} fill={fill} />
          <circle cx={39} cy={53} r={4.5} fill={INK} stroke="none" />
          <circle cx={61} cy={53} r={4.5} fill={INK} stroke="none" />
          <path d="M45 64 L55 64 L50 70 Z" fill={INK} stroke="none" />
        </>
      );
    case 'ball':
      return (
        <>
          <circle cx={50} cy={50} r={38} fill={fill} />
          <path d="M14 40 Q50 64 86 40" fill="none" />
          <path d="M50 12 Q30 50 50 88" fill="none" />
        </>
      );
    case 'car':
      return (
        <>
          <path d="M8 68 L8 54 Q8 47 16 47 L28 47 L38 28 L66 28 L78 47 L86 47 Q92 47 92 55 L92 68 Z" fill={fill} />
          <path d="M42 34 L62 34 L70 47 L35 47 Z" fill="#e8f4ff" />
          <circle cx={28} cy={70} r={10} fill={INK} />
          <circle cx={72} cy={70} r={10} fill={INK} />
        </>
      );
    case 'fish':
      return (
        <>
          <polygon points="66,50 92,30 92,70" fill={fill} />
          <ellipse cx={42} cy={50} rx={34} ry={22} fill={fill} />
          <circle cx={26} cy={45} r={4.5} fill={INK} stroke="none" />
        </>
      );
  }
}

function ObjectArt({ object, color, size, px }: { object: NslObject; color?: NslColor; size?: NslSize; px?: number }) {
  const s = size === 'little' ? 0.5 : size === 'big' ? 1 : 0.9;
  return (
    <svg viewBox="0 0 100 100" width={px ?? '100%'} height={px ?? '100%'} aria-hidden style={{ display: 'block' }}>
      <g transform={`translate(50 50) scale(${s}) translate(-50 -50)`} stroke={INK} strokeWidth={4 / s} strokeLinejoin="round" strokeLinecap="round">
        <ObjectShape object={object} fill={color ? SHAPE_COLORS[color] : PAPER} />
      </g>
    </svg>
  );
}

function CellArt({ c }: { c: NslCell }) {
  if (c.char !== undefined) {
    return (
      <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden style={{ display: 'block' }}>
        <text x={50} y={54} textAnchor="middle" dominantBaseline="central" fontSize={70} fontWeight={800}
          fontFamily="'Andika', 'Verdana', sans-serif" fill={INK}>{c.char}</text>
      </svg>
    );
  }
  return c.object ? <ObjectArt object={c.object} color={c.color} size={c.size} /> : null;
}

const swatch = (c: NslColor): NamingOption => ({
  key: c,
  aria: c,
  label: <span style={{ display: 'block', width: 36, height: 36, borderRadius: 10, background: SHAPE_COLORS[c], border: '2px solid var(--ink)' }} />,
});
const colorOptions: NamingOption[] = NSL_COLORS.map(swatch);
const scoColorOptions: NamingOption[] = NSL_SCO_COLORS.map(swatch);
const objectOptions: NamingOption[] = NSL_OBJECTS.map((o) => ({ key: o, aria: o, label: <ObjectArt object={o} px={42} /> }));
const sizeOptions: NamingOption[] = NSL_SIZES.map((sz) => ({
  key: sz,
  aria: sz,
  label: (
    <svg viewBox="0 0 100 100" width={42} height={42} aria-hidden>
      <circle cx={50} cy={50} r={sz === 'big' ? 44 : 18} fill="#c9d3d1" stroke={INK} strokeWidth={6} />
    </svg>
  ),
}));
const charOptions: NamingOption[] = NSL_CHARS.map((ch) => ({
  key: ch,
  aria: ch,
  label: <span style={{ fontFamily: "'Andika', 'Verdana', sans-serif", fontWeight: 800, fontSize: 30 }}>{ch}</span>,
}));

/** Tap-mode answer groups for a format: one tap per word, in the order it is said. */
export function nslGroups(format: NslFormat): NamingOption[][] {
  if (format === 'letters-numbers') return [charOptions];
  if (format === 'color-object') return [colorOptions, objectOptions];
  return [sizeOptions, scoColorOptions, objectOptions];
}

const INTRO: Record<NslFormat, string> = {
  'color-object': 'Speedy Namer! Say the colour and the picture — like “blue fish” — row by row, as fast as you can.',
  'size-color-object': 'Speedy Namer! Say big or little, the colour, and the picture — like “big red cat” — row by row, as fast as you can.',
  'letters-numbers': 'Speedy Namer! A page of letters and numbers — name every one, row by row, as fast as you can.',
};

export function nslConfig(p: NslPayload): NamingConfig {
  const cellAt = (i: number, sheet: SheetRef) => (sheet === 'sample' ? p.practice[i] : p.trials[sheet]?.[i]);
  const groups = nslGroups(p.format);
  const labels: Record<string, string> = { size: 'size', color: 'colour', object: 'picture' };
  return {
    title: 'Speedy Namer',
    intro: INTRO[p.format],
    sheets: p.trials.map((t) => t.map(cellKey)),
    sampleExpected: p.practice.map(cellKey),
    cols: p.cols,
    renderCell: (i, sheet) => {
      const c = cellAt(i, sheet);
      return c ? <CellArt c={c} /> : null;
    },
    groupsFor: (i, sheet) => (cellAt(i, sheet) ? groups : []),
    say: (k) => k,
    limitSec: NAMING_LIMIT,
    attributeLabels: Object.fromEntries(nslAttributes(p.format).map((a) => [a, labels[a]])),
  };
}

export function Player({ item, onSubmit, reveal }: PlayerProps<NslPayload, NslResponse>) {
  const cfg = nslConfig(item.payload);
  if (reveal) return <NamingReview cfg={cfg} response={reveal.response} meta={reveal.outcome.meta ?? {}} />;
  return <NamingPlayer cfg={cfg} onSubmit={onSubmit} />;
}

// ---------- guide ----------

export const guide: SubtestGuide = {
  kidIntro: 'Speedy Namer! A page full of coloured pictures, or letters and numbers — how fast can you name them all?',
  howToPlay: [
    'Pick how to play: say them out loud with a grown-up timing, or tap the answers yourself.',
    'Start at the top-left. Go along each row, left to right, like reading.',
    'First a little practice page. Then two short timed pages of the same kind, with a breather in between.',
    'Name (or tap) every one as fast as you can — for pictures say the size (big or little) if asked, the colour, then the picture.',
    'A slip? Keep going — don’t go back.',
  ],
  strategies: [
    { title: 'Look one ahead', tip: 'While your mouth says this one, your eyes are already on the next one.' },
    { title: 'Read it like a book', tip: 'Left to right, then sweep down to the start of the next row. No skipping around.' },
    { title: 'Same order every time', tip: 'Always say it the same way: big or little, then colour, then picture — “little yellow ball”. A fixed order stops mix-ups.' },
    { title: 'Find your beat', tip: 'Say them to a steady rhythm, like a drum. A beat keeps you from stopping.' },
    { title: 'Let slips go', tip: 'If a wrong name pops out, don’t stop to fix it — fixing costs more time than the slip.' },
    { title: 'Short names win', tip: 'Use the quickest words: “big red cat”, not “a big red kitty cat”. Every extra word slows you down.' },
  ],
  parentNotes:
    'Naming Speed Literacy measures rapid automatized naming (RAN): how quickly a child can see familiar things and pull their names from memory. It is a complementary measure (not part of the IQ): together with Naming Speed Quantity it forms the Naming Speed Index (NSI), which is strongly linked to reading fluency — slow naming is a known early marker of reading difficulties, independent of intelligence. As on the real test, the sheet depends on age: at 6, colour–object (“blue fish”) and size–colour–object (“big red cat”) pages; at 7–8, size–colour–object and letter–number pages; from 9, letters and numbers only. Each round is a short untimed practice page, then two short timed pages (trials) of one kind — the score uses both; when two kinds fit the age they take turns. As on the real test the colours are only red, blue and yellow (no green), so colour vision doesn’t get in the way. For the truest measure use “Say them — grown-up times”; tap mode is a solo practice version that adds a matching step (one tap per word). Score = pictures named correctly per minute. In tap mode the review also shows which part of a name slipped (size, colour or picture).',
  commonMistakes: [
    'Stopping to self-correct after every slip.',
    'Losing the place at the end of a row.',
    'Leaving out a word (saying “red cat” when it was a little red cat), or swapping the order.',
    'Adding extra words (“a red circle one”) instead of short names.',
  ],
  everydayActivities: [
    'Flash-naming races: flip colour, letter or number cards and say each as fast as possible; try to beat your time.',
    '“Big or little?” — line up toys of two sizes and colours and name them in a row: “big blue car, little red ball…”.',
    'Name the colours of cars driving past, as quick as you can.',
    'Read rows of letters or numbers on licence plates, signs or a calendar out loud.',
    'Practise the alphabet and number lines in random order, not just A–Z.',
  ],
};

export const NamingSpeedLiteracy: SubtestModule<NslPayload, NslResponse> = {
  id: 'NSL',
  generate,
  score,
  Player,
  guide,
};

export default NamingSpeedLiteracy;
