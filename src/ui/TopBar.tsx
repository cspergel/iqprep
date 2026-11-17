import { navigate, useRoute } from '../app/router';
import { useStore } from '../app/store';
import { currentStreak, levelFor, totalXp } from '../core/progress';

export function TopBar() {
  const { profile, data } = useStore();
  const route = useRoute();
  if (!profile || !data) return null;
  const xp = totalXp(data);
  const lvl = levelFor(xp);
  const streak = currentStreak(data.activeDays);
  const tab = (path: string, label: string, icon: string) => {
    const active = (route[0] ?? '') === path.replace('/', '');
    return (
      <button
        className="btn small"
        style={{ background: active ? 'var(--sun)' : 'var(--card)', color: 'var(--ink)', minHeight: 44, padding: '4px 12px' }}
        onClick={() => navigate(path)}
        aria-current={active ? 'page' : undefined}
      >
        <span aria-hidden>{icon}</span> <span className="tab-label">{label}</span>
      </button>
    );
  };
  return (
    <header style={{ background: 'var(--pine)', borderBottom: 'var(--border)', color: '#fff' }}>
      <style>{`
        @media (max-width: 640px) { .tab-label { display: none; } .brand-name { display: none; } }
        @media (max-width: 520px) { .topnav { order: 3; width: 100%; justify-content: space-between; } .topnav .btn { flex: 1; padding: 4px 0 !important; } }
      `}</style>
      <div className="page row" style={{ padding: '10px 16px', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/')} aria-label="Brain Camp home"
          style={{ background: 'none', border: 0, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: 0 }}>
          <svg width={38} height={38} viewBox="0 0 64 64" aria-hidden>
            <path d="M32 6 58 56H6z" fill="#e8743b" stroke="#1d2b2a" strokeWidth={4} strokeLinejoin="round" />
            <path d="M32 26 44 56H20z" fill="#f4c542" stroke="#1d2b2a" strokeWidth={3} strokeLinejoin="round" />
          </svg>
          <span className="brand-name" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.5rem' }}>Brain Camp</span>
        </button>
        <nav className="row topnav" style={{ gap: 6, flexWrap: 'nowrap' }} aria-label="Main">
          {tab('/', 'Map', '🗺️')}
          {tab('/tests', 'Challenges', '🏆')}
          {tab('/learn', 'Tricks', '🧰')}
          {tab('/patches', 'Patches', '🎖️')}
          {tab('/grownups', 'Grown-ups', '🔒')}
        </nav>
        <div className="spacer" />
        <div className="row" style={{ gap: 6, flexWrap: 'nowrap', color: 'var(--ink)' }}>
          {streak > 0 && <span className="chip" title={`${streak}-day streak`}>🔥 {streak}</span>}
          <span className="chip" title={`${xp} stars · Level ${lvl.level} ${lvl.title}`}>⭐ {xp}</span>
          <button className="chip" onClick={() => navigate('/grownups/profiles')} title="Switch camper" style={{ cursor: 'pointer', fontSize: '1.1rem' }}>
            {profile.avatar}
          </button>
        </div>
      </div>
    </header>
  );
}
