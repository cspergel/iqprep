import { describe, expect, it } from 'vitest';
import { confirmMastery, currentStreak, dueReviews, levelFor, newBadges, skillStats, starsFor, updateReview } from './progress';
import { ageOn, emptyData, type ProfileData, type SessionRecord } from './storage';
import type { ItemResult } from './types';

const DAY = 86_400_000;
let k = 0;
function res(correct: boolean, at: number, extra: Partial<ItemResult> = {}): ItemResult {
  k += 1;
  return {
    itemId: `MR:${k}`, subtest: 'MR', difficulty: 7, seed: k, points: correct ? 1 : 0, maxPoints: 1, correct,
    timeMs: 5000, overTime: false, hintsUsed: 0, attempts: 1, skills: ['mr:progression'], mode: 'practice', at, ...extra,
  };
}
function session(results: ItemResult[], kind: SessionRecord['kind'] = 'practice', id = `s${k}`): SessionRecord {
  return { id, kind, title: '', mode: 'practice', startedAt: results[0]?.at ?? 0, age: 7, subtests: ['MR'], results, completed: true };
}
function data(sessions: SessionRecord[]): ProfileData {
  return { ...emptyData('p'), sessions };
}

describe('stars', () => {
  it('3 for clean first-try, 2 with help, 1 for trying', () => {
    expect(starsFor(res(true, 0))).toBe(3);
    expect(starsFor(res(true, 0, { hintsUsed: 1 }))).toBe(2);
    expect(starsFor(res(true, 0, { attempts: 2 }))).toBe(2);
    expect(starsFor(res(false, 0))).toBe(1);
  });
});

describe('mastery ladder', () => {
  it('moves from attempted to familiar to proficient with accuracy', () => {
    const t = 1_000_000;
    expect(skillStats(data([session([res(true, t), res(false, t)])]))[0].level).toBe('attempted');
    expect(skillStats(data([session([res(true, t), res(true, t), res(true, t), res(false, t), res(true, t)])]))[0].level).toBe('familiar');
    expect(skillStats(data([session(Array.from({ length: 8 }, () => res(true, t)))]))[0].level).toBe('proficient');
  });

  it('decays after two misses in the last three', () => {
    const t = 1_000_000;
    const d = data([session([...Array.from({ length: 8 }, () => res(true, t)), res(false, t), res(true, t), res(false, t)])]);
    expect(skillStats(d)[0].level).not.toBe('proficient');
  });

  it('confirms mastery only in a later mixed session', () => {
    const t0 = 10 * DAY;
    const base = session(Array.from({ length: 8 }, () => res(true, t0)), 'practice', 'a');
    const sameDayDaily = session([res(true, t0 + 1000)], 'daily', 'b');
    expect(confirmMastery(data([base, sameDayDaily]), sameDayDaily)).toEqual({});
    const laterDaily = session([res(true, t0 + 2 * DAY)], 'daily', 'c');
    expect(Object.keys(confirmMastery(data([base, laterDaily]), laterDaily))).toEqual(['mr:progression']);
    const laterPractice = session([res(true, t0 + 2 * DAY)], 'practice', 'd');
    expect(confirmMastery(data([base, laterPractice]), laterPractice)).toEqual({});
  });
});

describe('spaced review', () => {
  it('a miss creates a card with an exact retry; a later hit moves it up a box', () => {
    const now = 100 * DAY;
    const miss = res(false, now);
    let cards = updateReview([], session([miss]), now);
    expect(cards).toHaveLength(1);
    expect(cards[0].box).toBe(0);
    expect(cards[0].retry?.seed).toBe(miss.seed);
    expect(dueReviews(cards, now)).toHaveLength(0);
    expect(dueReviews(cards, now + DAY)).toHaveLength(1);
    cards = updateReview(cards, session([res(true, now + DAY)]), now + DAY);
    expect(cards[0].box).toBe(1);
    expect(cards[0].due).toBe(now + 2 * DAY);
  });
});

describe('streaks', () => {
  it('counts consecutive days and forgives one gap', () => {
    expect(currentStreak(['2026-10-07', '2026-10-08', '2026-10-09'], '2026-10-09')).toBe(3);
    expect(currentStreak(['2026-10-07', '2026-10-08'], '2026-10-09')).toBe(2); // today not played yet
    expect(currentStreak(['2026-10-05', '2026-10-06', '2026-10-08', '2026-10-09'], '2026-10-09')).toBe(4);
    expect(currentStreak(['2026-10-04', '2026-10-05', '2026-10-08', '2026-10-09'], '2026-10-09')).toBe(2);
    expect(currentStreak([], '2026-10-09')).toBe(0);
  });
});

describe('levels and badges', () => {
  it('levels need more XP each time', () => {
    expect(levelFor(0).level).toBe(1);
    expect(levelFor(59).level).toBe(1);
    expect(levelFor(60).level).toBe(2);
    expect(levelFor(60 + 75).level).toBe(3);
  });

  it('awards first-steps and comeback once', () => {
    const d = data([session([res(false, 1), res(true, 2)])]);
    const ids = newBadges(d).map((b) => b.id);
    expect(ids).toContain('first-steps');
    expect(ids).toContain('comeback');
    expect(ids).toContain('puzzle-peaks');
    d.badges = newBadges(d);
    expect(newBadges(d)).toHaveLength(0);
  });
});

describe('ageOn', () => {
  it('computes fractional age', () => {
    expect(ageOn('2019-04-09', new Date(2026, 9, 9))).toBeCloseTo(7.5, 1);
    expect(Math.floor(ageOn('2019-10-10', new Date(2026, 9, 9)))).toBe(6);
    expect(Math.floor(ageOn('2019-10-09', new Date(2026, 9, 9)))).toBe(7);
  });
});
