import { describe, expect, it } from 'vitest';
import DigitSpan from '../subtests/DS';
import { createRng } from './rng';
import { probCorrect } from './scoring';
import { SessionEngine, dailyPlan, mockPlan, practicePlan, reviewPlan, shortTestPlan, type SessionPlan } from './session';
import type { Item, ItemResult, SubtestId, SubtestModule } from './types';

/** A power-test module whose item difficulty is exactly what was requested. */
function fakeModule(id: SubtestId): SubtestModule {
  return {
    id,
    generate: (req) => ({
      id: `${id}:${req.seed}`, subtest: id, difficulty: req.difficulty, seed: req.seed, payload: null,
      maxPoints: 1, skills: [`${id.toLowerCase()}:x`], hints: [], explanation: '',
    }),
    score: () => ({ points: 0, correct: false }),
    Player: () => null,
    guide: { kidIntro: '', howToPlay: [], strategies: [], parentNotes: '', commonMistakes: [], everydayActivities: [] },
  };
}

const getModule = (id: SubtestId) => (id === 'DS' ? DigitSpan : fakeModule(id));

function result(item: Item, correct: boolean, extra: Partial<ItemResult> = {}): ItemResult {
  return {
    itemId: item.id, subtest: item.subtest, difficulty: item.difficulty, seed: item.seed,
    points: correct ? item.maxPoints : 0, maxPoints: item.maxPoints, correct, timeMs: 5000, overTime: false,
    hintsUsed: 0, attempts: 1, skills: item.skills, mode: 'test', at: 0, ...extra,
  };
}

/** Drive a session with a child who passes items deterministically below `ability`. */
function runThreshold(plan: SessionPlan, ability: number, age = 7) {
  const eng = new SessionEngine(plan, { age, history: [], getModule });
  const seen: Item[] = [];
  for (let n = eng.next(); n; n = eng.next()) {
    seen.push(n.item);
    eng.record(result(n.item, n.item.difficulty < ability));
    if (seen.length > 500) throw new Error('runaway session');
  }
  return { eng, seen };
}

const single = (subtest: SubtestId, strategy: 'standard' | 'adaptive', maxItems = 18): SessionPlan => ({
  kind: 'short', title: 't', mode: strategy === 'standard' ? 'test' : 'practice', seed: 7, feedback: false, timed: true, breaks: false,
  blocks: [{ subtest, strategy, maxItems }],
});

describe('standard (test-mode) blocks', () => {
  it('rises in difficulty and discontinues after 3 zeros in a row (Matrix Reasoning)', () => {
    const { seen, eng } = runThreshold(single('MR', 'standard'), 9);
    const ds = seen.map((i) => i.difficulty);
    for (let i = 1; i < ds.length; i++) expect(ds[i]).toBeGreaterThan(ds[i - 1]);
    const last3 = eng.results.slice(-3);
    expect(last3.every((r) => !r.correct)).toBe(true);
    expect(eng.results.filter((r) => !r.correct)).toHaveLength(3);
    expect(seen.length).toBeLessThan(18);
  });

  it('stops after 2 zeros for Block Design', () => {
    const { eng } = runThreshold(single('BD', 'standard'), 8);
    expect(eng.results.filter((r) => !r.correct)).toHaveLength(2);
  });

  it('a stronger child gets further before discontinuing', () => {
    const weak = runThreshold(single('MR', 'standard'), 8).seen.length;
    const strong = runThreshold(single('MR', 'standard'), 12).seen.length;
    expect(strong).toBeGreaterThan(weak);
  });

  it('applies the reverse rule: missing an early item drops to easier items, then resumes', () => {
    const { seen } = runThreshold(single('MR', 'standard'), 5.5);
    const start = seen[0].difficulty;
    expect(seen[1].difficulty).toBeLessThan(start);
    // eventually goes back above the start point
    expect(seen.some((i, k) => k > 1 && i.difficulty > start)).toBe(true);
  });

  it('Digit Span: two trials per span, strictly longer spans, stops when both trials fail', () => {
    const plan: SessionPlan = { ...single('DS', 'standard', 16), blocks: [{ subtest: 'DS', variant: 'forward', strategy: 'standard', maxItems: 16 }] };
    const eng = new SessionEngine(plan, { age: 7, history: [], getModule });
    const spans: number[] = [];
    for (let n = eng.next(); n; n = eng.next()) {
      const span = (n.item.payload as { digits: number[] }).digits.length;
      spans.push(span);
      eng.record(result(n.item, span <= 5)); // child can hold 5 digits
    }
    for (let i = 0; i + 1 < spans.length; i += 2) expect(spans[i]).toBe(spans[i + 1]);
    for (let i = 2; i < spans.length; i += 2) expect(spans[i]).toBeGreaterThan(spans[i - 2]);
    expect(spans[spans.length - 1]).toBe(6);
    expect(spans.filter((s) => s === 6)).toHaveLength(2);
  });
});

describe('adaptive (practice) blocks', () => {
  it('targets harder items for a stronger child', () => {
    const avg = (ability: number) => {
      const plan = single('FW', 'adaptive', 12);
      const eng = new SessionEngine(plan, { age: 7, history: [], getModule });
      const rng = createRng(1);
      const ds: number[] = [];
      for (let n = eng.next(); n; n = eng.next()) {
        ds.push(n.item.difficulty);
        eng.record(result(n.item, rng.next() < probCorrect(ability, n.item.difficulty, 7)));
      }
      return ds.slice(-6).reduce((a, b) => a + b, 0) / 6;
    };
    expect(avg(11)).toBeGreaterThan(avg(6) + 1.5);
  });

  it('never ends on a miss: adds one easier item', () => {
    const plan = single('FW', 'adaptive', 3);
    const eng = new SessionEngine(plan, { age: 7, history: [], getModule });
    const ds: number[] = [];
    let k = 0;
    for (let n = eng.next(); n; n = eng.next()) {
      ds.push(n.item.difficulty);
      eng.record(result(n.item, k++ !== 2)); // miss the 3rd
    }
    expect(ds).toHaveLength(4);
    expect(ds[3]).toBeLessThan(ds[2]);
  });

  it('backs off after two misses in a row', () => {
    const plan = single('FW', 'adaptive', 8);
    // An established level around 8 years: alternating right/wrong at difficulty 8.
    const history = Array.from({ length: 10 }, (_, i) =>
      result(fakeModule('FW').generate({ difficulty: 8, seed: i + 1, age: 7, mode: 'practice' }), i % 2 === 0));
    const eng = new SessionEngine(plan, { age: 7, history, getModule });
    const a = eng.next()!; eng.record(result(a.item, false));
    const b = eng.next()!; eng.record(result(b.item, false));
    const c = eng.next()!;
    expect(c.item.difficulty).toBeLessThan(b.item.difficulty - 0.5);
  });
});

describe('gentle practice for younger campers', () => {
  // A new camper's first item, relative to their age, with no history.
  const firstGap = (age: number) => {
    const eng = new SessionEngine(single('FW', 'adaptive', 6), { age, history: [], getModule });
    return age - eng.next()!.item.difficulty;
  };

  // Gap in age-SDs, so ages compare fairly.
  const rel = (age: number) => firstGap(age) / (0.22 * age + 0.2);

  it('starts a 7-year-old well below their age, further than a 10-year-old', () => {
    expect(firstGap(7)).toBeGreaterThan(2.5);
    expect(rel(7)).toBeGreaterThan(1.5);
    expect(rel(10)).toBeLessThan(1.0);
  });

  it('the cut-off is at age 9: 8.9 is gentle, 9.0 is not', () => {
    expect(rel(8.9)).toBeGreaterThan(rel(9.0) + 0.5);
  });

  it('a young camper gets an easier item after a single miss; an older one does not', () => {
    const afterOneMiss = (age: number) => {
      const history = Array.from({ length: 12 }, (_, i) =>
        result(fakeModule('FW').generate({ difficulty: age, seed: i + 1, age, mode: 'practice' }), i % 4 !== 0));
      const eng = new SessionEngine(single('FW', 'adaptive', 8), { age, history, getModule });
      const a = eng.next()!; eng.record(result(a.item, true));
      const b = eng.next()!; eng.record(result(b.item, false));
      return (b.item.difficulty - eng.next()!.item.difficulty) / (0.22 * age + 0.2);
    };
    expect(afterOneMiss(7)).toBeGreaterThan(afterOneMiss(11) + 0.25);
  });

  it('still climbs for a strong young camper (the warm-up fades)', () => {
    const plan = single('FW', 'adaptive', 14);
    const { seen } = runThreshold(plan, 12, 7);
    const ds = seen.map((i) => i.difficulty);
    expect(ds[ds.length - 1]).toBeGreaterThan(ds[0] + 2);
  });
});

describe('fixed and sheet blocks', () => {
  it('re-creates exactly the requested items', () => {
    const plan = reviewPlan([{ subtest: 'DS', retry: { difficulty: 9, seed: 1234, variant: 'backward' } }], 5);
    const eng = new SessionEngine(plan, { age: 7, history: [], getModule });
    const first = eng.next()!;
    expect(first.item.id).toBe(DigitSpan.generate({ difficulty: 9, seed: 1234, age: 7, mode: 'practice', variant: 'backward' }).id);
    expect(plan.blocks.map((b) => b.strategy)).toEqual(['fixed', 'adaptive']);
  });

  it('a sheet block gives exactly one item', () => {
    const plan = practicePlan('CD', 'practice', 8, 3);
    const eng = new SessionEngine(plan, { age: 7, history: [], getModule });
    const n = eng.next()!;
    eng.record(result(n.item, true));
    expect(eng.next()).toBeNull();
  });
});

describe('plan builders', () => {
  it('mock exams follow WISC order and split DS and CA into their tasks', () => {
    const plan = mockPlan('full', 11);
    expect(plan.blocks[0].subtest).toBe('BD');
    expect(plan.blocks.filter((b) => b.subtest === 'DS').map((b) => b.variant)).toEqual(['forward', 'backward', 'sequencing']);
    expect(plan.blocks.filter((b) => b.subtest === 'CA').map((b) => b.variant)).toEqual(['random', 'structured']);
    expect(plan.feedback).toBe(false);
    expect(plan.mode).toBe('test');
  });

  it('symbol translation subtests share one code book in a session', () => {
    const plan = mockPlan('complete', 42);
    const books = plan.blocks.filter((b) => ['IST', 'DST', 'RST'].includes(b.subtest)).map((b) => b.variant);
    expect(books).toHaveLength(3);
    expect(new Set(books).size).toBe(1);
    const ist = plan.blocks.findIndex((b) => b.subtest === 'IST');
    const dst = plan.blocks.findIndex((b) => b.subtest === 'DST');
    expect(dst - ist).toBeGreaterThan(5); // delayed recall comes much later
  });

  it('short tests sort chosen subtests into standard order', () => {
    const plan = shortTestPlan({ subtests: ['FW', 'BD', 'VC'], itemsPerSubtest: 5, timed: true, feedback: false, style: 'standard' }, 1);
    expect(plan.blocks.map((b) => b.subtest)).toEqual(['BD', 'VC', 'FW']);
    expect(plan.mode).toBe('test');
  });

  it('daily quest: 4 different subtests, the weakest first, the strongest last', () => {
    const plan = dailyPlan({
      estimates: { SI: 12, VC: 11, BD: 6, MR: 10, FW: 14, DS: 9 },
      enabled: ['SI', 'VC', 'BD', 'MR', 'FW', 'DS', 'VP', 'PS', 'CD', 'SS'],
      dueSubtests: [], minutes: 15,
    }, 3);
    const subs = plan.blocks.map((b) => b.subtest);
    expect(new Set(subs).size).toBe(subs.length);
    expect(subs.length).toBe(4);
    expect(subs[0]).toBe('BD');
    expect(subs[subs.length - 1]).toBe('FW');
  });
});

describe('targeted question types', () => {
  /** Two question types: 'mr:even' items come from even seeds, 'mr:odd' from odd ones. */
  const typed: SubtestModule = {
    ...fakeModule('MR'),
    generate: (req) => ({ ...fakeModule('MR').generate(req), skills: [req.seed % 2 ? 'mr:odd' : 'mr:even'] }),
  };
  const getTyped = (id: SubtestId) => (id === 'MR' ? typed : getModule(id));

  it('only serves items of the chosen type', () => {
    const plan = shortTestPlan({ subtests: ['MR'], itemsPerSubtest: 12, timed: false, feedback: true, style: 'adaptive', skills: { MR: ['mr:odd'] } }, 9);
    const eng = new SessionEngine(plan, { age: 7, history: [], getModule: getTyped });
    const skills: string[] = [];
    for (let n = eng.next(); n; n = eng.next()) {
      skills.push(...n.item.skills);
      eng.record(result(n.item, true));
    }
    expect(skills.length).toBeGreaterThanOrEqual(12);
    expect(new Set(skills)).toEqual(new Set(['mr:odd']));
  });

  it('without a filter both types appear', () => {
    const plan = shortTestPlan({ subtests: ['MR'], itemsPerSubtest: 12, timed: false, feedback: true, style: 'adaptive' }, 9);
    const eng = new SessionEngine(plan, { age: 7, history: [], getModule: getTyped });
    const skills = new Set<string>();
    for (let n = eng.next(); n; n = eng.next()) {
      n.item.skills.forEach((s) => skills.add(s));
      eng.record(result(n.item, true));
    }
    expect(skills).toEqual(new Set(['mr:odd', 'mr:even']));
  });

  it('Digit Span task filters keep just the chosen tasks', () => {
    const plan = shortTestPlan({ subtests: ['DS'], itemsPerSubtest: 6, timed: false, feedback: true, style: 'adaptive', skills: { DS: ['ds:backward'] } }, 2);
    expect(plan.blocks.map((b) => b.variant)).toEqual(['backward']);
    const eng = new SessionEngine(plan, { age: 7, history: [], getModule });
    for (let n = eng.next(); n; n = eng.next()) {
      expect((n.item.payload as { task: string }).task).toBe('backward');
      eng.record(result(n.item, true));
    }
  });
});

describe('Picture Span pooled seeds', () => {
  it('gives consecutive PS items seeds in the same block of 1000 (shared picture pool)', () => {
    const seeds: number[] = [];
    const ps: SubtestModule = { ...fakeModule('PS'), generate: (req) => { seeds.push(req.seed); return fakeModule('PS').generate(req); } };
    const plan = practicePlan('PS', 'practice', 6, 3);
    const eng = new SessionEngine(plan, { age: 7, history: [], getModule: (id) => (id === 'PS' ? ps : getModule(id)) });
    for (let n = eng.next(); n; n = eng.next()) eng.record(result(n.item, true));
    const blocks = new Set(seeds.map((s) => Math.floor(s / 1000)));
    expect(blocks.size).toBe(1);
    expect(new Set(seeds).size).toBe(seeds.length);
  });

  it('other subtests keep independent random seeds', () => {
    const seeds: number[] = [];
    const mr: SubtestModule = { ...fakeModule('MR'), generate: (req) => { seeds.push(req.seed); return fakeModule('MR').generate(req); } };
    const plan = practicePlan('MR', 'practice', 6, 3);
    const eng = new SessionEngine(plan, { age: 7, history: [], getModule: (id) => (id === 'MR' ? mr : getModule(id)) });
    for (let n = eng.next(); n; n = eng.next()) eng.record(result(n.item, true));
    expect(new Set(seeds.map((s) => Math.floor(s / 1000))).size).toBeGreaterThan(1);
  });
});
