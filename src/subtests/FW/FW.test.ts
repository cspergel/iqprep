import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generate, Player, score, TEMPLATE_IDS, type FwPayload } from './index';
import { consistentWeights } from './check';

const req = (difficulty: number, seed: number) => ({ difficulty, seed, age: 7, mode: 'practice' as const });
const DIFFS = [3, 4.5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 12, 13, 14, 14.5, 15.5, 16.5, 18];

/** Independent brute force (written separately from check.ts): every weight vector in 1..9 that keeps the shown scales level. */
function allConsistent(p: FwPayload): number[][] {
  const k = p.shapes.length;
  const sum = (side: number[], w: number[]) => side.reduce((s, n, i) => s + n * w[i], 0);
  const out: number[][] = [];
  const rec = (w: number[]) => {
    if (w.length === k) {
      if (p.refs.every((r) => sum(r.left, w) === sum(r.right, w))) out.push(w);
      return;
    }
    for (let x = 1; x <= 9; x++) rec([...w, x]);
  };
  rec([]);
  return out;
}
const sum = (side: number[], w: number[]) => side.reduce((s, n, i) => s + n * w[i], 0);

describe('Figure Weights generator', () => {
  it('is deterministic for a given seed', () => {
    expect(generate(req(9, 42))).toEqual(generate(req(9, 42)));
    const a = generate(req(9, 1)).payload;
    const b = generate(req(9, 2)).payload;
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('reaches every template, stays near the requested difficulty, and gets harder', () => {
    const seen = new Set<string>();
    for (const d of DIFFS) for (let seed = 0; seed < 20; seed++) {
      const it = generate(req(d, seed));
      seen.add(it.payload.template);
      if (d >= 5 && d <= 16) expect(Math.abs(it.difficulty - d)).toBeLessThanOrEqual(1);
    }
    expect([...seen].sort()).toEqual([...TEMPLATE_IDS].sort());
    const mean = (d: number) => {
      let s = 0;
      for (let seed = 0; seed < 30; seed++) s += generate(req(d, seed)).difficulty;
      return s / 30;
    };
    const means = [5, 7, 9, 11, 13, 15].map(mean);
    for (let i = 1; i < means.length; i++) expect(means[i]).toBeGreaterThan(means[i - 1]);
    // more clue scales at the top end
    expect(generate(req(15, 3)).payload.refs.length).toBeGreaterThan(generate(req(5, 3)).payload.refs.length);
  });

  it('answer is derivable from the scales and every distractor is definitely wrong (brute force, 1–9)', () => {
    for (const d of DIFFS) {
      for (let seed = 0; seed < 25; seed++) {
        const it = generate(req(d, seed * 13 + 5));
        const p = it.payload;
        const ws = allConsistent(p);
        expect(ws.length).toBeGreaterThan(0);
        expect(ws).toContainEqual(p.weights);
        expect(ws).toEqual(consistentWeights(p.shapes.length, p.refs));
        expect(p.options).toHaveLength(5);
        p.options.forEach((o, i) => {
          if (i === p.answer) {
            for (const w of ws) expect(sum(o, w)).toBe(sum(p.target, w));
          } else {
            for (const w of ws) expect(sum(o, w)).not.toBe(sum(p.target, w));
          }
          const n = o.reduce((a, b) => a + b, 0);
          expect(n).toBeGreaterThanOrEqual(1);
          expect(n).toBeLessThanOrEqual(8);
        });
        expect(new Set(p.options.map((o) => o.join())).size).toBe(5);
        // the reference scales really are balanced under the hidden weights
        for (const r of p.refs) expect(sum(r.left, p.weights)).toBe(sum(r.right, p.weights));
        expect(it.timeLimitSec).toBe(it.difficulty < 9 ? 20 : 30);
        expect(it.promptAtSec).toBe(it.timeLimitSec! - 10); // "Do you have an answer?" 10 s before the limit
        expect(it.speak).toBe('Which one keeps the scale level?');
        expect(it.skills.every((s) => s.startsWith('fw:'))).toBe(true);
      }
    }
  });

  it('the brute-force checker catches a guessable (underdetermined) answer', () => {
    // 1 star = 1 circle says nothing about squares, so "1 square" can't be proven to balance a star.
    const ws = consistentWeights(3, [{ left: [1, 0, 0], right: [0, 1, 0] }]);
    expect(ws.some((w) => w[0] === w[2])).toBe(true);
    expect(ws.some((w) => w[0] !== w[2])).toBe(true);
  });

  it('worked steps do correct arithmetic and name the substitution chain', () => {
    for (const d of DIFFS) for (let seed = 0; seed < 10; seed++) {
      const it = generate(req(d, seed));
      const text = [...(it.steps ?? []), it.explanation].join(' ');
      for (const m of text.matchAll(/(\d+) ([+−×]) (\d+) = (\d+)/g)) {
        const [a, op, b, c] = [Number(m[1]), m[2], Number(m[3]), Number(m[4])];
        expect(op === '+' ? a + b : op === '−' ? a - b : a * b).toBe(c);
      }
      expect(it.steps!.length).toBeGreaterThanOrEqual(2);
      expect(text).not.toMatch(/undefined|NaN/);
    }
  });
});

describe('Figure Weights scoring', () => {
  const item = generate(req(8, 4));
  it('credits only the balancing option', () => {
    expect(score(item, item.payload.answer)).toMatchObject({ points: 1, correct: true });
    const wrong = (item.payload.answer + 1) % 5;
    const out = score(item, wrong);
    expect(out).toMatchObject({ points: 0, correct: false });
    expect(out.feedback).toMatch(/too (heavy|light)/);
  });
  it('scores a timeout as zero', () => {
    expect(score(item, null)).toEqual({ points: 0, correct: false, meta: { scales: item.payload.refs.length } });
  });
});

describe('Figure Weights player', () => {
  afterEach(cleanup);
  const base = { mode: 'practice' as const, age: 7, speak: () => Promise.resolve() };
  it('selects and submits an option; shows the hint scaffold', () => {
    const item = generate(req(10, 2));
    const onSubmit = vi.fn();
    render(createElement(Player, { ...base, item, onSubmit, hintLevel: 2 }));
    fireEvent.click(screen.getByLabelText(/^Option 2:/));
    fireEvent.click(screen.getByText('Done ✓'));
    expect(onSubmit).toHaveBeenCalledWith(1);
    expect(screen.getByRole('note').textContent).toMatch(/glowing/);
  });
  it('locks on reveal', () => {
    const item = generate(req(6, 2));
    render(createElement(Player, { ...base, item, onSubmit: () => {}, hintLevel: 0, reveal: { response: 0, outcome: score(item, 0) } }));
    expect(screen.queryByText('Done ✓')).toBeNull();
  });
});

describe('Figure Weights anti-shortcut: answer weight rank', () => {
  it('the answer can be the lightest, middle or heaviest option — no rank dominates', async () => {
    const { weightOf } = await import('./check');
    const rank = [0, 0, 0, 0, 0];
    const N = 600;
    for (let i = 0; i < N; i++) {
      const it = generate({ difficulty: 4 + (i % 13), seed: i * 13 + 1, age: 8, mode: 'practice' });
      const t = it.payload.options.map((o) => weightOf(o, it.payload.weights));
      const sorted = [...t].sort((a, b) => a - b);
      rank[sorted.indexOf(t[it.payload.answer])] += 1;
    }
    for (const r of rank) expect(r / N).toBeLessThan(0.4);
    expect(rank[4] / N).toBeGreaterThan(0.08); // sometimes the heaviest
    expect(rank[0] / N).toBeGreaterThan(0.08); // sometimes the lightest
  });
});

describe('Figure Weights format fidelity', () => {
  afterEach(cleanup);
  const base = { age: 7, speak: () => Promise.resolve(), onSubmit: () => {}, hintLevel: 0 };

  it('shows the 5 options numbered 1–5 in one fixed row, under the same stem every time', () => {
    for (const [d, seed] of [[5, 3], [10, 4], [15, 8]] as const) {
      const item = generate(req(d, seed));
      const { container } = render(createElement(Player, { ...base, mode: 'test', item }));
      const buttons = Array.from(container.querySelectorAll('button.choice'));
      expect(buttons).toHaveLength(5);
      expect(buttons.map((b) => b.querySelector('.letter')!.textContent)).toEqual(['1', '2', '3', '4', '5']);
      buttons.forEach((b, i) => expect(b.getAttribute('aria-label')).toMatch(new RegExp(`^Option ${i + 1}:`)));
      expect((buttons[0].parentElement as HTMLElement).style.gridTemplateColumns).toBe('repeat(5, minmax(0, 1fr))');
      expect(screen.getByText('Which one keeps the scale level?')).toBeTruthy();
      // every option draws exactly its weights, at one shared scale
      buttons.forEach((b, i) => {
        const n = item.payload.options[i].reduce((a, x) => a + x, 0);
        expect(b.querySelectorAll('svg svg')).toHaveLength(n);
      });
      cleanup();
    }
  });

  it('colour-blind-safe weights: only red, blue, yellow and black, and no two weights share a shape', () => {
    const SAFE = new Set(['red', 'blue', 'yellow', 'black']);
    for (const d of DIFFS) {
      for (let seed = 0; seed < 30; seed++) {
        const { shapes } = generate(req(d, seed * 11 + 3)).payload;
        for (const s of shapes) expect(SAFE.has(s.color)).toBe(true);
        expect(new Set(shapes.map((s) => s.color)).size).toBe(shapes.length);
        // colour is never the only cue: each weight also has its own shape
        expect(new Set(shapes.map((s) => s.kind)).size).toBe(shapes.length);
      }
    }
  });
});
