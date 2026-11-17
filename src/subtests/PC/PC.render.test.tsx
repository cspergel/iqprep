import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { picOf } from './bank';
import { Player, generate, score } from './index';

afterEach(cleanup);
const noSpeak = async () => {};

describe('Picture Pals player', () => {
  it('takes one pick per row and submits them', () => {
    const item = generate({ difficulty: 12, seed: 8, age: 7, mode: 'practice' });
    const onSubmit = vi.fn();
    render(<Player item={item} mode="practice" age={7} onSubmit={onSubmit} hintLevel={0} speak={noSpeak} />);
    const done = screen.getByRole('button', { name: /Done/ }) as HTMLButtonElement;
    const rows = screen.getAllByRole('group');
    expect(rows).toHaveLength(item.payload.rows.length);
    item.payload.rows.forEach((row, r) => {
      const other = row.find((e) => e !== item.payload.answer[r])!;
      const btn = (e: string) => rows[r].querySelector(`button[aria-label$=": ${picOf(e)!.name}"]`) as HTMLButtonElement;
      fireEvent.click(btn(other));
      expect(done.disabled).toBe(r < item.payload.rows.length - 1);
      fireEvent.click(btn(item.payload.answer[r])); // switching the pick within a row
      expect(btn(other).getAttribute('aria-pressed')).toBe('false');
    });
    expect(done.disabled).toBe(false);
    fireEvent.click(done);
    expect(onSubmit).toHaveBeenCalledWith(item.payload.answer);
    expect(score(item, onSubmit.mock.calls[0][0]).correct).toBe(true);
  });

  it('shows picture names as a hint', () => {
    const item = generate({ difficulty: 5, seed: 1, age: 7, mode: 'practice' });
    const name = picOf(item.payload.answer[0])!.name;
    const { rerender } = render(<Player item={item} mode="practice" age={7} onSubmit={() => {}} hintLevel={0} speak={noSpeak} />);
    expect(screen.queryByText(name)).toBeNull();
    rerender(<Player item={item} mode="practice" age={7} onSubmit={() => {}} hintLevel={1} speak={noSpeak} />);
    expect(screen.getByText(name)).toBeTruthy();
  });
});

describe('Picture Pals format fidelity', () => {
  it('numbers the pictures continuously across rows and keeps each row on one line', () => {
    for (const [d, seed] of [[5, 1], [8, 4], [14, 2]] as const) {
      const item = generate({ difficulty: d, seed, age: 7, mode: 'test' });
      render(<Player item={item} mode="test" age={7} onSubmit={() => {}} hintLevel={0} speak={noSpeak} />);
      expect(screen.getByText('Pick one from each row that go together.')).toBeTruthy();
      const groups = screen.getAllByRole('group');
      let next = 1;
      groups.forEach((g, r) => {
        const buttons = Array.from(g.querySelectorAll('button.choice'));
        const row = item.payload.rows[r];
        expect(buttons).toHaveLength(row.length);
        expect((buttons[0].parentElement as HTMLElement).style.gridTemplateColumns).toBe(`repeat(${row.length}, minmax(0, 1fr))`);
        buttons.forEach((b, j) => {
          expect(b.querySelector('.pc-num')!.textContent).toBe(String(next));
          expect(b.getAttribute('aria-label')).toBe(`${next}: ${picOf(row[j])!.name}`);
          expect(b.querySelector('.letter')).toBeNull(); // no per-row 1, 2, 3 restart
          next++;
        });
      });
      expect(next - 1).toBe(item.payload.rows.flat().length);
      cleanup();
    }
  });
});
