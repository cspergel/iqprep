/** Derived views of a profile's data used by several screens. */
import { MASTERY_ORDER, allResults, dueReviews, skillStats, subtestEstimate, type MasteryLevel } from '../core/progress';
import { dailyPlan, reviewPlan, type SessionPlan } from '../core/session';
import type { ProfileData, Settings } from '../core/storage';
import { ALL_SUBTESTS, SUBTESTS } from '../core/subtestInfo';
import type { SubtestId } from '../core/types';

export function enabledSubtests(settings: Settings, age: number): SubtestId[] {
  return ALL_SUBTESTS.filter((s) => !settings.disabledSubtests.includes(s) && (SUBTESTS[s].minAge ?? 0) <= age);
}

/** Overall mastery stage (0 = not started … 4 = mastered) for one subtest. */
export function subtestStage(data: ProfileData, subtest: SubtestId): { stage: number; level: MasteryLevel; played: number } {
  const played = allResults(data).filter((r) => r.subtest === subtest).length;
  if (played === 0) return { stage: 0, level: 'new', played };
  if (SUBTESTS[subtest].kind === 'speeded') {
    const stage = Math.min(4, 1 + Math.floor(played / 2));
    return { stage, level: MASTERY_ORDER[stage], played };
  }
  const stats = skillStats(data).filter((s) => s.subtest === subtest);
  if (!stats.length) return { stage: 1, level: 'attempted', played };
  const avg = stats.reduce((a, s) => a + MASTERY_ORDER.indexOf(s.level), 0) / stats.length;
  const stage = Math.max(1, Math.round(avg));
  return { stage, level: MASTERY_ORDER[stage], played };
}

export function estimates(data: ProfileData, age: number): Partial<Record<SubtestId, number>> {
  const out: Partial<Record<SubtestId, number>> = {};
  const rs = allResults(data);
  for (const s of ALL_SUBTESTS) {
    const e = subtestEstimate(rs, s, age);
    if (e) out[s] = e.scaled;
  }
  return out;
}

export function buildDailyPlan(data: ProfileData, settings: Settings, age: number): SessionPlan {
  const due = dueReviews(data.review).map((c) => c.subtest);
  return dailyPlan({ estimates: estimates(data, age), enabled: enabledSubtests(settings, age), dueSubtests: due, minutes: settings.dailyGoalMinutes });
}

export function buildReviewPlan(data: ProfileData): SessionPlan | null {
  const due = dueReviews(data.review);
  return due.length ? reviewPlan(due) : null;
}
