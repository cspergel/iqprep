/**
 * Arithmetic ("Math Stories"). Spoken word problems solved in your head. Youngest items have pictures
 * to count; later items are pure listening: adding and taking away, then times tables, money, time,
 * fractions, percents, rates and multi-step stories.
 *
 * Layout follows the DS reference module: pure generate/score at the top, Player, then guide.
 * Listening is part of the task, so the Player reads the story itself (speak with force) when the
 * child taps the big start button. Repeats follow the real rule: in test mode only the later items
 * (difficulty ≥ 9) may be heard once more; practice and tutor always allow one repeat.
 * Early picture items (difficulty < 5) are counting items, as on the real test where the child points:
 * tapping a picture puts a small number badge on it (1, 2, 3…) — a counting scaffold only; the answer
 * is still entered on the keypad.
 */
import { useEffect, useRef, useState } from 'react';
import { createRng, type Rng } from '../../core/rng';
import { stopSpeaking, speechSupported } from '../../core/speech';
import type { GenerateRequest, Item, Mode, PlayerProps, ScoreOutcome, SubtestGuide, SubtestModule } from '../../core/types';
import { NumberPad, PipSays } from '../../ui/kit';

export interface ArPictureGroup { emoji: string; count: number; crossed?: number; label?: string }
export interface ArPictures { layout: 'count' | 'add' | 'take' | 'compare'; groups: ArPictureGroup[] }
export interface ArPayload {
  template: string;
  text: string;
  answer: number;
  /** Optional unit shown next to the entry box, e.g. "dollars". */
  unit?: string;
  pictures?: ArPictures;
  /** Results of earlier steps — a child who stops there gets a "one more step" nudge. */
  partials?: number[];
}
export type ArResponse = number;

// ---------- story ingredients ----------

interface Thing { one: string; many: string; e: string; where: string }
const PETS: Thing[] = [
  { one: 'puppy', many: 'puppies', e: '🐶', where: 'at the park' },
  { one: 'kitten', many: 'kittens', e: '🐱', where: 'in the basket' },
  { one: 'fish', many: 'fish', e: '🐟', where: 'in the tank' },
  { one: 'bunny', many: 'bunnies', e: '🐰', where: 'in the garden' },
  { one: 'turtle', many: 'turtles', e: '🐢', where: 'on the log' },
  { one: 'duck', many: 'ducks', e: '🦆', where: 'on the pond' },
  { one: 'frog', many: 'frogs', e: '🐸', where: 'on the lily pads' },
];
const SNACKS: Thing[] = [
  { one: 'apple', many: 'apples', e: '🍎', where: 'in the bowl' },
  { one: 'cookie', many: 'cookies', e: '🍪', where: 'on the plate' },
  { one: 'strawberry', many: 'strawberries', e: '🍓', where: 'in the box' },
  { one: 'banana', many: 'bananas', e: '🍌', where: 'in the lunch bag' },
  { one: 'cupcake', many: 'cupcakes', e: '🧁', where: 'on the tray' },
  { one: 'carrot', many: 'carrots', e: '🥕', where: 'in the garden' },
  { one: 'orange', many: 'oranges', e: '🍊', where: 'in the basket' },
];
const TOYS: Thing[] = [
  { one: 'teddy bear', many: 'teddy bears', e: '🧸', where: 'on the shelf' },
  { one: 'toy car', many: 'toy cars', e: '🚗', where: 'on the rug' },
  { one: 'balloon', many: 'balloons', e: '🎈', where: 'at the party' },
  { one: 'robot', many: 'robots', e: '🤖', where: 'in the toy box' },
  { one: 'kite', many: 'kites', e: '🪁', where: 'in the sky' },
];
const SPORTS: Thing[] = [
  { one: 'soccer ball', many: 'soccer balls', e: '⚽', where: 'on the field' },
  { one: 'basketball', many: 'basketballs', e: '🏀', where: 'in the gym' },
  { one: 'baseball', many: 'baseballs', e: '⚾', where: 'in the bucket' },
  { one: 'medal', many: 'medals', e: '🏅', where: 'on the table' },
];
const CAMP: Thing[] = [
  { one: 'tent', many: 'tents', e: '⛺', where: 'at camp' },
  { one: 'canoe', many: 'canoes', e: '🛶', where: 'by the lake' },
  { one: 'acorn', many: 'acorns', e: '🌰', where: 'under the tree' },
  { one: 'butterfly', many: 'butterflies', e: '🦋', where: 'by the flowers' },
  { one: 'ladybug', many: 'ladybugs', e: '🐞', where: 'on the leaf' },
  { one: 'star', many: 'stars', e: '⭐', where: 'in the sky' },
];
const ALL_THINGS = [...PETS, ...SNACKS, ...TOYS, ...SPORTS, ...CAMP];
const COLLECTIBLES = ['stickers', 'marbles', 'trading cards', 'shells', 'stamps', 'beads', 'crayons', 'rocks'];
const BUYABLES = ['kite', 'toy truck', 'book', 'puzzle', 'yo-yo', 'jump rope', 'water bottle', 'paint set'];
const NAMES = [
  'Mia', 'Leo', 'Ava', 'Noah', 'Zara', 'Omar', 'Lily', 'Kai', 'Priya', 'Mateo', 'Ella', 'Jamal', 'Sofia', 'Ben', 'Aisha',
  'Hugo', 'Nora', 'Theo', 'Maya', 'Sam', 'Ivy', 'Raj', 'Lucy', 'Eli', 'Rosa', 'Finn', 'Hana', 'Diego', 'Chloe', 'Amir',
];

const pl = (n: number, t: Thing) => `${n} ${n === 1 ? t.one : t.many}`;
const goes = (n: number) => (n === 1 ? 'goes' : 'go');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pad2 = (n: number) => String(n).padStart(2, '0');

interface Built {
  text: string;
  answer: number;
  skills: string[];
  explanation: string;
  steps?: string[];
  hint: string;
  unit?: string;
  pictures?: ArPictures;
  partials?: number[];
}
interface Template { id: string; diff: number; build: (rng: Rng) => Built }
const T = (id: string, diff: number, build: (rng: Rng) => Built): Template => ({ id, diff, build });

function countTemplate(lo: number, hi: number) {
  return (rng: Rng): Built => {
    const t = rng.pick(ALL_THINGS.filter((x) => x.one !== x.many));
    const n = rng.int(lo, hi);
    return {
      text: rng.pick([`How many ${t.many} do you see?`, `Count the ${t.many}. How many are there?`, `Look ${t.where}! How many ${t.many} are there?`]),
      answer: n,
      skills: ['ar:count'],
      explanation: `Touch each one as you count. There are ${n} ${t.many}.`,
      hint: 'Point to each picture and say one number for each — don’t skip or count one twice!',
      pictures: { layout: 'count', groups: [{ emoji: t.e, count: n }] },
    };
  };
}

const FRACTION_WORD: Record<number, string> = { 2: 'half', 3: 'one third', 4: 'one quarter', 5: 'one fifth' };

const TEMPLATES: Template[] = [
  // ---- picture items (about ages 4–6) ----
  T('count-a', 3.5, countTemplate(2, 4)),
  T('count-b', 4, countTemplate(5, 7)),
  T('count-c', 4.5, countTemplate(8, 10)),
  T('add-pic', 5, (rng) => {
    const t = rng.pick(ALL_THINGS);
    const a = rng.int(1, 4);
    const b = rng.int(2, 3);
    const N = rng.pick(NAMES);
    const seq = Array.from({ length: b }, (_, i) => a + i + 1).join(', ');
    return {
      text: rng.pick([
        `${N} has ${pl(a, t)}. ${N} gets ${b} more. How many ${t.many} does ${N} have now?`,
        `There ${a === 1 ? 'is' : 'are'} ${pl(a, t)} ${t.where}. ${b} more come. How many ${t.many} are there in all?`,
      ]),
      answer: a + b, skills: ['ar:add'],
      explanation: `Start at ${a} and count on ${b} more: ${seq}. So ${a} + ${b} = ${a + b}.`,
      hint: `Start with ${a} in your head, then count on ${b} more.`,
      pictures: { layout: 'add', groups: [{ emoji: t.e, count: a }, { emoji: t.e, count: b }] },
    };
  }),
  T('take-pic', 5.5, (rng) => {
    const t = rng.pick([...PETS, ...CAMP.filter((x) => x.one === 'butterfly' || x.one === 'ladybug'), ...SNACKS]);
    const isSnack = SNACKS.includes(t);
    const a = rng.int(4, 8);
    const b = rng.int(1, 3);
    const N = rng.pick(NAMES);
    return {
      text: isSnack
        ? `${N} has ${pl(a, t)}. ${N} eats ${b}. How many ${t.many} are left?`
        : `There are ${pl(a, t)} ${t.where}. ${b} ${goes(b)} away. How many ${t.many} are left?`,
      answer: a - b, skills: ['ar:subtract'],
      explanation: `Cover up the ${b} that ${isSnack ? 'got eaten' : 'went away'} and count the rest: ${a} − ${b} = ${a - b}.`,
      hint: `Start at ${a} and count back ${b}.`,
      pictures: { layout: 'take', groups: [{ emoji: t.e, count: a, crossed: b }] },
    };
  }),
  T('compare-pic', 6, (rng) => {
    const [t1, t2] = rng.sample(ALL_THINGS.filter((x) => x.one !== x.many), 2);
    const a = rng.int(4, 7);
    const b = rng.int(2, a - 1);
    return {
      text: `How many more ${t1.many} than ${t2.many} are there?`,
      answer: a - b, skills: ['ar:subtract', 'ar:compare'],
      explanation: `Match each ${t2.one} with a ${t1.one}. The ${t1.many} left without a partner are the extra ones: ${a} − ${b} = ${a - b}.`,
      steps: [`Count the ${t1.many}: ${a}. Count the ${t2.many}: ${b}.`, `Line them up in two rows, like two bars. The longer row sticks out by ${a} − ${b} = ${a - b}.`],
      hint: 'Pair them up one by one. How many have no partner?',
      pictures: { layout: 'compare', groups: [{ emoji: t1.e, count: a, label: t1.many }, { emoji: t2.e, count: b, label: t2.many }] },
    };
  }),
  // ---- listening only: within 20 (about ages 6–8) ----
  T('add-10', 6.5, (rng) => {
    const a = rng.int(2, 6);
    const b = rng.int(2, Math.min(5, 10 - a));
    const N = rng.pick(NAMES);
    const M = rng.pick(NAMES.filter((x) => x !== N));
    const thing = rng.pick(COLLECTIBLES);
    return {
      text: rng.pick([
        `${N} has ${a} ${thing}. ${M} gives ${N} ${b} more. How many ${thing} does ${N} have now?`,
        `At camp, ${a} kids are swimming and ${b} kids are fishing. How many kids is that altogether?`,
        `${N} found ${a} ${thing} in the morning and ${b} ${thing} after lunch. How many did ${N} find in all?`,
      ]),
      answer: a + b, skills: ['ar:add'],
      explanation: `Put the two groups together: ${a} + ${b} = ${a + b}.`,
      hint: `Start with the bigger number, ${Math.max(a, b)}, and count on.`,
    };
  }),
  T('add-20', 7, (rng) => {
    const a = rng.int(6, 12);
    const b = rng.int(Math.max(3, 11 - a), Math.min(9, 20 - a));
    const N = rng.pick(NAMES);
    const t = rng.pick([...SNACKS, ...CAMP, ...SPORTS]);
    const s = a + b;
    const toTen = 10 - a;
    return {
      text: rng.pick([
        `${N} picked ${pl(a, t)}. Then ${N} picked ${b} more. How many ${t.many} did ${N} pick?`,
        `There were ${pl(a, t)} ${t.where}. Then ${b} more turned up. How many ${t.many} are there now?`,
      ]),
      answer: s, skills: ['ar:add'],
      explanation: `${a} + ${b} = ${s}.`,
      steps: toTen > 0 && b > toTen
        ? [`Make a ten first: ${a} + ${toTen} = 10.`, `There are still ${b} − ${toTen} = ${b - toTen} left to add.`, `10 + ${b - toTen} = ${s}.`]
        : undefined,
      hint: toTen > 0 ? `How many more does ${a} need to make 10?` : `Add the ones: ${a} plus ${b}.`,
    };
  }),
  T('sub-20', 7.5, (rng) => {
    const a = rng.int(11, 20);
    const b = rng.int(3, Math.min(9, a - 2));
    const N = rng.pick(NAMES);
    const thing = rng.pick(COLLECTIBLES);
    const over = a - 10;
    return {
      text: rng.pick([
        `${N} had ${a} ${thing} and gave away ${b}. How many ${thing} does ${N} have left?`,
        `There were ${a} kids on the bus. At the first stop ${b} got off. How many kids are still on the bus?`,
        `${N} needs ${a} points to win a prize and already has ${b}. How many more points does ${N} need?`,
      ]),
      answer: a - b, skills: ['ar:subtract'],
      explanation: `${a} − ${b} = ${a - b}.`,
      steps: b > over && over > 0
        ? [`Take away ${over} to get down to ten: ${a} − ${over} = 10.`, `You still need to take away ${b} − ${over} = ${b - over}.`, `10 − ${b - over} = ${a - b}.`]
        : undefined,
      hint: `Count back from ${a}, or think: ${b} plus what makes ${a}?`,
    };
  }),
  T('compare-20', 7.5, (rng) => {
    const [N, M] = rng.sample(NAMES, 2);
    const a = rng.int(10, 19);
    const b = rng.int(3, a - 2);
    const thing = rng.pick(COLLECTIBLES);
    return {
      text: `${N} has ${a} ${thing}. ${M} has ${b} ${thing}. How many more ${thing} does ${N} have than ${M}?`,
      answer: a - b, skills: ['ar:subtract', 'ar:compare'],
      explanation: `“How many more” means find the difference: ${a} − ${b} = ${a - b}.`,
      steps: [
        `Draw a bar for ${N}: ${a} long. Under it, draw a shorter bar for ${M}: ${b} long.`,
        `The extra piece sticking out of ${N}’s bar is the answer.`,
        `${a} − ${b} = ${a - b}.`,
      ],
      hint: 'Picture two bars, one longer. How much longer is it?',
    };
  }),
  // ---- two steps, times tables, money and time (about ages 8–10) ----
  T('two-step', 8, (rng) => {
    const a = rng.int(5, 12);
    const b = rng.int(2, 8);
    const c = rng.int(2, a + b - 2);
    const mid = a + b;
    const story = rng.pick([
      { who: 'kids', where: 'at the campfire', came: 'more came', left: 'went to bed' },
      { who: 'birds', where: 'in the tree', came: 'more landed', left: 'flew away' },
      { who: 'players', where: 'on the field', came: 'more joined', left: 'went home' },
    ]);
    return {
      text: `There were ${a} ${story.who} ${story.where}. ${b} ${story.came}, then ${c} ${story.left}. How many ${story.who} are ${story.where} now?`,
      answer: mid - c, skills: ['ar:two-step', 'ar:add', 'ar:subtract'],
      explanation: `First add, then take away: ${a} + ${b} = ${mid}, and ${mid} − ${c} = ${mid - c}.`,
      steps: [
        `Draw a bar for the ${a} ${story.who}. Stick on a piece for the ${b} who came: ${a} + ${b} = ${mid}.`,
        `Cut a piece of ${c} off the end for the ones who left: ${mid} − ${c} = ${mid - c}.`,
      ],
      hint: 'Do one step at a time: first the ones who came, then the ones who left.',
      partials: [mid],
    };
  }),
  T('missing-start', 8.5, (rng) => {
    const start = rng.int(4, 12);
    const b = rng.int(3, 8);
    const t = start + b;
    const N = rng.pick(NAMES);
    const thing = rng.pick(COLLECTIBLES);
    return {
      text: rng.pick([
        `Some ducks were on the pond. ${b} more ducks landed. Now there are ${t} ducks. How many ducks were on the pond at the start?`,
        `${N} had some ${thing}. A friend gave ${N} ${b} more. Now ${N} has ${t}. How many ${thing} did ${N} have at first?`,
      ]),
      answer: start, skills: ['ar:subtract', 'ar:missing-part'],
      explanation: `The whole is ${t} and one part is ${b}, so the other part is ${t} − ${b} = ${start}.`,
      steps: [`Draw one long bar for all ${t}. Split it into two parts: the ${b} that came later, and the mystery part from the start.`, `Mystery part = ${t} − ${b} = ${start}.`],
      hint: 'You know the total and one part. How do you find the other part?',
    };
  }),
  T('time-hours', 8.5, (rng) => {
    const s = rng.int(1, 8);
    const d = rng.int(2, Math.min(4, 12 - s));
    const what = rng.pick(['hike', 'soccer camp', 'birthday party', 'boat trip', 'art class']);
    return {
      text: `The ${what} starts at ${s} o'clock and lasts ${d} hours. At what o'clock does it end?`,
      answer: s + d, unit: "o'clock", skills: ['ar:time', 'ar:add'],
      explanation: `Count on ${d} hours from ${s}: ${s} + ${d} = ${s + d}, so it ends at ${s + d} o'clock.`,
      hint: `Picture the clock's short hand at ${s}. Move it ${d} hours forward.`,
    };
  }),
  T('money-change', 8.5, (rng) => {
    const have = rng.pick([10, 15, 20]);
    const cost = rng.int(3, have - 2);
    const N = rng.pick(NAMES);
    const item = rng.pick(BUYABLES);
    return {
      text: `${N} has ${have} dollars. A ${item} costs ${cost} dollars. How many dollars will ${N} have left after buying it?`,
      answer: have - cost, unit: 'dollars', skills: ['ar:money', 'ar:subtract'],
      explanation: `${have} − ${cost} = ${have - cost} dollars left.`,
      steps: [`Count up from the price to what ${N} has: from ${cost} to ${have}.`, `${cost} + ${have - cost} = ${have}, so ${have - cost} dollars are left.`],
      hint: `Count up from ${cost} to ${have}, like a shopkeeper giving change.`,
    };
  }),
  T('equal-groups', 8.5, (rng) => {
    const g = rng.int(2, 4);
    const n = rng.int(2, 5);
    const story = rng.pick([
      { text: `There are ${g} tents at camp. ${n} campers sleep in each tent. How many campers are there?`, what: 'campers' },
      { text: `${rng.pick(NAMES)} has ${g} bags with ${n} marbles in each bag. How many marbles is that?`, what: 'marbles' },
      { text: `There are ${g} canoes on the lake with ${n} kids in each canoe. How many kids are in the canoes?`, what: 'kids' },
    ]);
    const steps: string[] = [];
    let run = n;
    for (let i = 1; i < g; i++) {
      steps.push(`${run} + ${n} = ${run + n}`);
      run += n;
    }
    return {
      text: story.text,
      answer: g * n, skills: ['ar:multiply'],
      explanation: `${g} groups of ${n}: ${g} × ${n} = ${g * n} ${story.what}.`,
      steps: [`Add ${n} for each group:`, ...steps],
      hint: `Count by ${n}s, ${g} times.`,
    };
  }),
  T('share', 9, (rng) => {
    const k = rng.int(2, 6);
    const q = rng.int(2, 9);
    const total = k * q;
    const t = rng.pick([...SNACKS, ...SPORTS.filter((x) => x.one !== 'medal')]);
    return {
      text: rng.pick([
        `${total} ${t.many} are shared equally among ${k} friends. How many ${t.many} does each friend get?`,
        `A coach puts ${total} ${t.many} into ${k} equal piles. How many ${t.many} are in each pile?`,
      ]),
      answer: q, skills: ['ar:divide'],
      explanation: `${total} ÷ ${k} = ${q}, because ${k} × ${q} = ${total}.`,
      hint: `Think of times tables: ${k} times what number makes ${total}?`,
    };
  }),
  T('mult-facts', 9.5, (rng) => {
    const n = rng.int(6, 9);
    const g = rng.int(3, 9);
    const N = rng.pick(NAMES);
    const thing = rng.pick(['stickers', 'crayons', 'trading cards', 'pencils', 'juice boxes']);
    const p = g * n;
    return {
      text: `Each pack has ${n} ${thing}. ${N} buys ${g} packs. How many ${thing} is that?`,
      answer: p, skills: ['ar:multiply'],
      explanation: `${g} packs of ${n}: ${g} × ${n} = ${p}.`,
      steps: [`Split ${n} into 5 and ${n - 5}.`, `${g} × 5 = ${g * 5}`, `${g} × ${n - 5} = ${g * (n - 5)}`, `${g * 5} + ${g * (n - 5)} = ${p}`],
      hint: `Do ${g} × 5 first, then add the rest.`,
    };
  }),
  T('money-cents', 9.5, (rng) => {
    if (rng.chance(0.5)) {
      const c = rng.pick([15, 20, 25, 30, 35, 45]);
      const k = rng.int(2, 4);
      const thing = rng.pick(['pencils', 'stickers', 'erasers', 'bouncy balls']);
      const steps: string[] = [];
      let run = c;
      for (let i = 1; i < k; i++) {
        steps.push(`${run} + ${c} = ${run + c}`);
        run += c;
      }
      return {
        text: `${cap(thing)} cost ${c} cents each. How many cents do ${k} ${thing} cost?`,
        answer: c * k, unit: 'cents', skills: ['ar:money', 'ar:multiply'],
        explanation: `${k} × ${c} = ${c * k} cents.`,
        steps,
        hint: `Add ${c} cents ${k} times.`,
      };
    }
    const c = rng.pick([35, 45, 55, 65, 70, 85]);
    const snack = rng.pick(['juice box', 'granola bar', 'apple', 'popsicle']);
    return {
      text: `A ${snack} costs ${c} cents. You pay with 1 dollar. How many cents do you get back?`,
      answer: 100 - c, unit: 'cents', skills: ['ar:money', 'ar:subtract'],
      explanation: `1 dollar is 100 cents, and 100 − ${c} = ${100 - c} cents change.`,
      steps: ['1 dollar = 100 cents.', `Count up from ${c} to 100: ${c} + ${100 - c} = 100.`],
      hint: `1 dollar is 100 cents. How far is it from ${c} up to 100?`,
    };
  }),
  T('time-minutes', 10, (rng) => {
    const h = rng.int(1, 11);
    const m1 = rng.int(1, 6) * 5;
    const d = rng.int(3, Math.min(8, (55 - m1) / 5)) * 5;
    const m2 = m1 + d;
    const what = rng.pick(['bus ride', 'swim lesson', 'movie trailer show', 'nature walk', 'piano lesson']);
    return {
      text: `The ${what} started at ${h}:${pad2(m1)} and ended at ${h}:${pad2(m2)}. How many minutes did it last?`,
      answer: d, unit: 'minutes', skills: ['ar:time', 'ar:subtract'],
      explanation: `Both times are in the same hour, so subtract the minutes: ${m2} − ${m1} = ${d} minutes.`,
      steps: [`From ${h}:${pad2(m1)} to ${h}:${pad2(m2)} is the same hour.`, `${m2} − ${m1} = ${d}`],
      hint: 'Look at the minutes only. How far is it from the first to the second?',
    };
  }),
  T('multi-step-mult', 10.5, (rng) => {
    const g = rng.int(3, 6);
    const n = rng.int(4, 8);
    const p = g * n;
    const e = rng.int(3, Math.min(12, p - 2));
    return {
      text: `The camp cook has ${g} boxes with ${n} muffins in each box. The campers eat ${e} muffins. How many muffins are left?`,
      answer: p - e, skills: ['ar:two-step', 'ar:multiply', 'ar:subtract'],
      explanation: `First find all the muffins, then take away the eaten ones: ${g} × ${n} = ${p}, and ${p} − ${e} = ${p - e}.`,
      steps: [`Draw ${g} equal boxes with ${n} in each: ${g} × ${n} = ${p} muffins.`, `Cut ${e} off the total bar: ${p} − ${e} = ${p - e}.`],
      hint: 'Step 1: how many muffins were there at the start?',
      partials: [p],
    };
  }),
  // ---- fractions, rates, percents, multi-step reasoning (about ages 11–16+) ----
  T('div-ceil', 11, (rng) => {
    const c = rng.int(3, 5);
    let t = rng.int(10, 30);
    if (t % c === 0) t += 1;
    const q = Math.floor(t / c);
    const r = t - q * c;
    return {
      text: `${t} campers are going canoeing. Each canoe holds ${c} campers. How many canoes do they need so that everyone can go?`,
      answer: q + 1, skills: ['ar:divide', 'ar:two-step'],
      explanation: `${q} canoes are not quite enough — ${r} camper${r === 1 ? ' is' : 's are'} left on the shore — so they need ${q + 1}.`,
      steps: [`${q} canoes hold ${q} × ${c} = ${q * c} campers.`, `${t} − ${q * c} = ${r} campers still need a seat.`, `One more canoe: ${q} + 1 = ${q + 1}.`],
      hint: 'Fill the canoes one at a time. What happens to the campers left over?',
      partials: [q],
    };
  }),
  T('fraction-unit', 11, (rng) => {
    const d = rng.int(2, 5);
    const k = rng.int(3, 10);
    const t = d * k;
    const what = rng.pick(['campers', 'kids in the class', 'apples in the crate', 'pages in the comic']);
    const verb = what === 'campers' ? 'go swimming' : what === 'kids in the class' ? 'walk to school' : what.startsWith('apples') ? 'are green' : 'have pictures';
    return {
      text: `There are ${t} ${what}. ${cap(FRACTION_WORD[d])} of them ${verb}. How many is that?`,
      answer: k, skills: ['ar:fraction', 'ar:divide'],
      explanation: `${cap(FRACTION_WORD[d])} means split into ${d} equal groups: ${t} ÷ ${d} = ${k}.`,
      hint: `Share ${t} into ${d} equal groups. How many in one group?`,
    };
  }),
  T('rate', 11.5, (rng) => {
    const r = rng.int(6, 15);
    const h = rng.int(2, 5);
    const story = rng.pick([
      { text: `A bike rider goes ${r} miles every hour. How many miles does the rider go in ${h} hours?`, unit: 'miles' },
      { text: `A machine makes ${r} toys every minute. How many toys does it make in ${h} minutes?`, unit: 'toys' },
      { text: `${rng.pick(NAMES)} reads ${r} pages each day. How many pages is that in ${h} days?`, unit: 'pages' },
    ]);
    return {
      text: story.text,
      answer: r * h, unit: story.unit, skills: ['ar:rate', 'ar:multiply'],
      explanation: `The same amount each time, ${h} times: ${r} × ${h} = ${r * h} ${story.unit}.`,
      hint: `It's ${r} for every 1. How many for ${h}?`,
    };
  }),
  T('money-multi', 12, (rng) => {
    const p = rng.int(2, 4);
    const k = rng.int(2, 4);
    const tot = p * k;
    const bill = tot < 10 && rng.chance(0.5) ? 10 : 20;
    const N = rng.pick(NAMES);
    const what = rng.pick([['Lemonade', 'cup', 'cups'], ['A snow cone', 'cone', 'cones'], ['A smoothie', 'cup', 'cups']]);
    return {
      text: `${what[0]} costs ${p} dollars a ${what[1]}. ${N} buys ${k} ${what[2]} and pays with a ${bill}-dollar bill. How many dollars of change does ${N} get?`,
      answer: bill - tot, unit: 'dollars', skills: ['ar:money', 'ar:two-step', 'ar:multiply'],
      explanation: `The ${what[2]} cost ${k} × ${p} = ${tot} dollars, so the change is ${bill} − ${tot} = ${bill - tot} dollars.`,
      steps: [`Cost: ${k} × ${p} = ${tot} dollars.`, `Change: ${bill} − ${tot} = ${bill - tot} dollars.`],
      hint: 'First find how much everything costs. Then work out the change.',
      partials: [tot],
    };
  }),
  T('fraction-nonunit', 12, (rng) => {
    const [num, den, words, part] = rng.pick([[3, 4, 'Three quarters', 'quarter'], [2, 3, 'Two thirds', 'third'], [2, 5, 'Two fifths', 'fifth'], [3, 5, 'Three fifths', 'fifth']] as const);
    const u = rng.int(3, 9);
    const t = den * u;
    const N = rng.pick(NAMES);
    const color = rng.pick(['blue', 'red', 'green', 'striped']);
    return {
      text: `${N} has ${t} marbles. ${words} of them are ${color}. How many marbles are ${color}?`,
      answer: num * u, skills: ['ar:fraction', 'ar:two-step'],
      explanation: `One ${part} of ${t} is ${u}, so ${words.toLowerCase()} is ${num} × ${u} = ${num * u}.`,
      steps: [`Draw a bar for all ${t} marbles and cut it into ${den} equal parts: ${t} ÷ ${den} = ${u} in each part.`, `Shade ${num} parts: ${num} × ${u} = ${num * u}.`],
      hint: `First find one ${part}: split ${t} into ${den} equal parts.`,
      partials: [u],
    };
  }),
  T('percent', 12.5, (rng) => {
    const [p, n, words] = rng.pick([[50, 2, 'half'], [25, 4, 'one quarter'], [10, 10, 'one tenth'], [20, 5, 'one fifth']] as const);
    const t = n * rng.int(2, 12);
    const N = rng.pick(NAMES);
    return {
      text: rng.pick([
        `A video game has ${t} levels. ${N} has finished ${p} percent of them. How many levels has ${N} finished?`,
        `There are ${t} kids at camp. ${p} percent of them are on the red team. How many kids are on the red team?`,
      ]),
      answer: t / n, skills: ['ar:percent', 'ar:divide'],
      explanation: `${p} percent is ${words} (${p} out of every 100), so ${t} ÷ ${n} = ${t / n}.`,
      hint: `${p} percent is the same as ${words}.`,
    };
  }),
  T('average', 13, (rng) => {
    let a = 0, b = 0, c = 0;
    do {
      a = rng.int(4, 15);
      b = rng.int(4, 15);
      c = rng.int(4, 15);
    } while ((a + b + c) % 3 !== 0 || (a === b && b === c));
    const s = a + b + c;
    const N = rng.pick(NAMES);
    return {
      text: `${N} scored ${a} points, ${b} points and ${c} points in three basketball games. What was ${N}'s average (mean) score?`,
      answer: s / 3, skills: ['ar:two-step', 'ar:divide', 'ar:average'],
      explanation: `Add the scores, then share the total equally over the three games: ${s} ÷ 3 = ${s / 3}.`,
      steps: [`${a} + ${b} = ${a + b}`, `${a + b} + ${c} = ${s}`, `${s} ÷ 3 = ${s / 3}`],
      hint: 'Average = add them all up, then divide by how many there are.',
      partials: [s],
    };
  }),
  T('ratio', 13.5, (rng) => {
    const [x, y] = rng.pick([[2, 3], [3, 4], [3, 5], [2, 5], [4, 5], [3, 2], [5, 2]] as const);
    const m = rng.int(2, 6);
    const X = x * m;
    return {
      text: `A bead kit has ${x} red beads for every ${y} blue beads. If there are ${X} red beads, how many blue beads are there?`,
      answer: y * m, skills: ['ar:ratio', 'ar:two-step'],
      explanation: `${X} red beads make ${m} groups of ${x}, and each group comes with ${y} blue beads: ${m} × ${y} = ${y * m}.`,
      steps: [`Group the red beads in ${x}s: ${X} ÷ ${x} = ${m} groups.`, `Each group has ${y} blue beads: ${m} × ${y} = ${y * m}.`],
      hint: `How many groups of ${x} red beads are there?`,
      partials: [m],
    };
  }),
  T('percent-off', 14, (rng) => {
    const [off, n] = rng.pick([[25, 4], [50, 2], [10, 10], [20, 5]] as const);
    const P = n * rng.int(2, 12);
    const d = P / n;
    const what = rng.pick(['skateboard', 'board game', 'pair of sneakers', 'tent']);
    return {
      text: `A ${what} costs ${P} dollars. Today it is ${off} percent off. How many dollars does it cost now?`,
      answer: P - d, unit: 'dollars', skills: ['ar:percent', 'ar:money', 'ar:two-step'],
      explanation: `${off} percent of ${P} is ${d} dollars off, so it costs ${P} − ${d} = ${P - d} dollars.`,
      steps: [`${off} percent off: ${P} ÷ ${n} = ${d} dollars off.`, `New price: ${P} − ${d} = ${P - d} dollars.`],
      hint: 'First find how many dollars come off. Then take that away from the price.',
      partials: [d],
    };
  }),
  T('rate-unit', 14.5, (rng) => {
    const u = rng.int(3, 9);
    const t = rng.int(2, 5);
    const t2 = rng.pick([6, 7, 8, 9].filter((x) => x !== t));
    const A = u * t;
    return {
      text: `A pump fills ${A} liters of water in ${t} minutes. At the same speed, how many liters does it fill in ${t2} minutes?`,
      answer: u * t2, unit: 'liters', skills: ['ar:rate', 'ar:two-step'],
      explanation: `Find one minute first: ${A} ÷ ${t} = ${u} liters a minute. Then ${u} × ${t2} = ${u * t2} liters.`,
      steps: [`One minute: ${A} ÷ ${t} = ${u} liters.`, `${t2} minutes: ${u} × ${t2} = ${u * t2} liters.`],
      hint: 'How many liters does it fill in just 1 minute?',
      partials: [u],
    };
  }),
  T('percent-increase', 15, (rng) => {
    const [p, n] = rng.pick([[10, 10], [25, 4], [50, 2], [20, 5]] as const);
    const a = n * rng.pick([4, 6, 8, 10, 12, 15, 20]);
    const d = a / n;
    return {
      text: `Last summer ${a} kids came to camp. This summer ${p} percent more kids came. How many kids came this summer?`,
      answer: a + d, skills: ['ar:percent', 'ar:two-step'],
      explanation: `${p} percent of ${a} is ${d} more kids, so ${a} + ${d} = ${a + d}.`,
      steps: [`${p} percent of ${a}: ${a} ÷ ${n} = ${d}.`, `${a} + ${d} = ${a + d}.`],
      hint: `Find ${p} percent of ${a} first, then add it on.`,
      partials: [d],
    };
  }),
  T('fraction-rest', 15.5, (rng) => {
    const [d1, d2] = rng.pick([[4, 3], [2, 3], [3, 4], [5, 2], [2, 4]] as const);
    const t = d1 * d2 * rng.int(3, 8);
    const a = t / d1;
    const r = t - a;
    const b = r / d2;
    const N = rng.pick(NAMES);
    return {
      text: `A book has ${t} pages. On Monday ${N} reads ${FRACTION_WORD[d1]} of the book. On Tuesday ${N} reads ${FRACTION_WORD[d2]} of the pages that are left. How many pages are still unread?`,
      answer: r - b, skills: ['ar:fraction', 'ar:two-step'],
      explanation: `Monday: ${a} pages, leaving ${r}. Tuesday: ${b} of those, leaving ${r - b}.`,
      steps: [`Monday: ${t} ÷ ${d1} = ${a} pages read.`, `Left: ${t} − ${a} = ${r}`, `Tuesday: ${r} ÷ ${d2} = ${b} pages read.`, `Still unread: ${r} − ${b} = ${r - b}`],
      hint: `Careful: Tuesday's fraction is of what was LEFT, not the whole book.`,
      partials: [r, b],
    };
  }),
  T('speed-half', 16, (rng) => {
    const s = rng.pick([40, 50, 60, 70, 80, 90]);
    const h = rng.int(1, 3);
    const halves = 2 * h + 1;
    const D = (s / 2) * halves;
    return {
      text: `A train travels ${D} kilometers in ${h} and a half hours, going at a steady speed. How many kilometers does it travel each hour?`,
      answer: s, unit: 'km per hour', skills: ['ar:rate', 'ar:fraction', 'ar:two-step'],
      explanation: `${h} and a half hours is ${halves} half-hours. Each half-hour it goes ${D / halves} km, so each hour it goes ${s} km.`,
      steps: [`${h} and a half hours = ${halves} half-hours.`, `${D} ÷ ${halves} = ${D / halves} km each half-hour.`, `${D / halves} × 2 = ${s} km each hour.`],
      hint: 'Count the time in half-hours instead of hours.',
      partials: [D / halves],
    };
  }),
  T('reverse-percent', 16.5, (rng) => {
    const [p, n] = rng.pick([[20, 5], [25, 4], [10, 10]] as const);
    const piece = rng.int(3, 12);
    const O = piece * n;
    const S = O - piece;
    const what = rng.pick(['jacket', 'sleeping bag', 'scooter', 'telescope']);
    return {
      text: `After ${p} percent was taken off, a ${what} costs ${S} dollars. What was the price, in dollars, before the discount?`,
      answer: O, unit: 'dollars', skills: ['ar:percent', 'ar:two-step'],
      explanation: `${S} dollars is what is left after ${p} percent comes off, so it is ${n - 1} pieces of ${p} percent. One piece is ${piece}, and the full price is ${n} pieces: ${O} dollars.`,
      steps: [
        `100 − ${p} = ${100 - p}, so ${S} dollars is ${100 - p} percent of the old price.`,
        `That is ${n - 1} pieces of ${p} percent: ${S} ÷ ${n - 1} = ${piece}`,
        `The full price is ${n} pieces: ${piece} × ${n} = ${O}`,
      ],
      hint: `${S} dollars is NOT 100 percent — it's what is left after the discount.`,
      partials: [piece],
    };
  }),
];

export const TEMPLATE_IDS = TEMPLATES.map((t) => t.id);

export function pickTemplate(difficulty: number, rng: Rng): Template {
  const d = Math.max(3, Math.min(18, difficulty));
  const best = Math.min(...TEMPLATES.map((t) => Math.abs(t.diff - d)));
  return rng.pick(TEMPLATES.filter((t) => Math.abs(t.diff - d) <= best + 0.5));
}

// ---------- generate ----------

export function generate(req: GenerateRequest): Item<ArPayload> {
  const rng = createRng(req.seed);
  const tpl = pickTemplate(req.difficulty, rng);
  const b = tpl.build(rng);
  const partials = b.partials?.filter((x) => x !== b.answer);
  return {
    id: `AR:${tpl.id}:${req.seed}`,
    subtest: 'AR',
    difficulty: tpl.diff,
    seed: req.seed,
    payload: { template: tpl.id, text: b.text, answer: b.answer, unit: b.unit, pictures: b.pictures, partials: partials?.length ? partials : undefined },
    maxPoints: 1,
    timeLimitSec: 30,
    skills: b.skills,
    hints: [
      b.pictures ? 'Look at the pictures while you listen.' : 'What is the question asking? Listen for the question word at the end.',
      b.hint,
    ],
    explanation: b.explanation,
    steps: b.steps,
    speak: 'Listen to the math story, then work out the answer in your head.',
  };
}

// ---------- score ----------

export function score(item: Item<ArPayload>, response: ArResponse | null): ScoreOutcome {
  const p = item.payload;
  const meta = { steps: Math.max(1, item.steps?.length ?? 1) };
  if (response === null || response === undefined || Number.isNaN(response)) return { points: 0, correct: false, meta };
  const correct = response === p.answer;
  let feedback: string | undefined;
  if (!correct) {
    if (p.partials?.includes(response)) feedback = 'That’s the answer to the first step — there was one more step to do!';
    else if (Math.abs(response - p.answer) === 1) feedback = 'Off by just one! Check your counting.';
  }
  return { points: correct ? 1 : 0, correct, meta, feedback };
}

// ---------- repeat rule & counting scaffold ----------

/** Difficulty from which test mode allows a repeat (the real rule: repeats only on later items). */
export const AR_REPEAT_FROM = 9;
/** Picture items below this difficulty are counting items with tap-to-count badges. */
export const AR_TAP_COUNT_BELOW = 5;

/** How many times the story may be heard AGAIN after the first reading. */
export function arRepeats(mode: Mode, difficulty: number): number {
  if (mode !== 'test') return 1;
  return difficulty >= AR_REPEAT_FROM ? 1 : 0;
}

/** True when an item's pictures are tap-to-count (a purely visual scaffold). */
export function arTapToCount(item: Item<ArPayload>): boolean {
  return !!item.payload.pictures && item.difficulty < AR_TAP_COUNT_BELOW;
}

/** Tap order → badge numbers: tapping a new picture appends it; tapping a counted one takes it (and later badges) back. */
export function nextCountOrder(order: number[], tapped: number): number[] {
  const at = order.indexOf(tapped);
  return at >= 0 ? order.slice(0, at) : [...order, tapped];
}

// ---------- Player ----------

const AR_CSS = `
.ar-count { position: relative; min-width: 56px; min-height: 56px; display: grid; place-items: center; padding: 2px;
  border: 2px dashed transparent; border-radius: 14px; background: transparent; cursor: pointer; touch-action: manipulation; }
.ar-count:focus-visible { border-color: var(--ink); }
.ar-count.on { border-color: var(--ink-soft); background: var(--card); }
.ar-badge { position: absolute; top: -4px; right: -4px; min-width: 24px; height: 24px; padding: 0 4px; border-radius: 12px;
  background: var(--sun); border: 2px solid var(--ink); font-family: var(--font-display); font-weight: 800; font-size: 14px;
  line-height: 20px; text-align: center; color: var(--ink); pointer-events: none; }
`;

function Pictures({ pics, tapCount, showCount }: {
  pics: ArPictures;
  /** Tap-to-count: each picture is a button that gets a number badge in tap order. */
  tapCount?: boolean;
  /** Reveal: number every picture 1, 2, 3… (the worked count). */
  showCount?: boolean;
}) {
  const [order, setOrder] = useState<number[]>([]);
  const emojiSize = pics.groups.reduce((s, g) => s + g.count, 0) > 8 ? 34 : 42;
  const offsets = pics.groups.map((_, gi) => pics.groups.slice(0, gi).reduce((s, g) => s + g.count, 0));
  const counting = !!(tapCount || showCount);
  const group = (g: ArPictureGroup, gi: number) => (
    <div key={gi} className="row" style={{ gap: counting ? 6 : 4, justifyContent: 'center', maxWidth: 5 * (counting ? 64 : emojiSize + 6) }}
      role={tapCount ? 'group' : 'img'}
      aria-label={`${g.count} ${g.label ?? 'pictures'}${g.crossed ? `, ${g.crossed} going away` : ''}`}>
      {Array.from({ length: g.count }, (_, i) => {
        const gone = !!g.crossed && i >= g.count - g.crossed;
        const flat = offsets[gi] + i;
        const badge = showCount ? flat + 1 : order.indexOf(flat) + 1;
        const face = (
          <>
            {g.emoji}
            {gone && <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--bad)', fontSize: emojiSize * 0.9, fontWeight: 800 }}>✕</span>}
            {badge > 0 && <span className="ar-badge" data-badge={badge}>{badge}</span>}
          </>
        );
        if (tapCount && !showCount) {
          return (
            <button key={i} type="button" className={`ar-count ${badge > 0 ? 'on' : ''}`} aria-pressed={badge > 0}
              aria-label={badge > 0 ? `Picture ${flat + 1}, counted ${badge}` : `Picture ${flat + 1}`}
              style={{ fontSize: emojiSize, lineHeight: 1.1, opacity: gone ? 0.35 : 1 }}
              onClick={() => setOrder((o) => nextCountOrder(o, flat))}>
              {face}
            </button>
          );
        }
        return (
          <span key={i} aria-hidden style={{ position: 'relative', fontSize: emojiSize, lineHeight: 1.1, opacity: gone ? 0.35 : 1, padding: counting ? 6 : 0 }}>
            {face}
          </span>
        );
      })}
    </div>
  );
  return (
    <div className="card flat tint" style={{ width: '100%', maxWidth: 520 }}>
      {counting && <style>{AR_CSS}</style>}
      {pics.layout === 'add' ? (
        <div className="row" style={{ justifyContent: 'center' }}>
          {group(pics.groups[0], 0)}
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 800 }} aria-hidden>+</span>
          {group(pics.groups[1], 1)}
        </div>
      ) : pics.layout === 'compare' ? (
        <div className="stack" style={{ alignItems: 'flex-start' }}>
          {pics.groups.map((g, gi) => (
            <div key={gi} className="row" style={{ gap: 4, flexWrap: 'nowrap' }} role="img" aria-label={`${g.count} ${g.label}`}>
              {Array.from({ length: g.count }, (_, i) => <span key={i} aria-hidden style={{ fontSize: Math.min(emojiSize, 38), lineHeight: 1.1 }}>{g.emoji}</span>)}
            </div>
          ))}
        </div>
      ) : (
        <div className="row" style={{ justifyContent: 'center' }}>{pics.groups.map(group)}</div>
      )}
      {tapCount && !showCount && (
        <div className="row small muted" style={{ justifyContent: 'center', marginTop: 6 }}>
          <span>👆 Tap each one as you count.</span>
          {order.length > 0 && (
            <button type="button" className="btn ghost small" onClick={() => setOrder([])}>↺ Count again</button>
          )}
        </div>
      )}
    </div>
  );
}

export function Player({ item, mode, onSubmit, reveal, speak }: PlayerProps<ArPayload, ArResponse>) {
  const p = item.payload;
  const [phase, setPhase] = useState<'ready' | 'story'>(reveal ? 'story' : 'ready');
  const [entry, setEntry] = useState('');
  const [plays, setPlays] = useState(0);
  const [reading, setReading] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stopSpeaking();
    };
  }, []);

  const read = async () => {
    setPhase('story');
    setPlays((n) => n + 1);
    setReading(true);
    await speak(p.text, { force: true });
    if (alive.current) setReading(false);
  };

  // Repeats: test mode only on later items (difficulty ≥ 9); practice/tutor keep one repeat.
  const canReplay = !reveal && phase === 'story' && plays < 1 + arRepeats(mode, item.difficulty) && !reading;
  const tapCount = arTapToCount(item);
  const shown = reveal ? (reveal.response === null || reveal.response === undefined ? '' : String(reveal.response)) : entry;
  const submit = () => entry.length > 0 && onSubmit(Number(entry));

  return (
    <div className="stage">
      <div className="prompt">Math Story</div>

      {phase === 'ready' && (
        <div className="stack" style={{ alignItems: 'center' }}>
          <PipSays mood="wave">I'll tell you a math story. Listen closely, then work out the answer in your head!</PipSays>
          <button type="button" className="btn primary big" onClick={read}>🔊 Read me the story</button>
        </div>
      )}

      {phase === 'story' && (
        <>
          {p.pictures && <Pictures pics={p.pictures} tapCount={tapCount} showCount={tapCount && !!reveal} />}
          {/* Like the real subtest, challenges are listening-only (text appears again with the answer). */}
          {mode === 'test' && !reveal && speechSupported() ? (
            <div className="card center" aria-live="polite" style={{ maxWidth: 620, width: '100%' }}>
              <div style={{ fontSize: 44 }} aria-hidden>{reading ? '🔊' : '👂'}</div>
              <div className="muted">{reading ? 'Listen…' : 'Work it out in your head!'}</div>
            </div>
          ) : (
            <div className="card" aria-live="polite"
              style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.25rem, 4.2vw, 1.6rem)', fontWeight: 600, lineHeight: 1.35, textAlign: 'center', maxWidth: 620, width: '100%' }}>
              {reading && <span aria-hidden>🔊 </span>}{p.text}
            </div>
          )}

          <div className="row" style={{ justifyContent: 'center' }}>
            <div className="entry" aria-label="Your answer" style={{ color: reveal ? (reveal.outcome.correct ? 'var(--good)' : 'var(--bad)') : undefined }}>
              {shown === '' && !reveal && <span className="muted small">tap the numbers</span>}
              {shown}
            </div>
            {p.unit && <span className="muted">{p.unit}</span>}
          </div>

          {reveal ? (
            <div className="card flat tint center">
              <div className="small muted">Right answer</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 800 }}>{p.answer}{p.unit ? ` ${p.unit}` : ''}</div>
            </div>
          ) : (
            <>
              <NumberPad
                onKey={(k) => setEntry((e) => (e.length < 5 ? (e === '0' ? k : e + k) : e))}
                onDelete={() => setEntry((e) => e.slice(0, -1))}
                onDone={submit}
              />
              <div className="row">
                {canReplay && <button type="button" className="btn ghost small" onClick={read}>🔁 Hear it again</button>}
                <button type="button" className="btn go" disabled={entry.length === 0} onClick={submit}>Done ✓</button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ---------- guide ----------

export const guide: SubtestGuide = {
  kidIntro: "Math Stories! I'll tell you a little story with numbers in it. Picture it in your head and find the answer — no pencil needed.",
  howToPlay: [
    'Tap “Read me the story” and listen carefully.',
    'Work out the answer in your head.',
    'Counting pictures? Tap each one as you count — it gets a little number.',
    'Tap the numbers on the keypad, then Done. On the harder stories you can hear the story one more time if you need to.',
  ],
  strategies: [
    { title: 'Make a movie', tip: 'Picture the story like a little movie: see the ducks land, the cookies get eaten. Then you know if things are joining or leaving.' },
    { title: 'Find the question word', tip: 'Listen for the end: “how many in all?” (put together), “how many left?” (take away), “how many more?” (find the difference), “each” (share or times).' },
    { title: 'Estimate first', tip: 'Before working it out, guess: should the answer be bigger or smaller than the numbers in the story? About how big? Then check your answer makes sense.' },
    { title: 'Draw a bar in your mind', tip: 'Imagine a bar for each amount. Joining? Stick bars together. Comparing? Put one bar under the other and look at the extra bit.' },
    { title: 'Use friendly numbers', tip: 'Make a ten (8 + 5 = 8 + 2 + 3 = 13), split hard numbers (7 × 6 = 5 × 6 + 2 × 6), or count up to make change.' },
    { title: 'One step at a time', tip: 'Long stories have two steps. Solve the first part, hold that number tight, then do the second part.' },
    { title: 'Hold the numbers', tip: 'Whisper the important numbers to yourself while you listen so they don’t slip away.' },
  ],
  parentNotes:
    'Arithmetic measures quantitative reasoning together with working memory: the story is heard, held in mind and solved without paper. ' +
    'It is a secondary Fluid Reasoning subtest and part of the Quantitative Reasoning and (with Digit Span) can be informative about attention and auditory working memory. ' +
    'Items here move from counting pictures to adding and taking away within 20, then times tables, money, time, fractions, percents and rates. ' +
    'As on the real test, in test mode the story can be repeated only on the later (harder) items; practice and tutor modes always allow one repeat. On the early counting items your child can tap each picture to number it — like pointing while counting. ' +
    'The best practice is lots of everyday mental math talk: estimate, explain how you got it, and use pictures or “bars” in your head.',
  commonMistakes: [
    'Grabbing the numbers and adding them without listening to what the question asks.',
    'Stopping after the first step of a two-step story.',
    'Losing a number while working — whisper it to yourself to keep it.',
    'For “how many more”, adding instead of finding the difference.',
    'Answering with the wrong unit (cents vs dollars, hours vs minutes).',
  ],
  everydayActivities: [
    'Make up story problems in the car or at dinner: “We have 6 forks and 4 people come. Do we have enough?”',
    'Let your child pay at a shop and work out the change before the cashier does.',
    'Cook together: double a recipe, or work out half of 12 cookies.',
    'Count by 2s, 5s and 10s while walking up stairs or swinging.',
    'Board games with dice and money (Monopoly Junior, shop games) build quick mental math.',
  ],
};

export const Arithmetic: SubtestModule<ArPayload, ArResponse> = {
  id: 'AR',
  generate,
  score,
  Player,
  guide,
};

export default Arithmetic;
