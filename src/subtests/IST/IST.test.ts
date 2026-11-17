import { describe, expect, it } from 'vitest';
import { generate, score } from './index';
import { BOOK_SIZE, CURRICULUM_SLOTS, IST_LEVELS, TEMPLATES, buildSentence, canonicalMeaning, codeBook, makeOptions, makeTiles, resolveBookId, sentenceText, tileDistractorCount } from '../_symbols/engine';
import { DICTIONARY, WORDS } from '../_symbols/dictionary';
import { GLYPH_WORDS } from '../_symbols/glyphs';
import { teachListFor } from '../_symbols/SymbolPlayer';
import { createRng } from '../../core/rng';

const req = (difficulty: number, seed: number, variant?: string) => ({ difficulty, seed, age: 7, mode: 'practice' as const, variant });

/** Canonical meaning of a sentence: the two sides of "and" can be swapped without changing it. */
function meaning(words: string[]): string {
  const out = words.slice();
  for (let i = 1; i < out.length - 1; i++) {
    if (out[i] === 'and' && out[i - 1] > out[i + 1]) [out[i - 1], out[i + 1]] = [out[i + 1], out[i - 1]];
  }
  return out.join(' ');
}

describe('Symbol dictionary and code books', () => {
  it('has 24 words, each with its own glyph', () => {
    expect(DICTIONARY.length).toBe(24);
    expect(GLYPH_WORDS.slice().sort()).toEqual(DICTIONARY.map((d) => d.word).sort());
    for (const d of DICTIONARY) if (d.pos === 'N') expect(d.emoji).toBeTruthy();
  });

  it('chooses the same code book for the same variant, and different books for different variants', () => {
    expect(codeBook('book-7')).toEqual(codeBook('book-7'));
    const distinct = new Set(Array.from({ length: 30 }, (_, n) => codeBook(`book-${n}`).words.join()));
    expect(distinct.size).toBeGreaterThan(20);
  });

  it('builds 16-word books that follow the curriculum slot pattern, with no repeats', () => {
    for (let n = 0; n < 200; n++) {
      const b = codeBook(`book-${n}`);
      expect(b.words.length).toBe(BOOK_SIZE);
      expect(new Set(b.words).size).toBe(BOOK_SIZE);
      b.words.forEach((w, i) => {
        const slot = CURRICULUM_SLOTS[i];
        expect(slot === w || WORDS[w].pos === slot).toBe(true);
      });
    }
  });

  it('resolves variants: book-<n> as given, otherwise derived from the seed', () => {
    expect(resolveBookId('book-12', 999)).toBe('book-12');
    expect(resolveBookId(undefined, 1234)).toBe('book-234');
    expect(resolveBookId(undefined, 1234)).toBe(resolveBookId(undefined, 1234));
    expect(resolveBookId('weird', 1)).toBe(resolveBookId('weird', 2));
    expect(generate(req(8, 5, 'book-3')).payload.book).toBe('book-3');
    expect(generate(req(8, 5)).payload.book).toBe('book-5');
  });

  it('every template is grammatical for the dictionary (slot kinds exist)', () => {
    for (const t of TEMPLATES) for (const s of t) expect(['N', 'Vi', 'Vt', 'A', 'the', 'and', 'is', 'on']).toContain(s);
  });
});

describe('IST generator', () => {
  it('is deterministic for (difficulty, seed, variant)', () => {
    expect(generate(req(9, 42, 'book-2'))).toEqual(generate(req(9, 42, 'book-2')));
  });

  it('teaches 1–3 new symbols and uses only learned symbols, including a new one', () => {
    for (let seed = 0; seed < 400; seed++) {
      const it = generate(req(3 + (seed % 15), seed, `book-${seed % 40}`));
      const { symbols, teach, known, book } = it.payload;
      expect(teach.length).toBeGreaterThanOrEqual(1);
      expect(teach.length).toBeLessThanOrEqual(3);
      const words = codeBook(book).words;
      expect(known).toEqual(words.slice(0, known.length));
      for (const t of teach) expect(known).toContain(t);
      for (const s of symbols) expect(known).toContain(s);
      expect(symbols.some((s) => teach.includes(s))).toBe(true);
      expect(symbols.length).toBeGreaterThanOrEqual(1);
      expect(symbols.length).toBeLessThanOrEqual(7);
    }
  });

  it('builds sentences of the intended length at every level for every book', () => {
    for (let n = 0; n < 60; n++) {
      for (const lvl of IST_LEVELS) {
        const it = generate(req(lvl.difficulty, n * 7 + 1, `book-${n}`));
        expect(it.difficulty).toBe(lvl.difficulty);
        expect(it.payload.symbols.length).toBe(lvl.length);
        expect(it.payload.known.length).toBe(lvl.k);
      }
    }
  });

  it('gets harder (more symbols known, longer or equal sentences on average) as difficulty rises', () => {
    let prevK = 0;
    let prevD = -Infinity;
    for (let d = 3; d <= 18; d += 0.25) {
      const it = generate(req(d, 3, 'book-1'));
      expect(it.payload.known.length).toBeGreaterThanOrEqual(prevK);
      expect(it.difficulty).toBeGreaterThanOrEqual(prevD);
      prevK = it.payload.known.length;
      prevD = it.difficulty;
    }
    expect(generate(req(4, 1)).payload.symbols.length).toBe(1);
    expect(generate(req(17, 1)).payload.symbols.length).toBe(7);
  });

  it('offers exactly one correct option, 4 distinct options, none meaning the same as the answer', () => {
    for (let seed = 0; seed < 500; seed++) {
      const it = generate(req(3 + (seed % 15), seed));
      const { options, answer, symbols } = it.payload;
      expect(options.length).toBe(4);
      expect(new Set(options.map((o) => o.key)).size).toBe(4);
      expect(options.filter((o) => o.key === answer).length).toBe(1);
      expect(options.filter((o) => meaning(o.words) === meaning(symbols)).length).toBe(1);
      for (const o of options) {
        expect(o.key).toBe(o.words.join(' '));
        expect(o.words.length).toBe(symbols.length);
      }
      if (it.payload.pictures) for (const o of options) expect(WORDS[o.words[0]].emoji).toBeTruthy();
    }
  });

  it('never offers a swap across "and" as a distractor (it would mean the same thing)', () => {
    const book = codeBook('book-0');
    const rng = createRng(1);
    for (let i = 0; i < 100; i++) {
      const opts = makeOptions(['cat', 'and', 'fish'], ['cat', 'fish', 'and', 'sun'], book, rng);
      expect(opts.map((o) => o.key)).not.toContain('fish and cat');
    }
  });

  it('falls back gracefully when no template fits', () => {
    expect(buildSentence(['sun'], [], 5, createRng(1))).toEqual(['sun']);
  });
});

describe('IST scoring', () => {
  const it0 = generate(req(9, 11, 'book-4'));

  it('credits only the exact sentence and records how close a wrong pick was', () => {
    const { answer, options, symbols } = it0.payload;
    expect(score(it0, answer)).toMatchObject({ points: 1, correct: true, meta: { length: symbols.length, wordsWrong: 0 } });
    for (const o of options.filter((x) => x.key !== answer)) {
      const out = score(it0, o.key);
      expect(out.points).toBe(0);
      expect(out.meta?.wordsWrong).toBe(o.words.filter((w, i) => w !== symbols[i]).length);
    }
  });

  it('explains a one-word-off pick', () => {
    const item = { ...it0, payload: { ...it0.payload, symbols: ['the', 'cat', 'sees', 'the', 'fish'], answer: 'the cat sees the fish',
      options: [
        { key: 'the cat sees the fish', words: ['the', 'cat', 'sees', 'the', 'fish'] },
        { key: 'the cat eats the fish', words: ['the', 'cat', 'eats', 'the', 'fish'] },
        { key: 'the fish sees the cat', words: ['the', 'fish', 'sees', 'the', 'cat'] },
        { key: 'the sun sees the fish', words: ['the', 'sun', 'sees', 'the', 'fish'] },
      ] } };
    expect(score(item, 'the cat eats the fish').feedback).toMatch(/one word/);
    expect(score(item, 'the fish sees the cat').feedback).toMatch(/swapped/);
  });

  it('scores timeout and unknown keys as zero', () => {
    expect(score(it0, null)).toMatchObject({ points: 0, correct: false });
    expect(score(it0, 'nonsense').points).toBe(0);
  });
});

describe('Teaching plan', () => {
  const item = generate(req(12, 9, 'book-6'));
  const none = () => [];
  const all = (w: string[]) => [...new Set(w)];

  it('IST teaches the new symbols plus unseen catch-up symbols, in curriculum order', () => {
    expect(teachListFor('IST', 'test', item.payload, none)).toEqual(item.payload.teach);
    const withCatchUp = teachListFor('IST', 'test', item.payload, all);
    for (const s of item.payload.symbols) expect(withCatchUp).toContain(s);
    const idx = withCatchUp.map((w) => item.payload.known.indexOf(w));
    expect(idx).toEqual(idx.slice().sort((a, b) => a - b));
  });

  it('DST/RST teach nothing in test mode, unseen symbols in practice, and review all in tutor', () => {
    expect(teachListFor('DST', 'test', item.payload, all)).toEqual([]);
    expect(teachListFor('DST', 'practice', item.payload, none)).toEqual([]);
    expect(teachListFor('RST', 'practice', item.payload, all).length).toBe(new Set(item.payload.symbols).size);
    expect(teachListFor('DST', 'tutor', item.payload, none).length).toBe(new Set(item.payload.symbols).size);
  });
});

describe('Word-tile tray (IST)', () => {
  const count = (ws: string[]) => ws.reduce<Record<string, number>>((m, w) => ({ ...m, [w]: (m[w] ?? 0) + 1 }), {});

  it('has every sentence word (with repeats) plus 2–4 distractors from the code book, learned words first', () => {
    for (let seed = 0; seed < 400; seed++) {
      const it = generate(req(3 + (seed % 15), seed, `book-${seed % 30}`));
      const { tiles, symbols, known, book, pictures } = it.payload;
      if (pictures) {
        expect(symbols.length).toBe(1);
        expect(tiles).toEqual([]);
        continue;
      }
      const need = count(symbols);
      const have = count(tiles);
      for (const w of Object.keys(need)) expect(have[w]).toBe(need[w]);
      const distractors = tiles.filter((w) => !symbols.includes(w));
      expect(distractors.length).toBe(tiles.length - symbols.length);
      expect(distractors.length).toBe(tileDistractorCount(symbols.length));
      expect(distractors.length).toBeGreaterThanOrEqual(2);
      expect(distractors.length).toBeLessThanOrEqual(4);
      expect(new Set(distractors).size).toBe(distractors.length);
      const words = codeBook(book).words;
      for (const d of distractors) expect(words).toContain(d);
      // Learned words are used up before unlearned ones.
      const learnedSpare = known.filter((w) => !symbols.includes(w)).length;
      const learnedUsed = distractors.filter((d) => known.includes(d)).length;
      expect(learnedUsed).toBe(Math.min(learnedSpare, distractors.length));
    }
  });

  it('is deterministic and keeps repeated words as separate tiles', () => {
    const a = generate(req(11, 77, 'book-5'));
    expect(generate(req(11, 77, 'book-5')).payload.tiles).toEqual(a.payload.tiles);
    const rng = createRng(1);
    const t1 = makeTiles(['the', 'cat', 'sees', 'the', 'fish'], codeBook('book-2').words.slice(0, 10), codeBook('book-2'), rng);
    expect(t1.filter((w) => w === 'the').length).toBeGreaterThanOrEqual(2);
  });
});

describe('IST scoring of built sentences', () => {
  const tileItems = Array.from({ length: 300 }, (_, s) => generate(req(5 + (s % 12), s))).filter((x) => x.payload.tiles.length > 0);

  it('credits the exact order and gives 0 for a swapped order (with wordsWrong = wrong slots)', () => {
    let swapsChecked = 0;
    for (const it of tileItems) {
      const { symbols } = it.payload;
      expect(score(it, symbols.join(' '))).toMatchObject({ points: 1, correct: true, meta: { wordsWrong: 0 } });
      for (let i = 0; i < symbols.length; i++) {
        for (let j = i + 1; j < symbols.length; j++) {
          if (symbols[i] === symbols[j]) continue;
          const s = symbols.slice();
          [s[i], s[j]] = [s[j], s[i]];
          const out = score(it, s.join(' '));
          if (canonicalMeaning(s) === canonicalMeaning(symbols)) {
            expect(out.points).toBe(1); // "cat and fish" = "fish and cat"
          } else {
            expect(out).toMatchObject({ points: 0, correct: false, meta: { wordsWrong: 2 } });
            expect(out.feedback).toMatch(/swapped/);
            swapsChecked++;
          }
        }
      }
    }
    expect(swapsChecked).toBeGreaterThan(100);
  });

  it('accepts swapping the two sides of "and" only', () => {
    const base = generate(req(5, 1, 'book-0'));
    const item = { ...base, payload: { ...base.payload, symbols: ['the', 'cat', 'runs', 'and', 'jumps'], answer: 'the cat runs and jumps',
      tiles: ['jumps', 'the', 'runs', 'cat', 'and', 'sun', 'big'] } };
    expect(score(item, 'the cat jumps and runs').points).toBe(1);
    expect(score(item, 'the cat runs and jumps').points).toBe(1);
    expect(score(item, 'the runs cat and jumps').points).toBe(0);
    expect(score(item, 'runs cat the and jumps').meta?.wordsWrong).toBe(2);
  });

  it('counts a distractor word or a missing word as a wrong slot', () => {
    const it = tileItems.find((x) => x.payload.symbols.length >= 4)!;
    const { symbols, tiles } = it.payload;
    const extra = tiles.find((w) => !symbols.includes(w))!;
    const s = symbols.slice();
    s[1] = extra;
    expect(score(it, s.join(' '))).toMatchObject({ points: 0, meta: { wordsWrong: 1 } });
    expect(score(it, s.join(' ')).feedback).toMatch(/one word/);
    expect(score(it, symbols.slice(0, -1).join(' '))).toMatchObject({ points: 0, meta: { wordsWrong: 1 } });
  });

  it('scores a grown-up’s read-aloud mark', () => {
    const it = tileItems[0];
    const n = it.payload.symbols.length;
    expect(score(it, { aloud: true, wordsWrong: 0 })).toMatchObject({ points: 1, correct: true, meta: { wordsWrong: 0, aloud: 1 } });
    expect(score(it, { aloud: true, wordsWrong: 2 })).toMatchObject({ points: 0, correct: false, meta: { wordsWrong: 2 } });
    expect(score(it, { aloud: true, wordsWrong: 99 }).meta?.wordsWrong).toBe(n);
  });
});

describe('Symbol player (picture items)', () => {
  it('teaches first in IST, then keeps picture choices for a single symbol', async () => {
    const { render, screen, fireEvent, cleanup } = await import('@testing-library/react');
    const { createElement } = await import('react');
    const { Player } = await import('./index');
    const { resetSeen, setGrownUpListens } = await import('../_symbols/memory');
    resetSeen();
    setGrownUpListens(false);
    const item = generate(req(4.3, 3, 'book-1'));
    expect(item.payload.pictures).toBe(true);
    const spoken: string[] = [];
    let submitted: unknown = null;
    render(createElement(Player, { item, mode: 'practice', age: 7, hintLevel: 0, onSubmit: (r) => { submitted = r; },
      speak: async (t: string) => { spoken.push(t); } }));
    expect(screen.getByText('Got it! →')).toBeTruthy();
    fireEvent.click(screen.getByLabelText(`Symbol for ${item.payload.teach[0]}. Tap to hear it.`));
    expect(spoken).toContain(item.payload.teach[0]);
    fireEvent.click(screen.getByText('Got it! →'));
    expect(screen.queryAllByLabelText(/^Word tile:/)).toHaveLength(0);
    const ans = item.payload.options.find((o) => o.key === item.payload.answer)!;
    fireEvent.click(screen.getByLabelText(sentenceText(ans.words)));
    fireEvent.click(screen.getByText('Done ✓'));
    expect(submitted).toBe(item.payload.answer);
    cleanup();
  });
});
