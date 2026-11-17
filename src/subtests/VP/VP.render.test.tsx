import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Player, VP_AUTO_SUBMIT_MS, generate, score } from './index';

afterEach(cleanup);
const noSpeak = async () => {};

describe('Puzzle Pieces player', () => {
  it('lets the child pick exactly three pieces and submits them sorted', () => {
    const item = generate({ difficulty: 8, seed: 2, age: 7, mode: 'practice' });
    const onSubmit = vi.fn();
    render(<Player item={item} mode="practice" age={7} onSubmit={onSubmit} hintLevel={0} speak={noSpeak} />);
    const piece = (i: number) => screen.getByRole('button', { name: new RegExp(`^Piece ${i + 1},`) });
    const done = screen.getByRole('button', { name: /Done/ }) as HTMLButtonElement;
    const [a, b, c] = item.payload.answer;
    const other = [0, 1, 2, 3, 4, 5].find((i) => !item.payload.answer.includes(i))!;
    fireEvent.click(piece(c));
    fireEvent.click(piece(other));
    fireEvent.click(piece(other)); // un-pick
    fireEvent.click(piece(a));
    expect(done.disabled).toBe(true);
    fireEvent.click(piece(b));
    fireEvent.click(piece(other)); // a 4th pick is ignored
    expect(piece(other).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(done);
    expect(onSubmit).toHaveBeenCalledWith([a, b, c]);
    expect(score(item, onSubmit.mock.calls[0][0]).correct).toBe(true);
  });

  it('draws a faint grid on the target as a hint and colours the solution on reveal', () => {
    const item = generate({ difficulty: 11, seed: 5, age: 7, mode: 'practice' });
    const { container, rerender } = render(<Player item={item} mode="practice" age={7} onSubmit={() => {}} hintLevel={0} speak={noSpeak} />);
    expect(container.querySelectorAll('path[stroke-dasharray]').length).toBe(0);
    rerender(<Player item={item} mode="practice" age={7} onSubmit={() => {}} hintLevel={1} speak={noSpeak} />);
    expect(container.querySelectorAll('path[stroke-dasharray]').length).toBe(1);
    cleanup();
    const resp = item.payload.answer.slice();
    render(<Player item={item} mode="practice" age={7} onSubmit={() => {}} hintLevel={0} speak={noSpeak} reveal={{ response: resp, outcome: score(item, resp) }} />);
    expect(screen.getByRole('img', { name: /where the right pieces go/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Done/ })).toBeNull();
  });
});

describe('Puzzle Pieces format fidelity', () => {
  const pieceBtn = (i: number) => screen.getByRole('button', { name: new RegExp(`^Piece ${i + 1},`) });

  it('shows the 6 pieces numbered 1–6 in a fixed 2 × 3 layout under the standard stem', () => {
    const item = generate({ difficulty: 9, seed: 3, age: 7, mode: 'test' });
    const { container } = render(<Player item={item} mode="test" age={7} onSubmit={() => {}} hintLevel={0} speak={noSpeak} />);
    const buttons = Array.from(container.querySelectorAll('button.choice'));
    expect(buttons).toHaveLength(6);
    expect(buttons.map((b) => b.querySelector('.letter')!.textContent)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect((buttons[0].parentElement as HTMLElement).style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))');
    expect(screen.getByText('Which 3 pieces make this puzzle?')).toBeTruthy();
    expect(item.speak).toBe('Which 3 pieces make this puzzle?');
    // teaching text names pieces by number, matching the badges
    const nums = item.payload.answer.map((i) => i + 1);
    expect(item.explanation).toContain(`Pieces ${nums[0]}, ${nums[1]} and ${nums[2]}`);
    expect([item.explanation, ...item.hints, ...(item.steps ?? [])].join(' ')).not.toMatch(/[Pp]ieces? [A-F]/);
  });

  it('test mode: hands the set in automatically when the third piece is picked (no Done button)', () => {
    vi.useFakeTimers();
    try {
      const item = generate({ difficulty: 8, seed: 2, age: 7, mode: 'test' });
      const onSubmit = vi.fn();
      render(<Player item={item} mode="test" age={7} onSubmit={onSubmit} hintLevel={0} speak={noSpeak} />);
      expect(screen.queryByRole('button', { name: /Done/ })).toBeNull();
      const [a, b, c] = item.payload.answer;
      const other = [0, 1, 2, 3, 4, 5].find((i) => !item.payload.answer.includes(i))!;
      fireEvent.click(pieceBtn(other));
      fireEvent.click(pieceBtn(other)); // un-pick is still allowed before the third pick
      fireEvent.click(pieceBtn(c));
      fireEvent.click(pieceBtn(a));
      act(() => { vi.advanceTimersByTime(VP_AUTO_SUBMIT_MS * 3); });
      expect(onSubmit).not.toHaveBeenCalled(); // two picks: nothing happens yet
      fireEvent.click(pieceBtn(b));
      // the chosen set stays highlighted for a moment, locked, then is handed in exactly once
      expect(pieceBtn(b).getAttribute('aria-pressed')).toBe('true');
      expect((pieceBtn(other) as HTMLButtonElement).disabled).toBe(true);
      expect(onSubmit).not.toHaveBeenCalled();
      act(() => { vi.advanceTimersByTime(VP_AUTO_SUBMIT_MS); });
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit).toHaveBeenCalledWith([a, b, c]);
      fireEvent.click(pieceBtn(a));
      act(() => { vi.advanceTimersByTime(VP_AUTO_SUBMIT_MS * 3); });
      expect(onSubmit).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('practice and tutor modes keep the Done button so the child can rethink', () => {
    vi.useFakeTimers();
    try {
      for (const mode of ['practice', 'tutor'] as const) {
        const item = generate({ difficulty: 8, seed: 2, age: 7, mode });
        const onSubmit = vi.fn();
        render(<Player item={item} mode={mode} age={7} onSubmit={onSubmit} hintLevel={0} speak={noSpeak} />);
        item.payload.answer.forEach((i) => fireEvent.click(pieceBtn(i)));
        act(() => { vi.advanceTimersByTime(VP_AUTO_SUBMIT_MS * 5); });
        expect(onSubmit).not.toHaveBeenCalled();
        const done = screen.getByRole('button', { name: /Done/ }) as HTMLButtonElement;
        expect(done.disabled).toBe(false);
        fireEvent.click(done);
        expect(onSubmit).toHaveBeenCalledWith(item.payload.answer);
        cleanup();
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
