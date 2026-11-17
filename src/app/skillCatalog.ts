/**
 * Question-type catalog: discovers which skill tags (question types) each game can produce by sampling
 * its generator across the difficulty range, so the test builder can offer them without hard-coding.
 */
import { dueReviews, isLadderSkill, skillStats } from '../core/progress';
import type { ProfileData } from '../core/storage';
import { SUBTESTS } from '../core/subtestInfo';
import type { SubtestId, SubtestModule } from '../core/types';

export interface QuestionType {
  skill: string;
  subtest: SubtestId;
  /** Easiest and hardest difficulty (age-years) this type was seen at. */
  minDifficulty: number;
  maxDifficulty: number;
}

const cache = new Map<SubtestId, QuestionType[]>();

export function questionTypes(mod: SubtestModule, samples = 90): QuestionType[] {
  const hit = cache.get(mod.id);
  if (hit) return hit;
  const found = new Map<string, QuestionType>();
  if (SUBTESTS[mod.id].kind !== 'speeded') {
    const variants = mod.variants?.map((v) => v.id) ?? [undefined];
    for (let i = 0; i < samples; i++) {
      const difficulty = 3.5 + (i % 15);
      const variant = ['IST', 'DST', 'RST'].includes(mod.id) ? 'book-1' : variants[i % variants.length];
      try {
        const item = mod.generate({ difficulty, seed: 9000 + i * 131, age: 9, mode: 'practice', variant });
        for (const s of item.skills) {
          if (!isLadderSkill(s)) continue;
          const q = found.get(s) ?? { skill: s, subtest: mod.id, minDifficulty: item.difficulty, maxDifficulty: item.difficulty };
          q.minDifficulty = Math.min(q.minDifficulty, item.difficulty);
          q.maxDifficulty = Math.max(q.maxDifficulty, item.difficulty);
          found.set(s, q);
        }
      } catch {
        /* a generator that can't make this level is fine — skip it */
      }
    }
  }
  const list = [...found.values()].sort((a, b) => a.minDifficulty - b.minDifficulty || a.skill.localeCompare(b.skill));
  cache.set(mod.id, list);
  return list;
}

/**
 * "Focus on what needs work": the weakest practised skills (lowest recent accuracy, at least 2 tries)
 * plus skills due for spaced review, grouped by game. Falls back to never-tried primary games.
 */
export function focusSelection(data: ProfileData, enabled: SubtestId[], maxSkills = 6): Partial<Record<SubtestId, string[]>> {
  const stats = skillStats(data).filter((s) => enabled.includes(s.subtest) && SUBTESTS[s.subtest].kind !== 'speeded');
  const weak = stats
    .filter((s) => s.attempts >= 2 && (s.level === 'attempted' || s.level === 'familiar'))
    .sort((a, b) => a.recentAccuracy - b.recentAccuracy)
    .map((s) => ({ subtest: s.subtest, skill: s.skill }));
  const due = dueReviews(data.review).filter((c) => enabled.includes(c.subtest)).map((c) => ({ subtest: c.subtest, skill: c.skill }));
  const out: Partial<Record<SubtestId, string[]>> = {};
  let n = 0;
  for (const { subtest, skill } of [...weak, ...due]) {
    if (n >= maxSkills) break;
    const list = out[subtest] ?? [];
    if (!list.includes(skill)) {
      list.push(skill);
      out[subtest] = list;
      n += 1;
    }
  }
  return out;
}
