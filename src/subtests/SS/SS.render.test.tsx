import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, generate, score, type SsResponse, type SsRow } from './index';

const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const btn = (a: number) => screen.getByRole('button', { name: a === -1 ? /^No/ : `Symbol ${a + 1}` });
/** Some wrong answer for a row. */
const wrongFor = (row: SsRow) => (row.answer === -1 ? 0 : -1);

function setup(seed = 8) {
  const item = generate({ difficulty: 7, seed, age: 7, mode: 'practice' });
  const onSubmit = vi.fn();
  const view = render(<Player item={item} mode="practice" age={7} onSubmit={onSubmit} hintLevel={0} speak={async () => {}} />);
  return { item, p: item.payload, onSubmit, ...view };
}

describe('Symbol Spy player', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('has no way to skip the samples', () => {
    setup();
    expect(screen.queryByRole('button', { name: /Skip/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Start the clock/ })).toBeNull();
  });

  it('a wrong sample keeps the child on that sample with a tip; after two misses the right answer glows', () => {
    const { p, container } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Try a few first/ }));
    expect(screen.getByText(/Practice 1 of 3/)).toBeTruthy();
    fireEvent.click(btn(wrongFor(p.practice[0])));
    expect(screen.getByText(/Try again/)).toBeTruthy();
    expect(screen.getByText(/Practice 1 of 3/)).toBeTruthy(); // did not advance
    expect(container.querySelector('.ss-hint')).toBeNull();
    wait(250);
    fireEvent.click(btn(wrongFor(p.practice[0])));
    const glow = container.querySelector('.ss-hint');
    expect(glow).not.toBeNull();
    expect(glow).toBe(btn(p.practice[0].answer));
    expect(screen.getByText(/Practice 1 of 3/)).toBeTruthy();
    wait(250);
    fireEvent.click(btn(p.practice[0].answer));
    expect(screen.getByText(/Practice 2 of 3/)).toBeTruthy();
    expect(container.querySelector('.ss-hint')).toBeNull(); // fresh row, no glow
    // A wrong answer on the last sample still blocks the timed part.
    wait(250);
    fireEvent.click(btn(p.practice[1].answer));
    wait(250);
    fireEvent.click(btn(wrongFor(p.practice[2])));
    wait(600);
    expect(screen.queryByRole('button', { name: /Start the clock/ })).toBeNull();
    fireEvent.click(btn(p.practice[2].answer));
    wait(600);
    expect(screen.getByRole('button', { name: /Start the clock/ })).toBeTruthy();
  });

  it('timed sheet: one active row with faded, inert neighbours; records one answer per row', () => {
    const { item, p, onSubmit, container } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Try a few first/ }));
    for (const row of p.practice) {
      wait(250);
      fireEvent.click(btn(row.answer));
    }
    wait(600);
    fireEvent.click(screen.getByRole('button', { name: /Start the clock/ }));
    wait(2000);
    // Row 0: nothing above, the next row faded below; only the active row is tappable.
    expect(container.querySelector('[data-ss-row="prev"]')).toBeNull();
    const next0 = container.querySelector('[data-ss-row="next"]')!;
    expect(next0.getAttribute('aria-hidden')).toBe('true');
    expect(next0.querySelectorAll('button')).toHaveLength(0);
    expect(next0.querySelectorAll('svg')).toHaveLength(p.rows[1].targets.length + p.rows[1].search.length);
    expect(screen.getAllByRole('button', { name: /^Symbol / })).toHaveLength(p.rows[0].search.length);

    const ans = [p.rows[0].answer, wrongFor(p.rows[1]), p.rows[2].answer];
    fireEvent.click(btn(ans[0]));
    wait(250);
    // Row 1 is active now: the answered row 0 is faded above, row 2 faded below, and the strip scrolls in.
    expect(container.querySelector('.ss-scroll')).not.toBeNull();
    const prev = container.querySelector('[data-ss-row="prev"]')!;
    expect(prev.getAttribute('aria-hidden')).toBe('true');
    expect(prev.querySelectorAll('svg')).toHaveLength(p.rows[0].targets.length + p.rows[0].search.length);
    expect(container.querySelector('[data-ss-row="next"]')!.querySelectorAll('svg')).toHaveLength(p.rows[2].targets.length + p.rows[2].search.length);
    expect(container.querySelectorAll('[data-ss-row="active"]')).toHaveLength(1);
    fireEvent.click(btn(ans[1]));
    wait(250);
    fireEvent.click(btn(ans[2]));
    wait(250);
    wait(120_000);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const r = onSubmit.mock.calls[0][0] as SsResponse;
    expect(r.answers).toEqual(ans);
    expect(score(item, r).points).toBe(1); // 2 right − 1 wrong
  });
});
