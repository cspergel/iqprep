import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NamingResponse } from '../NSL/naming';
import { Player, generate, score } from './index';

const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const setup = () => {
  const item = generate({ difficulty: 7, seed: 9, age: 7, mode: 'practice' });
  const onSubmit = vi.fn();
  render(<Player item={item} mode="practice" age={7} onSubmit={onSubmit} hintLevel={0} speak={async () => {}} />);
  fireEvent.click(screen.getByRole('button', { name: /grown-up times/ }));
  fireEvent.click(screen.getByRole('button', { name: /They named all 6/ }));
  wait(600);
  fireEvent.click(screen.getByRole('button', { name: /Start the clock/ }));
  wait(2000);
  return { item, onSubmit };
};
/** Ends trial 1 quickly (all named, no slips) and starts trial 2. */
const nextTrial = () => {
  fireEvent.click(screen.getByRole('button', { name: /Stop/ }));
  fireEvent.click(screen.getByRole('button', { name: /named them all/ }));
  expect(screen.getByText(/Page 1 done/)).toBeTruthy();
  wait(600);
  fireEvent.click(screen.getByRole('button', { name: /Start the clock/ }));
  wait(2000);
};

describe('Quick Count player (grown-up timer)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('Start → mark slips → Stop → "named them all", twice; time and slips summed', () => {
    const { item, onSubmit } = setup();
    wait(10_000);
    nextTrial();
    fireEvent.click(screen.getByRole('button', { name: 'Picture 3' }));
    wait(400);
    fireEvent.click(screen.getByRole('button', { name: 'Picture 10' }));
    wait(400);
    fireEvent.click(screen.getByRole('button', { name: 'Picture 10' })); // undo
    wait(20_000);
    fireEvent.click(screen.getByRole('button', { name: /Stop/ }));
    wait(5_000); // the clock is stopped while the grown-up decides
    fireEvent.click(screen.getByRole('button', { name: /named them all/ }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const r = onSubmit.mock.calls[0][0] as NamingResponse;
    expect(r.mode).toBe('adult');
    expect(r.trials[0]).toMatchObject({ reached: 20, wrong: [] });
    expect(r.trials[1]).toMatchObject({ reached: 20, wrong: [2] });
    expect(r.trials[1].elapsedSec).toBeGreaterThan(20);
    expect(r.trials[1].elapsedSec).toBeLessThan(22);
    const out = score(item, r);
    expect(out.points).toBe(39);
    expect(out.meta?.durationSec).toBeGreaterThan(30);
    expect(out.meta?.durationSec).toBeLessThan(33);
  });

  it('at the time cap the grown-up taps the last picture named', () => {
    const { onSubmit } = setup();
    nextTrial();
    wait(61_000);
    expect(screen.getByText(/Time’s up/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Picture 14' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].trials[1]).toMatchObject({ reached: 14, elapsedSec: 60 });
  });
});
