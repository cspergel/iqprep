/**
 * Figure Weights ("Balance Scales"). Balanced scales show how shapes trade for each other; the child
 * picks the option that balances the last scale. Early items are a direct copy; later ones need
 * substitution chains, combining, and subtracting (early algebra).
 *
 * Layout follows the DS reference module: pure generate/score at the top, Player, then guide.
 * Every item is checked by brute force (check.ts): the answer balances under every weight assignment
 * (1–9) consistent with the shown scales, and no distractor balances under any of them.
 */
import { useState } from 'react';
import { createRng, type Rng } from '../../core/rng';
import type { GenerateRequest, Item, PlayerProps, ScoreOutcome, SubtestGuide, SubtestModule } from '../../core/types';
import { ChoiceGrid } from '../../ui/kit';
import { Shape, SHAPE_NAMES, ShapeGlyph, type ShapeColor, type ShapeKind } from '../../ui/shapes';
import { balancesAlways, balancesSometimes, consistentWeights, pieces, sameSide, weightOf, type Scale, type Side } from './check';

export interface FwShape { kind: ShapeKind; color: ShapeColor }
export interface FwPayload {
  template: string;
  shapes: FwShape[];
  /** Hidden weights used to build the item (never shown). */
  weights: number[];
  refs: Scale[];
  /** Left pan of the final scale; the right pan is the "?". */
  target: Side;
  options: Side[];
  answer: number;
}
export type FwResponse = number;

// ---------- templates ----------

type L = 'A' | 'B' | 'C' | 'D';
type Bag = Partial<Record<L, number>>;
const LETTERS: L[] = ['A', 'B', 'C', 'D'];

interface Plan {
  w: Bag;
  refs: [Bag, Bag][];
  target: Bag;
  answer: Bag;
  skills: string[];
  diff: number;
  /** Worked solution and a short explanation; `q(bag)` names a bag like "2 circles and 1 square". */
  talk: (q: (b: Bag) => string) => { steps: string[]; explanation: string; hint: string };
}
interface Template { id: string; diff: number; build: (rng: Rng) => Plan }
const T = (id: string, diff: number, build: (rng: Rng) => Plan): Template => ({ id, diff, build });

const TEMPLATES: Template[] = [
  T('match', 4.5, (rng) => {
    const x = rng.int(1, 3);
    return {
      w: { A: x, B: x }, refs: [[{ A: 1 }, { B: 1 }]], target: { A: 1 }, answer: { B: 1 }, skills: ['fw:direct'], diff: 4.5,
      talk: (q) => ({
        steps: [`The scale shows ${q({ A: 1 })} balancing ${q({ B: 1 })}.`, `So they weigh the same: ${q({ B: 1 })} balances ${q({ A: 1 })}.`],
        explanation: `${cap(q({ A: 1 }))} weighs the same as ${q({ B: 1 })}, so ${q({ B: 1 })} keeps the scale level.`,
        hint: `Find a scale with ${q({ A: 1 })} on it. What is on the other side?`,
      }),
    };
  }),
  T('copy', 5.5, (rng) => {
    const n = rng.int(2, 3);
    return {
      w: { A: n, B: 1 }, refs: [[{ A: 1 }, { B: n }]], target: { A: 1 }, answer: { B: n }, skills: ['fw:direct'], diff: 5.5,
      talk: (q) => ({
        steps: [`The scale shows ${q({ A: 1 })} = ${q({ B: n })}.`, `So ${q({ B: n })} balance ${q({ A: 1 })}.`],
        explanation: `The first scale shows ${q({ A: 1 })} weighs the same as ${q({ B: n })}. So ${q({ B: n })} balance it.`,
        hint: `Find the scale with ${q({ A: 1 })}. What is on the other side?`,
      }),
    };
  }),
  T('plus-one', 6, (rng) => {
    const n = rng.int(2, 3);
    return {
      w: { A: n, B: 1 }, refs: [[{ A: 1 }, { B: n }]], target: { A: 1, B: 1 }, answer: { B: n + 1 }, skills: ['fw:combine'], diff: 6,
      talk: (q) => ({
        steps: [`${cap(q({ A: 1 }))} = ${q({ B: n })}.`, `${cap(q({ A: 1, B: 1 }))} = ${q({ B: n })} + ${q({ B: 1 })} = ${q({ B: n + 1 })}.`],
        explanation: `Swap the ${name(q, 'A')} for ${q({ B: n })}. Add the extra ${name(q, 'B')} and you have ${q({ B: n + 1 })}.`,
        hint: `Swap the ${name(q, 'A')} for what it balances. Then add the ${name(q, 'B')} that is already there.`,
      }),
    };
  }),
  ...([[6.5, 2], [7, 3]] as const).map(([diff, n]) => T(n === 2 ? 'double' : 'double-3', diff, () => {
    return {
      w: { A: n, B: 1 }, refs: [[{ A: 1 }, { B: n }]], target: { A: 2 }, answer: { B: 2 * n }, skills: ['fw:direct', 'fw:multiply'], diff: n === 2 ? 6.5 : 7,
      talk: (q) => ({
        steps: [`${cap(q({ A: 1 }))} = ${q({ B: n })}.`, `${cap(q({ A: 2 }))} is twice as much: ${n} + ${n} = ${2 * n}.`, `So ${q({ A: 2 })} = ${q({ B: 2 * n })}.`],
        explanation: `Each ${name(q, 'A')} balances ${q({ B: n })}, so two of them need ${n} + ${n} = ${q({ B: 2 * n })}.`,
        hint: `One ${name(q, 'A')} balances ${q({ B: n })}. How many for two?`,
      }),
    };
  })),
  T('two-sum', 7.5, () => ({
    w: { A: 2, B: 1, C: 3 }, refs: [[{ A: 1 }, { B: 2 }], [{ C: 1 }, { B: 3 }]], target: { A: 1, C: 1 }, answer: { B: 5 }, skills: ['fw:combine'], diff: 7.5,
    talk: (q) => ({
      steps: [`${cap(q({ A: 1 }))} = ${q({ B: 2 })}.`, `${cap(q({ C: 1 }))} = ${q({ B: 3 })}.`, `So ${q({ A: 1, C: 1 })} = 2 + 3 = ${q({ B: 5 })}.`],
      explanation: `Change each shape into ${plural(q, 'B')}: ${q({ A: 1 })} is 2 and ${q({ C: 1 })} is 3, so you need ${q({ B: 5 })}.`,
      hint: `Turn every shape into ${plural(q, 'B')}, then add them up.`,
    }),
  })),
  ...([[8, false], [8.5, true]] as const).map(([diff, six]) => T(six ? 'chain-6' : 'chain', diff, (rng) => {
    const [n, m] = six ? rng.pick([[2, 3], [3, 2]] as const) : ([2, 2] as const);
    return {
      w: { B: 1, A: n, C: n * m }, refs: rng.shuffle([[{ A: 1 }, { B: n }], [{ C: 1 }, { A: m }]] as [Bag, Bag][]),
      target: { C: 1 }, answer: { B: n * m }, skills: ['fw:substitution'], diff: n * m === 4 ? 8 : 8.5,
      talk: (q) => ({
        steps: [`${cap(q({ C: 1 }))} = ${q({ A: m })}.`, `Each ${name(q, 'A')} = ${q({ B: n })}.`, `So ${q({ C: 1 })} = ${m} × ${n} = ${q({ B: n * m })}.`],
        explanation: `${cap(q({ C: 1 }))} = ${q({ A: m })}, and ${q({ A: 1 })} = ${q({ B: n })}, so ${q({ C: 1 })} = ${q({ B: n * m })}.`,
        hint: `First swap the ${name(q, 'C')} for ${plural(q, 'A')}. Then swap each ${name(q, 'A')} for ${plural(q, 'B')}.`,
      }),
    };
  })),
  T('swap-represent', 9, () => ({
    w: { B: 1, A: 2, C: 3 }, refs: [[{ A: 1 }, { B: 2 }], [{ C: 1 }, { B: 3 }]], target: { C: 1 }, answer: { A: 1, B: 1 }, skills: ['fw:substitution', 'fw:combine'], diff: 9,
    talk: (q) => ({
      steps: [`${cap(q({ C: 1 }))} = ${q({ B: 3 })}.`, `${cap(q({ A: 1 }))} = ${q({ B: 2 })}, so ${q({ A: 1, B: 1 })} = 2 + 1 = ${q({ B: 3 })}.`, `So ${q({ A: 1, B: 1 })} balance ${q({ C: 1 })}.`],
      explanation: `Count everything in ${plural(q, 'B')}: ${q({ C: 1 })} is 3, and ${q({ A: 1, B: 1 })} is 2 + 1 = 3 too.`,
      hint: `Work out what every option is worth in ${plural(q, 'B')}.`,
    }),
  })),
  ...([[9.5, false], [10, true]] as const).map(([diff, withA]) => T(withA ? 'chain-mixed-sum' : 'chain-mixed', diff, (rng) => {
    const target: Bag = withA ? { C: 1, A: 1 } : { C: 1 };
    const total = withA ? 5 : 3;
    return {
      w: { B: 1, A: 2, C: 3 }, refs: rng.shuffle([[{ A: 1 }, { B: 2 }], [{ C: 1 }, { A: 1, B: 1 }]] as [Bag, Bag][]),
      target, answer: { B: total }, skills: withA ? ['fw:substitution', 'fw:combine'] : ['fw:substitution'], diff: withA ? 10 : 9.5,
      talk: (q) => ({
        steps: [
          `${cap(q({ A: 1 }))} = ${q({ B: 2 })}.`,
          `${cap(q({ C: 1 }))} = ${q({ A: 1, B: 1 })} = 2 + 1 = ${q({ B: 3 })}.`,
          ...(withA ? [`So ${q(target)} = 3 + 2 = ${q({ B: 5 })}.`] : [`So ${q({ C: 1 })} = ${q({ B: 3 })}.`]),
        ],
        explanation: `${cap(q({ C: 1 }))} = ${q({ A: 1, B: 1 })}, and ${q({ A: 1 })} = ${q({ B: 2 })}, so ${q(target)} = ${q({ B: total })}.`,
        hint: `Find what ${q({ A: 1 })} is worth in ${plural(q, 'B')} first.`,
      }),
    };
  })),
  T('three-chain', 10.5, (rng) => {
    const inA = rng.chance(0.5);
    return {
      w: { B: 1, A: 2, C: 4, D: 6 }, refs: rng.shuffle([[{ A: 1 }, { B: 2 }], [{ C: 1 }, { A: 2 }], [{ D: 1 }, { C: 1, A: 1 }]] as [Bag, Bag][]),
      target: { D: 1 }, answer: inA ? { A: 3 } : { B: 6 }, skills: ['fw:substitution', 'fw:multi-step'], diff: 10.5,
      talk: (q) => ({
        steps: inA
          ? [`${cap(q({ D: 1 }))} = ${q({ C: 1, A: 1 })}.`, `${cap(q({ C: 1 }))} = ${q({ A: 2 })}.`, `So ${q({ D: 1 })} = 2 + 1 = ${q({ A: 3 })}.`]
          : [`${cap(q({ A: 1 }))} = ${q({ B: 2 })}.`, `${cap(q({ C: 1 }))} = ${q({ A: 2 })} = 2 × 2 = ${q({ B: 4 })}.`, `${cap(q({ D: 1 }))} = ${q({ C: 1, A: 1 })} = 4 + 2 = ${q({ B: 6 })}.`],
        explanation: inA
          ? `${cap(q({ D: 1 }))} = ${q({ C: 1, A: 1 })}, and ${q({ C: 1 })} = ${q({ A: 2 })}, so ${q({ D: 1 })} = ${q({ A: 3 })}.`
          : `${cap(q({ C: 1 }))} = ${q({ B: 4 })} and ${q({ A: 1 })} = ${q({ B: 2 })}, so ${q({ D: 1 })} = 4 + 2 = ${q({ B: 6 })}.`,
        hint: inA ? `Swap the ${name(q, 'D')} for what it balances, then swap the ${name(q, 'C')}.` : `Work out what each shape is worth in ${plural(q, 'B')}, starting with the ${name(q, 'A')}.`,
      }),
    };
  }),
  T('three-chain-b', 11, (rng) => ({
    w: { B: 1, A: 2, C: 3, D: 5 }, refs: rng.shuffle([[{ A: 1 }, { B: 2 }], [{ C: 1 }, { A: 1, B: 1 }], [{ D: 1 }, { C: 1, A: 1 }]] as [Bag, Bag][]),
    target: { D: 1 }, answer: { B: 5 }, skills: ['fw:substitution', 'fw:multi-step'], diff: 11,
    talk: (q) => ({
      steps: [`${cap(q({ A: 1 }))} = ${q({ B: 2 })}.`, `${cap(q({ C: 1 }))} = ${q({ A: 1, B: 1 })} = 2 + 1 = ${q({ B: 3 })}.`, `${cap(q({ D: 1 }))} = ${q({ C: 1, A: 1 })} = 3 + 2 = ${q({ B: 5 })}.`],
      explanation: `Turn everything into ${plural(q, 'B')}: ${q({ A: 1 })} is 2, ${q({ C: 1 })} is 3, so ${q({ D: 1 })} is 3 + 2 = 5.`,
      hint: `Start with the smallest shape. What is ${q({ A: 1 })} worth? Then ${q({ C: 1 })}?`,
    }),
  })),
  T('subtract', 12, (rng) => {
    const [m, n] = rng.pick([[4, 1], [4, 2], [5, 1], [5, 2], [5, 3]] as const);
    return {
      w: { B: 1, A: m - n, C: m }, refs: rng.shuffle([[{ A: 1, B: n }, { C: 1 }], [{ C: 1 }, { B: m }]] as [Bag, Bag][]),
      target: { A: 1 }, answer: { B: m - n }, skills: ['fw:multi-step', 'fw:subtract'], diff: 12,
      talk: (q) => ({
        steps: [`${cap(q({ C: 1 }))} = ${q({ B: m })}.`, `${cap(q({ A: 1, B: n }))} = ${q({ C: 1 })} = ${q({ B: m })}.`, `Take ${q({ B: n })} off both sides: ${q({ A: 1 })} = ${m} − ${n} = ${q({ B: m - n })}.`],
        explanation: `${cap(q({ A: 1 }))} plus ${q({ B: n })} weighs the same as ${q({ B: m })}, so the ${name(q, 'A')} alone is ${m} − ${n} = ${q({ B: m - n })}.`,
        hint: `If you take the same thing off both sides, the scale stays level.`,
      }),
    };
  }),
  T('ratio', 13, () => ({
    w: { A: 3, B: 2, C: 5 }, refs: [[{ A: 2 }, { B: 3 }], [{ C: 1 }, { A: 1, B: 1 }]], target: { C: 2 }, answer: { B: 5 }, skills: ['fw:multi-step', 'fw:combine'], diff: 13,
    talk: (q) => ({
      steps: [`${cap(q({ C: 1 }))} = ${q({ A: 1, B: 1 })}, so ${q({ C: 2 })} = ${q({ A: 2, B: 2 })}.`, `${cap(q({ A: 2 }))} = ${q({ B: 3 })}.`, `So ${q({ C: 2 })} = 3 + 2 = ${q({ B: 5 })}.`],
      explanation: `Two ${plural(q, 'C')} are ${q({ A: 2, B: 2 })}. Swap the ${q({ A: 2 })} for ${q({ B: 3 })} and you get ${q({ B: 5 })}.`,
      hint: `Double the scale with the ${name(q, 'C')}. Then look for a scale that has ${q({ A: 2 })}.`,
    }),
  })),
  T('ratio-b', 14, () => ({
    w: { A: 3, B: 2, C: 5 }, refs: [[{ A: 2 }, { B: 3 }], [{ A: 1, B: 1 }, { C: 1 }]], target: { C: 1, A: 1 }, answer: { B: 4 }, skills: ['fw:multi-step', 'fw:combine'], diff: 14,
    talk: (q) => ({
      steps: [`${cap(q({ C: 1 }))} = ${q({ A: 1, B: 1 })}, so ${q({ C: 1, A: 1 })} = ${q({ A: 2, B: 1 })}.`, `${cap(q({ A: 2 }))} = ${q({ B: 3 })}.`, `So ${q({ C: 1, A: 1 })} = 3 + 1 = ${q({ B: 4 })}.`],
      explanation: `Swap the ${name(q, 'C')} to get ${q({ A: 2, B: 1 })}. Two ${plural(q, 'A')} balance ${q({ B: 3 })}, so the total is ${q({ B: 4 })}.`,
      hint: `Swap the ${name(q, 'C')} first. Can you make a pair of ${plural(q, 'A')}?`,
    }),
  })),
  T('three-refs', 14.5, (rng) => ({
    w: { B: 1, A: 2, C: 3, D: 5 }, refs: rng.shuffle([[{ A: 1 }, { B: 2 }], [{ C: 1, B: 1 }, { A: 2 }], [{ D: 1 }, { A: 1, C: 1 }]] as [Bag, Bag][]),
    target: { D: 1 }, answer: { B: 5 }, skills: ['fw:multi-step', 'fw:substitution', 'fw:subtract'], diff: 14.5,
    talk: (q) => ({
      steps: [
        `${cap(q({ A: 1 }))} = ${q({ B: 2 })}.`,
        `${cap(q({ C: 1, B: 1 }))} = ${q({ A: 2 })} = 2 × 2 = ${q({ B: 4 })}, so ${q({ C: 1 })} = 4 − 1 = ${q({ B: 3 })}.`,
        `${cap(q({ D: 1 }))} = ${q({ A: 1, C: 1 })} = 2 + 3 = ${q({ B: 5 })}.`,
      ],
      explanation: `Find each shape in ${plural(q, 'B')}: ${q({ A: 1 })} is 2, ${q({ C: 1 })} is 3, so ${q({ D: 1 })} is 5.`,
      hint: `Start with the scale that only has ${plural(q, 'A')} and ${plural(q, 'B')}.`,
    }),
  })),
  T('extra-clue', 15.5, (rng) => ({
    w: { B: 1, A: 2, C: 3, D: 4 }, refs: rng.shuffle([[{ A: 1, C: 1 }, { D: 1, B: 1 }], [{ A: 2 }, { D: 1 }], [{ C: 1 }, { A: 1, B: 1 }]] as [Bag, Bag][]),
    target: { D: 1, C: 1 }, answer: { A: 3, B: 1 }, skills: ['fw:multi-step', 'fw:substitution', 'fw:combine'], diff: 15.5,
    talk: (q) => ({
      steps: [`${cap(q({ D: 1 }))} = ${q({ A: 2 })}.`, `${cap(q({ C: 1 }))} = ${q({ A: 1, B: 1 })}.`, `So ${q({ D: 1, C: 1 })} = ${q({ A: 2 })} + ${q({ A: 1, B: 1 })} = ${q({ A: 3, B: 1 })}.`, 'One scale was an extra clue you did not need!'],
      explanation: `Swap the ${name(q, 'D')} for ${q({ A: 2 })} and the ${name(q, 'C')} for ${q({ A: 1, B: 1 })}: that makes ${q({ A: 3, B: 1 })}.`,
      hint: `Swap each shape on the last scale for what it balances. You may not need every scale.`,
    }),
  })),
  T('deep', 16.5, (rng) => ({
    w: { B: 1, A: 3, C: 2, D: 5 }, refs: rng.shuffle([[{ A: 1 }, { C: 1, B: 1 }], [{ C: 2 }, { A: 1, B: 1 }], [{ D: 1 }, { A: 1, C: 1 }]] as [Bag, Bag][]),
    target: { D: 1, B: 1 }, answer: { A: 2 }, skills: ['fw:multi-step', 'fw:substitution', 'fw:subtract'], diff: 16.5,
    talk: (q) => ({
      steps: [
        `${cap(q({ A: 1 }))} = ${q({ C: 1, B: 1 })}. Put that into the scale with ${q({ C: 2 })}: ${q({ C: 2 })} = ${q({ C: 1, B: 2 })}, so ${q({ C: 1 })} = ${q({ B: 2 })}.`,
        `Then ${q({ A: 1 })} = 2 + 1 = ${q({ B: 3 })}.`,
        `${cap(q({ D: 1 }))} = ${q({ A: 1, C: 1 })} = 3 + 2 = ${q({ B: 5 })}, so ${q({ D: 1, B: 1 })} = 5 + 1 = ${q({ B: 6 })}.`,
        `${cap(q({ A: 2 }))} = 3 + 3 = ${q({ B: 6 })} too.`,
      ],
      explanation: `Worth in ${plural(q, 'B')}: ${q({ C: 1 })} is 2, ${q({ A: 1 })} is 3, ${q({ D: 1 })} is 5. So ${q({ D: 1, B: 1 })} is 6, the same as ${q({ A: 2 })}.`,
      hint: `Find what ${q({ C: 1 })} is worth in ${plural(q, 'B')} first — you will need two scales together.`,
    }),
  })),
];

export const TEMPLATE_IDS = TEMPLATES.map((t) => t.id);

// names helpers (the namer `q` is built per item from its shapes)
function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
type Q = (b: Bag) => string;
const NAMES = new WeakMap<Q, Record<L, ShapeKind>>();
function name(q: Q, l: L) { return SHAPE_NAMES[NAMES.get(q)![l]]; }
function plural(q: Q, l: L) { return `${name(q, l)}s`; }

function makeNamer(kinds: Record<L, ShapeKind>): Q {
  const q: Q = (b) => {
    const parts = LETTERS.filter((l) => b[l]).map((l) => `${b[l]} ${SHAPE_NAMES[kinds[l]]}${b[l] === 1 ? '' : 's'}`);
    return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  };
  NAMES.set(q, kinds);
  return q;
}

// ---------- generate ----------

const FW_SHAPES: ShapeKind[] = ['circle', 'square', 'triangle', 'star', 'hexagon', 'diamond', 'heart'];
/**
 * Colour-blind-safe palette (format study §E): red, blue, yellow and black only — no red–green or
 * green–orange pairs. Colour is never the only cue anyway: every shape type in an item also has its
 * own outline (circle, star, heart…), so two weights always differ in shape AND colour.
 */
export const FW_COLORS: readonly ShapeColor[] = ['red', 'blue', 'yellow', 'black'];
const MAX_PAN = 8;

export function pickTemplate(difficulty: number, rng: Rng): Template {
  const d = Math.max(3, Math.min(18, difficulty));
  const best = Math.min(...TEMPLATES.map((t) => Math.abs(t.diff - d)));
  return rng.pick(TEMPLATES.filter((t) => Math.abs(t.diff - d) <= best + 0.5));
}

function lettersIn(plan: Plan): L[] {
  const used = new Set<L>();
  const add = (b: Bag) => LETTERS.forEach((l) => b[l] && used.add(l));
  plan.refs.forEach(([a, b]) => { add(a); add(b); });
  add(plan.target);
  add(plan.answer);
  return LETTERS.filter((l) => used.has(l));
}

function distractorPool(answer: Side, target: Side, refs: Scale[], k: number): { near: Side[]; far: Side[] } {
  const near: Side[] = [];
  const far: Side[] = [];
  const set = (s: Side, i: number, v: number) => s.map((x, j) => (j === i ? v : x));
  for (let i = 0; i < k; i++) {
    if (answer[i] > 0) {
      near.push(set(answer, i, answer[i] - 1), set(answer, i, answer[i] + 1));
      for (let j = 0; j < k; j++) {
        if (j !== i && answer[j] === 0) far.push(set(set(answer, i, 0), j, answer[i]));
      }
    } else {
      near.push(set(answer, i, 1));
    }
  }
  // the right-hand sides of shown scales ("stopped one step too early"), target-shaped look-alikes
  for (const r of refs) far.push(r.left, r.right);
  const main = answer.indexOf(Math.max(...answer));
  for (let c = 1; c <= 7; c++) far.push(answer.map((_, j) => (j === main ? c : 0)));
  for (let i = 0; i < k; i++) if (target[i] > 0) far.push(set(target, i, target[i] + 1));
  return { near, far };
}

/** The same instruction on every item (format study §B). */
export const FW_STEM = 'Which one keeps the scale level?';

export function generate(req: GenerateRequest): Item<FwPayload> {
  const rng = createRng(req.seed);
  const tpl = pickTemplate(req.difficulty, rng);
  for (let attempt = 0; attempt < 30; attempt++) {
    const plan = tpl.build(rng);
    const used = lettersIn(plan);
    const k = used.length;
    const kinds = rng.sample(FW_SHAPES, k);
    const colors = rng.sample(FW_COLORS as ShapeColor[], k);
    const toSide = (b: Bag): Side => used.map((l) => b[l] ?? 0);
    const refs: Scale[] = plan.refs.map(([a, b]) => (rng.chance(0.5) ? { left: toSide(a), right: toSide(b) } : { left: toSide(b), right: toSide(a) }));
    const target = toSide(plan.target);
    const answer = toSide(plan.answer);
    const weights = used.map((l) => plan.w[l]!);

    const ws = consistentWeights(k, refs);
    if (!ws.some((w) => w.every((x, i) => x === weights[i]))) continue;
    if (!balancesAlways(ws, answer, target)) continue;

    const ok = (s: Side, chosen: Side[]) =>
      s.every((x) => x >= 0) && pieces(s) >= 1 && pieces(s) <= MAX_PAN &&
      !sameSide(s, answer) && !sameSide(s, target) && !chosen.some((c) => sameSide(c, s)) &&
      !balancesSometimes(ws, s, target);
    const { near, far } = distractorPool(answer, target, refs, k);
    // Extra heavier candidates so the answer isn't always among the lighter options.
    const bump = (s: Side, i: number, by: number) => s.map((x, j) => (j === i ? x + by : x));
    const heavy: Side[] = [];
    for (let i = 0; i < k; i++) heavy.push(bump(answer, i, 1), bump(answer, i, 2), bump(target, i, 1));
    // Anti-shortcut: pick where the answer sits in weight order at random (lightest … heaviest),
    // then choose distractors around it — so "skip the heavy-looking ones" never pays off.
    const aw = weightOf(answer, weights);
    const nearSet = new Set(near.map((s) => s.join()));
    const byNearFirst = (xs: Side[]) => [...rng.shuffle(xs.filter((s) => nearSet.has(s.join()))), ...rng.shuffle(xs.filter((s) => !nearSet.has(s.join())))];
    const pool = [...near, ...far, ...heavy].filter((s, i, all) => all.findIndex((t) => sameSide(t, s)) === i && ok(s, []));
    const lighter = byNearFirst(pool.filter((s) => weightOf(s, weights) < aw));
    const heavier = byNearFirst(pool.filter((s) => weightOf(s, weights) > aw));
    let nLight = rng.int(0, 4);
    if (4 - nLight > heavier.length) nLight = 4 - heavier.length;
    const ds: Side[] = [];
    if (nLight <= lighter.length) {
      for (const s of lighter) if (ds.length < nLight && ok(s, ds)) ds.push(s);
      for (const s of heavier) if (ds.length < 4 && ok(s, ds)) ds.push(s);
    }
    // Late attempts: tiny items may not have enough options on one side — take any valid ones.
    if (ds.length < 4 && attempt >= 15) for (const s of [...lighter, ...heavier]) if (ds.length < 4 && ok(s, ds)) ds.push(s);
    if (ds.length < 4) continue;

    const options = rng.shuffle([answer, ...ds]);
    const ansIdx = options.findIndex((o) => sameSide(o, answer));
    const kindsByLetter = Object.fromEntries(used.map((l, i) => [l, kinds[i]])) as Record<L, ShapeKind>;
    const q = makeNamer(kindsByLetter);
    const talk = plan.talk(q);
    const limit = plan.diff < 9 ? 20 : 30;
    return {
      id: `FW:${tpl.id}:${req.seed}`,
      subtest: 'FW',
      difficulty: plan.diff,
      seed: req.seed,
      payload: {
        template: tpl.id,
        shapes: kinds.map((kind, i) => ({ kind, color: colors[i] })),
        weights, refs, target, options, answer: ansIdx,
      },
      maxPoints: 1,
      timeLimitSec: limit,
      // "Do you have an answer?" 10 s before the limit, like the real test
      promptAtSec: limit - 10,
      skills: plan.skills,
      hints: [
        'A level scale means both sides weigh exactly the same.',
        talk.hint,
        talk.steps[0],
      ],
      explanation: talk.explanation,
      steps: talk.steps,
      speak: FW_STEM,
    };
  }
  throw new Error(`FW: could not build ${tpl.id} for seed ${req.seed}`);
}

// ---------- score ----------

export function score(item: Item<FwPayload>, response: FwResponse | null): ScoreOutcome {
  const p = item.payload;
  const meta = { scales: p.refs.length };
  if (response === null || response === undefined) return { points: 0, correct: false, meta };
  const correct = response === p.answer;
  let feedback: string | undefined;
  const chosen = p.options[response];
  if (!correct && chosen) {
    const diff = weightOf(chosen, p.weights) - weightOf(p.target, p.weights);
    feedback = diff > 0
      ? 'That side would be too heavy — the scale would tip down on the right.'
      : 'That side would be too light — the scale would tip down on the left.';
  }
  return { points: correct ? 1 : 0, correct, meta, feedback };
}

// ---------- drawing ----------

function expand(side: Side): number[] {
  const out: number[] = [];
  side.forEach((n, i) => { for (let j = 0; j < n; j++) out.push(i); });
  return out;
}

function describeSide(side: Side, shapes: FwShape[]): string {
  const parts = side.map((n, i) => (n ? `${n} ${SHAPE_NAMES[shapes[i].kind]}${n === 1 ? '' : 's'}` : '')).filter(Boolean);
  return parts.join(' and ') || 'nothing';
}

function PanPieces({ side, shapes, cx }: { side: Side; shapes: FwShape[]; cx: number }) {
  const list = expand(side);
  const perRow = 4;
  const size = 23;
  return (
    <g>
      {list.map((s, i) => {
        const row = Math.floor(i / perRow);
        const inRow = Math.min(perRow, list.length - row * perRow);
        const col = i % perRow;
        const x = cx + (col - (inRow - 1) / 2) * 25 - size / 2;
        const y = 106 - row * 25 - size;
        return (
          <svg key={i} x={x} y={y} width={size} height={size} viewBox="0 0 100 100">
            <ShapeGlyph spec={{ kind: shapes[s].kind, color: shapes[s].color, fill: 'solid', scale: 0.92 }} strokeWidth={6 * 0.92} />
          </svg>
        );
      })}
    </g>
  );
}

function ScaleView({ left, right, shapes, question, glow, label }: {
  left: Side; right: Side | null; shapes: FwShape[]; question?: boolean; glow?: boolean; label: string;
}) {
  const pan = (cx: number) => (
    <g>
      <line x1={cx} y1={38} x2={cx - 50} y2={112} stroke="#1d2b2a" strokeWidth={2} />
      <line x1={cx} y1={38} x2={cx + 50} y2={112} stroke="#1d2b2a" strokeWidth={2} />
      <path d={`M${cx - 56} 110 Q${cx} 134 ${cx + 56} 110 Z`} fill="#fffdf6" stroke="#1d2b2a" strokeWidth={3} strokeLinejoin="round" />
    </g>
  );
  return (
    <svg viewBox="0 0 300 160" width="100%" role="img" aria-label={label}
      style={{ display: 'block', borderRadius: 14, background: glow ? 'var(--warn-bg)' : 'transparent', boxShadow: glow ? '0 0 0 4px var(--sun)' : undefined }}>
      <polygon points="118,154 182,154 166,140 134,140" fill="#2f5d50" stroke="#1d2b2a" strokeWidth={3} strokeLinejoin="round" />
      <rect x={145} y={36} width={10} height={106} fill="#2f5d50" stroke="#1d2b2a" strokeWidth={2.5} />
      {pan(72)}
      {pan(228)}
      <rect x={14} y={29} width={272} height={10} rx={5} fill="#c98b4f" stroke="#1d2b2a" strokeWidth={3} />
      <circle cx={150} cy={34} r={7} fill="#f4c542" stroke="#1d2b2a" strokeWidth={2.5} />
      <PanPieces side={left} shapes={shapes} cx={72} />
      {right && <PanPieces side={right} shapes={shapes} cx={228} />}
      {!right && question && (
        <text x={228} y={102} textAnchor="middle" fontFamily="var(--font-display)" fontWeight={800} fontSize={44} fill="#e8743b">?</text>
      )}
    </svg>
  );
}

function SideIcons({ side, shapes, size = 24 }: { side: Side; shapes: FwShape[]; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 2, justifyContent: 'center', maxWidth: size * 4 + 8 }}>
      {expand(side).map((s, i) => <Shape key={i} spec={{ kind: shapes[s].kind, color: shapes[s].color }} size={size} />)}
    </span>
  );
}

/**
 * One option's weights as a single scalable SVG (rows of 3), so the art shrinks with the tile on narrow
 * phones instead of overflowing it.
 */
const ART_COLS = 3;
function OptionArt({ side, shapes, rows }: { side: Side; shapes: FwShape[]; rows: number }) {
  const list = expand(side);
  const lastRow = Math.ceil(list.length / ART_COLS) - 1;
  return (
    <svg viewBox={`0 0 ${ART_COLS * 100} ${rows * 100}`} role="img" aria-label={describeSide(side, shapes)}
      style={{ display: 'block', width: '100%', maxWidth: 96, height: 'auto' }}>
      {list.map((s, i) => {
        const row = Math.floor(i / ART_COLS);
        const inRow = row < lastRow ? ART_COLS : list.length - row * ART_COLS;
        const col = i % ART_COLS;
        // centre each row; full rows at the bottom, like weights piled in a pan
        const x = (ART_COLS - inRow) * 50 + col * 100;
        const y = (rows - 1 - row) * 100;
        return (
          <svg key={i} x={x} y={y} width={100} height={100} viewBox="0 0 100 100">
            <ShapeGlyph spec={{ kind: shapes[s].kind, color: shapes[s].color, fill: 'solid', scale: 0.88 }} strokeWidth={5} />
          </svg>
        );
      })}
    </svg>
  );
}

/**
 * Answer options sit in ONE row of 5 at every width (like the real response page), numbered 1–5 on a
 * tab under each option. On narrow phones the row bleeds into the card padding and the gap shrinks so
 * each tile stays at least ~60 px wide (and 64 px tall); only the weights inside shrink.
 */
const ROW5_CSS = `
.fw-row5 .choice { padding: 6px 4px 20px; min-height: 64px; }
.fw-row5 .choice .letter { top: auto; bottom: 2px; left: 0; right: 0; text-align: center; font-size: 0.85rem; color: var(--ink); }
@media (max-width: 420px) {
  .fw-row5.choices { gap: 4px !important; margin-inline: -10px; }
  .fw-row5 .choice { padding: 4px 3px 18px; }
}`;

// ---------- Player ----------

export function Player({ item, onSubmit, reveal, hintLevel }: PlayerProps<FwPayload, FwResponse>) {
  const p = item.payload;
  const [selected, setSelected] = useState<number | null>(null);
  const preview = reveal ? p.options[p.answer] : selected !== null ? p.options[selected] : null;
  const glowRef = (r: Scale) => hintLevel >= 1 && !reveal && [...r.left, ...r.right].some((n, i) => n > 0 && p.target[i] > 0);
  const chosen = reveal ? reveal.response : selected;
  // every option is drawn on the same grid, so a weight is the same size in all five
  const artRows = Math.max(1, ...p.options.map((o) => Math.ceil(pieces(o) / ART_COLS)));

  return (
    <div className="stage">
      <div className="prompt">{FW_STEM}</div>

      <div style={{ display: 'grid', gap: 10, width: '100%', maxWidth: 640, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))' }}>
        {p.refs.map((r, i) => (
          <div key={i} className="card flat" style={{ padding: 6 }}>
            <ScaleView left={r.left} right={r.right} shapes={p.shapes} glow={glowRef(r)}
              label={`Balanced scale: ${describeSide(r.left, p.shapes)} on the left, ${describeSide(r.right, p.shapes)} on the right`} />
            {hintLevel >= 2 && !reveal && (
              <div className="row small" style={{ justifyContent: 'center', gap: 6 }} aria-hidden>
                <SideIcons side={r.left} shapes={p.shapes} size={18} /> <b>=</b> <SideIcons side={r.right} shapes={p.shapes} size={18} />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 8, width: '100%', maxWidth: 380, borderStyle: 'solid', background: reveal ? 'var(--good-bg)' : undefined }}>
        <ScaleView left={p.target} right={preview} shapes={p.shapes} question
          label={`Last scale: ${describeSide(p.target, p.shapes)} on the left, a question mark on the right`} />
      </div>

      {hintLevel >= 1 && !reveal && (
        <div className="hint small" role="note">👀 Start with the glowing scale{p.refs.filter(glowRef).length > 1 ? 's' : ''} — they have the same shapes as the last scale.</div>
      )}

      <div style={{ width: '100%', maxWidth: 560 }}>
        <style>{ROW5_CSS}</style>
        <ChoiceGrid
          className="fw-row5"
          options={p.options.map((o, i) => ({
            key: String(i),
            ariaLabel: `Option ${i + 1}: ${describeSide(o, p.shapes)}`,
            content: <OptionArt side={o} shapes={p.shapes} rows={artRows} />,
          }))}
          selected={selected !== null ? [String(selected)] : []}
          onSelect={(k) => setSelected(Number(k))}
          reveal={reveal ? { correctKeys: [String(p.answer)], chosenKeys: chosen !== null && chosen !== undefined ? [String(chosen)] : [] } : undefined}
          columns={5}
          numbers
        />
      </div>

      {!reveal && (
        <button type="button" className="btn go" disabled={selected === null} onClick={() => selected !== null && onSubmit(selected)}>
          Done ✓
        </button>
      )}
    </div>
  );
}

// ---------- guide ----------

export const guide: SubtestGuide = {
  kidIntro: 'Balance Scales! Each level scale is a clue: both sides weigh the same. Use the clues to find what balances the last scale.',
  howToPlay: [
    'Look at the level scales. Both sides weigh exactly the same.',
    'Look at the last scale. One side has a “?”.',
    'Tap the answer that would keep it level, then tap Done.',
  ],
  strategies: [
    { title: 'Smallest-shape money', tip: 'Pretend the smallest shape is worth 1 coin. Work out what every other shape is worth in coins, then add up each side.' },
    { title: 'Swap it out', tip: 'If a scale says 1 square = 2 circles, you can always swap a square for 2 circles (or 2 circles for a square). Keep swapping until the shapes match an answer.' },
    { title: 'Start from the question', tip: 'Look at the shapes on the last scale first, then find a clue scale that uses those same shapes. Ignore the others until you need them.' },
    { title: 'Take the same off both sides', tip: 'If both sides of a clue scale have a circle, take one off each side — it stays balanced and gets simpler.' },
    { title: 'Double the scale', tip: 'If 1 triangle = 3 stars, then 2 triangles = 6 stars. You can double (or triple) a whole scale and it stays level.' },
    { title: 'Check by weighing', tip: 'Before you tap Done, count the coins on both sides with your answer in place. Same number? Then it balances.' },
  ],
  parentNotes:
    'Figure Weights measures quantitative fluid reasoning — the logic behind early algebra: equality, substitution, and keeping both sides balanced. ' +
    'It is a core subtest of the Fluid Reasoning Index and Full Scale IQ, and also part of the Quantitative Reasoning Index. Items are timed (20 s, then 30 s for harder ones), so fluency with simple swaps matters. ' +
    'Every item here is checked by computer: the answer can be worked out from the shown scales (it is not a lucky guess), and every wrong answer is definitely too heavy or too light.',
  commonMistakes: [
    'Counting shapes instead of their weights (3 small shapes are not always heavier than 1 big one).',
    'Stopping one step early in a chain (finding squares when the answers use circles).',
    'Forgetting that a shape already on the scale still counts when you swap the others.',
    'Using a clue scale backwards or mixing up which shapes it links.',
  ],
  everydayActivities: [
    'Play with a real balance or a coat-hanger scale: how many pennies balance a toy car?',
    'Trading games: “1 big cookie = 2 small cookies; how many small cookies for 3 big ones?”',
    'Make change with coins: 1 dime = 2 nickels, 1 nickel = 5 pennies — so 1 dime = ? pennies.',
    'Seesaw talk at the playground: who needs to sit where to make it level?',
  ],
};

export const FigureWeights: SubtestModule<FwPayload, FwResponse> = {
  id: 'FW',
  generate,
  score,
  Player,
  guide,
};

export default FigureWeights;
