/**
 * Information ("Know-It-All Quiz"). General-knowledge questions with one correct answer, scored 0/1.
 * "Say it first": the question is heard and answered out loud, then the child taps the matching
 * choice. Never grown-up scored (there is no 2/1/0 rubric for facts).
 */
import type { GenerateRequest, Item, ScoreOutcome, SubtestGuide, SubtestModule } from '../../core/types';
import { generateVerbal, scoreVerbal, type VerbalConfig } from '../_verbal/engine';
import type { VerbalPayload, VerbalResponse } from '../_verbal/types';
import { VerbalPlayer } from '../_verbal/VerbalPlayer';
import { IN_BANK } from './bank';

export type InPayload = VerbalPayload;
export type InResponse = VerbalResponse;

const TOPIC_HINT: Record<string, string> = {
  'in:nature': 'Think about animals and plants you have seen in books, at the zoo or outside.',
  'in:body': 'Think about your own body — what does that part do for you?',
  'in:science': 'Think about experiments, weather and how things work.',
  'in:time': 'Think about clocks and calendars — say the days or months in order.',
  'in:numbers': 'Count it out, or think about where you have seen that number before.',
  'in:geography': 'Picture a map or a globe.',
  'in:world': 'Think about places in your town and the people who work there.',
  'in:history': 'Think about famous people and events from stories, holidays and school.',
};

export const IN_CONFIG: VerbalConfig = {
  subtest: 'IN',
  bank: IN_BANK,
  maxPoints: 1,
  parentScorable: false,
  hints: (b) => [TOPIC_HINT[b.skill] ?? 'Think about where you might have learned this.', 'Cross out the answers that can’t be right, then choose from what’s left.'],
};

export function generate(req: GenerateRequest): Item<InPayload> {
  return generateVerbal(IN_CONFIG, req);
}

export function score(item: Item<InPayload>, response: InResponse | null): ScoreOutcome {
  return scoreVerbal(item, response);
}

export const Player = VerbalPlayer;

export const guide: SubtestGuide = {
  kidIntro: "Know-It-All Quiz! I'll ask questions about animals, your body, the world and more. Let's see what you know!",
  howToPlay: ['Listen to the question.', 'Say your answer out loud. It’s OK to make your best guess!', 'Then tap the answer that matches what you said.'],
  strategies: [
    { title: 'Picture it', tip: 'Make a picture in your head: a spider, a calendar, a map. Count the legs or the months in your picture.' },
    { title: 'Where did I learn this?', tip: 'Think: did I see this in a book, at school, on a trip, or on a show? Going back there can bring the answer.' },
    { title: 'Cross out the silly ones', tip: 'Some answers are clearly wrong. Rule them out first, then pick from what’s left.' },
    { title: 'Say it in order', tip: 'For days, months and numbers, say the list out loud: “…March, April…”' },
    { title: 'Use word clues', tip: 'Parts of words give hints: “tri” means three, “octo” means eight, “geo” means Earth.' },
    { title: 'Best guess beats blank', tip: 'If you are not sure, choose the answer that makes the most sense. A guess can be right!' },
  ],
  parentNotes:
    'Information measures general knowledge picked up from everyday life, reading and school — part of crystallized intelligence. It is a secondary verbal subtest: it can substitute in the Verbal Comprehension area but is not part of the core VCI (which uses Similarities and Vocabulary). Items are scored 0 or 1, so there is no 2/1/0 rubric. Knowledge grows from curiosity and conversation more than drilling — the best preparation is a rich, talkative everyday life. All questions here are original practice content.',
  commonMistakes: [
    'Answering before hearing the whole question.',
    'Freezing instead of giving a best guess.',
    'Mixing up similar facts (spiders have 8 legs, insects have 6).',
  ],
  everydayActivities: [
    'Read non-fiction books together — animals, space, the human body — and chat about one fact each day.',
    'Keep a family calendar where your child finds the day, date and month each morning.',
    'Look at maps and globes: where do grandparents live? Where do penguins live?',
    'Play a dinner-table quiz where everyone asks one question they learned today.',
    'Answer “why” questions together by looking things up, so curiosity becomes a habit.',
  ],
};

export const Information: SubtestModule<InPayload, InResponse> = {
  id: 'IN',
  generate,
  score,
  Player,
  guide,
};

export default Information;
