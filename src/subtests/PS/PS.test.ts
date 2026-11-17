import { describe, expect, it } from 'vitest';
import {
  PICTURES, POOL_SIZE, PS_LEVELS, categoriesForAge, generate, levelForDifficulty, poolKey, previousSeed, previousTargets, score, sessionPool,
} from './index';

const req = (difficulty: number, seed: number, age = 7) => ({ difficulty, seed, age, mode: 'practice' as const });

describe('Picture Span generator', () => {
  it('is deterministic for a given (difficulty, seed, age)', () => {
    expect(generate(req(8, 42))).toEqual(generate(req(8, 42)));
    expect(generate(req(8, 42)).payload.targets).not.toEqual(generate(req(8, 43)).payload.targets);
  });

  it('grows the span (and never shrinks the page) as difficulty rises, reporting true difficulty', () => {
    let prevSpan = 0;
    let prevOpts = 0;
    let prevDiff = -Infinity;
    for (let d = 3; d <= 18; d += 0.25) {
      const it = generate(req(d, 7));
      const { targets, options } = it.payload;
      expect(targets.length).toBeGreaterThanOrEqual(prevSpan);
      if (targets.length === prevSpan) expect(options.length).toBeGreaterThanOrEqual(prevOpts);
      expect(it.difficulty).toBeGreaterThanOrEqual(prevDiff);
      const lvl = PS_LEVELS.find((l) => l.span === targets.length && l.options === options.length);
      expect(lvl?.difficulty).toBe(it.difficulty);
      prevSpan = targets.length;
      prevOpts = options.length;
      prevDiff = it.difficulty;
    }
    expect(generate(req(3, 1)).payload.targets.length).toBe(1);
    expect(generate(req(18, 1)).payload.targets.length).toBe(8);
  });

  it('places the anchor spans near the intended ages', () => {
    expect(levelForDifficulty(5).span).toBe(2);
    expect(levelForDifficulty(6.5).span).toBe(3);
    expect(levelForDifficulty(8.5).span).toBe(4);
    expect(levelForDifficulty(11).span).toBe(5);
    expect(levelForDifficulty(14).span).toBe(6);
    expect(levelForDifficulty(16.5).span).toBe(7);
  });

  it('builds valid pages over many seeds: distinct pictures, all targets present, same-family foils', () => {
    for (let seed = 0; seed < 400; seed++) {
      const d = 3 + (seed % 16);
      const age = seed % 3 === 0 ? 4.5 : 7;
      const { targets, options, exposureSec } = generate(req(d, seed, age)).payload;
      expect(new Set(options).size).toBe(options.length);
      expect(new Set(targets).size).toBe(targets.length);
      for (const t of targets) expect(options).toContain(t);
      for (const o of options) expect(PICTURES[o]).toBeDefined();
      const allowed = categoriesForAge(age);
      for (const o of options) expect(allowed).toContain(PICTURES[o].category);
      expect(exposureSec).toBe(targets.length === 1 ? 3 : 5);
      // At least one distractor shares a family with a target (tempting but different picture).
      const foils = options.filter((o) => !targets.includes(o));
      expect(foils.length).toBeGreaterThan(0);
      const targetCats = new Set(targets.map((t) => PICTURES[t].category));
      expect(foils.some((f) => targetCats.has(PICTURES[f].category))).toBe(true);
    }
  });

  it('uses only familiar picture families for children under 6', () => {
    const cats = new Set<string>();
    for (let seed = 0; seed < 200; seed++) generate(req(10, seed, 4)).payload.options.forEach((o) => cats.add(PICTURES[o].category));
    expect([...cats].sort()).toEqual(categoriesForAge(4).slice().sort());
    expect(categoriesForAge(4).length).toBeLessThan(categoriesForAge(8).length);
  });

  it('has no emoji repeated across the bank (no near-duplicate pictures)', () => {
    const emojis = Object.values(PICTURES).map((p) => p.emoji);
    expect(new Set(emojis).size).toBe(emojis.length);
  });
});

describe('Picture Span scoring', () => {
  const base = generate(req(7, 5));
  const item = { ...base, payload: { targets: ['apple', 'car', 'star'], options: ['pear', 'star', 'bus', 'apple', 'car', 'moon'], exposureSec: 5 } };

  it('gives 2 points for the right pictures in the right order', () => {
    const out = score(item, ['apple', 'car', 'star']);
    expect(out.points).toBe(2);
    expect(out.correct).toBe(true);
    expect(out.meta).toMatchObject({ span: 3, orderOnly: 0, found: 3 });
  });

  it('gives 1 point for the right pictures in the wrong order', () => {
    for (const r of [['car', 'apple', 'star'], ['star', 'car', 'apple'], ['apple', 'star', 'car']]) {
      const out = score(item, r);
      expect(out.points).toBe(1);
      expect(out.correct).toBe(false);
      expect(out.meta?.orderOnly).toBe(1);
      expect(out.feedback).toMatch(/order/);
    }
  });

  it('gives 0 for a wrong picture, a missing picture, or extra pictures', () => {
    expect(score(item, ['apple', 'bus', 'star']).points).toBe(0); // same-family foil
    expect(score(item, ['apple', 'car']).points).toBe(0);
    expect(score(item, ['apple', 'car', 'star', 'moon']).points).toBe(0);
    expect(score(item, ['apple', 'apple', 'car']).points).toBe(0);
    expect(score(item, ['apple', 'bus', 'star']).meta?.found).toBe(2);
  });

  it('scores a timeout / skip as zero', () => {
    expect(score(item, null)).toMatchObject({ points: 0, correct: false, meta: { span: 3 } });
    expect(score(item, []).points).toBe(0);
  });

  it('full-credits the generated answer and part-credits its reversal over many seeds', () => {
    for (let seed = 0; seed < 200; seed++) {
      const it = generate(req(4 + (seed % 12), seed));
      const t = it.payload.targets;
      expect(score(it, t).points).toBe(2);
      if (t.length > 1) expect(score(it, t.slice().reverse()).points).toBe(1);
      const foil = it.payload.options.find((o) => !t.includes(o))!;
      expect(score(it, [...t.slice(0, -1), foil]).points).toBe(0);
    }
  });
});

describe('Picture Span session pool and proactive interference', () => {
  it('draws every picture from a ~24-picture pool shared by nearby seeds', () => {
    for (const age of [4.5, 7, 12]) {
      const cats = categoriesForAge(age);
      for (const block of [0, 3, 917]) {
        const pool = sessionPool(block * 1000 + 5, cats);
        expect(pool.length).toBe(POOL_SIZE);
        expect(new Set(pool).size).toBe(POOL_SIZE);
        // every allowed family is in the pool, with at least 2 pictures (room for same-family foils)
        for (const c of cats) expect(pool.filter((id) => PICTURES[id].category === c).length).toBeGreaterThanOrEqual(2);
        // the same pool for every seed in the block, a different one for the next block
        expect(sessionPool(block * 1000 + 999, cats)).toEqual(pool);
        expect(sessionPool((block + 1) * 1000, cats)).not.toEqual(pool);
        const seen = new Set<string>();
        for (let s = block * 1000; s < block * 1000 + 60; s++) {
          const it = generate(req(3 + (s % 16), s, age));
          for (const o of it.payload.options) {
            expect(pool).toContain(o);
            seen.add(o);
          }
        }
        // pictures recur from item to item: 60 items use only the pool's pictures
        expect(seen.size).toBeLessThanOrEqual(POOL_SIZE);
        expect(poolKey(block * 1000 + 999)).toBe(block);
      }
    }
  });

  it('at difficulty ≥ 8, includes 1–2 foils that were targets on the previous item of the pool', () => {
    let checked = 0, matchedGenerate = 0;
    for (let s = 1; s < 400; s++) {
      for (const d of [8, 9, 11, 14, 17]) {
        const age = s % 4 === 0 ? 4.5 : 7;
        const it = generate(req(d, s, age));
        const { targets, options, priorFoils } = it.payload;
        expect(it.difficulty).toBeGreaterThanOrEqual(8);
        const prevTargets = previousTargets(s, targets.length, categoriesForAge(age));
        const foils = options.filter((o) => !targets.includes(o));
        const prior = foils.filter((f) => prevTargets.includes(f));
        expect(prior.length).toBeGreaterThanOrEqual(1);
        expect(priorFoils).toBeDefined();
        expect(priorFoils!.length).toBeGreaterThanOrEqual(1);
        expect(priorFoils!.length).toBeLessThanOrEqual(2);
        for (const f of priorFoils!) {
          expect(prior).toContain(f);
          expect(targets).not.toContain(f);
        }
        expect(it.skills).toContain('ps:interference');
        // the simulated previous item really is what generate() makes for the previous seed
        const prevItem = generate(req(d, s - 1, age));
        if (prevItem.payload.targets.join() === prevTargets.join()) matchedGenerate++;
        checked++;
      }
    }
    expect(checked).toBe(399 * 5);
    expect(matchedGenerate).toBeGreaterThan(0.99 * checked);
    // the first seed of a block wraps to the block's last seed (same pool)
    expect(previousSeed(2000)).toBe(2999);
    expect(previousSeed(2001)).toBe(2000);
  });

  it('keeps easier items free of previous-target foils', () => {
    for (let s = 0; s < 200; s++) {
      for (const d of [3, 5, 6.5, 7]) {
        const it = generate(req(d, s));
        expect(it.difficulty).toBeLessThan(8);
        expect(it.payload.priorFoils).toBeUndefined();
        expect(it.skills).not.toContain('ps:interference');
      }
    }
  });

  it('is deterministic with the pool and interference in place', () => {
    for (const s of [1, 999, 1000, 54321]) {
      for (const d of [4, 8, 12, 18]) expect(generate(req(d, s))).toEqual(generate(req(d, s)));
    }
    expect(sessionPool(4321, categoriesForAge(7))).toEqual(sessionPool(4321, categoriesForAge(7)));
  });

  it('counts taps on last-round pictures as prior errors', () => {
    let n = 0;
    for (let s = 1; s < 50; s++) {
      const it = generate(req(10, s));
      const { targets, priorFoils } = it.payload;
      const intruded = [...targets.slice(0, -1), priorFoils![0]];
      const out = score(it, intruded);
      expect(out.points).toBe(0);
      expect(out.meta!.priorErrors).toBe(1);
      expect(out.feedback).toMatch(/last round/);
      expect(score(it, targets).meta!.priorErrors).toBe(0);
      n++;
    }
    expect(n).toBe(49);
  });
});

describe('Picture Span player', () => {
  it('renders the ready screen, then the reveal with the right order', async () => {
    const { render, screen, cleanup } = await import('@testing-library/react');
    const { createElement } = await import('react');
    const { Player } = await import('./index');
    const item = generate(req(7, 3));
    const base = { item, mode: 'tutor' as const, age: 7, onSubmit: () => {}, hintLevel: 0, speak: async () => {} };
    render(createElement(Player, base));
    expect(screen.getByText(/I'm ready/)).toBeTruthy();
    cleanup();
    render(createElement(Player, { ...base, reveal: { response: item.payload.targets, outcome: score(item, item.payload.targets) } }));
    expect(screen.getByText('Right order')).toBeTruthy();
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(item.payload.options.length);
    cleanup();
  });
});
