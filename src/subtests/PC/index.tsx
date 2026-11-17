/**
 * Picture Concepts ("Picture Pals"). Two or three rows of pictures; the child picks one picture from
 * each row so that the picks share an idea (they are all animals, they all go on your feet, they
 * all come from a cow…).
 *
 * Fairness: answers are strict members of the target tag, and the generator brute-forces every
 * one-per-row combination to make sure no other combination shares ANY tag in the bank (including
 * colours, "go-together" pairs and fuzzy ideas like "soft" or "has a handle").
 *
 * Layout follows the DS reference module: pure generate/score at the top, Player below, guide last.
 */
import { useState } from 'react';
import { createRng, type Rng } from '../../core/rng';
import type { GenerateRequest, Item, PlayerProps, ScoreOutcome, SubtestGuide, SubtestModule } from '../../core/types';
import { ChoiceGrid } from '../../ui/kit';
import { PICS, TAGS, TAG_BY_ID, TAGS_OF, type TagDef, picOf, strip } from './bank';

export interface PcPayload {
  /** Pictures (emoji) per row, in display order. */
  rows: string[][];
  /** The right picture in each row. */
  answer: string[];
  /** Tag id of the shared idea. */
  tag: string;
  /** Number of deliberate two-row "trap" links (they never reach every row). */
  links: number;
}
/** The picked picture per row (null if a row was left empty). */
export type PcResponse = (string | null)[];

// ---------- helpers ----------

const tagsOf = (e: string) => TAGS_OF.get(strip(e)) ?? new Set<string>();

/** Tags shared by every picture in the list. */
export function sharedTags(pics: string[]): string[] {
  if (pics.length === 0) return [];
  const [first, ...rest] = pics;
  return [...tagsOf(first)].filter((t) => rest.every((p) => tagsOf(p).has(t)));
}

/** Every one-per-row combination whose pictures share at least one tag. */
export function linkedCombos(rows: string[][]): string[][] {
  const out: string[][] = [];
  const walk = (r: number, acc: string[]) => {
    if (r === rows.length) { if (sharedTags(acc).length) out.push(acc.slice()); return; }
    for (const p of rows[r]) { acc.push(p); walk(r + 1, acc); acc.pop(); }
  };
  walk(0, []);
  return out;
}

const article = (e: string) => {
  const p = picOf(e)!;
  if (p.some) return `some ${p.name}`;
  return /^[aeiou]/i.test(p.name) && !/^(uni|eu|one)/i.test(p.name) ? `an ${p.name}` : `a ${p.name}`;
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "are animals" + "both" → "are both animals"; "go on your feet" → "both go on your feet". */
export const togetherLabel = (label: string, word: string) =>
  /^(are|can) /.test(label) ? label.replace(/^(are|can) /, `$1 ${word} `) : `${word} ${label}`;

// ---------- difficulty model ----------

interface Layout { rows: number; per: number; bonus: number }
const LAYOUTS: Layout[] = [
  { rows: 2, per: 2, bonus: 0 },
  { rows: 2, per: 3, bonus: 0.6 },
  { rows: 2, per: 4, bonus: 1.2 },
  { rows: 3, per: 3, bonus: 1.5 },
  { rows: 3, per: 4, bonus: 2.2 },
];
const LINK_BONUS = 0.5;

export function pcDifficulty(tag: TagDef, rows: number, per: number, links: number): number {
  const lay = LAYOUTS.find((l) => l.rows === rows && l.per === per)!;
  return Math.round((tag.diff + lay.bonus + LINK_BONUS * links) * 100) / 100;
}

type Band = 0 | 1 | 2;
export function bandFor(d: number): Band {
  return d < 6.5 ? 0 : d < 9.5 ? 1 : 2;
}

interface Option { tag: TagDef; lay: Layout; links: number; pred: number }

function optionsFor(want: number): Option[] {
  const band = bandFor(want);
  const lays = band === 0 ? LAYOUTS.slice(0, 2) : band === 1 ? LAYOUTS.slice(1, 4) : [LAYOUTS[4]];
  const linkCounts = band === 2 ? [0, 1, 2] : band === 1 ? [0] : [0];
  const tags = TAGS.filter((t) => t.target && (band === 0 ? t.kind === 'category' && t.diff <= 6.5 : band === 1 ? t.kind !== 'category' || t.diff >= 6 : t.diff >= 7));
  const out: Option[] = [];
  for (const tag of tags) {
    for (const lay of lays) {
      if (tag.strict.length < lay.rows) continue;
      for (const links of linkCounts) {
        if (links > 0 && lay.rows < 3) continue;
        out.push({ tag, lay, links, pred: pcDifficulty(tag, lay.rows, lay.per, links) });
      }
    }
  }
  return out;
}

// ---------- building an item ----------

const conceptTag = (id: string) => {
  const t = TAG_BY_ID.get(id);
  return !!t && t.kind !== 'color' && t.kind !== 'hidden';
};

function pickAnswers(tag: TagDef, n: number, rng: Rng): string[] {
  let best: string[] = [];
  let bestScore = Infinity;
  for (let k = 0; k < 16; k++) {
    const set = rng.sample(tag.strict, n).map((k) => picOf(k)!.e);
    // fewer extra shared ideas = the target idea is really the link
    const extra = sharedTags(set).filter((t) => t !== tag.id && conceptTag(t)).length;
    if (extra < bestScore) { best = set; bestScore = extra; }
  }
  return best;
}

/** Does putting `cand` in row `r` create a rival linked combination? (Answers sit at index 0.) */
function createsRival(rows: string[][], r: number, cand: string): boolean {
  const walk = (i: number, acc: string[], allAnswer: boolean): boolean => {
    if (i === rows.length) return !allAnswer && sharedTags(acc).length > 0;
    const choices = i === r ? [cand] : rows[i];
    for (let j = 0; j < choices.length; j++) {
      const isAns = i !== r && j === 0;
      acc.push(choices[j]);
      const hit = walk(i + 1, acc, allAnswer && isAns);
      acc.pop();
      if (hit) return true;
    }
    return false;
  };
  return walk(0, [], false);
}

function build(opt: Option, rng: Rng): PcPayload | null {
  const { tag, lay } = opt;
  const answers = pickAnswers(tag, lay.rows, rng);
  const rows = answers.map((a) => [a]);
  const used = new Set(answers.map(strip));
  const pool = PICS.map((p) => p.e).filter((e) => !used.has(strip(e)));
  const take = (r: number, e: string) => { rows[r].push(e); used.add(strip(e)); };

  // Deliberate traps: a picture that shares a non-target idea with another row's picture,
  // in a way that cannot reach every row.
  let links = 0;
  for (let attempt = 0; links < opt.links && attempt < 60; attempt++) {
    const r1 = rng.int(0, lay.rows - 1);
    const r2 = (r1 + rng.int(1, lay.rows - 1)) % lay.rows;
    if (rows[r2].length >= lay.per) continue;
    const anchor = rng.pick(rows[r1]);
    const lt = [...tagsOf(anchor)].filter((t) => t !== tag.id);
    if (!lt.length) continue;
    const L = TAG_BY_ID.get(rng.pick(lt))!;
    const cands = L.strict.map((k) => picOf(k)!.e).filter((e) => !used.has(strip(e)));
    if (!cands.length) continue;
    const c = rng.pick(cands);
    if (createsRival(rows, r2, c)) continue;
    take(r2, c);
    links++;
  }
  if (links < opt.links) return null;

  for (let r = 0; r < lay.rows; r++) {
    let guard = 0;
    while (rows[r].length < lay.per) {
      if (++guard > 400) return null;
      const c = rng.pick(pool);
      if (used.has(strip(c))) continue;
      if (createsRival(rows, r, c)) continue;
      take(r, c);
    }
  }
  // final brute-force check over every combination
  const linked = linkedCombos(rows);
  if (linked.length !== 1 || linked[0].join() !== answers.join()) return null;
  return { rows: rows.map((row) => rng.shuffle(row)), answer: answers, tag: tag.id, links };
}

// ---------- generate / score ----------

/** The same instruction on every item (format study §B). */
export const PC_STEM = 'Pick one from each row that go together.';
/** No strict limit on the real test: soft 60 s limit (flag only) and a neutral prompt at 30 s. */
const PC_TIME_LIMIT = 60;
const PC_PROMPT_AT = 30;

export function generate(req: GenerateRequest): Item<PcPayload> {
  const rng = createRng(req.seed);
  const want = Math.max(3, Math.min(18, req.difficulty));
  let options = optionsFor(want);
  let payload: PcPayload | null = null;
  let chosen: Option | null = null;
  const recent = new Set((req.exclude ?? []).map((id) => id.split(':')[1]));
  for (let tries = 0; tries < 40 && !payload; tries++) {
    if (!options.length) options = optionsFor(want);
    const best = Math.min(...options.map((o) => Math.abs(o.pred - want)));
    let near = options.filter((o) => Math.abs(o.pred - want) <= best + 0.5);
    const fresh = near.filter((o) => !recent.has(o.tag.id));
    if (fresh.length) near = fresh;
    chosen = rng.pick(near);
    for (let k = 0; k < 6 && !payload; k++) payload = build(chosen, rng);
    if (!payload) options = options.filter((o) => o !== chosen);
  }
  if (!payload || !chosen) throw new Error('PC: could not build an item');
  const tag = TAG_BY_ID.get(payload.tag)!;
  const n = payload.answer.length;
  const names = payload.answer.map((e) => `${article(e)} ${e}`);
  const list = n === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(', ')} and ${names[n - 1]}`;
  const explanation = `${cap(list)} ${togetherLabel(tag.label, n === 2 ? 'both' : 'all')}!`;
  const skills = [`pc:${tag.kind}`];
  if (n === 3) skills.push('pc:three-rows');
  return {
    id: `PC:${tag.id}:${payload.answer.map(strip).join('')}:${req.seed}`,
    subtest: 'PC',
    difficulty: pcDifficulty(tag, n, payload.rows[0].length, payload.links),
    seed: req.seed,
    payload,
    maxPoints: 1,
    timeLimitSec: PC_TIME_LIMIT,
    promptAtSec: PC_PROMPT_AT,
    skills,
    hints: [
      'Say a name for each picture’s group — like “animal”, “food” or “something you wear”.',
      `Find one picture in each row that goes with a picture in the ${n === 2 ? 'other row' : 'other rows'} in the same way.`,
      `Look for things that ${tag.label}.`,
    ],
    explanation,
    steps: [
      ...payload.answer.map((e, r) => `Row ${r + 1}: ${article(e)} ${e}.`),
      `${n === 2 ? 'Both' : 'All of them'} ${tag.label}. No other mix of pictures shares an idea in every row.`,
    ],
    speak: PC_STEM,
  };
}

export function score(item: Item<PcPayload>, response: PcResponse | null): ScoreOutcome {
  const rows = item.payload.answer.length;
  if (!response) return { points: 0, correct: false, meta: { rowsRight: 0, rows } };
  const rowsRight = item.payload.answer.filter((a, r) => response[r] != null && strip(response[r]!) === strip(a)).length;
  const correct = rowsRight === rows && response.length === rows;
  let feedback: string | undefined;
  if (!correct && rowsRight > 0) feedback = `You got ${rowsRight} of ${rows} rows. Find the idea that works for every row!`;
  return { points: correct ? 1 : 0, correct, meta: { rowsRight, rows }, feedback };
}

// ---------- Player ----------

const ROW_COLOURS = ['var(--lake)', 'var(--campfire)', 'var(--pine)'];

/**
 * Each row stays on one line (the real rows never wrap). Pictures are numbered continuously across
 * rows (row 1: 1–3, row 2: 4–6…) on a small tab under each picture, so the child can say a number.
 * On narrow phones the emoji shrinks, not the tap target.
 */
const ROWS_CSS = `
.pc-row .choice { padding: 6px 4px 20px; min-height: 64px; }
.pc-row .pc-num {
  position: absolute; bottom: 2px; left: 0; right: 0; text-align: center;
  font-family: var(--font-display); font-weight: 800; font-size: 0.85rem; color: var(--ink);
}
.pc-row .pc-pic { font-size: clamp(30px, 9vw, 44px); line-height: 1.1; }
@media (max-width: 420px) {
  .pc-row.choices { gap: 6px !important; }
  .pc-row .choice { padding: 4px 2px 18px; }
}`;

export function Player({ item, onSubmit, reveal, hintLevel }: PlayerProps<PcPayload, PcResponse>) {
  const { rows, answer } = item.payload;
  const [picks, setPicks] = useState<PcResponse>(() => rows.map(() => null));
  const chosen = reveal ? (reveal.response ?? rows.map(() => null)) : picks;
  const done = picks.every((p) => p !== null);

  return (
    <div className="stage">
      <div className="prompt">{PC_STEM}</div>
      <style>{ROWS_CSS}</style>
      <div className="stack" style={{ width: '100%', maxWidth: 560, gap: 14 }}>
        {rows.map((row, r) => {
          // continuous numbering: pictures in earlier rows come first
          const first = rows.slice(0, r).reduce((n, x) => n + x.length, 0) + 1;
          return (
          <div
            key={r}
            role="group"
            aria-label={`Row ${r + 1}`}
            className="card flat"
            style={{ padding: 'clamp(6px, 2vw, 10px)', borderLeft: `10px solid ${ROW_COLOURS[r % 3]}` }}
          >
            <ChoiceGrid
              className="pc-row"
              columns={row.length}
              options={row.map((e, j) => ({
                key: e,
                ariaLabel: `${first + j}: ${picOf(e)?.name ?? e}`,
                content: (
                  <>
                    <span className="stack" style={{ gap: 0, alignItems: 'center', minWidth: 0 }}>
                      <span aria-hidden className="pc-pic">{e}</span>
                      {hintLevel >= 1 && <span className="small muted" style={{ lineHeight: 1.1, overflowWrap: 'anywhere' }}>{picOf(e)?.name}</span>}
                    </span>
                    <span className="pc-num" aria-hidden>{first + j}</span>
                  </>
                ),
              }))}
              selected={chosen[r] ? [chosen[r]!] : []}
              onSelect={(k) => setPicks((p) => p.map((x, i) => (i === r ? (x === k ? null : k) : x)))}
              reveal={reveal ? { correctKeys: [answer[r]], chosenKeys: chosen[r] ? [chosen[r]!] : [] } : undefined}
            />
          </div>
          );
        })}
      </div>
      {!reveal && (
        <button type="button" className="btn go" disabled={!done} onClick={() => onSubmit(picks)}>
          Done ✓
        </button>
      )}
    </div>
  );
}

// ---------- guide ----------

export const guide: SubtestGuide = {
  kidIntro: 'Picture Pals! Pick one picture from each row so that your pictures go together in the same way.',
  howToPlay: [
    'Look at every picture in every row.',
    'Tap one picture in each row. Tap it again to change your mind.',
    'Your pictures must share one idea — like “they are all fruits”.',
    'Tap Done when every row has a pick.',
  ],
  strategies: [
    { title: 'Name the group', tip: 'Say a group name for each picture: “animal”, “food”, “something you wear”. Then look for a match in the next row.' },
    { title: 'Ask what it does', tip: 'If groups don’t match, ask what each thing is FOR: cutting, riding, keeping warm, making light?' },
    { title: 'Ask what it has', tip: 'Look at parts and features: wheels, wings, a shell, stripes, fur. Two very different things can share one!' },
    { title: 'Start with the shortest row', tip: 'Pick the row where only one or two pictures could link to anything, and test those first.' },
    { title: 'Check every row', tip: 'A link that works for two rows but not the third is a trap. Your idea must work for every row.' },
    { title: 'Think where it comes from', tip: 'For tricky ones, ask: what is it made of? Where does it come from? Where would you find it?' },
  ],
  parentNotes:
    'Picture Concepts measures categorical and inductive reasoning without words: spotting the abstract concept that links pictures across rows. It is a supplemental Fluid Reasoning subtest. Children who name concepts aloud (“they’re both for your feet”) tend to do better, so encourage talking it through. Note it has the lowest retest stability of the WISC-V subtests, so single scores bounce around.',
  commonMistakes: [
    'Linking by colour or looks instead of by what things are or do.',
    'Finding a link between two rows and forgetting to check the third.',
    'Choosing two things that go together (a key and a lock) rather than two things that are the same kind.',
    'Stopping at the first idea instead of trying another kind of group.',
  ],
  everydayActivities: [
    '“Odd one out” and “What do these have in common?” games in the car.',
    'Sort toys, groceries or laundry in different ways: by colour, then by use, then by where they belong.',
    'Category games like Scattergories Junior or “I’m going on a picnic” with a hidden rule.',
    'Look through picture books and ask: which two things here go together, and why?',
  ],
};

export const PictureConcepts: SubtestModule<PcPayload, PcResponse> = {
  id: 'PC',
  generate,
  score,
  Player,
  guide,
};

export default PictureConcepts;
