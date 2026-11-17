/**
 * Small seeded random generator (mulberry32). Generators must use this — never Math.random —
 * so an item can be regenerated exactly from (subtest, difficulty, seed) for review later.
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  pick<T>(arr: readonly T[]): T;
  shuffle<T>(arr: readonly T[]): T[];
  /** `n` distinct elements. */
  sample<T>(arr: readonly T[], n: number): T[];
  chance(p: number): boolean;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0 || 0x9e3779b9;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const shuffle = <T,>(arr: readonly T[]) => {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  return {
    next,
    int,
    pick: (arr) => {
      if (arr.length === 0) throw new Error('pick from empty array');
      return arr[Math.floor(next() * arr.length)];
    },
    shuffle,
    sample: (arr, n) => {
      if (n > arr.length) throw new Error(`cannot sample ${n} from ${arr.length}`);
      return shuffle(arr).slice(0, n);
    },
    chance: (p) => next() < p,
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** Clamp then round difficulty into an integer "level" band, handy for generator tables. */
export function difficultyBand(difficulty: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(difficulty)));
}
