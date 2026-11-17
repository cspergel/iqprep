import { useMemo, useRef, useState, type ReactNode } from 'react';
import { buildReviewPlan, enabledSubtests, estimates } from '../app/derived';
import { navigate } from '../app/router';
import { useStore } from '../app/store';
import { BADGES, MASTERY_LABEL, allResults, currentStreak, dueReviews, levelFor, skillStats, totalXp } from '../core/progress';
import { buildReport, skillLabel, type SessionReport } from '../core/report';
import { computeProfile, formatPercentile, type ProfileScores } from '../core/scoring';
import { practicePlan } from '../core/session';
import { formatAge, makeBackup, parseBackup } from '../core/storage';
import { ALL_SUBTESTS, COMPOSITES, PRIMARY_INDEXES, SUBTESTS, ZONES, subtestsInZone, type ZoneId } from '../core/subtestInfo';
import type { CompositeId, PrimaryIndexId, SubtestId } from '../core/types';
import { getModule } from '../subtests/registry';
import { BarList, ChartWithTable, DotPlot, LineChart, type DotRow } from '../ui/charts';
import { Mascot } from '../ui/kit';
import { inputStyle } from './Welcome';
import { Gallery } from './Gallery';
import { ParentAccount } from './ParentAccount';

const TABS: [string, string][] = [
  ['overview', 'Overview'], ['reports', 'Score reports'], ['progress', 'Progress'], ['skills', 'Skills'], ['samples', 'Question gallery'],
  ['settings', 'Settings'], ['profiles', 'Campers'], ['guide', 'About the scores'],
];

let unlocked = false;

export function Grownups({ tab = 'overview', param }: { tab?: string; param?: string }) {
  const { settings, age } = useStore();
  const [ok, setOk] = useState(unlocked);
  if (!ok) return <Gate pin={settings.parentPin} onPass={() => { unlocked = true; setOk(true); }} />;
  const active = tab === 'report' ? 'reports' : tab;
  return (
    <div className="page">
      <div className="row no-print" style={{ marginTop: 8, marginBottom: 14, gap: 6 }}>
        <h1 style={{ margin: '0 12px 0 0', fontSize: '1.9rem' }}>🔒 Grown-ups</h1>
        {TABS.map(([id, label]) => (
          <button key={id} className="btn small" aria-current={active === id ? 'page' : undefined}
            style={{ background: active === id ? 'var(--sun)' : 'var(--card)', minHeight: 40 }} onClick={() => navigate(`/grownups/${id}`)}>{label}</button>
        ))}
      </div>
      {tab === 'overview' && <Overview />}
      {tab === 'reports' && <ReportList />}
      {tab === 'report' && <SessionReportView sessionId={param} />}
      {tab === 'progress' && <ProgressView />}
      {tab === 'skills' && <SkillsView />}
      {tab === 'samples' && <Gallery age={age} />}
      {tab === 'settings' && <SettingsView />}
      {tab === 'profiles' && <ProfilesView />}
      {tab === 'guide' && <GuideView />}
    </div>
  );
}

// ---------- gate ----------

function Gate({ pin, onPass }: { pin?: string; onPass: () => void }) {
  const [q] = useState(() => {
    const a = 6 + Math.floor(Math.random() * 7);
    const b = 6 + Math.floor(Math.random() * 7);
    return { a, b };
  });
  const [val, setVal] = useState('');
  const [err, setErr] = useState(false);
  const check = () => {
    const good = pin ? val === pin : Number(val) === q.a * q.b;
    if (good) onPass();
    else { setErr(true); setVal(''); }
  };
  return (
    <div className="page" style={{ maxWidth: 480 }}>
      <div className="card stack center" style={{ alignItems: 'center', marginTop: 30 }}>
        <Mascot mood="think" size={100} />
        <h2 style={{ margin: 0 }}>Grown-ups only</h2>
        <p style={{ margin: 0 }}>{pin ? 'Enter the grown-up PIN.' : <>To continue, what is <strong>{q.a} × {q.b}</strong>?</>}</p>
        <input value={val} onChange={(e) => { setVal(e.target.value.replace(/\D/g, '')); setErr(false); }}
          onKeyDown={(e) => e.key === 'Enter' && check()} inputMode="numeric" type={pin ? 'password' : 'text'} style={{ ...inputStyle, textAlign: 'center' }} autoFocus aria-label="Answer" />
        {err && <div className="small" style={{ color: 'var(--bad)' }}>That's not it — try again.</div>}
        <div className="row"><button className="btn ghost" onClick={() => navigate('/')}>Back</button><button className="btn primary" onClick={check}>Continue</button></div>
      </div>
    </div>
  );
}

// ---------- shared bits ----------

const CLASS_BANDS = [
  { from: 40, to: 70, label: 'Ext. Low' }, { from: 70, to: 80, label: 'Very Low' }, { from: 80, to: 90, label: 'Low Avg' },
  { from: 90, to: 110, label: 'Average' }, { from: 110, to: 120, label: 'High Avg' }, { from: 120, to: 130, label: 'Very High' },
  { from: 130, to: 160, label: 'Ext. High' },
];
const SCALED_BANDS = [
  { from: 1, to: 4, label: 'Ext. Low' }, { from: 4, to: 6, label: 'Very Low' }, { from: 6, to: 8, label: 'Low Avg' },
  { from: 8, to: 12, label: 'Average' }, { from: 12, to: 14, label: 'High Avg' }, { from: 14, to: 16, label: 'Very High' },
  { from: 16, to: 19, label: 'Ext. High' },
];
const COMPOSITE_ORDER: CompositeId[] = ['FSIQ', 'VCI', 'VSI', 'FRI', 'WMI', 'PSI', 'GAI', 'CPI', 'NVI', 'QRI', 'AWMI', 'NSI', 'STI', 'SRI'];

function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="card" style={{ marginBottom: 18 }}>
      <div className="row" style={{ marginBottom: 10 }}><h2 className="spacer" style={{ margin: 0, fontSize: '1.45rem' }}>{title}</h2>{right}</div>
      {children}
    </section>
  );
}

function Disclaimer() {
  return (
    <p className="small muted" style={{ margin: '6px 0 0' }}>
      ⚠️ Practice estimates from an independent app with its own original items and an approximate scoring model —
      <strong> not IQ scores</strong> and not a prediction of a real WISC-V result. Use them to track growth and spot
      relative strengths, not to label your child.
    </p>
  );
}

function table(head: string[], rows: ReactNode[][], align?: ('l' | 'r' | 'c')[]) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="data">
        <thead><tr>{head.map((h, i) => <th key={h} style={{ textAlign: align?.[i] === 'r' ? 'right' : align?.[i] === 'c' ? 'center' : 'left' }}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={{ textAlign: align?.[j] === 'r' ? 'right' : align?.[j] === 'c' ? 'center' : 'left' }}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function CompositeSection({ profile, showScores }: { profile: ProfileScores; showScores: boolean }) {
  const ids = COMPOSITE_ORDER.filter((id) => profile.composites[id]);
  if (!ids.length) {
    return <p className="muted">Composite scores need both subtests of an index. Take more games in a challenge to unlock them.</p>;
  }
  const rows: DotRow[] = ids.map((id) => {
    const c = profile.composites[id]!;
    return { id, label: COMPOSITES[id].short, sublabel: COMPOSITES[id].name, value: c.score, lo: c.ci95[0], hi: c.ci95[1], emphasis: id === 'FSIQ', tag: c.classification };
  });
  if (!showScores) {
    return table(['Composite', 'Description'], ids.map((id) => [<strong key={id}>{COMPOSITES[id].name}</strong>, profile.composites[id]!.classification]));
  }
  return (
    <ChartWithTable
      title="Composite scores (mean 100, SD 15) with 95% confidence bands"
      chart={<DotPlot rows={rows} min={40} max={160} ticks={[40, 55, 70, 85, 100, 115, 130, 145, 160]} bands={CLASS_BANDS} mean={profile.meanIndexScore} meanLabel={profile.meanIndexScore ? `MIS ${profile.meanIndexScore.toFixed(1)}` : undefined} />}
      table={table(
        ['Composite', 'Sum of scaled', 'Score', 'Percentile', '90% CI', '95% CI', 'Description'],
        ids.map((id) => {
          const c = profile.composites[id]!;
          return [<span key={id}><strong>{COMPOSITES[id].short}</strong> <span className="muted small">{COMPOSITES[id].name}</span></span>, c.sumOfScaled ?? '—', <strong key="s">{c.score}</strong>, formatPercentile(c.percentile), `${c.ci90[0]}–${c.ci90[1]}`, `${c.ci95[0]}–${c.ci95[1]}`, c.classification];
        }),
        ['l', 'r', 'r', 'r', 'r', 'r', 'l'],
      )}
    />
  );
}

function SubtestSection({ report, showScores }: { report: SessionReport; showScores: boolean }) {
  const ids = ALL_SUBTESTS.filter((s) => report.subtests[s]);
  const comp = new Map(report.profile.subtestComparisons.map((c) => [c.id, c]));
  const rows: DotRow[] = ids.map((s) => {
    const sc = report.subtests[s]!;
    const c = comp.get(s);
    return { id: s, label: SUBTESTS[s].name, sublabel: `${ZONES[SUBTESTS[s].zone].name}${SUBTESTS[s].tier !== 'primary' ? ` · ${SUBTESTS[s].tier}` : ''}`, value: sc.scaled, lo: sc.band[0], hi: sc.band[1], tag: c?.comparison === 'strength' ? 'S' : c?.comparison === 'weakness' ? 'W' : undefined };
  });
  if (!showScores) return table(['Subtest', 'Description'], ids.map((s) => [SUBTESTS[s].name, report.subtests[s]!.classification]));
  return (
    <ChartWithTable
      title="Subtest scaled scores (mean 10, SD 3)"
      chart={<DotPlot rows={rows} min={1} max={19} ticks={[1, 4, 7, 10, 13, 16, 19]} bands={SCALED_BANDS} mean={report.profile.meanScaledScore}
        meanLabel={report.profile.meanScaledScore ? `${report.profile.meanScaledBasis} ${report.profile.meanScaledScore.toFixed(1)}` : undefined} />}
      table={table(
        ['Subtest', 'Items', 'Raw', 'Scaled', 'Std', 'Percentile', 'Age equiv.', 'Description', 'S/W'],
        ids.map((s) => {
          const sc = report.subtests[s]!;
          const c = comp.get(s);
          return [SUBTESTS[s].name, sc.items, `${sc.raw}/${sc.maxRaw}`, <strong key="s">{sc.scaled}</strong>, sc.standard ?? '—', formatPercentile(sc.percentile), sc.ageEquivalent ?? '—', sc.classification,
            c ? (c.comparison === 'none' ? `${c.diffFromMean >= 0 ? '+' : ''}${c.diffFromMean.toFixed(1)}` : `${c.comparison === 'strength' ? 'S' : 'W'} (${c.diffFromMean >= 0 ? '+' : ''}${c.diffFromMean.toFixed(1)})`) : '—'];
        }),
        ['l', 'r', 'r', 'r', 'r', 'r', 'r', 'l', 'r'],
      )}
    />
  );
}

function Recommendations({ report }: { report: SessionReport }) {
  const growth = report.insights.filter((i) => i.kind === 'growth');
  const growthSubtests = [...new Set(growth.flatMap((g) => (g.subtest ? [g.subtest] : g.index ? COMPOSITES[g.index].subtests : [])))].slice(0, 4);
  const strengths = report.insights.filter((i) => i.kind === 'strength' || i.kind === 'celebrate');
  const { startSession } = useStore();
  return (
    <div className="grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))' }}>
      <div className="card flat tint stack" style={{ gap: 8 }}>
        <h3 style={{ margin: 0 }}>🌟 Reinforce what's working</h3>
        {strengths.length === 0 && <p className="small muted" style={{ margin: 0 }}>A balanced profile — no area stands out. Keep sessions varied.</p>}
        {strengths.slice(0, 5).map((s, i) => <div key={i} className="small"><strong>{s.title}.</strong> {s.text}</div>)}
        <p className="small" style={{ margin: 0 }}>Praise the strategy, not the score: “You checked every row — that’s how you cracked it.” Keep strong areas challenging so they stay fun.</p>
      </div>
      <div className="card flat tint stack" style={{ gap: 8 }}>
        <h3 style={{ margin: 0 }}>🌱 Focus next</h3>
        {growthSubtests.length === 0 && <p className="small muted" style={{ margin: 0 }}>No clear growth areas from this session.</p>}
        {growthSubtests.map((s) => {
          const g = getModule(s).guide;
          return (
            <div key={s} className="small stack" style={{ gap: 4 }}>
              <strong>{SUBTESTS[s].icon} {SUBTESTS[s].kidName} ({SUBTESTS[s].name})</strong>
              <span>Try at home: {g.everydayActivities[0]}</span>
              <div><button className="btn lake small" style={{ minHeight: 36 }} onClick={() => { startSession(practicePlan(s, 'tutor', 6)); navigate('/play'); }}>Practise with Pip</button></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- overview ----------

function Overview() {
  const { data, age, profile, settings, startSession } = useStore();
  const rs = useMemo(() => (data ? allResults(data) : []), [data]);
  if (!data || !profile) return null;
  const est = estimates(data, age);
  const practiceProfile = computeProfile(est);
  const week = Date.now() - 7 * 86_400_000;
  const weekResults = rs.filter((r) => r.at >= week);
  const minutesWeek = Math.round(weekResults.reduce((a, r) => a + Math.min(r.timeMs, 180_000), 0) / 60000);
  const due = dueReviews(data.review);
  const xp = totalXp(data);
  const stats = skillStats(data);
  const counts = (s: SubtestId) => rs.filter((r) => r.subtest === s).length;
  const tested = ALL_SUBTESTS.filter((s) => est[s] !== undefined);
  const strongest = [...tested].sort((a, b) => est[b]! - est[a]!).slice(0, 3);
  const weakest = [...tested].sort((a, b) => est[a]! - est[b]!).slice(0, 3);
  const reviewPlan = buildReviewPlan(data);

  return (
    <>
      <div className="grid-auto" style={{ marginBottom: 18 }}>
        <Stat label="Camper" value={`${profile.avatar} ${profile.name}`} sub={`Age ${formatAge(age)}`} />
        <Stat label="This week" value={`${minutesWeek} min`} sub={`${weekResults.length} answers · goal ${settings.dailyGoalMinutes} min/day`} />
        <Stat label="Streak" value={`🔥 ${currentStreak(data.activeDays)} day${currentStreak(data.activeDays) === 1 ? '' : 's'}`} sub={`${data.activeDays.length} active days total`} />
        <Stat label="Level" value={`⭐ ${levelFor(xp).level}`} sub={`${xp} stars · ${data.badges.length}/${BADGES.length} patches`} />
      </div>

      <Section title="Practice profile" right={<span className="small muted">from all practice so far</span>}>
        {tested.length === 0 ? <p className="muted">No games played yet. Start with a Camp Quest or a Mini Camp Challenge!</p> : (
          <>
            <div className="stack" style={{ gap: 6 }}>
              {(['VCI', 'VSI', 'FRI', 'WMI', 'PSI', 'EXTRA'] as ZoneId[]).map((z) => {
                const subs = subtestsInZone(z).filter((s) => est[s] !== undefined);
                if (!subs.length) return null;
                return (
                  <div key={z} className="row small" style={{ gap: 8 }}>
                    <strong style={{ minWidth: 190 }}>{ZONES[z].icon} {ZONES[z].name}</strong>
                    {subs.map((s) => {
                      const n = counts(s);
                      const conf = n < 6 ? 'low' : n < 16 ? 'medium' : 'good';
                      return (
                        <span key={s} className="chip" title={`${n} answers · confidence ${conf}`}>
                          {SUBTESTS[s].name}{settings.showScores ? `: ${est[s]}` : ''}{conf === 'low' ? ' ·?' : ''}
                        </span>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            {settings.showScores && PRIMARY_INDEXES.some((i) => practiceProfile.composites[i]) && (
              <p className="small" style={{ marginBottom: 0 }}>
                <strong>Estimated indexes:</strong>{' '}
                {(['FSIQ', ...PRIMARY_INDEXES] as CompositeId[]).filter((i) => practiceProfile.composites[i]).map((i) => `${COMPOSITES[i].short} ${practiceProfile.composites[i]!.score}`).join(' · ')}
              </p>
            )}
            <p className="small muted">Scaled scores (10 = typical for age). “?” = fewer than 6 answers, so treat as a rough guess. For a cleaner estimate, run a Camp Challenge.</p>
            <div className="grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))' }}>
              <div className="card flat tint">
                <h3>🌟 Strongest right now</h3>
                <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{strongest.map((s) => <li key={s}>{SUBTESTS[s].name} — {SUBTESTS[s].measures}</li>)}</ul>
              </div>
              <div className="card flat tint">
                <h3>🌱 Most room to grow</h3>
                <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{weakest.map((s) => <li key={s}>{SUBTESTS[s].name} — try: {getModule(s).guide.everydayActivities[0]}</li>)}</ul>
              </div>
            </div>
            <Disclaimer />
          </>
        )}
      </Section>

      <Section title="Spaced review" right={reviewPlan && <button className="btn lake small" onClick={() => { startSession(reviewPlan); navigate('/play'); }}>Start Memory Quest</button>}>
        <p className="small" style={{ marginTop: 0 }}>
          Missed skills come back after ½, 1, 3, 7, 14 and 30 days (spaced retrieval — one of the best-evidenced learning techniques).
          {due.length ? ` ${due.length} skill${due.length > 1 ? 's are' : ' is'} due now.` : ' Nothing is due right now.'}
        </p>
        {data.review.length > 0 && (
          <div className="row small" style={{ gap: 6 }}>
            {data.review.slice().sort((a, b) => a.due - b.due).slice(0, 14).map((c) => (
              <span key={c.skill} className="chip" title={`Box ${c.box} · due ${new Date(c.due).toLocaleString()}`}>
                {c.due <= Date.now() ? '⏰' : '🗓️'} {skillLabel(c.skill)}
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section title="Mastery snapshot">
        <div className="row small" style={{ gap: 10 }}>
          {(['attempted', 'familiar', 'proficient', 'mastered'] as const).map((lv) => (
            <span key={lv} className="chip">{MASTERY_LABEL[lv]}: {stats.filter((s) => s.level === lv).length}</span>
          ))}
          <button className="btn ghost small" onClick={() => navigate('/grownups/skills')}>See all skills ➜</button>
        </div>
      </Section>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="small muted">{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.6rem', lineHeight: 1.2 }}>{value}</div>
      {sub && <div className="small muted">{sub}</div>}
    </div>
  );
}

// ---------- reports ----------

function ReportList() {
  const { data } = useStore();
  if (!data) return null;
  const sessions = data.sessions.filter((s) => s.results.length > 0).slice().reverse();
  return (
    <Section title="Score reports">
      <p className="small muted" style={{ marginTop: 0 }}>Every session has a report. Challenges (test rules) give the most meaningful scores; practice sessions adapt difficulty, so their scores are rougher.</p>
      {sessions.length === 0 ? <p className="muted">No sessions yet.</p> : table(
        ['Date', 'Session', 'Type', 'Answers', ''],
        sessions.map((s) => [
          new Date(s.startedAt).toLocaleDateString(), s.title, `${s.kind}${s.completed ? '' : ' (unfinished)'}`, s.results.length,
          <button key={s.id} className="btn ghost small" style={{ minHeight: 34 }} onClick={() => navigate(`/grownups/report/${s.id}`)}>View report</button>,
        ]),
        ['l', 'l', 'l', 'r', 'r'],
      )}
    </Section>
  );
}

function SessionReportView({ sessionId }: { sessionId?: string }) {
  const { data, settings, profile } = useStore();
  const session = data?.sessions.find((s) => s.id === sessionId);
  const report = useMemo(() => (session ? buildReport(session.results, session.age, { timed: session.mode === 'test' }) : null), [session]);
  if (!session || !report || !profile) return <Section title="Report"><p>Report not found.</p></Section>;
  const p = report.profile;
  const show = settings.showScores;

  return (
    <div className="report">
      <Section title={`${session.title} — ${profile.name}`} right={<button className="btn ghost small no-print" onClick={() => window.print()}>🖨️ Print / PDF</button>}>
        <div className="small">
          {new Date(session.startedAt).toLocaleString()} · age at session {formatAge(session.age)} · {report.totals.items} answers ·
          about {report.totals.minutes} min · {session.mode === 'test' ? 'standard test rules' : 'practice rules (adaptive / feedback)'}
          {!session.completed && ' · unfinished session'}
        </div>
        <Disclaimer />
      </Section>

      <Section title="Composite scores">
        <CompositeSection profile={p} showScores={show} />
        {Object.keys(p.missing).length > 0 && (
          <p className="small muted">Not computed (missing subtests): {Object.entries(p.missing).filter(([, v]) => v && v.length).map(([k, v]) => `${k} needs ${v!.join(', ')}`).join(' · ')}</p>
        )}
      </Section>

      <Section title="Subtest scores">
        <SubtestSection report={report} showScores={show} />
      </Section>

      {(p.indexComparisons.length > 0 || p.pairwise.length > 0) && (
        <Section title="Strengths & weaknesses">
          {p.indexComparisons.length > 0 && (
            <>
              <h3>Index level (vs mean of primary indexes{p.meanIndexScore ? ` = ${p.meanIndexScore.toFixed(1)}` : ''})</h3>
              {table(['Index', 'Score', 'Difference', 'Critical (≈.05)', 'Result'], p.indexComparisons.map((c) => [
                COMPOSITES[c.id].name, show ? c.score : '•', `${c.diffFromMean >= 0 ? '+' : ''}${c.diffFromMean.toFixed(1)}`, '±10',
                c.comparison === 'strength' ? '💪 Strength' : c.comparison === 'weakness' ? '🌱 Weakness' : '—',
              ]), ['l', 'r', 'r', 'r', 'l'])}
            </>
          )}
          {p.pairwise.length > 0 && (
            <>
              <h3 style={{ marginTop: 16 }}>Pairwise comparisons</h3>
              {table(['Comparison', 'Scores', 'Difference', 'Notable?'], p.pairwise.map((c) => [
                `${c.a} vs ${c.b}`, show ? `${c.scoreA} / ${c.scoreB}` : '•', `${c.diff >= 0 ? '+' : ''}${c.diff}`, c.significant ? '✔ notable' : '—',
              ]), ['l', 'r', 'r', 'l'])}
              <p className="small muted">“Notable” = larger than a typical .05 critical value. A notable gap is common in many children — it shows a relative pattern, not a problem.</p>
            </>
          )}
        </Section>
      )}

      {report.process.length > 0 && (
        <Section title="Process scores & observations">
          {table(['Measure', 'Value', 'Notes'], report.process.map((pr) => [pr.label, pr.kind === 'scaled' ? `${pr.value} (scaled)` : pr.value, pr.note ?? '']), ['l', 'r', 'l'])}
        </Section>
      )}

      <Section title="Insights">
        {report.insights.length === 0 && <p className="muted">Not enough data for detailed insights yet.</p>}
        <div className="stack" style={{ gap: 10 }}>
          {report.insights.map((ins, i) => (
            <div key={i} className={`feedback ${ins.kind === 'growth' ? 'partial' : ins.kind === 'strength' || ins.kind === 'celebrate' ? 'good' : ''}`} style={{ padding: '10px 14px' }}>
              <strong>{ins.kind === 'growth' ? '🌱' : ins.kind === 'observation' ? '🔎' : '🌟'} {ins.title}</strong>
              <div className="small">{ins.text}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Recommendations">
        <Recommendations report={report} />
      </Section>

      {report.skills.length > 0 && (
        <Section title="Skill breakdown">
          <BarList rows={report.skills.map((s) => ({ id: s.skill, label: `${SUBTESTS[s.subtest].icon} ${s.label}`, value: s.accuracy, note: `${s.correct}/${s.attempts}` }))} format={(v) => `${Math.round(v * 100)}%`} />
        </Section>
      )}
    </div>
  );
}

// ---------- progress over time ----------

function ProgressView() {
  const { data } = useStore();
  const points = useMemo(() => {
    if (!data) return [];
    return data.sessions
      .filter((s) => (s.kind === 'mock' || s.kind === 'short') && s.mode === 'test' && s.results.length >= 6)
      .map((s) => ({ s, rep: buildReport(s.results, s.age, { timed: true }) }));
  }, [data]);
  const ids: CompositeId[] = ['FSIQ', 'VCI', 'VSI', 'FRI', 'WMI', 'PSI'];
  const series = ids.map((id) => ({
    id, label: id,
    points: points.filter((p) => p.rep.profile.composites[id]).map((p) => ({ x: p.s.startedAt, y: p.rep.profile.composites[id]!.score, label: p.s.title })),
  })).filter((s) => s.points.length > 0);

  const { settings } = useStore();
  return (
    <>
      <Section title="Score history (challenges)">
        {series.length === 0 ? <p className="muted">Take Camp Challenges over time to see scores change. Composite scores need both subtests of an index.</p>
          : settings.showScores ? (
            <ChartWithTable
              title="Composite scores per challenge"
              chart={<LineChart series={series} min={55} max={145} ticks={[55, 70, 85, 100, 115, 130, 145]} emphasize="FSIQ" />}
              table={table(['Date', 'Challenge', ...series.map((s) => s.label)], points.map((p) => [
                new Date(p.s.startedAt).toLocaleDateString(), p.s.title, ...series.map((s) => p.rep.profile.composites[s.id as CompositeId]?.score ?? '—'),
              ]))}
            />
          ) : <p className="muted">Numeric scores are hidden (Settings → show estimated scores).</p>}
        <Disclaimer />
        <p className="small muted">Practice effects are real: scores often rise on familiar formats. Growth on <em>new</em> item types and in everyday skills (reading, math, focus) is the real goal.</p>
      </Section>
      <PracticeTrend />
    </>
  );
}

function PracticeTrend() {
  const { data } = useStore();
  if (!data) return null;
  // Weekly accuracy across all practice, by zone.
  const byWeek = new Map<number, Map<string, { c: number; n: number }>>();
  for (const s of data.sessions) for (const r of s.results) {
    if (SUBTESTS[r.subtest].kind === 'speeded') continue;
    const wk = Math.floor(r.at / (7 * 86_400_000)) * 7 * 86_400_000;
    const z = SUBTESTS[r.subtest].zone;
    if (!byWeek.has(wk)) byWeek.set(wk, new Map());
    const m = byWeek.get(wk)!;
    const e = m.get(z) ?? { c: 0, n: 0 };
    e.n += 1; if (r.correct) e.c += 1;
    m.set(z, e);
  }
  const weeks = [...byWeek.keys()].sort();
  if (weeks.length < 2) return null;
  const zones: PrimaryIndexId[] = ['VCI', 'VSI', 'FRI', 'WMI', 'PSI'];
  const series = zones.map((z) => ({ id: z, label: ZONES[z].kidName, points: weeks.filter((w) => byWeek.get(w)!.get(z)).map((w) => {
    const e = byWeek.get(w)!.get(z)!;
    return { x: w, y: Math.round((100 * e.c) / e.n), label: `${e.c}/${e.n}` };
  }) })).filter((s) => s.points.length);
  return (
    <Section title="Practice accuracy by week">
      <p className="small muted" style={{ marginTop: 0 }}>Practice adapts difficulty to keep success near 75–80%, so steady accuracy while item difficulty rises is the healthy pattern.</p>
      <LineChart series={series} min={0} max={100} ticks={[0, 25, 50, 75, 100]} />
    </Section>
  );
}

// ---------- skills ----------

function SkillsView() {
  const { data } = useStore();
  if (!data) return null;
  const stats = skillStats(data);
  return (
    <>
      {(['VCI', 'VSI', 'FRI', 'WMI', 'PSI', 'EXTRA'] as ZoneId[]).map((z) => {
        const rows = stats.filter((s) => SUBTESTS[s.subtest].zone === z);
        if (!rows.length) return null;
        return (
          <Section key={z} title={`${ZONES[z].icon} ${ZONES[z].name}`}>
            <BarList rows={rows.map((s) => ({ id: s.skill, label: `${skillLabel(s.skill)} · ${MASTERY_LABEL[s.level]}`, value: s.recentAccuracy, note: `${s.correct}/${s.attempts}${data.mastered[s.skill] ? ' · 🏅' : ''}` }))} format={(v) => `${Math.round(v * 100)}%`} />
          </Section>
        );
      })}
      {stats.length === 0 && <Section title="Skills"><p className="muted">No skills tracked yet.</p></Section>}
      <p className="small muted">Mastery ladder: Getting started (&lt;70% recent) → Familiar (70–89%) → Proficient (90%+ over 5+) → Mastered (proficient, then right again in a later mixed quest or challenge). Two misses in the last three drop a level.</p>
    </>
  );
}

// ---------- settings ----------

function SettingsView() {
  const { settings, updateSettings, profile, updateProfile, data, resetData, importBackup, age } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  if (!profile || !data) return null;
  const toggle = (key: keyof typeof settings, label: string, help: string) => (
    <label className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: 10 }}>
      <input type="checkbox" checked={!!settings[key]} onChange={(e) => updateSettings({ [key]: e.target.checked })} style={{ width: 22, height: 22, flex: 'none', marginTop: 3 }} />
      <span><strong>{label}</strong><br /><span className="small muted">{help}</span></span>
    </label>
  );
  const exportData = () => {
    const blob = new Blob([JSON.stringify(makeBackup(profile, data), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `iq-prep-${profile.name.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const onImport = async (f: File | undefined) => {
    if (!f) return;
    try {
      importBackup(parseBackup(await f.text()));
      setMsg('Backup restored ✔');
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  return (
    <>
      <Section title="Play settings">
        <div className="stack" style={{ gap: 14 }}>
          {toggle('readAloud', 'Read questions aloud', 'Pip reads each question (tutor mode always does). Uses the device’s built-in voice.')}
          {toggle('sound', 'Sound effects', 'Chimes for right answers and celebrations.')}
          {toggle('practiceTimers', 'Gentle timers in practice', 'Show the standard time limits during practice. Challenges always use them. Start with this off; turn on once the formats feel easy.')}
          {toggle('confidencePrompts', '“How sure are you?” prompts', 'Builds self-monitoring (metacognition). Reports show calibration.')}
          {toggle('parentScoring', 'Grown-up scoring for word games', 'Your child answers Alike Game / Word Wizard / What Would You Do? out loud and you score 0–2 with a guide — closest to the real format.')}
          {toggle('showScores', 'Show estimated scores', 'Show numbers (scaled/standard scores, percentiles) in reports. Off = descriptions only.')}
          <div className="stack" style={{ gap: 6 }}>
            <strong>Strategy toolbox</strong>
            <span className="small muted">Several different ways to approach a problem, kept closed until your child opens it — so they explore methods instead of locking into one. Never shown in challenges.</span>
            <div className="row" style={{ gap: 6 }}>
              {([['onRequest', 'When they ask'], ['afterMiss', 'Nudge after a miss'], ['off', 'Off']] as const).map(([v, t]) => (
                <button key={v} className="btn small" style={{ background: settings.strategyToolbox === v ? 'var(--sun)' : 'var(--card)', minHeight: 40 }} onClick={() => updateSettings({ strategyToolbox: v })}>{t}</button>
              ))}
            </div>
          </div>
          <label className="row" style={{ gap: 10 }}>
            <strong>Daily goal</strong>
            {[10, 15, 20, 30].map((m) => (
              <button key={m} className="btn small" style={{ background: settings.dailyGoalMinutes === m ? 'var(--sun)' : 'var(--card)', minHeight: 40 }} onClick={() => updateSettings({ dailyGoalMinutes: m })}>{m} min</button>
            ))}
          </label>
        </div>
      </Section>

      <Section title="Games included">
        <p className="small muted" style={{ marginTop: 0 }}>Turn off games you don’t want in quests and the test builder.</p>
        <div className="row" style={{ gap: 8 }}>
          {ALL_SUBTESTS.map((s) => {
            const on = !settings.disabledSubtests.includes(s);
            return (
              <button key={s} className="btn small" aria-pressed={on} style={{ background: on ? 'var(--good-bg)' : 'var(--card)', minHeight: 40, opacity: on ? 1 : 0.6 }}
                onClick={() => updateSettings({ disabledSubtests: on ? [...settings.disabledSubtests, s] : settings.disabledSubtests.filter((x) => x !== s) })}>
                {on ? '✓' : '✗'} {SUBTESTS[s].icon} {SUBTESTS[s].name}
              </button>
            );
          })}
        </div>
        <p className="small muted">{enabledSubtests(settings, age).length} games on.</p>
      </Section>

      <Section title="Camper details">
        <div className="stack" style={{ gap: 12 }}>
          <label className="stack" style={{ gap: 4 }}><strong>Name</strong><input style={inputStyle} value={profile.name} onChange={(e) => updateProfile({ name: e.target.value })} /></label>
          <label className="stack" style={{ gap: 4 }}><strong>Birthday</strong><input style={inputStyle} type="date" value={profile.birthDate} onChange={(e) => e.target.value && updateProfile({ birthDate: e.target.value })} /></label>
          <label className="stack" style={{ gap: 4 }}>
            <strong>Grown-up PIN (optional)</strong>
            <input style={inputStyle} inputMode="numeric" maxLength={6} placeholder="Leave blank to use a math question" value={settings.parentPin ?? ''}
              onChange={(e) => updateSettings({ parentPin: e.target.value.replace(/\D/g, '') || undefined })} />
          </label>
        </div>
      </Section>

      <Section title="Parent account (optional)">
        <ParentAccount />
      </Section>

      <Section title="Your data">
        <p className="small" style={{ marginTop: 0 }}>Progress is stored in this browser. Export a backup file, or use a parent account above, to move it to another device.</p>
        <div className="row">
          <button className="btn ghost" onClick={exportData}>⬇️ Export backup</button>
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>⬆️ Import backup</button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => onImport(e.target.files?.[0])} />
          <ConfirmButton label="🗑️ Reset progress" confirm="Erase all of this camper’s progress?" onConfirm={() => { resetData(); setMsg('Progress reset.'); }} />
        </div>
        {msg && <p className="small">{msg}</p>}
      </Section>
    </>
  );
}

function ConfirmButton({ label, confirm, onConfirm }: { label: string; confirm: string; onConfirm: () => void }) {
  const [ask, setAsk] = useState(false);
  if (!ask) return <button className="btn ghost" onClick={() => setAsk(true)}>{label}</button>;
  return (
    <span className="row" style={{ gap: 6 }}>
      <span className="small"><strong>{confirm}</strong></span>
      <button className="btn small" style={{ background: 'var(--bad)', color: '#fff' }} onClick={() => { setAsk(false); onConfirm(); }}>Yes</button>
      <button className="btn ghost small" onClick={() => setAsk(false)}>No</button>
    </span>
  );
}

// ---------- profiles ----------

function ProfilesView() {
  const { profiles, profile, switchProfile, deleteProfile } = useStore();
  return (
    <Section title="Campers" right={<button className="btn primary small" onClick={() => navigate('/welcome')}>➕ Add camper</button>}>
      <div className="stack">
        {profiles.map((p: { id: string; avatar: string; name: string; birthDate: string }) => (
          <div key={p.id} className="row card flat" style={{ padding: 12 }}>
            <span style={{ fontSize: 30 }}>{p.avatar}</span>
            <span className="spacer"><strong>{p.name}</strong> <span className="small muted">born {p.birthDate}</span></span>
            {profile?.id === p.id ? <span className="chip">Playing now</span> : <button className="btn small" onClick={() => { switchProfile(p.id); navigate('/'); }}>Switch</button>}
            <ConfirmButton label="Delete" confirm={`Delete ${p.name}?`} onConfirm={() => deleteProfile(p.id)} />
          </div>
        ))}
      </div>
    </Section>
  );
}

// ---------- guide ----------

function GuideView() {
  return (
    <>
      <Section title="How the scores work">
        <ul>
          <li><strong>Scaled scores</strong> (subtests): mean 10, SD 3, range 1–19. 8–12 is the average range for age.</li>
          <li><strong>Composite / index scores</strong>: mean 100, SD 15. Primary indexes 45–155; FSIQ and ancillary indexes 40–160. Built from sums of subtest scaled scores using published subtest intercorrelations (this method reproduces published example profiles within about ±1 point).</li>
          <li><strong>Percentile</strong>: the percent of same-age children expected to score lower.</li>
          <li><strong>Confidence intervals</strong> (90%/95%): computed the way Wechsler reports do — around the estimated true score using the standard error of estimation.</li>
          <li><strong>Descriptions</strong>: Extremely High 130+, Very High 120–129, High Average 110–119, Average 90–109, Low Average 80–89, Very Low 70–79, Extremely Low ≤69.</li>
          <li><strong>Strengths/weaknesses</strong>: each index vs the mean of the primary indexes (MIS); each subtest vs MSS-P (10 primaries) or MSS-F (FSIQ seven), using approximate .05 critical values.</li>
          <li><strong>Age equivalent</strong>: the age at which a typical child performs at this level.</li>
          <li><strong>Process scores</strong>: Block Design without time limit (BDn) and rotation errors, Digit Span forward/backward/sequencing and longest spans, picture and letter–number spans, Cancellation scattered vs rows, and error counts on speed tasks.</li>
        </ul>
        <h3>How ability is estimated</h3>
        <p>Each practice item has a difficulty on an age scale. Your child's answers are combined with an item-response model (Rasch-style, expected a-posteriori) to estimate the age level they work at, which is converted to a scaled score for their exact age. Speed tasks compare the amount completed to rough age expectations. Because the items and norms are this app's own, scores are approximate.</p>
      </Section>
      <Section title="The five areas (indexes)">
        <ul>
          {PRIMARY_INDEXES.map((id) => (
            <li key={id}><strong>{COMPOSITES[id].name} ({ZONES[id].kidName}):</strong> {COMPOSITES[id].description} Subtests: {COMPOSITES[id].subtests.map((s) => SUBTESTS[s].name).join(', ')}.</li>
          ))}
          <li><strong>Ancillary:</strong> GAI (reasoning without memory/speed), CPI (memory + speed efficiency), NVI (minimal language), QRI (number reasoning), AWMI (auditory memory).</li>
          <li><strong>Complementary:</strong> Naming Speed (NSI), Symbol Translation (STI), Storage & Retrieval (SRI) — related to reading/math fluency and learning, not intelligence.</li>
        </ul>
      </Section>
      <Section title="Using IQ Prep well">
        <ul>
          <li><strong>Little and often.</strong> 10–20 minutes, 3–5 days a week beats long sessions. The daily quest mixes areas (interleaving) and brings back missed skills on a schedule (spaced retrieval).</li>
          <li><strong>Praise effort and strategy</strong>, not being “smart”. Mistakes are part of the plan — challenges are designed so everyone misses some.</li>
          <li><strong>Flexible thinking over formulas.</strong> The strategy toolbox offers several approaches and stays closed until your child wants it.</li>
          <li><strong>Read together, talk about words, play logic and building games</strong> — the everyday activities in each game’s grown-up notes build the same skills more broadly.</li>
          <li><strong>Before an evaluation:</strong> stop intensive test-style practice 1–2 weeks before, and tell the psychologist about the practice. The goal is comfort with the formats and real skills, not inflated scores.</li>
          <li><strong>Honest limits:</strong> “brain training” improves the trained tasks; it doesn’t reliably raise general intelligence. The broader skills here (vocabulary, reasoning, number sense, attention) are valuable in their own right.</li>
        </ul>
        <p className="small muted">IQ Prep is not affiliated with or endorsed by Pearson or the Wechsler tests. WISC® is a trademark of NCS Pearson, Inc. All items are original. Data never leaves this device.</p>
      </Section>
    </>
  );
}
