/**
 * Learning progress: per-subtest ability, a Khan-style mastery ladder per skill, spaced review
 * (Leitner boxes), stars/XP, streaks and badges.
 */
import { estimateAbility, scaledFromSpeeded, scaledFromTheta, type AbilityEstimate } from './scoring';
import { SUBTESTS } from './subtestInfo';
import { dayKey, type ProfileData, type ReviewCard, type SessionRecord } from './storage';
import type { ItemResult, SubtestId } from './types';

const DAY = 24 * 60 * 60 * 1000;

export function allResults(data: ProfileData): ItemResult[] {
  return data.sessions.flatMap((s) => s.results);
}

/** Points that count as evidence of ability. Hinted or second-try answers count half. */
export function evidencePoints(r: ItemResult): number {
  const pts = r.overTime && r.mode === 'test' ? 0 : r.points;
  return r.hintsUsed > 0 || r.attempts > 1 ? pts * 0.5 : pts;
}

/** Current ability estimate for a power/span subtest from the most recent results. */
export function subtestAbility(results: ItemResult[], subtest: SubtestId, age: number, recent = 40): AbilityEstimate {
  const mine = results.filter((r) => r.subtest === subtest).slice(-recent);
  return estimateAbility(
    mine.map((r) => ({ difficulty: r.difficulty, points: evidencePoints(r), maxPoints: r.maxPoints })),
    age,
  );
}

/** Scaled-score style estimate for any subtest (speeded: average of the last few sheets). */
export function subtestEstimate(results: ItemResult[], subtest: SubtestId, age: number): { scaled: number; n: number } | null {
  const mine = results.filter((r) => r.subtest === subtest);
  if (mine.length === 0) return null;
  if (SUBTESTS[subtest].kind === 'speeded') {
    const last = mine.slice(-3);
    const raw = last.reduce((a, r) => a + r.points, 0);
    const dur = last.reduce((a, r) => a + (r.meta?.durationSec ?? SUBTESTS[subtest].defaultTimeLimitSec ?? 120), 0);
    return { scaled: scaledFromSpeeded(subtest, raw, age, dur), n: last.length };
  }
  const est = subtestAbility(results, subtest, age);
  return { scaled: scaledFromTheta(est.theta, age), n: est.n };
}

// ---------- mastery ladder (per skill tag) ----------

export type MasteryLevel = 'new' | 'attempted' | 'familiar' | 'proficient' | 'mastered';
export const MASTERY_ORDER: MasteryLevel[] = ['new', 'attempted', 'familiar', 'proficient', 'mastered'];
export const MASTERY_LABEL: Record<MasteryLevel, string> = {
  new: 'Not started', attempted: 'Getting started', familiar: 'Familiar', proficient: 'Proficient', mastered: 'Mastered',
};

export interface SkillStat {
  skill: string;
  subtest: SubtestId;
  attempts: number;
  correct: number;
  recentAccuracy: number;
  level: MasteryLevel;
  lastAt: number;
}

/** Skill tags that describe a span length, e.g. 'ds:span-5', are too fine-grained for the ladder. */
export function isLadderSkill(skill: string): boolean {
  return !/span-\d+$/.test(skill);
}

export function skillStats(data: ProfileData, now = Date.now()): SkillStat[] {
  const bySkill = new Map<string, ItemResult[]>();
  for (const r of allResults(data)) {
    if (SUBTESTS[r.subtest]?.kind === 'speeded') continue;
    for (const s of r.skills) {
      if (!isLadderSkill(s)) continue;
      if (!bySkill.has(s)) bySkill.set(s, []);
      bySkill.get(s)!.push(r);
    }
  }
  const out: SkillStat[] = [];
  for (const [skill, rs] of bySkill) {
    const recent = rs.slice(-10);
    const credit = (r: ItemResult) => (r.correct && r.hintsUsed === 0 && r.attempts === 1 ? 1 : r.correct ? 0.5 : 0);
    const recentAccuracy = recent.reduce((a, r) => a + credit(r), 0) / recent.length;
    let level: MasteryLevel;
    if (rs.length < 3) level = 'attempted';
    else if (recentAccuracy < 0.7) level = 'attempted';
    else if (recentAccuracy < 0.9 || recent.length < 5) level = 'familiar';
    else level = 'proficient';
    // Mastered = proficient, then confirmed correct in a later mixed review/daily/test session (≥ 1 day later).
    const masteredAt = data.mastered[skill];
    if (masteredAt && level === 'proficient') level = 'mastered';
    // Decay: two misses among the last three drop the level one step.
    const last3 = rs.slice(-3);
    if (last3.length === 3 && last3.filter((r) => !r.correct).length >= 2) {
      const i = MASTERY_ORDER.indexOf(level);
      level = MASTERY_ORDER[Math.max(1, i - 1)];
    }
    out.push({
      skill,
      subtest: rs[rs.length - 1].subtest,
      attempts: rs.length,
      correct: rs.filter((r) => r.correct).length,
      recentAccuracy,
      level,
      lastAt: rs[rs.length - 1].at,
    });
  }
  void now;
  return out.sort((a, b) => a.skill.localeCompare(b.skill));
}

/**
 * After a mixed session (daily / review / test), skills that were proficient *before* the session and
 * answered correctly in it at least a day after their first practice become "mastered".
 */
export function confirmMastery(data: ProfileData, session: SessionRecord): Record<string, number> {
  if (!['daily', 'review', 'mock', 'short'].includes(session.kind)) return data.mastered;
  const before: ProfileData = { ...data, sessions: data.sessions.filter((s) => s.id !== session.id) };
  const prof = new Set(skillStats(before).filter((s) => s.level === 'proficient' || s.level === 'mastered').map((s) => s.skill));
  const firstSeen = new Map<string, number>();
  for (const r of allResults(before)) for (const s of r.skills) if (!firstSeen.has(s)) firstSeen.set(s, r.at);
  const out = { ...data.mastered };
  for (const r of session.results) {
    if (!r.correct || r.hintsUsed > 0) continue;
    for (const s of r.skills) {
      if (prof.has(s) && (firstSeen.get(s) ?? r.at) <= r.at - DAY && !out[s]) out[s] = r.at;
    }
  }
  return out;
}

// ---------- spaced review (Leitner) ----------

export const REVIEW_INTERVALS_DAYS = [0.5, 1, 3, 7, 14, 30];

/** Update review cards from one session's results. Misses go to box 0 (soon); review hits move up. */
export function updateReview(cards: ReviewCard[], session: SessionRecord, now = Date.now()): ReviewCard[] {
  const map = new Map(cards.map((c) => [c.skill, { ...c }]));
  for (const r of session.results) {
    if (SUBTESTS[r.subtest]?.kind === 'speeded') continue;
    const skill = r.skills.find(isLadderSkill) ?? r.skills[0];
    if (!skill) continue;
    const card = map.get(skill);
    if (!r.correct) {
      map.set(skill, {
        skill,
        subtest: r.subtest,
        box: 0,
        due: now + REVIEW_INTERVALS_DAYS[0] * DAY,
        retry: { difficulty: r.difficulty, seed: r.seed, variant: variantFromId(r.itemId) },
        lastSeen: now,
      });
    } else if (card && card.due <= now + 60_000) {
      const box = Math.min(REVIEW_INTERVALS_DAYS.length - 1, card.box + 1);
      map.set(skill, { ...card, box, due: now + REVIEW_INTERVALS_DAYS[box] * DAY, retry: undefined, lastSeen: now });
    }
  }
  return [...map.values()];
}

/** Variant names are embedded in some item ids (e.g. "DS:backward:4:123"); recover them for exact retries. */
export function variantFromId(id: string): string | undefined {
  const parts = id.split(':');
  if (parts[0] === 'DS' && ['forward', 'backward', 'sequencing'].includes(parts[1])) return parts[1];
  return undefined;
}

export function dueReviews(cards: ReviewCard[], now = Date.now()): ReviewCard[] {
  return cards.filter((c) => c.due <= now).sort((a, b) => a.box - b.box || a.due - b.due);
}

// ---------- stars, XP, levels ----------

/** 3 stars: right on the first try with no hints; 2: right with help; 1: had a go (effort counts). */
export function starsFor(r: ItemResult): number {
  if (SUBTESTS[r.subtest]?.kind === 'speeded') return r.points > 0 ? 3 : 1;
  if (r.correct && r.hintsUsed === 0 && r.attempts === 1) return 3;
  if (r.correct || r.points > 0) return 2;
  return 1;
}

export function totalXp(data: ProfileData): number {
  return allResults(data).reduce((a, r) => a + starsFor(r), 0) + data.badges.length * 10;
}

export interface LevelInfo { level: number; title: string; into: number; needed: number }

const LEVEL_TITLES = ['Camper', 'Trail Finder', 'Explorer', 'Pathfinder', 'Ranger', 'Trailblazer', 'Summit Seeker', 'Camp Legend'];

export function levelFor(xp: number): LevelInfo {
  let level = 1;
  let need = 60;
  let rest = xp;
  while (rest >= need) {
    rest -= need;
    level += 1;
    need = Math.round(need * 1.25);
  }
  return { level, title: LEVEL_TITLES[Math.min(LEVEL_TITLES.length - 1, Math.floor((level - 1) / 2))], into: rest, needed: need };
}

// ---------- streaks ----------

/** Consecutive active days ending today or yesterday; one missed day is forgiven per streak. */
export function currentStreak(activeDays: string[], today = dayKey()): number {
  const set = new Set(activeDays);
  const d = new Date(`${today}T12:00:00`);
  if (!set.has(today)) d.setDate(d.getDate() - 1);
  let streak = 0;
  let forgiven = false;
  for (let i = 0; i < 400; i++) {
    const key = dayKey(d);
    if (set.has(key)) streak += 1;
    else if (!forgiven && streak > 0 && set.has(dayKey(new Date(d.getTime() - DAY)))) forgiven = true;
    else break;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export function minutesToday(data: ProfileData, today = dayKey()): number {
  let ms = 0;
  for (const s of data.sessions) {
    if (dayKey(s.startedAt) !== today) continue;
    ms += s.results.reduce((a, r) => a + Math.min(r.timeMs, 180_000), 0);
  }
  return Math.round(ms / 60000);
}

// ---------- badges ----------

export interface BadgeDef { id: string; icon: string; name: string; description: string; earned: (d: ProfileData) => boolean }

const zoneTried = (d: ProfileData, zone: string) =>
  allResults(d).some((r) => SUBTESTS[r.subtest]?.zone === zone);

export const BADGES: BadgeDef[] = [
  { id: 'first-steps', icon: '🥾', name: 'First Steps', description: 'Finished your first game.', earned: (d) => d.sessions.some((s) => s.completed) },
  { id: 'word-woods', icon: '🌲', name: 'Word Woods Explorer', description: 'Played a game in Word Woods.', earned: (d) => zoneTried(d, 'VCI') },
  { id: 'block-canyon', icon: '🏜️', name: 'Canyon Builder', description: 'Played a game in Block Canyon.', earned: (d) => zoneTried(d, 'VSI') },
  { id: 'puzzle-peaks', icon: '⛰️', name: 'Peak Climber', description: 'Played a game in Puzzle Peaks.', earned: (d) => zoneTried(d, 'FRI') },
  { id: 'memory-lake', icon: '🏞️', name: 'Lake Diver', description: 'Played a game at Memory Lake.', earned: (d) => zoneTried(d, 'WMI') },
  { id: 'speedy-rapids', icon: '🌊', name: 'Rapids Racer', description: 'Played a game on Speedy Rapids.', earned: (d) => zoneTried(d, 'PSI') },
  { id: 'all-zones', icon: '🗺️', name: 'Map Master', description: 'Explored all five camp zones.', earned: (d) => ['VCI', 'VSI', 'FRI', 'WMI', 'PSI'].every((z) => zoneTried(d, z)) },
  { id: 'streak-3', icon: '🔥', name: 'Campfire 3', description: 'Practised 3 days in a row.', earned: (d) => currentStreak(d.activeDays) >= 3 },
  { id: 'streak-7', icon: '🏕️', name: 'Week at Camp', description: 'Practised 7 days in a row.', earned: (d) => currentStreak(d.activeDays) >= 7 },
  { id: 'comeback', icon: '💪', name: 'Comeback Kid', description: 'Got one right right after a miss.', earned: (d) => d.sessions.some((s) => s.results.some((r, i) => i > 0 && r.correct && !s.results[i - 1].correct)) },
  { id: 'brave', icon: '🦁', name: 'Brave Brain', description: 'Tried 10 tricky challenge items.', earned: (d) => {
    const rs = allResults(d);
    return rs.filter((r) => r.difficulty > (d.sessions.find((s) => s.results.includes(r))?.age ?? 99) + 1).length >= 10;
  } },
  { id: 'helper', icon: '💡', name: 'Smart Helper', description: 'Used a hint and then got it right.', earned: (d) => allResults(d).some((r) => r.hintsUsed > 0 && r.correct) },
  { id: 'hundred', icon: '💯', name: '100 Answers', description: 'Answered 100 questions.', earned: (d) => allResults(d).length >= 100 },
  { id: 'mock', icon: '🎓', name: 'Test Day Hero', description: 'Finished a whole camp challenge (mock test).', earned: (d) => d.sessions.some((s) => s.kind === 'mock' && s.completed) },
  { id: 'mastered', icon: '🏅', name: 'Master Skill', description: 'Mastered your first skill.', earned: (d) => Object.keys(d.mastered).length > 0 },
  { id: 'reviewer', icon: '🔁', name: 'Memory Keeper', description: 'Finished a review quest.', earned: (d) => d.sessions.some((s) => s.kind === 'review' && s.completed) },
];

export function newBadges(data: ProfileData, now = Date.now()): { id: string; at: number }[] {
  const have = new Set(data.badges.map((b) => b.id));
  return BADGES.filter((b) => !have.has(b.id) && b.earned(data)).map((b) => ({ id: b.id, at: now }));
}
