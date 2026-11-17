import { describe, expect, it } from 'vitest';
import { generate, score } from './index';
import { RST_LEVELS, codeBook } from '../_symbols/engine';
import { WORDS } from '../_symbols/dictionary';

const req = (difficulty: number, seed: number, variant?: string) => ({ difficulty, seed, age: 7, mode: 'test' as const, variant });

describe('RST generator', () => {
  it('is deterministic and honours the code-book variant', () => {
    expect(generate(req(6, 4, 'book-9'))).toEqual(generate(req(6, 4, 'book-9')));
    expect(generate(req(6, 4, 'book-9')).payload.book).toBe('book-9');
  });

  it('shows one learned symbol at the easy end, matching the level focus', () => {
    for (let seed = 0; seed < 300; seed++) {
      for (const lvl of RST_LEVELS.filter((l) => l.length === 1)) {
        const it = generate(req(lvl.difficulty, seed, `book-${seed % 30}`));
        expect(it.payload.symbols.length).toBe(1);
        const w = it.payload.symbols[0];
        expect(lvl.focus).toContain(WORDS[w].pos);
        expect(codeBook(it.payload.book).words.slice(0, lvl.k)).toContain(w);
        expect(it.payload.teach).toEqual([]);
        // Single-word options are all the same kind of word, so none is ruled out by grammar.
        const kinds = new Set(it.payload.options.map((o) => WORDS[o.words[0]].pos.replace(/^V.*/, 'V')));
        expect(kinds.size).toBe(1);
        if (lvl.pictures) for (const o of it.payload.options) expect(WORDS[o.words[0]].emoji).toBeTruthy();
      }
    }
  });

  it('tags function-word items and uses phrases at the hard end', () => {
    const f = generate(req(8.6, 3));
    expect(['the', 'and', 'is', 'on']).toContain(f.payload.symbols[0]);
    expect(f.skills).toEqual(expect.arrayContaining(['st:recognition', 'st:function-words']));
    expect(generate(req(16, 3)).payload.symbols.length).toBeGreaterThanOrEqual(5);
  });

  it('reports non-decreasing difficulty as requested difficulty rises', () => {
    let prev = -Infinity;
    for (let d = 3; d <= 18; d += 0.25) {
      const it = generate(req(d, 5));
      expect(it.difficulty).toBeGreaterThanOrEqual(prev);
      prev = it.difficulty;
    }
  });

  it('has exactly one correct option of four over many seeds', () => {
    for (let seed = 0; seed < 400; seed++) {
      const it = generate(req(3 + (seed % 16), seed));
      const keys = it.payload.options.map((o) => o.key);
      expect(new Set(keys).size).toBe(4);
      expect(keys.filter((k) => k === it.payload.answer).length).toBe(1);
    }
  });
});

describe('RST scoring', () => {
  it('scores right, wrong and timeout', () => {
    const it = generate(req(6, 8, 'book-2'));
    expect(score(it, it.payload.answer)).toMatchObject({ points: 1, correct: true, meta: { length: 1, wordsWrong: 0 } });
    const wrong = it.payload.options.find((o) => o.key !== it.payload.answer)!;
    expect(score(it, wrong.key)).toMatchObject({ points: 0, correct: false, meta: { wordsWrong: 1 } });
    expect(score(it, null)).toMatchObject({ points: 0, correct: false });
  });
});
