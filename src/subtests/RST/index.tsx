/**
 * Recognition Symbol Translation ("Symbol Match"). Show a learned symbol; the child picks its word
 * from four choices (no teaching in test mode). As on the real test, where the examiner reads the
 * options, the choices are read aloud one by one (each highlighted) when the item appears; 🔊 repeats. At the top of the range, short symbol phrases replace
 * single symbols.
 *
 * Same code book as IST/DST when given the same variant ("book-<n>"). Stand-alone: tutor mode shows a
 * quick review; practice mode teaches only symbols never seen this session; test mode never teaches.
 *
 * Difficulty (age-equivalent):
 *   noun, unlearned distractors + pictures 4.0 · noun, learned distractors + pictures 5.0
 *   noun/verb, words 6.2 · verb/describing word 7.4 · function word (the/and/is/on) 8.6
 *   phrases of 2 / 3 / 4 / 5 / 6 symbols: 10 / 11.5 / 13 / 14.6 / 16.2
 * Scoring: 0/1.
 */
import type { GenerateRequest, Item, PlayerProps, ScoreOutcome, SubtestGuide, SubtestModule } from '../../core/types';
import { generateSt, scoreSt, type StPayload, type StResponse } from '../_symbols/engine';
import { SymbolPlayer } from '../_symbols/SymbolPlayer';

export type { StPayload, StResponse };

export function generate(req: GenerateRequest): Item<StPayload> {
  return generateSt('RST', req);
}

export function score(item: Item<StPayload>, response: StResponse | null): ScoreOutcome {
  return scoreSt(item, response);
}

export function Player(props: PlayerProps<StPayload, StResponse>) {
  return <SymbolPlayer task="RST" {...props} />;
}

export const guide: SubtestGuide = {
  kidIntro: 'Symbol Match! Here’s a secret symbol you learned. Which word goes with it?',
  howToPlay: [
    'Look at the symbol.',
    'Listen to the four choices. Tap “Read the choices” to hear them again.',
    'Pick the word that goes with it.',
    'Tap Done.',
  ],
  strategies: [
    { title: 'Picture-story', tip: 'Remember the story: “the fork is for eating”, “the heart means likes”.' },
    { title: 'Try each word', tip: 'Hold each choice up to the symbol: does “sun” fit the ring with rays? Yes!' },
    { title: 'Cross out', tip: 'Rule out the words you know belong to other symbols.' },
    { title: 'Spot the clue', tip: 'Look for the part of the symbol that looks like something — a tail, rays, a roof.' },
    { title: 'What kind of word?', tip: 'Is it a thing, an action, or a tiny word? Plain marks like a dot, plus or equals are tiny words (“the”, “and”, “is”).' },
    { title: 'First feeling, then check', tip: 'Notice which word pops into your head first, then check it against the symbol before tapping Done.' },
  ],
  parentNotes:
    'Recognition Symbol Translation checks whether the symbol–word pairs learned earlier can be recognized when the answer is offered among choices. It is easier than free recall: a child who struggles on Delayed but does well here has stored the pairs but has trouble retrieving them on demand. It is the third part of the complementary Symbol Translation Index (with Immediate and Delayed Symbol Translation).',
  commonMistakes: [
    'Choosing a word that belongs to a similar-looking symbol.',
    'Mixing up the small function-word symbols (the, and, is, on).',
    'Answering too quickly without checking every choice.',
  ],
  everydayActivities: [
    'Play matching games with picture and word cards.',
    'Point to signs and symbols when out and ask “what does that one mean?”.',
    'Use a home “symbol menu” for chores or snacks and let your child read it.',
  ],
};

export const RecognitionSymbolTranslation: SubtestModule<StPayload, StResponse> = {
  id: 'RST',
  generate,
  score,
  Player,
  guide,
};

export default RecognitionSymbolTranslation;
