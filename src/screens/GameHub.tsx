import { useState } from 'react';
import { subtestStage } from '../app/derived';
import { navigate } from '../app/router';
import { useStore } from '../app/store';
import { MASTERY_LABEL, skillStats } from '../core/progress';
import { skillLabel } from '../core/report';
import { practicePlan, shortTestPlan } from '../core/session';
import { ALL_SUBTESTS, SUBTESTS, ZONES } from '../core/subtestInfo';
import type { SubtestId } from '../core/types';
import { getModule } from '../subtests/registry';
import { PipSays } from '../ui/kit';
import { StrategyToolbox } from '../ui/StrategyToolbox';
import { questionTypes } from '../app/skillCatalog';

export function GameHub({ subtest }: { subtest?: string }) {
  const { data, startSession, settings } = useStore();
  const [count, setCount] = useState(8);
  const [types, setTypes] = useState<string[]>([]);
  const id = (subtest && ALL_SUBTESTS.includes(subtest as SubtestId) ? subtest : 'SI') as SubtestId;
  const info = SUBTESTS[id];
  const zone = ZONES[info.zone];
  const g = getModule(id).guide;
  if (!data) return null;
  const st = subtestStage(data, id);
  const skills = skillStats(data).filter((s) => s.subtest === id);
  const speeded = info.kind === 'speeded';

  const start = (kind: 'tutor' | 'practice' | 'check') => {
    if (kind === 'check') {
      startSession(shortTestPlan({ subtests: [id], itemsPerSubtest: Math.max(8, count), timed: true, feedback: false, style: 'standard', title: `${info.kidName} Check-up`, skills: { [id]: types } }));
    } else {
      startSession(practicePlan(id, kind, count, undefined, types));
    }
    navigate('/play');
  };

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <button className="btn ghost small" onClick={() => navigate(`/zone/${info.zone}`)}>← {zone.kidName}</button>
      <div className="card rise" style={{ marginTop: 12, padding: 0, overflow: 'hidden' }}>
        <div style={{ background: zone.color, color: zone.ink, padding: '18px 22px', borderBottom: 'var(--border)' }}>
          <h1 style={{ margin: 0 }}>{info.icon} {info.kidName}</h1>
          <div>{info.name} · {zone.name}{info.tier !== 'primary' ? ` · ${info.tier} subtest` : ''}</div>
        </div>
        <div className="stack" style={{ padding: 20, gap: 16 }}>
          <PipSays mood="happy">{g.kidIntro}</PipSays>
          <div>
            <h3>How to play</h3>
            <ol style={{ margin: 0, paddingLeft: 22 }}>{g.howToPlay.map((s, i) => <li key={i}>{s}</li>)}</ol>
          </div>
          {settings.strategyToolbox !== 'off' && <div><StrategyToolbox guide={g} seed={st.played} /></div>}

          {!speeded && (
            <label className="row small" style={{ gap: 8 }}>
              <strong>Questions per round:</strong>
              {[5, 8, 12].map((n) => (
                <button key={n} className="btn small" style={{ background: count === n ? 'var(--sun)' : 'var(--card)', minHeight: 40 }} onClick={() => setCount(n)}>{n}</button>
              ))}
            </label>
          )}
          {!speeded && (
            <div className="row small" style={{ gap: 6 }}>
              <strong>Question types:</strong>
              <button className="btn small" aria-pressed={!types.length} style={{ background: !types.length ? 'var(--sun)' : 'var(--card)', minHeight: 38 }} onClick={() => setTypes([])}>All (mixed)</button>
              {questionTypes(getModule(id)).map((q) => (
                <button key={q.skill} className="btn small" aria-pressed={types.includes(q.skill)}
                  style={{ background: types.includes(q.skill) ? 'var(--sun)' : 'var(--card)', minHeight: 38 }}
                  onClick={() => setTypes((t) => (t.includes(q.skill) ? t.filter((x) => x !== q.skill) : [...t, q.skill]))}>
                  {skillLabel(q.skill)}
                </button>
              ))}
            </div>
          )}
          <div className="row">
            <button className="btn lake" onClick={() => start('tutor')}>🦊 Learn with Pip</button>
            <button className="btn primary" onClick={() => start('practice')}>▶ Practice</button>
            <button className="btn ghost" onClick={() => start('check')}>📋 Check-up (test style)</button>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            <strong>Learn with Pip:</strong> hints, worked example, try again. <strong>Practice:</strong> adapts to you, shows answers.
            <strong> Check-up:</strong> real test rules — it gets harder until it's too hard, answers at the end.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3>Your skills here · <span className="muted">{MASTERY_LABEL[st.level]}</span></h3>
        {skills.length === 0 ? (
          <p className="muted">Play a round to start filling in your skill map!</p>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            {skills.map((s) => (
              <div key={s.skill} className="row" style={{ flexWrap: 'nowrap' }}>
                <span className="spacer">{skillLabel(s.skill)}</span>
                <span className="chip" style={{ background: s.level === 'mastered' ? 'var(--good)' : s.level === 'proficient' ? '#9cbf8a' : s.level === 'familiar' ? 'var(--sun)' : 'var(--card)', color: s.level === 'mastered' ? '#fff' : undefined }}>
                  {MASTERY_LABEL[s.level]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <details className="card" style={{ marginTop: 18 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 800, fontFamily: 'var(--font-display)', fontSize: '1.15rem' }}>For grown-ups</summary>
        <p style={{ marginTop: 10 }}>{g.parentNotes}</p>
        <p><strong>Measures:</strong> {info.measures}</p>
        <h4>Common mistakes</h4>
        <ul>{g.commonMistakes.map((m, i) => <li key={i}>{m}</li>)}</ul>
        <h4>Everyday activities</h4>
        <ul>{g.everydayActivities.map((m, i) => <li key={i}>{m}</li>)}</ul>
      </details>
    </div>
  );
}
