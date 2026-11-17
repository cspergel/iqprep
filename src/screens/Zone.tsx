import { subtestStage } from '../app/derived';
import { navigate } from '../app/router';
import { useStore } from '../app/store';
import { MASTERY_LABEL } from '../core/progress';
import { practicePlan } from '../core/session';
import { SUBTESTS, ZONES, subtestsInZone, type ZoneId } from '../core/subtestInfo';
import type { SubtestId } from '../core/types';
import { PipSays } from '../ui/kit';

export function Zone({ zone }: { zone?: string }) {
  const { data, startSession, settings } = useStore();
  const z = (zone && zone in ZONES ? zone : 'VCI') as ZoneId;
  const info = ZONES[z];
  if (!data) return null;
  const subs = subtestsInZone(z).filter((s) => !settings.disabledSubtests.includes(s));

  const play = (s: SubtestId, mode: 'tutor' | 'practice') => {
    startSession(practicePlan(s, mode, mode === 'tutor' ? 6 : 8));
    navigate('/play');
  };

  return (
    <div className="page">
      <button className="btn ghost small" onClick={() => navigate('/')}>← Camp map</button>
      <div className="card rise" style={{ marginTop: 12, padding: 0, overflow: 'hidden' }}>
        <div style={{ background: info.color, color: info.ink, padding: '20px 22px', borderBottom: 'var(--border)' }}>
          <div style={{ fontSize: 44 }} aria-hidden>{info.icon}</div>
          <h1 style={{ margin: 0 }}>{info.kidName}</h1>
          <div>{info.tagline} · <span style={{ opacity: 0.85 }}>{info.name}</span></div>
        </div>
        <div style={{ padding: 18 }}>
          <PipSays mood="happy">Pick a game! <strong>Learn with Pip</strong> gives hints and tricks. <strong>Play</strong> is for practising on your own.</PipSays>
        </div>
      </div>

      <div className="grid-auto" style={{ marginTop: 18 }}>
        {subs.map((s, i) => {
          const sub = SUBTESTS[s];
          const st = subtestStage(data, s);
          return (
            <div key={s} className="card stack rise" style={{ gap: 10, animationDelay: `${i * 70}ms` }}>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <span style={{ fontSize: 40 }} aria-hidden>{sub.icon}</span>
                <div className="spacer">
                  <h3 style={{ margin: 0 }}>{sub.kidName}</h3>
                  <div className="small muted">{sub.name}{sub.tier !== 'primary' ? ` · ${sub.tier}` : ''}</div>
                </div>
              </div>
              <div className="row small" style={{ gap: 4 }} aria-label={`Progress: ${MASTERY_LABEL[st.level]}`}>
                {[1, 2, 3, 4].map((k) => (
                  <span key={k} aria-hidden style={{ fontSize: 18, filter: k <= st.stage ? 'none' : 'grayscale(1) opacity(.35)' }}>⛺</span>
                ))}
                <span className="muted" style={{ marginLeft: 6 }}>{MASTERY_LABEL[st.level]}</span>
              </div>
              <div className="row">
                <button className="btn lake small" onClick={() => play(s, 'tutor')}>🦊 Learn with Pip</button>
                <button className="btn primary small" onClick={() => play(s, 'practice')}>▶ Play</button>
              </div>
              <button className="btn ghost small" onClick={() => navigate(`/game/${s}`)}>More about this game</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
