/**
 * Shared test suite for bank-based verbal modules. Imported only by *.test.ts files.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { GenerateRequest, Mode, SubtestModule } from '../../core/types';
import { bankProblems, countBetween } from './bankChecks';
import { NEAR_WINDOW, NEAREST_POOL, candidatesFor, spokenText } from './engine';
import type { VerbalBankItem, VerbalPayload, VerbalResponse } from './types';

export interface SuiteOptions {
  prefix: 'SI' | 'VC' | 'IN' | 'CO';
  module: SubtestModule<VerbalPayload, VerbalResponse>;
  bank: readonly VerbalBankItem[];
  maxPoints: 1 | 2;
  skills: string[];
  minSize: number;
  parentScorable: boolean;
}

export const req = (difficulty: number, seed: number, exclude?: string[]): GenerateRequest => ({
  difficulty, seed, age: 7, mode: 'practice', exclude,
});

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function verbalModuleSuite(o: SuiteOptions) {
  const { module: m, bank } = o;
  const byId = new Map(bank.map((b) => [b.id, b]));

  describe(`${o.prefix} bank`, () => {
    it('passes integrity checks (unique ids, one best answer, unique choices, rubric, range)', () => {
      expect(bankProblems(bank, { prefix: o.prefix, maxPoints: o.maxPoints, skills: o.skills, requirePartial: o.maxPoints === 2 })).toEqual([]);
    });

    it('is big enough and spread across ages, dense for 5–10', () => {
      expect(bank.length).toBeGreaterThanOrEqual(o.minSize);
      expect(countBetween(bank, 5, 9)).toBeGreaterThanOrEqual(15);
      for (let y = 4; y <= 15; y++) expect(countBetween(bank, y, y + 0.99), `items aged ${y}`).toBeGreaterThan(0);
      for (let y = 5; y <= 9; y++) expect(countBetween(bank, y, y + 0.99), `items aged ${y}`).toBeGreaterThanOrEqual(4);
      expect(Math.max(...bank.map((b) => b.difficulty))).toBeGreaterThanOrEqual(15.5);
    });

    it('uses every skill tag it declares', () => {
      for (const s of o.skills) expect(bank.some((b) => b.skill === s), s).toBe(true);
    });
  });

  describe(`${o.prefix} generator`, () => {
    it('is deterministic and returns the bank item unchanged apart from choice order', () => {
      for (const d of [4, 7, 10.5, 15]) {
        const a = m.generate(req(d, 99));
        expect(m.generate(req(d, 99))).toEqual(a);
        const b = byId.get(a.id)!;
        expect(b).toBeDefined();
        expect(a.subtest).toBe(o.prefix);
        expect(a.difficulty).toBe(b.difficulty);
        expect(a.maxPoints).toBe(o.maxPoints);
        expect(a.skills).toEqual([b.skill]);
        expect(a.explanation).toBe(b.explanation);
        expect(a.payload.parentScorable).toBe(o.parentScorable);
        expect(a.hints.length).toBeGreaterThanOrEqual(2);
        expect(a.speak && a.speak.length).toBeTruthy();
        expect(a.payload.choices.map((c) => c.text).sort()).toEqual(b.choices.map((c) => c.text).sort());
      }
    });

    it('varies the item and shuffles the position of the best answer across seeds', () => {
      const ids = new Set<string>();
      const bestPos = new Set<number>();
      for (let seed = 0; seed < 60; seed++) {
        const it = m.generate(req(7, seed));
        ids.add(it.id);
        bestPos.add(it.payload.choices.findIndex((c) => c.points === o.maxPoints));
      }
      expect(ids.size).toBeGreaterThanOrEqual(3);
      expect(bestPos.size).toBe(4);
    });

    it('picks among the nearest-difficulty items', () => {
      for (let t = 3; t <= 18; t += 0.5) {
        const nearest = Math.min(...bank.map((b) => Math.abs(b.difficulty - Math.max(3, Math.min(18, t)))));
        for (let seed = 0; seed < 25; seed++) {
          const it = m.generate(req(t, seed * 7919 + 1));
          const dist = Math.abs(it.difficulty - Math.max(3, Math.min(18, t)));
          expect(dist).toBeLessThanOrEqual(nearest + NEAR_WINDOW + 1e-9);
          const cands = candidatesFor(bank, t);
          expect(cands.length).toBeLessThanOrEqual(NEAREST_POOL);
          expect(cands.map((c) => c.id)).toContain(it.id);
        }
      }
    });

    it('gets harder as the requested difficulty rises', () => {
      const avg = [4, 6, 8, 10, 12, 14, 16].map((d) => mean(Array.from({ length: 120 }, (_, s) => m.generate(req(d, s)).difficulty)));
      for (let i = 1; i < avg.length; i++) expect(avg[i]).toBeGreaterThan(avg[i - 1]);
    });

    it('avoids recently seen items when it can', () => {
      for (const d of [5, 7, 9, 12]) {
        const seen = candidatesFor(bank, d).map((c) => c.id);
        for (let seed = 0; seed < 40; seed++) {
          const it = m.generate(req(d, seed, seen));
          expect(seen).not.toContain(it.id);
          expect(Math.abs(it.difficulty - d)).toBeLessThanOrEqual(3);
        }
      }
    });

    it('still returns an item when everything is excluded', () => {
      const all = bank.map((b) => b.id);
      const it = m.generate(req(8, 3, all));
      expect(byId.has(it.id)).toBe(true);
      expect(Math.abs(it.difficulty - 8)).toBeLessThanOrEqual(2);
    });
  });

  describe(`${o.prefix} scoring`, () => {
    const item = m.generate(req(8, 11));
    const best = item.payload.choices.find((c) => c.points === o.maxPoints)!;
    const wrong = item.payload.choices.find((c) => c.points === 0)!;

    it('gives full points for the best answer', () => {
      const out = m.score(item, { choice: best.text });
      expect(out.points).toBe(o.maxPoints);
      expect(out.correct).toBe(true);
    });

    it('gives 0 for a wrong answer, an unknown answer, an empty response and a timeout', () => {
      const out = m.score(item, { choice: wrong.text });
      expect(out.points).toBe(0);
      expect(out.correct).toBe(false);
      expect(out.feedback).toBe(wrong.why);
      expect(m.score(item, { choice: 'banana pancakes' }).points).toBe(0);
      expect(m.score(item, {}).points).toBe(0);
      const nul = m.score(item, null);
      expect(nul.points).toBe(0);
      expect(nul.correct).toBe(false);
    });

    if (o.maxPoints === 2) {
      it('gives 1 point and a "better answer" note for the partial answer', () => {
        const part = item.payload.choices.find((c) => c.points === 1)!;
        const out = m.score(item, { choice: part.text });
        expect(out.points).toBe(1);
        expect(out.correct).toBe(false);
        expect(out.feedback).toMatch(/1 point/);
        expect(out.feedback).toContain(part.why);
        expect(out.meta?.partial).toBe(1);
      });
    }

    if (o.parentScorable) {
      it('uses the grown-up score in parent-scoring mode', () => {
        for (const p of [0, 1, 2] as const) {
          const out = m.score(item, { parentScore: p });
          expect(out.points).toBe(p);
          expect(out.correct).toBe(p === 2);
          expect(out.meta?.parentScored).toBe(1);
        }
      });
    } else {
      it('ignores a grown-up score (multiple choice only)', () => {
        expect(m.score(item, { parentScore: 2 }).points).toBe(0);
        expect(m.score(item, { parentScore: 2, choice: best.text }).points).toBe(1);
      });
    }
  });

  describe(`${o.prefix} player`, () => {
    afterEach(cleanup);
    const speak = () => Promise.resolve();
    const saidButton = () => screen.queryByRole('button', { name: /I said my answer/ });

    it('renders in every mode, with grown-up scoring, and on a timeout reveal', () => {
      for (const mode of ['tutor', 'practice', 'test'] as Mode[]) {
        for (const parentScoring of [false, true]) {
          const item = m.generate({ ...req(7, 11), mode });
          const { container, unmount } = render(
            createElement(m.Player, { item, mode, age: 7, onSubmit: () => undefined, hintLevel: 0, speak, parentScoring }),
          );
          const grownUp = parentScoring && o.parentScorable;
          // The question is printed for reading support (and for the grown-up), never in test mode's say-first flow.
          if (mode !== 'test' || grownUp) expect(container.textContent).toContain(spokenText(item.payload.prompt));
          else expect(container.textContent).not.toContain(spokenText(item.payload.prompt));
          // Say-first: no choices until the child has said an answer (grown-up mode never shows choices).
          expect(screen.queryByRole('button', { name: spokenText(item.payload.choices[0].text) })).toBeNull();
          expect(!!saidButton()).toBe(!grownUp);
          unmount();
        }
      }
      const item = m.generate(req(7, 12));
      const { container } = render(
        createElement(m.Player, { item, mode: 'practice', age: 7, onSubmit: () => undefined, hintLevel: 1, speak, reveal: { response: null, outcome: m.score(item, null) } }),
      );
      const best = item.payload.choices.find((c) => c.points === o.maxPoints)!.text;
      expect(container.textContent).toContain(spokenText(best));
    });

    it('say-first in test mode: question never printed, choices only after "I said my answer", scoring unchanged', () => {
      for (const d of [4, 6, 8, 11, 15]) {
        for (let seed = 0; seed < 4; seed++) {
          const item = m.generate({ ...req(d, seed * 31 + 5), mode: 'test' });
          const prompt = spokenText(item.payload.prompt);
          const k = seed % item.payload.choices.length;
          const pick = item.payload.choices[k];
          let sent: VerbalResponse | null = null;
          const { container, unmount } = render(
            createElement(m.Player, { item, mode: 'test', age: 7, onSubmit: (r: VerbalResponse) => (sent = r), hintLevel: 0, speak }),
          );
          expect(container.textContent).not.toContain(prompt);
          expect(screen.queryByRole('button', { name: 'Skip to choices' })).toBeNull();
          fireEvent.click(saidButton()!);
          expect(container.textContent).not.toContain(prompt);
          fireEvent.click(screen.getByRole('button', { name: spokenText(pick.text) }));
          expect(sent).toEqual({ choice: pick.text, saidFirst: true });
          expect(m.score(item, sent).points).toBe(Math.min(pick.points, o.maxPoints));
          expect(m.score(item, sent).points).toBe(m.score(item, { choice: pick.text }).points);
          unmount();
        }
      }
    });
  });
}
