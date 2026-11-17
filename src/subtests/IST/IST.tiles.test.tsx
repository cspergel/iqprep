/**
 * jsdom render tests for the word-tile response (IST/DST) and the "Grown-up listens" mode.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Item } from '../../core/types';
import type { StPayload, StResponse } from '../_symbols/engine';
import { canonicalMeaning } from '../_symbols/engine';
import { resetSeen, setGrownUpListens } from '../_symbols/memory';
import { Player as DstPlayer, generate as generateDst, score as scoreDst } from '../DST/index';
import { Player, generate, score } from './index';

const req = (difficulty: number, seed: number, variant = 'book-1') => ({ difficulty, seed, age: 7, mode: 'test' as const, variant });

beforeEach(() => {
  resetSeen();
  setGrownUpListens(false);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setGrownUpListens(false);
});

function setup(item: Item<StPayload>, extra: { parentScoring?: boolean; dst?: boolean } = {}) {
  const speak = vi.fn((_t: string, _o?: { rate?: number; force?: boolean }) => Promise.resolve());
  const onSubmit = vi.fn((_r: StResponse) => undefined);
  const P = extra.dst ? DstPlayer : Player;
  render(<P item={item} mode="test" age={7} hintLevel={0} onSubmit={onSubmit} speak={speak} parentScoring={extra.parentScoring} />);
  // IST always teaches its new symbols first.
  const gotIt = screen.queryByText('Got it! →');
  if (gotIt) fireEvent.click(gotIt);
  return { speak, onSubmit };
}

const tileButtons = () => screen.getAllByLabelText(/^Word tile: /) as HTMLButtonElement[];
const slotButtons = () => screen.getAllByLabelText(/^Slot \d+:/) as HTMLButtonElement[];
/** Tap a free tile showing `word`. */
function tapWord(word: string) {
  const b = tileButtons().find((x) => x.getAttribute('aria-label') === `Word tile: ${word}` && !x.disabled);
  if (!b) throw new Error(`no free tile for ${word}`);
  fireEvent.click(b);
}
const doneButton = () => screen.getByText('Done ✓').closest('button') as HTMLButtonElement;

const item = generate(req(9, 21)); // 5 symbols
const swappable = (symbols: string[]) => {
  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      const s = symbols.slice();
      [s[i], s[j]] = [s[j], s[i]];
      if (symbols[i] !== symbols[j] && canonicalMeaning(s) !== canonicalMeaning(symbols)) return s;
    }
  }
  throw new Error('no swap');
};

describe('word-tile building (IST)', () => {
  it('shows a slot per symbol and a tray of exactly the item’s tiles', () => {
    setup(item);
    expect(item.payload.tiles.length).toBeGreaterThan(item.payload.symbols.length);
    expect(slotButtons()).toHaveLength(item.payload.symbols.length);
    expect(tileButtons().map((b) => b.getAttribute('aria-label')!.replace('Word tile: ', ''))).toEqual(item.payload.tiles);
    // Labels are words only (no picture emoji on tiles).
    for (const b of tileButtons()) expect(b.textContent).toBe(b.getAttribute('aria-label')!.replace('Word tile: ', ''));
    expect(screen.queryAllByRole('button', { name: /Read the choices/ })).toHaveLength(0);
  });

  it('fills slots left to right, says each word, and submits the built sentence (scores 1)', () => {
    const { speak, onSubmit } = setup(item);
    const { symbols } = item.payload;
    symbols.forEach((w, i) => {
      expect(doneButton().disabled).toBe(true);
      tapWord(w);
      expect(speak).toHaveBeenLastCalledWith(w, { force: true });
      expect(slotButtons()[i].getAttribute('aria-label')).toBe(`Slot ${i + 1}: ${w}. Tap to take it out.`);
    });
    expect(doneButton().disabled).toBe(false);
    fireEvent.click(doneButton());
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const r = onSubmit.mock.calls[0][0];
    expect(r).toBe(symbols.join(' '));
    expect(score(item, r).points).toBe(1);
  });

  it('a swapped order scores 0', () => {
    const { onSubmit } = setup(item);
    const s = swappable(item.payload.symbols);
    s.forEach(tapWord);
    fireEvent.click(doneButton());
    const r = onSubmit.mock.calls[0][0];
    expect(r).toBe(s.join(' '));
    expect(score(item, r)).toMatchObject({ points: 0, meta: { wordsWrong: 2 } });
  });

  it('tapping a filled slot takes the word out and frees its tile; the next tap refills that slot', () => {
    setup(item);
    const { symbols, tiles } = item.payload;
    const wrong = tiles.find((w) => !symbols.includes(w))!;
    tapWord(wrong);
    tapWord(symbols[1]);
    expect(slotButtons()[0].getAttribute('aria-label')).toBe(`Slot 1: ${wrong}. Tap to take it out.`);
    const used = tileButtons().find((b) => b.getAttribute('aria-label') === `Word tile: ${wrong}`)!;
    expect(used.disabled).toBe(true);
    fireEvent.click(slotButtons()[0]);
    expect(slotButtons()[0].getAttribute('aria-label')).toBe('Slot 1: empty');
    expect(used.disabled).toBe(false);
    tapWord(symbols[0]);
    expect(slotButtons()[0].getAttribute('aria-label')).toBe(`Slot 1: ${symbols[0]}. Tap to take it out.`);
    expect(slotButtons()[1].getAttribute('aria-label')).toBe(`Slot 2: ${symbols[1]}. Tap to take it out.`);
  });

  it('pressing and holding a tile says it without placing it', () => {
    vi.useFakeTimers();
    const { speak } = setup(item);
    const w = item.payload.tiles[0];
    const b = tileButtons()[0];
    fireEvent.pointerDown(b);
    act(() => { vi.advanceTimersByTime(600); });
    expect(speak).toHaveBeenCalledWith(w, { force: true });
    fireEvent.pointerUp(b);
    fireEvent.click(b);
    expect(slotButtons()[0].getAttribute('aria-label')).toBe('Slot 1: empty');
  });

  it('DST builds sentences with tiles too (test mode: no teaching)', () => {
    const d = generateDst(req(10, 4));
    expect(d.payload.tiles.length).toBeGreaterThan(0);
    const { onSubmit } = setup(d, { dst: true });
    expect(screen.queryByText('Got it! →')).toBeNull();
    d.payload.symbols.forEach(tapWord);
    fireEvent.click(doneButton());
    expect(scoreDst(d, onSubmit.mock.calls[0][0]).points).toBe(1);
  });

  it('reveal shows the child’s words and the right word under a wrong one', () => {
    const s = swappable(item.payload.symbols);
    const response = s.join(' ');
    render(<Player item={item} mode="practice" age={7} hintLevel={0} onSubmit={() => undefined} speak={() => Promise.resolve()}
      reveal={{ response, outcome: score(item, response) }} />);
    expect(screen.queryAllByLabelText(/^Word tile: /)).toHaveLength(0);
    const answers = screen.getAllByLabelText(/^Answer \d+:/).map((e) => e.getAttribute('aria-label'));
    expect(answers).toHaveLength(2);
    s.forEach((w, i) => expect(screen.getByLabelText(`Slot ${i + 1}: ${w}`)).toBeTruthy());
  });
});

describe('Grown-up listens', () => {
  it('local toggle switches to read-aloud mode; ✓ submits a correct mark', () => {
    const { onSubmit } = setup(item);
    fireEvent.click(screen.getByRole('switch', { name: 'Grown-up listens' }));
    expect(screen.queryAllByLabelText(/^Word tile: /)).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Read it right' }));
    const r = onSubmit.mock.calls[0][0];
    expect(r).toEqual({ aloud: true, wordsWrong: 0 });
    expect(score(item, r).points).toBe(1);
  });

  it('the toggle is offered on the teach screen and remembered for the next item', () => {
    render(<Player item={item} mode="test" age={7} hintLevel={0} onSubmit={() => undefined} speak={() => Promise.resolve()} />);
    expect(screen.getByText('Got it! →')).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Grown-up listens' }));
    cleanup();
    setup(generate(req(10, 5)));
    expect(screen.getByRole('switch', { name: 'Grown-up listens' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('button', { name: 'Not quite' })).toBeTruthy();
  });

  it('with parentScoring the grown-up marks missed words and ✗ records them', () => {
    const { onSubmit } = setup(item, { parentScoring: true });
    expect(screen.queryByRole('switch', { name: 'Grown-up listens' })).toBeNull();
    fireEvent.click(screen.getByText('👀 Show the answer (grown-up)'));
    const w0 = item.payload.symbols[0];
    const w2 = item.payload.symbols[2];
    fireEvent.click(screen.getByLabelText(`Word 1: ${w0}, right. Tap to change.`));
    fireEvent.click(screen.getByLabelText(`Word 3: ${w2}, right. Tap to change.`));
    expect((screen.getByRole('button', { name: 'Read it right' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Not quite' }));
    const r = onSubmit.mock.calls[0][0];
    expect(r).toEqual({ aloud: true, wordsWrong: 2 });
    expect(score(item, r)).toMatchObject({ points: 0, meta: { wordsWrong: 2 } });
  });

  it('RST never offers it', async () => {
    const { Player: RstPlayer, generate: generateRst } = await import('../RST/index');
    render(<RstPlayer item={generateRst(req(6, 2))} mode="test" age={7} hintLevel={0} onSubmit={() => undefined} speak={() => Promise.resolve()} />);
    expect(screen.queryByRole('switch', { name: 'Grown-up listens' })).toBeNull();
  });
});
