import { useEffect, useMemo, useState } from 'react';
import { navigate } from '../app/router';
import { sfx } from '../app/sound';
import { useStore } from '../app/store';
import { BADGES, starsFor } from '../core/progress';
import { skillLabel } from '../core/report';
import { practicePlan } from '../core/session';
import { SUBTESTS } from '../core/subtestInfo';
import { Confetti } from '../ui/Confetti';
import { Mascot, Stars } from '../ui/kit';
import { takeLastEarned } from './Runner';

export function Done({ sessionId }: { sessionId?: string }) {
  const { data, startSession } = useStore();
  const [earned] = useState(() => takeLastEarned());
  const session = data?.sessions.find((s) => s.id === sessionId);

  useEffect(() => {
    if (session?.completed) sfx.fanfare();
  }, [session?.completed]);

  const summary = useMemo(() => {
    if (!session) return null;
    const rs = session.results;
    const stars = rs.reduce((a, r) => a + starsFor(r), 0);
    const bySkill = new Map<string, { label: string; right: number; n: number; subtest: string }>();
    for (const r of rs) {
      if (SUBTESTS[r.subtest].kind === 'speeded') continue;
      for (const s of r.skills) {
        if (/span-\d+$/.test(s)) continue;
        const e = bySkill.get(s) ?? { label: skillLabel(s), right: 0, n: 0, subtest: r.subtest };
        e.n += 1;
        if (r.correct) e.right += 1;
        bySkill.set(s, e);
      }
    }
    const lines = [...bySkill.values()];
    const great = lines.filter((l) => l.right >= 1).sort((a, b) => b.right / b.n - a.right / a.n || b.n - a.n).slice(0, 2);
    const grow = lines.filter((l) => l.n >= 2 && l.right / l.n < 0.6).sort((a, b) => a.right / a.n - b.right / b.n)[0];
    const comebacks = rs.filter((r, i) => i > 0 && r.correct && !rs[i - 1].correct).length;
    const hinted = rs.filter((r) => r.hintsUsed > 0 && r.correct).length;
    return { stars, great, grow, comebacks, hinted, count: rs.length };
  }, [session]);

  if (!session || !summary) {
    return (
      <div className="page center" style={{ paddingTop: 40 }}>
        <button className="btn primary" onClick={() => navigate('/')}>Back to camp</button>
      </div>
    );
  }
  const isTest = session.mode === 'test';

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      {session.completed && <Confetti />}
      <div className="card center stack pop-in" style={{ alignItems: 'center', gap: 14, marginTop: 16 }}>
        <Mascot mood="cheer" size={140} className="float" />
        <h1 style={{ margin: 0 }}>{session.completed ? (isTest ? 'Challenge complete!' : 'Quest complete!') : 'Nice work today!'}</h1>
        <p style={{ margin: 0 }}>You answered <strong>{summary.count}</strong> question{summary.count === 1 ? '' : 's'} and earned</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Stars count={3} max={3} size={36} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '2.4rem', fontWeight: 800 }}>{summary.stars}</span>
        </div>
      </div>

      {earned.length > 0 && (
        <div className="card stack pop-in" style={{ marginTop: 16, gap: 10 }}>
          <h2 style={{ margin: 0 }}>🎖️ New camp patch{earned.length > 1 ? 'es' : ''}!</h2>
          <div className="row">
            {earned.map((id) => {
              const b = BADGES.find((x) => x.id === id);
              return b ? (
                <div key={id} className="card flat tint center" style={{ minWidth: 150 }}>
                  <div style={{ fontSize: 44 }}>{b.icon}</div>
                  <strong>{b.name}</strong>
                  <div className="small muted">{b.description}</div>
                </div>
              ) : null;
            })}
          </div>
        </div>
      )}

      <div className="card stack" style={{ marginTop: 16, gap: 10 }}>
        <h2 style={{ margin: 0 }}>🌟 What you did great</h2>
        <ul style={{ margin: 0, paddingLeft: 22 }}>
          {isTest && <li>You kept trying even when the questions got really hard. That's what brave thinkers do!</li>}
          {!isTest && summary.great.map((g) => <li key={g.label}><strong>{g.label}</strong> — {g.right} right!</li>)}
          {summary.comebacks > 0 && <li>You bounced back after a miss {summary.comebacks} time{summary.comebacks > 1 ? 's' : ''}. 💪</li>}
          {summary.hinted > 0 && <li>You used hints like a pro and figured out {summary.hinted} tricky one{summary.hinted > 1 ? 's' : ''}.</li>}
          {!isTest && summary.great.length === 0 && summary.comebacks === 0 && <li>You worked hard on brand-new kinds of puzzles. That's how brains grow!</li>}
        </ul>
        {!isTest && summary.grow && (
          <>
            <h3 style={{ margin: '6px 0 0' }}>🌱 Next adventure</h3>
            <p style={{ margin: 0 }}>
              <strong>{summary.grow.label}</strong> is still growing. Want to practise it with Pip's hints?
            </p>
            <div>
              <button className="btn lake" onClick={() => { startSession(practicePlan(summary.grow!.subtest as never, 'tutor', 6)); navigate('/play'); }}>
                🦊 Learn it with Pip
              </button>
            </div>
          </>
        )}
      </div>

      <div className="row" style={{ justifyContent: 'center', marginTop: 18 }}>
        <button className="btn primary big" onClick={() => navigate('/')}>🏕️ Back to camp</button>
        {(isTest || session.kind === 'short' || session.kind === 'mock') && (
          <button className="btn ghost" onClick={() => navigate(`/grownups/report/${session.id}`)}>🔒 Grown-ups: full report</button>
        )}
      </div>
    </div>
  );
}
