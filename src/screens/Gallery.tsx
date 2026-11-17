/**
 * Question Gallery (grown-ups): every question type of every game at easy / middle / hard levels,
 * shown with the answer, explanation, steps and hints — for reviewing quality and iterating.
 * "Try it" plays a sample live; "Flag" saves a reproducible note (subtest, type, difficulty, seed)
 * that can be exported and handed back for fixes.
 */
import { useMemo, useState } from 'react';
import { questionTypes } from '../app/skillCatalog';
import { skillLabel } from '../core/report';
import { createRng } from '../core/rng';
import { makeSpeak } from '../core/speech';
import { ALL_SUBTESTS, SUBTESTS, ZONES, subtestsInZone, type ZoneId } from '../core/subtestInfo';
import type { Item, ScoreOutcome, SubtestId, SubtestModule } from '../core/types';
import { getModule } from '../subtests/registry';

const FLAGS_KEY = 'braincamp:v1:flags';

export interface Flag {
  subtest: SubtestId;
  skill?: string;
  itemId: string;
  difficulty: number;
  requested: number;
  seed: number;
  variant?: string;
  note: string;
  at: number;
}

export function loadFlags(): Flag[] {
  try {
    return JSON.parse(localStorage.getItem(FLAGS_KEY) ?? '[]') as Flag[];
  } catch {
    return [];
  }
}

function saveFlags(flags: Flag[]) {
  try {
    localStorage.setItem(FLAGS_KEY, JSON.stringify(flags));
  } catch {
    /* ignore */
  }
}

function variantFor(mod: SubtestModule, skill: string | undefined, seed: number): string | undefined {
  if (['IST', 'DST', 'RST'].includes(mod.id)) return 'book-1';
  if (!mod.variants) return undefined;
  const match = skill && mod.variants.find((v) => `${mod.id.toLowerCase()}:${v.id}` === skill);
  return match ? match.id : mod.variants[seed % mod.variants.length].id;
}

interface Sample { item: Item; requested: number; variant?: string }

/** Generate an item of the requested type near the requested difficulty (same idea as the engine). */
export function sampleFor(mod: SubtestModule, skill: string | undefined, difficulty: number, seed: number, age: number): Sample {
  const rng = createRng(seed);
  let best: Sample | null = null;
  for (let i = 0; i < 80; i++) {
    const s = rng.int(1, 2 ** 31 - 2);
    const d = difficulty + (i < 30 ? 0 : (rng.next() - 0.5) * 4);
    const variant = variantFor(mod, skill, s);
    const item = mod.generate({ difficulty: d, seed: s, age, mode: 'practice', variant });
    if (!skill || item.skills.includes(skill)) {
      if (!best || Math.abs(item.difficulty - difficulty) < Math.abs(best.item.difficulty - difficulty)) best = { item, requested: difficulty, variant };
      if (Math.abs(item.difficulty - difficulty) < 0.75) break;
    }
  }
  if (best) return best;
  const variant = variantFor(mod, skill, seed);
  return { item: mod.generate({ difficulty, seed, age, mode: 'practice', variant }), requested: difficulty, variant };
}

export function Gallery({ age }: { age: number }) {
  const [subtest, setSubtest] = useState<SubtestId>('MR');
  const [flags, setFlags] = useState<Flag[]>(() => loadFlags());
  const mod = getModule(subtest);
  const info = SUBTESTS[subtest];
  const types = useMemo(() => (info.kind === 'speeded' ? [] : questionTypes(mod)), [mod, info.kind]);

  const addFlag = (f: Flag) => {
    const next = [...flags, f];
    setFlags(next);
    saveFlags(next);
  };
  const exportFlags = () => {
    const blob = new Blob([JSON.stringify(flags, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `iq-prep-flagged-questions-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <section className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.45rem' }}>Question Gallery</h2>
        <p className="small" style={{ marginTop: 0 }}>
          Every question type each game can make, at an easy, middle and hard level, with the answer shown. Use
          <strong> 🔄 New sample</strong> to see more, <strong>▶ Try it</strong> to play one, and <strong>🚩 Flag</strong> to note anything
          confusing, unfair or wrong. Flags include everything needed to recreate the exact question, so export them and share them for fixes.
        </p>
        {(['VCI', 'VSI', 'FRI', 'WMI', 'PSI', 'EXTRA'] as ZoneId[]).map((z) => (
          <div key={z} className="row" style={{ gap: 6, marginBottom: 6 }}>
            <span className="small" style={{ minWidth: 150, fontWeight: 700 }}>{ZONES[z].icon} {ZONES[z].name}</span>
            {subtestsInZone(z).map((s) => (
              <button key={s} className="btn small" aria-pressed={s === subtest} onClick={() => setSubtest(s)}
                style={{ background: s === subtest ? 'var(--sun)' : 'var(--card)', minHeight: 38 }}>
                {SUBTESTS[s].icon} {SUBTESTS[s].name}
              </button>
            ))}
          </div>
        ))}
        <div className="row small" style={{ marginTop: 8 }}>
          <span>🚩 {flags.length} flagged question{flags.length === 1 ? '' : 's'}</span>
          {flags.length > 0 && <button className="btn ghost small" style={{ minHeight: 34 }} onClick={exportFlags}>⬇️ Export flags</button>}
          {flags.length > 0 && <button className="btn ghost small" style={{ minHeight: 34 }} onClick={() => { setFlags([]); saveFlags([]); }}>Clear flags</button>}
        </div>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.35rem' }}>{info.icon} {info.name} <span className="small muted">· {info.kidName}</span></h2>
        <p className="small muted" style={{ marginTop: 0 }}>{info.measures}</p>
        {info.kind === 'speeded' ? (
          <SampleRow mod={mod} skill={undefined} label="Timed sheet" levels={[age]} age={age} onFlag={addFlag} />
        ) : types.length === 0 ? (
          <p className="muted">No question types found.</p>
        ) : (
          <div className="stack" style={{ gap: 22 }}>
            {types.map((q) => {
              const lo = q.minDifficulty;
              const hi = q.maxDifficulty;
              const levels = hi - lo < 1 ? [lo] : hi - lo < 3 ? [lo, hi] : [lo, (lo + hi) / 2, hi];
              return <SampleRow key={q.skill} mod={mod} skill={q.skill} label={skillLabel(q.skill)} levels={levels} age={age} onFlag={addFlag} />;
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function SampleRow({ mod, skill, label, levels, age, onFlag }: {
  mod: SubtestModule; skill?: string; label: string; levels: number[]; age: number; onFlag: (f: Flag) => void;
}) {
  return (
    <div>
      <h3 style={{ margin: '0 0 8px' }}>{label} <span className="small muted">({skill ?? mod.id})</span></h3>
      <div className="grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 330px), 1fr))', alignItems: 'start' }}>
        {levels.map((d, i) => <SampleCard key={`${skill}-${i}`} mod={mod} skill={skill} difficulty={d} age={age} onFlag={onFlag} />)}
      </div>
    </div>
  );
}

function SampleCard({ mod, skill, difficulty, age, onFlag }: {
  mod: SubtestModule; skill?: string; difficulty: number; age: number; onFlag: (f: Flag) => void;
}) {
  const [seed, setSeed] = useState(() => Math.round(difficulty * 1000) + 17);
  const [mode, setMode] = useState<'answer' | 'try'>('answer');
  const [tryKey, setTryKey] = useState(0);
  const [result, setResult] = useState<{ response: unknown; outcome: ScoreOutcome } | null>(null);
  const [flagging, setFlagging] = useState(false);
  const [note, setNote] = useState('');
  const [flagged, setFlagged] = useState(false);
  const sample = useMemo(() => sampleFor(mod, skill, difficulty, seed, age), [mod, skill, difficulty, seed, age]);
  const { item } = sample;
  const Player = mod.Player;
  const speak = makeSpeak(true);

  const reroll = () => {
    setSeed((s) => s + 7919);
    setResult(null);
    setFlagged(false);
    setMode('answer');
  };

  return (
    <div className="card flat" style={{ padding: 12 }}>
      <div className="row small" style={{ marginBottom: 8, gap: 6 }}>
        <span className="chip">~{item.difficulty.toFixed(1)} yrs</span>
        <span className="muted" style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>{item.id}</span>
        <span className="spacer" />
        {item.timeLimitSec && <span className="chip">⏱️ {item.timeLimitSec}s</span>}
      </div>
      <div style={{ zoom: 0.85 }}>
        {mode === 'answer' ? (
          <Player item={item} mode="practice" age={age} onSubmit={() => undefined} hintLevel={0} speak={speak}
            reveal={{ response: null, outcome: { points: item.maxPoints, correct: true } }} />
        ) : (
          <Player key={tryKey} item={item} mode="practice" age={age} hintLevel={0} speak={speak}
            onSubmit={(r) => { if (!result) setResult({ response: r, outcome: mod.score(item, r as never) }); }}
            reveal={result ?? undefined} />
        )}
      </div>
      {mode === 'try' && result && (
        <div className={`feedback ${result.outcome.correct ? 'good' : result.outcome.points > 0 ? 'partial' : 'bad'}`} style={{ padding: 8, marginTop: 8 }}>
          <strong>{result.outcome.points}/{item.maxPoints} points</strong>{result.outcome.feedback ? ` — ${result.outcome.feedback}` : ''}
        </div>
      )}
      <details style={{ marginTop: 8 }} open={mode === 'answer'}>
        <summary className="small" style={{ cursor: 'pointer', fontWeight: 700 }}>Explanation, steps & hints</summary>
        <div className="small stack" style={{ gap: 6, marginTop: 6 }}>
          <div><strong>Explanation:</strong> {item.explanation}</div>
          {item.steps && <ol style={{ margin: 0, paddingLeft: 18 }}>{item.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}
          {item.hints.length > 0 && <div><strong>Hints:</strong> {item.hints.map((h, i) => <div key={i}>💡 {h}</div>)}</div>}
          {item.speak && <div className="muted"><strong>Read aloud:</strong> “{item.speak}”</div>}
          <div className="muted">Skills: {item.skills.join(', ')} · max {item.maxPoints} pt</div>
        </div>
      </details>
      <div className="row" style={{ marginTop: 8, gap: 6 }}>
        <button className="btn ghost small" style={{ minHeight: 34 }} onClick={reroll}>🔄 New sample</button>
        {mode === 'answer'
          ? <button className="btn ghost small" style={{ minHeight: 34 }} onClick={() => { setMode('try'); setResult(null); setTryKey((k) => k + 1); }}>▶ Try it</button>
          : <button className="btn ghost small" style={{ minHeight: 34 }} onClick={() => setMode('answer')}>👁 Show answer</button>}
        {!flagged
          ? <button className="btn ghost small" style={{ minHeight: 34 }} onClick={() => setFlagging((f) => !f)}>🚩 Flag</button>
          : <span className="chip">🚩 Flagged</span>}
      </div>
      {flagging && !flagged && (
        <div className="stack" style={{ gap: 6, marginTop: 8 }}>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="What's wrong? (e.g. two answers could be right, too hard for this level, confusing picture, wording)"
            style={{ font: 'inherit', fontSize: '0.9rem', padding: 8, borderRadius: 10, border: '2px solid var(--ink)', width: '100%' }} />
          <div>
            <button className="btn primary small" style={{ minHeight: 36 }} onClick={() => {
              onFlag({ subtest: mod.id, skill, itemId: item.id, difficulty: item.difficulty, requested: sample.requested, seed: item.seed, variant: sample.variant, note, at: Date.now() });
              setFlagged(true);
              setFlagging(false);
              setNote('');
            }}>Save flag</button>
          </div>
        </div>
      )}
    </div>
  );
}

export const GALLERY_SUBTESTS = ALL_SUBTESTS;
