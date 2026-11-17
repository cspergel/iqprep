/**
 * Bank-picking generator and 2/1/0 scoring shared by SI, VC, IN and CO.
 */
import { createRng } from '../../core/rng';
import type { GenerateRequest, Item, ScoreOutcome, SubtestId } from '../../core/types';
import type { VerbalBankItem, VerbalChoice, VerbalPayload, VerbalResponse } from './types';

/** How many of the nearest-difficulty items the generator chooses among. */
export const NEAREST_POOL = 5;
/** Candidates farther than this (in years) beyond the closest one are dropped, so items stay on target. */
export const NEAR_WINDOW = 1.5;
/**
 * Excluded (recently seen) items are skipped only if a fresh item exists within this many years of
 * the closest item overall; otherwise a repeat is better than a badly mismatched item.
 */
export const EXCLUDE_TOLERANCE = 2;

export interface VerbalConfig {
  subtest: SubtestId;
  bank: readonly VerbalBankItem[];
  maxPoints: 1 | 2;
  parentScorable: boolean;
  /** General hints for this subtest (gentle → specific). The item's own hint is appended. */
  hints: (b: VerbalBankItem) => string[];
  scaffold?: (b: VerbalBankItem) => string | undefined;
  rubricNote?: string;
  /**
   * The instruction stem shown and spoken for an item (defaults to the bank prompt). Lets a subtest
   * keep one consistent examiner-style stem, e.g. VC picture items: "What is this?".
   */
  stem?: (b: VerbalBankItem) => string;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Words written in CAPITALS are for on-screen emphasis; read them in normal case. */
export function spokenText(text: string): string {
  return text.replace(/\b[A-Z][A-Z'-]+\b/g, (w) => w.toLowerCase());
}

function rankByDistance(pool: readonly VerbalBankItem[], target: number): VerbalBankItem[] {
  return pool
    .slice()
    .sort(
      (a, b) =>
        Math.abs(a.difficulty - target) - Math.abs(b.difficulty - target) ||
        a.difficulty - b.difficulty ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}

/** The candidates the generator chooses among (exported for tests). */
export function candidatesFor(bank: readonly VerbalBankItem[], difficulty: number, exclude?: readonly string[]): VerbalBankItem[] {
  if (bank.length === 0) throw new Error('empty verbal bank');
  const target = clamp(difficulty, 3, 18);
  const all = rankByDistance(bank, target);
  const bestDist = Math.abs(all[0].difficulty - target);
  let ranked = all;
  if (exclude && exclude.length) {
    const skip = new Set(exclude);
    const fresh = all.filter((b) => !skip.has(b.id));
    if (fresh.length && Math.abs(fresh[0].difficulty - target) <= bestDist + EXCLUDE_TOLERANCE) ranked = fresh;
  }
  const near = ranked.slice(0, NEAREST_POOL);
  const closest = Math.abs(near[0].difficulty - target);
  return near.filter((b) => Math.abs(b.difficulty - target) <= closest + NEAR_WINDOW);
}

export function pickBankItem(bank: readonly VerbalBankItem[], req: GenerateRequest): VerbalBankItem {
  return createRng(req.seed).pick(candidatesFor(bank, req.difficulty, req.exclude));
}

export function bestChoice(choices: readonly VerbalChoice[]): VerbalChoice {
  return choices.reduce((best, c) => (c.points > best.points ? c : best), choices[0]);
}

export function generateVerbal(cfg: VerbalConfig, req: GenerateRequest): Item<VerbalPayload> {
  const b = pickBankItem(cfg.bank, req);
  const choices = createRng((req.seed ^ 0x2c1b3c6d) >>> 0).shuffle(b.choices);
  const prompt = cfg.stem?.(b) ?? b.prompt;
  return {
    id: b.id,
    subtest: cfg.subtest,
    difficulty: b.difficulty,
    seed: req.seed,
    payload: {
      prompt,
      picture: b.picture,
      pictureLabel: b.pictureLabel,
      choices,
      rubric: b.rubric,
      parentScorable: cfg.parentScorable,
      scaffold: cfg.scaffold?.(b),
      rubricNote: cfg.rubricNote,
    },
    maxPoints: cfg.maxPoints,
    skills: [b.skill],
    hints: [...cfg.hints(b), ...(b.hint ? [b.hint] : [])],
    explanation: b.explanation,
    speak: spokenText(prompt),
  };
}

const PARENT_FEEDBACK: Record<number, string> = {
  2: 'Full points — that was a great, complete answer!',
  1: '1 point — a good start! Look at the best answer to see how to earn 2.',
  0: 'Not this time. Look at the best answer — next time you can try that idea.',
};

export function scoreVerbal(item: Item<VerbalPayload>, response: VerbalResponse | null): ScoreOutcome {
  const max = item.maxPoints;
  if (!response) return { points: 0, correct: false, meta: { parentScored: 0, partial: 0 } };

  if (response.parentScore !== undefined && response.parentScore !== null && item.payload.parentScorable) {
    const raw = Number(response.parentScore);
    const points = Number.isFinite(raw) ? clamp(Math.round(raw), 0, max) : 0;
    return {
      points,
      correct: points === max,
      meta: { parentScored: 1, partial: points > 0 && points < max ? 1 : 0 },
      feedback: max === 2 ? PARENT_FEEDBACK[points] : undefined,
    };
  }

  // Process measure for the "say it first" flow (only when the player reported it).
  const said: Record<string, number> = typeof response.saidFirst === 'boolean' ? { saidFirst: response.saidFirst ? 1 : 0 } : {};
  const chosen = response.choice !== undefined ? item.payload.choices.find((c) => c.text === response.choice) : undefined;
  if (!chosen) return { points: 0, correct: false, meta: { parentScored: 0, partial: 0, ...said } };
  const points = clamp(chosen.points, 0, max);
  const partial = points > 0 && points < max;
  return {
    points,
    correct: points === max,
    meta: { parentScored: 0, partial: partial ? 1 : 0, ...said },
    feedback: partial ? `1 point — true, but there's a better answer! ${chosen.why}` : chosen.why,
  };
}
