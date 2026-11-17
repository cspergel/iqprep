import { describe, expect, it } from 'vitest';
import { buildReport, skillLabel } from './report';
import { expectedSpeededRaw } from './scoring';
import type { ItemResult, SubtestId } from './types';

let n = 0;
function r(subtest: SubtestId, difficulty: number, correct: boolean, extra: Partial<ItemResult> = {}): ItemResult {
  n += 1;
  return {
    itemId: `${subtest}:${n}`, subtest, difficulty, seed: n, points: correct ? 1 : 0, maxPoints: 1, correct,
    timeMs: 8000, overTime: false, hintsUsed: 0, attempts: 1, skills: [`${subtest.toLowerCase()}:core`], mode: 'test', at: n, ...extra,
  };
}

/** Items rising from 5 to 12 years; the child passes everything below `ability`. */
function ladder(subtest: SubtestId, ability: number, extra: (d: number) => Partial<ItemResult> = () => ({})): ItemResult[] {
  const out: ItemResult[] = [];
  for (let d = 5; d <= 12; d += 0.5) out.push(r(subtest, d, d < ability, extra(d)));
  return out;
}

function sheet(subtest: SubtestId, raw: number, errors = 0, skill?: string, dur = 120): ItemResult {
  return r(subtest, 7, raw > 0, { points: raw, maxPoints: 100, meta: { correct: raw, errors, durationSec: dur }, skills: skill ? [skill] : [`${subtest.toLowerCase()}:A`] });
}

describe('buildReport', () => {
  const age = 7;
  const typicalCD = Math.round(expectedSpeededRaw('CD', age));
  const typicalSS = Math.round(expectedSpeededRaw('SS', age));

  const results = [
    ...ladder('SI', 10.5), ...ladder('VC', 10.5),
    ...ladder('BD', 7), ...ladder('VP', 7),
    ...ladder('MR', 7), ...ladder('FW', 7),
    ...ladder('DS', 7, () => ({ skills: ['ds:forward'] })),
    ...ladder('PS', 7),
    sheet('CD', typicalCD), sheet('SS', typicalSS),
  ];
  const rep = buildReport(results, age, { timed: true });

  it('scores every subtest and computes FSIQ and all five indexes', () => {
    expect(Object.keys(rep.subtests).sort()).toEqual(['BD', 'CD', 'DS', 'FW', 'MR', 'PS', 'SI', 'SS', 'VC', 'VP']);
    for (const id of ['FSIQ', 'VCI', 'VSI', 'FRI', 'WMI', 'PSI', 'GAI', 'CPI', 'NVI'] as const) expect(rep.profile.composites[id]).toBeDefined();
  });

  it('reflects performance: age-level subtests near 10, strong verbal well above', () => {
    expect(rep.subtests.BD!.scaled).toBeGreaterThanOrEqual(9);
    expect(rep.subtests.BD!.scaled).toBeLessThanOrEqual(11);
    expect(rep.subtests.SI!.scaled).toBeGreaterThanOrEqual(14);
    expect(rep.subtests.CD!.scaled).toBe(10);
    expect(rep.profile.composites.VCI!.score).toBeGreaterThan(rep.profile.composites.VSI!.score + 15);
  });

  it('turns the verbal gap into a strength insight', () => {
    const strength = rep.insights.find((i) => i.kind === 'strength' && i.index === 'VCI');
    expect(strength).toBeDefined();
    expect(strength!.text).toMatch(/personal strength/);
  });

  it('does not flag strengths in a flat profile', () => {
    const flat = buildReport([...ladder('SI', 7), ...ladder('VC', 7), ...ladder('BD', 7), ...ladder('MR', 7), ...ladder('FW', 7), ...ladder('DS', 7), ...ladder('PS', 7), ...ladder('VP', 7), sheet('CD', typicalCD), sheet('SS', typicalSS)], age, { timed: true });
    expect(flat.insights.filter((i) => i.kind === 'strength' || i.kind === 'growth').filter((i) => i.index)).toHaveLength(0);
  });

  it('scores over-time answers as zero when timed, and reports a no-time-bonus Block Design score', () => {
    const bd = ladder('BD', 10, (d) => ({ overTime: d >= 7 && d < 10 }));
    const timed = buildReport(bd, age, { timed: true });
    const untimed = buildReport(bd, age, { timed: false });
    expect(timed.subtests.BD!.scaled).toBeLessThan(untimed.subtests.BD!.scaled);
    const bdn = timed.process.find((p) => p.id === 'BDn');
    expect(bdn?.value).toBe(untimed.subtests.BD!.scaled);
  });

  it('separates Digit Span forward and backward and notices a big gap', () => {
    const ds = [
      ...ladder('DS', 11, (d) => ({ skills: ['ds:forward'], meta: { span: Math.round(d / 2) } })),
      ...ladder('DS', 5.5, (d) => ({ skills: ['ds:backward'], meta: { span: Math.round(d / 3) } })),
    ];
    const rep2 = buildReport(ds, age, { timed: true });
    const f = rep2.process.find((p) => p.id === 'DSf')!.value;
    const b = rep2.process.find((p) => p.id === 'DSb')!.value;
    expect(f - b).toBeGreaterThanOrEqual(3);
    expect(rep2.insights.some((i) => i.title === 'Holding is easier than juggling')).toBe(true);
    expect(rep2.process.find((p) => p.id === 'LDSf')!.value).toBe(5);
  });

  it('flags error-prone speed work', () => {
    const rep3 = buildReport([sheet('SS', 20, 8)], age, { timed: true });
    expect(rep3.insights.some((i) => i.subtest === 'SS' && /slips/.test(i.title))).toBe(true);
    const rep4 = buildReport([sheet('SS', 20, 0)], age, { timed: true });
    expect(rep4.insights.some((i) => i.subtest === 'SS' && /slips/.test(i.title))).toBe(false);
  });

  it('reports Cancellation scattered vs rows separately', () => {
    const rep5 = buildReport([sheet('CA', 30, 0, 'ca:random', 45), sheet('CA', 15, 0, 'ca:structured', 45)], age, { timed: true });
    const car = rep5.process.find((p) => p.id === 'CAr')!.value;
    const cas = rep5.process.find((p) => p.id === 'CAs')!.value;
    expect(car).toBeGreaterThan(cas);
  });

  it('notices "true but not best" verbal answers', () => {
    const verbal = Array.from({ length: 8 }, (_, i) => r('SI', 7, i < 2, { maxPoints: 2, points: i < 2 ? 2 : 1 }));
    expect(buildReport(verbal, age, { timed: false }).insights.some((i) => /best/.test(i.title))).toBe(true);
  });

  it('labels skills in plain words', () => {
    expect(skillLabel('fw:substitution')).toBe('Swapping equal weights');
    expect(skillLabel('mr:weird-new')).toBe('Pattern Finder: weird new');
  });
});

describe('Symbol Search process scores', () => {
  it('reports set and rotation errors separately', () => {
    const rs = [
      { ...r('SS', 7, true), points: 20, maxPoints: 60, meta: { correct: 22, errors: 2, setErrors: 1, rotationErrors: 1, durationSec: 120 } },
      { ...r('SS', 7, true), points: 18, maxPoints: 60, meta: { correct: 21, errors: 3, setErrors: 0, rotationErrors: 3, durationSec: 120 } },
    ];
    const rep = buildReport(rs, 7, { timed: true });
    expect(rep.process.find((p) => p.id === 'SSse')?.value).toBe(1);
    expect(rep.process.find((p) => p.id === 'SSre')?.value).toBe(4);
  });
});

describe('Block Design process scores', () => {
  it('counts dimension errors and second-try successes', () => {
    const rs: ItemResult[] = [
      { ...r('BD', 7, false), meta: { rotationError: 0, dimensionError: 1 } },
      { ...r('BD', 8, true), meta: { rotationError: 0, dimensionError: 0 } },
      { ...r('BD', 4.5, true), points: 1, maxPoints: 2, meta: { trial: 2 } },
    ];
    const rep = buildReport(rs, 7, { timed: true });
    expect(rep.process.find((p) => p.id === 'BDde')?.value).toBe(1);
    expect(rep.process.find((p) => p.id === 'BDt2')?.value).toBe(1);
  });
});
