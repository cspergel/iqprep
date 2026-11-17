/**
 * Immediate Symbol Translation ("Symbol Stories"). Each item teaches 1–3 new symbols on big cards,
 * then shows a row of symbols (only ones learned so far) and the child "reads" it by building the
 * sentence from spoken word tiles — a slot under each symbol, filled left to right (the real task is
 * read aloud, so this keeps the reading load low and makes it recall, not recognition). The youngest
 * single-symbol items use picture choices. "Grown-up listens" lets the child read it aloud while a
 * grown-up marks ✓ / ✗.
 *
 * Shared engine, dictionary, glyphs and difficulty tables live in ../_symbols (see engine.ts).
 * Pass the same variant ("book-<n>") to IST, DST and RST so they share one code book.
 *
 * Difficulty (age-equivalent): symbols known k / sentence length L
 *   k1 L1 3.5 · k2 L1 4.3 · k3 L3 5.0 · k5 L2 5.8 · k6 L3 6.6 · k7 L3 7.4 · k8 L4 8.2 · k9 L5 9.0
 *   k10 L4 10 · k11 L5 11 · k12 L6 12.2 · k14 L6 13.4 · k15 L7 14.8 · k16 L7 16.3
 * Scoring: 0/1 (exact sentence; the two sides of "and" may be swapped). meta.wordsWrong = wrong slots.
 */
import type { GenerateRequest, Item, PlayerProps, ScoreOutcome, SubtestGuide, SubtestModule } from '../../core/types';
import { generateSt, scoreSt, type StPayload, type StResponse } from '../_symbols/engine';
import { SymbolPlayer } from '../_symbols/SymbolPlayer';

export type { StPayload, StResponse };

export function generate(req: GenerateRequest): Item<StPayload> {
  return generateSt('IST', req);
}

export function score(item: Item<StPayload>, response: StResponse | null): ScoreOutcome {
  return scoreSt(item, response);
}

export function Player(props: PlayerProps<StPayload, StResponse>) {
  return <SymbolPlayer task="IST" {...props} />;
}

export const guide: SubtestGuide = {
  kidIntro: 'Symbol Stories! Learn secret picture-symbols that stand for words — then read a whole symbol sentence!',
  howToPlay: [
    'First you meet new symbols. Tap each one to hear its word.',
    'Tap “Got it!” when you’re ready.',
    'Then read the row of symbols: tap a word tile for each symbol, left to right.',
    'Tap a word to put it in. Hold a word to hear it. Tap a word in a slot to take it out.',
    'Grown-ups can switch on “Grown-up listens” so you read it out loud instead.',
  ],
  strategies: [
    { title: 'Picture-story', tip: 'Make a tiny story for each symbol: “the wavy lines are waves of water”, “the fork is for eating”.' },
    { title: 'Say it twice', tip: 'When you meet a symbol, say its word out loud (or in a whisper) two times while you look at it.' },
    { title: 'Trace it', tip: 'Draw the symbol in the air or on your hand with your finger while you say its word.' },
    { title: 'Spot the clue', tip: 'Find the part of the symbol that gives it away — the rays on the sun, the tail on the fish.' },
    { title: 'Look back', tip: 'When new symbols arrive, quickly run through the old ones in your head too, so none get lost.' },
    { title: 'Read it aloud', tip: 'Read the symbol row like a book, left to right, saying each word — little symbols too (“the”, “and”, “is”). Then tap the words in that order.' },
    { title: 'Watch out for extras', tip: 'Some word tiles are tricks that don’t belong. Only use a word if you can find its symbol in the row.' },
  ],
  parentNotes:
    'Immediate Symbol Translation measures visual–verbal associative learning: pairing new symbols with words and retrieving them right away, with the load growing as more symbols are learned. It is a complementary subtest; with Delayed and Recognition Symbol Translation it forms the Symbol Translation Index, which together with Naming Speed contributes to the Storage and Retrieval Index. Difficulty with this kind of paired learning can be an early signal worth discussing for reading (it is how letters and sight words are learned). Give the Delayed and Recognition games later in the same session to see how well the learning sticks.',
  commonMistakes: [
    'Skipping the small function-word symbols (the, and, is, on).',
    'Using the right words in the wrong order.',
    'Rushing past the teach cards without saying each word.',
    'Guessing from the first one or two symbols instead of reading the whole row.',
  ],
  everydayActivities: [
    'Invent a family “secret code”: draw simple symbols for 5 words and leave each other symbol notes.',
    'Read rebus books or puzzles where pictures replace words.',
    'Point out real-world symbols (road signs, washing labels, map keys) and talk about what they mean.',
    'Learn a few signs in sign language or a few words in a new language and quiz each other later in the day.',
  ],
};

export const ImmediateSymbolTranslation: SubtestModule<StPayload, StResponse> = {
  id: 'IST',
  generate,
  score,
  Player,
  guide,
};

export default ImmediateSymbolTranslation;
