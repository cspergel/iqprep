/**
 * Symbol Search ("Symbol Spy"). Each row shows target symbol(s) and a search group; the child taps the
 * symbol that matches a target, or NO. Version A (under 8): 1 target, 3 in the group. Version B (8+):
 * 2 targets, 5 in the group. 120 s. Raw score = correct − incorrect (floor 0), as on the real subtest.
 * Process scores (meta): setErrors = taps on a look-alike with one part changed; rotationErrors = taps
 * on a turned or mirrored copy of a target.
 * Like the digital version: the 3 sample rows must be answered correctly before the timed part (a
 * wrong sample gets a hint and a retry; after two misses the right answer glows), and the timed sheet
 * shows ONE active row with the previous and next rows faded and inert above and below it, scrolling
 * up smoothly after each tap (no page turns).
 */
import { useRef, useState } from 'react';
import { createRng, type Rng } from '../../core/rng';
import type { GenerateRequest, Item, PlayerProps, ScoreOutcome, SubtestGuide, SubtestModule } from '../../core/types';
import {
  PracticeNote, ReadyCard, ReadySetGo, SheetBar, SheetDone, SpeedIntro, SpeedStyles, SpeedSummary, TapButton,
  accurateSheet, clampElapsed, useStopwatch, useSubmitOnce, useTapGuard,
} from '../CD/speedKit';
import { FAMILY_COUNT, GLYPH_COUNT, SsGlyph, baseGlyph, glyphFamily, isSetAlt, rotationTwins, setTwin } from './glyphs';

export type SsVersion = 'A' | 'B';
export interface SsRow {
  targets: number[];
  search: number[];
  /** Index of the matching symbol in `search`, or −1 when the answer is NO. */
  answer: number;
}
export interface SsPayload {
  version: SsVersion;
  rows: SsRow[];
  practice: SsRow[];
}
/** answers[i] = index tapped in row i's search group, or −1 for NO. Length = rows attempted. */
export interface SsResponse {
  answers: number[];
  elapsedSec: number;
}

export const SS_DURATION = 120;
export const SS_ROWS: Record<SsVersion, number> = { A: 50, B: 60 };
export const SS_SPEC: Record<SsVersion, { targets: number; group: number }> = { A: { targets: 1, group: 3 }, B: { targets: 2, group: 5 } };
const LOOKALIKE_RATE = 0.6;
/** Wrong tries on one sample row before the right answer glows. */
export const SS_HINT_AFTER = 2;

/** Kind of look-alike distractor planted in a row. */
export type SsLookalike = 'rotation' | 'set';
/** What a tapped wrong symbol was: a turned/mirrored copy of a target, a changed-part look-alike, or neither. */
export type SsTapKind = 'rotation' | 'set' | 'other';

/** Classifies a symbol that is not a target, against the row's targets. */
export function tapKind(row: SsRow, glyph: number): SsTapKind {
  const t = row.targets.find((x) => glyphFamily(x) === glyphFamily(glyph));
  if (t === undefined) return 'other';
  return isSetAlt(t) === isSetAlt(glyph) ? 'rotation' : 'set';
}

export function ssVersion(age: number): SsVersion {
  return age < 8 ? 'A' : 'B';
}

export function makeRow(rng: Rng, version: SsVersion, hasMatch: boolean, lookalike: SsLookalike | false): SsRow {
  const { targets: nt, group } = SS_SPEC[version];
  const fams = rng.sample(Array.from({ length: FAMILY_COUNT }, (_, i) => i), nt);
  const targets = fams.map((f) => baseGlyph(f, rng.int(0, 2)));
  const chosen: number[] = [];
  if (hasMatch) chosen.push(rng.pick(targets));
  if (lookalike) {
    const t = rng.pick(targets);
    chosen.push(lookalike === 'rotation' ? rng.pick(rotationTwins(t)) : setTwin(t));
  }
  const pool: number[] = [];
  for (let g = 0; g < GLYPH_COUNT; g++) if (!fams.includes(glyphFamily(g))) pool.push(g);
  const search = rng.shuffle([...chosen, ...rng.sample(pool, group - chosen.length)]);
  return { targets, search, answer: hasMatch ? search.findIndex((g) => targets.includes(g)) : -1 };
}

export function generate(req: GenerateRequest): Item<SsPayload> {
  const version = ssVersion(req.age);
  const rng = createRng(req.seed);
  const n = SS_ROWS[version];
  // Exactly half of the rows contain a match, in random order.
  const matches = rng.shuffle(Array.from({ length: n }, (_, i) => i < n / 2));
  const rows = matches.map((m) => {
    const kind: SsLookalike | false = rng.chance(LOOKALIKE_RATE) ? (rng.chance(0.5) ? 'rotation' : 'set') : false;
    return makeRow(rng, version, m, kind);
  });
  const practice = [makeRow(rng, version, true, false), makeRow(rng, version, false, 'rotation'), makeRow(rng, version, true, 'set')];
  const age = Math.max(3, Math.min(18, req.age));
  const one = version === 'A';
  return {
    id: `SS:${version}:${req.seed}`,
    subtest: 'SS',
    difficulty: age,
    seed: req.seed,
    payload: { version, rows, practice },
    maxPoints: rows.length,
    timeLimitSec: SS_DURATION,
    skills: [`ss:${version}`, 'ss:lookalike', 'ss:rotation'],
    hints: [
      `Look hard at the ${one ? 'target' : 'two targets'} first, then check the group from left to right.`,
      'Some symbols are flipped or turned, and some have one tiny part changed — “almost the same” isn’t the same.',
      'Decide and move on. Wrong taps take a point away, so don’t guess wildly — but don’t stall either.',
    ],
    explanation: one
      ? 'In each row you checked whether the target symbol was hiding in the group. Your score is right answers minus wrong ones.'
      : 'In each row you checked whether either target symbol was hiding in the group. Your score is right answers minus wrong ones.',
    speak: one
      ? 'Look at the symbol in the yellow box. If it is in the row, tap it. If it is not there, tap NO. Go fast, but be careful — wrong taps take points away.'
      : 'Look at the two symbols in the yellow box. If one of them is in the row, tap it. If neither is there, tap NO. Go fast, but be careful — wrong taps take points away.',
  };
}

export function score(item: Item<SsPayload>, response: SsResponse | null): ScoreOutcome {
  const rows = item.payload.rows;
  const limit = item.timeLimitSec ?? SS_DURATION;
  if (!response || !Array.isArray(response.answers)) {
    return { points: 0, correct: false, meta: { correct: 0, errors: 0, durationSec: limit, attempted: 0, setErrors: 0, rotationErrors: 0 } };
  }
  let correct = 0;
  let errors = 0;
  let setErrors = 0;
  let rotationErrors = 0;
  response.answers.slice(0, rows.length).forEach((a, i) => {
    const row = rows[i];
    if (typeof a !== 'number' || !Number.isInteger(a) || a < -1 || a >= row.search.length) return; // not a real answer
    if (a === row.answer) correct++;
    else {
      errors++;
      if (a >= 0) {
        const kind = tapKind(row, row.search[a]);
        if (kind === 'set') setErrors++;
        else if (kind === 'rotation') rotationErrors++;
      }
    }
  });
  const points = Math.max(0, correct - errors);
  const durationSec = clampElapsed(response.elapsedSec, limit);
  let feedback: string | undefined;
  if (correct + errors > 0) {
    feedback = errors === 0 ? `${correct} rows, all right — sharp spy eyes!` : `${correct} right and ${errors} wrong, so your score is ${points}.`;
    if (rotationErrors > 0) feedback += ` ${rotationErrors === 1 ? 'One tap was' : `${rotationErrors} taps were`} a flipped or turned copy — check which way it points.`;
    if (setErrors > 0) feedback += ` ${setErrors === 1 ? 'One tap was' : `${setErrors} taps were`} a look-alike with one part changed — check every little part.`;
  }
  return {
    points,
    correct: accurateSheet(correct, errors),
    meta: { correct, errors, durationSec, attempted: correct + errors, setErrors, rotationErrors },
    feedback,
  };
}

// ---------- Player ----------

function Targets({ row, small }: { row: SsRow; small?: boolean }) {
  const s = small ? 40 : 64;
  return (
    <div
      className="row"
      aria-label={row.targets.length === 1 ? 'Target symbol' : 'Two target symbols'}
      style={{ gap: 8, flexWrap: 'nowrap', padding: small ? 4 : 8, border: 'var(--border)', borderRadius: 14, background: 'var(--warn-bg)' }}
    >
      {row.targets.map((g, i) => (
        <div key={i} style={{ width: s, height: s, background: 'var(--card)', border: '2px solid var(--ink)', borderRadius: 10, padding: 4 }}>
          <SsGlyph id={g} />
        </div>
      ))}
    </div>
  );
}

const SS_CSS = `
@keyframes ss-scroll { from { transform: translateY(46px); opacity: .6; } to { transform: none; opacity: 1; } }
.ss-scroll { animation: ss-scroll .15s ease-out both; }
.ss-hint { box-shadow: 0 0 0 5px var(--sun); animation: ss-glow .9s ease-in-out infinite alternate; }
@keyframes ss-glow { from { box-shadow: 0 0 0 3px var(--sun); } to { box-shadow: 0 0 0 7px var(--sun); } }
.ss-faded { opacity: .28; filter: grayscale(1); pointer-events: none; user-select: none; -webkit-user-select: none; }
@media (prefers-reduced-motion: reduce) { .ss-scroll, .ss-hint { animation: none; } }
`;

function RowBoard({ row, onTap, shake, disabled, hint, animate = 'spd-in' }: {
  row: SsRow; onTap: (a: number) => void; shake?: boolean; disabled?: boolean;
  /** Make the right answer glow (a sample hint after repeated misses). */
  hint?: boolean;
  animate?: string;
}) {
  const n = row.search.length;
  const glow = (a: number) => (hint && row.answer === a ? 'ss-hint' : undefined);
  return (
    <div className={`stack ${shake ? 'spd-shake' : animate}`} style={{ alignItems: 'center', width: '100%', maxWidth: 520 }} data-ss-row="active">
      <Targets row={row} />
      <div className="spd-pal" style={{ gridTemplateColumns: `repeat(${n}, minmax(56px, 1fr))`, maxWidth: n * 92 }}>
        {row.search.map((g, i) => (
          <TapButton key={i} onTap={() => onTap(i)} disabled={disabled} ariaLabel={`Symbol ${i + 1}`} className={glow(i)} style={{ aspectRatio: '1', padding: 6 }}>
            <SsGlyph id={g} />
          </TapButton>
        ))}
      </div>
      <TapButton
        onTap={() => onTap(-1)}
        disabled={disabled}
        ariaLabel="No, it is not there"
        className={glow(-1)}
        style={{ width: '100%', maxWidth: 260, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.5rem', background: 'var(--paper-2)' }}
      >
        NO ✋
      </TapButton>
    </div>
  );
}

/** A neighbour row: one compact, faded, inert line (targets │ group │ NO), like the digital layout. */
function FadedRow({ row, which, picked }: { row: SsRow; which: 'prev' | 'next'; picked?: number }) {
  const cell = (g: number, key: number, mark?: boolean) => (
    <div key={key} style={{ width: 30, height: 30, padding: 2, borderRadius: 6, border: `2px solid ${mark ? 'var(--ink)' : 'transparent'}` }}>
      <SsGlyph id={g} />
    </div>
  );
  return (
    <div className="row ss-faded" aria-hidden data-ss-row={which}
      style={{ gap: 4, flexWrap: 'nowrap', justifyContent: 'center', padding: '4px 8px', border: '2px dashed var(--line)', borderRadius: 12, maxWidth: '100%', overflow: 'hidden' }}>
      {row.targets.map((g, i) => cell(g, 100 + i))}
      <span style={{ width: 2, alignSelf: 'stretch', background: 'var(--ink)', margin: '0 4px' }} />
      {row.search.map((g, i) => cell(g, i, picked === i))}
      <span className="chip" style={{ marginLeft: 4, borderColor: picked === -1 ? 'var(--ink)' : undefined }}>NO</span>
    </div>
  );
}

function practiceTip(row: SsRow, a: number): string {
  if (row.answer >= 0 && a === -1) return 'Look again — one of them IS exactly the same. Find it!';
  const kind = a >= 0 ? tapKind(row, row.search[a]) : 'other';
  if (kind === 'rotation') return 'Close! That one is flipped or turned. Look for the exact same one, pointing the same way.';
  if (kind === 'set') return 'Close! That one is almost the same, but one little part is different. Check every part.';
  if (row.answer === -1) return 'Check each one closely — none of them is exactly the same, so tap NO.';
  return 'That one doesn’t match. Compare each symbol with the yellow box.';
}

type Phase = 'intro' | 'practice' | 'countdown' | 'run';

function SsRun({ item, onSubmit }: PlayerProps<SsPayload, SsResponse>) {
  const p = item.payload;
  const limit = item.timeLimitSec ?? SS_DURATION;
  const [phase, setPhase] = useState<Phase>('intro');
  const [count, setCount] = useState(0);
  const answersRef = useRef<number[]>([]);
  const [pIdx, setPIdx] = useState(0);
  const [pState, setPState] = useState<{ s: 'idle' | 'good' | 'bad'; tip?: string; n: number }>({ s: 'idle', n: 0 });
  /** Misses on the current sample row: after 2 the right answer glows. */
  const [pMiss, setPMiss] = useState(0);
  const guard = useTapGuard(180);
  const clock = useStopwatch();
  const [submit, done] = useSubmitOnce(onSubmit);
  const one = p.version === 'A';

  const finish = () => submit({ answers: answersRef.current.slice(), elapsedSec: Math.min(limit, clock.elapsed()) });

  const tapRun = (a: number) => {
    if (done || !guard()) return;
    answersRef.current = [...answersRef.current, a];
    setCount(answersRef.current.length);
    if (answersRef.current.length >= p.rows.length) finish();
  };

  const tapPractice = (a: number) => {
    if (pIdx >= p.practice.length || !guard()) return;
    const row = p.practice[pIdx];
    if (a === row.answer) {
      setPIdx(pIdx + 1);
      setPMiss(0);
      setPState({ s: 'good', n: pState.n + 1, tip: row.answer === -1 ? 'Yes! None matched, so NO was right.' : 'Yes! That’s the exact same one.' });
    } else {
      const miss = pMiss + 1;
      setPMiss(miss);
      const tip = practiceTip(row, a) + (miss >= SS_HINT_AFTER ? ' Look at the glowing one — then tap it.' : ' Try again!');
      setPState({ s: 'bad', n: pState.n + 1, tip });
    }
  };

  if (phase === 'intro') {
    return (
      <div className="stage">
        <SpeedStyles />
        <div className="prompt">Symbol Spy</div>
        <SpeedIntro onStart={() => setPhase('practice')}>
          {one
            ? 'Spy check! Is the yellow-box symbol hiding in the row? Tap it — or tap NO if it isn’t there.'
            : 'Spy check! Is either yellow-box symbol hiding in the row? Tap it — or tap NO if neither is there.'}{' '}
          Careful: some sneaky ones are flipped, or have one little part changed!
        </SpeedIntro>
      </div>
    );
  }

  if (phase === 'practice') {
    const finished = pIdx >= p.practice.length;
    return (
      <div className="stage">
        <SpeedStyles />
        <style>{SS_CSS}</style>
        <div className="prompt">Practice {Math.min(pIdx + 1, p.practice.length)} of {p.practice.length}</div>
        {finished ? (
          <ReadyCard onGo={() => setPhase('countdown')}>Great spying! Now the real one — 2 minutes, as many rows as you can.</ReadyCard>
        ) : (
          <>
            <PracticeNote state={pState.s}>
              {pState.tip ?? (one ? 'Is the yellow-box symbol in the row? Tap it, or tap NO.' : 'Is either yellow-box symbol in the row? Tap it, or tap NO.')}
            </PracticeNote>
            <RowBoard key={`${pIdx}-${pState.n}`} row={p.practice[pIdx]} onTap={tapPractice} shake={pState.s === 'bad'} hint={pMiss >= SS_HINT_AFTER} />
          </>
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

  const prev = count > 0 ? p.rows[count - 1] : undefined;
  const next = p.rows[count + 1];
  return (
    <div className="stage" style={{ gap: 14 }}>
      <SpeedStyles />
      <style>{SS_CSS}</style>
      <SheetBar seconds={limit} running={!done} onExpire={finish} done={count} />
      {done ? (
        <SheetDone />
      ) : (
        // One active row; the answered row above and the coming row below are faded and inert.
        // The whole strip slides up a row's height after each tap (no page turns).
        <div key={count} className="stack ss-scroll" style={{ alignItems: 'center', width: '100%', gap: 10 }}>
          {prev ? <FadedRow row={prev} which="prev" picked={answersRef.current[count - 1]} /> : <div style={{ height: 38 }} aria-hidden />}
          <RowBoard row={p.rows[count]} onTap={tapRun} animate="" />
          {next && <FadedRow row={next} which="next" />}
        </div>
      )}
    </div>
  );
}

function SsReview({ item, reveal }: PlayerProps<SsPayload, SsResponse>) {
  const p = item.payload;
  const answers = (reveal?.response?.answers ?? []).slice(0, p.rows.length);
  const meta = reveal?.outcome.meta ?? {};
  const misses = answers.map((a, i) => ({ a, i })).filter(({ a, i }) => a !== p.rows[i].answer).slice(0, 4);
  return (
    <div className="stage">
      <SpeedStyles />
      <SpeedSummary
        stats={[
          { label: 'right', value: meta.correct ?? 0 },
          { label: 'wrong', value: meta.errors ?? 0 },
          { label: 'turned slips', value: meta.rotationErrors ?? 0 },
          { label: 'look-alike slips', value: meta.setErrors ?? 0 },
          { label: 'seconds', value: Math.round(meta.durationSec ?? 0) },
        ]}
      />
      {misses.length > 0 && (
        <div className="stack" style={{ width: '100%', maxWidth: 560 }}>
          <div className="small muted center">Rows to look at again (green = right answer, red = your tap)</div>
          {misses.map(({ a, i }) => {
            const row = p.rows[i];
            return (
              <div key={i} className="row card flat" style={{ padding: 8, gap: 8, flexWrap: 'nowrap', justifyContent: 'center' }}>
                <Targets row={row} small />
                <span aria-hidden>→</span>
                {row.search.map((g, j) => (
                  <div key={j} style={{ width: 40, height: 40, padding: 3, borderRadius: 8,
                    border: `3px solid ${j === row.answer ? 'var(--good)' : j === a ? 'var(--bad)' : 'transparent'}` }}>
                    <SsGlyph id={g} />
                  </div>
                ))}
                <span className="chip" style={{ borderColor: row.answer === -1 ? 'var(--good)' : a === -1 ? 'var(--bad)' : 'var(--ink)' }}>NO</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Player(props: PlayerProps<SsPayload, SsResponse>) {
  return props.reveal ? <SsReview {...props} /> : <SsRun {...props} />;
}

// ---------- guide ----------

export const guide: SubtestGuide = {
  kidIntro: 'Symbol Spy! Look at the secret symbol, then spy on the row: is it hiding there? Tap it, or tap NO.',
  howToPlay: [
    'First 3 practice rows — get each one right to start (a wrong try gets a tip, then try again).',
    'Look at the symbol (or two symbols) in the yellow box.',
    'Check the row. If you see the exact same symbol, tap it.',
    'If it isn’t there, tap NO.',
    'Only the middle row is live — the rows above and below are faded. After each tap the next row slides up. Keep going until the time runs out!',
  ],
  strategies: [
    { title: 'Left to right, once', tip: 'Check each symbol one time, from left to right, like reading. No zig-zagging back and forth.' },
    { title: 'Shape first, then direction', tip: 'First ask “is it the same shape?” Only if yes, ask “does it point the same way?” Most symbols drop out at step one.' },
    { title: 'Find the odd part', tip: 'Pick one special part of the target — a dot, a hook, a corner — and hunt just for that part.' },
    { title: 'Yes or no, then go', tip: 'Say “yes” or “no” in your head the moment you know, tap, and move on. Staring longer rarely changes the answer.' },
    { title: 'NO is a real answer', tip: 'About half the rows have no match. Tapping NO quickly is just as good as finding one.' },
    { title: 'One target at a time', tip: 'With two targets, you can check the row for the first one, then for the second — or hold both in mind. Try both ways and see which is faster for you.' },
  ],
  parentNotes:
    'Symbol Search measures processing speed — how quickly a child can scan and compare simple visual information and make accurate same/different decisions. It also taps visual discrimination (telling look-alike, mirrored and rotated symbols apart), attention and decision speed. Together with Coding it makes up the Processing Speed Index (PSI). Children under 8 get version A (one target, three symbols); 8 and up get version B (two targets, five symbols). Because wrong answers are subtracted from right ones, impulsive guessing does not pay — steady, accurate scanning does. “Turned slips” (rotation errors) count taps on a flipped or turned copy of a target; “look-alike slips” (set errors) count taps on a symbol that matches a target except for one changed part.',
  commonMistakes: [
    'Tapping a flipped or turned copy of the target (rotation error) or a look-alike with one part changed (set error).',
    'Checking the row again and again out of worry instead of deciding.',
    'Forgetting that NO is an answer and searching too long when nothing matches.',
    'Racing so fast that wrong answers cancel out the right ones.',
  ],
  everydayActivities: [
    'Spot-the-difference and Where’s-Waldo-style search books, against a sand timer.',
    '“I spy” races: who can find the matching sign, letter or shape first on a walk or car ride.',
    'Card games like Snap or Spot It/Dobble that reward quick matching.',
    'Find the matching sock, puzzle piece or LEGO brick from a pile as fast as possible.',
    'Compare two similar pictures or two rows of letters (b d p q) and say “same” or “different”.',
  ],
};

export const SymbolSearch: SubtestModule<SsPayload, SsResponse> = {
  id: 'SS',
  generate,
  score,
  Player,
  guide,
};

export default SymbolSearch;
