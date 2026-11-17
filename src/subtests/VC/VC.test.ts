import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { req, verbalModuleSuite } from '../_verbal/moduleSuite';
import { VC_BANK } from './bank';
import Vocabulary, { generate } from './index';

verbalModuleSuite({
  prefix: 'VC',
  module: Vocabulary,
  bank: VC_BANK,
  maxPoints: 2,
  skills: ['vc:picture', 'vc:noun', 'vc:verb', 'vc:adjective', 'vc:abstract'],
  minSize: 140,
  parentScorable: true,
});

describe('VC content', () => {
  const pictures = VC_BANK.filter((b) => b.skill === 'vc:picture');
  const words = VC_BANK.filter((b) => b.skill !== 'vc:picture');

  it('has at least 140 word items plus a handful of young picture items', () => {
    expect(words.length).toBeGreaterThanOrEqual(140);
    expect(pictures.length).toBeGreaterThanOrEqual(4);
    expect(Math.max(...pictures.map((p) => p.difficulty))).toBeLessThanOrEqual(8);
  });

  it('never gives away the picture name in its accessible label or prompt', () => {
    for (const p of pictures) {
      const best = p.choices.find((c) => c.points === 2)!.text.replace(/^an? /, '');
      expect(p.picture).toBeTruthy();
      expect(p.pictureLabel?.toLowerCase()).not.toContain(best.toLowerCase());
      expect(p.prompt.toLowerCase()).not.toContain(best.toLowerCase());
    }
  });

  it('never uses the word itself inside a choice (no circular definitions)', () => {
    for (const w of words) {
      const word = /What does (\S+) mean\?/.exec(w.prompt)![1].toLowerCase();
      for (const c of w.choices) expect(c.text.toLowerCase().split(/[^a-z]+/), `${w.id}: ${c.text}`).not.toContain(word);
    }
  });

  it('does not let answer length give away the best answer (no "pick the longest" trick)', () => {
    // Conservative: a tie for longest counts as "longest"; "shortest" must be strictly shortest.
    let longest = 0;
    let shortest = 0;
    for (const b of VC_BANK) {
      const best = b.choices.find((c) => c.points === 2)!;
      const others = b.choices.filter((c) => c !== best).map((c) => c.text.length);
      if (others.every((n) => best.text.length >= n)) longest++;
      if (others.every((n) => best.text.length < n)) shortest++;
    }
    expect(longest / VC_BANK.length, 'best answer is the longest choice too often').toBeLessThanOrEqual(0.4);
    expect(shortest / VC_BANK.length, 'best answer is almost never the shortest choice').toBeGreaterThanOrEqual(0.12);
  });

  it('serves picture items to the youngest and words later', () => {
    expect(generate(req(4, 0)).skills[0]).toBeDefined();
    const young = Array.from({ length: 50 }, (_, s) => generate(req(4, s))).filter((i) => i.payload.picture).length;
    const older = Array.from({ length: 50 }, (_, s) => generate(req(12, s))).filter((i) => i.payload.picture).length;
    expect(young).toBeGreaterThan(0);
    expect(older).toBe(0);
  });
});

describe('VC say-first player', () => {
  afterEach(cleanup);
  const speak = () => Promise.resolve();

  it('uses one stem per format: "What is this?" for pictures, "What does ___ mean?" for words', () => {
    for (let seed = 0; seed < 40; seed++) {
      for (const d of [4, 5, 9]) {
        const it = generate(req(d, seed));
        if (it.payload.picture) expect(it.payload.prompt).toBe('What is this?');
        else expect(it.payload.prompt).toMatch(/^What does [A-Z'-]+ mean\?$/);
        expect(it.speak).toBe(it.payload.prompt.replace(/\b[A-Z][A-Z'-]+\b/g, (w) => w.toLowerCase()));
      }
    }
  });

  it('never shows the target word in test mode (before or after saying the answer); practice prints it', () => {
    // Render the real item and a copy whose word is a sentinel: in test mode the two screens must be
    // identical, so nothing about the word (text or accessible names) can leak.
    const screenText = (item: ReturnType<typeof generate>, mode: 'test' | 'practice') => {
      const { container, unmount } = render(createElement(Vocabulary.Player, { item, mode, age: 7, onSubmit: () => undefined, hintLevel: 1, speak }));
      const labels = () => Array.from(container.querySelectorAll('[aria-label]'), (e) => e.getAttribute('aria-label')).join('|');
      const step1 = container.textContent + labels();
      fireEvent.click(screen.getByRole('button', { name: /I said my answer/ }));
      const step2 = container.textContent + labels();
      unmount();
      return { step1, step2 };
    };
    let checked = 0;
    for (let seed = 0; seed < 30; seed++) {
      const item = generate({ ...req(5 + (seed % 10), seed), mode: 'test' });
      if (item.payload.picture) continue;
      const word = /What does (\S+) mean\?/.exec(item.payload.prompt)![1];
      const blank = { ...item, speak: 'what does qqqq mean?', payload: { ...item.payload, prompt: 'What does QQQQ mean?' } };
      const real = screenText(item, 'test');
      const sentinel = screenText(blank, 'test');
      expect(real.step1, `${item.id} step 1`).toBe(sentinel.step1);
      expect(real.step2, `${item.id} step 2`).toBe(sentinel.step2);
      expect(real.step1).toMatch(/Listen to the word/);
      expect(screenText(item, 'practice').step1.toLowerCase()).toContain(word.toLowerCase());
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  });
});
