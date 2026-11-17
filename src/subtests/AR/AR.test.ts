import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Mode } from '../../core/types';
import { AR_REPEAT_FROM, arRepeats, arTapToCount, generate, nextCountOrder, Player, score, TEMPLATE_IDS } from './index';

const req = (difficulty: number, seed: number) => ({ difficulty, seed, age: 7, mode: 'practice' as const });
const DIFFS = [3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 15.5, 16, 16.5, 18];

function* items(perDiff = 30) {
  for (const d of DIFFS) for (let seed = 0; seed < perDiff; seed++) yield generate(req(d, seed * 31 + 7));
}

describe('Arithmetic generator', () => {
  it('is deterministic for a given seed', () => {
    expect(generate(req(9, 42))).toEqual(generate(req(9, 42)));
    expect(generate(req(9, 1)).payload.text).not.toBe(generate(req(9, 2)).payload.text);
  });

  it('reaches every template, stays near the requested difficulty, and gets harder', () => {
    const seen = new Set<string>();
    for (const d of DIFFS) for (let seed = 0; seed < 25; seed++) {
      const it = generate(req(d, seed));
      seen.add(it.payload.template);
      if (d >= 4 && d <= 16) expect(Math.abs(it.difficulty - d)).toBeLessThanOrEqual(0.75);
    }
    expect([...seen].sort()).toEqual([...TEMPLATE_IDS].sort());
    const mean = (d: number) => {
      let s = 0;
      for (let seed = 0; seed < 30; seed++) s += generate(req(d, seed)).difficulty;
      return s / 30;
    };
    const means = [4, 6, 8, 10, 12, 14, 16].map(mean);
    for (let i = 1; i < means.length; i++) expect(means[i]).toBeGreaterThan(means[i - 1]);
  });

  it('every math sentence in the worked solution is true, and the answer is a whole number', () => {
    for (const it of items()) {
      const p = it.payload;
      expect(Number.isInteger(p.answer)).toBe(true);
      expect(p.answer).toBeGreaterThanOrEqual(0);
      expect(p.answer).toBeLessThanOrEqual(99999);
      const work = [...(it.steps ?? []), it.explanation].join(' ');
      expect(work + p.text).not.toMatch(/undefined|NaN|\[object/);
      for (const m of work.matchAll(/(\d+) ([+−×÷]) (\d+) = (\d+)/g)) {
        const [a, op, b, c] = [Number(m[1]), m[2], Number(m[3]), Number(m[4])];
        const v = op === '+' ? a + b : op === '−' ? a - b : op === '×' ? a * b : a / b;
        expect(v, `${m[0]} in ${p.template}`).toBe(c);
      }
      // the answer is stated in the explanation
      expect(it.explanation.match(/\d+/g) ?? []).toContain(String(p.answer));
      // every number in the story is actually used in the worked solution
      const used = new Set(work.match(/\d+/g) ?? []);
      for (const n of p.text.match(/\d+/g) ?? []) expect(used.has(n), `${n} unused in ${p.template}: ${p.text}`).toBe(true);
      // multi-step stories show their steps
      if (it.skills.includes('ar:two-step')) expect(it.steps && it.steps.length).toBeGreaterThanOrEqual(2);
      expect(it.timeLimitSec).toBe(30);
      expect(it.skills.every((s) => s.startsWith('ar:'))).toBe(true);
      expect(it.hints.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('picture items match their pictures (independent count)', () => {
    let n = 0;
    for (const it of items(40)) {
      const pics = it.payload.pictures;
      if (!pics) continue;
      n++;
      const g = pics.groups;
      const expected =
        pics.layout === 'count' ? g[0].count
        : pics.layout === 'add' ? g[0].count + g[1].count
        : pics.layout === 'take' ? g[0].count - (g[0].crossed ?? 0)
        : g[0].count - g[1].count;
      expect(it.payload.answer).toBe(expected);
      expect(expected).toBeGreaterThan(0);
    }
    expect(n).toBeGreaterThan(50);
  });

  it('young items use pictures, older items are listening-only', () => {
    for (let seed = 0; seed < 30; seed++) {
      expect(generate(req(4, seed)).payload.pictures).toBeDefined();
      expect(generate(req(10, seed)).payload.pictures).toBeUndefined();
    }
  });

  it('has varied stories', () => {
    const texts = new Set<string>();
    for (let seed = 0; seed < 40; seed++) texts.add(generate(req(8, seed)).payload.text);
    expect(texts.size).toBeGreaterThan(35);
  });
});

describe('Arithmetic scoring', () => {
  const item = generate(req(8, 3)); // two-step template at 8
  it('needs an exact numeric match', () => {
    expect(score(item, item.payload.answer)).toMatchObject({ points: 1, correct: true });
    expect(score(item, item.payload.answer + 2)).toMatchObject({ points: 0, correct: false });
    expect(score(item, item.payload.answer + 1).feedback).toMatch(/Off by just one/);
  });
  it('nudges a child who stopped after the first step', () => {
    const two = [...Array(40).keys()].map((s) => generate(req(8, s))).find((x) => x.payload.partials?.length)!;
    expect(score(two, two.payload.partials![0]).feedback).toMatch(/one more step/);
  });
  it('scores a timeout as zero', () => {
    expect(score(item, null)).toMatchObject({ points: 0, correct: false });
  });
});

/** First seed whose generated item satisfies `ok`. */
function findItem(d: number, ok: (it: ReturnType<typeof generate>) => boolean) {
  for (let seed = 0; seed < 500; seed++) {
    const it = generate(req(d, seed));
    if (ok(it)) return it;
  }
  throw new Error('no item found');
}

async function startStory(item: ReturnType<typeof generate>, mode: Mode) {
  const speak = vi.fn(() => Promise.resolve());
  const onSubmit = vi.fn();
  const view = render(createElement(Player, { item, mode, age: 7, speak, onSubmit, hintLevel: 0 }));
  expect(speak).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(screen.getByText(/Read me the story/)); });
  expect(speak).toHaveBeenCalledWith(item.payload.text, { force: true });
  return { speak, onSubmit, ...view };
}

describe('Arithmetic repeat rule', () => {
  it('test mode: no repeat before difficulty 9, one repeat from 9; practice and tutor always one', () => {
    for (const d of [3.5, 5, 7, 8.5, 8.99]) {
      expect(arRepeats('test', d)).toBe(0);
      expect(arRepeats('practice', d)).toBe(1);
      expect(arRepeats('tutor', d)).toBe(1);
    }
    for (const d of [AR_REPEAT_FROM, 9.5, 12, 16.5]) {
      expect(arRepeats('test', d)).toBe(1);
      expect(arRepeats('practice', d)).toBe(1);
    }
  });
});

describe('Arithmetic player', () => {
  afterEach(cleanup);

  it('test mode, a later item (difficulty ≥ 9): reads aloud (forced), allows one repeat, submits the typed number', async () => {
    const item = findItem(9, (it) => it.difficulty >= 9);
    const { speak, onSubmit } = await startStory(item, 'test');
    await act(async () => { fireEvent.click(screen.getByText(/Hear it again/)); });
    expect(speak).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/Hear it again/)).toBeNull();
    const digits = String(item.payload.answer).split('');
    for (const d of digits) fireEvent.click(screen.getAllByRole('button', { name: d })[0]);
    fireEvent.click(screen.getByText('Done ✓'));
    expect(onSubmit).toHaveBeenCalledWith(item.payload.answer);
  });

  it('test mode, an earlier item (difficulty < 9): no repeat button at all', async () => {
    for (const d of [4, 6.5, 8.5]) {
      const item = findItem(d, (it) => it.difficulty < 9);
      await startStory(item, 'test');
      expect(screen.queryByText(/Hear it again/)).toBeNull();
      cleanup();
    }
  });

  it('practice and tutor keep one repeat on early items', async () => {
    for (const mode of ['practice', 'tutor'] as Mode[]) {
      const item = findItem(6.5, (it) => it.difficulty < 9);
      const { speak } = await startStory(item, mode);
      await act(async () => { fireEvent.click(screen.getByText(/Hear it again/)); });
      expect(speak).toHaveBeenCalledTimes(2);
      expect(screen.queryByText(/Hear it again/)).toBeNull();
      cleanup();
    }
  });
});

describe('Arithmetic tap-to-count', () => {
  afterEach(cleanup);

  it('is on for picture items below difficulty 5 only', () => {
    for (let seed = 0; seed < 40; seed++) {
      for (const d of [3, 3.5, 4]) {
        const it = generate(req(d, seed));
        expect(it.payload.pictures?.layout).toBe('count');
        expect(arTapToCount(it)).toBe(true);
      }
      for (const d of [5, 5.5, 6]) {
        const it = generate(req(d, seed));
        if (it.difficulty >= 5) expect(arTapToCount(it)).toBe(false); // add / take-away / compare pictures
      }
      for (const d of [6.5, 8, 12]) expect(arTapToCount(generate(req(d, seed)))).toBe(false);
    }
  });

  it('badge order: tap appends, tapping a counted one takes it and later ones back', () => {
    let o: number[] = [];
    for (const t of [2, 0, 4]) o = nextCountOrder(o, t);
    expect(o).toEqual([2, 0, 4]);
    expect(nextCountOrder(o, 0)).toEqual([2]);
    expect(nextCountOrder(o, 4)).toEqual([2, 0]);
    expect(nextCountOrder(o, 1)).toEqual([2, 0, 4, 1]);
  });

  it('tapping pictures numbers them 1, 2, 3… without submitting; the answer still goes on the keypad', async () => {
    const item = findItem(4, (it) => arTapToCount(it) && (it.payload.pictures?.groups[0].count ?? 0) >= 4);
    const { onSubmit, container } = await startStory(item, 'test');
    const n = item.payload.pictures!.groups[0].count;
    const pics = screen.getAllByRole('button', { name: /^Picture \d+/ });
    expect(pics).toHaveLength(n);
    const badges = () => [...container.querySelectorAll('.ar-badge')].map((b) => b.textContent);
    expect(badges()).toEqual([]);
    fireEvent.click(pics[2]);
    fireEvent.click(pics[0]);
    fireEvent.click(pics[3]);
    expect(pics[2].getAttribute('aria-label')).toBe('Picture 3, counted 1');
    expect(pics[0].getAttribute('aria-label')).toBe('Picture 1, counted 2');
    expect(pics[3].getAttribute('aria-label')).toBe('Picture 4, counted 3');
    expect(pics[1].getAttribute('aria-pressed')).toBe('false');
    expect(badges().sort()).toEqual(['1', '2', '3']);
    fireEvent.click(pics[0]); // un-count: takes back 2 and 3
    expect(badges()).toEqual(['1']);
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Count again/ }));
    expect(badges()).toEqual([]);
    expect(onSubmit).not.toHaveBeenCalled();
    for (const d of String(item.payload.answer)) fireEvent.click(screen.getAllByRole('button', { name: d })[0]);
    fireEvent.click(screen.getByText('Done ✓'));
    expect(onSubmit).toHaveBeenCalledWith(item.payload.answer);
  });

  it('later picture items (difficulty ≥ 5) have no count buttons', async () => {
    const item = findItem(5.5, (it) => !!it.payload.pictures && it.difficulty >= 5);
    const { container } = await startStory(item, 'practice');
    expect(screen.queryAllByRole('button', { name: /^Picture \d+/ })).toHaveLength(0);
    expect(container.querySelector('.ar-badge')).toBeNull();
  });

  it('the reveal numbers every picture as the worked count', () => {
    const item = findItem(4, (it) => arTapToCount(it));
    const n = item.payload.pictures!.groups[0].count;
    const { container } = render(createElement(Player, {
      item, mode: 'practice', age: 7, speak: () => Promise.resolve(), onSubmit: () => undefined, hintLevel: 0,
      reveal: { response: n, outcome: score(item, n) },
    }));
    expect([...container.querySelectorAll('.ar-badge')].map((b) => b.textContent)).toEqual(Array.from({ length: n }, (_, i) => String(i + 1)));
  });
});
