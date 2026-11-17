import { describe, expect, it } from 'vitest';
import {
  ageEquivalent, classify, compositeFromComposites, compositeFromScaled, compositeRange, computeProfile, confidenceInterval,
  difficultyForSuccess, estimateAbility, expectedSpeededRaw, formatPercentile, percentileRank, probCorrect,
  scaledFromSpeeded, scaledFromTheta, sdForAge,
} from './scoring';
import { COMPOSITES } from './subtestInfo';
import type { SubtestId } from './types';

describe('compositeFromScaled', () => {
  it('maps average subtests to exactly 100', () => {
    expect(compositeFromScaled([10, 10], 0.68)).toBe(100);
    expect(compositeFromScaled([10, 10, 10, 10, 10, 10, 10], COMPOSITES.FSIQ.avgR)).toBe(100);
  });

  it('uses the correlated-sum SD: seven 13s give FSIQ 123', () => {
    // z = 21 / (3·√(7 + 42·0.315)) = 1.556  →  100 + 15·1.556 = 123.3
    expect(compositeFromScaled([13, 13, 13, 13, 13, 13, 13], COMPOSITES.FSIQ.avgR)).toBe(123);
  });

  it('reproduces published sample-report composites within ±1 (age 8:10 profile)', () => {
    // Σss → published composite: VCI 22→106, VSI 24→111, FRI 18→94, WMI 14→82, PSI 18→95.
    const cases: [number[], number, number][] = [
      [[11, 11], COMPOSITES.VCI.avgR, 106], [[12, 12], COMPOSITES.VSI.avgR, 111], [[9, 9], COMPOSITES.FRI.avgR, 94],
      [[7, 7], COMPOSITES.WMI.avgR, 82], [[9, 9], COMPOSITES.PSI.avgR, 95],
    ];
    for (const [ss, r, actual] of cases) expect(Math.abs(compositeFromScaled(ss, r) - actual)).toBeLessThanOrEqual(1);
  });

  it('is symmetric around 100 and monotone in each subtest', () => {
    expect(compositeFromScaled([7, 7], 0.5)).toBe(200 - compositeFromScaled([13, 13], 0.5));
    expect(compositeFromScaled([12, 10], 0.5)).toBeGreaterThan(compositeFromScaled([11, 10], 0.5));
  });

  it('clamps to the 40–160 range, or a narrower range when given', () => {
    expect(compositeFromScaled(Array(7).fill(19), 0.43)).toBe(160);
    expect(compositeFromScaled(Array(7).fill(1), 0.43)).toBe(40);
    expect(compositeFromScaled([19, 19], 0.54)).toBe(151); // unclamped linear value
    expect(compositeFromScaled([19, 19], 0, compositeRange('VCI'))).toBe(155); // z = 4.24 → 164, clamped
    expect(compositeFromScaled([1, 1], 0, compositeRange('VCI'))).toBe(45);
    expect(compositeRange('FSIQ')).toEqual([40, 160]);
  });

  it('throws on empty input', () => {
    expect(() => compositeFromScaled([], 0.5)).toThrow();
  });
});

describe('compositeFromComposites', () => {
  it('combines index scores and keeps 100 at 100', () => {
    expect(compositeFromComposites([100, 100], 0.35)).toBe(100);
    // z = (1 + 1) / √(2 + 2·0.35) = 1.217 → 118
    expect(compositeFromComposites([115, 115], 0.35)).toBe(118);
    expect(compositeFromComposites([160, 160], 0.35, [45, 155])).toBe(155);
  });
});

describe('classify (WISC-V descriptive bands)', () => {
  it.each([
    [130, 'Extremely High'], [129, 'Very High'], [120, 'Very High'], [119, 'High Average'],
    [110, 'High Average'], [109, 'Average'], [90, 'Average'], [89, 'Low Average'],
    [80, 'Low Average'], [79, 'Very Low'], [70, 'Very Low'], [69, 'Extremely Low'],
  ])('%i → %s', (score, label) => {
    expect(classify(score)).toBe(label);
  });
});

describe('percentiles and confidence intervals', () => {
  it('matches the normal curve', () => {
    expect(percentileRank(100)).toBeCloseTo(50, 5);
    expect(percentileRank(115)).toBeCloseTo(84.13, 1);
    expect(percentileRank(130)).toBeCloseTo(97.72, 1);
    expect(percentileRank(70)).toBeCloseTo(2.28, 1);
  });

  it('formats extremes the way reports do', () => {
    expect(formatPercentile(0.05)).toBe('<0.1');
    expect(formatPercentile(99.95)).toBe('>99.9');
    expect(formatPercentile(99.6)).toBe('99.6');
    expect(formatPercentile(84.13)).toBe('84');
  });

  it('builds CIs around the estimated true score (matches published report: FSIQ 97 → 91–103)', () => {
    expect(confidenceInterval(97, 0.96, 95)).toEqual([91, 103]);
    expect(confidenceInterval(100, 0.96, 90)).toEqual([95, 105]);
    // Extreme scores regress toward the mean: 130 with r = .92 → T = 127.6
    const [lo, hi] = confidenceInterval(130, 0.92, 95);
    expect((lo + hi) / 2).toBeLessThan(130);
    expect(hi).toBeGreaterThan(130);
  });
});

describe('ability estimation', () => {
  const age = 7;
  const items = (n: number, correct: number) =>
    Array.from({ length: n }, (_, i) => ({ difficulty: age, points: i < correct ? 1 : 0, maxPoints: 1 }));

  it('a typical score at age level gives scaled 10', () => {
    expect(scaledFromTheta(age, age)).toBe(10);
    const est = estimateAbility(items(10, 5), age);
    expect(est.theta).toBeCloseTo(age, 1);
  });

  it('more correct answers means higher ability (monotone)', () => {
    const thetas = [0, 3, 5, 7, 10].map((c) => estimateAbility(items(10, c), age).theta);
    for (let i = 1; i < thetas.length; i++) expect(thetas[i]).toBeGreaterThan(thetas[i - 1]);
    expect(scaledFromTheta(thetas[4], age)).toBeGreaterThanOrEqual(14);
    expect(scaledFromTheta(thetas[0], age)).toBeLessThanOrEqual(6);
  });

  it('passing harder items earns more than passing easier ones', () => {
    const easy = estimateAbility([{ difficulty: 6, points: 1, maxPoints: 1 }, { difficulty: 6.5, points: 1, maxPoints: 1 }], age);
    const hard = estimateAbility([{ difficulty: 10, points: 1, maxPoints: 1 }, { difficulty: 10.5, points: 1, maxPoints: 1 }], age);
    expect(hard.theta).toBeGreaterThan(easy.theta);
  });

  it('treats a 2-point answer as better than a 1-point answer', () => {
    const one = estimateAbility([{ difficulty: 8, points: 1, maxPoints: 2 }], age);
    const two = estimateAbility([{ difficulty: 8, points: 2, maxPoints: 2 }], age);
    expect(two.theta).toBeGreaterThan(one.theta);
  });

  it('with no evidence returns the age-centred prior', () => {
    expect(estimateAbility([], age).theta).toBeCloseTo(age, 2);
  });

  it('difficultyForSuccess inverts probCorrect', () => {
    const d = difficultyForSuccess(8, age, 0.75);
    expect(probCorrect(8, d, age)).toBeCloseTo(0.75, 6);
    expect(d).toBeLessThan(8);
  });

  it('scaled score clamps to 1–19', () => {
    expect(scaledFromTheta(age + 10 * sdForAge(age), age)).toBe(19);
    expect(scaledFromTheta(age - 10 * sdForAge(age), age)).toBe(1);
  });
});

describe('ageEquivalent', () => {
  it('formats years:months and bounds the ends', () => {
    expect(ageEquivalent(7.5)).toBe('7:6');
    expect(ageEquivalent(6.0)).toBe('<6:2');
    expect(ageEquivalent(17.2)).toBe('>16:10');
  });
});

describe('speeded scoring', () => {
  it('a typical raw score is scaled 10, and duration is normalised', () => {
    const typical = expectedSpeededRaw('CD', 7);
    expect(scaledFromSpeeded('CD', typical, 7, 120)).toBe(10);
    expect(scaledFromSpeeded('CD', typical / 2, 7, 60)).toBe(10);
    expect(scaledFromSpeeded('CD', typical + 8, 7, 120)).toBe(13);
  });

  it('switches Coding from version A to B at age 8', () => {
    expect(expectedSpeededRaw('CD', 7.9)).not.toBe(expectedSpeededRaw('CD', 8.0));
  });

  it('scores zero work very low', () => {
    expect(scaledFromSpeeded('SS', 0, 9, 120)).toBe(1);
  });
});

describe('computeProfile', () => {
  const all10 = (): Partial<Record<SubtestId, number>> =>
    ({ SI: 10, VC: 10, BD: 10, VP: 10, MR: 10, FW: 10, DS: 10, PS: 10, CD: 10, SS: 10 });

  it('computes all primary indexes and FSIQ from the ten primary subtests', () => {
    const p = computeProfile(all10());
    for (const id of ['VCI', 'VSI', 'FRI', 'WMI', 'PSI', 'FSIQ', 'GAI', 'CPI', 'NVI'] as const) {
      expect(p.composites[id]?.score).toBe(100);
    }
    expect(p.composites.QRI).toBeUndefined();
    expect(p.missing.QRI).toEqual(['AR']);
    expect(p.missing.AWMI).toEqual(['LN']);
  });

  it('flags a verbal strength and a speed weakness', () => {
    const s = { ...all10(), SI: 15, VC: 15, CD: 6, SS: 6 };
    const p = computeProfile(s);
    const byId = Object.fromEntries(p.indexComparisons.map((c) => [c.id, c.comparison]));
    expect(byId.VCI).toBe('strength');
    expect(byId.PSI).toBe('weakness');
    expect(byId.FRI).toBe('none');
    const vciPsi = p.pairwise.find((x) => x.a === 'VCI' && x.b === 'PSI');
    expect(vciPsi?.significant).toBe(true);
  });

  it('uses MSS-P with all ten primaries, MSS-F with just the FSIQ seven', () => {
    expect(computeProfile(all10()).meanScaledBasis).toBe('MSS-P');
    const fsiqOnly = { SI: 13, VC: 13, BD: 10, MR: 10, FW: 10, DS: 7, CD: 7 };
    const p = computeProfile(fsiqOnly);
    expect(p.meanScaledBasis).toBe('MSS-F');
    expect(p.meanScaledScore).toBeCloseTo(70 / 7, 5);
    expect(p.subtestComparisons.find((c) => c.id === 'SI')?.comparison).toBe('strength');
    expect(p.subtestComparisons.find((c) => c.id === 'CD')?.comparison).toBe('weakness');
    expect(computeProfile({ SI: 10, VC: 10 }).meanScaledBasis).toBeUndefined();
  });

  it('builds SRI only when both NSI and STI exist', () => {
    const p = computeProfile({ NSL: 12, NSQ: 12, IST: 12, DST: 12, RST: 12 });
    expect(p.composites.NSI?.score).toBeGreaterThan(100);
    expect(p.composites.SRI?.score).toBeGreaterThan(100);
    const q = computeProfile({ NSL: 12, NSQ: 12 });
    expect(q.composites.SRI).toBeUndefined();
    expect(q.missing.SRI).toEqual(['IST', 'DST', 'RST']);
  });
});
