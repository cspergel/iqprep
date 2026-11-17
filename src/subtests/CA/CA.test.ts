import { describe, expect, it } from 'vitest';
import { scaledFromSpeeded } from '../../core/scoring';
import Cancellation, { CA_ANIMALS, CA_OBJECTS, CA_RELATED, caGrid, cellQuadrant, generate, picQuadrant, score } from './index';

const req = (age: number, seed: number, variant?: string) => ({ difficulty: 1, seed, age, mode: 'practice' as const, variant });
const animalsOf = (it: ReturnType<typeof generate>) => it.payload.pics.map((p, i) => (p.animal ? i : -1)).filter((i) => i >= 0);
const objectsOf = (it: ReturnType<typeof generate>) => it.payload.pics.map((p, i) => (p.animal ? -1 : i)).filter((i) => i >= 0);

describe('Animal Hunt generator', () => {
  it('declares both variants and honours them (default: scattered)', () => {
    expect(Cancellation.variants?.map((v) => v.id)).toEqual(['random', 'structured']);
    expect(generate(req(7, 1)).payload.layout).toBe('random');
    expect(generate(req(7, 1, 'structured')).payload.layout).toBe('structured');
    expect(generate(req(7, 1, 'banana')).payload.layout).toBe('random');
    expect(generate(req(7, 1, 'structured')).skills).toEqual(['ca:structured']);
    expect(generate(req(7, 1)).skills).toEqual(['ca:random']);
  });

  it('is deterministic per seed and variant', () => {
    expect(generate(req(7, 5, 'random'))).toEqual(generate(req(7, 5, 'random')));
    expect(generate(req(7, 5, 'random')).payload.pics).not.toEqual(generate(req(7, 6, 'random')).payload.pics);
    const r = generate(req(7, 5, 'random')).payload.pics.map((p) => p.e);
    const s = generate(req(7, 5, 'structured')).payload.pics.map((p) => p.e);
    expect(r).not.toEqual(s);
  });

  it('keeps animals at 20–25% of the page, with the emoji sets kept apart', () => {
    expect(CA_ANIMALS.some((e) => CA_OBJECTS.includes(e))).toBe(false);
    expect(CA_RELATED.some((e) => CA_ANIMALS.includes(e) || CA_OBJECTS.includes(e))).toBe(false);
    for (let seed = 0; seed < 100; seed++) {
      for (const age of [7, 12]) {
        const it = generate(req(age, seed, seed % 2 ? 'structured' : 'random'));
        const { cols, rows } = caGrid(age);
        expect(it.payload.pics).toHaveLength(cols * rows);
        const share = animalsOf(it).length / it.payload.pics.length;
        expect(share).toBeGreaterThanOrEqual(0.2);
        expect(share).toBeLessThanOrEqual(0.255);
        expect(it.maxPoints).toBe(animalsOf(it).length);
        for (const p of it.payload.pics) expect((p.animal ? CA_ANIMALS : [...CA_OBJECTS, ...CA_RELATED]).includes(p.e)).toBe(true);
      }
    }
  });

  it('places scattered pictures without overlaps and structured ones in neat rows', () => {
    for (let seed = 0; seed < 40; seed++) {
      const it = generate(req(10, seed, 'random'));
      const { pics, cols, rows } = it.payload;
      let minD = Infinity;
      for (let i = 0; i < pics.length; i++) {
        expect(pics[i].x).toBeGreaterThan(0.25);
        expect(pics[i].x).toBeLessThan(cols - 0.25);
        expect(pics[i].y).toBeGreaterThan(0.25);
        expect(pics[i].y).toBeLessThan(rows - 0.25);
        for (let j = i + 1; j < pics.length; j++) minD = Math.min(minD, Math.hypot(pics[i].x - pics[j].x, pics[i].y - pics[j].y));
      }
      expect(minD).toBeGreaterThanOrEqual(0.55);
      expect(pics.some((p) => p.x % 1 !== 0.5)).toBe(true);
    }
    const s = generate(req(10, 3, 'structured')).payload;
    expect(s.pics.every((p, i) => p.x === (i % s.cols) + 0.5 && p.y === Math.floor(i / s.cols) + 0.5 && p.rot === 0)).toBe(true);
  });

  it('uses a smaller page for younger children and sets difficulty to age', () => {
    expect(generate(req(7, 1)).payload.pics.length).toBeLessThan(generate(req(12, 1)).payload.pics.length);
    expect(generate(req(7.25, 1)).difficulty).toBe(7.25);
    expect(generate(req(7, 1)).timeLimitSec).toBe(45);
  });

  it('builds practice rows of 6 with two animals and an animal-related decoy', () => {
    for (const row of generate(req(7, 8)).payload.practice) {
      expect(row).toHaveLength(6);
      expect(row.filter((p) => p.animal)).toHaveLength(2);
      expect(row.filter((p) => CA_RELATED.includes(p.e) && !p.animal)).toHaveLength(1);
    }
  });

  it('balances animals over the four quadrants of the page (each within ±1 of an equal share), over many seeds', () => {
    for (let seed = 0; seed < 300; seed++) {
      for (const [age, variant] of [[7, 'random'], [12, 'random'], [7, 'structured'], [12, 'structured']] as const) {
        const it = generate(req(age, seed, variant));
        const { pics, cols, rows } = it.payload;
        const perQuad = [0, 0, 0, 0];
        pics.forEach((p) => { if (p.animal) perQuad[picQuadrant(p, cols, rows)]++; });
        const share = perQuad.reduce((a, b) => a + b, 0) / 4;
        for (const k of perQuad) expect(Math.abs(k - share)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('scattered pictures never cross a quadrant line (drawn quadrant = cell quadrant)', () => {
    for (let seed = 0; seed < 100; seed++) {
      for (const age of [7, 12]) {
        const { pics, cols, rows } = generate(req(age, seed, 'random')).payload;
        pics.forEach((p, i) => expect(picQuadrant(p, cols, rows)).toBe(cellQuadrant(i, cols, rows)));
      }
    }
  });

  it('puts related-object foils (bone, paw prints, egg…) in every quadrant, never as animals', () => {
    const seenRelated = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      for (const age of [7, 12]) {
        const it = generate(req(age, seed, seed % 2 ? 'structured' : 'random'));
        const { pics, cols, rows } = it.payload;
        const relatedPerQuad = [0, 0, 0, 0];
        for (const p of pics) {
          if (!CA_RELATED.includes(p.e)) continue;
          expect(p.animal).toBe(false);
          seenRelated.add(p.e);
          relatedPerQuad[picQuadrant(p, cols, rows)]++;
        }
        for (const k of relatedPerQuad) expect(k).toBeGreaterThanOrEqual(2);
        // Related foils are not targets: maxPoints counts animals only.
        expect(it.maxPoints).toBe(pics.filter((p) => p.animal).length);
      }
    }
    expect([...seenRelated].sort()).toEqual([...CA_RELATED].sort());
  });

  it('related foils are ≤ Unicode 13, single code points, and not animal faces', () => {
    for (const e of CA_RELATED) {
      expect([...e]).toHaveLength(1); // one code point, no variation selector / ZWJ
      const cp = e.codePointAt(0)!;
      expect(cp).toBeLessThanOrEqual(0x1fab6); // feather (U+1FAB6) is the newest, Unicode 13
      expect(cp === 0x1faba).toBe(false); // nest with eggs is Unicode 15 — not allowed
      // Animal faces/animals live in U+1F400–1F43C and U+1F980–1F9AE; paw prints U+1F43E is a print, not an animal.
      expect((cp >= 0x1f400 && cp <= 0x1f43c) || (cp >= 0x1f980 && cp <= 0x1f9ae)).toBe(false);
    }
  });
});

describe('Animal Hunt scoring', () => {
  const item = generate(req(7, 33, 'structured'));
  const animals = animalsOf(item);
  const objects = objectsOf(item);

  const related = objects.filter((i) => CA_RELATED.includes(item.payload.pics[i].e));
  const plain = objects.filter((i) => !CA_RELATED.includes(item.payload.pics[i].e));

  it('scores correct marks minus wrong marks and records omissions', () => {
    const out = score(item, { marks: [...animals.slice(0, 20), ...plain.slice(0, 3)], elapsedSec: 45 });
    expect(out.points).toBe(17);
    expect(out.meta).toEqual({ correct: 20, errors: 3, durationSec: 45, omissions: animals.length - 20, relatedErrors: 0 });
  });

  it('a tap on a related object is a wrong mark, also counted as relatedErrors', () => {
    expect(related.length).toBeGreaterThanOrEqual(8);
    const out = score(item, { marks: [...animals.slice(0, 10), ...related.slice(0, 2), ...plain.slice(0, 1)], elapsedSec: 45 });
    expect(out.points).toBe(7);
    expect(out.meta).toMatchObject({ correct: 10, errors: 3, relatedErrors: 2 });
    expect(out.feedback).toMatch(/goes WITH an animal/);
    expect(score(item, { marks: related, elapsedSec: 45 }).meta).toMatchObject({ correct: 0, errors: related.length, relatedErrors: related.length });
  });

  it('gives full marks for every animal and nothing else', () => {
    const out = score(item, { marks: animals, elapsedSec: 38.2 });
    expect(out.points).toBe(animals.length);
    expect(out.meta?.durationSec).toBe(38.2);
    expect(out.correct).toBe(true);
  });

  it('floors at zero when marking everything', () => {
    const out = score(item, { marks: item.payload.pics.map((_, i) => i), elapsedSec: 45 });
    expect(out.points).toBe(0);
    expect(out.meta?.errors).toBe(objects.length);
  });

  it('ignores duplicates and out-of-range marks; null scores zero', () => {
    const out = score(item, { marks: [animals[0], animals[0], -1, 9999, 2.5], elapsedSec: 45 });
    expect(out.points).toBe(1);
    expect(score(item, null)).toMatchObject({ points: 0, correct: false });
    expect(score(item, null).meta?.omissions).toBe(animals.length);
  });

  it('lines up with the app’s speeded norms', () => {
    const out = score(item, { marks: animals.slice(0, 25), elapsedSec: 45 });
    expect(scaledFromSpeeded('CA', out.points, 7, out.meta!.durationSec)).toBe(10);
  });
});
