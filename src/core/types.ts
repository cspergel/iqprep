import type { ComponentType } from 'react';

/**
 * Subtest codes follow the standard WISC-V abbreviations.
 * Primary: SI VC BD VP MR FW DS PS CD SS
 * Secondary: IN CO PC AR LN CA
 * Complementary: NSL NSQ IST DST RST
 */
export type SubtestId =
  | 'SI' | 'VC' | 'IN' | 'CO'
  | 'BD' | 'VP'
  | 'MR' | 'FW' | 'PC' | 'AR'
  | 'DS' | 'PS' | 'LN'
  | 'CD' | 'SS' | 'CA'
  | 'NSL' | 'NSQ' | 'IST' | 'DST' | 'RST';

export type PrimaryIndexId = 'VCI' | 'VSI' | 'FRI' | 'WMI' | 'PSI';
export type CompositeId =
  | PrimaryIndexId
  | 'FSIQ'
  | 'GAI' | 'CPI' | 'NVI' | 'QRI' | 'AWMI'
  | 'NSI' | 'STI' | 'SRI';

/**
 * tutor:    untimed, hints, read-aloud, try-again, worked explanations
 * practice: optional timers, immediate feedback + explanation
 * test:     standard timing, no feedback until the end, discontinue rules
 */
export type Mode = 'tutor' | 'practice' | 'test';

/**
 * How a subtest is scored.
 * power:   items of rising difficulty, ability estimated from right/wrong (IRT)
 * span:    memory trials whose difficulty is the span length (also IRT)
 * speeded: one timed sheet; raw score compared to age expectations
 */
export type SubtestKind = 'power' | 'span' | 'speeded';

/**
 * A generated practice item.
 * `difficulty` is on an age-equivalent scale in years (about 4–17):
 * a typical child of that age gets an item of that difficulty right ~50% of the time.
 */
export interface Item<P = unknown> {
  id: string;
  subtest: SubtestId;
  difficulty: number;
  seed: number;
  payload: P;
  /** 1 for most items, 2 for verbal items scored 0/1/2, raw maximum for speeded sheets. */
  maxPoints: number;
  /** Standard time limit in seconds (test mode enforces it; practice shows it; tutor ignores it). */
  timeLimitSec?: number;
  /** Skill tags for analytics, e.g. 'mr:progression', 'fw:substitution'. Keep them stable. */
  skills: string[];
  /** Graduated hints, gentlest first. */
  hints: string[];
  /** Kid-friendly explanation of the right answer, shown after answering. */
  explanation: string;
  /** Optional step-by-step worked solution. */
  steps?: string[];
  /** Text read aloud by the "read to me" button / tutor mode. */
  speak?: string;
  /**
   * Seconds after which the runner gently asks "Do you have an answer?" (outside tutor mode),
   * like an examiner's prompt. E.g. VP 20, FW limit−10, MR/PC 30.
   */
  promptAtSec?: number;
}

export interface ScoreOutcome {
  points: number;
  correct: boolean;
  /** Process measures, e.g. { span: 4 }, { rotationErrors: 1 }, { errors: 2, attempted: 30 }. */
  meta?: Record<string, number>;
  /** Short note about this particular response, e.g. "That's a 1-point answer — it's true, but…". */
  feedback?: string;
}

export interface GenerateRequest {
  /** Target difficulty on the age-equivalent scale. */
  difficulty: number;
  seed: number;
  /** Child age in years (fractional ok). Used to pick age variants such as Coding A/B. */
  age: number;
  mode: Mode;
  /**
   * Optional sub-task requested by the session, e.g. Digit Span 'forward' | 'backward' | 'sequencing'.
   * Modules that declare `variants` must honour it; when omitted they choose one themselves.
   */
  variant?: string;
  /** Item ids seen recently; bank-based modules should avoid them when they can. */
  exclude?: string[];
}

export interface Reveal<R> {
  response: R | null;
  outcome: ScoreOutcome;
}

export interface PlayerProps<P = unknown, R = unknown> {
  item: Item<P>;
  mode: Mode;
  age: number;
  /** Call exactly once with the child's answer. */
  onSubmit: (response: R) => void;
  /** When set, input is locked and the player should show the correct answer (and the child's choice). */
  reveal?: Reveal<R>;
  /** Number of hints the runner has revealed so far (players may add visual scaffolds for hint >= 1). */
  hintLevel: number;
  /** Text-to-speech helper; resolves when finished. Respects the read-aloud setting except where audio is the task (forceSpeak). */
  speak: (text: string, opts?: { rate?: number; force?: boolean }) => Promise<void>;
  /**
   * Verbal subtests only: the child answers out loud and a grown-up scores 0/1/2 with the rubric,
   * instead of picking from multiple choice.
   */
  parentScoring?: boolean;
}

export interface SubtestGuide {
  /** 1–2 sentences the mascot says to introduce the game. */
  kidIntro: string;
  /** Short kid-level steps. */
  howToPlay: string[];
  /** Tips & tricks the child can actually use. */
  strategies: { title: string; tip: string }[];
  /** What it measures and why it matters (for grown-ups). */
  parentNotes: string;
  commonMistakes: string[];
  /** Off-screen games and activities that build the same skill. */
  everydayActivities: string[];
}

export interface SubtestModule<P = any, R = any> {
  id: SubtestId;
  generate: (req: GenerateRequest) => Item<P>;
  /** Must handle response === null (timed out / skipped) by returning 0 points. */
  score: (item: Item<P>, response: R | null) => ScoreOutcome;
  Player: ComponentType<PlayerProps<P, R>>;
  guide: SubtestGuide;
  /**
   * Sub-tasks given as separate blocks in test mode (in this order), each with its own discontinue
   * run, e.g. DS: ['forward', 'backward', 'sequencing'], CA: ['random', 'structured'].
   */
  variants?: { id: string; label: string }[];
  /** Variant-specific skill tag prefix is `${id.toLowerCase()}:${variant}`, used for process scores. */
}

/** One answered item, as stored in history. */
export interface ItemResult {
  itemId: string;
  subtest: SubtestId;
  difficulty: number;
  seed: number;
  points: number;
  maxPoints: number;
  correct: boolean;
  timeMs: number;
  overTime: boolean;
  hintsUsed: number;
  attempts: number;
  skills: string[];
  mode: Mode;
  at: number;
  meta?: Record<string, number>;
  /** Kid's confidence before seeing feedback (1 unsure – 3 sure), when asked. */
  confidence?: number;
}
