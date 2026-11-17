/**
 * Shared types for the four verbal subtests (SI, VC, IN, CO).
 * Each subtest owns an ORIGINAL bank of items; the generator picks from the bank, the shared
 * VerbalPlayer shows the item, and scoring follows the 2 / 1 / 0 verbal convention.
 */

export type VerbalPoints = 0 | 1 | 2;

export interface VerbalChoice {
  /** What the child reads/hears. Unique within an item; used as the response key. */
  text: string;
  /** 2 = best answer, 1 = true but weaker / more concrete, 0 = wrong. (Information: 1 = correct.) */
  points: VerbalPoints;
  /** Kid-language reason this choice earns its points. */
  why: string;
  /** Optional emoji shown large inside the choice. */
  emoji?: string;
}

export interface VerbalRubric {
  /** Sample spoken answers worth 2 points. */
  two: string[];
  /** Sample spoken answers worth 1 point. */
  one: string[];
  /** Sample spoken answers worth 0 points. */
  zero: string[];
}

export interface VerbalBankItem {
  /** Stable id, prefixed with the subtest, e.g. "SI:apple-banana". */
  id: string;
  /** Age-equivalent difficulty in years (4–17). */
  difficulty: number;
  /** The question. Words in CAPITALS are shown highlighted (and read in normal case). */
  prompt: string;
  /** Optional emoji picture. */
  picture?: string;
  /** Accessible name for the picture. */
  pictureLabel?: string;
  choices: VerbalChoice[];
  rubric: VerbalRubric;
  /** Kid-language explanation that teaches the idea behind the best answer. */
  explanation: string;
  /** Stable skill tag, e.g. "si:category". */
  skill: string;
  /** Optional item-specific hint, given after the subtest's general hints. */
  hint?: string;
}

export interface VerbalPayload {
  prompt: string;
  picture?: string;
  pictureLabel?: string;
  /** Choices in display order (shuffled deterministically from the seed). */
  choices: VerbalChoice[];
  rubric: VerbalRubric;
  /** Whether a grown-up may score a spoken answer instead of multiple choice. */
  parentScorable: boolean;
  /** Short sentence starter shown when the child asks for a hint, e.g. "They are both ___". */
  scaffold?: string;
  /** One-line summary of what earns 2 / 1 / 0 for this subtest (for the grown-up's guide). */
  rubricNote?: string;
}

export interface VerbalResponse {
  /** Text of the chosen option (multiple-choice mode). */
  choice?: string;
  /** Score the grown-up gave a spoken answer (parent-scoring mode). */
  parentScore?: VerbalPoints;
  /**
   * "Say it first" flow: true when the child said an answer out loud before seeing the choices,
   * false when they skipped straight to the choices. Absent in older responses.
   */
  saidFirst?: boolean;
  /** What the browser's speech recogniser heard (optional, only when the 🎤 button was used). */
  transcript?: string;
}
