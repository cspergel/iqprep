import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { questionTypes } from '../app/skillCatalog';
import { SUBTESTS } from '../core/subtestInfo';
import type { SubtestId } from '../core/types';
import { MODULES } from '../subtests/registry';
import { Gallery, loadFlags, sampleFor } from './Gallery';

afterEach(cleanup);

describe('sampleFor', () => {
  const ids = (Object.keys(MODULES) as SubtestId[]).filter((id) => SUBTESTS[id].kind !== 'speeded');
  it.each(ids)('%s: every question type can be sampled at both ends of its range', (id) => {
    const mod = MODULES[id];
    const types = questionTypes(mod);
    expect(types.length).toBeGreaterThan(0);
    for (const q of types) {
      for (const d of [q.minDifficulty, q.maxDifficulty]) {
        const s = sampleFor(mod, q.skill, d, 123, 8);
        expect(s.item.skills).toContain(q.skill);
        expect(Math.abs(s.item.difficulty - d)).toBeLessThan(2.5);
      }
    }
  });

  it('is reproducible from the flagged spec', () => {
    const mod = MODULES.DS;
    const s = sampleFor(mod, 'ds:backward', 9, 5, 8);
    const again = mod.generate({ difficulty: s.item.difficulty, seed: s.item.seed, age: 8, mode: 'practice', variant: s.variant });
    expect(again.payload).toEqual(s.item.payload);
  });
});

describe('Gallery', () => {
  it('renders samples and saves a flag', () => {
    localStorage.clear();
    render(<Gallery age={7} />);
    fireEvent.click(screen.getByRole('button', { name: /Digit Span/ }));
    const flagButtons = screen.getAllByRole('button', { name: /🚩 Flag/ });
    expect(flagButtons.length).toBeGreaterThanOrEqual(3);
    fireEvent.click(flagButtons[0]);
    fireEvent.change(screen.getByPlaceholderText(/What's wrong/), { target: { value: 'too fast' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save flag' }));
    const flags = loadFlags();
    expect(flags).toHaveLength(1);
    expect(flags[0].subtest).toBe('DS');
    expect(flags[0].note).toBe('too fast');
    expect(typeof flags[0].seed).toBe('number');
  });
});
