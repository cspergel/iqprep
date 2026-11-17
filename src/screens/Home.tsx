import { buildDailyPlan, buildReviewPlan, subtestStage } from '../app/derived';
import { navigate } from '../app/router';
import { useStore } from '../app/store';
import { dueReviews, levelFor, minutesToday, totalXp } from '../core/progress';
import { dayKey } from '../core/storage';
import { ZONES, subtestsInZone, type ZoneId } from '../core/subtestInfo';
import { PipSays } from '../ui/kit';

const MAP_ZONES: ZoneId[] = ['VCI', 'VSI', 'FRI', 'WMI', 'PSI', 'EXTRA'];
const GREETINGS = ['Ready for an adventure', 'Welcome back to camp', 'Let’s grow some brain power', 'Great to see you'];

export function Home() {
  const { profile, data, settings, age, startSession } = useStore();
  if (!profile || !data) return null;
  const xp = totalXp(data);
  const lvl = levelFor(xp);
  const mins = minutesToday(data);
  const goal = settings.dailyGoalMinutes;
  const due = dueReviews(data.review).length;
  const doneToday = data.sessions.some((s) => s.kind === 'daily' && s.completed && dayKey(s.startedAt) === dayKey());
  const greet = GREETINGS[new Date().getDate() % GREETINGS.length];

  const go = (plan: ReturnType<typeof buildDailyPlan> | null) => {
    if (!plan) return;
    startSession(plan);
    navigate('/play');
  };

  return (
    <div className="page">
      <section className="row rise" style={{ alignItems: 'stretch', gap: 16, marginTop: 8 }}>
        <div className="card spacer stack" style={{ minWidth: 'min(100%, 380px)', gap: 14 }}>
          <PipSays mood="wave" size={92}>
            <strong>{greet}, {profile.name}!</strong>
            <div className="small">{doneToday ? 'You finished today’s quest — awesome! Play anything you like.' : 'Your camp quest is ready.'}</div>
          </PipSays>
          <div className="row" style={{ gap: 12 }}>
            <button className="btn primary big" onClick={() => go(buildDailyPlan(data, settings, age))}>
              🧭 {doneToday ? 'Another quest' : 'Today’s Camp Quest'}
            </button>
            {due > 0 && (
              <button className="btn lake" onClick={() => go(buildReviewPlan(data))}>
                🔁 Memory Quest <span className="chip" style={{ background: '#fff', color: 'var(--ink)' }}>{due}</span>
              </button>
            )}
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            A quest mixes 4 games: one to grow, one to remember, and one you're great at — so you finish strong!
          </p>
        </div>

        <div className="card stack" style={{ minWidth: 220, flex: '0 1 300px', gap: 12 }}>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <GoalRing value={mins} goal={goal} />
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.2rem' }}>{Math.min(mins, goal)} / {goal} min</div>
              <div className="small muted">today's camp time</div>
            </div>
          </div>
          <div>
            <div className="row small" style={{ justifyContent: 'space-between' }}>
              <strong>Level {lvl.level} · {lvl.title}</strong><span>{lvl.into}/{lvl.needed} ⭐</span>
            </div>
            <div className="timer" style={{ height: 16, marginTop: 4 }}>
              <span style={{ width: `${(100 * lvl.into) / lvl.needed}%`, background: 'var(--sun)' }} />
            </div>
          </div>
          <button className="btn ghost small" onClick={() => navigate('/tests')}>🏆 Take a challenge</button>
        </div>
      </section>

      <h2 style={{ marginTop: 28 }}>Camp Map</h2>
      <section className="grid-auto" style={{ position: 'relative' }}>
        {MAP_ZONES.map((z, i) => {
          const zone = ZONES[z];
          const subs = subtestsInZone(z);
          const stages = subs.map((s) => subtestStage(data, s).stage);
          const progress = stages.reduce((a, b) => a + b, 0) / (subs.length * 4);
          return (
            <button key={z} onClick={() => navigate(`/zone/${z}`)} className="card rise"
              style={{
                textAlign: 'left', cursor: 'pointer', padding: 0, overflow: 'hidden', animationDelay: `${i * 60}ms`,
                transform: `rotate(${[-1, 0.8, -0.6, 1, -0.8, 0.6][i]}deg)`,
              }}>
              <div style={{ background: zone.color, color: zone.ink, padding: '14px 16px', borderBottom: 'var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 38 }} aria-hidden>{zone.icon}</span>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.35rem', lineHeight: 1.1 }}>{zone.kidName}</div>
                  <div className="small" style={{ opacity: 0.92 }}>{zone.tagline}</div>
                </div>
              </div>
              <div style={{ padding: '12px 16px' }}>
                <div className="row small" style={{ gap: 6 }}>
                  {subs.map((s, k) => (
                    <span key={s} title={s} style={{
                      width: 14, height: 14, borderRadius: 4, border: '2px solid var(--ink)',
                      background: ['var(--card)', '#f6dcc8', '#f4c542', '#9cbf8a', 'var(--good)'][stages[k]],
                    }} />
                  ))}
                  <span className="spacer" />
                  <span className="muted">{Math.round(progress * 100)}% explored</span>
                </div>
              </div>
            </button>
          );
        })}
      </section>
    </div>
  );
}

function GoalRing({ value, goal }: { value: number; goal: number }) {
  const pct = Math.min(1, value / Math.max(1, goal));
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg width={68} height={68} viewBox="0 0 68 68" role="img" aria-label={`${value} of ${goal} minutes today`}>
      <circle cx={34} cy={34} r={r} fill="var(--card)" stroke="var(--line)" strokeWidth={8} />
      <circle cx={34} cy={34} r={r} fill="none" stroke={pct >= 1 ? 'var(--good)' : 'var(--campfire)'} strokeWidth={8}
        strokeDasharray={`${c * pct} ${c}`} strokeLinecap="round" transform="rotate(-90 34 34)" />
      <text x={34} y={40} textAnchor="middle" fontSize={pct >= 1 ? 20 : 15} fontWeight={800} fontFamily="var(--font-display)" fill="var(--ink)">
        {pct >= 1 ? '✓' : `${Math.round(pct * 100)}%`}
      </text>
    </svg>
  );
}
