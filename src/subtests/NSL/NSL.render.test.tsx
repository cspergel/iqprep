import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, cellKey, generate, score, type NslCell, type NslFormat } from './index';
import type { NamingResponse } from './naming';

const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

/** The buttons a child taps for one picture: one per word, in the order it is said. */
const wordsOf = (c: NslCell) => (c.char !== undefined ? [c.char] : ([c.size, c.color, c.object].filter(Boolean) as string[]));

function tapWords(c: NslCell) {
  for (const w of wordsOf(c)) {
    fireEvent.click(screen.getByRole('button', { name: w }));
    wait(200);
  }
}

/** Taps a wrong name for a picture (first word changed). */
function tapWrong(c: NslCell, groupsFirst: string[]) {
  const words = wordsOf(c);
  words[0] = groupsFirst.find((w) => w !== words[0])!;
  for (const w of words) {
    fireEvent.click(screen.getByRole('button', { name: w }));
    wait(200);
  }
}

describe('Speedy Namer player (tap mode)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it.each([
    ['size-color-object', 7.5],
    ['color-object', 6],
    ['letters-numbers', 8],
  ] as [NslFormat, number][])('%s: sample page must be finished, then two timed trials with a pause card, summed', (format, age) => {
    const item = generate({ difficulty: 7, seed: 6, age, mode: 'practice', variant: format });
    expect(item.payload.format).toBe(format);
    const p = item.payload;
    const onSubmit = vi.fn();
    render(<Player item={item} mode="practice" age={age} onSubmit={onSubmit} hintLevel={0} speak={async () => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Tap them/ }));
    // Sample page: 6 pictures; a wrong answer does not move on.
    expect(p.practice).toHaveLength(6);
    const options = format === 'letters-numbers' ? ['A', 'D', 'N', 'S', '3', '5', '7', '9'] : format === 'color-object' ? ['red', 'blue', 'yellow'] : ['big', 'little'];
    tapWrong(p.practice[0], options);
    expect(screen.getByText(/Look again/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Start the clock/ })).toBeNull();
    for (const c of p.practice.slice(0, 5)) tapWords(c);
    expect(screen.queryByRole('button', { name: /Start the clock/ })).toBeNull(); // one sample still to go
    tapWords(p.practice[5]);
    wait(600);
    fireEvent.click(screen.getByRole('button', { name: /Start the clock/ }));
    wait(2000);
    // Trial 1: name two, then the time cap ends the trial — a pause card, not a submit.
    for (const c of p.trials[0].slice(0, 2)) tapWords(c);
    wait(61_000);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/Page 1 done/)).toBeTruthy();
    wait(600);
    fireEvent.click(screen.getByRole('button', { name: /Start the clock/ }));
    wait(2000);
    // Trial 2: name three, the third one wrong.
    for (const c of p.trials[1].slice(0, 2)) tapWords(c);
    tapWrong(p.trials[1][2], options);
    wait(61_000);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const r = onSubmit.mock.calls[0][0] as NamingResponse;
    expect(r.mode).toBe('tap');
    expect(r.trials).toHaveLength(2);
    expect(r.trials[0].answers).toEqual(p.trials[0].slice(0, 2).map(cellKey));
    expect(r.trials[1].answers?.slice(0, 2)).toEqual(p.trials[1].slice(0, 2).map(cellKey));
    const out = score(item, r);
    expect(out.points).toBe(4);
    expect(out.meta?.errors).toBe(1);
    expect(out.meta?.durationSec).toBeGreaterThanOrEqual(119);
    if (format === 'size-color-object') expect(out.meta).toMatchObject({ sizeErrors: 1, colorErrors: 0, objectErrors: 0 });
    if (format === 'color-object') expect(out.meta).toMatchObject({ colorErrors: 1, objectErrors: 0 });
  });

  it('finishing a whole sheet ends that trial straight away', () => {
    const item = generate({ difficulty: 7, seed: 2, age: 6, mode: 'practice', variant: 'color-object' });
    const p = item.payload;
    const onSubmit = vi.fn();
    render(<Player item={item} mode="practice" age={6} onSubmit={onSubmit} hintLevel={0} speak={async () => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Tap them/ }));
    for (const c of p.practice) tapWords(c);
    wait(600);
    for (let t = 0; t < 2; t++) {
      fireEvent.click(screen.getByRole('button', { name: /Start the clock/ }));
      wait(2000);
      for (const c of p.trials[t]) tapWords(c);
      wait(600);
    }
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const out = score(item, onSubmit.mock.calls[0][0]);
    expect(out.points).toBe(40);
    expect(out.meta?.durationSec).toBeLessThan(40);
  });
});

describe('Speedy Namer player (grown-up mode)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('sample must be confirmed, then two timed trials; slips and reach recorded per trial', () => {
    const item = generate({ difficulty: 7, seed: 9, age: 7, mode: 'practice', variant: 'size-color-object' });
    const onSubmit = vi.fn();
    render(<Player item={item} mode="practice" age={7} onSubmit={onSubmit} hintLevel={0} speak={async () => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /grown-up times/ }));
    expect(screen.getByText(new RegExp(cellKey(item.payload.practice[0])))).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Start the clock/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /They named all 6/ }));
    wait(600);
    fireEvent.click(screen.getByRole('button', { name: /Start the clock/ }));
    wait(2000);
    wait(10_000);
    fireEvent.click(screen.getByRole('button', { name: 'Picture 3' })); // named wrong
    wait(500);
    fireEvent.click(screen.getByRole('button', { name: /Stop/ }));
    fireEvent.click(screen.getByRole('button', { name: /named them all/ }));
    expect(onSubmit).not.toHaveBeenCalled();
    wait(600);
    fireEvent.click(screen.getByRole('button', { name: /Start the clock/ }));
    wait(2000);
    wait(8_000);
    fireEvent.click(screen.getByRole('button', { name: /Stop/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Picture 15' })); // reached picture 15
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const r = onSubmit.mock.calls[0][0] as NamingResponse;
    expect(r.mode).toBe('adult');
    expect(r.trials[0]).toMatchObject({ reached: 20, wrong: [2] });
    expect(r.trials[1]).toMatchObject({ reached: 15, wrong: [] });
    const out = score(item, r);
    expect(out.points).toBe(19 + 15);
    expect(out.meta?.durationSec).toBeGreaterThan(18);
    expect(out.meta?.durationSec).toBeLessThan(20);
  });
});
