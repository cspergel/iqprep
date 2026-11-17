import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEMO_STEP_MS, FACE_WORDS, Player, generate, score, type BdPayload, type BdResponse, type Face } from './index';

afterEach(cleanup);
const noSpeak = async () => {};

describe('Block Builder player', () => {
  it('places, flips and turns blocks, then submits the build', () => {
    const base = generate({ difficulty: 7, seed: 1, age: 7, mode: 'practice' });
    const item = { ...base, payload: { rows: 2, cols: 2, target: ['R', 'TL', 'W', 'BR'], rotated: false } as BdPayload };
    const onSubmit = vi.fn();
    render(<Player item={item} mode="practice" age={7} onSubmit={onSubmit} hintLevel={0} speak={noSpeak} />);
    const done = screen.getByRole('button', { name: /Done/ }) as HTMLButtonElement;
    const cell = (i: number) => screen.getAllByRole('button', { name: /^Block \d/ })[i];
    expect(done.disabled).toBe(true);

    fireEvent.click(cell(0)); // default red
    fireEvent.click(cell(2));
    fireEvent.click(cell(2)); // tap again: red → white
    fireEvent.click(screen.getByRole('button', { name: /red corner at the top left/ }));
    fireEvent.click(cell(1)); // TL
    fireEvent.click(cell(3)); // TL
    fireEvent.click(cell(3)); // turn → TR
    fireEvent.click(cell(3)); // turn → BR
    expect(cell(3).getAttribute('aria-label')).toMatch(/bottom right/);
    expect(done.disabled).toBe(false);
    fireEvent.click(done);
    const r = onSubmit.mock.calls[0][0] as BdResponse;
    expect(r).toEqual(['R', 'TL', 'W', 'BR']);
    expect(score(item, r).correct).toBe(true);
  });

  it('shows block lines only as a hint, and marks wrong blocks on reveal', () => {
    const item = generate({ difficulty: 8, seed: 4, age: 7, mode: 'practice' });
    const { container, rerender } = render(<Player item={item} mode="practice" age={7} onSubmit={() => {}} hintLevel={0} speak={noSpeak} />);
    expect(container.querySelectorAll('line').length).toBe(0);
    rerender(<Player item={item} mode="practice" age={7} onSubmit={() => {}} hintLevel={1} speak={noSpeak} />);
    expect(container.querySelectorAll('line').length).toBe(2);
    cleanup();
    const wrong: BdResponse = item.payload.target.map((f) => (f === 'R' ? 'W' : 'R'));
    render(<Player item={item} mode="practice" age={7} onSubmit={() => {}} hintLevel={0} speak={noSpeak} reveal={{ response: wrong, outcome: score(item, wrong) }} />);
    expect(screen.queryByRole('button', { name: /Done/ })).toBeNull();
    expect(screen.getByText(/red border/)).toBeTruthy();
  });

  it("shows a model item as Pip's separate blocks, and a picture item as one seamless picture", () => {
    const model = generate({ difficulty: 4, seed: 3, age: 7, mode: 'practice' });
    expect(model.payload.model).toBe(true);
    const { container } = render(<Player item={model} mode="practice" age={7} onSubmit={() => {}} hintLevel={0} speak={noSpeak} />);
    expect(screen.getByRole('img', { name: /Pip's blocks/ })).toBeTruthy();
    expect(container.querySelectorAll('[data-block]').length).toBe(model.payload.rows * model.payload.cols);
    expect(screen.getByText(/Copy Pip/)).toBeTruthy();
    cleanup();
    const pic = generate({ difficulty: 8, seed: 4, age: 7, mode: 'practice' });
    expect(pic.payload.model).toBeFalsy();
    const r2 = render(<Player item={pic} mode="practice" age={7} onSubmit={() => {}} hintLevel={0} speak={noSpeak} />);
    expect(r2.container.querySelectorAll('[data-block]').length).toBe(0);
    expect(screen.getByRole('img', { name: /design to build/ })).toBeTruthy();
  });

  it('turns both the picture and the tray for a 2×2 diamond, and a matching build scores correct', () => {
    const base = generate({ difficulty: 9, seed: 1, age: 7, mode: 'practice' });
    const item = { ...base, payload: { rows: 2, cols: 2, target: ['R', 'W', 'W', 'R'], rotated: true } as BdPayload };
    const onSubmit = vi.fn();
    const { container } = render(<Player item={item} mode="practice" age={7} onSubmit={onSubmit} hintLevel={0} speak={noSpeak} />);
    const turned = [...container.querySelectorAll<HTMLElement>('div')].filter((d) => d.style.transform === 'rotate(45deg)');
    expect(turned.length).toBe(2);
    expect(turned.some((d) => d.querySelector('[role="img"]'))).toBe(true);
    expect(turned.some((d) => d.querySelector('[aria-label="Your build"]'))).toBe(true);
    const cell = (i: number) => screen.getAllByRole('button', { name: /^Block \d/ })[i];
    expect(cell(0).getAttribute('aria-label')).toMatch(/^Block 1, top:/);
    expect(cell(3).getAttribute('aria-label')).toMatch(/^Block 4, bottom:/);
    fireEvent.click(cell(0));
    fireEvent.click(cell(1));
    fireEvent.click(cell(1));
    fireEvent.click(cell(2));
    fireEvent.click(cell(2));
    fireEvent.click(cell(3));
    fireEvent.click(screen.getByRole('button', { name: /Done/ }));
    const r = onSubmit.mock.calls[0][0] as BdResponse;
    expect(r).toEqual(['R', 'W', 'W', 'R']);
    expect(score(item, r).correct).toBe(true);
  });
});

const useFace = (f: Face) => fireEvent.click(screen.getByRole('button', { name: `Use ${FACE_WORDS[f]} block` }));

describe('Block Builder model items: second trial', () => {
  const modelItem = () => {
    const base = generate({ difficulty: 4, seed: 1, age: 7, mode: 'practice' });
    return { ...base, payload: { rows: 1, cols: 2, target: ['R', 'W'], rotated: false, model: true } as BdPayload };
  };

  it('after a wrong first build, Pip rebuilds the model and the child gets trial 2 (scored 1)', () => {
    vi.useFakeTimers();
    try {
      const item = modelItem();
      const onSubmit = vi.fn();
      const { container } = render(<Player item={item} mode="test" age={7} onSubmit={onSubmit} hintLevel={0} speak={noSpeak} />);
      const cell = (i: number) => screen.getAllByRole('button', { name: /^Block \d/ })[i];
      fireEvent.click(cell(0));
      fireEvent.click(cell(1)); // R R: wrong
      fireEvent.click(screen.getByRole('button', { name: /Done/ }));
      expect(onSubmit).not.toHaveBeenCalled();
      // Pip's demonstration: blocks come back one at a time; the child waits for it
      expect(screen.getByRole('img', { name: /Pip building the blocks again/ })).toBeTruthy();
      expect(container.querySelectorAll('[data-block]').length).toBe(0);
      const myTurn = screen.getByRole('button', { name: /My turn/ }) as HTMLButtonElement;
      expect(myTurn.disabled).toBe(true);
      expect(screen.queryAllByRole('button', { name: /^Block \d/ }).length).toBe(0);
      act(() => { vi.advanceTimersByTime(DEMO_STEP_MS); });
      expect(container.querySelectorAll('[data-block]').length).toBe(1);
      act(() => { vi.advanceTimersByTime(DEMO_STEP_MS); });
      expect(container.querySelectorAll('[data-block]').length).toBe(2);
      fireEvent.click(screen.getByRole('button', { name: /My turn/ }));
      // trial 2 starts with an empty tray
      expect(screen.getByText(/Try again/)).toBeTruthy();
      expect(cell(0).getAttribute('aria-label')).toMatch(/empty/);
      fireEvent.click(cell(0));
      useFace('W');
      fireEvent.click(cell(1));
      fireEvent.click(screen.getByRole('button', { name: /Done/ }));
      expect(onSubmit).toHaveBeenCalledTimes(1);
      const r = onSubmit.mock.calls[0][0] as BdResponse;
      expect(r).toEqual({ cells: ['R', 'W'], trial: 2 });
      expect(score(item, r)).toMatchObject({ points: 1, correct: true, meta: { trial: 2 } });
    } finally {
      vi.useRealTimers();
    }
  });

  it('a right first build submits at once as trial 1 (scored 2)', () => {
    const item = modelItem();
    const onSubmit = vi.fn();
    render(<Player item={item} mode="test" age={7} onSubmit={onSubmit} hintLevel={0} speak={noSpeak} />);
    const cell = (i: number) => screen.getAllByRole('button', { name: /^Block \d/ })[i];
    fireEvent.click(cell(0));
    useFace('W');
    fireEvent.click(cell(1));
    fireEvent.click(screen.getByRole('button', { name: /Done/ }));
    const r = onSubmit.mock.calls[0][0] as BdResponse;
    expect(r).toEqual({ cells: ['R', 'W'], trial: 1 });
    expect(score(item, r).points).toBe(2);
  });
});

describe('Block Builder open board', () => {
  const boardItem = () => {
    const base = generate({ difficulty: 8, seed: 1, age: 7, mode: 'practice' });
    const payload: BdPayload = { rows: 2, cols: 2, target: ['R', 'TL', 'W', 'R'], rotated: false, board: { rows: 4, cols: 4 } };
    return { ...base, payload };
  };
  const sq = (r: number, c: number) => screen.getByRole('button', { name: new RegExp(`^Board square row ${r}, column ${c}:`) });

  it('shows a 4×4 board for a 2×2 design, limits blocks to 4, and records spreading too wide', () => {
    const item = boardItem();
    const onSubmit = vi.fn();
    render(<Player item={item} mode="practice" age={7} onSubmit={onSubmit} hintLevel={0} speak={noSpeak} />);
    expect(screen.getAllByRole('button', { name: /^Board square/ }).length).toBe(16);
    expect(screen.getByText('Blocks left: 4')).toBeTruthy();
    // three in a row: wider than the design
    fireEvent.click(sq(1, 1));
    fireEvent.click(sq(1, 2));
    fireEvent.click(sq(1, 3));
    fireEvent.click(sq(2, 1));
    fireEvent.click(sq(2, 2)); // no blocks left: ignored
    expect(sq(2, 2).getAttribute('aria-label')).toMatch(/empty/);
    // take the blocks away and build the design lower down and to the right
    useFace('W'); // keep palette state honest; eraser next
    fireEvent.click(screen.getByRole('button', { name: 'Take a block away' }));
    for (const [r, c] of [[1, 1], [1, 2], [1, 3], [2, 1]]) fireEvent.click(sq(r, c));
    expect(screen.getByText('Blocks left: 4')).toBeTruthy();
    useFace('R');
    fireEvent.click(sq(3, 3));
    fireEvent.click(sq(4, 4));
    useFace('TL');
    fireEvent.click(sq(3, 4));
    useFace('W');
    fireEvent.click(sq(4, 3));
    fireEvent.click(screen.getByRole('button', { name: /Done/ }));
    const r = onSubmit.mock.calls[0][0] as BdResponse;
    expect(Array.isArray(r)).toBe(false);
    expect(r).toMatchObject({ dimensionError: true });
    const out = score(item, r);
    expect(out).toMatchObject({ points: 1, correct: true, meta: { dimensionError: 1, rotationError: 0 } });
  });

  it('a tidy build anywhere is correct with no dimension error; the reveal marks wrong blocks', () => {
    const item = boardItem();
    const onSubmit = vi.fn();
    render(<Player item={item} mode="practice" age={7} onSubmit={onSubmit} hintLevel={0} speak={noSpeak} />);
    const done = screen.getByRole('button', { name: /Done/ }) as HTMLButtonElement;
    fireEvent.click(sq(2, 1));
    fireEvent.click(sq(3, 2));
    useFace('TL');
    fireEvent.click(sq(2, 2));
    expect(done.disabled).toBe(true); // 3 of 4 blocks
    useFace('W');
    fireEvent.click(sq(3, 1));
    expect(done.disabled).toBe(false);
    fireEvent.click(done);
    const r = onSubmit.mock.calls[0][0] as BdResponse;
    expect(score(item, r)).toMatchObject({ points: 1, correct: true, meta: { dimensionError: 0 } });
    cleanup();
    // reveal a build with one wrong block: only that one gets the red border
    const cells = (r as { cells: (Face | null)[] }).cells.slice();
    cells[2 * 4 + 1] = 'BR';
    const wrong = { cells };
    render(<Player item={item} mode="practice" age={7} onSubmit={() => {}} hintLevel={0} speak={noSpeak} reveal={{ response: wrong, outcome: score(item, wrong) }} />);
    const red = screen.getAllByRole('button', { name: /^Board square/ }).filter((b) => b.style.border.includes('var(--bad)'));
    expect(red.length).toBe(1);
    expect(red[0].getAttribute('aria-label')).toMatch(/^Board square row 3, column 2:/);
  });
});
