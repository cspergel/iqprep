import { useState } from 'react';
import { enabledSubtests, estimates } from '../app/derived';
import { navigate } from '../app/router';
import { useStore } from '../app/store';
import { BATTERIES, mockPlan, shortTestPlan } from '../core/session';
import { SUBTESTS, ZONES, subtestsInZone, type ZoneId } from '../core/subtestInfo';
import type { SubtestId } from '../core/types';
import { PipSays } from '../ui/kit';
import { focusSelection, questionTypes } from '../app/skillCatalog';
import { skillLabel } from '../core/report';
import { getModule } from '../subtests/registry';

const ZONE_ORDER: ZoneId[] = ['VCI', 'VSI', 'FRI', 'WMI', 'PSI', 'EXTRA'];

export function TestCenter() {
  const { data, settings, age, startSession } = useStore();
  const enabled = enabledSubtests(settings, age);
  const [picked, setPicked] = useState<SubtestId[]>(['SI', 'BD', 'MR', 'DS']);
  const [items, setItems] = useState(6);
  const [style, setStyle] = useState<'standard' | 'adaptive'>('standard');
  const [timed, setTimed] = useState(true);
  const [feedback, setFeedback] = useState(false);
  /** Chosen question types per game; missing or empty = every type (a representative mix). */
  const [types, setTypes] = useState<Partial<Record<SubtestId, string[]>>>({});
  const [openTypes, setOpenTypes] = useState<SubtestId | null>(null);
  const [focusMsg, setFocusMsg] = useState<string | null>(null);
  if (!data) return null;

  const toggle = (s: SubtestId) => setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));
  const startMock = (id: string) => {
    startSession(mockPlan(id));
    navigate('/play');
  };
  const startCustom = (subs = picked, title?: string) => {
    if (!subs.length) return;
    const skills = Object.fromEntries(subs.map((s) => [s, types[s] ?? []]));
    const targeted = subs.some((s) => (types[s]?.length ?? 0) > 0);
    startSession(shortTestPlan({ subtests: subs, itemsPerSubtest: items, timed, feedback, style, skills, title: title ?? (targeted ? 'Targeted test' : 'My test') }));
    navigate('/play');
  };
  const toggleType = (s: SubtestId, skill: string) => setTypes((t) => {
    const cur = t[s] ?? [];
    return { ...t, [s]: cur.includes(skill) ? cur.filter((x) => x !== skill) : [...cur, skill] };
  });
  const focus = () => {
    const sel = focusSelection(data, enabled);
    const subs = Object.keys(sel) as SubtestId[];
    if (!subs.length) {
      setFocusMsg('Play a few games first — then this button knows what to focus on.');
      return;
    }
    setPicked(subs);
    setTypes(sel);
    setStyle('adaptive');
    setFeedback(true);
    setFocusMsg(`Focus set: ${subs.flatMap((s) => sel[s]!.map(skillLabel)).join(', ')}. Change anything below.`);
  };
  const est = estimates(data, age);
  const weakest = enabled.filter((s) => est[s] !== undefined && SUBTESTS[s].tier !== 'complementary')
    .sort((a, b) => est[a]! - est[b]!).slice(0, 3);
  const past = data.sessions.filter((s) => (s.kind === 'mock' || s.kind === 'short') && s.results.length > 0).slice(-8).reverse();

  return (
    <div className="page">
      <h1 style={{ marginTop: 8 }}>🏆 Challenge Tower</h1>
      <PipSays mood="happy">
        Challenges work like the real thing: questions get harder until they're <em>too</em> hard — that's on purpose!
        Everyone misses some. Just do your best thinking.
      </PipSays>

      <h2 style={{ marginTop: 24 }}>Camp Challenges <span className="small muted">(mock tests)</span></h2>
      <p className="small muted" style={{ marginTop: -6 }}>Best with a grown-up nearby. Standard order, start points, discontinue rules and timing. Full score report afterwards in the grown-ups area.</p>
      <div className="grid-auto">
        {BATTERIES.map((b, i) => (
          <div key={b.id} className="card stack rise" style={{ gap: 8, animationDelay: `${i * 60}ms` }}>
            <h3 style={{ margin: 0 }}>{b.kidName}</h3>
            <div className="small"><strong>{b.name}</strong> · ⏱️ {b.minutes} min · {b.subtests.length} games</div>
            <p className="small muted" style={{ margin: 0 }}>{b.description}</p>
            <div className="spacer" />
            <button className="btn primary" onClick={() => startMock(b.id)}>Start ➜</button>
          </div>
        ))}
      </div>

      <h2 style={{ marginTop: 28 }}>Build your own test</h2>
      <p className="small muted" style={{ marginTop: -6 }}>
        Camp Challenges above are a <strong>representative sample</strong> of the whole test. Here you can build a
        <strong> targeted</strong> test instead: choose games, then (optionally) the exact question types to work on.
      </p>
      <div className="card stack" style={{ gap: 14 }}>
        <div className="row">
          <button className="btn lake" onClick={focus}>🎯 Focus on what needs work</button>
          {focusMsg && <span className="small">{focusMsg}</span>}
        </div>
        <div className="row">
          <strong>Quick picks:</strong>
          <button className="btn ghost small" onClick={() => setPicked(['SI', 'VC', 'BD', 'MR', 'FW', 'DS', 'CD'])}>FSIQ seven</button>
          <button className="btn ghost small" onClick={() => setPicked(['SI', 'VC', 'BD', 'VP', 'MR', 'FW', 'DS', 'PS', 'CD', 'SS'])}>All primary</button>
          {weakest.length > 0 && <button className="btn ghost small" onClick={() => setPicked(weakest)}>🌱 Growth spots</button>}
          <button className="btn ghost small" onClick={() => { setPicked([]); setTypes({}); }}>Clear</button>
        </div>
        {ZONE_ORDER.map((z) => (
          <div key={z}>
            <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>{ZONES[z].icon} {ZONES[z].kidName} <span className="muted">· {ZONES[z].name}</span></div>
            <div className="row" style={{ gap: 8 }}>
              {subtestsInZone(z).filter((s) => enabled.includes(s)).map((s) => (
                <button key={s} className="btn small" aria-pressed={picked.includes(s)} onClick={() => toggle(s)}
                  style={{ background: picked.includes(s) ? 'var(--sun)' : 'var(--card)', minHeight: 42 }}>
                  {SUBTESTS[s].icon} {SUBTESTS[s].kidName}
                </button>
              ))}
            </div>
          </div>
        ))}
        {picked.filter((s) => SUBTESTS[s].kind !== 'speeded').length > 0 && (
          <div className="stack" style={{ gap: 8 }}>
            <strong>Question types <span className="small muted">(optional — leave as “All types” for a representative mix)</span></strong>
            {picked.filter((s) => SUBTESTS[s].kind !== 'speeded').map((s) => {
              const chosen = types[s] ?? [];
              const qts = openTypes === s ? questionTypes(getModule(s)) : [];
              return (
                <div key={s} className="card flat" style={{ padding: 10 }}>
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <span className="spacer">{SUBTESTS[s].icon} <strong>{SUBTESTS[s].kidName}</strong>{' '}
                      <span className="small muted">{chosen.length ? chosen.map(skillLabel).join(', ') : 'All types'}</span></span>
                    <button className="btn ghost small" style={{ minHeight: 36 }} onClick={() => setOpenTypes(openTypes === s ? null : s)}>
                      {openTypes === s ? 'Done' : 'Choose types'}
                    </button>
                  </div>
                  {openTypes === s && (
                    <div className="row" style={{ gap: 6, marginTop: 8 }}>
                      <button className="btn small" aria-pressed={!chosen.length} style={{ background: !chosen.length ? 'var(--sun)' : 'var(--card)', minHeight: 38 }}
                        onClick={() => setTypes((t) => ({ ...t, [s]: [] }))}>All types</button>
                      {qts.map((q) => (
                        <button key={q.skill} className="btn small" aria-pressed={chosen.includes(q.skill)}
                          style={{ background: chosen.includes(q.skill) ? 'var(--sun)' : 'var(--card)', minHeight: 38 }}
                          title={`Seen at difficulty ages ${q.minDifficulty.toFixed(0)}–${q.maxDifficulty.toFixed(0)}`}
                          onClick={() => toggleType(s, q.skill)}>{skillLabel(q.skill)}</button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="row" style={{ gap: 18 }}>
          <Segmented label="Questions per game" value={items} options={[[4, '4'], [6, '6'], [8, '8'], [12, '12']]} onChange={setItems} />
          <Segmented label="Style" value={style} options={[['standard', 'Test rules'], ['adaptive', 'Fits my level']]} onChange={setStyle} />
          <Segmented label="Timers" value={timed} options={[[true, 'On'], [false, 'Off']]} onChange={setTimed} />
          <Segmented label="Answers" value={feedback} options={[[false, 'At the end'], [true, 'After each']]} onChange={setFeedback} />
        </div>
        <div>
          <button className="btn primary big" disabled={!picked.length} onClick={() => startCustom()}>
            Start my test ({picked.length} game{picked.length === 1 ? '' : 's'}) ➜
          </button>
        </div>
      </div>

      {past.length > 0 && (
        <>
          <h2 style={{ marginTop: 28 }}>Past challenges</h2>
          <div className="stack">
            {past.map((s) => (
              <button key={s.id} className="card row" style={{ textAlign: 'left', cursor: 'pointer', padding: 14 }} onClick={() => navigate(`/grownups/report/${s.id}`)}>
                <span className="spacer"><strong>{s.title}</strong> <span className="small muted">· {new Date(s.startedAt).toLocaleDateString()} · {s.results.length} answers{s.completed ? '' : ' · unfinished'}</span></span>
                <span className="chip">🔒 Report</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Segmented<T extends string | number | boolean>({ label, value, options, onChange }: {
  label: string; value: T; options: [T, string][]; onChange: (v: T) => void;
}) {
  return (
    <div className="stack" style={{ gap: 4 }} role="group" aria-label={label}>
      <span className="small" style={{ fontWeight: 700 }}>{label}</span>
      <div className="row" style={{ gap: 4 }}>
        {options.map(([v, t]) => (
          <button key={String(v)} className="btn small" aria-pressed={value === v} onClick={() => onChange(v)}
            style={{ background: value === v ? 'var(--sun)' : 'var(--card)', minHeight: 40, padding: '4px 12px' }}>{t}</button>
        ))}
      </div>
    </div>
  );
}
