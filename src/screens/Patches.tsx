import { useStore } from '../app/store';
import { BADGES, levelFor, totalXp } from '../core/progress';
import { PipSays } from '../ui/kit';

export function Patches() {
  const { data } = useStore();
  if (!data) return null;
  const have = new Map(data.badges.map((b) => [b.id, b.at]));
  const lvl = levelFor(totalXp(data));
  return (
    <div className="page">
      <h1 style={{ marginTop: 8 }}>🎖️ Camp Patches</h1>
      <PipSays mood="cheer">You have {have.size} of {BADGES.length} patches and you're a Level {lvl.level} {lvl.title}! Patches come from trying, practising and never giving up.</PipSays>
      <div className="grid-auto" style={{ marginTop: 18 }}>
        {BADGES.map((b, i) => {
          const at = have.get(b.id);
          return (
            <div key={b.id} className="card center stack rise" style={{ alignItems: 'center', gap: 6, animationDelay: `${i * 40}ms`, opacity: at ? 1 : 0.55 }}>
              <div style={{
                width: 86, height: 86, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 44,
                border: '4px dashed var(--ink)', background: at ? 'var(--sun)' : 'var(--paper-2)', filter: at ? 'none' : 'grayscale(1)',
              }}>{b.icon}</div>
              <strong>{b.name}</strong>
              <div className="small muted">{b.description}</div>
              {at && <div className="small">Earned {new Date(at).toLocaleDateString()}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
