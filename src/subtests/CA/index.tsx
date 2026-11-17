/**
 * Cancellation ("Animal Hunt"). A page of small pictures; the child taps every animal (tapping again
 * un-marks). Two variants: a scattered page and a page in neat rows, 45 s each.
 * Raw score = correct marks − wrong marks (floor 0). The sheet ends early only when every animal is marked.
 * Like the real pages, each page is built by quadrant: every quarter of the page holds an equal share
 * of the animals (±1), and every quarter also holds "related-object" foils — things that go with
 * animals but are not animals (bone, paw prints, egg, feather, yarn, carrot…). Taps on those are
 * wrong marks, also counted separately as meta.relatedErrors.
 */
import { useEffect, useRef, useState } from 'react';
import { createRng } from '../../core/rng';
import type { GenerateRequest, Item, PlayerProps, ScoreOutcome, SubtestGuide, SubtestModule } from '../../core/types';
import {
  PracticeNote, ReadyCard, ReadySetGo, SheetBar, SheetDone, SpeedIntro, SpeedStyles, SpeedSummary, TapButton,
  accurateSheet, clampElapsed, useStopwatch, useSubmitOnce,
} from '../CD/speedKit';

export type CaLayout = 'random' | 'structured';
export interface CaPic {
  e: string;
  animal: boolean;
  /** Centre in cell units (0..cols, 0..rows). */
  x: number;
  y: number;
  /** Tilt in degrees (scattered page only). */
  rot: number;
}
export interface CaPayload {
  layout: CaLayout;
  cols: number;
  rows: number;
  pics: CaPic[];
  /** Untimed warm-up rows of 6 pictures. */
  practice: CaPic[][];
}
/** marks = indices of pictures marked when the sheet ended. */
export interface CaResponse {
  marks: number[];
  elapsedSec: number;
}

export const CA_DURATION = 45;

// Unicode ≤ 13, no variation selectors, all clearly animals.
export const CA_ANIMALS = [
  '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐤',
  '🦆', '🦉', '🐴', '🐝', '🐛', '🦋', '🐌', '🐞', '🐢', '🐍', '🐙', '🦀', '🐠', '🐬', '🐳', '🐘', '🦒', '🦓',
  '🐪', '🦘', '🐑', '🐐', '🦔', '🦇', '🐊', '🦜', '🦩',
];
// Everyday objects: clothes, food, furniture, tools and toys.
export const CA_OBJECTS = [
  '👕', '👖', '👗', '👟', '👒', '🧢', '🧦', '🧤', '🧣', '👓', '👜', '🎩',
  '🍎', '🍌', '🍇', '🍓', '🍕', '🍩', '🍪', '🧀', '🌽', '🍞', '🍉', '🍒', '🍋', '🥦', '🧁',
  '🪑', '🚪', '🛁', '💡', '🧹', '🔨', '🔧', '🔑', '🧲', '📎', '🪚',
  '⚽', '🏀', '🎈', '🎁', '📚', '🚗', '🚲', '⏰', '🎒', '🥁', '🎸',
];
/**
 * Related-object foils: things that go with animals but are NOT animals (and not animal faces).
 * All Unicode ≤ 13, no variation selectors: bone (11), paw prints (6), egg (9), feather (13),
 * yarn (11), carrot (9), honey pot (6), glass of milk (9).
 */
export const CA_RELATED = ['🦴', '🐾', '🥚', '🪶', '🧶', '🥕', '🍯', '🥛'];
/** Related foils per quadrant (small page / big page). */
const relatedPerQuadrant = (cols: number) => (cols <= 10 ? 2 : 3);

export const CA_VARIANTS: { id: CaLayout; label: string }[] = [
  { id: 'random', label: 'Scattered' },
  { id: 'structured', label: 'In rows' },
];

export function caGrid(age: number): { cols: number; rows: number } {
  return age < 9 ? { cols: 10, rows: 14 } : { cols: 12, rows: 17 };
}

/**
 * Quadrant (0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right) of a cell. The split lines are at
 * whole cells (⌊cols/2⌋, ⌊rows/2⌋), so a scattered picture (jitter < half a cell) never crosses one.
 */
export function cellQuadrant(cell: number, cols: number, rows: number): number {
  const c = cell % cols;
  const r = Math.floor(cell / cols);
  return (c >= Math.floor(cols / 2) ? 1 : 0) + (r >= Math.floor(rows / 2) ? 2 : 0);
}

/** Quadrant of a picture from where it is drawn. */
export function picQuadrant(pic: { x: number; y: number }, cols: number, rows: number): number {
  return (pic.x >= Math.floor(cols / 2) ? 1 : 0) + (pic.y >= Math.floor(rows / 2) ? 2 : 0);
}

export const isRelated = (e: string) => CA_RELATED.includes(e);

export function generate(req: GenerateRequest): Item<CaPayload> {
  const layout: CaLayout = req.variant === 'structured' ? 'structured' : 'random';
  const rng = createRng(req.seed ^ (layout === 'structured' ? 0x2c1b3c6d : 0));
  const { cols, rows } = caGrid(req.age);
  const n = cols * rows;
  const nAnimals = Math.round(n * (0.21 + 0.04 * rng.next()));
  // Balance by quadrant: each quarter gets ⌊nAnimals/4⌋ animals, and the remainder goes to distinct
  // quarters, so every quarter is within ±1 of an equal share. Each quarter also gets related foils.
  const quads: number[][] = [[], [], [], []];
  for (let i = 0; i < n; i++) quads[cellQuadrant(i, cols, rows)].push(i);
  const extra = new Set(rng.sample([0, 1, 2, 3], nAnimals % 4));
  const animalCells = new Set<number>();
  const relatedCells = new Set<number>();
  const perRelated = relatedPerQuadrant(cols);
  quads.forEach((cells, q) => {
    const k = Math.floor(nAnimals / 4) + (extra.has(q) ? 1 : 0);
    const chosen = rng.sample(cells, k + perRelated);
    chosen.slice(0, k).forEach((c) => animalCells.add(c));
    chosen.slice(k).forEach((c) => relatedCells.add(c));
  });
  const pics: CaPic[] = [];
  for (let i = 0; i < n; i++) {
    const animal = animalCells.has(i);
    let x = (i % cols) + 0.5;
    let y = Math.floor(i / cols) + 0.5;
    let rot = 0;
    if (layout === 'random') {
      x += (rng.next() - 0.5) * 0.42;
      y += (rng.next() - 0.5) * 0.42;
      rot = rng.int(-25, 25);
    }
    pics.push({ e: rng.pick(animal ? CA_ANIMALS : relatedCells.has(i) ? CA_RELATED : CA_OBJECTS), animal, x, y, rot });
  }
  const practiceRow = (): CaPic[] => {
    const animals = rng.sample(CA_ANIMALS, 2);
    const objects = [rng.pick(CA_RELATED), ...rng.sample(CA_OBJECTS, 3)];
    return rng.shuffle([...animals.map((e) => ({ e, animal: true })), ...objects.map((e) => ({ e, animal: false }))])
      .map((p, i) => ({ ...p, x: i + 0.5, y: 0.5, rot: 0 }));
  };
  const age = Math.max(3, Math.min(18, req.age));
  return {
    id: `CA:${layout}:${cols}x${rows}:${req.seed}`,
    subtest: 'CA',
    difficulty: age,
    seed: req.seed,
    payload: { layout, cols, rows, pics, practice: [practiceRow(), practiceRow()] },
    maxPoints: nAnimals,
    timeLimitSec: CA_DURATION,
    skills: [`ca:${layout}`],
    hints: [
      'Search like you read: the top row from left to right, then the next row.',
      'Only animals! Things that go with animals, like a bone, an egg or paw prints, don’t count.',
      'Tapped the wrong one? Tap it again to take the mark off.',
    ],
    explanation: `There were ${nAnimals} animals hiding on the page. Your score is the animals you marked minus any things you marked that weren’t animals.`,
    speak: 'Tap every animal you can find, as fast as you can. Only animals! If you tap something by mistake, tap it again.',
  };
}

export function score(item: Item<CaPayload>, response: CaResponse | null): ScoreOutcome {
  const { pics } = item.payload;
  const limit = item.timeLimitSec ?? CA_DURATION;
  const totalAnimals = pics.filter((p) => p.animal).length;
  if (!response || !Array.isArray(response.marks)) {
    return { points: 0, correct: false, meta: { correct: 0, errors: 0, durationSec: limit, omissions: totalAnimals, relatedErrors: 0 } };
  }
  const marks = new Set(response.marks.filter((m) => Number.isInteger(m) && m >= 0 && m < pics.length));
  let correct = 0;
  let errors = 0;
  let relatedErrors = 0;
  marks.forEach((m) => {
    if (pics[m].animal) correct++;
    else {
      errors++;
      if (isRelated(pics[m].e)) relatedErrors++;
    }
  });
  const points = Math.max(0, correct - errors);
  const durationSec = clampElapsed(response.elapsedSec, limit);
  let feedback: string | undefined;
  if (marks.size > 0) {
    feedback = `You found ${correct} of ${totalAnimals} animals${errors ? ` and marked ${errors} thing${errors === 1 ? '' : 's'} that weren’t animals` : ''}.`;
    if (correct === totalAnimals) feedback += ' Every single animal — wow!';
    if (relatedErrors > 0) feedback += ` ${relatedErrors === 1 ? 'One mark was' : `${relatedErrors} marks were`} on something that goes WITH an animal (like a bone or an egg) — those aren’t animals.`;
  }
  return {
    points,
    correct: accurateSheet(correct, errors),
    meta: { correct, errors, durationSec, omissions: totalAnimals - correct, relatedErrors },
    feedback,
  };
}

// ---------- Player ----------

type MarkState = 'none' | 'marked' | 'good' | 'bad' | 'missed';

function PicGlyph({ pic, state }: { pic: CaPic; state: MarkState }) {
  return (
    <>
      {state === 'marked' && <circle r={46} fill="#f4c542" opacity={0.55} />}
      {state === 'good' && <circle r={44} fill="#dff3e4" stroke="#2e8b57" strokeWidth={7} />}
      {state === 'missed' && <circle r={44} fill="none" stroke="#e8743b" strokeWidth={6} strokeDasharray="12 8" />}
      <text fontSize={60} textAnchor="middle" dominantBaseline="central" transform={pic.rot ? `rotate(${pic.rot})` : undefined} style={{ pointerEvents: 'none' }}>
        {pic.e}
      </text>
      {(state === 'marked' || state === 'bad') && (
        <line x1={-34} y1={34} x2={34} y2={-34} stroke="#c8435a" strokeWidth={10} strokeLinecap="round" />
      )}
    </>
  );
}

function Page({ p, stateOf, onToggle, bands }: {
  p: CaPayload; stateOf: (i: number) => MarkState; onToggle?: (i: number) => void; bands?: boolean;
}) {
  const W = p.cols * 100;
  const H = p.rows * 100;
  const svgRef = useRef<SVGSVGElement>(null);
  const lastPointer = useRef(0);
  const nearest = (clientX: number, clientY: number): number => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return -1;
    const x = ((clientX - r.left) / r.width) * p.cols;
    const y = ((clientY - r.top) / r.height) * p.rows;
    let best = -1;
    let bestD = 0.62 ** 2;
    p.pics.forEach((pic, i) => {
      const d = (pic.x - x) ** 2 + (pic.y - y) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  };
  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="spd-sheet"
      role="group"
      aria-label={p.layout === 'random' ? 'Scattered picture page' : 'Picture page in rows'}
      style={{
        width: `min(100%, calc((100vh - 230px) * ${(p.cols / p.rows).toFixed(4)}))`,
        minWidth: 240, height: 'auto', display: 'block', background: 'var(--card)',
        border: 'var(--border)', borderRadius: 14, touchAction: 'manipulation',
      }}
      onPointerDown={onToggle ? (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const i = nearest(e.clientX, e.clientY);
        if (i >= 0) {
          lastPointer.current = Date.now();
          onToggle(i);
        }
      } : undefined}
    >
      {/* Hint scaffold: faint reading-row bands to search along. */}
      {bands && Array.from({ length: p.rows }, (_, r) => r % 2 === 0 && (
        <rect key={`band${r}`} x={0} y={r * 100} width={W} height={100} fill="#3a86b4" opacity={0.08} />
      ))}
      {p.pics.map((pic, i) => {
        const st = stateOf(i);
        return (
          <g
            key={i}
            transform={`translate(${(pic.x * 100).toFixed(1)} ${(pic.y * 100).toFixed(1)})`}
            role={onToggle ? 'button' : undefined}
            tabIndex={onToggle ? 0 : undefined}
            aria-label={pic.e}
            aria-pressed={onToggle ? st === 'marked' : undefined}
            onClick={onToggle ? () => { if (Date.now() - lastPointer.current > 800) onToggle(i); } : undefined}
            onKeyDown={onToggle ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(i); } } : undefined}
          >
            <PicGlyph pic={pic} state={st} />
          </g>
        );
      })}
    </svg>
  );
}

/** Per-picture guard so a quick double tap doesn't mark and then immediately un-mark. */
function useToggleGuard(ms = 350) {
  const last = useRef(new Map<number, number>());
  return (i: number) => {
    const now = Date.now();
    const t = last.current.get(i) ?? 0;
    if (now - t < ms) return false;
    last.current.set(i, now);
    return true;
  };
}

type Phase = 'intro' | 'practice' | 'countdown' | 'run';

function CaRun({ item, onSubmit, hintLevel }: PlayerProps<CaPayload, CaResponse>) {
  const p = item.payload;
  const limit = item.timeLimitSec ?? CA_DURATION;
  const [phase, setPhase] = useState<Phase>('intro');
  const [marks, setMarks] = useState<Set<number>>(new Set());
  const marksRef = useRef<Set<number>>(new Set());
  const [pRow, setPRow] = useState(0);
  const [pMarks, setPMarks] = useState<Set<number>>(new Set());
  const [pNote, setPNote] = useState<{ s: 'idle' | 'good' | 'bad'; text: string }>({ s: 'idle', text: 'Tap the two animals in this row.' });
  const canToggle = useToggleGuard();
  const clock = useStopwatch();
  const [submit, done] = useSubmitOnce(onSubmit);
  const endTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(endTimer.current), []);
  const finish = () => submit({ marks: [...marksRef.current].sort((a, b) => a - b), elapsedSec: Math.min(limit, clock.elapsed()) });

  const toggle = (i: number) => {
    if (done || !canToggle(i)) return;
    const next = new Set(marksRef.current);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    marksRef.current = next;
    setMarks(next);
    const found = p.pics.every((pic, j) => !pic.animal || next.has(j));
    clearTimeout(endTimer.current);
    if (found) endTimer.current = setTimeout(finish, 400);
  };

  const togglePractice = (i: number) => {
    const row = p.practice[pRow];
    if (!row || !canToggle(1000 + pRow * 10 + i)) return;
    const next = new Set(pMarks);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    const wrong = [...next].some((j) => !row[j].animal);
    const allFound = row.every((pic, j) => !pic.animal || next.has(j));
    if (wrong) {
      const isDecoy = isRelated(row[i].e) && next.has(i);
      setPNote({ s: 'bad', text: isDecoy ? 'That goes WITH an animal — but it isn’t an animal! Tap it again to take the mark off.' : 'That’s not an animal. Tap it again to take the mark off.' });
      setPMarks(next);
    } else if (allFound) {
      setPNote({ s: 'good', text: 'Yes! You found them all.' });
      setPMarks(new Set());
      setPRow(pRow + 1);
    } else {
      setPNote({ s: 'idle', text: next.has(i) ? 'Good! Keep looking…' : 'Mark taken off. Keep looking…' });
      setPMarks(next);
    }
  };

  const pageName = p.layout === 'random' ? 'Scattered page' : 'Rows page';

  if (phase === 'intro') {
    return (
      <div className="stage">
        <SpeedStyles />
        <div className="prompt">Animal Hunt · {pageName}</div>
        <SpeedIntro onStart={() => setPhase('practice')} onSkip={() => setPhase('countdown')}>
          Animals are hiding among lots of other things! Tap every animal you find. Only animals — tap again to undo a mistake.
          {p.layout === 'random' ? ' Even when things are scattered, hunt row by row like reading.' : ' Hunt along each row like reading.'}
        </SpeedIntro>
      </div>
    );
  }

  if (phase === 'practice') {
    const row = p.practice[pRow];
    return (
      <div className="stage">
        <SpeedStyles />
        <div className="prompt">Practice</div>
        {row ? (
          <>
            <PracticeNote state={pNote.s}>{pNote.text}</PracticeNote>
            <div className="spd-pal" style={{ gridTemplateColumns: 'repeat(3, minmax(56px, 1fr))', maxWidth: 330 }}>
              {row.map((pic, i) => (
                <TapButton key={`${pRow}-${i}`} onTap={() => togglePractice(i)} ariaLabel={pic.e} style={{ aspectRatio: '1', padding: 2 }}>
                  <svg viewBox="-50 -50 100 100" width="100%" height="100%" aria-hidden>
                    <PicGlyph pic={pic} state={pMarks.has(i) ? 'marked' : 'none'} />
                  </svg>
                </TapButton>
              ))}
            </div>
          </>
        ) : (
          <ReadyCard onGo={() => setPhase('countdown')}>Super hunting! Now the big page — 45 seconds. Find as many animals as you can.</ReadyCard>
        )}
      </div>
    );
  }

  if (phase === 'countdown') {
    return (
      <div className="stage">
        <SpeedStyles />
        <ReadySetGo onDone={() => { clock.start(); setPhase('run'); }} />
      </div>
    );
  }

  return (
    <div className="stage" style={{ gap: 10 }}>
      <SpeedStyles />
      <SheetBar seconds={limit} running={!done} onExpire={finish} done={marks.size} />
      {done ? (
        <SheetDone />
      ) : (
        <Page p={p} bands={hintLevel >= 1} stateOf={(i) => (marks.has(i) ? 'marked' : 'none')} onToggle={toggle} />
      )}
    </div>
  );
}

function CaReview({ item, reveal }: PlayerProps<CaPayload, CaResponse>) {
  const p = item.payload;
  const marks = new Set(reveal?.response?.marks ?? []);
  const meta = reveal?.outcome.meta ?? {};
  return (
    <div className="stage" style={{ gap: 10 }}>
      <SpeedStyles />
      <SpeedSummary
        stats={[
          { label: 'animals found', value: meta.correct ?? 0 },
          { label: 'wrong taps', value: meta.errors ?? 0 },
          { label: 'missed', value: meta.omissions ?? 0 },
          ...(meta.relatedErrors ? [{ label: 'animal-ish things', value: meta.relatedErrors }] : []),
          { label: 'seconds', value: Math.round(meta.durationSec ?? 0) },
        ]}
      />
      <div className="small muted center">Green = found · red slash = not an animal · dashed = missed</div>
      <Page
        p={p}
        stateOf={(i) => {
          const pic = p.pics[i];
          if (marks.has(i)) return pic.animal ? 'good' : 'bad';
          return pic.animal ? 'missed' : 'none';
        }}
      />
    </div>
  );
}

export function Player(props: PlayerProps<CaPayload, CaResponse>) {
  return props.reveal ? <CaReview {...props} /> : <CaRun {...props} />;
}

// ---------- guide ----------

export const guide: SubtestGuide = {
  kidIntro: 'Animal Hunt! Lots of animals are hiding among clothes, food and toys. Tap every animal you can find before the time runs out!',
  howToPlay: [
    'Look at the page full of little pictures.',
    'Tap every animal you see. It gets a mark.',
    'Tapped something that isn’t an animal? Tap it again to take the mark off.',
    'Keep hunting until the time runs out!',
  ],
  strategies: [
    { title: 'Hunt like you read', tip: 'Start at the top-left and go along each row, left to right, then down to the next row — even on the scattered page.' },
    { title: 'Four corners', tip: 'Split the page into four parts in your head. Clear one part completely, then move to the next.' },
    { title: 'Spot eyes and legs', tip: 'Animals have faces, eyes, legs, wings or fins. Let your eyes jump to anything with a face.' },
    { title: 'Ask “is it alive?”', tip: 'Only animals count. A bone, an egg, paw prints or a ball of yarn is not an animal, even if it goes with one.' },
    { title: 'Quick and smooth', tip: 'Tap and keep your eyes moving to the next picture — don’t stop to admire your marks.' },
    { title: 'Lost? Back to the row', tip: 'If you lose your place, go back to the start of the row you were on instead of jumping around.' },
  ],
  parentNotes:
    'Cancellation measures processing speed with an emphasis on selective visual attention: scanning a busy page, deciding quickly what belongs to a category (animals) and ignoring look-alike or related distractors. It is a secondary Processing Speed subtest (it can stand in for Coding or Symbol Search but is not part of the PSI itself). The scattered and in-rows pages are compared to see whether an organized layout helps — children who search systematically usually do better on both. Score = animals marked minus non-animals marked; missed animals are counted separately. As on the real pages, the animals are spread evenly over the four quarters of the page, and every quarter has a few “related” foils (a bone, an egg, paw prints, yarn…) — marks on those are shown separately, since they show a child grabbing what goes with animals rather than checking the category.',
  commonMistakes: [
    'Searching randomly and re-checking the same areas instead of going row by row.',
    'Marking things that go with animals (a bone, an egg) or toys that look like animals.',
    'Slowing down on the scattered page instead of imposing your own rows.',
    'Stopping too early before the time is up.',
  ],
  everydayActivities: [
    'Where’s-Waldo-style search books and “find all the ___” picture pages, against a timer.',
    'Circle every letter “a” (or every number 3) on a page of a newspaper or magazine.',
    '“I spy” races in the supermarket or on a walk: count every red car or every dog.',
    'Hidden-picture puzzles and seek-and-find games.',
    'Sorting a mixed pile (animal toys vs. other toys) as fast as you can.',
  ],
};

export const Cancellation: SubtestModule<CaPayload, CaResponse> = {
  id: 'CA',
  generate,
  score,
  Player,
  guide,
  variants: CA_VARIANTS,
};

export default Cancellation;
