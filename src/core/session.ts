/**
 * Session planning and the item-sequencing engine.
 *
 * Strategies per block:
 *  adaptive  – practice: aims each item at ~78% success for this child (desirable difficulty),
 *              backs off after two misses, stretches after three hits, never ends on a miss.
 *  standard  – test mode: start point below age, items rise in difficulty, reverse rule if an early
 *              item is missed, discontinue rule (N zeros in a row, or all trials of a span level).
 *  fixed     – exact items (spaced-review retries).
 *  sheet     – one timed sheet (processing speed / naming speed).
 */
import { createRng, randomSeed, type Rng } from './rng';
import { difficultyForSuccess, estimateAbility, sdForAge } from './scoring';
import { SUBTESTS } from './subtestInfo';
import type { SessionKind } from './storage';
import type { Item, ItemResult, Mode, SubtestId, SubtestModule } from './types';

export type BlockStrategy = 'adaptive' | 'standard' | 'fixed' | 'sheet';

export interface Block {
  subtest: SubtestId;
  variant?: string;
  strategy: BlockStrategy;
  maxItems: number;
  fixed?: { difficulty: number; seed: number; variant?: string }[];
  /** Friendly label, e.g. "Number Echo — Backward". */
  label?: string;
  /**
   * Targeted practice: only give items whose skill tags include one of these (question types).
   * Works with any module by generating candidates and keeping matching ones.
   */
  skills?: string[];
}

export interface SessionPlan {
  kind: SessionKind;
  title: string;
  mode: Mode;
  blocks: Block[];
  seed: number;
  /** Show right/wrong + explanation after each item. */
  feedback: boolean;
  /** Use standard time limits. */
  timed: boolean;
  /** Pause screens between blocks (mock exams). */
  breaks: boolean;
  battery?: string;
}

export interface NextItem {
  item: Item;
  block: Block;
  blockIndex: number;
  indexInBlock: number;
}

interface BlockState {
  items: Item[];
  results: ItemResult[];
  done: boolean;
  // standard strategy
  phase: 'forward' | 'reverse';
  level: number;
  trialInLevel: number;
  levelDifficulty: number[];
  reverseStep: number;
  reversePerfectRun: number;
  maxForwardLevel: number;
  // adaptive strategy
  target?: number;
  extended: boolean;
}

export interface EngineContext {
  age: number;
  /** Earlier results (for adaptive targeting and avoiding repeats). */
  history: ItemResult[];
  getModule: (id: SubtestId) => SubtestModule;
}

const TRIALS_PER_LEVEL: Partial<Record<SubtestId, number>> = { DS: 2, LN: 3 };
const MIN_DIFF = 3;
const MAX_DIFF = 18;
const clampD = (d: number) => Math.max(MIN_DIFF, Math.min(MAX_DIFF, d));

/**
 * Younger campers (under 9) get gentler practice: more wins per round, a warm-up start that sits
 * below their age and fades as the game learns their level, and an easier item after a single miss.
 * Test mode ('standard') keeps the real test's rules for every age.
 */
export const GENTLE_UNDER_AGE = 9;
const SUCCESS_TARGET = 0.78;
const GENTLE_SUCCESS_TARGET = 0.88;
/** Warm-up offset, in age-SDs below the estimate, before any answers; gone after this many answers. */
const GENTLE_WARMUP_SD = 0.8;
const GENTLE_WARMUP_ITEMS = 12;

export class SessionEngine {
  readonly plan: SessionPlan;
  private ctx: EngineContext;
  private rng: Rng;
  private states: BlockState[];
  private blockIndex = 0;
  private pending: NextItem | null = null;
  private seen = new Set<string>();

  constructor(plan: SessionPlan, ctx: EngineContext) {
    this.plan = plan;
    this.ctx = ctx;
    this.rng = createRng(plan.seed);
    this.states = plan.blocks.map(() => ({
      items: [], results: [], done: false, phase: 'forward', level: 0, trialInLevel: 0, levelDifficulty: [],
      reverseStep: 0, reversePerfectRun: 0, maxForwardLevel: 0, extended: false,
    }));
    for (const r of ctx.history.slice(-400)) this.seen.add(r.itemId);
  }

  get step(): number {
    return sdForAge(this.ctx.age) * 0.4;
  }

  get currentBlockIndex(): number {
    return this.blockIndex;
  }

  get results(): ItemResult[] {
    return this.states.flatMap((s) => s.results);
  }

  blockResults(i: number): ItemResult[] {
    return this.states[i]?.results ?? [];
  }

  isFinished(): boolean {
    return this.blockIndex >= this.plan.blocks.length;
  }

  /** The next item to show, or null when the session is over. Idempotent until `record` is called. */
  next(): NextItem | null {
    if (this.pending) return this.pending;
    while (this.blockIndex < this.plan.blocks.length) {
      const block = this.plan.blocks[this.blockIndex];
      const st = this.states[this.blockIndex];
      if (!st.done) {
        const item = this.makeItem(block, st);
        if (item) {
          st.items.push(item);
          this.seen.add(item.id);
          this.pending = { item, block, blockIndex: this.blockIndex, indexInBlock: st.items.length - 1 };
          return this.pending;
        }
        st.done = true;
      }
      this.blockIndex += 1;
    }
    return null;
  }

  /** True if the next call to next() will start a new block (used for break screens). */
  atBlockBoundary(): boolean {
    const st = this.states[this.blockIndex];
    return !!st && st.items.length === 0;
  }

  record(result: ItemResult): void {
    if (!this.pending) throw new Error('record() without a pending item');
    const { block, blockIndex } = this.pending;
    const st = this.states[blockIndex];
    st.results.push(result);
    this.pending = null;
    if (block.strategy === 'standard') this.afterStandard(block, st, result);
    else if (block.strategy === 'adaptive') this.afterAdaptive(block, st, result);
    else if (block.strategy === 'sheet') st.done = true;
    if (st.items.length >= this.cap(block, st)) {
      // Adaptive practice never ends on a miss: allow one extra, easier item.
      if (block.strategy === 'adaptive' && !result.correct && !st.extended) {
        st.extended = true;
        st.target = clampD((st.target ?? result.difficulty) - 2 * this.step);
      } else {
        st.done = true;
      }
    }
  }

  /** Skip the rest of the current block (e.g. the child is tired of this game). */
  skipBlock(): void {
    this.pending = null;
    const st = this.states[this.blockIndex];
    if (st) st.done = true;
  }

  /** End the whole session now. */
  abort(): void {
    this.pending = null;
    for (const st of this.states) st.done = true;
    this.blockIndex = this.plan.blocks.length;
  }

  private cap(block: Block, st: BlockState): number {
    if (block.strategy === 'fixed') return block.fixed?.length ?? 0;
    if (block.strategy === 'sheet') return 1;
    return block.maxItems + (st.extended ? 1 : 0) + (block.strategy === 'standard' ? st.reverseStep : 0);
  }

  /** Per-block seed counters for subtests whose items should share a picture pool (Picture Span). */
  private pooled = new Map<Block, { base: number; next: number }>();

  private nextSeed(block: Block): number {
    if (block.subtest !== 'PS') return this.rng.int(1, 2 ** 31 - 2);
    // Picture Span: consecutive seeds in one block of 1000 share a recurring picture pool, so earlier
    // items' pictures come back as distractors — the real test's proactive interference.
    let p = this.pooled.get(block);
    if (!p) {
      p = { base: this.rng.int(1, 2_000_000) * 1000, next: 1 };
      this.pooled.set(block, p);
    }
    const seed = p.base + (p.next % 1000);
    p.next += 1;
    return seed;
  }

  private generate(block: Block, difficulty: number, variant?: string): Item {
    const mod = this.ctx.getModule(block.subtest);
    const exclude = [...this.seen];
    const make = (d: number) =>
      mod.generate({ difficulty: clampD(d), seed: this.nextSeed(block), age: this.ctx.age, mode: this.plan.mode, variant, exclude });
    const wanted = block.skills?.length ? new Set(block.skills) : null;
    const fits = (it: Item) => !wanted || it.skills.some((s) => wanted.has(s));
    let item = make(difficulty);
    // Targeted question types: keep trying, first at this difficulty, then spreading out
    // (some question types only exist at certain levels).
    for (let i = 0; wanted && !fits(item) && i < 60; i++) {
      const spread = i < 20 ? 0 : ((i - 15) / 45) * 6 * (i % 2 ? 1 : -1);
      const candidate = make(difficulty + spread);
      if (fits(candidate)) item = candidate;
    }
    // Avoid exact repeats when the generator can offer something else.
    for (let i = 0; i < 4 && this.seen.has(item.id); i++) {
      const candidate = make(difficulty);
      if (fits(candidate)) item = candidate;
    }
    return item;
  }

  private makeItem(block: Block, st: BlockState): Item | null {
    if (st.items.length >= this.cap(block, st)) return null;
    switch (block.strategy) {
      case 'fixed': {
        const f = block.fixed![st.items.length];
        const mod = this.ctx.getModule(block.subtest);
        return mod.generate({ difficulty: f.difficulty, seed: f.seed, age: this.ctx.age, mode: this.plan.mode, variant: f.variant ?? block.variant });
      }
      case 'sheet':
        return this.generate(block, this.ctx.age, block.variant);
      case 'adaptive': {
        if (st.target === undefined) st.target = this.adaptiveTarget(block, st);
        const jitter = (this.rng.next() - 0.5) * 0.5 * this.step;
        return this.generate(block, clampD(st.target + jitter), block.variant);
      }
      case 'standard':
        return this.standardItem(block, st);
    }
  }

  // ---------- adaptive ----------

  private adaptiveTarget(block: Block, st: BlockState): number {
    const age = this.ctx.age;
    const prior = this.ctx.history.filter((r) => r.subtest === block.subtest).slice(-30);
    const obs = [...prior, ...st.results].map((r) => ({
      difficulty: r.difficulty,
      points: r.hintsUsed > 0 || r.attempts > 1 ? r.points * 0.5 : r.points,
      maxPoints: r.maxPoints,
    }));
    // A steadier prior than reporting uses, so one slip doesn't swing practice difficulty wildly.
    const theta = estimateAbility(obs, age, 1.0).theta;
    if (!this.gentle) return clampD(difficultyForSuccess(theta, age, SUCCESS_TARGET));
    const warmup = GENTLE_WARMUP_SD * sdForAge(age) * Math.max(0, 1 - obs.length / GENTLE_WARMUP_ITEMS);
    return clampD(difficultyForSuccess(theta, age, GENTLE_SUCCESS_TARGET) - warmup);
  }

  private get gentle(): boolean {
    return this.ctx.age < GENTLE_UNDER_AGE;
  }

  private afterAdaptive(block: Block, st: BlockState, r: ItemResult): void {
    const rs = st.results;
    const lastTwoMissed = rs.length >= 2 && !rs[rs.length - 1].correct && !rs[rs.length - 2].correct;
    const lastThreeHit = rs.length >= 3 && rs.slice(-3).every((x) => x.correct && x.hintsUsed === 0);
    let target = this.adaptiveTarget(block, st);
    if (lastTwoMissed) target = Math.min(target, r.difficulty) - 2 * this.step; // confidence win
    else if (this.gentle && !r.correct) target = Math.min(target, r.difficulty) - this.step; // young: ease off at once
    else if (lastThreeHit) target = Math.max(target, r.difficulty) + this.step; // stretch
    st.target = clampD(target);
  }

  // ---------- standard (test) ----------

  private startDifficulty(): number {
    return this.ctx.age - sdForAge(this.ctx.age) * 0.6;
  }

  private standardItem(block: Block, st: BlockState): Item | null {
    const trials = TRIALS_PER_LEVEL[block.subtest] ?? 1;
    if (st.phase === 'reverse') {
      const d = this.startDifficulty() - st.reverseStep * this.step * 1.5;
      if (d < MIN_DIFF) {
        st.phase = 'forward';
        st.level = st.maxForwardLevel + 1;
        return this.standardItem(block, st);
      }
      return this.generate(block, d, block.variant);
    }
    // forward: reuse the level's difficulty for repeated trials, otherwise find a strictly harder level.
    if (st.trialInLevel > 0 && st.levelDifficulty[st.level] !== undefined) {
      return this.generate(block, st.levelDifficulty[st.level], block.variant);
    }
    let target = this.startDifficulty() + st.level * this.step;
    const prev = st.level > 0 ? st.levelDifficulty[st.level - 1] : undefined;
    let item = this.generate(block, target, block.variant);
    if (prev !== undefined) {
      for (let i = 0; i < 12 && item.difficulty <= prev + 1e-6 && target < MAX_DIFF; i++) {
        target += this.step / 2;
        item = this.generate(block, target, block.variant);
      }
      if (item.difficulty <= prev + 1e-6 && trials > 1) return null; // span ceiling reached
    }
    st.levelDifficulty[st.level] = item.difficulty;
    void trials;
    return item;
  }

  private afterStandard(block: Block, st: BlockState, r: ItemResult): void {
    const info = SUBTESTS[block.subtest];
    const trials = TRIALS_PER_LEVEL[block.subtest] ?? 1;
    const perfect = r.points >= r.maxPoints && !(r.overTime && this.plan.timed);
    const zero = r.points === 0 || (r.overTime && this.plan.timed);

    if (st.phase === 'reverse') {
      st.reversePerfectRun = perfect ? st.reversePerfectRun + 1 : 0;
      if (st.reversePerfectRun >= 2 || st.reverseStep >= 4) {
        st.phase = 'forward';
        st.level = st.maxForwardLevel + 1;
        st.trialInLevel = 0;
      } else {
        st.reverseStep += 1;
      }
      return;
    }

    if (trials > 1) {
      st.trialInLevel += 1;
      if (st.trialInLevel >= trials) {
        const levelResults = st.results.slice(-trials);
        if (levelResults.every((x) => x.points === 0)) {
          st.done = true;
          return;
        }
        st.maxForwardLevel = st.level;
        st.level += 1;
        st.trialInLevel = 0;
      }
      return;
    }

    // Reverse rule: an imperfect score on either of the first two items sends us back to easier items.
    const forwardCount = st.results.length - st.reverseStep;
    if (forwardCount <= 2 && !perfect && st.reverseStep === 0) {
      st.maxForwardLevel = st.level;
      st.phase = 'reverse';
      st.reverseStep = 1;
      st.reversePerfectRun = 0;
      return;
    }
    st.maxForwardLevel = Math.max(st.maxForwardLevel, st.level);
    st.level += 1;

    // Discontinue: N consecutive zeros among forward items.
    const n = info.discontinueAfter ?? 3;
    const tail = st.results.slice(-n);
    if (tail.length === n && tail.every((x) => x.points === 0 || (x.overTime && this.plan.timed))) st.done = true;
    void zero;
  }
}

// ---------- plan builders ----------

export const WISC_ORDER: SubtestId[] = ['BD', 'SI', 'MR', 'DS', 'CD', 'VC', 'FW', 'VP', 'PS', 'SS', 'IN', 'PC', 'LN', 'CA', 'CO', 'AR'];

export interface BatteryInfo { id: string; name: string; kidName: string; description: string; minutes: string; subtests: SubtestId[]; shortened?: boolean }

export const BATTERIES: BatteryInfo[] = [
  { id: 'quick', name: 'Quick FSIQ Check', kidName: 'Mini Camp Challenge', minutes: '20–30', shortened: true,
    description: 'The seven FSIQ games with shortened lengths — a quick estimate of the overall profile.',
    subtests: ['BD', 'SI', 'MR', 'DS', 'CD', 'VC', 'FW'] },
  { id: 'fsiq', name: 'FSIQ Battery', kidName: 'Camp Challenge', minutes: '35–50',
    description: 'The seven subtests used for the Full Scale IQ, given in standard order with test rules.',
    subtests: ['BD', 'SI', 'MR', 'DS', 'CD', 'VC', 'FW'] },
  { id: 'primary', name: 'Primary Battery', kidName: 'Big Camp Challenge', minutes: '50–70',
    description: 'All ten primary subtests: FSIQ plus all five primary index scores.',
    subtests: ['BD', 'SI', 'MR', 'DS', 'CD', 'VC', 'FW', 'VP', 'PS', 'SS'] },
  { id: 'full', name: 'Full Battery', kidName: 'Grand Camp Challenge', minutes: '75–100',
    description: 'All 16 primary and secondary subtests: indexes plus all ancillary indexes (QRI, AWMI, NVI, GAI, CPI).',
    subtests: WISC_ORDER },
  { id: 'complete', name: 'Complete + Complementary', kidName: 'Ultimate Camp Challenge', minutes: '95–125',
    description: 'Everything, including naming speed and symbol translation (NSI, STI, SRI). Best split over two days.',
    subtests: [...WISC_ORDER.slice(0, 10), 'IST', ...WISC_ORDER.slice(10), 'NSL', 'NSQ', 'DST', 'RST'] },
];

function blocksFor(subtest: SubtestId, strategy: BlockStrategy, maxItems: number, book?: string): Block[] {
  const info = SUBTESTS[subtest];
  if (subtest === 'DS') {
    const perTask = strategy === 'standard' ? Math.max(4, Math.round(maxItems / 3)) : maxItems;
    return (['forward', 'backward', 'sequencing'] as const).map((v) => ({
      subtest, variant: v, strategy, maxItems: perTask, label: `${info.kidName} — ${v[0].toUpperCase()}${v.slice(1)}`,
    }));
  }
  if (subtest === 'CA') {
    return [
      { subtest, variant: 'random', strategy: 'sheet', maxItems: 1, label: `${info.kidName} — Scattered` },
      { subtest, variant: 'structured', strategy: 'sheet', maxItems: 1, label: `${info.kidName} — In rows` },
    ];
  }
  if (info.kind === 'speeded') return [{ subtest, strategy: 'sheet', maxItems: 1, label: info.kidName }];
  const variant = ['IST', 'DST', 'RST'].includes(subtest) ? book : undefined;
  return [{ subtest, variant, strategy, maxItems, label: info.kidName }];
}

export function codeBook(seed: number): string {
  return `book-${seed % 1000}`;
}

export function mockPlan(batteryId: string, seed = randomSeed()): SessionPlan {
  const battery = BATTERIES.find((b) => b.id === batteryId) ?? BATTERIES[1];
  const book = codeBook(seed);
  const blocks = battery.subtests.flatMap((s) => {
    const len = battery.shortened ? Math.min(SUBTESTS[s].testLength, s === 'DS' ? 18 : 9) : SUBTESTS[s].testLength;
    return blocksFor(s, 'standard', len, book);
  });
  return { kind: 'mock', title: battery.name, mode: 'test', blocks, seed, feedback: false, timed: true, breaks: true, battery: battery.id };
}

export function practicePlan(subtest: SubtestId, mode: 'tutor' | 'practice', count = 8, seed = randomSeed(), skills?: string[]): SessionPlan {
  const info = SUBTESTS[subtest];
  const book = codeBook(seed);
  let blocks: Block[];
  if (info.kind === 'speeded') {
    blocks = blocksFor(subtest, 'sheet', 1).slice(0, subtest === 'CA' ? 2 : 1);
  } else {
    blocks = [{ subtest, strategy: 'adaptive', maxItems: count, label: info.kidName, variant: ['IST', 'DST', 'RST'].includes(subtest) ? book : undefined, skills: skills?.length ? skills : undefined }];
  }
  return {
    kind: mode === 'tutor' ? 'tutor' : 'practice',
    title: `${info.kidName}${mode === 'tutor' ? ' with Pip' : ''}`,
    mode, blocks, seed, feedback: true, timed: false, breaks: false,
  };
}

export interface ShortTestOptions {
  subtests: SubtestId[];
  /** Optional question-type filter per subtest (skill tags). Missing/empty = every type. */
  skills?: Partial<Record<SubtestId, string[]>>;
  itemsPerSubtest: number;
  timed: boolean;
  feedback: boolean;
  /** 'standard' mirrors test rules (rising difficulty + discontinue); 'adaptive' targets the child's level. */
  style: 'standard' | 'adaptive';
  title?: string;
}

export function shortTestPlan(opts: ShortTestOptions, seed = randomSeed()): SessionPlan {
  const book = codeBook(seed);
  const order = [...opts.subtests].sort((a, b) => orderIndex(a) - orderIndex(b));
  const blocks = order.flatMap((s) => {
    const want = opts.skills?.[s]?.filter(Boolean);
    let bs = blocksFor(s, opts.style, opts.itemsPerSubtest, book);
    if (want?.length) {
      // Digit Span / Cancellation tasks are separate blocks — keep only the chosen ones.
      const taskSkill = (b: Block) => (b.variant ? `${s.toLowerCase()}:${b.variant}` : null);
      const chosenTasks = bs.filter((b) => taskSkill(b) && want.includes(taskSkill(b)!));
      if (chosenTasks.length) bs = chosenTasks;
      bs = bs.map((b) => ({ ...b, skills: b.strategy === 'sheet' ? undefined : want }));
    }
    return bs;
  });
  return {
    kind: 'short',
    title: opts.title ?? 'My Test',
    mode: opts.feedback ? 'practice' : 'test',
    blocks, seed, feedback: opts.feedback, timed: opts.timed, breaks: blocks.length > 2,
  };
}

function orderIndex(s: SubtestId): number {
  const i = BATTERIES[4].subtests.indexOf(s);
  return i === -1 ? 99 : i;
}

export interface DailyInput {
  /** Estimated scaled score per subtest (missing = never tried). */
  estimates: Partial<Record<SubtestId, number>>;
  enabled: SubtestId[];
  dueSubtests: SubtestId[];
  minutes: number;
}

/**
 * Daily quest: 4 interleaved "stations" — the biggest need, something due for review, a strength
 * (to reinforce what's going well and end on a high), and a new or neglected zone.
 */
export function dailyPlan(input: DailyInput, seed = randomSeed()): SessionPlan {
  const rng = createRng(seed);
  const pool = input.enabled.filter((s) => SUBTESTS[s].tier !== 'complementary');
  const untried = rng.shuffle(pool.filter((s) => input.estimates[s] === undefined));
  const tried = pool.filter((s) => input.estimates[s] !== undefined).sort((a, b) => input.estimates[a]! - input.estimates[b]!);
  const picks: SubtestId[] = [];
  const take = (s: SubtestId | undefined) => {
    if (s && !picks.includes(s) && !picks.some((p) => SUBTESTS[p].zone === SUBTESTS[s].zone && picks.length < 3)) picks.push(s);
  };
  // Prefer primary subtests early on.
  const primaryFirst = (xs: SubtestId[]) => [...xs.filter((s) => SUBTESTS[s].tier === 'primary'), ...xs.filter((s) => SUBTESTS[s].tier !== 'primary')];
  take(tried[0] ?? primaryFirst(untried)[0]); // biggest need
  for (const s of input.dueSubtests) { if (picks.length >= 2) break; take(s); }
  if (picks.length < 2) take(primaryFirst(untried)[0] ?? tried[1]);
  take(tried[tried.length - 1]); // strength
  for (const s of [...primaryFirst(untried), ...tried]) { if (picks.length >= 4) break; take(s); }
  for (const s of rng.shuffle(pool)) { if (picks.length >= 4) break; if (!picks.includes(s)) picks.push(s); }

  // Strength last so the quest ends on a win.
  const strength = tried[tried.length - 1];
  const ordered = picks.filter((s) => s !== strength);
  if (strength && picks.includes(strength)) ordered.push(strength);

  const perStation = input.minutes >= 20 ? 6 : input.minutes >= 12 ? 5 : 4;
  const blocks = ordered.flatMap((s) => {
    if (SUBTESTS[s].kind === 'speeded') return blocksFor(s, 'sheet', 1).slice(0, 1);
    return [{ subtest: s, strategy: 'adaptive' as const, maxItems: perStation, label: SUBTESTS[s].kidName }];
  });
  return { kind: 'daily', title: "Today's Camp Quest", mode: 'practice', blocks, seed, feedback: true, timed: false, breaks: false };
}

export function reviewPlan(cards: { subtest: SubtestId; retry?: { difficulty: number; seed: number; variant?: string } }[], seed = randomSeed()): SessionPlan {
  const blocks: Block[] = [];
  const bySubtest = new Map<SubtestId, { difficulty: number; seed: number; variant?: string }[]>();
  for (const c of cards.slice(0, 8)) {
    if (!bySubtest.has(c.subtest)) bySubtest.set(c.subtest, []);
    if (c.retry) bySubtest.get(c.subtest)!.push(c.retry);
  }
  for (const [subtest, retries] of bySubtest) {
    if (retries.length) blocks.push({ subtest, strategy: 'fixed', maxItems: retries.length, fixed: retries, label: `${SUBTESTS[subtest].kidName} — try again` });
    blocks.push({ subtest, strategy: 'adaptive', maxItems: 2, label: `${SUBTESTS[subtest].kidName} — new ones` });
  }
  return { kind: 'review', title: 'Memory Quest', mode: 'practice', blocks, seed, feedback: true, timed: false, breaks: false };
}
