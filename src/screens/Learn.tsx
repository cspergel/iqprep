import { navigate } from '../app/router';
import { useStore } from '../app/store';
import { practicePlan } from '../core/session';
import { ALL_SUBTESTS, SUBTESTS, ZONES, subtestsInZone, type ZoneId } from '../core/subtestInfo';
import type { SubtestId } from '../core/types';
import { getModule } from '../subtests/registry';
import { PipSays } from '../ui/kit';
import { FLEXIBLE_MOVES, StrategyToolbox } from '../ui/StrategyToolbox';

/** The Trick Library: every game's toolbox in one place, plus general thinking moves. */
export function Learn({ subtest }: { subtest?: string }) {
  const { startSession } = useStore();
  const focus = subtest && ALL_SUBTESTS.includes(subtest as SubtestId) ? (subtest as SubtestId) : null;
  const zones: ZoneId[] = ['VCI', 'VSI', 'FRI', 'WMI', 'PSI', 'EXTRA'];

  return (
    <div className="page">
      <h1 style={{ marginTop: 8 }}>🧰 Trick Library</h1>
      <PipSays mood="think">
        Good thinkers have lots of tricks and pick the one that fits. Open a toolbox, try a trick, and if it doesn't work — try a different one!
      </PipSays>

      <section className="card" style={{ marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>Thinking moves for any puzzle</h2>
        <div className="grid-auto" style={{ gap: 10 }}>
          {FLEXIBLE_MOVES.map((m) => (
            <div key={m.title} className="card flat tint" style={{ padding: 12 }}>
              <strong>{m.title}</strong>
              <div className="small">{m.tip}</div>
            </div>
          ))}
        </div>
      </section>

      {zones.map((z) => (
        <section key={z} style={{ marginTop: 22 }}>
          <h2>{ZONES[z].icon} {ZONES[z].kidName}</h2>
          <div className="grid-auto">
            {subtestsInZone(z).filter((s) => !focus || s === focus).map((s) => {
              const g = getModule(s).guide;
              return (
                <div key={s} className="card stack" style={{ gap: 10 }}>
                  <h3 style={{ margin: 0 }}>{SUBTESTS[s].icon} {SUBTESTS[s].kidName}</h3>
                  <div className="small muted">{g.kidIntro}</div>
                  <StrategyToolbox guide={g} label="Open the toolbox" />
                  <div className="row">
                    <button className="btn lake small" onClick={() => { startSession(practicePlan(s, 'tutor', 6)); navigate('/play'); }}>Try a trick with Pip</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
