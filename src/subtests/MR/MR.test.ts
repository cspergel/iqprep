import { createElement } from 'react';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generate, Player, score, SERIES_IDS, TEMPLATE_IDS, type MrPayload } from './index';
import { consistentOptions, explainsSeries, fillGap, isConsistent, majorityScores, type MrCell } from './model';

const req = (difficulty: number, seed: number) => ({ difficulty, seed, age: 7, mode: 'practice' as const });

/** Attributes a child can see, read straight off the payload (independent of the module's helpers). */
function visible(c: MrCell): Record<string, string | number> {
  const o: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(c)) {
    if (k === 'kind') continue;
    if (k === 'spokes') {
      for (let i = 0; i < 8; i++) o[`s${i}`] = (v as number[]).includes(i) ? 1 : 0;
    } else o[k] = v as string | number;
  }
  return o;
}

function diffCount(a: MrCell, b: MrCell): number {
  const va = visible(a);
  const vb = visible(b);
  return Object.keys({ ...va, ...vb }).filter((k) => va[k] !== vb[k]).length;
}

/** Naive test-wise strategy: pick the option whose attribute values are most common; ties split evenly. */
function shortcutHitRate(options: MrCell[], answer: number, pick: 'max' | 'min'): number {
  const attrs = options.map(visible);
  const counts = new Map<string, number>();
  for (const a of attrs) for (const [k, v] of Object.entries(a)) counts.set(`${k}=${v}`, (counts.get(`${k}=${v}`) ?? 0) + 1);
  const scores = attrs.map((a) => Object.entries(a).reduce((s, [k, v]) => s + (counts.get(`${k}=${v}`) ?? 0), 0));
  const target = pick === 'max' ? Math.max(...scores) : Math.min(...scores);
  const tied = scores.map((s, i) => (s === target ? i : -1)).filter((i) => i >= 0);
  return tied.includes(answer) ? 1 / tied.length : 0;
}

const DIFFS = [3, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 15.5, 16, 16.5, 18];

describe('Matrix Reasoning generator', () => {
  it('is deterministic for a given seed', () => {
    for (const d of [4, 8, 13]) {
      expect(generate(req(d, 42))).toEqual(generate(req(d, 42)));
    }
    expect(generate(req(9, 1)).payload).not.toEqual(generate(req(9, 2)).payload);
  });

  it('reaches every template and stays close to the requested difficulty', () => {
    const seen = new Set<string>();
    for (const d of DIFFS) {
      for (let seed = 0; seed < 30; seed++) {
        const it = generate(req(d, seed));
        seen.add(it.payload.template);
        if (d >= 4 && d <= 16) expect(Math.abs(it.difficulty - d)).toBeLessThanOrEqual(1);
      }
    }
    expect([...seen].sort()).toEqual([...TEMPLATE_IDS].sort());
  });

  it('gets harder (on average) as requested difficulty rises', () => {
    const mean = (d: number) => {
      let s = 0;
      for (let seed = 0; seed < 40; seed++) s += generate(req(d, seed)).difficulty;
      return s / 40;
    };
    const means = [4, 6, 8, 10, 12, 14, 16].map(mean);
    for (let i = 1; i < means.length; i++) expect(means[i]).toBeGreaterThan(means[i - 1]);
    // more rules at the top end
    const rules = (d: number) => generate(req(d, 5)).payload.rules;
    expect(rules(16)).toBeGreaterThan(rules(8));
  });

  it('has exactly one rule-consistent option, 5 distinct options, and well-formed teaching content', () => {
    for (const d of DIFFS) {
      for (let seed = 0; seed < 25; seed++) {
        const it = generate(req(d, seed * 7 + 1));
        const p = it.payload;
        expect(p.options).toHaveLength(5);
        expect(p.cells.length).toBe(p.rows * p.cols - 1);
        expect(consistentOptions(p)).toEqual([p.answer]);
        const keys = p.options.map((o) => JSON.stringify(visible(o)));
        expect(new Set(keys).size).toBe(5);
        // distractors are near misses: each differs, at least two differ in exactly one visible attribute
        const dists = p.options.map((o) => diffCount(o, p.options[p.answer]));
        expect(dists.filter((x) => x === 0)).toHaveLength(1);
        expect(dists.filter((x) => x === 1).length).toBeGreaterThanOrEqual(2);
        expect(it.hints.length).toBeGreaterThanOrEqual(2);
        expect(it.explanation.length).toBeGreaterThan(20);
        expect(it.skills.length).toBeGreaterThan(0);
        expect(it.skills.every((s) => s.startsWith('mr:'))).toBe(true);
        if (p.rules >= 2) expect(it.steps && it.steps.length).toBeGreaterThanOrEqual(3);
        // soft 60 s limit with an examiner-style prompt at 30 s (no hard cut-off by difficulty)
        expect(it.timeLimitSec).toBe(60);
        expect(it.promptAtSec).toBe(30);
      }
    }
  });

  it('the checker really rejects a broken grid', () => {
    const p = generate(req(10, 3)).payload;
    const wrong = p.options.findIndex((_, i) => i !== p.answer);
    expect(isConsistent(p.rows, p.cols, fillGap(p.cells, p.options[wrong], p.gap))).toBe(false);
    expect(isConsistent(p.rows, p.cols, fillGap(p.cells, p.options[p.answer], p.gap))).toBe(true);
  });

  it('cannot be beaten by picking the most typical (or least typical) option', () => {
    let maxHits = 0;
    let minHits = 0;
    let n = 0;
    for (const d of DIFFS) {
      for (let seed = 0; seed < 40; seed++) {
        const p = generate(req(d, 1000 + seed)).payload;
        maxHits += shortcutHitRate(p.options, p.answer, 'max');
        minHits += shortcutHitRate(p.options, p.answer, 'min');
        n++;
      }
    }
    // chance is 20%
    expect(maxHits / n).toBeLessThan(0.28);
    expect(minHits / n).toBeLessThan(0.28);
  });

  it('spreads the answer position across options 1–5', () => {
    const counts = [0, 0, 0, 0, 0];
    for (let seed = 0; seed < 300; seed++) counts[generate(req(9, seed)).payload.answer]++;
    for (const c of counts) expect(c).toBeGreaterThan(30);
  });
});

describe('Matrix Reasoning scoring', () => {
  const item = generate(req(8, 11));
  it('credits only the right option', () => {
    expect(score(item, item.payload.answer)).toMatchObject({ points: 1, correct: true });
    const wrong = (item.payload.answer + 1) % 5;
    expect(score(item, wrong)).toMatchObject({ points: 0, correct: false });
  });

  it('scores a timeout as zero', () => {
    expect(score(item, null)).toEqual({ points: 0, correct: false, meta: { rules: item.payload.rules } });
  });

  it('gives near-miss feedback when only one thing was off', () => {
    let found = false;
    for (let seed = 0; seed < 50 && !found; seed++) {
      const it = generate(req(6, seed));
      it.payload.options.forEach((o, i) => {
        if (i !== it.payload.answer && diffCount(o, it.payload.options[it.payload.answer]) === 1) {
          expect(score(it, i).feedback).toMatch(/So close/);
          found = true;
        }
      });
    }
    expect(found).toBe(true);
  });
});

describe('Matrix Reasoning player', () => {
  afterEach(cleanup);
  const base = { mode: 'practice' as const, age: 7, speak: () => Promise.resolve() };

  it('lets the child pick a piece and submit it', () => {
    const item = generate(req(9, 4));
    const onSubmit = vi.fn();
    render(createElement(Player, { ...base, item, onSubmit, hintLevel: 1 }));
    expect(screen.getByText('Done ✓')).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByLabelText(/^Option 3:/));
    fireEvent.click(screen.getByText('Done ✓'));
    expect(onSubmit).toHaveBeenCalledWith(2);
    expect(screen.getByRole('note').textContent).toMatch(/row/);
  });

  it('locks input on reveal', () => {
    const item = generate(req(5, 4));
    const p: MrPayload = item.payload;
    render(createElement(Player, { ...base, item, onSubmit: () => {}, hintLevel: 0, reveal: { response: 0, outcome: score(item, 0) } }));
    expect(screen.queryByText('Done ✓')).toBeNull();
    expect(screen.getByLabelText(new RegExp(`^Option ${p.answer + 1}:`))).toHaveProperty('disabled', true);
  });
});

describe('Matrix Reasoning series items (one row, what changes each step)', () => {
  type Gen = ReturnType<typeof generate>;
  const SERIES_DIFFS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15];
  const isSeries = (it: Gen) => it.skills.includes('mr:series');
  const found: { d: number; seed: number; it: Gen }[] = [];
  for (const d of SERIES_DIFFS) {
    for (let seed = 0; seed < 320; seed++) {
      const it = generate(req(d, seed));
      if (isSeries(it)) found.push({ d, seed, it });
    }
  }
  const items = found.map((f) => f.it);

  it('mixes series items in across difficulty 6–15 at roughly 15–25%', () => {
    const share = items.length / (SERIES_DIFFS.length * 320);
    expect(share).toBeGreaterThan(0.15);
    expect(share).toBeLessThan(0.25);
    for (const d of SERIES_DIFFS) {
      const here = found.filter((f) => f.d === d);
      expect(here.length).toBeGreaterThan(30);
      for (const f of here) expect(Math.abs(f.it.difficulty - d)).toBeLessThanOrEqual(1);
    }
    expect(new Set(items.map((it) => it.payload.template))).toEqual(new Set(SERIES_IDS));
    // not offered to the youngest or at the very top
    for (let seed = 0; seed < 200; seed++) {
      expect(isSeries(generate(req(4.5, seed)))).toBe(false);
      expect(isSeries(generate(req(17, seed)))).toBe(false);
    }
  });

  it('series items are single rows with a gap (sometimes in the middle) and get harder with the request', () => {
    let middle = 0;
    for (const it of items) {
      const p = it.payload;
      expect(p.rows).toBe(1);
      expect(p.cols).toBeGreaterThanOrEqual(4);
      expect(p.cols).toBeLessThanOrEqual(6);
      expect(p.cells).toHaveLength(p.cols - 1);
      expect(p.gap).toBeGreaterThanOrEqual(1);
      expect(p.gap).toBeLessThan(p.cols);
      if (p.gap! < p.cols - 1) middle++;
    }
    expect(middle).toBeGreaterThan(items.length / 5);
    const band = (lo: number, hi: number) => found.filter((f) => f.d >= lo && f.d <= hi).map((f) => f.it);
    const mean = (xs: Gen[], f: (it: Gen) => number) => xs.reduce((s, it) => s + f(it), 0) / xs.length;
    const bands = [band(6, 7.5), band(8, 10.5), band(11, 13), band(13.5, 15)];
    for (let i = 1; i < bands.length; i++) {
      expect(mean(bands[i], (it) => it.difficulty)).toBeGreaterThan(mean(bands[i - 1], (it) => it.difficulty));
    }
    expect(mean(bands[2], (it) => it.payload.rules)).toBeGreaterThan(mean(bands[1], (it) => it.payload.rules));
    // the hardest band uses every-other-box threads; the easiest never does
    expect(bands[3].filter((it) => it.payload.series === 'alt').length).toBeGreaterThan(bands[3].length / 3);
    expect(bands[0].some((it) => it.payload.series === 'alt')).toBe(false);
  });

  it('every series item has exactly one option that passes the checker, with near-miss distractors', () => {
    expect(items.length).toBeGreaterThan(300);
    for (const it of items) {
      const p = it.payload;
      expect(consistentOptions(p)).toEqual([p.answer]);
      expect(p.options).toHaveLength(5);
      expect(new Set(p.options.map((o) => JSON.stringify(visible(o)))).size).toBe(5);
      const dists = p.options.map((o) => diffCount(o, p.options[p.answer]));
      expect(dists.filter((x) => x === 0)).toHaveLength(1);
      expect(dists.filter((x) => x === 1).length).toBeGreaterThanOrEqual(2);
      // the answer is never the single most (or least) typical option
      const sc = majorityScores(p.options);
      const others = sc.filter((_, i) => i !== p.answer);
      expect(sc[p.answer]).toBeLessThanOrEqual(Math.max(...others));
      expect(sc[p.answer]).toBeGreaterThanOrEqual(Math.min(...others));
    }
  });

  it('is deterministic for series items', () => {
    const picked = found.filter((_, i) => i % 25 === 0);
    expect(picked.length).toBeGreaterThan(20);
    for (const f of picked) {
      expect(generate(req(f.d, f.seed))).toEqual(f.it);
      expect(generate(req(f.d, f.seed + 100000)).payload).not.toEqual(f.it.payload);
    }
  });

  it('explains every rule that changes along the row, in kid words, with the right skill tags', () => {
    const words: Record<string, RegExp> = {
      shape: /shape (takes turns|repeats)/, color: /color/, fill: /inside pattern/, size: /size/,
      count: /number of shapes/, rot: /quarter turn|eighth|half turn/, pos: /corner/,
    };
    for (const it of items) {
      const p = it.payload;
      const row = fillGap(p.cells, p.options[p.answer], p.gap).map(visible);
      const changing = Object.keys(row[0]).filter((k) => row.some((c) => c[k] !== row[0][k]));
      expect(changing.length).toBeGreaterThan(0);
      for (const k of changing) expect(it.explanation).toMatch(words[k]);
      expect(it.explanation).not.toMatch(/\d+°/);
      expect(it.skills[0]).toBe('mr:series');
      if (changing.some((k) => k === 'count' || k === 'rot' || k === 'size')) expect(it.skills).toContain('mr:progression');
      expect(p.rules).toBe(changing.length);
      if (p.rules >= 2) {
        expect(it.skills).toContain('mr:multi-rule');
        expect(it.steps!.length).toBe(p.rules + 1);
      }
      expect(it.hints.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('the series checker knows hills and every-other-box threads, and rejects near misses', () => {
    expect(explainsSeries('size', [0, 1, 2, 1, 0, 1])).toBe(true);
    expect(explainsSeries('size', [0, 1, 2, 1, 0, 0])).toBe(false);
    expect(explainsSeries('size', [0, 1, 2, 1, 0, 2])).toBe(false);
    expect(explainsSeries('count', [1, 2, 3, 4, 3])).toBe(false); // one turn-around is not a hill
    expect(explainsSeries('count', [2, 3, 2, 1, 2, 3])).toBe(true);
    expect(explainsSeries('count', [2, 3, 2, 1, 2, 1])).toBe(false); // turns round in the middle of the hill
    expect(explainsSeries('count', [1, 6, 2, 5, 3, 4])).toBe(true); // two threads: +1 and −1
    expect(explainsSeries('count', [1, 6, 2, 5, 3, 3])).toBe(false);
    expect(explainsSeries('count', [1, 6, 2, 5, 4])).toBe(false); // threads need 6 boxes
    expect(explainsSeries('rot', [0, 90, 135, 225, 270, 0])).toBe(true); // turns alternate 90, 45
    expect(explainsSeries('rot', [0, 90, 135, 225, 270, 315])).toBe(false);
    expect(explainsSeries('pos', [3, 0, 1, 2, 3, 0])).toBe(true); // corner walk wraps round
    expect(explainsSeries('fill', ['empty', 'striped', 'solid', 'empty', 'striped', 'solid'])).toBe(true);
    expect(explainsSeries('fill', ['empty', 'striped', 'solid', 'empty', 'striped', 'empty'])).toBe(false);
    expect(explainsSeries('shape', ['star', 'heart', 'star', 'heart', 'star', 'star'])).toBe(false);
    // a real middle-gap item: every distractor breaks some rule, and the gap position matters
    const it = items.find((x) => x.payload.gap! < x.payload.cols - 1 && x.payload.template === 'series-skip')!;
    const p = it.payload;
    p.options.forEach((o, i) => expect(isConsistent(1, p.cols, fillGap(p.cells, o, p.gap))).toBe(i === p.answer));
    expect(isConsistent(1, p.cols, [...p.cells, p.options[p.answer]])).toBe(false);
  });

  describe('player', () => {
    afterEach(cleanup);
    it('shows the gap where it really is, with an every-other-box scaffold', () => {
      const it = items.find((x) => x.payload.series === 'alt' && x.payload.gap! < x.payload.cols - 1)!;
      const p = it.payload;
      render(createElement(Player, { mode: 'practice', age: 7, speak: () => Promise.resolve(), item: it, onSubmit: () => {}, hintLevel: 1 }));
      const boxes = Array.from(screen.getByRole('group', { name: 'Pattern puzzle' }).children);
      expect(boxes).toHaveLength(p.cols);
      expect(boxes.findIndex((b) => b.getAttribute('aria-label') === 'Missing piece')).toBe(p.gap);
      expect(screen.getByText('Look at these. Which one goes in the gap?')).toBeTruthy();
      expect(screen.getByRole('note').textContent).toMatch(/yellow boxes follow one rule/);
      expect(boxes[p.gap!].querySelector('svg')).toBeNull();
      fireEvent.click(screen.getByLabelText(new RegExp(`^Option ${p.answer + 1}:`)));
      // the chosen piece pops into the middle gap
      expect(boxes[p.gap!].querySelector('svg')).not.toBeNull();
    });
  });
});

describe('Matrix Reasoning format fidelity', () => {
  afterEach(cleanup);
  const base = { age: 7, speak: () => Promise.resolve(), onSubmit: () => {}, hintLevel: 0 };

  it('shows the 5 options numbered 1–5 in one fixed row', () => {
    for (const [d, seed] of [[5, 3], [9, 4], [13, 8]] as const) {
      const item = generate(req(d, seed));
      const { container } = render(createElement(Player, { ...base, mode: 'test', item }));
      const buttons = Array.from(container.querySelectorAll('button.choice'));
      expect(buttons).toHaveLength(5);
      expect(buttons.map((b) => b.querySelector('.letter')!.textContent)).toEqual(['1', '2', '3', '4', '5']);
      buttons.forEach((b, i) => expect(b.getAttribute('aria-label')).toMatch(new RegExp(`^Option ${i + 1}:`)));
      const grid = buttons[0].parentElement as HTMLElement;
      expect(grid.style.gridTemplateColumns).toBe('repeat(5, minmax(0, 1fr))');
      cleanup();
    }
  });

  it('uses one instruction stem per layout, the same in speech and on screen', () => {
    const stems = new Map<string, number>();
    for (const d of [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) {
      for (let seed = 0; seed < 60; seed++) {
        const it = generate(req(d, seed));
        const p = it.payload;
        const gap = p.gap ?? p.cells.length;
        const expected = p.rows > 1 ? 'Look at these. Which one goes here?'
          : gap === p.cols - 1 ? 'Look at these. Which one comes next?' : 'Look at these. Which one goes in the gap?';
        expect(it.speak).toBe(expected);
        stems.set(expected, (stems.get(expected) ?? 0) + 1);
      }
    }
    expect(stems.size).toBe(3);
    const it = generate(req(9, 4));
    render(createElement(Player, { ...base, mode: 'practice', item: it }));
    expect(screen.getByText(it.speak!)).toBeTruthy();
  });

  it('colour-blind-safe palette: only red, blue, yellow and black ever carry a colour rule or a colour near miss', () => {
    const SAFE = new Set(['red', 'blue', 'yellow', 'black']);
    const CONFUSABLE = [['red', 'green'], ['green', 'orange'], ['green', 'brown'], ['blue', 'purple']];
    let colourMisses = 0;
    for (const d of DIFFS) {
      for (let seed = 0; seed < 40; seed++) {
        const p = generate(req(d, seed * 3 + 2)).payload;
        const all = [...p.cells, ...p.options];
        const colours = new Set(all.map((c) => c.color));
        for (const c of colours) expect(SAFE.has(c)).toBe(true);
        for (const [a, b] of CONFUSABLE) expect(colours.has(a as never) && colours.has(b as never)).toBe(false);
        // an option that differs from the answer only in colour must use a clearly different safe colour
        const ans = p.options[p.answer];
        for (const o of p.options) {
          if (o !== ans && diffCount(o, ans) === 1 && o.color !== ans.color) {
            colourMisses++;
            expect(SAFE.has(o.color) && SAFE.has(ans.color)).toBe(true);
          }
        }
      }
    }
    expect(colourMisses).toBeGreaterThan(20); // colour near misses still exist (colour rules are still tested)
  });
});
