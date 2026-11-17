import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, UNRECOGNISED, generate, score, symbolName, targetName, type CdResponse } from './index';
import { templateStrokes, type Stroke } from './ink';
import { scribble } from './inkSynth';

const props = (item: ReturnType<typeof generate>, onSubmit: (r: CdResponse) => void) => ({
  item, mode: 'practice' as const, age: 7, onSubmit, hintLevel: 0, speak: async () => {},
});
const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

// jsdom has no PointerEvent: send mouse events with pointer fields. jsdom boxes measure 0×0, so the
// sheet maps client coordinates straight onto the 0–100 box grid.
function pointer(el: Element, type: string, x: number, y: number) {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(ev, 'pointerId', { value: 1 });
  Object.defineProperty(ev, 'pointerType', { value: 'touch' });
  fireEvent(el, ev);
}
function draw(container: HTMLElement, box: number, strokes: Stroke[]) {
  const el = container.querySelector(`[data-ink="${box}"]`);
  expect(el, `box ${box} on screen`).toBeTruthy();
  for (const s of strokes) {
    pointer(el!, 'pointerdown', s[0].x, s[0].y);
    for (const q of s.slice(1)) pointer(el!, 'pointermove', q.x, q.y);
    pointer(el!, 'pointerup', s[s.length - 1].x, s[s.length - 1].y);
  }
}
const ink = (v: 'A' | 'B', sym: number) => templateStrokes(v, sym);

describe('Secret Code player', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('offers draw and tap on the start screen, with draw as the default', () => {
    const item = generate({ difficulty: 7, seed: 5, age: 7, mode: 'practice' });
    render(<Player {...props(item, () => {})} />);
    const drawBtn = screen.getByRole('button', { name: /Draw it \(like paper\)/ });
    const tapBtn = screen.getByRole('button', { name: /Tap it \(easier\)/ });
    expect(drawBtn.getAttribute('aria-pressed')).toBe('true');
    expect(tapBtn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(tapBtn);
    expect(tapBtn.getAttribute('aria-pressed')).toBe('true');
    expect(drawBtn.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('button', { name: /Skip practice/ })).toBeNull(); // the sample can't be skipped
  });

  it('draw mode: demo → 6 sample boxes that must be right → timed sheet of drawings, submitted once', () => {
    const item = generate({ difficulty: 7, seed: 5, age: 7, mode: 'practice' });
    const p = item.payload;
    const onSubmit = vi.fn();
    const { container } = render(<Player {...props(item, onSubmit)} />);
    fireEvent.click(screen.getByRole('button', { name: /Watch Pip/ }));

    // Pip's demonstration fills 3 boxes, then hands over.
    expect(screen.queryByRole('button', { name: /My turn/ })).toBeNull();
    for (let k = 0; k < 4; k++) wait(1700);
    for (const t of p.demo) expect(screen.getByLabelText(`${targetName('A', t)}, ${symbolName('A', p.key[t])}`)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /My turn/ }));

    // Sample: a wrong mark is flagged and must be redone; it does not advance.
    const want0 = p.key[p.practice[0]];
    draw(container, 0, ink('A', (want0 + 2) % 5));
    wait(1300);
    expect(screen.getByText(/Not that one|turned around|couldn’t read/)).toBeTruthy();
    expect(screen.queryByText(/Yes!/)).toBeNull();
    draw(container, 0, ink('A', want0)); // the next stroke in the red box starts it over
    wait(1300);
    expect(screen.getByText(/Yes!/)).toBeTruthy();
    for (let i = 1; i < 6; i++) {
      draw(container, i, ink('A', p.key[p.practice[i]]));
      wait(1300);
    }
    const go = screen.getByRole('button', { name: /Start the clock/ }) as HTMLButtonElement;
    wait(600);
    fireEvent.click(go);
    wait(2000); // Ready, set, go!

    const want = (i: number) => p.key[p.boxes[i]];
    draw(container, 0, ink('A', want(0)));
    wait(400); // lift + pause ⇒ next box
    draw(container, 1, ink('A', want(1)));
    // starting in the next box finishes this one straight away
    draw(container, 2, scribble(4));
    wait(400);
    // a wrong mark, then "redo last box" reopens it (only that one) and it is drawn again
    draw(container, 3, ink('A', (want(3) + 1) % 5));
    wait(400);
    fireEvent.click(screen.getByRole('button', { name: /Redo last box/ }));
    draw(container, 3, ink('A', want(3)));
    wait(400);
    // the redo button can't reach further back than the box just finished
    fireEvent.click(screen.getByRole('button', { name: /Redo last box/ }));
    fireEvent.click(screen.getByRole('button', { name: /Redo last box/ }));
    expect((screen.getByRole('button', { name: /Redo last box/ }) as HTMLButtonElement).disabled).toBe(true);
    draw(container, 3, ink('A', want(3)));
    // box 4 is being drawn when time runs out: it still counts
    draw(container, 4, ink('A', want(4)));

    expect(onSubmit).not.toHaveBeenCalled();
    wait(121_000);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const r = onSubmit.mock.calls[0][0] as CdResponse;
    expect(r.mode).toBe('draw');
    expect(r.answers).toHaveLength(5);
    expect(r.answers[2]).toBe(UNRECOGNISED);
    expect(r.ink).toHaveLength(5);
    expect(r.rotated).toHaveLength(5);
    expect(r.elapsedSec).toBeCloseTo(120, 0);
    const out = score(item, r);
    expect(out.points).toBe(4);
    expect(out.meta).toMatchObject({ correct: 4, errors: 1, mode: 1 });
    wait(5000);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('tap mode: sample then timed sheet; points are scaled for tapping', () => {
    const item = generate({ difficulty: 7, seed: 5, age: 7, mode: 'practice' });
    const p = item.payload;
    const onSubmit = vi.fn();
    render(<Player {...props(item, onSubmit)} />);
    fireEvent.click(screen.getByRole('button', { name: /Tap it/ }));
    fireEvent.click(screen.getByRole('button', { name: /Watch Pip/ }));
    for (let k = 0; k < 4; k++) wait(1700);
    fireEvent.click(screen.getByRole('button', { name: /My turn/ }));

    // A wrong tap gives feedback and does not advance.
    const want0 = p.key[p.practice[0]];
    fireEvent.click(screen.getByRole('button', { name: symbolName('A', (want0 + 2) % 5) }));
    expect(screen.getByText(/Not that one|turned around/)).toBeTruthy();
    for (const t of p.practice) {
      wait(200);
      fireEvent.click(screen.getByRole('button', { name: symbolName('A', p.key[t]) }));
    }
    const go = screen.getByRole('button', { name: /Start the clock/ }) as HTMLButtonElement;
    expect(go.disabled).toBe(true); // armed after a moment so a stray tap can't start the clock
    wait(600);
    fireEvent.click(go);
    wait(2000);

    const taps = [p.key[p.boxes[0]], p.key[p.boxes[1]], (p.key[p.boxes[2]] + 1) % 5, p.key[p.boxes[3]], p.key[p.boxes[4]], p.key[p.boxes[5]]];
    for (const s of taps) {
      fireEvent.click(screen.getByRole('button', { name: symbolName('A', s) }));
      wait(200);
    }
    // A double tap inside the guard window is ignored.
    fireEvent.click(screen.getByRole('button', { name: symbolName('A', p.key[p.boxes[6]]) }));
    fireEvent.click(screen.getByRole('button', { name: symbolName('A', p.key[p.boxes[6]]) }));
    wait(121_000);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const r = onSubmit.mock.calls[0][0] as CdResponse;
    expect(r.mode).toBe('tap');
    expect(r.answers).toHaveLength(7);
    const out = score(item, r);
    expect(out.meta).toMatchObject({ correct: 6, errors: 1, mode: 0 });
    expect(out.points).toBe(5); // round(6 × 0.8)
  });

  it('shows the version B key with digits for 8+', () => {
    const item = generate({ difficulty: 9, seed: 5, age: 9, mode: 'practice' });
    render(<Player {...props(item, () => {})} />);
    expect(screen.getByRole('img', { name: /^Key: 1 gets/ })).toBeTruthy();
  });

  it('renders a review of a drawn sheet with the child’s own ink, and of a tapped sheet', () => {
    const item = generate({ difficulty: 9, seed: 5, age: 9, mode: 'practice' });
    const p = item.payload;
    const drawn: CdResponse = { mode: 'draw', answers: [p.key[p.boxes[0]], UNRECOGNISED], rotated: [0, 0], ink: ['M50 30L50 70', 'M20 20L80 80L20 80'], elapsedSec: 120 };
    const { container, unmount } = render(<Player {...props(item, () => {})} reveal={{ response: drawn, outcome: score(item, drawn) }} />);
    expect(screen.getByText('right')).toBeTruthy();
    expect(screen.getByText(/Drawn/)).toBeTruthy();
    expect(container.querySelector('path[d="M20 20L80 80L20 80"]')).toBeTruthy();
    expect(screen.getByLabelText(`${p.boxes[1] + 1}, mix-up`)).toBeTruthy();
    unmount();
    const tapped: CdResponse = { answers: [p.key[p.boxes[0]]], elapsedSec: 120 };
    render(<Player {...props(item, () => {})} reveal={{ response: tapped, outcome: score(item, tapped) }} />);
    expect(screen.getByText(/Tapped/)).toBeTruthy();
  });
});
