/**
 * Shared engine for the naming-speed games (NSL "Speedy Namer", NSQ "Quick Count").
 * The real tasks are spoken, so there are two ways to play:
 *  - Grown-up timer: the child names each picture aloud; a grown-up taps Start/Stop and taps any
 *    picture named wrong.
 *  - Tap mode (solo): the child taps the matching answer button for each picture, in order.
 * Like the real tasks, every item is a short untimed sample page (must be finished) and then TWO
 * trials: two short sheets of the same kind, each timed separately, with a breather card between.
 * Points = pictures named correctly over both trials, meta.durationSec = total seconds over both
 * trials; the app's speeded scoring (scaledFromSpeeded) turns that into a per-minute rate for the
 * NSL/NSQ norms. meta.ratePerMin carries the same rate for display.
 */
import { useRef, useState, type ReactNode } from 'react';
import type { ScoreOutcome } from '../../core/types';
import {
  PracticeNote, ReadyCard, ReadySetGo, SheetBar, SpeedIntro, SpeedStyles, SpeedSummary, TapButton,
  accurateSheet, clampElapsed, useStopwatch, useSubmitOnce, useTapGuard,
} from '../CD/speedKit';

export type NamingMode = 'tap' | 'adult';
/** One timed sheet (trial). */
export interface NamingTrial {
  /** Tap mode: the answer key tapped for each picture, in order (length = pictures attempted). */
  answers?: string[];
  /** Grown-up mode: indices of pictures named wrong. */
  wrong?: number[];
  /** Grown-up mode: how many pictures were named (from the start of the sheet). */
  reached?: number;
  elapsedSec: number;
}
export interface NamingResponse {
  mode: NamingMode;
  /** One entry per trial, in order. */
  trials: NamingTrial[];
}

/** Time cap for ONE trial (sheet). */
export const NAMING_LIMIT = 60;
/** Trials per item (the real tasks give each item twice). */
export const NAMING_TRIALS = 2;
/** Pictures on the untimed sample page. */
export const NAMING_SAMPLE = 6;
/** Upper bound for the displayed per-minute rate (2.5 per second). */
export const RATE_CAP = 150;
/** Nobody names a picture in under a quarter second; protects the rate from a mis-tapped Stop. */
const MIN_SEC_PER_ITEM = 0.25;

export function namingRate(correct: number, durationSec: number): number {
  if (correct <= 0 || durationSec <= 0) return 0;
  return Math.min(RATE_CAP, Math.round((correct * 60) / durationSec));
}

/** The trials of a response (tolerates an older single-sheet response shape). */
export function trialsOf(r: NamingResponse | null | undefined): NamingTrial[] {
  if (!r) return [];
  if (Array.isArray(r.trials)) return r.trials.filter((t) => t && typeof t === 'object');
  const legacy = r as unknown as NamingTrial;
  return legacy.answers || legacy.reached !== undefined || legacy.wrong ? [legacy] : [];
}

const attrKey = (a: string) => `${a}Errors`;

/**
 * Scores both trials. `sheets[t]` = the answer keys of trial t, `limitSec` = the cap of one trial.
 * `attributes` names the words of a multi-word answer (e.g. ['size', 'color', 'object']): in tap mode
 * every wrong word adds to that attribute's error count (meta.sizeErrors…). Grown-up mode can't tell
 * which word was wrong, so those counts are 0 there.
 */
export function scoreNaming(sheets: string[][], limitSec: number, r: NamingResponse | null, attributes: string[] = []): ScoreOutcome {
  const attrZero = Object.fromEntries(attributes.map((a) => [attrKey(a), 0]));
  const trials = r && (r.mode === 'tap' || r.mode === 'adult') ? trialsOf(r).slice(0, sheets.length) : [];
  if (!r || trials.length === 0) {
    return {
      points: 0, correct: false,
      meta: { correct: 0, errors: 0, durationSec: limitSec * sheets.length, mode: r?.mode === 'adult' ? 1 : 0, attempted: 0, ratePerMin: 0, trials: 0, ...attrZero },
    };
  }
  let correct = 0;
  let errors = 0;
  let attempted = 0;
  let durationSec = 0;
  const attrErr: Record<string, number> = { ...attrZero };
  const perTrial: Record<string, number> = {};
  trials.forEach((t, ti) => {
    const expected = sheets[ti];
    const n = expected.length;
    let c = 0;
    let e = 0;
    let a = 0;
    if (r.mode === 'adult') {
      const reachedRaw = typeof t.reached === 'number' && Number.isFinite(t.reached) ? Math.floor(t.reached) : n;
      a = Math.max(0, Math.min(n, reachedRaw));
      e = new Set((t.wrong ?? []).filter((i) => Number.isInteger(i) && i >= 0 && i < a)).size;
      c = a - e;
    } else {
      (t.answers ?? []).slice(0, n).forEach((ans, i) => {
        if (typeof ans !== 'string' || ans === '') return;
        a++;
        if (ans === expected[i]) { c++; return; }
        e++;
        if (attributes.length > 0) {
          const got = ans.split(' ');
          const want = expected[i].split(' ');
          attributes.forEach((name, j) => { if (got[j] !== want[j]) attrErr[attrKey(name)]++; });
        }
      });
    }
    const sec = Math.round(Math.max(Math.max(1, a * MIN_SEC_PER_ITEM), clampElapsed(t.elapsedSec, limitSec)) * 10) / 10;
    correct += c;
    errors += e;
    attempted += a;
    durationSec += sec;
    perTrial[`trial${ti + 1}Correct`] = c;
    perTrial[`trial${ti + 1}Sec`] = sec;
  });
  durationSec = Math.round(durationSec * 10) / 10;
  const ratePerMin = namingRate(correct, durationSec);
  return {
    points: correct,
    correct: accurateSheet(correct, errors),
    meta: { correct, errors, durationSec, mode: r.mode === 'adult' ? 1 : 0, attempted, ratePerMin, trials: trials.length, ...perTrial, ...attrErr },
    feedback: attempted > 0
      ? `${correct} named right in ${Math.round(durationSec)} seconds — that’s ${ratePerMin} a minute!${errors ? ` (${errors} slip${errors === 1 ? '' : 's'})` : ''}`
      : undefined,
  };
}

/// ---------- Player ----------

export interface NamingOption {
  key: string;
  label: ReactNode;
  aria: string;
}

/** Which page a picture is on: a trial index (0, 1) or the sample page. */
export type SheetRef = number | 'sample';

export interface NamingConfig {
  title: string;
  /** Pip's intro (before the mode choice). */
  intro: ReactNode;
  /** Answer keys per trial sheet. */
  sheets: string[][];
  /** Answer keys of the untimed sample page. */
  sampleExpected: string[];
  cols: number;
  /** Visual for picture i of a page; fills a square. */
  renderCell: (i: number, sheet: SheetRef) => ReactNode;
  /** Answer groups for picture i. One group = one tap; two groups = pick one from each (e.g. colour + shape). */
  groupsFor: (i: number, sheet: SheetRef) => NamingOption[][];
  /** How to say an answer key out loud, e.g. "red circle". */
  say: (key: string) => string;
  /** Where the sheet changes kind (e.g. colours → shapes); a divider is drawn before these indices. */
  breaks?: number[];
  /** Time cap of one trial. */
  limitSec: number;
  /** Optional per-attribute slip labels for the review, e.g. { size: 'size', color: 'colour' }. */
  attributeLabels?: Record<string, string>;
}

type Phase = 'intro' | 'sample' | 'countdown' | 'run' | 'reach' | 'pause';
type CellState = 'todo' | 'now' | 'done' | 'wrong';

function Cell({ children, state, onTap, label }: {
  children: ReactNode; state: CellState; onTap?: () => void; label: string;
}) {
  const style = {
    aspectRatio: '1', minWidth: 0, minHeight: 0, padding: 3, borderRadius: 10,
    border: state === 'now' ? '3px solid var(--ink)' : state === 'wrong' ? '3px solid var(--bad)' : '2px solid var(--line)',
    background: state === 'now' ? 'var(--warn-bg)' : state === 'wrong' ? 'var(--bad-bg)' : 'var(--card)',
    opacity: state === 'done' ? 0.4 : 1,
    boxShadow: 'none',
    position: 'relative' as const,
  };
  const inner = (
    <>
      <div style={{ width: '100%', height: '100%' }}>{children}</div>
      {state === 'wrong' && (
        <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }} aria-hidden>
          <line x1={18} y1={82} x2={82} y2={18} stroke="#c8435a" strokeWidth={9} strokeLinecap="round" />
        </svg>
      )}
    </>
  );
  if (onTap) return <TapButton onTap={onTap} style={style} ariaLabel={label}>{inner}</TapButton>;
  return <div style={{ ...style, display: 'grid', placeItems: 'center' }} aria-label={label} aria-current={state === 'now' ? 'step' : undefined}>{inner}</div>;
}

function Grid({ cfg, count, sheet, cols, stateOf, onTap, breaks }: {
  cfg: NamingConfig; count: number; sheet: SheetRef; cols: number; stateOf: (i: number) => CellState;
  onTap?: (i: number) => void; breaks?: number[];
}) {
  return (
    <div className="spd-sheet" style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 6, maxWidth: cols <= 3 ? 330 : 480 }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ display: 'contents' }}>
          {breaks?.includes(i) && <div style={{ gridColumn: '1 / -1', borderTop: '3px dashed var(--ink-soft)', margin: '2px 0' }} aria-hidden />}
          <Cell state={stateOf(i)} onTap={onTap ? () => onTap(i) : undefined} label={`Picture ${i + 1}`}>
            {cfg.renderCell(i, sheet)}
          </Cell>
        </div>
      ))}
    </div>
  );
}

function AnswerPad({ groups, picks, onPick }: { groups: NamingOption[][]; picks: (string | null)[]; onPick: (g: number, key: string) => void }) {
  return (
    <div className="stack" style={{ gap: 8, width: '100%', alignItems: 'center' }}>
      {groups.map((opts, g) => (
        <div key={g} className="spd-pal" style={{ gridTemplateColumns: `repeat(${Math.min(opts.length, 5)}, minmax(56px, 1fr))`, maxWidth: Math.min(opts.length, 5) * 90 }}>
          {opts.map((o) => (
            <TapButton key={o.key} onTap={() => onPick(g, o.key)} ariaLabel={o.aria} className={picks[g] === o.key ? 'good' : ''}>
              {o.label}
            </TapButton>
          ))}
        </div>
      ))}
    </div>
  );
}

function useCellGuard(ms = 350) {
  const last = useRef(new Map<number, number>());
  return (i: number) => {
    const now = Date.now();
    if (now - (last.current.get(i) ?? 0) < ms) return false;
    last.current.set(i, now);
    return true;
  };
}

function PageChip({ trial, total }: { trial: number; total: number }) {
  return <span className="chip" aria-label={`Page ${trial + 1} of ${total}`}>📄 {trial + 1} / {total}</span>;
}

export function NamingPlayer({ cfg, onSubmit }: { cfg: NamingConfig; onSubmit: (r: NamingResponse) => void }) {
  const nTrials = cfg.sheets.length;
  const [mode, setMode] = useState<NamingMode | null>(null);
  const [phase, setPhase] = useState<Phase>('intro');
  const [trial, setTrial] = useState(0);
  const trialRef = useRef(0);
  const results = useRef<NamingTrial[]>([]);
  // tap mode
  const [answers, setAnswers] = useState<string[]>([]);
  const answersRef = useRef<string[]>([]);
  const [picks, setPicks] = useState<(string | null)[]>([]);
  // grown-up mode
  const [wrong, setWrong] = useState<Set<number>>(new Set());
  const wrongRef = useRef<Set<number>>(new Set());
  const stoppedAt = useRef<number | null>(null);
  // sample page
  const [sIdx, setSIdx] = useState(0);
  const [sPicks, setSPicks] = useState<(string | null)[]>([]);
  const [sNote, setSNote] = useState<{ s: 'idle' | 'good' | 'bad'; text?: string; k: number }>({ s: 'idle', k: 0 });
  const [adultSampleDone, setAdultSampleDone] = useState(false);

  const guard = useTapGuard(140);
  const cellGuard = useCellGuard();
  const clock = useStopwatch();
  const [submit, done] = useSubmitOnce(onSubmit);
  const elapsed = () => Math.min(cfg.limitSec, stoppedAt.current ?? clock.elapsed());
  const n = cfg.sheets[trial]?.length ?? 0;

  /** Store this trial; then either the breather card or the final submit. */
  const endTrial = (t: NamingTrial) => {
    if (done || results.current.length > trialRef.current) return;
    results.current = [...results.current, t];
    if (results.current.length >= nTrials) {
      submit({ mode: mode ?? 'tap', trials: results.current.slice() });
      return;
    }
    trialRef.current += 1;
    setTrial(trialRef.current);
    answersRef.current = [];
    setAnswers([]);
    setPicks([]);
    wrongRef.current = new Set();
    setWrong(new Set());
    stoppedAt.current = null;
    setPhase('pause');
  };

  const finishTap = () => endTrial({ answers: answersRef.current.slice(), elapsedSec: elapsed() });
  const finishAdult = (reached: number) =>
    endTrial({ reached, wrong: [...wrongRef.current].filter((i) => i < reached).sort((a, b) => a - b), elapsedSec: elapsed() });
  const stopAdult = () => {
    if (stoppedAt.current === null) stoppedAt.current = Math.min(cfg.limitSec, clock.elapsed());
    setPhase('reach');
  };

  /** Combine group picks; returns the full answer when every group has a pick. */
  const pickInto = (cur: (string | null)[], groups: number, g: number, key: string): [(string | null)[], string | null] => {
    const next = Array.from({ length: groups }, (_, j) => (j === g ? key : cur[j] ?? null));
    return [next, next.every((x) => x !== null) ? next.join(' ') : null];
  };

  const pickRun = (g: number, key: string) => {
    if (done || !guard()) return;
    const i = answersRef.current.length;
    const groups = cfg.groupsFor(i, trialRef.current).length;
    const [next, full] = pickInto(picks, groups, g, key);
    if (full === null) { setPicks(next); return; }
    answersRef.current = [...answersRef.current, full];
    setAnswers(answersRef.current);
    setPicks([]);
    if (answersRef.current.length >= (cfg.sheets[trialRef.current]?.length ?? 0)) finishTap();
  };

  const pickSample = (g: number, key: string) => {
    if (sIdx >= cfg.sampleExpected.length || !guard()) return;
    const groups = cfg.groupsFor(sIdx, 'sample').length;
    const [next, full] = pickInto(sPicks, groups, g, key);
    if (full === null) { setSPicks(next); return; }
    const want = cfg.sampleExpected[sIdx];
    setSPicks([]);
    if (full === want) {
      setSIdx(sIdx + 1);
      setSNote({ s: 'good', text: `Yes — ${cfg.say(want)}!`, k: sNote.k + 1 });
    } else setSNote({ s: 'bad', text: `Look again — that one is ${cfg.say(want)}.`, k: sNote.k + 1 });
  };

  const toggleWrong = (i: number) => {
    if (done || !cellGuard(i)) return;
    const next = new Set(wrongRef.current);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    wrongRef.current = next;
    setWrong(next);
  };

  if (phase === 'intro' || mode === null) {
    return (
      <div className="stage">
        <SpeedStyles />
        <div className="prompt">{cfg.title}</div>
        <SpeedIntro
          extra={
            <div className="stack" style={{ width: '100%', maxWidth: 420 }}>
              <button type="button" className="btn primary big" onClick={() => { setMode('adult'); setPhase('sample'); }}>
                🗣️ Say them — grown-up times
              </button>
              <button type="button" className="btn lake big" onClick={() => { setMode('tap'); setPhase('sample'); }}>
                👆 Tap them — just me
              </button>
            </div>
          }
        >
          {cfg.intro}
        </SpeedIntro>
      </div>
    );
  }

  const nSample = cfg.sampleExpected.length;
  const sampleCols = Math.min(3, nSample);

  if (phase === 'sample') {
    const goLine = `Nice! Now ${nTrials === 1 ? 'the page' : `${nTrials} short pages`} — ${mode === 'tap' ? 'tap' : 'name'} each one in order, as fast as you can.`;
    if (mode === 'adult') {
      return (
        <div className="stage">
          <SpeedStyles />
          <div className="prompt">Practice page — say them out loud</div>
          <Grid cfg={cfg} cols={sampleCols} count={nSample} sheet="sample" stateOf={() => (adultSampleDone ? 'done' : 'todo')} />
          {adultSampleDone ? (
            <ReadyCard onGo={() => setPhase('countdown')}>{goLine}</ReadyCard>
          ) : (
            <>
              <div className="card flat tint small" style={{ maxWidth: 480 }}>
                <strong>Grown-up:</strong> the answers are {cfg.sampleExpected.map(cfg.say).join(', ')}. Help with any mix-ups
                until your child has named all {nSample}. Then come {nTrials} short timed pages: tap <strong>Start</strong>, your
                child names every picture row by row (left to right), you tap any picture named wrong, and tap <strong>Stop</strong> at the end.
              </div>
              <button type="button" className="btn go big" onClick={() => setAdultSampleDone(true)}>✓ They named all {nSample}</button>
            </>
          )}
        </div>
      );
    }
    return (
      <div className="stage">
        <SpeedStyles />
        <div className="prompt">Practice page</div>
        {sIdx >= nSample ? (
          <ReadyCard onGo={() => setPhase('countdown')}>{goLine}</ReadyCard>
        ) : (
          <>
            <Grid cfg={cfg} cols={sampleCols} count={nSample} sheet="sample"
              stateOf={(i) => (i < sIdx ? 'done' : i === sIdx ? 'now' : 'todo')} />
            <PracticeNote state={sNote.s}>{sNote.text ?? 'Tap the answer for the yellow box.'}</PracticeNote>
            <div key={sNote.k} className={sNote.s === 'bad' ? 'spd-shake' : ''} style={{ width: '100%' }}>
              <AnswerPad groups={cfg.groupsFor(sIdx, 'sample')} picks={sPicks} onPick={pickSample} />
            </div>
          </>
        )}
      </div>
    );
  }

  if (phase === 'pause') {
    return (
      <div className="stage">
        <SpeedStyles />
        <div className="prompt">Page {trial} done! 🎉</div>
        <ReadyCard onGo={() => setPhase('countdown')}>
          Shake out your hands and take a breath. Next: page {trial + 1} of {nTrials} — the same kind of page. Go just as fast!
        </ReadyCard>
      </div>
    );
  }

  if (phase === 'countdown') {
    return (
      <div className="stage">
        <SpeedStyles />
        {nTrials > 1 && <PageChip trial={trial} total={nTrials} />}
        <ReadySetGo onDone={() => { clock.start(); setPhase('run'); }} />
      </div>
    );
  }

  if (mode === 'adult') {
    const reaching = phase === 'reach';
    return (
      <div className="stage" style={{ gap: 10 }}>
        <SpeedStyles />
        <SheetBar key={trial} seconds={cfg.limitSec} running={!reaching && !done} onExpire={stopAdult} countUp />
        {nTrials > 1 && <PageChip trial={trial} total={nTrials} />}
        <div className="small muted center" aria-live="polite">
          {reaching
            ? stoppedAt.current !== null && stoppedAt.current >= cfg.limitSec - 0.5
              ? 'Time’s up! Grown-up: tap the LAST picture your child named.'
              : 'Grown-up: did they name them all? If not, tap the last picture they named.'
            : 'Grown-up: tap any picture named wrong (tap again to undo).'}
        </div>
        <Grid
          key={trial}
          cfg={cfg}
          cols={cfg.cols}
          count={n}
          sheet={trial}
          breaks={cfg.breaks}
          stateOf={(i) => (wrong.has(i) ? 'wrong' : 'todo')}
          onTap={done ? undefined : reaching ? (i) => finishAdult(i + 1) : toggleWrong}
        />
        {reaching ? (
          <button type="button" className="btn go big" disabled={done} onClick={() => finishAdult(n)}>✓ They named them all</button>
        ) : (
          <button type="button" className="btn primary big" disabled={done} onClick={stopAdult}>■ Stop</button>
        )}
      </div>
    );
  }

  const cur = answers.length;
  return (
    <div className="stage" style={{ gap: 10 }}>
      <SpeedStyles />
      <SheetBar key={trial} seconds={cfg.limitSec} running={!done} onExpire={finishTap} done={cur} />
      {nTrials > 1 && <PageChip trial={trial} total={nTrials} />}
      <Grid key={trial} cfg={cfg} cols={cfg.cols} count={n} sheet={trial} breaks={cfg.breaks}
        stateOf={(i) => (i < cur ? 'done' : i === cur ? 'now' : 'todo')} />
      {!done && cur < n && <AnswerPad groups={cfg.groupsFor(cur, trial)} picks={picks} onPick={pickRun} />}
    </div>
  );
}

/** After submitting: summary plus each trial's sheet with slips marked. */
export function NamingReview({ cfg, response, meta }: { cfg: NamingConfig; response: NamingResponse | null; meta: Record<string, number> }) {
  const trials = trialsOf(response);
  const attrSlips = Object.entries(cfg.attributeLabels ?? {})
    .map(([k, label]) => ({ label, n: meta[attrKey(k)] ?? 0 }))
    .filter((x) => x.n > 0);
  return (
    <div className="stage" style={{ gap: 10 }}>
      <SpeedStyles />
      <SpeedSummary
        stats={[
          { label: 'named right', value: meta.correct ?? 0 },
          { label: 'slips', value: meta.errors ?? 0 },
          { label: 'seconds', value: Math.round(meta.durationSec ?? 0) },
          { label: 'per minute', value: meta.ratePerMin ?? namingRate(meta.correct ?? 0, meta.durationSec ?? 60) },
        ]}
      />
      {response?.mode === 'tap' && attrSlips.length > 0 && (
        <div className="small muted center">Slips: {attrSlips.map((x) => `${x.n} ${x.label}`).join(' · ')}</div>
      )}
      {cfg.sheets.map((expected, t) => {
        const tr = trials[t];
        const n = expected.length;
        const slips = new Set<number>();
        let reached = 0;
        if (tr && response?.mode === 'adult') {
          reached = Math.max(0, Math.min(n, tr.reached ?? n));
          (tr.wrong ?? []).forEach((i) => i < reached && slips.add(i));
        } else if (tr) {
          const a = (tr.answers ?? []).slice(0, n);
          reached = a.length;
          a.forEach((x, i) => x !== expected[i] && slips.add(i));
        }
        return (
          <div key={t} className="stack" style={{ width: '100%', alignItems: 'center', gap: 6 }}>
            {cfg.sheets.length > 1 && <div className="small muted">Page {t + 1}</div>}
            <Grid cfg={cfg} cols={cfg.cols} count={n} sheet={t} breaks={cfg.breaks}
              stateOf={(i) => (slips.has(i) ? 'wrong' : i < reached ? 'todo' : 'done')} />
          </div>
        );
      })}
    </div>
  );
}
