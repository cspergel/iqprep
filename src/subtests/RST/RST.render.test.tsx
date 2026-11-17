/**
 * RST reads its four choices aloud (as the examiner does), one at a time, highlighting each.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sentenceText } from '../_symbols/engine';
import { Player, generate } from './index';

afterEach(cleanup);

const req = (difficulty: number, seed: number) => ({ difficulty, seed, age: 7, mode: 'test' as const, variant: 'book-3' });
const expectedReads = (item: ReturnType<typeof generate>) =>
  item.payload.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${sentenceText(o.words)}`);

describe('RST read-aloud choices', () => {
  it('reads every option in order on mount, forced, at a calm rate, highlighting the one being read', async () => {
    const item = generate(req(6.2, 9));
    const pending: (() => void)[] = [];
    const speak = vi.fn((_t: string, _o?: { rate?: number; force?: boolean }) => new Promise<void>((r) => pending.push(r)));
    render(<Player item={item} mode="test" age={7} hintLevel={0} onSubmit={() => undefined} speak={speak} />);
    expect(speak).not.toHaveBeenCalled();
    for (let i = 0; i < 4; i++) {
      await waitFor(() => expect(speak).toHaveBeenCalledTimes(i + 1), { timeout: 2000 });
      expect(speak.mock.calls[i][0]).toBe(expectedReads(item)[i]);
      expect(speak.mock.calls[i][1]).toMatchObject({ force: true });
      expect(speak.mock.calls[i][1]!.rate).toBeLessThan(1);
      const lit = document.querySelectorAll('[data-reading]');
      expect(lit).toHaveLength(1);
      expect(lit[0].closest('button')!.getAttribute('aria-label')).toBe(sentenceText(item.payload.options[i].words));
      pending[i]();
    }
    await waitFor(() => expect(document.querySelectorAll('[data-reading]')).toHaveLength(0));
    expect(speak).toHaveBeenCalledTimes(4);
    // Still four choices.
    expect(document.querySelectorAll('button.choice')).toHaveLength(4);
  });

  it('🔊 reads them again; leaving the item stops reading', async () => {
    const item = generate(req(10, 4));
    const speak = vi.fn((_t: string, _o?: { rate?: number; force?: boolean }) => Promise.resolve());
    const { unmount } = render(<Player item={item} mode="test" age={7} hintLevel={0} onSubmit={() => undefined} speak={speak} />);
    await waitFor(() => expect(speak).toHaveBeenCalledTimes(4), { timeout: 3000 });
    fireEvent.click(screen.getByText('🔊 Read the choices'));
    await waitFor(() => expect(speak).toHaveBeenCalledTimes(8), { timeout: 3000 });
    expect(speak.mock.calls.slice(4).map((c) => c[0])).toEqual(expectedReads(item));
    fireEvent.click(screen.getByText('🔊 Read the choices'));
    unmount();
    await new Promise((r) => setTimeout(r, 800));
    expect(speak.mock.calls.length).toBeLessThanOrEqual(9);
  });

  it('does not read when showing a reveal', async () => {
    const item = generate(req(6, 1));
    const speak = vi.fn(() => Promise.resolve());
    const { score } = await import('./index');
    render(<Player item={item} mode="test" age={7} hintLevel={0} onSubmit={() => undefined} speak={speak}
      reveal={{ response: item.payload.answer, outcome: score(item, item.payload.answer) }} />);
    await new Promise((r) => setTimeout(r, 600));
    expect(speak).not.toHaveBeenCalled();
  });
});
