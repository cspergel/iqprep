/**
 * Comprehension ("What Would You Do?"). Practical problems and "why do we have this rule?"
 * questions. Scored 2 / 1 / 0; the best answers often give TWO different reasons.
 */
import type { GenerateRequest, Item, ScoreOutcome, SubtestGuide, SubtestModule } from '../../core/types';
import { generateVerbal, scoreVerbal, type VerbalConfig } from '../_verbal/engine';
import type { VerbalPayload, VerbalResponse } from '../_verbal/types';
import { VerbalPlayer } from '../_verbal/VerbalPlayer';
import { CO_BANK } from './bank';

export type CoPayload = VerbalPayload;
export type CoResponse = VerbalResponse;

const isWhy = (prompt: string) => /^why\b/i.test(prompt);

export const CO_CONFIG: VerbalConfig = {
  subtest: 'CO',
  bank: CO_BANK,
  maxPoints: 2,
  parentScorable: true,
  hints: (b) =>
    isWhy(b.prompt)
      ? ['Why does this rule exist? Who does it protect or help?', 'Can you think of TWO different reasons — one about people (safety, fairness) and one about things (money, time, the planet)?']
      : ['What is the safest and kindest thing to do?', 'Does your answer fix the WHOLE problem? Who could help?'],
  scaffold: (b) => (isWhy(b.prompt) ? 'Because… and also because…' : 'First I would… then I would…'),
  rubricNote:
    '2 = the key reason or the most responsible action (for “two-reason” questions, two different good reasons). 1 = partly right, one small piece, or “because it’s the rule” with no reason. 0 = unhelpful, unsafe, unkind or not the real reason.',
};

export function generate(req: GenerateRequest): Item<CoPayload> {
  return generateVerbal(CO_CONFIG, req);
}

export function score(item: Item<CoPayload>, response: CoResponse | null): ScoreOutcome {
  return scoreVerbal(item, response);
}

export const Player = VerbalPlayer;

export const guide: SubtestGuide = {
  kidIntro: "What Would You Do? I'll tell you about a situation or a rule. You figure out the smartest, kindest thing to do — and WHY.",
  howToPlay: ['Listen to the question.', 'Say out loud what would really help, or why the rule exists.', 'Then pick the answer closest to what you said.'],
  strategies: [
    { title: 'Safety first', tip: 'Ask: what would keep everyone safe? The safest choice is often the best one.' },
    { title: 'Who does it help?', tip: 'For “why” questions, think about WHO the rule protects or helps — you, other people, animals, the planet.' },
    { title: 'Find two reasons', tip: 'Look for one reason about people (safety, fairness, feelings) and one about things (money, time, saving stuff).' },
    { title: 'Kind and fair', tip: 'Imagine you were the other person. What would feel fair and kind to you?' },
    { title: 'Fix the whole problem', tip: 'An answer that fixes only part (just “say sorry”) is OK, but one that fixes the whole thing is better.' },
    { title: 'Who can help?', tip: 'Many problems are best solved by getting the right helper: a teacher, a parent, a store worker, a lifeguard.' },
    { title: 'Beyond “it’s the rule”', tip: '“Because it’s the rule” only gets a little credit. Say WHY the rule is a good idea.' },
  ],
  parentNotes:
    'Comprehension measures practical reasoning and understanding of social rules and why they exist — common sense put into words. It is a secondary verbal subtest (it can stand in within the verbal area but is not part of the core VCI, which uses Similarities and Vocabulary). Real answers are scored 2 / 1 / 0, and some questions need two different general ideas for full credit (e.g. a safety reason plus a fairness or money reason). Grown-up scoring lets your child explain in their own words while you use the rubric. All situations here are original and gently worded.',
  commonMistakes: [
    'Giving only one reason when two are needed.',
    'Saying “because it’s the rule” without explaining why.',
    'Telling a personal story instead of a general reason.',
    'Choosing a fast fix that only solves part of the problem.',
  ],
  everydayActivities: [
    'Ask “Why do you think we have that rule?” about everyday rules — seatbelts, lines, library due dates — and look for two reasons.',
    'Play “What would you do if…?” at dinner with small, everyday problems.',
    'Read stories and pause: “What should the character do now? Why?”',
    'Talk through real choices your child makes: what happened, what else could they have done?',
    'Point out community helpers and talk about how their jobs keep people safe.',
  ],
};

export const Comprehension: SubtestModule<CoPayload, CoResponse> = {
  id: 'CO',
  generate,
  score,
  Player,
  guide,
};

export default Comprehension;
