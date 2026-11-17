/**
 * Coding ("Secret Code"). A key pairs each shape (version A, under 8) or digit 1–9 (version B, 8+)
 * with a simple mark. The child codes box after box for 120 s.
 *
 * Two ways to answer, chosen on the start screen:
 * - ✏️ Draw (default, like the real paper task): the child draws the mark in each box with a finger,
 *   mouse or stylus; strokes are recognised by a small template matcher (./ink.ts). Unclear marks
 *   count as errors and stay on the sheet as drawn — no auto-correction while the clock runs.
 * - 👆 Tap (easier): tap the mark from a palette. Pearson withdrew its tap-based digital Coding
 *   because tapping inflated scores, so tap scores are scaled down (see TAP_CREDIT).
 *
 * Sequence (like the real procedure): Pip demonstrates 3 boxes → the child does 6 untimed sample
 * boxes with feedback (a wrong mark must be redone) → Ready, set, go → 120 s timed sheet.
 * Raw score = boxes coded correctly (errors are not subtracted, as on the real subtest).
 */
import { useEffect, useRef, useState } from 'react';
import { createRng } from '../../core/rng';
import type { GenerateRequest, Item, PlayerProps, ScoreOutcome, SubtestGuide, SubtestModule } from '../../core/types';
import {
  PracticeNote, ReadyCard, ReadySetGo, SheetBar, SheetDone, SpeedIntro, SpeedStyles, SpeedSummary, TapButton,
  accurateSheet, balancedSequence, clampElapsed, useStopwatch, useSubmitOnce, useTapGuard,
} from './speedKit';
import { CD_MARKS, CD_SYMBOLS, UNRECOGNISED, classifyBox, rotationTwin, strokesToPath, symbolCount, type CdVersion, type Stroke } from './ink';
import {
  BAD_INK, CD_SHAPES, CdStyles, DemoMark, INK, Ink, KeyStrip, MarkGlyph, ShapeBox, SymbolGlyph, SymbolSvg, symbolName, targetName,
} from './glyphs';
import { DrawSheet, type CommitVerdict } from './DrawSheet';

export { CD_MARKS, CD_SYMBOLS, UNRECOGNISED, rotationTwin, symbolCount, CD_SHAPES, symbolName, targetName, MarkGlyph, SymbolGlyph };
export type { CdVersion };

export interface CdPayload {
  version: CdVersion;
  /** key[target] = symbol id. Targets: A = index into CD_SHAPES, B = digit − 1. */
  key: number[];
  /** Targets of the timed sheet, in order. */
  boxes: number[];
  /** Six targets for the untimed sample (must be done right before the clock starts). */
  practice: number[];
  /** Three targets Pip fills in as a demonstration. */
  demo: number[];
  /** Boxes per row in tap mode (draw mode uses bigger boxes, DRAW_PER_ROW). */
  perRow: number;
}

export type CdMode = 'draw' | 'tap';

/**
 * answers[i] = the symbol given for box i: tapped, or recognised from the drawing.
 * −1 = skipped, UNRECOGNISED (−2) = a drawing that matched no symbol clearly (counts as an error).
 */
export interface CdResponse {
  answers: number[];
  elapsedSec: number;
  /** Missing ⇒ 'tap' (responses saved before pencil mode existed were taps). */
  mode?: CdMode;
  /** Draw mode: rotated[i] = 1 when box i's mark fit the right symbol only turned or mirrored. */
  rotated?: number[];
  /** Draw mode: each box's strokes as SVG path data in 0–100 box coordinates (shown in the review). */
  ink?: string[];
}

export const CD_DURATION = 120;
export const CD_BOXES: Record<CdVersion, number> = { A: 75, B: 117 };
/**
 * Tap mode credit per correct box. The app's Coding norms (core/scoring.ts 'CD-A'/'CD-B') assume
 * paper-like drawing speed; tapping a palette is much faster (the reason Pearson withdrew tap-based
 * digital Coding), so a tap sheet's points = round(correct × 0.8). meta.correct keeps the true count.
 * Draw mode points = correct.
 */
export const TAP_CREDIT = 0.8;
const PER_ROW = 8;
const DRAW_PER_ROW = 5;

export function cdVersion(age: number): CdVersion {
  return age < 8 ? 'A' : 'B';
}

export function generate(req: GenerateRequest): Item<CdPayload> {
  const version = cdVersion(req.age);
  const rng = createRng(req.seed);
  const k = symbolCount(version);
  const ids = Array.from({ length: k }, (_, i) => i);
  const key = rng.shuffle(ids);
  const boxes = balancedSequence(rng.next, k, CD_BOXES[version]);
  const practice = balancedSequence(rng.next, k, 6);
  const demo = rng.sample(ids, 3);
  const pairs = ids.map((t) => `${targetName(version, t)} → ${symbolName(version, key[t])}`);
  const age = Math.max(3, Math.min(18, req.age));
  return {
    id: `CD:${version}:${req.seed}`,
    subtest: 'CD',
    difficulty: age,
    seed: req.seed,
    payload: { version, key, boxes, practice, demo, perRow: PER_ROW },
    maxPoints: boxes.length,
    timeLimitSec: CD_DURATION,
    skills: [`cd:${version}`],
    hints: [
      'The key at the top is always there — peek at it whenever you need to.',
      'Say the pairs you use most in your head, like a little song, so you need the key less.',
      'Keep a steady beat: look, draw, next box. Don’t stop to fix things.',
    ],
    explanation: version === 'A'
      ? 'Every shape has its own secret mark in the key. Your score is how many shapes got the right mark in 2 minutes.'
      : 'Every number has its own secret symbol in the key. Your score is how many numbers got the right symbol in 2 minutes.',
    steps: pairs,
    speak: version === 'A'
      ? 'Look at the key. Each shape has a secret mark. Put the mark that belongs in each shape, in order. Go as fast as you can without mistakes!'
      : 'Look at the key. Each number has a secret symbol. Put the symbol that belongs with each number, in order. Go as fast as you can without mistakes!',
  };
}

export function score(item: Item<CdPayload>, response: CdResponse | null): ScoreOutcome {
  const { boxes, key, version } = item.payload;
  const limit = item.timeLimitSec ?? CD_DURATION;
  if (!response || !Array.isArray(response.answers)) {
    return { points: 0, correct: false, meta: { correct: 0, errors: 0, rotationErrors: 0, durationSec: limit, attempted: 0, mode: 1 } };
  }
  const draw = response.mode === 'draw';
  const answers = response.answers.slice(0, boxes.length);
  let correct = 0;
  let errors = 0;
  let rotationErrors = 0;
  let attempted = 0;
  answers.forEach((a, i) => {
    if (typeof a !== 'number' || !Number.isFinite(a) || (a < 0 && a !== UNRECOGNISED)) return; // skipped box
    attempted++;
    const want = key[boxes[i]];
    if (a === want) correct++;
    else {
      errors++;
      if (rotationTwin(version, want) === a || (draw && response.rotated?.[i] === 1)) rotationErrors++;
    }
  });
  const durationSec = clampElapsed(response.elapsedSec, limit);
  const points = draw ? correct : Math.round(correct * TAP_CREDIT);
  let feedback = errors === 0
    ? `You cracked ${correct} codes with no mix-ups!`
    : `You cracked ${correct} codes. ${errors} didn’t match the key — a quick peek at the key saves mistakes.`;
  if (rotationErrors > 0) feedback += ' Some marks were turned around — check which way it goes.';
  if (!draw) feedback += ' (Tapping is easier than drawing, so tap scores count a bit less.)';
  return {
    points,
    correct: accurateSheet(correct, errors),
    meta: { correct, errors, rotationErrors, durationSec, attempted, mode: draw ? 1 : 0 },
    feedback: attempted === 0 ? undefined : feedback,
  };
}

// ---------- tap-mode sheet ----------

type BoxState = 'todo' | 'now' | 'good' | 'bad' | 'plain';

function Box({ v, target, mark, state }: { v: CdVersion; target: number; mark?: number; state: BoxState }) {
  const bg = state === 'now' ? 'var(--sun)' : state === 'good' ? 'var(--good-bg)' : state === 'bad' ? 'var(--bad-bg)' : 'var(--card)';
  const border = state === 'now' ? '3px solid var(--ink)' : state === 'bad' ? '2px solid var(--bad)' : '2px solid var(--ink)';
  const markColor = state === 'bad' ? BAD_INK : INK;
  const shown = mark !== undefined && mark >= 0;
  return (
    <div
      aria-label={`${targetName(v, target)}${mark !== undefined && mark >= 0 ? `, ${symbolName(v, mark)}` : mark === UNRECOGNISED ? ', unclear mark' : ''}`}
      style={{ flex: '1 1 0', minWidth: 0, maxWidth: 60, border, borderRadius: 8, background: bg, overflow: 'hidden',
        transform: state === 'now' ? 'scale(1.06)' : undefined, transition: 'transform .08s, background .1s' }}
    >
      {v === 'A' ? (
        <div style={{ aspectRatio: '1', padding: 3 }}><ShapeBox shape={CD_SHAPES[target]} mark={shown ? mark : undefined} color={markColor} /></div>
      ) : (
        <>
          <div style={{ textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, lineHeight: '24px', borderBottom: '2px solid var(--ink)' }}>{target + 1}</div>
          <div style={{ aspectRatio: '1', padding: 3 }}>{shown && <SymbolSvg v="B" sym={mark} size="100%" color={markColor} />}</div>
        </>
      )}
    </div>
  );
}

function SheetRows({ p, boxes, answers, from, count, review, practiceBad }: {
  p: CdPayload; boxes: number[]; answers: number[]; from: number; count: number; review?: boolean; practiceBad?: boolean;
}) {
  const rows: number[][] = [];
  for (let r = from; r < from + count; r++) {
    const start = r * p.perRow;
    if (start >= boxes.length) break;
    rows.push(Array.from({ length: Math.min(p.perRow, boxes.length - start) }, (_, i) => start + i));
  }
  const cur = answers.length;
  return (
    <div className="stack spd-sheet" style={{ gap: 8, alignItems: 'center' }}>
      {rows.map((row) => (
        <div key={row[0]} className="row" style={{ gap: 5, flexWrap: 'nowrap', width: '100%', justifyContent: 'center', opacity: !review && row[row.length - 1] < cur ? 0.55 : 1 }}>
          {row.map((i) => {
            const answered = i < answers.length;
            let state: BoxState = 'todo';
            if (review || practiceBad !== undefined) {
              if (answered) state = answers[i] === p.key[boxes[i]] ? 'good' : 'bad';
              else if (i === cur && practiceBad !== undefined) state = practiceBad ? 'bad' : 'now';
            } else if (i === cur) state = 'now';
            else if (answered) state = 'plain';
            return <Box key={i} v={p.version} target={boxes[i]} mark={answered ? answers[i] : undefined} state={state} />;
          })}
          {/* keep short last rows left-aligned and the same box size */}
          {Array.from({ length: p.perRow - row.length }, (_, k) => <div key={`pad${k}`} style={{ flex: '1 1 0', maxWidth: 60 }} />)}
        </div>
      ))}
    </div>
  );
}

function Palette({ v, onTap, disabled }: { v: CdVersion; onTap: (sym: number) => void; disabled?: boolean }) {
  const n = symbolCount(v);
  return (
    <div className="spd-pal" style={{ gridTemplateColumns: 'repeat(5, minmax(56px, 1fr))', maxWidth: 420 }}>
      {Array.from({ length: n }, (_, s) => (
        <TapButton key={s} onTap={() => onTap(s)} disabled={disabled} ariaLabel={symbolName(v, s)}>
          <SymbolSvg v={v} sym={s} size={40} />
        </TapButton>
      ))}
    </div>
  );
}

// ---------- start screen, demo ----------

function ModePicker({ mode, onChange }: { mode: CdMode; onChange: (m: CdMode) => void }) {
  return (
    <div className="cd-modes" role="group" aria-label="How do you want to answer?">
      <button type="button" className="btn" aria-pressed={mode === 'draw'} onClick={() => onChange('draw')}>✏️ Draw it (like paper)</button>
      <button type="button" className="btn" aria-pressed={mode === 'tap'} onClick={() => onChange('tap')}>👆 Tap it (easier)</button>
    </div>
  );
}

function DemoBox({ v, target, sym, filled, now }: { v: CdVersion; target: number; sym: number; filled: boolean; now: boolean }) {
  const mark = filled ? <DemoMark v={v} sym={sym} target={target} /> : null;
  return (
    <div
      aria-label={`${targetName(v, target)}${filled ? `, ${symbolName(v, sym)}` : ''}`}
      style={{ flex: '1 1 0', minWidth: 0, maxWidth: 84, border: now ? '3px solid var(--ink)' : '2px solid var(--ink)', borderRadius: 8,
        background: now ? 'var(--sun)' : 'var(--card)', overflow: 'hidden' }}
    >
      {v === 'A' ? (
        <div style={{ aspectRatio: '1' }}><ShapeBox shape={CD_SHAPES[target]}>{mark}</ShapeBox></div>
      ) : (
        <>
          <div style={{ textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, lineHeight: '24px', borderBottom: '2px solid var(--ink)' }}>{target + 1}</div>
          <div style={{ aspectRatio: '1' }}><svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden style={{ display: 'block' }}>{mark}</svg></div>
        </>
      )}
    </div>
  );
}

const DEMO_STEP_MS = 1600;

function Demo({ p, mode, onDone }: { p: CdPayload; mode: CdMode; onDone: () => void }) {
  const [filled, setFilled] = useState(0);
  const n = p.demo.length;
  useEffect(() => {
    if (filled >= n) return;
    const t = setTimeout(() => setFilled((f) => f + 1), filled === 0 ? 700 : DEMO_STEP_MS);
    return () => clearTimeout(t);
  }, [filled, n]);
  const last = filled > 0 ? p.demo[filled - 1] : undefined;
  const what = p.version === 'A' ? 'mark' : 'symbol';
  return (
    <div className="stage">
      <SpeedStyles />
      <CdStyles />
      <div className="prompt">Watch Pip</div>
      <KeyStrip p={p} highlight={filled < n ? p.demo[filled] : undefined} />
      <div className="row" style={{ gap: 6, flexWrap: 'nowrap', width: '100%', maxWidth: 300, justifyContent: 'center' }}>
        {p.demo.map((t, i) => <DemoBox key={i} v={p.version} target={t} sym={p.key[t]} filled={i < filled} now={i === filled} />)}
      </div>
      <PracticeNote state={filled >= n ? 'good' : 'idle'}>
        {filled >= n
          ? `Your turn! ${mode === 'draw' ? `Draw the ${what}` : `Tap the ${what}`} for each one, in order.`
          : last === undefined
            ? `Watch me. I find each ${p.version === 'A' ? 'shape' : 'number'} in the key…`
            : `The ${targetName(p.version, last)} gets the ${symbolName(p.version, p.key[last])}, so I ${mode === 'draw' ? 'draw' : 'put'} it in the box.`}
      </PracticeNote>
      {filled >= n && <button type="button" className="btn primary big" onClick={onDone}>✋ My turn</button>}
    </div>
  );
}

// ---------- Player ----------

type Phase = 'intro' | 'demo' | 'sample' | 'countdown' | 'run';

function CdRun({ item, onSubmit, hintLevel }: PlayerProps<CdPayload, CdResponse>) {
  const p = item.payload;
  const limit = item.timeLimitSec ?? CD_DURATION;
  const [phase, setPhase] = useState<Phase>('intro');
  const [mode, setMode] = useState<CdMode>('draw');
  // timed sheet
  const [answers, setAnswers] = useState<number[]>([]);
  const answersRef = useRef<number[]>([]);
  const rotRef = useRef<number[]>([]);
  const inkRef = useRef<string[]>([]);
  const flush = useRef<(() => void) | null>(null);
  // sample
  const [pAnswers, setPAnswers] = useState<number[]>([]);
  const [pState, setPState] = useState<'idle' | 'good' | 'bad'>('idle');
  const [pWhy, setPWhy] = useState<'wrong' | 'turned' | 'unclear'>('wrong');
  const guard = useTapGuard();
  const clock = useStopwatch();
  const [submit, done] = useSubmitOnce(onSubmit);

  const finish = () => {
    flush.current?.(); // a box being drawn when time runs out still counts
    const r: CdResponse = { mode, answers: answersRef.current.slice(), elapsedSec: Math.min(limit, clock.elapsed()) };
    if (mode === 'draw') {
      r.rotated = rotRef.current.slice();
      r.ink = inkRef.current.slice();
    }
    submit(r);
  };

  const record = (next: number[]) => {
    answersRef.current = next;
    setAnswers(next);
  };

  const tapRun = (sym: number) => {
    if (done || !guard()) return;
    const next = [...answersRef.current, sym];
    record(next);
    if (next.length >= p.boxes.length) finish();
  };

  const drawRun = (i: number, strokes: Stroke[]): CommitVerdict => {
    if (i !== answersRef.current.length) return 'next';
    const c = classifyBox(p.version, strokes, p.key[p.boxes[i]]);
    rotRef.current = [...rotRef.current, c.rotation ? 1 : 0];
    inkRef.current = [...inkRef.current, strokesToPath(strokes)];
    const next = [...answersRef.current, c.answer];
    record(next);
    if (next.length >= p.boxes.length) setTimeout(finish, 0);
    return 'next';
  };
  const reopenRun = (i: number) => {
    rotRef.current = rotRef.current.slice(0, i);
    inkRef.current = inkRef.current.slice(0, i);
    record(answersRef.current.slice(0, i));
  };

  const pIdx = pAnswers.length;
  const practiceDone = pIdx >= p.practice.length;
  const tapPractice = (sym: number) => {
    if (practiceDone || !guard()) return;
    const want = p.key[p.practice[pIdx]];
    if (sym === want) {
      setPAnswers([...pAnswers, sym]);
      setPState('good');
    } else {
      setPWhy(rotationTwin(p.version, want) === sym ? 'turned' : 'wrong');
      setPState('bad');
    }
  };
  const drawPractice = (i: number, strokes: Stroke[]): CommitVerdict => {
    const want = p.key[p.practice[i]];
    const c = classifyBox(p.version, strokes, want);
    if (c.answer === want) {
      setPAnswers((a) => [...a, want]);
      setPState('good');
      return 'next';
    }
    setPWhy(c.rotation ? 'turned' : c.answer === UNRECOGNISED ? 'unclear' : 'wrong');
    setPState('bad');
    return 'retry';
  };

  const what = p.version === 'A' ? 'shape' : 'number';
  const markWord = p.version === 'A' ? 'mark' : 'symbol';
  const verb = mode === 'draw' ? 'Draw' : 'Tap';

  if (phase === 'intro') {
    return (
      <div className="stage">
        <SpeedStyles />
        <CdStyles />
        <div className="prompt">Secret Code</div>
        <KeyStrip p={p} />
        <SpeedIntro
          onStart={() => setPhase('demo')}
          startLabel="▶ Watch Pip, then try"
          extra={<ModePicker mode={mode} onChange={setMode} />}
        >
          Every {what} has a secret {markWord} in the key. {verb} the {markWord} that goes with each {what}, in order. You’ll have 2 minutes — go fast, but get them right!
        </SpeedIntro>
      </div>
    );
  }

  if (phase === 'demo') return <Demo p={p} mode={mode} onDone={() => setPhase('sample')} />;

  if (phase === 'sample') {
    const cur = p.practice[Math.min(pIdx, p.practice.length - 1)];
    const fix = `The ${targetName(p.version, cur)} gets the ${symbolName(p.version, p.key[cur])}.`;
    const note = pState === 'bad'
      ? pWhy === 'turned'
        ? `That one is turned around. ${fix} Look which way it goes, then ${mode === 'draw' ? 'draw it again' : 'try again'}.`
        : pWhy === 'unclear'
          ? `Pip couldn’t read that one. ${fix} Draw it again, nice and clear.`
          : `Not that one. ${fix}${mode === 'draw' ? ' Draw it again.' : ''}`
      : pState === 'good' ? 'Yes! Next one…' : `Find the ${targetName(p.version, cur)} in the key, then ${mode === 'draw' ? 'draw' : 'tap'} its ${markWord}.`;
    return (
      <div className="stage">
        <SpeedStyles />
        <CdStyles />
        <div className="prompt">Your turn</div>
        <KeyStrip p={p} highlight={practiceDone ? undefined : cur} />
        {mode === 'draw' ? (
          <DrawSheet
            v={p.version}
            targets={p.practice}
            codeKey={p.key}
            perRow={DRAW_PER_ROW}
            rows={2}
            pauseMs={600}
            locked={practiceDone}
            onCommit={drawPractice}
            verdictOf={() => 'good'}
          />
        ) : (
          <SheetRows p={p} boxes={p.practice} answers={pAnswers} from={0} count={1} practiceBad={pState === 'bad'} />
        )}
        {practiceDone ? (
          <ReadyCard onGo={() => setPhase('countdown')}>You’ve got it! Now the real one — 2 minutes, as many as you can.</ReadyCard>
        ) : (
          <>
            <PracticeNote state={pState}>{note}</PracticeNote>
            {mode === 'tap' && (
              <div key={`${pIdx}-${pState}`} className={pState === 'bad' ? 'spd-shake' : ''} style={{ width: '100%', display: 'grid', placeItems: 'center' }}>
                <Palette v={p.version} onTap={tapPractice} />
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  if (phase === 'countdown') {
    return (
      <div className="stage">
        <SpeedStyles />
        <CdStyles />
        <KeyStrip p={p} />
        <ReadySetGo onDone={() => { clock.start(); setPhase('run'); }} />
      </div>
    );
  }

  const highlight = hintLevel >= 1 && !done && answers.length < p.boxes.length ? p.boxes[answers.length] : undefined;
  if (mode === 'draw') {
    return (
      <div className="stage" style={{ gap: 12 }}>
        <SpeedStyles />
        <CdStyles />
        <SheetBar seconds={limit} running={!done} onExpire={finish} done={answers.length} />
        <KeyStrip p={p} highlight={highlight} />
        <DrawSheet
          v={p.version}
          targets={p.boxes}
          codeKey={p.key}
          perRow={DRAW_PER_ROW}
          rows={3}
          locked={done}
          onCommit={drawRun}
          onReopen={reopenRun}
          flushRef={flush}
        />
        {done && <SheetDone />}
      </div>
    );
  }

  const curRow = Math.floor(Math.min(answers.length, p.boxes.length - 1) / p.perRow);
  const from = Math.max(0, curRow - 1);
  return (
    <div className="stage" style={{ gap: 12 }}>
      <SpeedStyles />
      <SheetBar seconds={limit} running={!done} onExpire={finish} done={answers.length} />
      <KeyStrip p={p} highlight={highlight} />
      <SheetRows p={p} boxes={p.boxes} answers={answers} from={from} count={3} />
      {done ? <SheetDone /> : <Palette v={p.version} onTap={tapRun} />}
    </div>
  );
}

function InkReview({ p, answers, ink }: { p: CdPayload; answers: number[]; ink: string[] }) {
  const rows: number[][] = [];
  for (let s = 0; s < answers.length; s += DRAW_PER_ROW) rows.push(Array.from({ length: Math.min(DRAW_PER_ROW, answers.length - s) }, (_, k) => s + k));
  return (
    <div className="stack" style={{ gap: 6, alignItems: 'center', width: '100%', maxWidth: 480 }}>
      {rows.map((row) => (
        <div key={row[0]} className="row" style={{ gap: 6, flexWrap: 'nowrap', width: '100%', justifyContent: 'center' }}>
          {row.map((i) => {
            const t = p.boxes[i];
            const good = answers[i] === p.key[t];
            const layer = <Ink d={ink[i] ?? ''} color={good ? INK : BAD_INK} />;
            return (
              <div key={i} aria-label={`${targetName(p.version, t)}, ${good ? 'right' : 'mix-up'}`}
                style={{ flex: '1 1 0', minWidth: 0, maxWidth: 72, border: good ? '2px solid var(--ink)' : '2px solid var(--bad)', borderRadius: 8,
                  background: good ? 'var(--good-bg)' : 'var(--bad-bg)', overflow: 'hidden' }}>
                {p.version === 'A' ? (
                  <div style={{ aspectRatio: '1' }}><ShapeBox shape={CD_SHAPES[t]}>{layer}</ShapeBox></div>
                ) : (
                  <>
                    <div style={{ textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, lineHeight: '22px', borderBottom: '2px solid var(--ink)' }}>{t + 1}</div>
                    <div style={{ aspectRatio: '1' }}><svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden style={{ display: 'block' }}>{layer}</svg></div>
                  </>
                )}
              </div>
            );
          })}
          {Array.from({ length: DRAW_PER_ROW - row.length }, (_, k) => <div key={`pad${k}`} style={{ flex: '1 1 0', maxWidth: 72 }} />)}
        </div>
      ))}
    </div>
  );
}

function CdReview({ item, reveal }: PlayerProps<CdPayload, CdResponse>) {
  const p = item.payload;
  const response = reveal?.response ?? null;
  const answers = (response?.answers ?? []).slice(0, p.boxes.length);
  const meta = reveal?.outcome.meta ?? {};
  const rows = Math.ceil(answers.length / p.perRow);
  const drawn = response?.mode === 'draw' && Array.isArray(response.ink);
  const stats = [
    { label: 'right', value: meta.correct ?? 0 },
    { label: 'mix-ups', value: meta.errors ?? 0 },
    ...(meta.rotationErrors ? [{ label: 'turned', value: meta.rotationErrors }] : []),
    { label: 'seconds', value: Math.round(meta.durationSec ?? 0) },
  ];
  return (
    <div className="stage">
      <SpeedStyles />
      <CdStyles />
      <SpeedSummary stats={stats} />
      {response && <span className="chip">{drawn ? '✏️ Drawn' : '👆 Tapped'}</span>}
      <KeyStrip p={p} />
      {drawn
        ? answers.length > 0 && <InkReview p={p} answers={answers} ink={response.ink ?? []} />
        : rows > 0 && <SheetRows p={p} boxes={p.boxes} answers={answers} from={0} count={rows} review />}
    </div>
  );
}

export function Player(props: PlayerProps<CdPayload, CdResponse>) {
  return props.reveal ? <CdReview {...props} /> : <CdRun {...props} />;
}

// ---------- guide ----------

export const guide: SubtestGuide = {
  kidIntro: 'Secret Code! Every shape (or number) has its own secret mark. Look at the key and draw each box’s mark — as fast as you can!',
  howToPlay: [
    'Look at the key at the top: each shape or number has a secret mark.',
    'Pip shows you a few, then you try six. Fix any that Pip says are wrong.',
    'Then the clock starts. Draw the mark in the glowing box with your finger (or tap it, in tap mode).',
    'Lift your finger and the next box lights up. Keep going until the time runs out!',
    'No erasing, just like with a pencil — “↩ Redo last box” fixes only the box you just did.',
  ],
  strategies: [
    { title: 'Learn the busy pairs', tip: 'After a few boxes, whisper the pairs you keep using (“star–plus, circle–dot”) so you don’t need the key every time.' },
    { title: 'Make a picture story', tip: 'Link each pair with a tiny story: the circle has a dot like an eye, the star wears a plus like a sparkle. Stories stick!' },
    { title: 'Small and quick marks', tip: 'The mark only needs to be clear, not beautiful. One quick, neat stroke beats a slow, perfect one.' },
    { title: 'Look one ahead', tip: 'While your finger draws in this box, your eyes are already on the next one.' },
    { title: 'Peek, don’t stare', tip: 'When you check the key, jump straight to the one you need instead of reading the whole key.' },
    { title: 'Don’t fix, just go', tip: 'There’s no eraser. If one goes wrong, let it go and make the next box right.' },
    { title: 'Check the direction', tip: 'Some marks are the same thing turned (| and —, ^ and >, T and ⊥). Ask “which way does it point?”' },
  ],
  parentNotes:
    'Coding measures processing speed: how quickly and accurately a child can do a simple visual task — here, learning symbol pairs from a key and copying them. It draws on visual scanning, short-term associative learning, attention and fine-motor (pencil) speed. Coding and Symbol Search together form the Processing Speed Index (PSI), and Coding is one of the seven subtests behind the Full Scale IQ. Children under 8 get the shapes version (A); 8 and up get the number–symbol version (B). The score is boxes coded correctly in 2 minutes; mistakes are not subtracted but are tracked, including “rotation errors” (a mark drawn turned or mirrored). The default “Draw it” mode is closest to the real paper task: the child draws each mark and the app reads it (unclear marks count as mistakes). “Tap it” mode is easier and faster — the publisher withdrew its tap-based digital version because it inflated scores — so tap scores are scaled to 80% of the boxes done. For the closest practice, also try paper and pencil.',
  commonMistakes: [
    'Looking back at the key for every single box instead of learning the common pairs.',
    'Turned marks (— for |, > for ^, ⊥ for T) — called rotation errors.',
    'Drawing slowly and perfectly: a quick, clear mark is all that’s needed.',
    'Slowing right down to be perfect, or rushing so fast that mix-ups pile up.',
    'Losing the place when a new row starts.',
    'Stopping after a mistake instead of carrying on.',
  ],
  everydayActivities: [
    'Make a secret-code alphabet together (☆ = A, ○ = B …) and write short messages to decode.',
    '“Code race” on paper: give each number a doodle, then race to fill in a row of numbers with a sand timer.',
    'Copy bead, LEGO or sticker patterns from a model as quickly as you can.',
    'Timed mazes, dot-to-dots and tracing pages for pencil speed.',
    'Quick sorting races: socks, cutlery or coins into piles before the timer ends.',
  ],
};

export const Coding: SubtestModule<CdPayload, CdResponse> = {
  id: 'CD',
  generate,
  score,
  Player,
  guide,
};

export default Coding;
