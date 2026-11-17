/**
 * Similarities ("Alike Game"). "How are X and Y alike?" — pick (or say) the answer that names the
 * group or big idea both things share. Scored 2 / 1 / 0 like real verbal tests.
 */
import type { GenerateRequest, Item, ScoreOutcome, SubtestGuide, SubtestModule } from '../../core/types';
import { generateVerbal, scoreVerbal, type VerbalConfig } from '../_verbal/engine';
import type { VerbalPayload, VerbalResponse } from '../_verbal/types';
import { VerbalPlayer } from '../_verbal/VerbalPlayer';
import { SI_BANK } from './bank';

export type SiPayload = VerbalPayload;
export type SiResponse = VerbalResponse;

export const SI_CONFIG: VerbalConfig = {
  subtest: 'SI',
  bank: SI_BANK,
  maxPoints: 2,
  parentScorable: true,
  hints: () => [
    'Think of a word for the group they both belong to.',
    "Finish the sentence: “They are both ___.” A group name wins the most points.",
  ],
  scaffold: () => 'They are both ___',
  rubricNote:
    '2 = names the key category or big shared idea. 1 = a true but small likeness (colour, a part, a place). 0 = a difference, true of only one, too general (“both are things”), or wrong.',
};

export function generate(req: GenerateRequest): Item<SiPayload> {
  return generateVerbal(SI_CONFIG, req);
}

export function score(item: Item<SiPayload>, response: SiResponse | null): ScoreOutcome {
  return scoreVerbal(item, response);
}

export const Player = VerbalPlayer;

export const guide: SubtestGuide = {
  kidIntro: "The Alike Game! I'll name two things, and you figure out how they are the SAME. Find the group they both belong to!",
  howToPlay: [
    'Listen to the two things.',
    'Say out loud how they are the same — in your own words.',
    'Then pick the answer that is closest to what you said.',
  ],
  strategies: [
    { title: 'Find the family name', tip: 'Ask: what GROUP do they both belong to? Fruit, animals, tools, feelings… A group name usually wins the most points.' },
    { title: 'What are they FOR?', tip: 'If no group pops out, think about their job: what do people USE both of them for? (Both help you see in the dark.)' },
    { title: 'Where would you find them?', tip: 'Picture where each one lives or is used — a kitchen, the sky, a farm. That place can lead you to the big idea.' },
    { title: 'Kinds of ___', tip: 'Try the sentence “They are both kinds of ___.” If a word fits, that’s a strong answer.' },
    { title: 'Check BOTH', tip: 'Test your answer on each thing: is it true for the first one? For the second one? If not, keep looking.' },
    { title: 'Climb past the details', tip: 'Colour, shape and parts are true but small. Ask “Is there a bigger idea?” and climb one step higher.' },
    { title: 'Just right, not too big', tip: '“They’re both things” fits everything, so it earns nothing. Pick a group that fits these two nicely.' },
  ],
  parentNotes:
    'Similarities measures verbal concept formation and abstract reasoning: seeing the shared category or idea behind two words. With Vocabulary it makes up the Verbal Comprehension Index (VCI), and both count toward Full Scale IQ. On real tests answers are scored 2 (key category or essential shared idea, e.g. “both are fruit”), 1 (a concrete or partial likeness, e.g. “both have peels”) or 0 (a difference, true of only one, or too general). Here the pair is read aloud and your child says an answer in their own words first (as on the real test, where nothing is printed); the multiple choice that follows (“which is closest to what you said?”) teaches what a 2-point answer looks like. Turn on grown-up scoring to score the spoken answer yourself — the closest match to a real test. All pairs in Brain Camp are original practice items, not test items.',
  commonMistakes: [
    'Telling how the two things are different.',
    'Describing only one of the two things.',
    'Stopping at a small detail (both are red, both have legs) when a group name exists.',
    'Giving an answer so general it fits anything (“they’re both things”).',
  ],
  everydayActivities: [
    '“How are these alike?” car game: take turns naming two things and finding the best group name.',
    'Sort toys, laundry or groceries into groups and name each group.',
    'Play “odd one out” with three foods or animals, then explain why.',
    'Twenty Questions — asking “Is it an animal? A tool?” builds category thinking.',
    'When your child gives a detail (“both are round”), ask “Can you find a word for their whole group?”',
  ],
};

export const Similarities: SubtestModule<SiPayload, SiResponse> = {
  id: 'SI',
  generate,
  score,
  Player,
  guide,
};

export default Similarities;
