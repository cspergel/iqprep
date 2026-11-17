import { describe, expect, it } from 'vitest';
import { LN_LETTERS, LN_LEVELS, expectedAnswer, generate, hasSoundClash, isDigit, levelForDifficulty, score } from './index';

const req = (difficulty: number, seed: number) => ({ difficulty, seed, age: 7, mode: 'practice' as const });

describe('Letter–Number generator', () => {
  it('is deterministic for a given seed', () => {
    expect(generate(req(9, 42))).toEqual(generate(req(9, 42)));
    expect(generate(req(9, 42)).payload.tokens).not.toEqual(generate(req(9, 43)).payload.tokens);
  });

  it('lengthens spans monotonically with difficulty and reports the true level difficulty', () => {
    let prevMixedSpan = 0;
    let sawMixed = false;
    let prevDiff = -Infinity;
    for (let d = 3; d <= 18; d += 0.25) {
      const it = generate(req(d, 11));
      const span = it.payload.tokens.length;
      // Numbers-only items come first; once lists are mixed they never go back, and only get longer.
      if (sawMixed) expect(it.payload.kind).toBe('mixed');
      if (it.payload.kind === 'mixed') {
        sawMixed = true;
        expect(span).toBeGreaterThanOrEqual(prevMixedSpan);
        prevMixedSpan = span;
      }
      expect(it.difficulty).toBeGreaterThanOrEqual(prevDiff);
      const lvl = LN_LEVELS.find((l) => l.kind === it.payload.kind && l.span === span);
      expect(lvl?.difficulty).toBe(it.difficulty);
      prevDiff = it.difficulty;
    }
    expect(generate(req(5, 1)).payload.kind).toBe('numbers');
    expect(generate(req(18, 1)).payload.tokens.length).toBe(8);
  });

  it('matches the intended age curve for mixed spans', () => {
    expect(levelForDifficulty(6)).toMatchObject({ kind: 'mixed', span: 2 });
    expect(levelForDifficulty(7.5).span).toBe(3);
    expect(levelForDifficulty(9.5).span).toBe(4);
    expect(levelForDifficulty(12).span).toBe(5);
    expect(levelForDifficulty(14.5).span).toBe(6);
    expect(levelForDifficulty(16.5).span).toBe(7);
  });

  it('builds clean lists over many seeds: allowed tokens, no repeats, no rhymes, never pre-sorted', () => {
    for (let seed = 0; seed < 500; seed++) {
      const it = generate(req(4 + (seed % 15), seed));
      const { tokens, kind } = it.payload;
      expect(hasSoundClash(tokens)).toBe(false);
      expect(new Set(tokens).size).toBe(tokens.length);
      for (const t of tokens) expect(isDigit(t) ? t !== '0' : (LN_LETTERS as readonly string[]).includes(t)).toBe(true);
      expect(tokens.join()).not.toBe(expectedAnswer(it.payload).join());
      if (kind === 'numbers') expect(tokens.every(isDigit)).toBe(true);
      else {
        expect(tokens.some(isDigit)).toBe(true);
        expect(tokens.some((t) => !isDigit(t))).toBe(true);
      }
    }
  });

  it('detects sound clashes it is meant to avoid', () => {
    expect(hasSoundClash(['C', 'T', '1'])).toBe(true); // two "ee" letters
    expect(hasSoundClash(['A', '8'])).toBe(true); // A rhymes with 8
    expect(hasSoundClash(['D', '3'])).toBe(true); // D rhymes with 3
    expect(hasSoundClash(['A', 'K'])).toBe(true);
    expect(hasSoundClash(['M', 'M'])).toBe(true);
    expect(hasSoundClash(['M', '3', 'A', '1'])).toBe(false);
  });
});

describe('Letter–Number scoring', () => {
  const base = generate(req(9.5, 5));
  const item = { ...base, payload: { kind: 'mixed' as const, tokens: ['M', '3', 'A', '1'] } };

  it('puts numbers first ascending, then letters alphabetically', () => {
    expect(expectedAnswer(item.payload)).toEqual(['1', '3', 'A', 'M']);
    expect(expectedAnswer({ kind: 'mixed', tokens: ['R', '9', 'F', '2', 'L', '5'] })).toEqual(['2', '5', '9', 'F', 'L', 'R']);
    expect(expectedAnswer({ kind: 'numbers', tokens: ['7', '2', '5'] })).toEqual(['2', '5', '7']);
  });

  it('credits only the exact answer', () => {
    expect(score(item, ['1', '3', 'A', 'M'])).toMatchObject({ points: 1, correct: true, meta: { span: 4, recalled: 4 } });
    expect(score(item, ['3', '1', 'A', 'M']).correct).toBe(false);
    expect(score(item, ['1', '3', 'M', 'A']).correct).toBe(false);
    expect(score(item, ['1', '3', 'A']).correct).toBe(false);
    expect(score(item, ['1', '3', 'A', 'M', 'X']).correct).toBe(false);
  });

  it('gives specific feedback for letters-first, heard-order and right-items-wrong-order answers', () => {
    // The real subtest credits a correctly sorted letters-first response.
    const lf = score(item, ['A', 'M', '1', '3']);
    expect(lf.points).toBe(1);
    expect(lf.correct).toBe(true);
    expect(lf.meta?.lettersFirst).toBe(1);
    expect(lf.feedback).toMatch(/that counts/);
    expect(score(item, ['M', 'A', '1', '3']).correct).toBe(false); // letters first but unsorted
    expect(score(item, ['M', '3', 'A', '1']).feedback).toMatch(/order you heard/);
    expect(score(item, ['3', '1', 'M', 'A']).feedback).toMatch(/every one/);
    expect(score(item, ['1', '3']).feedback).toMatch(/2 of the 4/);
  });

  it('scores a timeout as zero and records span', () => {
    expect(score(item, null)).toMatchObject({ points: 0, correct: false, meta: { span: 4 } });
  });

  it('accepts its own expected answer for every generated item', () => {
    for (let seed = 0; seed < 200; seed++) {
      const it = generate(req(4 + (seed % 15), seed));
      expect(score(it, expectedAnswer(it.payload)).points).toBe(1);
      // With one letter and one number, every order is already a sorted answer (numbers- or letters-first).
      const trivial = it.payload.tokens.length === 2 && it.payload.tokens.some(isDigit) && !it.payload.tokens.every(isDigit);
      if (!trivial) expect(score(it, it.payload.tokens).points).toBe(0);
    }
  });
});

describe('Letter–Number player', () => {
  it('renders the ready screen and a reveal with the expected answer', async () => {
    const { render, screen, cleanup } = await import('@testing-library/react');
    const { createElement } = await import('react');
    const { Player } = await import('./index');
    const item = generate(req(9.5, 3));
    const base = { item, mode: 'practice' as const, age: 7, onSubmit: () => {}, hintLevel: 0, speak: async () => {} };
    render(createElement(Player, base));
    expect(screen.getByText(/I'm ready/)).toBeTruthy();
    cleanup();
    render(createElement(Player, { ...base, reveal: { response: ['1'], outcome: score(item, ['1']) } }));
    expect(screen.getByText(expectedAnswer(item.payload).join(' '))).toBeTruthy();
    cleanup();
  });
});
