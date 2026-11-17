/**
 * Contract tests every subtest module must satisfy, run against the real registry.
 * These catch integration mistakes (non-determinism, crashes on null, bad difficulty, players that
 * throw on render or reveal) that per-module tests might not.
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SUBTESTS } from '../core/subtestInfo';
import type { Mode, SubtestId } from '../core/types';
import { MODULES } from './registry';

afterEach(cleanup);

const ids = Object.keys(MODULES) as SubtestId[];
const noSpeak = () => Promise.resolve();

describe.each(ids)('%s module contract', (id) => {
  const mod = MODULES[id];
  const kind = SUBTESTS[id].kind;
  const variants = mod.variants?.map((v) => v.id) ?? [undefined];
  const variantFor = (i: number) => (['IST', 'DST', 'RST'].includes(id) ? 'book-7' : variants[i % variants.length]);

  it('registers under its own id with a complete guide', () => {
    expect(mod.id).toBe(id);
    expect(mod.guide.kidIntro.length).toBeGreaterThan(10);
    expect(mod.guide.howToPlay.length).toBeGreaterThan(0);
    expect(mod.guide.strategies.length).toBeGreaterThanOrEqual(4);
    expect(mod.guide.everydayActivities.length).toBeGreaterThan(0);
  });

  it('is deterministic and reports a sane difficulty across ages and levels', () => {
    for (let i = 0; i < 40; i++) {
      const age = [6.5, 7.2, 9, 12, 15][i % 5];
      const req = { difficulty: 3 + (i % 16), seed: 1000 + i * 37, age, mode: 'practice' as Mode, variant: variantFor(i) };
      const a = mod.generate(req);
      const b = mod.generate(req);
      expect(a.id).toBe(b.id);
      expect(JSON.stringify(a.payload)).toBe(JSON.stringify(b.payload));
      expect(a.subtest).toBe(id);
      expect(Number.isFinite(a.difficulty)).toBe(true);
      expect(a.difficulty).toBeGreaterThan(2);
      expect(a.difficulty).toBeLessThan(20);
      expect(a.maxPoints).toBeGreaterThan(0);
      expect(a.skills.length).toBeGreaterThan(0);
      if (kind !== 'speeded') {
        expect(a.explanation.length).toBeGreaterThan(5);
        expect(a.hints.length).toBeGreaterThan(0);
      }
    }
  });

  it('harder requests give harder items on average', () => {
    if (kind === 'speeded') return;
    const avg = (d: number) => {
      let s = 0;
      for (let i = 0; i < 20; i++) s += mod.generate({ difficulty: d, seed: 77 + i, age: 8, mode: 'practice', variant: variantFor(i) }).difficulty;
      return s / 20;
    };
    expect(avg(13)).toBeGreaterThan(avg(6));
  });

  it('scores a timeout (null) as zero', () => {
    const item = mod.generate({ difficulty: 7, seed: 5, age: 7, mode: 'test', variant: variantFor(0) });
    const out = mod.score(item, null);
    expect(out.points).toBe(0);
    expect(out.correct).toBe(false);
  });

  it('renders the player, and renders a reveal without crashing', () => {
    for (const mode of ['tutor', 'practice', 'test'] as Mode[]) {
      const item = mod.generate({ difficulty: 7, seed: 11, age: 7, mode, variant: variantFor(1) });
      const { container, unmount } = render(<mod.Player item={item} mode={mode} age={7} onSubmit={() => undefined} hintLevel={0} speak={noSpeak} />);
      expect(container.innerHTML.length).toBeGreaterThan(20);
      unmount();
    }
    const item = mod.generate({ difficulty: 7, seed: 12, age: 7, mode: 'practice', variant: variantFor(2) });
    const outcome = mod.score(item, null);
    const { container } = render(
      <mod.Player item={item} mode="practice" age={7} onSubmit={() => undefined} hintLevel={1} speak={noSpeak} reveal={{ response: null, outcome }} />,
    );
    expect(container.innerHTML.length).toBeGreaterThan(20);
  });
});
