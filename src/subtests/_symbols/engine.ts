/**
 * Shared engine for the three Symbol Translation subtests (IST immediate, DST delayed, RST recognition).
 *
 * CODE BOOKS. A variant "book-<n>" picks 16 of the 24 dictionary words and a teaching order
 * (the "curriculum"). The slot pattern of the curriculum is fixed so that every book can make the same
 * kinds of sentences at the same point:
 *   N N and Vi N the Vt A N is A N Vi on Vt N
 * (6 nouns, 2 + 2 verbs, 2 describing words, 4 function words). Which noun/verb/adjective fills each
 * slot is chosen by the book's own seeded RNG, so book-3 is always the same book.
 *
 * LEVELS. Difficulty comes from how many symbols are "known" (k = curriculum prefix) and sentence
 * length. An item at level (k, prevK) teaches curriculum[prevK..k) (1–3 symbols) and its sentence uses
 * only curriculum[0..k), always including at least one of the newest symbols.
 *
 * RESPONSES. On the real IST/DST the child reads the symbol string ALOUD; picking one of four written
 * sentences would mostly test reading. So IST/DST multi-symbol items are answered by BUILDING the
 * sentence from a tray of spoken word tiles (`payload.tiles`: every word of the sentence plus 2-4
 * distractor words from the code book, learned words first). The youngest single-symbol items keep
 * picture choices, and RST keeps 4 choices (read aloud, as the examiner does). A grown-up can instead
 * listen to the child read it aloud and mark it (`StAloudResponse`).
 *
 * SCORING. All 0/1 on the exact translation. The two sides of "and" may be swapped ("cat and fish" =
 * "fish and cat"), so choice distractors never do that and tile answers that do are credited.
 * Choice distractors change one word (a learned word of the same kind when possible) or swap two
 * words, so `meta.wordsWrong` (number of wrong slots) tells how close a wrong answer was.
 */
import { createRng, type Rng } from '../../core/rng';
import type { GenerateRequest, Item, ScoreOutcome, SubtestId } from '../../core/types';
import { DICTIONARY, WORDS, isFunctionWord, wordsByPos, type StPos } from './dictionary';

// ---------- code books ----------

export type Slot = StPos | 'the' | 'and' | 'is' | 'on';

export const CURRICULUM_SLOTS: Slot[] = ['N', 'N', 'and', 'Vi', 'N', 'the', 'Vt', 'A', 'N', 'is', 'A', 'N', 'Vi', 'on', 'Vt', 'N'];
export const BOOK_SIZE = CURRICULUM_SLOTS.length;

export interface CodeBook {
  id: string;
  /** All 16 words in teaching order. */
  words: string[];
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** "book-<n>" if given; any other variant string is hashed; otherwise the book comes from the seed. */
export function resolveBookId(variant: string | undefined, seed: number): string {
  const m = variant?.match(/^book-(\d+)$/);
  if (m) return `book-${Number(m[1])}`;
  if (variant) return `book-${hashString(variant) % 1000}`;
  return `book-${(seed >>> 0) % 1000}`;
}

export function codeBook(id: string): CodeBook {
  const n = Number(id.match(/^book-(\d+)$/)?.[1] ?? hashString(id) % 1000);
  const rng = createRng((Math.imul(n + 1, 0x9e3779b1) ^ 0x51ed27) >>> 0);
  const pools: Record<StPos, string[]> = {
    N: rng.shuffle(wordsByPos('N')),
    Vi: rng.shuffle(wordsByPos('Vi')),
    Vt: rng.shuffle(wordsByPos('Vt')),
    A: rng.shuffle(wordsByPos('A')),
    F: [],
  };
  const words = CURRICULUM_SLOTS.map((slot) => (slot in pools ? pools[slot as StPos].shift()! : slot));
  return { id, words };
}

// ---------- sentences ----------

/** Sentence patterns (2–7 symbols). Subjects are always singular so the verbs read naturally. */
export const TEMPLATES: Slot[][] = [
  ['N'],
  ['N', 'Vi'], ['A', 'N'],
  ['N', 'and', 'N'], ['the', 'N', 'Vi'], ['N', 'Vt', 'N'], ['A', 'N', 'Vi'],
  ['the', 'A', 'N', 'Vi'], ['the', 'N', 'is', 'A'], ['N', 'Vi', 'and', 'Vi'], ['N', 'Vt', 'A', 'N'],
  ['the', 'N', 'Vt', 'the', 'N'], ['the', 'A', 'N', 'is', 'A'], ['the', 'N', 'Vi', 'and', 'Vi'], ['the', 'N', 'is', 'on', 'N'],
  ['the', 'A', 'N', 'Vt', 'the', 'N'], ['the', 'N', 'Vt', 'the', 'A', 'N'], ['the', 'N', 'is', 'on', 'the', 'N'], ['the', 'N', 'is', 'A', 'and', 'A'],
  ['the', 'A', 'N', 'Vt', 'the', 'A', 'N'], ['the', 'A', 'N', 'is', 'on', 'the', 'N'], ['the', 'N', 'Vt', 'the', 'N', 'and', 'N'],
];

const isLiteral = (s: Slot) => s === 'the' || s === 'and' || s === 'is' || s === 'on';
const fits = (slot: Slot, word: string) => (isLiteral(slot) ? slot === word : WORDS[word]?.pos === slot);

function fillTemplate(t: Slot[], known: string[], fresh: string[], rng: Rng): string[] | null {
  if (t.some((s) => isLiteral(s) && !known.includes(s))) return null;
  for (let attempt = 0; attempt < 20; attempt++) {
    const out: (string | null)[] = t.map(() => null);
    // Anchor one of the newest symbols in a slot it fits, so every item uses what was just taught.
    if (fresh.length > 0) {
      const spots = rng.shuffle(fresh.flatMap((w) => t.map((s, i) => (fits(s, w) ? [i, w] as const : null)).filter((x) => x !== null)));
      if (spots.length === 0) return null;
      const [i, w] = spots[0]!;
      out[i] = w;
    }
    let ok = true;
    for (let i = 0; i < t.length && ok; i++) {
      if (out[i]) continue;
      if (isLiteral(t[i])) { out[i] = t[i]; continue; }
      const pool = known.filter((w) => WORDS[w].pos === t[i] && !out.includes(w));
      if (pool.length === 0) ok = false;
      else out[i] = rng.pick(pool);
    }
    if (ok) return out as string[];
  }
  return null;
}

/** A sentence of the requested length using only `known` words and at least one `fresh` word (if any). */
export function buildSentence(known: string[], fresh: string[], length: number, rng: Rng): string[] {
  // Try the exact length first, then the nearest shorter/longer lengths.
  const order = [0, -1, 1, -2, 2, -3, 3].map((d) => length + d).filter((l) => l >= 1 && l <= 7);
  for (const l of order) {
    for (const t of rng.shuffle(TEMPLATES.filter((x) => x.length === l))) {
      const s = fillTemplate(t, known, fresh, rng);
      if (s) return s;
    }
  }
  // Last resort (should not happen for curriculum levels): a single known noun.
  return [known.find((w) => WORDS[w].pos === 'N') ?? 'sun'];
}

/**
 * Canonical meaning of a word sequence: the words on each side of "and" are put in a fixed order, so
 * "cat and fish" and "fish and cat" (or "runs and jumps" / "jumps and runs") compare equal.
 */
export function canonicalMeaning(words: string[]): string {
  const out = words.slice();
  for (let i = 1; i < out.length - 1; i++) {
    if (out[i] === 'and' && out[i - 1] > out[i + 1]) [out[i - 1], out[i + 1]] = [out[i + 1], out[i - 1]];
  }
  return out.join(' ');
}

export function sentenceText(words: string[]): string {
  const s = words.join(' ');
  return words.length === 1 ? s : `${s.charAt(0).toUpperCase()}${s.slice(1)}.`;
}

// ---------- answer options ----------

export interface StOption {
  key: string;
  words: string[];
}

const keyOf = (words: string[]) => words.join(' ');

/** Words that may replace `word` in a distractor, in tiers: learned, then rest of the book, then dictionary. */
function replacements(word: string, singleWord: boolean, known: string[], book: CodeBook): string[][] {
  const pos = WORDS[word].pos;
  const same = (w: string) => {
    const p = WORDS[w].pos;
    if (singleWord && (pos === 'Vi' || pos === 'Vt')) return p === 'Vi' || p === 'Vt';
    return p === pos;
  };
  const all = DICTIONARY.map((d) => d.word).filter((w) => w !== word && same(w));
  return [
    all.filter((w) => known.includes(w)),
    all.filter((w) => !known.includes(w) && book.words.includes(w)),
    all.filter((w) => !book.words.includes(w)),
  ];
}

/**
 * Exactly one correct option plus three distinct wrong ones.
 * `lure` = prefer learned words as distractors (harder); otherwise prefer unlearned ones (easier).
 */
export function makeOptions(answer: string[], known: string[], book: CodeBook, rng: Rng, lure = true): StOption[] {
  const single = answer.length === 1;
  const tiers: string[][][] = [[], [], []];
  // Swaps of two same-kind words ("the fish sees the cat") — the most tempting near-miss.
  const swaps: string[][] = [];
  for (let i = 0; i < answer.length; i++) {
    for (let j = i + 1; j < answer.length; j++) {
      // Swapping the two sides of "and" keeps the meaning ("cat and fish" = "fish and cat"), so skip those.
      const between = answer.slice(i + 1, j);
      const acrossAnd = between.length > 0 && between.every((w) => w === 'and');
      if (answer[i] !== answer[j] && !acrossAnd && !isFunctionWord(answer[i]) && WORDS[answer[i]].pos === WORDS[answer[j]].pos) {
        const s = answer.slice();
        [s[i], s[j]] = [s[j], s[i]];
        swaps.push(s);
      }
    }
  }
  answer.forEach((w, i) => {
    if (!single && isFunctionWord(w)) return;
    replacements(w, single, known, book).forEach((pool, tier) => {
      for (const r of pool) {
        if (answer.includes(r)) continue;
        const s = answer.slice();
        s[i] = r;
        tiers[tier].push(s);
      }
    });
  });
  const ordered = lure
    ? [...rng.shuffle(swaps).slice(0, 1), ...rng.shuffle(tiers[0]), ...rng.shuffle(tiers[1]), ...rng.shuffle(tiers[2])]
    : [...rng.shuffle(tiers[2]), ...rng.shuffle(tiers[1]), ...rng.shuffle(tiers[0])];
  const picked: string[][] = [];
  const seen = new Set([keyOf(answer)]);
  const changedAt = (s: string[]) => s.findIndex((w, i) => w !== answer[i]);
  // First pass spreads the changes over different positions; second pass fills up.
  for (const pass of [0, 1]) {
    const usedPos = new Set(picked.map(changedAt));
    for (const s of ordered) {
      if (picked.length >= 3) break;
      if (seen.has(keyOf(s))) continue;
      if (pass === 0 && usedPos.has(changedAt(s))) continue;
      seen.add(keyOf(s));
      picked.push(s);
      usedPos.add(changedAt(s));
    }
  }
  return rng.shuffle([answer, ...picked]).map((words) => ({ key: keyOf(words), words }));
}

// ---------- word tiles (IST / DST) ----------

/** How many distractor tiles go in the tray: 2 for short rows, up to 4 for long ones. */
export function tileDistractorCount(length: number): number {
  return length <= 2 ? 2 : length <= 4 ? 3 : 4;
}

/**
 * The word-tile tray: every word of the sentence (repeats included) plus distractors from the code
 * book: learned words first, preferring the kinds of word the sentence uses, then the rest of the
 * book. A book has 16 words and a sentence at most 7, so there are always enough.
 */
export function makeTiles(symbols: string[], known: string[], book: CodeBook, rng: Rng): string[] {
  const inSentence = new Set(symbols);
  const kinds = new Set(symbols.map((w) => WORDS[w].pos));
  const rank = (pool: string[]) => [
    ...rng.shuffle(pool.filter((w) => kinds.has(WORDS[w].pos))),
    ...rng.shuffle(pool.filter((w) => !kinds.has(WORDS[w].pos))),
  ];
  const learned = known.filter((w) => !inSentence.has(w));
  const rest = book.words.filter((w) => !inSentence.has(w) && !known.includes(w));
  const distractors = [...rank(learned), ...rank(rest)].slice(0, tileDistractorCount(symbols.length));
  return rng.shuffle([...symbols, ...distractors]);
}

// ---------- items ----------

export type StTask = 'IST' | 'DST' | 'RST';

export interface StPayload {
  book: string;
  /** The symbol "sentence", as the words the symbols stand for, in order. */
  symbols: string[];
  /** Symbols taught on this item before the question (IST only). */
  teach: string[];
  /** Curriculum prefix the item assumes has been learned. */
  known: string[];
  options: StOption[];
  answer: string;
  /** Show emoji pictures on the options (youngest, noun-only items). */
  pictures: boolean;
  /**
   * IST/DST multi-symbol items: the shuffled word-tile tray the child builds the sentence from.
   * Empty for choice items (RST, and the picture items for single symbols).
   */
  tiles: string[];
}

/** A grown-up listened to the child read the symbols aloud and marked how many words were wrong. */
export interface StAloudResponse {
  aloud: true;
  wordsWrong: number;
}

/**
 * Choice items: the chosen option key. Tile items: the built sentence, words joined by spaces (the
 * same shape as an option key). Or a grown-up's mark for a read-aloud answer.
 */
export type StResponse = string | StAloudResponse;

export interface SentenceLevel {
  k: number;
  prevK: number;
  length: number;
  difficulty: number;
}

/** IST: the symbols were just taught. */
export const IST_LEVELS: SentenceLevel[] = [
  { k: 1, prevK: 0, length: 1, difficulty: 3.5 },
  { k: 2, prevK: 1, length: 1, difficulty: 4.3 },
  { k: 3, prevK: 2, length: 3, difficulty: 5.0 },
  { k: 5, prevK: 3, length: 2, difficulty: 5.8 },
  { k: 6, prevK: 5, length: 3, difficulty: 6.6 },
  { k: 7, prevK: 6, length: 3, difficulty: 7.4 },
  { k: 8, prevK: 7, length: 4, difficulty: 8.2 },
  { k: 9, prevK: 8, length: 5, difficulty: 9.0 },
  { k: 10, prevK: 9, length: 4, difficulty: 10.0 },
  { k: 11, prevK: 10, length: 5, difficulty: 11.0 },
  { k: 12, prevK: 11, length: 6, difficulty: 12.2 },
  { k: 14, prevK: 12, length: 6, difficulty: 13.4 },
  { k: 15, prevK: 14, length: 7, difficulty: 14.8 },
  { k: 16, prevK: 15, length: 7, difficulty: 16.3 },
];

/** DST: same sentences, recalled later with no teaching — about 0.7 years harder at each step. */
export const DST_LEVELS: SentenceLevel[] = IST_LEVELS.map((l) => ({ ...l, difficulty: Math.round((l.difficulty + 0.7) * 10) / 10 }));

export interface RstLevel {
  k: number;
  length: number;
  /** Kinds of word the single symbol may be (single-symbol levels). */
  focus?: StPos[];
  lure: boolean;
  pictures: boolean;
  difficulty: number;
}

/** RST: single symbols first (nouns → verbs/describing words → function words), then short phrases. */
export const RST_LEVELS: RstLevel[] = [
  { k: 3, length: 1, focus: ['N'], lure: false, pictures: true, difficulty: 4.0 },
  { k: 5, length: 1, focus: ['N'], lure: true, pictures: true, difficulty: 5.0 },
  { k: 8, length: 1, focus: ['N', 'Vi', 'Vt'], lure: true, pictures: false, difficulty: 6.2 },
  { k: 11, length: 1, focus: ['Vi', 'Vt', 'A'], lure: true, pictures: false, difficulty: 7.4 },
  { k: 14, length: 1, focus: ['F'], lure: true, pictures: false, difficulty: 8.6 },
  { k: 9, length: 2, lure: true, pictures: false, difficulty: 10.0 },
  { k: 12, length: 3, lure: true, pictures: false, difficulty: 11.5 },
  { k: 14, length: 4, lure: true, pictures: false, difficulty: 13.0 },
  { k: 16, length: 5, lure: true, pictures: false, difficulty: 14.6 },
  { k: 16, length: 6, lure: true, pictures: false, difficulty: 16.2 },
];

export function nearestLevel<T extends { difficulty: number }>(levels: T[], difficulty: number): { level: T; index: number } {
  let index = 0;
  levels.forEach((l, i) => {
    if (Math.abs(l.difficulty - difficulty) < Math.abs(levels[index].difficulty - difficulty)) index = i;
  });
  return { level: levels[index], index };
}

const SKILL_PREFIX: Record<StTask, string> = { IST: 'st:learn', DST: 'st:delayed', RST: 'st:recognition' };

function teachingText(task: StTask, symbols: string[], answerWords: string[]): Pick<Item, 'hints' | 'explanation' | 'steps' | 'speak' | 'skills'> {
  const text = sentenceText(answerWords);
  const single = symbols.length === 1;
  const skills = [SKILL_PREFIX[task]];  if (symbols.some(isFunctionWord)) skills.push('st:function-words');
  const first = WORDS[symbols[0]];
  return {
    skills,
    hints: single
      ? [
          `Think of the picture-story for ${first.looks}.`,
          `${first.story}`,
        ]
      : [
          `There are ${symbols.length} symbols — say a word for each one, left to right.`,
          symbols.some(isFunctionWord)
            ? `Don’t skip the little words: ${[...new Set(symbols.filter(isFunctionWord))].map((w) => `${WORDS[w].looks} = “${w}”`).join(', ')}.`
            : `The last symbol (${WORDS[symbols[symbols.length - 1]].looks}) means “${symbols[symbols.length - 1]}”.`,
          `The first symbol (${first.looks}) means “${first.word}”.`,
        ],
    explanation: single
      ? `${first.looks.charAt(0).toUpperCase()}${first.looks.slice(1)} means “${first.word}”.`
      : `The symbols say: “${text}”`,
    steps: single ? undefined : symbols.map((w) => `${WORDS[w].looks} → ${w}`),
    speak:
      task === 'IST'
        ? (single ? 'Learn the new symbol. Then find the word it stands for.' : 'Learn the new symbols. Then read the symbols: tap a word for each one.')
        : task === 'DST'
          ? (single ? 'Remember this symbol? Pick the word it stands for.' : 'Remember the symbols you learned? Read them: tap a word for each one.')
          : (single ? 'Which word goes with this symbol?' : 'Which words go with these symbols?'),
  };
}

export function generateSt(task: StTask, req: GenerateRequest): Item<StPayload> {
  const bookId = resolveBookId(req.variant, req.seed);
  const book = codeBook(bookId);
  const rng = createRng((req.seed ^ 0x6a09e667 ^ (task === 'IST' ? 1 : task === 'DST' ? 2 : 3)) >>> 0);
  let symbols: string[];
  let known: string[];
  let teach: string[] = [];
  let lure = true;
  let pictures: boolean;
  let difficulty: number;
  let levelIndex: number;

  if (task === 'RST') {
    const { level, index } = nearestLevel(RST_LEVELS, req.difficulty);
    known = book.words.slice(0, level.k);
    if (level.length === 1) {
      const pool = known.filter((w) => level.focus!.includes(WORDS[w].pos));
      symbols = [rng.pick(pool)];
    } else {
      symbols = buildSentence(known, [], level.length, rng);
    }
    lure = level.lure;
    pictures = level.pictures;
    difficulty = level.difficulty;
    levelIndex = index;
  } else {
    const levels = task === 'IST' ? IST_LEVELS : DST_LEVELS;
    const { level, index } = nearestLevel(levels, req.difficulty);
    known = book.words.slice(0, level.k);
    const fresh = book.words.slice(level.prevK, level.k);
    if (task === 'IST') teach = fresh;
    // Single-symbol items are always about a noun, so they can use picture answers.
    symbols = buildSentence(known, level.length === 1 ? fresh.filter((w) => WORDS[w].pos === 'N') : fresh, level.length, rng);
    lure = level.k > 1;
    pictures = level.length === 1;
    difficulty = level.difficulty;
    levelIndex = index;
  }

  const options = makeOptions(symbols, known, book, rng, lure);
  // Tiles use their own random stream so the choice options stay exactly as before.
  const tileRng = createRng((req.seed ^ 0x3c6ef372 ^ (task === 'IST' ? 1 : 2)) >>> 0);
  const tiles = task !== 'RST' && !pictures ? makeTiles(symbols, known, book, tileRng) : [];
  return {
    id: `${task}:${bookId}:${levelIndex}:${req.seed}`,
    subtest: task as SubtestId,
    difficulty,
    seed: req.seed,
    payload: { book: bookId, symbols, teach, known, options, answer: keyOf(symbols), pictures, tiles },
    maxPoints: 1,
    ...teachingText(task, symbols, symbols),
  };
}

export const isAloud = (r: StResponse | null | undefined): r is StAloudResponse =>
  typeof r === 'object' && r !== null && r.aloud === true;

export function scoreSt(item: Item<StPayload>, response: StResponse | null): ScoreOutcome {
  const { symbols, options, answer, tiles } = item.payload;
  const meta: Record<string, number> = { length: symbols.length, wordsWrong: symbols.length };
  if (response == null) return { points: 0, correct: false, meta };

  if (isAloud(response)) {
    const wrong = Math.max(0, Math.min(symbols.length, Math.round(Number(response.wordsWrong) || 0)));
    meta.wordsWrong = wrong;
    meta.aloud = 1;
    return { points: wrong === 0 ? 1 : 0, correct: wrong === 0, meta };
  }
  if (typeof response !== 'string') return { points: 0, correct: false, meta };

  let words: string[];
  if (tiles.length > 0) {
    // Built from tiles: compared slot by slot (a missing word counts as wrong).
    words = response.split(' ').filter(Boolean);
  } else {
    const chosen = options.find((o) => o.key === response);
    if (!chosen) return { points: 0, correct: false, meta };
    words = chosen.words;
  }
  const equivalent = words.length === symbols.length && canonicalMeaning(words) === canonicalMeaning(symbols);
  const correct = response === answer || (tiles.length > 0 && equivalent);
  const wrong = correct ? 0 : symbols.filter((w, i) => words[i] !== w).length + Math.max(0, words.length - symbols.length);
  meta.wordsWrong = wrong;
  let feedback: string | undefined;
  if (!correct && symbols.length > 1) {
    const sameWords = words.slice().sort().join() === symbols.slice().sort().join();
    if (sameWords) feedback = 'You knew every word — but two of them were swapped. Read the symbols left to right.';
    else if (wrong === 1) feedback = 'So close — only one word was different. Check each symbol one at a time.';
  }
  return { points: correct ? 1 : 0, correct, meta, feedback };
}
