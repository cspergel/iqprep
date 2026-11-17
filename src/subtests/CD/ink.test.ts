import { describe, expect, it } from 'vitest';
import {
  CD_MARKS, CD_SYMBOLS, DOT_MARK, UNRECOGNISED, classifyBox, recognise, rotationTwin, symbolCount, templateStrokes, templates,
  type CdVersion, type Stroke,
} from './ink';
import { kidStrokes, scribble } from './inkSynth';

const VERSIONS: CdVersion[] = ['A', 'B'];
const sym = (v: CdVersion, name: string) => (v === 'A' ? (CD_MARKS as readonly string[]) : (CD_SYMBOLS as readonly string[])).indexOf(name);

describe('Coding stroke templates', () => {
  it('B symbols are drawable in 1–3 strokes and every symbol has a template', () => {
    for (const v of VERSIONS) {
      for (let s = 0; s < symbolCount(v); s++) {
        const n = templateStrokes(v, s).length;
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(v === 'B' ? 3 : 2);
      }
    }
  });

  it('B symbols are mutually distinct: no symbol is another one turned or mirrored except the deliberate twins', () => {
    // Each template, classified clean, must come back as itself (so no other symbol, upright or
    // turned, is as close), and only ^/> and ||/= are each other's 90° turn.
    for (let s = 0; s < symbolCount('B'); s++) {
      const r = recognise('B', templateStrokes('B', s));
      expect(r.kind, CD_SYMBOLS[s]).toBe('match');
      expect(r.symbol).toBe(s);
    }
    expect(rotationTwin('B', sym('B', 'caret'))).toBe(sym('B', 'chevron'));
    expect(rotationTwin('B', sym('B', 'vbars'))).toBe(sym('B', 'hbars'));
    expect(rotationTwin('B', sym('B', 'tee'))).toBeNull();
  });
});

describe('Coding recogniser', () => {
  it('classifies the clean template of every mark/symbol as itself', () => {
    for (const v of VERSIONS) {
      for (let s = 0; s < symbolCount(v); s++) {
        expect(recognise(v, templateStrokes(v, s)).symbol, `${v}:${s}`).toBe(s);
        expect(recognise(v, kidStrokes(v, s, 99, { mess: 0 })).symbol, `${v}:${s} clean resampled`).toBe(s);
      }
    }
  });

  it('reads messy, child-like drawings of every symbol (≥ 97% overall, ≥ 93% each)', () => {
    for (const v of VERSIONS) {
      let ok = 0;
      let wrongSymbol = 0;
      let total = 0;
      for (let s = 0; s < symbolCount(v); s++) {
        let mine = 0;
        for (let seed = 1; seed <= 200; seed++) {
          const r = recognise(v, kidStrokes(v, s, seed * 7919 + s));
          if (r.symbol === s) mine++;
          else if (r.symbol !== null) wrongSymbol++;
        }
        expect(mine / 200, `${v} ${s}`).toBeGreaterThanOrEqual(0.93);
        ok += mine;
        total += 200;
      }
      expect(ok / total, v).toBeGreaterThanOrEqual(0.97);
      // When it does miss, it says "can't read it" rather than reading a different symbol.
      expect(wrongSymbol / total, v).toBeLessThan(0.01);
    }
  });

  it('does not care about stroke order or direction', () => {
    for (const v of VERSIONS) {
      for (let s = 0; s < symbolCount(v); s++) {
        const strokes = kidStrokes(v, s, 1234 + s, { mess: 0.5 });
        const flipped: Stroke[] = strokes.map((st) => [...st].reverse()).reverse();
        expect(recognise(v, flipped).symbol).toBe(recognise(v, strokes).symbol);
      }
    }
  });

  it('rejects scribbles (≥ 90%) instead of guessing a symbol', () => {
    for (const v of VERSIONS) {
      let rejected = 0;
      for (let seed = 1; seed <= 300; seed++) {
        const r = recognise(v, scribble(seed));
        if (r.symbol === null && r.rotatedOf.length === 0) rejected++;
      }
      expect(rejected / 300, v).toBeGreaterThanOrEqual(0.9);
      // and a rejected box is an error for any wanted symbol
      const c = classifyBox(v, scribble(3), 0);
      if (recognise(v, scribble(3)).symbol === null) expect(c.answer).toBe(UNRECOGNISED);
    }
  });

  it('treats an empty box as empty and too many strokes as a scribble', () => {
    expect(recognise('B', []).kind).toBe('empty');
    const many: Stroke[] = Array.from({ length: 9 }, (_, i) => [{ x: 20 + i * 6, y: 30 }, { x: 22 + i * 6, y: 70 }]);
    expect(recognise('B', many).kind).toBe('scribble');
  });

  it('finds the dot by size: a tap or a small filled-in scribble, but not a circle', () => {
    expect(recognise('A', [[{ x: 50, y: 50 }]]).symbol).toBe(DOT_MARK);
    const blob: Stroke = [];
    for (let k = 0; k < 40; k++) blob.push({ x: 50 + Math.cos(k * 2.3) * (k % 9), y: 50 + Math.sin(k * 2.3) * (k % 9) });
    expect(recognise('A', [blob]).symbol).toBe(DOT_MARK);
    expect(recognise('A', templateStrokes('A', sym('A', 'ring'))).symbol).toBe(sym('A', 'ring'));
    // B has no lone dot: a tap is not a symbol
    expect(recognise('B', [[{ x: 50, y: 50 }]]).symbol).toBeNull();
  });

  it('records a mark drawn turned ≥ 90° or mirrored as a rotation error', () => {
    const cases: [CdVersion, string, { turn?: number; mirror?: boolean }][] = [
      ['A', 'vline', { turn: 90 }],
      ['A', 'hline', { turn: 270 }],
      ['B', 'caret', { turn: 180 }],
      ['B', 'caret', { turn: 90 }],
      ['B', 'chevron', { mirror: true }],
      ['B', 'tee', { turn: 180 }],
      ['B', 'tee', { turn: 90 }],
      ['B', 'tri', { turn: 180 }],
      ['B', 'vbars', { turn: 90 }],
    ];
    for (const [v, name, opts] of cases) {
      const s = sym(v, name);
      let rot = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const c = classifyBox(v, kidStrokes(v, s, seed, opts), s);
        expect(c.answer).not.toBe(s);
        if (c.rotation) rot++;
      }
      expect(rot / 40, `${v} ${name} ${JSON.stringify(opts)}`).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('does not call a symmetric mark turned, or a different wrong mark a rotation', () => {
    for (const name of ['plus', 'cross', 'ringdot']) {
      const s = sym('B', name);
      expect(classifyBox('B', kidStrokes('B', s, 5, { turn: 90 }), s)).toEqual({ answer: s, rotation: false });
    }
    // drew a triangle where the T belongs: wrong, but not a rotation error
    const c = classifyBox('B', templateStrokes('B', sym('B', 'tri')), sym('B', 'tee'));
    expect(c).toEqual({ answer: sym('B', 'tri'), rotation: false });
    // an upside-down hat where the triangle belongs: wrong, not a rotation of the triangle
    expect(classifyBox('B', kidStrokes('B', sym('B', 'caret'), 3, { turn: 180 }), sym('B', 'tri')).rotation).toBe(false);
  });

  it('is deterministic and order-independent', () => {
    const strokes = kidStrokes('B', 6, 77);
    const first = recognise('B', strokes);
    recognise('A', kidStrokes('A', 2, 1));
    expect(recognise('B', strokes)).toEqual(first);
    expect(kidStrokes('B', 6, 77)).toEqual(strokes);
    expect(templates('B')).toBe(templates('B'));
  });

  it('is fast: well under 5 ms per box', () => {
    const boxes: [CdVersion, Stroke[]][] = [];
    for (let i = 0; i < 300; i++) {
      const v: CdVersion = i % 2 ? 'B' : 'A';
      boxes.push([v, i % 10 === 0 ? scribble(i) : kidStrokes(v, i % symbolCount(v), i)]);
    }
    templates('A');
    templates('B');
    const t0 = performance.now();
    for (const [v, s] of boxes) recognise(v, s);
    expect((performance.now() - t0) / boxes.length).toBeLessThan(5);
  });
});
