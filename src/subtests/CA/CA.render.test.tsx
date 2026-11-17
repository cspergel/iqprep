import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, generate, score, type CaResponse } from './index';

const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

describe('Animal Hunt player', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('marks, un-marks and auto-submits once every animal is found', () => {
    const item = generate({ difficulty: 7, seed: 3, age: 7, mode: 'practice', variant: 'structured' });
    const onSubmit = vi.fn();
    const { container } = render(<Player item={item} mode="practice" age={7} onSubmit={onSubmit} hintLevel={0} speak={async () => {}} />);
    expect(screen.getByText(/Animal Hunt/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Skip practice/ }));
    wait(2000);
    const pics = Array.from(container.querySelectorAll('g[role="button"]'));
    expect(pics).toHaveLength(item.payload.pics.length);
    const animals = item.payload.pics.map((p, i) => (p.animal ? i : -1)).filter((i) => i >= 0);
    const object = item.payload.pics.findIndex((p) => !p.animal);

    // tap a non-animal, then un-mark it
    fireEvent.click(pics[object]);
    expect(pics[object].getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(pics[object]); // too quick: treated as an accidental double tap
    expect(pics[object].getAttribute('aria-pressed')).toBe('true');
    wait(400);
    fireEvent.click(pics[object]);
    expect(pics[object].getAttribute('aria-pressed')).toBe('false');

    for (const i of animals) fireEvent.click(pics[i]);
    expect(onSubmit).not.toHaveBeenCalled();
    wait(500);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const r = onSubmit.mock.calls[0][0] as CaResponse;
    expect(r.marks).toEqual(animals);
    expect(r.elapsedSec).toBeLessThan(45);
    expect(score(item, r).points).toBe(animals.length);
    wait(60_000);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('submits what was marked when the 45 seconds run out', () => {
    const item = generate({ difficulty: 7, seed: 4, age: 7, mode: 'practice' });
    const onSubmit = vi.fn();
    const { container } = render(<Player item={item} mode="practice" age={7} onSubmit={onSubmit} hintLevel={0} speak={async () => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Skip practice/ }));
    wait(2000);
    const first = item.payload.pics.findIndex((p) => p.animal);
    fireEvent.click(container.querySelectorAll('g[role="button"]')[first]);
    wait(46_000);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].marks).toEqual([first]);
    expect(onSubmit.mock.calls[0][0].elapsedSec).toBeCloseTo(45, 0);
  });
});
