/**
 * Picture Span ("Picture Parade"). A row of pictures is shown for a few seconds; then the child taps
 * them, in the same order, on a response page that mixes the targets with distractors.
 *
 * Scoring follows the real subtest: 2 = all the right pictures in the right order, 1 = all the right
 * pictures in the wrong order, 0 otherwise.
 *
 * Difficulty model (age-equivalent, 50% pass point) — span is the main driver, the size of the
 * response page is a finer step inside each span:
 *   span 1 ≈ 3–4 y · 2 ≈ 5 · 3 ≈ 6.5 · 4 ≈ 8.5 · 5 ≈ 11 · 6 ≈ 14 · 7 ≈ 16.4 · 8 ≈ 18
 * Distractors always include "same-family" foils (another fruit for a fruit, another vehicle for a
 * car) — tempting, but never near-duplicates (no 🍎/🍏 or 🐶/🐕 pairs exist in the picture bank).
 *
 * Proactive interference (format study #11): all pictures come from a ~24-picture SESSION POOL shared
 * by nearby seeds, so pictures recur across items, and from difficulty 8 the response page includes
 * 1–2 pictures that were targets on the (simulated) previous item. See "session pool" below.
 */
import { useEffect, useRef, useState } from 'react';
import { createRng, type Rng } from '../../core/rng';
import type { GenerateRequest, Item, PlayerProps, ScoreOutcome, SubtestGuide, SubtestModule } from '../../core/types';
import { ChoiceGrid, PipSays } from '../../ui/kit';

export interface PsPayload {
  /** Picture ids, in the order they are shown. */
  targets: string[];
  /** Picture ids on the response page (targets + distractors), shuffled. */
  options: string[];
  /** How long the stimulus page is shown, in seconds. */
  exposureSec: number;
  /** Foils that were targets on the (simulated) previous item: proactive interference, difficulty ≥ 8. */
  priorFoils?: string[];
}
/** Picture ids in the order the child tapped them. */
export type PsResponse = string[];

// ---------- picture bank (objects only — no faces) ----------

export interface PsPicture {
  id: string;
  emoji: string;
  name: string;
  category: string;
}

const BANK: Record<string, [string, string][]> = {
  fruit: [['apple', '🍎'], ['banana', '🍌'], ['grapes', '🍇'], ['strawberry', '🍓'], ['orange', '🍊'], ['pear', '🍐'], ['cherries', '🍒'], ['watermelon', '🍉'], ['lemon', '🍋'], ['peach', '🍑']],
  vehicle: [['car', '🚗'], ['bus', '🚌'], ['bike', '🚲'], ['airplane', '✈️'], ['train', '🚂'], ['rocket', '🚀'], ['helicopter', '🚁'], ['sailboat', '⛵'], ['tractor', '🚜'], ['fire truck', '🚒']],
  animal: [['elephant', '🐘'], ['giraffe', '🦒'], ['turtle', '🐢'], ['fish', '🐟'], ['butterfly', '🦋'], ['snail', '🐌'], ['bee', '🐝'], ['ladybug', '🐞'], ['crab', '🦀'], ['duck', '🦆'], ['rabbit', '🐇'], ['cow', '🐄']],
  toy: [['ball', '⚽'], ['balloon', '🎈'], ['kite', '🪁'], ['present', '🎁'], ['drum', '🥁'], ['guitar', '🎸'], ['yo-yo', '🪀'], ['puzzle piece', '🧩'], ['crayon', '🖍️'], ['dice', '🎲']],
  food: [['pizza', '🍕'], ['donut', '🍩'], ['ice cream', '🍦'], ['cupcake', '🧁'], ['cookie', '🍪'], ['carrot', '🥕'], ['corn', '🌽'], ['burger', '🍔'], ['pretzel', '🥨'], ['cheese', '🧀']],
  nature: [['star', '⭐'], ['moon', '🌙'], ['sun', '☀️'], ['rainbow', '🌈'], ['snowflake', '❄️'], ['cactus', '🌵'], ['sunflower', '🌻'], ['mushroom', '🍄'], ['tree', '🌳'], ['fire', '🔥']],
  clothes: [['sneaker', '👟'], ['cap', '🧢'], ['T-shirt', '👕'], ['gloves', '🧤'], ['top hat', '🎩'], ['glasses', '👓'], ['scarf', '🧣'], ['jeans', '👖'], ['socks', '🧦'], ['dress', '👗']],
  thing: [['key', '🔑'], ['pencil', '✏️'], ['books', '📚'], ['alarm clock', '⏰'], ['umbrella', '☂️'], ['bell', '🔔'], ['light bulb', '💡'], ['scissors', '✂️'], ['lock', '🔒'], ['paintbrush', '🖌️']],
};

export const PICTURES: Record<string, PsPicture> = Object.fromEntries(
  Object.entries(BANK).flatMap(([category, list]) =>
    list.map(([name, emoji]) => [name, { id: name, emoji, name, category }] as const),
  ),
);

/** Younger children (under 6) see the most familiar families only. */
const YOUNG_CATEGORIES = ['fruit', 'vehicle', 'animal', 'toy', 'food'];
const ALL_CATEGORIES = Object.keys(BANK);

export function categoriesForAge(age: number): string[] {
  return age < 6 ? YOUNG_CATEGORIES : ALL_CATEGORIES;
}

// ---------- difficulty model ----------

export interface PsLevel {
  span: number;
  options: number;
  difficulty: number;
}

export const PS_LEVELS: PsLevel[] = [
  { span: 1, options: 3, difficulty: 3.2 },
  { span: 1, options: 4, difficulty: 3.9 },
  { span: 2, options: 4, difficulty: 4.6 },
  { span: 2, options: 6, difficulty: 5.3 },
  { span: 3, options: 6, difficulty: 6.2 },
  { span: 3, options: 8, difficulty: 7.0 },
  { span: 4, options: 8, difficulty: 8.2 },
  { span: 4, options: 9, difficulty: 9.0 },
  { span: 5, options: 9, difficulty: 10.4 },
  { span: 5, options: 10, difficulty: 11.4 },
  { span: 6, options: 10, difficulty: 13.2 },
  { span: 6, options: 12, difficulty: 14.3 },
  { span: 7, options: 12, difficulty: 16.4 },
  { span: 8, options: 12, difficulty: 18 },
];

export function levelForDifficulty(difficulty: number): PsLevel {
  let best = PS_LEVELS[0];
  for (const lvl of PS_LEVELS) {
    if (Math.abs(lvl.difficulty - difficulty) < Math.abs(best.difficulty - difficulty)) best = lvl;
  }
  return best;
}

/** Single-picture items are flashed for 3 s, everything else for 5 s (as in the real subtest). */
export function exposureFor(span: number): number {
  return span === 1 ? 3 : 5;
}

// ---------- session pool + proactive interference ----------
//
// The real subtest reuses a modest set of pictures across items, so pictures from earlier items come
// back as distractors (proactive interference). A module has no session state, so we approximate it
// deterministically from the seed:
//  - SESSION POOL: seeds in the same block of 1000 (poolKey = floor(seed / 1000)) share one pool of
//    POOL_SIZE pictures, spread evenly over the allowed families. Every target and every foil is drawn
//    from the pool (the whole bank is only a never-expected fallback), so pictures recur from item to
//    item whenever the session hands out nearby seeds.
//  - PREVIOUS ITEM: the item "before" this one is simulated as the same-level item for the previous
//    seed in the block (seed − 1, wrapping to the block's last seed). Its targets come from
//    `poolTargets`, which depends only on (pool, span, seed) — so they are exactly what generate()
//    shows for that seed at this level.
//  - At difficulty ≥ 8, 1–2 foils are pictures that were TARGETS on that previous item (`priorFoils`):
//    the most tempting kind of interference. Tapping one is counted as `meta.priorErrors`.
// Targets themselves are never adjusted to dodge the previous item (rarely, if every previous target
// is also a current target, one current target is swapped for a same-family pool picture so a prior
// foil still exists).

/** Pictures in one session pool (~24: the real test reuses a modest picture set). */
export const POOL_SIZE = 24;
/** Seeds with the same key share a pool. */
export const poolKey = (seed: number): number => Math.floor(seed / 1000);
/** Prior-target foils start at this (age-equivalent) difficulty. */
export const INTERFERENCE_FROM = 8;

/** The session pool for a seed: POOL_SIZE pictures spread evenly over the allowed families. */
export function sessionPool(seed: number, categories: string[]): string[] {
  const rng = createRng((Math.imul(poolKey(seed) + 1, 0x9e3779b1) ^ 0x51ed270b) >>> 0);
  const cats = rng.shuffle(categories);
  const base = Math.floor(POOL_SIZE / cats.length), extra = POOL_SIZE % cats.length;
  return cats.flatMap((c, i) => rng.sample(BANK[c].map(([n]) => n), Math.min(BANK[c].length, base + (i < extra ? 1 : 0))));
}

/** The seed treated as "the previous item" in the same pool. */
export function previousSeed(seed: number): number {
  return seed % 1000 === 0 ? seed + 999 : seed - 1;
}

const targetRng = (seed: number) => createRng((seed ^ 0x2c1b3c6d) >>> 0);

/**
 * Targets for (pool, span, seed): walk the pool's families in a shuffled order so neighbouring
 * pictures come from different families. Depends only on its arguments.
 */
export function poolTargets(pool: string[], span: number, seed: number): string[] {
  return pickTargets(pool, span, targetRng(seed));
}

function pickTargets(pool: string[], span: number, rng: Rng): string[] {
  const cats = rng.shuffle([...new Set(pool.map((id) => PICTURES[id].category))]);
  const targets: string[] = [];
  for (let i = 0; i < span; i++) {
    const inCat = pool.filter((id) => PICTURES[id].category === cats[i % cats.length] && !targets.includes(id));
    targets.push(rng.pick(inCat.length ? inCat : pool.filter((id) => !targets.includes(id))));
  }
  return targets;
}

/** Targets of the simulated previous item (same pool, same level). */
export function previousTargets(seed: number, span: number, categories: string[]): string[] {
  const prev = previousSeed(seed);
  return poolTargets(sessionPool(prev, categories), span, prev);
}

function buildPictures(span: number, optionCount: number, categories: string[], seed: number, interference: boolean) {
  const pool = sessionPool(seed, categories);
  const rng = targetRng(seed);
  const targets = pickTargets(pool, span, rng);
  const prior = interference ? previousTargets(seed, span, categories) : [];
  if (interference && prior.every((p) => targets.includes(p))) {
    // Rare: the previous targets are all reused. Swap one current target for a same-family picture.
    const i = rng.int(0, span - 1);
    const fam = PICTURES[targets[i]].category;
    const alt = pool.filter((id) => !targets.includes(id) && PICTURES[id].category === fam);
    const any = pool.filter((id) => !targets.includes(id) && !prior.includes(id));
    targets[i] = rng.pick(alt.length ? alt : any);
  }
  const used = new Set<string>(targets);
  const foils: string[] = [];
  const room = () => span + foils.length < optionCount;
  const add = (id: string) => { used.add(id); foils.push(id); };

  // 1. Proactive interference: 1–2 pictures that were targets on the previous item.
  const priorFoils: string[] = [];
  if (interference) {
    const want = optionCount - span >= 4 ? 2 : 1;
    for (const p of rng.shuffle(prior.filter((id) => !used.has(id))).slice(0, want)) {
      add(p);
      priorFoils.push(p);
    }
  }
  // 2. Same-family foils from the pool (another fruit for a fruit), as many as the page allows.
  const unusedPoolIn = (cat: string) => pool.filter((id) => PICTURES[id].category === cat && !used.has(id));
  for (const t of rng.shuffle(targets)) {
    if (!room()) break;
    const fam = unusedPoolIn(PICTURES[t].category);
    if (fam.length === 0) continue;
    add(rng.pick(fam));
  }
  // 3. Fill from the pool; the whole bank only if the pool ran dry.
  while (room()) {
    const fromPool = pool.filter((id) => !used.has(id));
    add(rng.pick(fromPool.length ? fromPool : categories.flatMap((c) => BANK[c].map(([n]) => n)).filter((n) => !used.has(n))));
  }
  return { targets, options: rng.shuffle([...targets, ...foils]), priorFoils };
}

export function generate(req: GenerateRequest): Item<PsPayload> {
  const level = levelForDifficulty(req.difficulty);
  const { span, options: optionCount } = level;
  const interference = level.difficulty >= INTERFERENCE_FROM;
  const { targets, options, priorFoils } = buildPictures(span, optionCount, categoriesForAge(req.age), req.seed, interference);
  const names = targets.map((t) => PICTURES[t].name);
  const exposureSec = exposureFor(span);
  return {
    id: `PS:${span}x${optionCount}:${req.seed}:${req.age < 6 ? 'y' : 'a'}`,
    subtest: 'PS',
    difficulty: level.difficulty,
    seed: req.seed,
    payload: priorFoils.length ? { targets, options, exposureSec, priorFoils } : { targets, options, exposureSec },
    maxPoints: 2,
    skills: [`ps:span-${span}`, 'ps:recognition', ...(span > 1 ? ['ps:order'] : []), ...(priorFoils.length ? ['ps:interference'] : [])],
    hints:
      span === 1
        ? ['Say the picture’s name in your head while you look.', `It was the ${names[0]}.`]
        : [
            'Say their names in your head, in order, like a little song.',
            `Make a silly story: the ${names[0]} … then the ${names[1]}${span > 2 ? ' …' : ''}.`,
            `The first one was the ${names[0]}.`,
          ],
    explanation:
      span === 1
        ? `The picture was the ${names[0]}.`
        : `The pictures were: ${names.join(', ')} — in that order. Tap them first-to-last.`,
    steps: span > 1 ? names.map((n, i) => `${i + 1}. ${n}`) : undefined,
    speak:
      span === 1
        ? 'Look at the picture. Then find it on the next page.'
        : 'Look at the pictures. Then tap them in the same order you saw them.',
  };
}

export function score(item: Item<PsPayload>, response: PsResponse | null): ScoreOutcome {
  const { targets, options } = item.payload;
  const prior = item.payload.priorFoils ?? [];
  const meta = { span: targets.length, options: options.length, orderOnly: 0, found: 0, priorErrors: 0 };
  if (!response || response.length === 0) return { points: 0, correct: false, meta };
  const found = targets.filter((t) => response.includes(t)).length;
  meta.found = found;
  // Proactive-interference intrusions: tapped a picture that was a target last time.
  meta.priorErrors = response.filter((r) => prior.includes(r)).length;
  const sameSet = response.length === targets.length && new Set(response).size === response.length && found === targets.length;
  const sameOrder = sameSet && response.every((r, i) => r === targets[i]);
  if (sameOrder) return { points: 2, correct: true, meta };
  if (sameSet) {
    meta.orderOnly = 1;
    return {
      points: 1,
      correct: false,
      meta,
      feedback: 'You found every picture! The order got mixed up — try saying their names in order while you look.',
    };
  }
  let feedback: string | undefined;
  if (meta.priorErrors > 0) feedback = 'Careful — one of your pictures was from the last round, not this one!';
  else if (found > 0 && response.length > targets.length) feedback = `You tapped ${response.length} pictures, but there were only ${targets.length}.`;
  else if (found > 0) feedback = `You found ${found} of the ${targets.length} pictures. Great start!`;
  return { points: 0, correct: false, meta, feedback };
}

// ---------- Player ----------

type Phase = 'ready' | 'look' | 'answer';

function PictureTile({ id, size = 64 }: { id: string; size?: number }) {
  const p = PICTURES[id];
  return (
    <span
      role="img"
      aria-label={p?.name ?? id}
      style={{
        width: size + 16, height: size + 16, display: 'grid', placeItems: 'center',
        border: 'var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--card)',
        boxShadow: 'var(--shadow-sm)', fontSize: size * 0.7, lineHeight: 1,
      }}
    >
      {p?.emoji ?? '?'}
    </span>
  );
}

function OrderBadge({ n, tone = 'var(--lake)' }: { n: number; tone?: string }) {
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute', top: -10, left: -8, width: 28, height: 28, borderRadius: '50%',
        border: '2px solid var(--ink)', background: tone, color: '#fff', display: 'grid', placeItems: 'center',
        fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.95rem',
      }}
    >
      {n}
    </span>
  );
}

export function Player({ item, mode, onSubmit, reveal, hintLevel }: PlayerProps<PsPayload, PsResponse>) {
  const { targets, options, exposureSec } = item.payload;
  const [phase, setPhase] = useState<Phase>(reveal ? 'answer' : 'ready');
  const [picked, setPicked] = useState<string[]>([]);
  const [left, setLeft] = useState(exposureSec);
  const [peeks, setPeeks] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const look = () => {
    setPhase('look');
    setPicked([]);
    setLeft(exposureSec);
    const started = Date.now();
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      const remaining = exposureSec - (Date.now() - started) / 1000;
      setLeft(Math.max(0, Math.ceil(remaining)));
      if (remaining <= 0) {
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
        setPhase('answer');
      }
    }, 100);
  };

  const toggle = (id: string) => {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < options.length ? [...p, id] : p));
  };

  const chosen = reveal ? (reveal.response ?? []) : picked;
  const canPeek = mode !== 'test' && hintLevel >= 1 && peeks < 1 && phase === 'answer' && !reveal;
  const cols = Math.min(targets.length, 4);

  return (
    <div className="stage">
      <div className="prompt">{targets.length === 1 ? 'Find the picture' : 'Tap them in order'}</div>

      {phase === 'ready' && (
        <div className="stack" style={{ alignItems: 'center' }}>
          <PipSays mood="wave">
            {targets.length === 1
              ? 'I’ll show you a picture for a moment. Remember it, then find it!'
              : `I’ll show you ${targets.length} pictures for a moment. Remember them in order, then tap them first to last!`}
          </PipSays>
          <button type="button" className="btn primary big" onClick={look}>👀 I'm ready</button>
        </div>
      )}

      {phase === 'look' && (
        <div className="stack" style={{ alignItems: 'center' }} aria-live="polite">
          <div
            style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, auto)`, gap: 10, justifyContent: 'center' }}
            aria-label={`Remember these pictures in order: ${targets.map((t) => PICTURES[t].name).join(', ')}`}
          >
            {targets.map((t, i) => <PictureTile key={i} id={t} size={targets.length > 4 ? 52 : 64} />)}
          </div>
          <div className="row" style={{ justifyContent: 'center', gap: 8 }} aria-label={`${left} seconds left`}>
            {Array.from({ length: exposureSec }, (_, i) => (
              <span
                key={i}
                aria-hidden
                style={{
                  width: 18, height: 18, borderRadius: '50%', border: '3px solid var(--ink)',
                  background: i < left ? 'var(--sun)' : 'var(--card)', transition: 'background .2s',
                }}
              />
            ))}
          </div>
        </div>
      )}

      {phase === 'answer' && (
        <>
          <ChoiceGrid
            minWidth={64}
            options={options.map((id) => {
              const n = chosen.indexOf(id);
              const tone = reveal ? (targets[n] === id ? 'var(--good)' : 'var(--bad)') : 'var(--lake)';
              return {
                key: id,
                ariaLabel: `${PICTURES[id].name}${n >= 0 ? `, tapped number ${n + 1}` : ''}`,
                content: (
                  <>
                    {n >= 0 && <OrderBadge n={n + 1} tone={tone} />}
                    <span style={{ fontSize: 40, lineHeight: 1 }} aria-hidden>{PICTURES[id].emoji}</span>
                  </>
                ),
              };
            })}
            selected={chosen}
            onSelect={toggle}
            reveal={reveal ? { correctKeys: targets, chosenKeys: chosen } : undefined}
          />
          {reveal ? (
            <div className="card flat tint center stack" style={{ alignItems: 'center' }}>
              <div className="small muted">Right order</div>
              <div className="row" style={{ justifyContent: 'center' }}>
                {targets.map((t, i) => (
                  <span key={i} style={{ position: 'relative' }}>
                    <OrderBadge n={i + 1} tone="var(--good)" />
                    <PictureTile id={t} size={44} />
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="row" style={{ justifyContent: 'center' }}>
              {canPeek && (
                <button type="button" className="btn ghost small" onClick={() => { setPeeks((p) => p + 1); look(); }}>
                  👀 Peek again
                </button>
              )}
              <button type="button" className="btn ghost small" disabled={picked.length === 0} onClick={() => setPicked((p) => p.slice(0, -1))}>
                ⌫ Undo
              </button>
              <button type="button" className="btn go" disabled={picked.length === 0} onClick={() => onSubmit(picked)}>
                Done ✓
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------- guide ----------

export const guide: SubtestGuide = {
  kidIntro: 'Picture Parade! A parade of pictures marches by for a few seconds. Remember who was in it — and in what order!',
  howToPlay: [
    'Tap “I’m ready” and look closely. The pictures stay for just a few seconds.',
    'Then you’ll see lots of pictures. Tap the ones you saw, first one first.',
    'Little numbers show your order. Tap a picture again (or Undo) to take it back.',
    'Tap Done when you have them all.',
  ],
  strategies: [
    { title: 'Name them silently', tip: 'Say the names in your head while you look: “apple, car, star”. Names are easier to hold than pictures.' },
    { title: 'Silly story', tip: 'Link them in a funny story: “The apple drove a car up to a star!” The story keeps the order.' },
    { title: 'Pairs', tip: 'Group them in twos: “apple-car … star-bus”. Two little pairs are easier than four loose pictures.' },
    { title: 'Shelf in your head', tip: 'Picture a shelf (or your bedroom) and put each picture in its own spot, left to right. Then “walk” along it.' },
    { title: 'Number tags', tip: 'Give each picture its place number as you look: “one apple, two car, three star”.' },
    { title: 'Finger hold', tip: 'Quietly touch a finger for each picture — thumb is the first one, pointer is the second — and remember which picture sits on which finger.' },
    { title: 'Fresh start', tip: 'Pictures come back from earlier rounds! Before you look, tell yourself “new round” — only tap what you saw THIS time.' },
    { title: 'Snapshot',tip: 'For just one or two pictures, take a “photo” with your eyes: stare at the whole row and keep the picture of it in your head.' },
  ],
  parentNotes:
    'Picture Span measures visual working memory: briefly holding a set of pictures and their order in mind, then picking them out from look-alike distractors. It is one of the two Working Memory Index subtests (with Digit Span) and part of the Nonverbal Index. Getting all the right pictures in the wrong order earns partial credit, so the game reports “found them” and “in order” separately — order memory usually lags behind recognition in younger children. Like the real test, the game reuses a modest set of pictures, and on harder items the choices include pictures that were the answers last round — the child has to ignore what is familiar and remember what is new (picking one is counted as a “last-round” error).',
  commonMistakes: [
    'Tapping a picture that was in the last round — it feels familiar, but it was not in this one.',
    'Looking at every picture at once instead of left-to-right, so the order is lost.',
    'Picking a same-family foil (another fruit, another vehicle) instead of the exact picture.',
    'Tapping the most memorable picture first rather than the first one shown.',
    'Tapping extra pictures “just in case” — that loses the point.',
  ],
  everydayActivities: [
    '“What’s missing?”: show 3–6 toys in a row, cover them, mix them up, and ask your child to rebuild the row.',
    'Lay out a few picture cards, flip them over, and take turns naming them in order.',
    'In the car or store, look at three signs or items, then try to list them in the order you passed them.',
    'Play Memory/Concentration with picture cards.',
  ],
};

export const PictureSpan: SubtestModule<PsPayload, PsResponse> = {
  id: 'PS',
  generate,
  score,
  Player,
  guide,
};

export default PictureSpan;
