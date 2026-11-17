/**
 * Vocabulary ("Word Wizard"). Young items: name the picture. Then "What does ___ mean?" —
 * pick (or say) the most exact meaning. Scored 2 / 1 / 0 like real verbal tests.
 */
import type { GenerateRequest, Item, ScoreOutcome, SubtestGuide, SubtestModule } from '../../core/types';
import { generateVerbal, scoreVerbal, type VerbalConfig } from '../_verbal/engine';
import type { VerbalPayload, VerbalResponse } from '../_verbal/types';
import { VerbalPlayer } from '../_verbal/VerbalPlayer';
import { VC_BANK } from './bank';

export type VcPayload = VerbalPayload;
export type VcResponse = VerbalResponse;

const isPicture = (skill: string) => skill === 'vc:picture';

export const VC_CONFIG: VerbalConfig = {
  subtest: 'VC',
  bank: VC_BANK,
  maxPoints: 2,
  parentScorable: true,
  hints: (b) =>
    isPicture(b.skill)
      ? ['Look closely. What is its exact name?', 'Pick the most exact name — not just the group it belongs to.']
      : [
          'Is it a thing, an action (something you do), or a describing word?',
          'Try: “It’s a ___ that ___.” Pick the answer that says exactly what it means, not just an example.',
        ],
  scaffold: (b) => (isPicture(b.skill) ? 'It’s a ___ (its exact name)' : 'It means… / It’s a kind of ___ that ___'),
  // One examiner-style stem per format: picture items "What is this?", word items "What does ___ mean?".
  stem: (b) => (isPicture(b.skill) ? 'What is this?' : b.prompt),
  rubricNote:
    '2 = a good synonym, the main use, the category plus a key feature, or the exact name for a picture. 1 = vague, partial, a minor use or just an example (or a broader name like “an animal”). 0 = wrong, a sound-alike word, or only acting it out.',
};

export function generate(req: GenerateRequest): Item<VcPayload> {
  return generateVerbal(VC_CONFIG, req);
}

export function score(item: Item<VcPayload>, response: VcResponse | null): ScoreOutcome {
  return scoreVerbal(item, response);
}

export const Player = VerbalPlayer;

export const guide: SubtestGuide = {
  kidIntro: 'Word Wizard! I say a word, and you show me you know what it means. Wizards use exact words!',
  howToPlay: [
    'Look at the picture or listen to the word.',
    'Say out loud what it is or what it means.',
    'Then pick the answer that is closest to what you said.',
  ],
  strategies: [
    { title: 'Kind + special', tip: 'Say what KIND of thing it is, then what makes it special: “A giraffe is an animal with a very long neck.”' },
    { title: 'What do you do with it?', tip: 'For things, think about what it is USED for: “A ladder is something you climb to reach high places.”' },
    { title: 'Swap in a twin word', tip: 'Find a word that means the same: “enormous” = “huge”. If the twin word fits, you’ve got it.' },
    { title: 'Put it in a sentence', tip: 'Say a sentence with the word (“The glass is fragile”), then ask what the word is doing in that sentence.' },
    { title: 'Example is not enough', tip: 'An example (“like a lion”) is a start. Ask: what is true about ALL of them? That’s the meaning.' },
    { title: 'Sound-alike trap', tip: 'Some answers are about a word that only SOUNDS similar (desert / dessert). Listen to the exact word.' },
    { title: 'Opposite check', tip: 'If you know the opposite (brave ↔ scared), you can rule out answers that mean the opposite.' },
  ],
  parentNotes:
    'Vocabulary measures word knowledge and the ability to explain meanings — a strong marker of language development and crystallized knowledge. With Similarities it makes up the Verbal Comprehension Index (VCI), and both count toward Full Scale IQ. Real tests start young children with a few picture-naming items, then ask for spoken definitions scored 2 (good synonym, main use, or category plus defining feature), 1 (vague, partial, or just an example) or 0 (wrong, a sound-alike, or only a gesture). Here the word is read aloud and your child says a definition first (in test mode the word is never printed, as on the real test); the multiple choice that follows shows what a 2-point definition sounds like. Grown-up scoring lets you score the spoken definition yourself. All words and definitions are original practice content.',
  commonMistakes: [
    'Acting the word out or pointing instead of using words.',
    'Giving only an example (“like a lion”) instead of the meaning.',
    'Using the word in its own definition (“fragile means it’s fragile”).',
    'Confusing it with a word that sounds similar.',
    'Naming a picture with a broad word (“an animal”) instead of its exact name.',
  ],
  everydayActivities: [
    'Read aloud every day and pause on interesting words: “What do you think that means?”',
    'Pick a “word of the day” and try to use it three times at dinner.',
    'Play “define it” in the car: one person says a word, the other explains it in one sentence.',
    'When your child gives an example, ask “What kind of thing is it? What makes it special?”',
    'Talk about word families and opposites (brave/scared, ancient/new).',
  ],
};

export const Vocabulary: SubtestModule<VcPayload, VcResponse> = {
  id: 'VC',
  generate,
  score,
  Player,
  guide,
};

export default Vocabulary;
