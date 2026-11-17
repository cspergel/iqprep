/**
 * Practice score estimation.
 *
 * These are ESTIMATES built on a simple, transparent model — not the publisher's norm tables.
 * Item difficulty lives on an age-equivalent scale (years). A child's ability (theta) is estimated
 * with a one-parameter logistic (Rasch-style) model and an expected-a-posteriori (EAP) estimate,
 * then converted to the familiar WISC-style metrics:
 *   scaled score   mean 10, SD 3, range 1–19
 *   composite      mean 100, SD 15, range 40–160
 */
import { COMPOSITES, FSIQ_SUBTESTS, PRIMARY_INDEXES, PRIMARY_SUBTESTS, SUBTESTS } from './subtestInfo';
import type { CompositeId, PrimaryIndexId, SubtestId } from './types';

// ---------- ability model ----------

/** Spread (1 SD) of ability within an age group, in years of development. Wider for older kids. */
export function sdForAge(age: number): number {
  return 0.22 * age + 0.2;
}

/** Logistic slope: an item 1 SD above ability is passed ~15% of the time. */
const SLOPE = 1.7;

export function probCorrect(theta: number, difficulty: number, age: number): number {
  return 1 / (1 + Math.exp((-SLOPE * (theta - difficulty)) / sdForAge(age)));
}

export interface Observation {
  difficulty: number;
  points: number;
  maxPoints: number;
}

export interface AbilityEstimate {
  theta: number;
  se: number;
  n: number;
}

/**
 * EAP estimate on a grid. Partial-credit items (0/1/2) are treated as `maxPoints` Bernoulli trials.
 * The prior is centred on the child's age so a handful of answers can't produce wild scores.
 */
export function estimateAbility(obs: Observation[], age: number, priorWidth = 1.6): AbilityEstimate {
  const sd = sdForAge(age);
  const priorSd = sd * priorWidth;
  // Symmetric grid: clipping the low end would bias the estimate upward for young children.
  const lo = age - 6 * sd;
  const hi = age + 6 * sd;
  const step = (hi - lo) / 400;
  let sumW = 0;
  let sumWT = 0;
  let sumWT2 = 0;
  for (let t = lo; t <= hi; t += step) {
    let logL = -0.5 * ((t - age) / priorSd) ** 2;
    for (const o of obs) {
      const p = Math.min(1 - 1e-9, Math.max(1e-9, probCorrect(t, o.difficulty, age)));
      const x = Math.max(0, Math.min(o.maxPoints, o.points));
      logL += x * Math.log(p) + (o.maxPoints - x) * Math.log(1 - p);
    }
    const w = Math.exp(logL);
    sumW += w;
    sumWT += w * t;
    sumWT2 += w * t * t;
  }
  if (sumW === 0) return { theta: age, se: priorSd, n: obs.length };
  const theta = sumWT / sumW;
  const variance = Math.max(0, sumWT2 / sumW - theta * theta);
  return { theta, se: Math.sqrt(variance), n: obs.length };
}

export function clampScaled(x: number): number {
  return Math.max(1, Math.min(19, Math.round(x)));
}

export function scaledFromTheta(theta: number, age: number): number {
  return clampScaled(10 + (3 * (theta - age)) / sdForAge(age));
}

/** Difficulty an item should have so this child passes it with probability `p`. */
export function difficultyForSuccess(theta: number, age: number, p: number): number {
  return theta - (sdForAge(age) / SLOPE) * Math.log(p / (1 - p));
}

/** Test-age equivalent shown as years:months, bounded like the real report ("<6:2", ">16:10"). */
export function ageEquivalent(theta: number): string {
  if (theta < 6.17) return '<6:2';
  if (theta > 16.9) return '>16:10';
  const years = Math.floor(theta);
  const months = Math.floor((theta - years) * 12);
  return `${years}:${months}`;
}

// ---------- speeded tasks ----------

interface NormPoint { age: number; mean: number; sd: number }

/**
 * Rough expectations for this app's on-screen versions, expressed per standard duration.
 * Coding / Symbol Search switch from version A to B at age 8, so they have separate tables.
 * These are approximations for practice feedback, not published norms.
 */
const SPEEDED_NORMS: Record<string, { duration: number; points: NormPoint[] }> = {
  'CD-A': { duration: 120, points: [{ age: 6, mean: 24, sd: 7 }, { age: 7, mean: 31, sd: 8 }, { age: 8, mean: 36, sd: 8 }] },
  'CD-B': { duration: 120, points: [{ age: 8, mean: 33, sd: 9 }, { age: 10, mean: 44, sd: 10 }, { age: 12, mean: 55, sd: 11 }, { age: 14, mean: 63, sd: 12 }, { age: 16.9, mean: 70, sd: 12 }] },
  'SS-A': { duration: 120, points: [{ age: 6, mean: 18, sd: 6 }, { age: 7, mean: 23, sd: 6 }, { age: 8, mean: 27, sd: 7 }] },
  'SS-B': { duration: 120, points: [{ age: 8, mean: 19, sd: 6 }, { age: 10, mean: 26, sd: 7 }, { age: 12, mean: 31, sd: 7 }, { age: 14, mean: 35, sd: 8 }, { age: 16.9, mean: 39, sd: 8 }] },
  // Cancellation: per one 45-second sheet (correct marks minus wrong marks).
  CA: { duration: 45, points: [{ age: 6, mean: 20, sd: 8 }, { age: 7, mean: 25, sd: 8 }, { age: 10, mean: 35, sd: 9 }, { age: 13, mean: 42, sd: 9 }, { age: 16.9, mean: 47, sd: 9 }] },
  // Naming speed: items named correctly per minute.
  NSL: { duration: 60, points: [{ age: 6, mean: 38, sd: 10 }, { age: 7, mean: 46, sd: 11 }, { age: 10, mean: 62, sd: 12 }, { age: 13, mean: 74, sd: 13 }, { age: 16.9, mean: 84, sd: 13 }] },
  NSQ: { duration: 60, points: [{ age: 6, mean: 32, sd: 9 }, { age: 7, mean: 39, sd: 10 }, { age: 10, mean: 52, sd: 11 }, { age: 13, mean: 62, sd: 12 }, { age: 16.9, mean: 70, sd: 12 }] },
};

export function speededNormKey(subtest: SubtestId, age: number): string {
  if (subtest === 'CD' || subtest === 'SS') return `${subtest}-${age < 8 ? 'A' : 'B'}`;
  return subtest;
}

function interpolateNorm(points: NormPoint[], age: number): { mean: number; sd: number } {
  if (age <= points[0].age) return points[0];
  const last = points[points.length - 1];
  if (age >= last.age) return last;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (age <= b.age) {
      const f = (age - a.age) / (b.age - a.age);
      return { mean: a.mean + f * (b.mean - a.mean), sd: a.sd + f * (b.sd - a.sd) };
    }
  }
  return last;
}

/** Expected raw score for a typical child of this age, over `durationSec`. */
export function expectedSpeededRaw(subtest: SubtestId, age: number, durationSec?: number): number {
  const norm = SPEEDED_NORMS[speededNormKey(subtest, age)];
  if (!norm) throw new Error(`no speeded norms for ${subtest}`);
  const { mean } = interpolateNorm(norm.points, age);
  return mean * ((durationSec ?? norm.duration) / norm.duration);
}

/** Scaled score for a speeded sheet. `raw` earned in `durationSec` is rescaled to the standard duration. */
export function scaledFromSpeeded(subtest: SubtestId, raw: number, age: number, durationSec: number): number {
  const norm = SPEEDED_NORMS[speededNormKey(subtest, age)];
  if (!norm) throw new Error(`no speeded norms for ${subtest}`);
  const { mean, sd } = interpolateNorm(norm.points, age);
  const rate = durationSec > 0 ? (raw * norm.duration) / durationSec : 0;
  return clampScaled(10 + (3 * (rate - mean)) / sd);
}

// ---------- composites ----------

/**
 * Convert a sum of k scaled scores to a composite standard score.
 * The SD of a sum of k correlated scores (each SD 3, mean intercorrelation r) is 3·√(k + k(k−1)r).
 */
export function compositeFromScaled(scaled: number[], avgR: number, range: [number, number] = [40, 160]): number {
  const k = scaled.length;
  if (k === 0) throw new Error('no scaled scores');
  const sum = scaled.reduce((a, b) => a + b, 0);
  const sdSum = 3 * Math.sqrt(k + k * (k - 1) * avgR);
  const z = (sum - 10 * k) / sdSum;
  return Math.max(range[0], Math.min(range[1], Math.round(100 + 15 * z)));
}

/** Reported range: primary and complementary indexes run 45–155; FSIQ and the ancillary composites 40–160. */
export function compositeRange(id: CompositeId): [number, number] {
  const fam = COMPOSITES[id].family;
  return fam === 'primary' || fam === 'complementary' ? [45, 155] : [40, 160];
}

/** Combine two composite standard scores into one (used for SRI = NSI + STI). */
export function compositeFromComposites(scores: number[], avgR: number, range: [number, number] = [40, 160]): number {
  const k = scores.length;
  const sumZ = scores.reduce((a, s) => a + (s - 100) / 15, 0);
  const z = sumZ / Math.sqrt(k + k * (k - 1) * avgR);
  return Math.max(range[0], Math.min(range[1], Math.round(100 + 15 * z)));
}

// ---------- descriptive statistics ----------

/** Standard normal CDF (Abramowitz–Stegun 7.1.26 via erf). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

export function percentileRank(score: number, mean = 100, sd = 15): number {
  return 100 * normalCdf((score - mean) / sd);
}

export function formatPercentile(p: number): string {
  if (p < 0.1) return '<0.1';
  if (p > 99.9) return '>99.9';
  if (p < 1 || p > 99) return p.toFixed(1);
  return String(Math.round(p));
}

/**
 * Confidence interval the way Wechsler reports compute it: centred on the estimated true score
 * T = mean + r·(X − mean) with the standard error of estimation SEE = SD·√(r(1 − r)).
 * (So intervals lean slightly toward the mean for extreme scores.)
 */
export function confidenceInterval(score: number, reliability: number, level: 90 | 95 = 95, sd = 15, mean = 100): [number, number] {
  const trueScore = mean + reliability * (score - mean);
  const see = sd * Math.sqrt(reliability * (1 - reliability));
  const z = level === 95 ? 1.96 : 1.645;
  return [Math.round(trueScore - z * see), Math.round(trueScore + z * see)];
}

export type Classification =
  | 'Extremely High' | 'Very High' | 'High Average' | 'Average' | 'Low Average' | 'Very Low' | 'Extremely Low';

export function classify(composite: number): Classification {
  if (composite >= 130) return 'Extremely High';
  if (composite >= 120) return 'Very High';
  if (composite >= 110) return 'High Average';
  if (composite >= 90) return 'Average';
  if (composite >= 80) return 'Low Average';
  if (composite >= 70) return 'Very Low';
  return 'Extremely Low';
}

/** Same bands expressed on the scaled-score metric (mean 10, SD 3). */
export function classifyScaled(scaled: number): Classification {
  return classify(100 + 5 * (scaled - 10));
}

// ---------- full profile ----------

export interface CompositeScore {
  id: CompositeId;
  score: number;
  sumOfScaled?: number;
  percentile: number;
  ci90: [number, number];
  ci95: [number, number];
  classification: Classification;
}

export type Comparison = 'strength' | 'weakness' | 'none';

export interface IndexComparison {
  id: PrimaryIndexId;
  score: number;
  diffFromMean: number;
  comparison: Comparison;
}

export interface SubtestComparison {
  id: SubtestId;
  scaled: number;
  diffFromMean: number;
  comparison: Comparison;
}

export interface PairwiseComparison {
  a: CompositeId | SubtestId;
  b: CompositeId | SubtestId;
  scoreA: number;
  scoreB: number;
  diff: number;
  significant: boolean;
}

export interface ProfileScores {
  composites: Partial<Record<CompositeId, CompositeScore>>;
  /** Composites that couldn't be computed and which subtests they still need. */
  missing: Partial<Record<CompositeId, SubtestId[]>>;
  meanIndexScore?: number;
  indexComparisons: IndexComparison[];
  meanScaledScore?: number;
  /** MSS-P = mean of the 10 primary subtests; MSS-F = mean of the 7 FSIQ subtests; partial = whatever primaries exist. */
  meanScaledBasis?: 'MSS-P' | 'MSS-F' | 'partial';
  subtestComparisons: SubtestComparison[];
  pairwise: PairwiseComparison[];
}

/**
 * Approximate critical values at p ≈ .05 (Wechsler .01 values × ~0.76: index vs MIS ≈ 11–15 at .01,
 * subtest vs MSS ≈ 2.4–4.2, index pairs ≈ 14.5–19, subtest pairs ≈ 3.4–4.8).
 */
export const CRITICAL = {
  indexVsMean: 10,
  subtestVsMean: 3,
  indexPair: 13,
  subtestPair: 4,
};

function buildComposite(id: CompositeId, score: number, sumOfScaled?: number): CompositeScore {
  const info = COMPOSITES[id];
  return {
    id,
    score,
    sumOfScaled,
    percentile: percentileRank(score),
    ci90: confidenceInterval(score, info.reliability, 90),
    ci95: confidenceInterval(score, info.reliability, 95),
    classification: classify(score),
  };
}

export function computeProfile(scaled: Partial<Record<SubtestId, number>>): ProfileScores {
  const composites: Partial<Record<CompositeId, CompositeScore>> = {};
  const missing: Partial<Record<CompositeId, SubtestId[]>> = {};

  for (const info of Object.values(COMPOSITES)) {
    if (info.id === 'SRI') continue;
    const need = info.subtests.filter((s) => scaled[s] === undefined);
    if (need.length > 0) {
      missing[info.id] = need;
      continue;
    }
    const values = info.subtests.map((s) => scaled[s] as number);
    composites[info.id] = buildComposite(info.id, compositeFromScaled(values, info.avgR, compositeRange(info.id)), values.reduce((a, b) => a + b, 0));
  }
  if (composites.NSI && composites.STI) {
    composites.SRI = buildComposite('SRI', compositeFromComposites([composites.NSI.score, composites.STI.score], COMPOSITES.SRI.avgR, compositeRange('SRI')));
  } else {
    missing.SRI = [...(missing.NSI ?? []), ...(missing.STI ?? [])];
  }

  // Index-level strengths and weaknesses vs the mean of available primary indexes.
  const indexes = PRIMARY_INDEXES.filter((id) => composites[id]);
  let meanIndexScore: number | undefined;
  const indexComparisons: IndexComparison[] = [];
  if (indexes.length >= 3) {
    meanIndexScore = indexes.reduce((a, id) => a + composites[id]!.score, 0) / indexes.length;
    for (const id of indexes) {
      const diff = composites[id]!.score - meanIndexScore;
      indexComparisons.push({
        id,
        score: composites[id]!.score,
        diffFromMean: diff,
        comparison: diff >= CRITICAL.indexVsMean ? 'strength' : diff <= -CRITICAL.indexVsMean ? 'weakness' : 'none',
      });
    }
  }

  // Subtest-level strengths and weaknesses vs MSS-P (all 10 primaries), MSS-F (the 7 FSIQ subtests),
  // or — for partial practice batteries — whatever primary subtests exist.
  const available = (Object.keys(scaled) as SubtestId[]).filter((s) => SUBTESTS[s].tier === 'primary');
  let primaries = available;
  let meanScaledBasis: ProfileScores['meanScaledBasis'];
  if (PRIMARY_SUBTESTS.every((s) => scaled[s] !== undefined)) {
    primaries = PRIMARY_SUBTESTS;
    meanScaledBasis = 'MSS-P';
  } else if (FSIQ_SUBTESTS.every((s) => scaled[s] !== undefined)) {
    primaries = FSIQ_SUBTESTS;
    meanScaledBasis = 'MSS-F';
  } else if (available.length >= 4) {
    meanScaledBasis = 'partial';
  }
  let meanScaledScore: number | undefined;
  const subtestComparisons: SubtestComparison[] = [];
  if (meanScaledBasis) {
    meanScaledScore = primaries.reduce((a, s) => a + (scaled[s] as number), 0) / primaries.length;
    for (const s of primaries) {
      const diff = (scaled[s] as number) - meanScaledScore;
      subtestComparisons.push({
        id: s,
        scaled: scaled[s] as number,
        diffFromMean: diff,
        comparison: diff >= CRITICAL.subtestVsMean ? 'strength' : diff <= -CRITICAL.subtestVsMean ? 'weakness' : 'none',
      });
    }
  }

  // Pairwise index comparisons, plus the classic within-index subtest pairs.
  const pairwise: PairwiseComparison[] = [];
  for (let i = 0; i < indexes.length; i++) {
    for (let j = i + 1; j < indexes.length; j++) {
      const a = composites[indexes[i]]!.score;
      const b = composites[indexes[j]]!.score;
      pairwise.push({ a: indexes[i], b: indexes[j], scoreA: a, scoreB: b, diff: a - b, significant: Math.abs(a - b) >= CRITICAL.indexPair });
    }
  }
  const compositePairs: [CompositeId, CompositeId][] = [['GAI', 'FSIQ'], ['GAI', 'CPI'], ['WMI', 'AWMI'], ['NSI', 'STI']];
  for (const [a, b] of compositePairs) {
    const ca = composites[a];
    const cb = composites[b];
    if (!ca || !cb) continue;
    // GAI and FSIQ share most of their subtests, so a much smaller gap is meaningful.
    const crit = a === 'GAI' && b === 'FSIQ' ? 4 : CRITICAL.indexPair;
    pairwise.push({ a, b, scoreA: ca.score, scoreB: cb.score, diff: ca.score - cb.score, significant: Math.abs(ca.score - cb.score) >= crit });
  }
  const subtestPairs: [SubtestId, SubtestId][] = [
    ['SI', 'VC'], ['BD', 'VP'], ['MR', 'FW'], ['DS', 'PS'], ['CD', 'SS'],
    ['FW', 'AR'], ['DS', 'LN'], ['NSL', 'NSQ'], ['IST', 'DST'], ['IST', 'RST'], ['DST', 'RST'],
  ];
  for (const [a, b] of subtestPairs) {
    const sa = scaled[a];
    const sb = scaled[b];
    if (sa === undefined || sb === undefined) continue;
    pairwise.push({ a, b, scoreA: sa, scoreB: sb, diff: sa - sb, significant: Math.abs(sa - sb) >= CRITICAL.subtestPair });
  }

  return { composites, missing, meanIndexScore, indexComparisons, meanScaledScore, meanScaledBasis, subtestComparisons, pairwise };
}
