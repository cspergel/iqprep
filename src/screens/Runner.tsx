import { useEffect, useMemo, useRef, useState } from 'react';
import { navigate } from '../app/router';
import { praise } from '../app/praise';
import { sfx } from '../app/sound';
import { useStore } from '../app/store';
import { allResults, starsFor } from '../core/progress';
import { SessionEngine, type NextItem } from '../core/session';
import { makeSpeak, speakText, stopSpeaking } from '../core/speech';
import { newId, type SessionRecord } from '../core/storage';
import { SUBTESTS, ZONES } from '../core/subtestInfo';
import type { Item, ItemResult, ScoreOutcome, SubtestId } from '../core/types';
import { getModule } from '../subtests/registry';
import { Mascot, PipSays, Stars, TimerBar } from '../ui/kit';
import { StrategyToolbox } from '../ui/StrategyToolbox';

type Phase = 'intro' | 'break' | 'sample' | 'play' | 'confidence' | 'feedback';

/** How time limits behave per subtest: hard = answer scores 0 after the limit; soft = flagged only. */
const TIME_RULE: Partial<Record<SubtestId, 'hard' | 'soft'>> = { FW: 'hard', VP: 'hard', AR: 'hard', BD: 'soft', MR: 'soft', PC: 'soft' };
/**
 * Like the real test, the first scored items of these subtests are "teaching items": after a miss the
 * child is shown the right answer, even in a challenge.
 */
const TEACHING_SUBTESTS = new Set<SubtestId>(['SI', 'VC', 'CO', 'MR', 'FW', 'VP', 'PC', 'BD', 'PS']);
/** Games where listening is the task: the player handles its own audio. */
const AUDIO_TASKS = new Set<SubtestId>(['DS', 'LN', 'AR', 'IST', 'DST', 'RST', 'SI', 'VC', 'IN', 'CO']);

let lastEarned: string[] = [];
export function takeLastEarned(): string[] {
  const out = lastEarned;
  lastEarned = [];
  return out;
}

export function Runner() {
  const { activePlan, data, age, settings, saveSession, profile } = useStore();
  const plan = activePlan;

  const engine = useMemo(
    () => (plan && data ? new SessionEngine(plan, { age, history: allResults(data), getModule }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan],
  );
  const record = useRef<SessionRecord | null>(null);
  if (plan && !record.current) {
    record.current = {
      id: newId(), kind: plan.kind, title: plan.title, mode: plan.mode, startedAt: Date.now(), age,
      subtests: [...new Set(plan.blocks.map((b) => b.subtest))], results: [], completed: false, battery: plan.battery,
    };
  }

  const [cur, setCur] = useState<NextItem | null>(() => engine?.next() ?? null);
  const [phase, setPhase] = useState<Phase>('intro');
  const [hintLevel, setHintLevel] = useState(0);
  const [attempt, setAttempt] = useState(1);
  const [playerKey, setPlayerKey] = useState(0);
  const [overTime, setOverTime] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [pending, setPending] = useState<{ response: unknown; outcome: ScoreOutcome } | null>(null);
  const [feedback, setFeedback] = useState<{ response: unknown; outcome: ScoreOutcome; result: ItemResult; teaching?: boolean } | null>(null);
  const [sample, setSample] = useState<{ item: Item; reveal?: { response: unknown; outcome: ScoreOutcome }; tries: number } | null>(null);
  const started = useRef(Date.now());
  const answeredCount = useRef(0);

  useEffect(() => () => stopSpeaking(), []);

  // Narrate the prompt when an item starts (tutor always; practice if read-aloud is on).
  const item = cur?.item;
  const info = item ? SUBTESTS[item.subtest] : null;
  const mode = plan?.mode ?? 'practice';
  useEffect(() => {
    if (phase !== 'play' || !item || !info) return;
    started.current = Date.now();
    if (info.kind === 'speeded' || AUDIO_TASKS.has(item.subtest)) return;
    if ((mode === 'tutor' || settings.readAloud) && item.speak && attempt === 1) void speakText(item.speak);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, item?.id]);

  // Examiner-style nudge: "Do you have an answer?" after item.promptAtSec (not in tutor mode).
  useEffect(() => {
    if (phase !== 'play' || !item?.promptAtSec || mode === 'tutor') return;
    const t = setTimeout(() => {
      setBanner('Do you have an answer? 🙂');
      if (settings.readAloud) void speakText('Do you have an answer?');
    }, item.promptAtSec * 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, item?.id, playerKey]);

  if (!plan || !engine || !record.current) {
    return (
      <div className="page center stack" style={{ alignItems: 'center', paddingTop: 60 }}>
        <PipSays mood="think">Hmm, there's no game running. Let's pick one!</PipSays>
        <button className="btn primary" onClick={() => navigate('/')}>Back to camp</button>
      </div>
    );
  }

  const rec = record.current;
  const speak = makeSpeak(mode === 'tutor' || settings.readAloud);

  const finish = (completed: boolean) => {
    stopSpeaking();
    rec.completed = completed;
    rec.endedAt = Date.now();
    if (rec.results.length === 0) {
      navigate('/');
      return;
    }
    lastEarned = saveSession({ ...rec, results: [...rec.results] });
    navigate(`/done/${rec.id}`);
  };

  const advance = () => {
    const n = engine.next();
    setHintLevel(0);
    setAttempt(1);
    setOverTime(false);
    setBanner(null);
    setPending(null);
    setFeedback(null);
    setPlayerKey((k) => k + 1);
    if (!n) {
      finish(true);
      return;
    }
    const newBlock = n.blockIndex !== cur?.blockIndex;
    setCur(n);
    if (newBlock && plan.breaks && n.blockIndex > 0 && n.blockIndex % 3 === 0) setPhase('break');
    else if (newBlock) setPhase('intro');
    else setPhase('play');
    // Effort praise now and then in test mode (examiners praise effort, never correctness).
    if (mode === 'test' && answeredCount.current > 0 && answeredCount.current % 6 === 0) {
      setBanner(praise.effort());
      setTimeout(() => setBanner(null), 2200);
    }
  };

  if (!cur || !item || !info) {
    return null;
  }
  const mod = getModule(item.subtest);
  const zone = ZONES[info.zone];
  const block = cur.block;

  const finalize = (response: unknown, outcome: ScoreOutcome, confidence?: number) => {
    const timeMs = Date.now() - started.current;
    const result: ItemResult = {
      itemId: item.id, subtest: item.subtest, difficulty: item.difficulty, seed: item.seed,
      points: outcome.points, maxPoints: item.maxPoints, correct: outcome.correct, timeMs,
      overTime, hintsUsed: hintLevel, attempts: attempt, skills: item.skills, mode, at: Date.now(),
      meta: outcome.meta, confidence,
    };
    engine.record(result);
    rec.results.push(result);
    answeredCount.current += 1;
    saveSession({ ...rec, results: [...rec.results] });
    const teaching = !plan.feedback && block.strategy === 'standard' && cur.indexInBlock < 2 &&
      TEACHING_SUBTESTS.has(item.subtest) && outcome.points < item.maxPoints;
    if (plan.feedback) {
      if (outcome.correct) sfx.correct();
      else if (outcome.points > 0) sfx.partial();
      else sfx.tryAgain();
      setFeedback({ response, outcome, result });
      setPhase('feedback');
    } else if (teaching) {
      setFeedback({ response, outcome, result, teaching: true });
      setPhase('feedback');
    } else {
      advance();
    }
  };

  // Challenges: a sample item (with feedback, not scored) before the scored items of each block.
  const startBlock = () => {
    sfx.tap();
    if (mode === 'test' && info.kind !== 'speeded') {
      try {
        const s = mod.generate({ difficulty: Math.max(3.5, age - 2.5), seed: 777 + cur.blockIndex, age, mode: 'practice', variant: block.variant });
        setSample({ item: s, tries: 0 });
        setPhase('sample');
        return;
      } catch {
        /* no sample available: go straight to the items */
      }
    }
    setPhase('play');
  };

  const onSubmit = (response: unknown) => {
    stopSpeaking();
    const outcome = mod.score(item as Item<never>, response as never);
    const speeded = info.kind === 'speeded';
    if (mode === 'tutor' && !outcome.correct && attempt === 1 && !speeded) {
      sfx.tryAgain();
      setAttempt(2);
      setHintLevel((h) => Math.max(1, h));
      setBanner(praise.tryAgain());
      setPlayerKey((k) => k + 1);
      return;
    }
    const askConfidence = plan.feedback && settings.confidencePrompts && !speeded && answeredCount.current % 2 === 0;
    if (askConfidence) {
      setPending({ response, outcome });
      setPhase('confidence');
      return;
    }
    finalize(response, outcome);
  };

  const timeRule = TIME_RULE[item.subtest];
  const showTimer = info.kind !== 'speeded' && mode !== 'tutor' && !!item.timeLimitSec && !!timeRule && (plan.timed || settings.practiceTimers);
  // Math stories: the real clock starts after the story is read, so add the reading time.
  const storyText = item.subtest === 'AR' ? String((item.payload as { text?: string })?.text ?? '') : '';
  const timerSeconds = (item.timeLimitSec ?? 0) + (storyText ? Math.ceil(storyText.split(/\s+/).length * 0.45) + 3 : 0);
  const onExpire = () => {
    setOverTime(true);
    if (timeRule === 'hard' && plan.timed) {
      setBanner("Time's up! Let's try the next one.");
      setTimeout(() => finalize(null, mod.score(item as Item<never>, null)), 900);
    }
  };

  const totalBlocks = plan.blocks.length;
  const hints = item.hints ?? [];
  const canHint = mode !== 'test' && info.kind !== 'speeded' && hints.length > 0 && phase === 'play';
  const Player = mod.Player;
  const showToolbox = mode !== 'test' && info.kind !== 'speeded' && settings.strategyToolbox !== 'off';
  const blockSoFar = engine.blockResults(cur.blockIndex);
  const lastWasMiss = blockSoFar.length > 0 && !blockSoFar[blockSoFar.length - 1].correct;

  return (
    <div className="page" style={{ maxWidth: 920 }}>
      {/* top bar */}
      <div className="row" style={{ marginBottom: 12, flexWrap: 'nowrap' }}>
        <button className="btn ghost small icon" onClick={() => finish(false)} aria-label="Stop for now" title="Stop for now">✕</button>
        <div className="spacer" style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
            <span className="chip" style={{ background: zone.color, color: zone.ink, whiteSpace: 'nowrap' }}>{info.icon} {block.label ?? info.kidName}</span>
            <span className="small muted" style={{ whiteSpace: 'nowrap' }}>{mode === 'tutor' ? 'Learn with Pip' : mode === 'test' ? 'Challenge' : 'Practice'}</span>
          </div>
          <div aria-label={`Part ${cur.blockIndex + 1} of ${totalBlocks}`} style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            {plan.blocks.map((_, i) => (
              <span key={i} style={{ flex: 1, height: 8, borderRadius: 4, border: '2px solid var(--ink)', background: i < cur.blockIndex ? 'var(--good)' : i === cur.blockIndex ? 'var(--sun)' : 'var(--card)' }} />
            ))}
          </div>
        </div>
      </div>

      {banner && <div className="hint pop-in center" role="status" style={{ marginBottom: 10, fontWeight: 700 }}>{banner}</div>}

      {phase === 'break' && (
        <div className="card center stack pop-in" style={{ alignItems: 'center', padding: 30 }}>
          <Mascot mood="cheer" size={130} className="float" />
          <h2>Stretch break! 🙆</h2>
          <p>Stand up, reach for the sky, wiggle your fingers, and take three big breaths.</p>
          <button className="btn go big" onClick={() => setPhase('intro')}>I'm ready!</button>
        </div>
      )}

      {phase === 'intro' && (
        <BlockIntro
          subtest={item.subtest}
          mode={mode}
          age={age}
          variant={block.variant}
          label={block.label ?? info.kidName}
          name={profile?.name}
          toolbox={mode !== 'test' && settings.strategyToolbox !== 'off'}
          narrate={mode === 'tutor' || settings.readAloud}
          onStart={startBlock}
        />
      )}

      {phase === 'sample' && sample && (
        <div className="card" style={{ padding: 'clamp(12px, 3vw, 24px)' }}>
          <div className="hint" style={{ marginBottom: 12 }}><strong>Practice one first!</strong> This one doesn't count.</div>
          <mod.Player key={`sample-${sample.tries}`} item={sample.item} mode="practice" age={age} hintLevel={sample.tries > 0 ? 1 : 0} speak={speak}
            parentScoring={settings.parentScoring && !!info.parentScorable}
            reveal={sample.reveal}
            onSubmit={(resp) => {
              if (sample.reveal) return;
              const outcome = mod.score(sample.item as Item<never>, resp as never);
              if (outcome.correct) sfx.correct(); else sfx.tryAgain();
              setSample({ ...sample, reveal: { response: resp, outcome } });
            }} />
          {sample.reveal && (
            <div className={`feedback ${sample.reveal.outcome.correct ? 'good' : 'bad'} pop-in`} style={{ marginTop: 16 }}>
              <strong>{sample.reveal.outcome.correct ? "Great, you've got it!" : "Not quite. Here's how it works."}</strong>
              <div style={{ marginTop: 6 }}>{sample.item.explanation}</div>
              <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                {!sample.reveal.outcome.correct && sample.tries < 1 && (
                  <button className="btn ghost" onClick={() => setSample({ ...sample, reveal: undefined, tries: sample.tries + 1 })}>Try it again</button>
                )}
                <button className="btn primary" onClick={() => { setSample(null); setPhase('play'); }}>Now the real ones ➜</button>
              </div>
            </div>
          )}
        </div>
      )}

      {(phase === 'play' || phase === 'confidence' || phase === 'feedback') && (
        <div className="card" style={{ padding: 'clamp(12px, 3vw, 24px)' }}>
          {showTimer && phase === 'play' && (
            <div style={{ marginBottom: 12 }}>
              <TimerBar seconds={timerSeconds} running={phase === 'play'} onExpire={onExpire} resetKey={`${item.id}-${playerKey}`} />
            </div>
          )}
          <Player
            key={`${item.id}-${playerKey}`}
            item={item}
            mode={mode}
            age={age}
            onSubmit={phase === 'play' ? onSubmit : () => undefined}
            reveal={feedback ? { response: feedback.response, outcome: feedback.outcome } : undefined}
            hintLevel={hintLevel}
            speak={speak}
            parentScoring={settings.parentScoring && !!info.parentScorable}
          />

          {phase === 'play' && (canHint || item.speak || showToolbox) && info.kind !== 'speeded' && (
            <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
              {showToolbox && <StrategyToolbox key={`tb-${item.id}-${playerKey}`} guide={mod.guide} seed={item.seed} nudge={settings.strategyToolbox === 'afterMiss' && (attempt > 1 || lastWasMiss)} />}
              {item.speak && !AUDIO_TASKS.has(item.subtest) && (
                <button className="btn ghost small" onClick={() => speakText(item.speak!)}>🔊 Read to me</button>
              )}
              {canHint && hintLevel < hints.length && (
                <button className="btn ghost small" onClick={() => { sfx.tap(); setHintLevel((h) => h + 1); speak(hints[hintLevel]); }}>
                  💡 {hintLevel === 0 ? 'Hint' : 'Another hint'}
                </button>
              )}
            </div>
          )}
          {phase === 'play' && hintLevel > 0 && (
            <div className="stack" style={{ marginTop: 12 }}>
              {hints.slice(0, hintLevel).map((h, i) => (
                <div key={i} className="hint pop-in">💡 {h}</div>
              ))}
            </div>
          )}

          {phase === 'confidence' && pending && (
            <div className="stack pop-in" style={{ alignItems: 'center', marginTop: 18 }}>
              <div className="prompt" style={{ margin: 0 }}>How sure are you?</div>
              <div className="row" style={{ justifyContent: 'center' }}>
                {[{ v: 1, e: '🤔', t: 'Not sure' }, { v: 2, e: '🙂', t: 'Kind of' }, { v: 3, e: '😎', t: 'Very sure' }].map((c) => (
                  <button key={c.v} className="btn ghost" style={{ flexDirection: 'column', minHeight: 84, minWidth: 96 }}
                    onClick={() => finalize(pending.response, pending.outcome, c.v)}>
                    <span style={{ fontSize: 30 }}>{c.e}</span><span className="small">{c.t}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {phase === 'feedback' && feedback && (
            <FeedbackPanel item={item} outcome={feedback.outcome} result={feedback.result} onNext={advance} subtest={item.subtest}
              toolbox={showToolbox ? settings.strategyToolbox : 'off'} teaching={feedback.teaching} />
          )}
        </div>
      )}
    </div>
  );
}

function BlockIntro({ subtest, mode, age, variant, label, name, toolbox, narrate, onStart }: {
  subtest: SubtestId; mode: string; age: number; variant?: string; label: string; name?: string; toolbox: boolean; narrate: boolean; onStart: () => void;
}) {
  const info = SUBTESTS[subtest];
  const mod = getModule(subtest);
  const g = mod.guide;
  const zone = ZONES[info.zone];
  const [showDemo, setShowDemo] = useState(false);
  const demo = useMemo(() => {
    if (info.kind === 'speeded') return null;
    try {
      return mod.generate({ difficulty: Math.max(4, age - 2), seed: 4242, age, mode: 'tutor', variant });
    } catch {
      return null;
    }
  }, [mod, age, variant, info.kind]);

  useEffect(() => {
    if (mode !== 'test' && narrate) void speakText(g.kidIntro);
    return () => stopSpeaking();
  }, [g.kidIntro, mode, narrate]);

  return (
    <div className="card pop-in" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ background: zone.color, color: zone.ink, padding: '14px 20px', borderBottom: 'var(--border)' }}>
        <div className="small" style={{ opacity: 0.9, fontWeight: 700 }}>{zone.icon} {zone.kidName}</div>
        <h2 style={{ margin: 0 }}>{info.icon} {label}</h2>
      </div>
      <div className="stack" style={{ padding: 20, gap: 16 }}>
        <PipSays mood="wave">{mode === 'test' ? `${name ? `${name}, ` : ''}${praise.blockStart()}` : g.kidIntro}</PipSays>
        <div>
          <h3>How to play</h3>
          <ol style={{ margin: 0, paddingLeft: 22 }}>
            {g.howToPlay.map((s, i) => <li key={i} style={{ marginBottom: 4 }}>{s}</li>)}
          </ol>
        </div>
        {toolbox && <div><StrategyToolbox guide={g} seed={Math.floor(Math.random() * 100)} label="Peek in the strategy toolbox" /></div>}
        {(mode === 'tutor' || mode === 'test') && demo && (
          <div>
            {!showDemo ? (
              <button className="btn lake" onClick={() => setShowDemo(true)}>👀 Watch Pip solve one</button>
            ) : (
              <div className="card flat tint stack">
                <strong>Here's one Pip solved:</strong>
                <mod.Player item={demo} mode="tutor" age={age} onSubmit={() => undefined} hintLevel={1}
                  reveal={{ response: null, outcome: { points: demo.maxPoints, correct: true } }} speak={makeSpeak(false)} />
                <p style={{ margin: 0 }}><strong>Why:</strong> {demo.explanation}</p>
                {demo.steps && <ol style={{ margin: 0 }}>{demo.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}
              </div>
            )}
          </div>
        )}
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn primary big" onClick={onStart}>Let's go! ➜</button>
        </div>
      </div>
    </div>
  );
}

function FeedbackPanel({ item, outcome, result, onNext, subtest, toolbox, teaching }: {
  item: Item; outcome: ScoreOutcome; result: ItemResult; onNext: () => void; subtest: SubtestId; toolbox: 'onRequest' | 'afterMiss' | 'off'; teaching?: boolean;
}) {
  const g = getModule(subtest).guide;
  const speeded = SUBTESTS[subtest].kind === 'speeded';
  const kind = teaching ? 'partial' : outcome.correct ? 'good' : outcome.points > 0 ? 'partial' : 'bad';
  const [msg] = useState(() => (outcome.correct ? praise.correct() : outcome.points > 0 ? praise.partial() : praise.wrong()));
  const stars = starsFor(result);
  useEffect(() => {
    if (stars === 3) sfx.star();
  }, [stars]);
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => nextRef.current?.focus(), []);

  return (
    <div className={`feedback ${kind} pop-in`} style={{ marginTop: 18 }} role="status">
      <div className="row" style={{ alignItems: 'center', flexWrap: 'nowrap' }}>
        <Mascot mood={outcome.correct ? 'cheer' : outcome.points > 0 ? 'happy' : 'oops'} size={72} />
        <div className="spacer">
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.25rem' }}>
            {teaching ? 'Let me show you how this one works.' : speeded ? `You scored ${outcome.points}!` : msg}
          </div>
          {outcome.feedback && <div style={{ marginTop: 4 }}>{outcome.feedback}</div>}
        </div>
        {!teaching && <Stars count={stars} size={26} />}
      </div>
      {!speeded && (
        <div className="stack" style={{ marginTop: 10, gap: 8 }}>
          <div>
            <strong>{outcome.correct ? 'Why it works: ' : 'How it works: '}</strong>{item.explanation}
            <button className="btn ghost small" style={{ marginLeft: 8, minHeight: 34 }} onClick={() => speakText(item.explanation)} aria-label="Read the explanation">🔊</button>
          </div>
          {item.steps && item.steps.length > 0 && (
            <ol style={{ margin: 0, paddingLeft: 22 }}>{item.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
          )}
          {toolbox !== 'off' && !teaching && (
            <div><StrategyToolbox guide={g} seed={item.seed} label="Other ways to think about it" nudge={toolbox === 'afterMiss' && !outcome.correct} /></div>
          )}
        </div>
      )}
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
        <button ref={nextRef} className="btn primary" onClick={onNext}>Next ➜</button>
      </div>
    </div>
  );
}
