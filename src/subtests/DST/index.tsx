/**
 * Delayed Symbol Translation ("Symbol Stories (Later)"). No teaching: the child reads symbol rows from
 * the code book learned earlier in Immediate Symbol Translation and "reads" them by building the sentence
 * from spoken word tiles (picture choices for single symbols; "Grown-up listens" for reading aloud).
 *
 * Give it later in the session with the same variant ("book-<n>") as IST. Stand-alone: tutor mode
 * shows a quick "remember these?" review; practice mode teaches only symbols never seen this session;
 * test mode never teaches.
 *
 * Difficulty: the IST table (symbols known / sentence length) shifted +0.7 years, since recall after a
 * delay without a fresh look is harder: k1 L1 4.2 … k8 L4 8.9 … k16 L7 17. Scoring: 0/1 (exact sentence;
 * the sides of "and" may be swapped); meta.wordsWrong = wrong slots.
 */
import type { GenerateRequest, Item, PlayerProps, ScoreOutcome, SubtestGuide, SubtestModule } from '../../core/types';
import { generateSt, scoreSt, type StPayload, type StResponse } from '../_symbols/engine';
import { SymbolPlayer } from '../_symbols/SymbolPlayer';

export type { StPayload, StResponse };

export function generate(req: GenerateRequest): Item<StPayload> {
  return generateSt('DST', req);
}

export function score(item: Item<StPayload>, response: StResponse | null): ScoreOutcome {
  return scoreSt(item, response);
}

export function Player(props: PlayerProps<StPayload, StResponse>) {
  return <SymbolPlayer task="DST" {...props} />;
}

export const guide: SubtestGuide = {
  kidIntro: 'Remember the secret symbols from Symbol Stories? Let’s see how many you can still read!',
  howToPlay: [
    'Look at the row of symbols. No new symbols this time!',
    'Remember what each one means.',
    'Tap a word tile for each symbol, left to right, then tap Done.',
    'Hold a word to hear it. Tap a word in a slot to take it out.',
  ],
  strategies: [
    { title: 'Replay the story', tip: 'Think back to the picture-story you made: “the wavy lines were water…”.' },
    { title: 'Trace to remember', tip: 'Trace a tricky symbol in the air with your finger — sometimes your hand remembers what you said when you learned it.' },
    { title: 'Sure ones first', tip: 'Read the symbols you’re sure of first, then work out the tricky ones from what’s left.' },
    { title: 'Skip the tricks', tip: 'Some word tiles don’t belong. Only use a word if you can find its symbol in the row.' },
    { title: 'Sentence sense', tip: 'Use the sentence shape: “the cat ___ the fish” needs a doing word, like “sees” or “eats”.' },
    { title: 'Warm-up review', tip: 'Before you start, run through the whole code book in your head once.' },
  ],
  parentNotes:
    'Delayed Symbol Translation measures how well the symbol–word pairs learned earlier are retrieved after a delay (typically 20–30 minutes later in the session), without being shown again. It reflects long-term storage and retrieval of new associations. Together with Immediate and Recognition Symbol Translation it forms the complementary Symbol Translation Index. A big drop from the Immediate score suggests the learning was not consolidated — extra review and meaningful “stories” for each symbol help.',
  commonMistakes: [
    'Mixing up two symbols that were learned close together.',
    'Remembering the nouns but forgetting the small words (the, and, is).',
    'Putting two words in swapped places.',
    'Giving up on a long row instead of decoding it symbol by symbol.',
  ],
  everydayActivities: [
    'At dinner, ask about something learned in the morning — practise remembering after a delay.',
    'Make picture flashcards of new words and review them the next day.',
    'Play “What did we see?” after a walk: recall signs, shops or animals in order.',
    'Revisit your family “secret code” notes a day later and decode them together.',
  ],
};

export const DelayedSymbolTranslation: SubtestModule<StPayload, StResponse> = {
  id: 'DST',
  generate,
  score,
  Player,
  guide,
};

export default DelayedSymbolTranslation;
