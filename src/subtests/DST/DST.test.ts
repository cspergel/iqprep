import { describe, expect, it } from 'vitest';
import { generate, score } from './index';
import { generate as generateIst } from '../IST/index';
import { DST_LEVELS, IST_LEVELS, codeBook } from '../_symbols/engine';
import { WORDS } from '../_symbols/dictionary';

const WORDS_POS = (w: string) => WORDS[w].pos;

const req = (difficulty: number, seed: number, variant?: string) => ({ difficulty, seed, age: 7, mode: 'test' as const, variant });

describe('DST generator', () => {
  it('is deterministic and shares the IST code book for the same variant', () => {
    expect(generate(req(10, 4, 'book-9'))).toEqual(generate(req(10, 4, 'book-9')));
    const words = codeBook('book-9').words;
    for (let seed = 0; seed < 50; seed++) {
      const d = generate(req(4 + (seed % 13), seed, 'book-9'));
      const i = generateIst(req(4 + (seed % 13), seed, 'book-9'));
      expect(d.payload.book).toBe(i.payload.book);
      for (const s of d.payload.symbols) expect(words).toContain(s);
    }
  });

  it('never teaches, and only uses symbols from the learned curriculum prefix', () => {
    for (let seed = 0; seed < 400; seed++) {
      const it = generate(req(3 + (seed % 16), seed, `book-${seed % 25}`));
      expect(it.payload.teach).toEqual([]);
      for (const s of it.payload.symbols) expect(it.payload.known).toContain(s);
      expect(it.payload.known).toEqual(codeBook(it.payload.book).words.slice(0, it.payload.known.length));
    }
  });

  it('is rated harder than the matching IST level and rises monotonically', () => {
    DST_LEVELS.forEach((l, i) => expect(l.difficulty).toBeGreaterThan(IST_LEVELS[i].difficulty));
    let prev = -Infinity;
    let prevK = 0;
    for (let d = 3; d <= 18; d += 0.5) {
      const it = generate(req(d, 2, 'book-1'));
      expect(it.difficulty).toBeGreaterThanOrEqual(prev);
      expect(it.payload.known.length).toBeGreaterThanOrEqual(prevK);
      prev = it.difficulty;
      prevK = it.payload.known.length;
    }
  });

  it('has exactly one correct option of four over many seeds', () => {
    for (let seed = 0; seed < 300; seed++) {
      const it = generate(req(3 + (seed % 16), seed));
      const keys = it.payload.options.map((o) => o.key);
      expect(new Set(keys).size).toBe(4);
      expect(keys.filter((k) => k === it.payload.answer).length).toBe(1);
      expect(it.payload.answer).toBe(it.payload.symbols.join(' '));
    }
  });
});

describe('DST scoring', () => {
  it('scores right, wrong and timeout', () => {
    const it = generate(req(9, 8, 'book-2'));
    expect(score(it, it.payload.answer).points).toBe(1);
    const wrong = it.payload.options.find((o) => o.key !== it.payload.answer)!;
    expect(score(it, wrong.key)).toMatchObject({ points: 0, correct: false });
    expect(score(it, null).points).toBe(0);
  });

  it('tags delayed recall (and function words when present)', () => {
    for (let seed = 0; seed < 50; seed++) {
      const it = generate(req(12, seed));
      expect(it.skills).toContain('st:delayed');
      const hasF = it.payload.symbols.some((s) => ['the', 'and', 'is', 'on'].includes(s));
      expect(it.skills.includes('st:function-words')).toBe(hasF);
    }
  });
});

describe('DST word tiles', () => {
  it('multi-symbol items get a tile tray (sentence words + distractors); exact order scores 1, a swap 0', () => {
    let checked = 0;
    for (let seed = 0; seed < 200; seed++) {
      const it = generate(req(5 + (seed % 12), seed));
      const { symbols, tiles, pictures } = it.payload;
      expect(tiles.length > 0).toBe(!pictures);
      if (pictures) continue;
      for (const w of symbols) expect(tiles.filter((t) => t === w).length).toBe(symbols.filter((s) => s === w).length);
      expect(tiles.length - symbols.length).toBeGreaterThanOrEqual(2);
      expect(score(it, symbols.join(' ')).points).toBe(1);
      const i = symbols.findIndex((w, k) => k > 0 && w !== symbols[0] && WORDS_POS(w) === WORDS_POS(symbols[0]) && !symbols.slice(1, k).every((x) => x === 'and'));
      if (i > 0) {
        const s = symbols.slice();
        [s[0], s[i]] = [s[i], s[0]];
        expect(score(it, s.join(' '))).toMatchObject({ points: 0, meta: { wordsWrong: 2 } });
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('is deterministic including the tray', () => {
    expect(generate(req(12, 33, 'book-4')).payload.tiles).toEqual(generate(req(12, 33, 'book-4')).payload.tiles);
  });
});

