/**
 * One player for all four verbal subtests.
 *
 * On the real tests these questions are oral: the examiner reads the question, nothing is printed for
 * the child, and the child answers in their own words. So the default flow is "say it first":
 *  - Step 1 "Listen & say": the question is read aloud on mount (forced — listening is the task here)
 *    with a big "Hear it again" button. Test mode shows only a 👂 listening card (no printed question,
 *    never the Vocabulary word); practice/tutor also print the question as reading support. The child
 *    says an answer out loud (optionally captured by the browser's own speech recogniser) and taps
 *    "I said my answer". Practice/tutor offer "Skip to choices".
 *  - Step 2 "Which is closest to what you said?": the multiple-choice answers appear (each with a
 *    read-aloud speaker); the pick is scored 2 / 1 / 0 as before.
 *  - Parent-scoring mode (props.parentScoring on a parent-scorable item): the child answers out loud,
 *    the grown-up opens the scoring guide and taps 0 / 1 / 2. The question is read aloud here too.
 * The runner shows the timer, hints, feedback and explanation; this player does not.
 */
import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { stopSpeaking } from '../../core/speech';
import type { PlayerProps } from '../../core/types';
import { ChoiceGrid, PipSays } from '../../ui/kit';
import { bestChoice, spokenText } from './engine';
import type { VerbalChoice, VerbalPayload, VerbalPoints, VerbalResponse } from './types';

/** Render CAPITALISED key words as highlighted normal-case words (easier for young readers). */
export function Emphasize({ text }: { text: string }) {
  const parts = text.split(/(\b[A-Z][A-Z'-]+\b)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^[A-Z][A-Z'-]+$/.test(p) ? (
          <strong key={i} style={{ color: 'var(--campfire)' }}>{p.toLowerCase()}</strong>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

const pointsLabel = (p: number) => (p === 1 ? '1 point' : `${p} points`);

function SpeakChip({ text, onSpeak }: { text: string; onSpeak: (t: string) => void }) {
  const fire = (e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onSpeak(text);
  };
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={`Read aloud: ${spokenText(text)}`}
      title="Read it to me"
      onClick={fire}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') fire(e);
      }}
      style={{
        flex: '0 0 auto', width: 40, height: 40, display: 'grid', placeItems: 'center',
        border: '2px solid var(--ink)', borderRadius: 10, background: 'var(--paper-2)', fontSize: 20, cursor: 'pointer',
      }}
    >
      🔊
    </span>
  );
}

function ChoiceBody({ choice, right }: { choice: VerbalChoice; right?: ReactNode }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left' }}>
      {choice.emoji && <span aria-hidden style={{ fontSize: 40, lineHeight: 1 }}>{choice.emoji}</span>}
      <span style={{ flex: 1, fontSize: '1.2rem', lineHeight: 1.35 }}>
        <Emphasize text={choice.text} />
      </span>
      {right}
    </span>
  );
}

function Picture({ emoji, label }: { emoji: string; label?: string }) {
  return (
    <div
      role="img"
      aria-label={label ?? 'picture'}
      className="card pop-in"
      style={{ fontSize: 'clamp(72px, 22vw, 120px)', lineHeight: 1.1, padding: '8px 24px' }}
    >
      {emoji}
    </div>
  );
}

function Scaffold({ text }: { text: string }) {
  return (
    <div className="hint" aria-live="polite" style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700 }}>
      💡 {text}
    </div>
  );
}

// ---------- reveal (both modes) ----------

function RevealList({ choices, chosen }: { choices: VerbalChoice[]; chosen?: string }) {
  const best = bestChoice(choices);
  return (
    <div className="choices" style={{ ['--choice-min' as string]: '280px', width: '100%' }} aria-label="Answers">
      {choices.map((c) => {
        const isBest = c.text === best.text;
        const isChosen = c.text === chosen;
        const partial = isChosen && !isBest && c.points > 0;
        const cls = isBest ? 'correct' : isChosen ? (partial ? '' : 'wrong') : 'dim';
        return (
          <div
            key={c.text}
            className={`choice ${cls}`}
            style={partial ? { background: 'var(--warn-bg)', borderColor: 'var(--campfire)', boxShadow: '2px 3px 0 var(--campfire)' } : undefined}
            aria-label={`${c.text}${isBest ? ' — best answer' : ''}${isChosen ? ' — your answer' : ''}`}
          >
            <span style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
              <ChoiceBody
                choice={c}
                right={
                  best.points > 1 && (isBest || isChosen) ? (
                    <span className="chip" style={{ flex: '0 0 auto' }}>{pointsLabel(c.points)}</span>
                  ) : undefined
                }
              />
              {partial && (
                <span className="small" style={{ fontWeight: 700, textAlign: 'left' }}>
                  ⭐ 1 point — true, but there's a better answer!
                </span>
              )}
            </span>
            {isBest && <span className="badge" aria-hidden>✓</span>}
            {isChosen && !isBest && !partial && <span className="badge" aria-hidden>✗</span>}
          </div>
        );
      })}
    </div>
  );
}

// ---------- parent-scoring mode ----------

function RubricGuide({ payload }: { payload: VerbalPayload }) {
  const rows: { pts: VerbalPoints; label: string; list: string[] }[] = [
    { pts: 2, label: '2 points', list: payload.rubric.two },
    { pts: 1, label: '1 point', list: payload.rubric.one },
    { pts: 0, label: '0 points', list: payload.rubric.zero },
  ];
  return (
    <div className="card flat tint" style={{ width: '100%', textAlign: 'left' }} aria-label="Scoring guide">
      {payload.rubricNote && <p className="small" style={{ marginTop: 0 }}>{payload.rubricNote}</p>}
      {rows.map((r) => (
        <div key={r.pts} style={{ marginBottom: 8 }}>
          <strong>{r.label}</strong> — for example:
          <ul style={{ margin: '4px 0 0', paddingLeft: 22 }}>
            {r.list.map((s) => (
              <li key={s}>“{s}”</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ParentScoring({ payload, onScore }: { payload: VerbalPayload; onScore: (p: VerbalPoints) => void }) {
  const [open, setOpen] = useState(false);
  const labels: Record<VerbalPoints, string> = { 0: 'Not yet', 1: 'Partly', 2: 'Great!' };
  return (
    <div className="stack" style={{ alignItems: 'center', width: '100%' }}>
      <PipSays mood="think">Say your answer out loud! Your grown-up is listening.</PipSays>
      <button type="button" className="btn ghost small" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        📋 {open ? 'Hide scoring guide' : 'Show scoring guide'}
      </button>
      {open && <RubricGuide payload={payload} />}
      <div className="small muted">Grown-up: tap a score</div>
      <div className="row" style={{ justifyContent: 'center' }}>
        {([0, 1, 2] as VerbalPoints[]).map((p) => (
          <button
            key={p}
            type="button"
            className={`btn big ${p === 2 ? 'go' : p === 1 ? 'primary' : 'ghost'}`}
            style={{ minWidth: 96, flexDirection: 'column', lineHeight: 1.1 }}
            aria-label={`Give ${pointsLabel(p)}`}
            onClick={() => onScore(p)}
          >
            <span>{p}</span>
            <span className="small">{labels[p]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- "say it first" pieces ----------

/** The 👂 card: the question is heard. Text is printed only when `text` is given (never in test mode). */
function ListenCard({ label, text, onHear }: { label: string; text?: string; onHear: () => void }) {
  return (
    <div className="card pop-in" aria-label="Listening card" style={{ width: '100%', maxWidth: 640, textAlign: 'center' }}>
      <div className="stack" style={{ alignItems: 'center', gap: 8 }}>
        <span aria-hidden style={{ fontSize: 'clamp(48px, 14vw, 72px)', lineHeight: 1 }}>👂</span>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.2rem' }}>{label}</div>
        {text && (
          <div className="prompt" style={{ maxWidth: 600, margin: 0 }}>
            <Emphasize text={text} />
          </div>
        )}
        <button type="button" className="btn big primary" aria-label="Hear it again" onClick={onHear}>
          🔊 Hear it again
        </button>
      </div>
    </div>
  );
}

interface RecognitionResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionCtor = new () => Recognition;

/** The browser's own speech recogniser, if it has one. Feature-detected; never required. */
export function speechRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Optional 🎤 button: captures what the child says (browser API only) so they can see it. */
function MicButton({ onTranscript }: { onTranscript: (t: string) => void }) {
  const [Ctor] = useState(speechRecognitionCtor);
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);
  useEffect(
    () => () => {
      try {
        rec.current?.abort();
      } catch {
        /* already stopped */
      }
    },
    [],
  );
  if (!Ctor) return null;

  const toggle = () => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    try {
      const r = new Ctor();
      r.lang = 'en-US';
      r.interimResults = true;
      r.continuous = false;
      r.maxAlternatives = 1;
      r.onresult = (e) => {
        const text = Array.from(e.results, (res) => res[0]?.transcript ?? '').join(' ').trim();
        if (text) onTranscript(text);
      };
      r.onend = () => setListening(false);
      r.onerror = () => setListening(false);
      rec.current = r;
      stopSpeaking(); // don't let the microphone hear the read-aloud voice
      r.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  return (
    <button type="button" className={`btn ${listening ? 'primary' : 'ghost'}`} aria-pressed={listening} aria-label={listening ? 'Stop listening' : 'Say it to the microphone'} onClick={toggle}>
      🎤 <span className="small">{listening ? 'Listening… tap to stop' : 'Say it to the mic'}</span>
    </button>
  );
}

function SaidChip({ text }: { text: string }) {
  return (
    <div className="chip" aria-label="What you said" style={{ maxWidth: '100%', whiteSpace: 'normal', fontSize: '1.05rem' }}>
      🗣️ You said: “{text}”
    </div>
  );
}

// ---------- player ----------

const CLOSEST = 'Which answer is closest to what you said?';

export function VerbalPlayer({ item, mode, onSubmit, reveal, hintLevel, speak, parentScoring }: PlayerProps<VerbalPayload, VerbalResponse>) {
  const p = item.payload;
  const [sent, setSent] = useState(false);
  const [step, setStep] = useState<'say' | 'choose'>('say');
  const [saidFirst, setSaidFirst] = useState(false);
  const [transcript, setTranscript] = useState('');
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const question = item.speak ?? spokenText(p.prompt);
  const hear = () => {
    stopSpeaking();
    void speak(question, { force: true });
  };

  // Listening is the task, so the question is read aloud as soon as the item appears (forced).
  // Deferred one tick and preceded by stopSpeaking() so it replaces — rather than doubles — the
  // runner's own narration of the same prompt.
  useEffect(() => {
    if (reveal) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled || !alive.current) return;
      hear();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const say = (text: string) => {
    void speak(spokenText(text), { force: true });
  };
  const readAll = async () => {
    for (let i = 0; i < p.choices.length && alive.current; i++) {
      await speak(`${String.fromCharCode(65 + i)}. ${spokenText(p.choices[i].text)}`, { force: true });
    }
  };

  const submit = (r: VerbalResponse) => {
    if (sent || reveal) return;
    setSent(true);
    onSubmit(r);
  };

  const toChoices = (said: boolean) => {
    setSaidFirst(said);
    setStep('choose');
    stopSpeaking();
    void speak(CLOSEST);
  };

  const parentMode = p.parentScorable && (reveal ? reveal.response?.parentScore !== undefined || (!!parentScoring && !reveal.response?.choice) : !!parentScoring);
  const best = bestChoice(p.choices);
  const testLike = mode === 'test';
  const wordItem = item.subtest === 'VC' && !p.picture;
  const listenLabel = wordItem ? 'Listen to the word' : p.picture ? 'Look and listen' : 'Listen to the question';
  const scaffold = hintLevel >= 1 && p.scaffold && !reveal ? <Scaffold text={p.scaffold} /> : null;

  // Parent-scoring mode: unchanged layout (the grown-up needs the question), plus read-aloud.
  if (parentMode) {
    return (
      <div className="stage">
        <div className="prompt" style={{ maxWidth: 640 }}>
          <Emphasize text={p.prompt} />
        </div>
        {p.picture && <Picture emoji={p.picture} label={p.pictureLabel} />}
        {scaffold}
        {reveal ? (
          <div className="stack" style={{ alignItems: 'center', width: '100%' }}>
            {reveal.response?.parentScore !== undefined && (
              <div className="chip" aria-live="polite">Grown-up gave {pointsLabel(reveal.response.parentScore)}</div>
            )}
            <div className="card flat tint" style={{ width: '100%', textAlign: 'left' }}>
              <div className="small muted">A {pointsLabel(best.points)} answer sounds like:</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 700 }}>
                “<Emphasize text={best.text} />”
              </div>
            </div>
          </div>
        ) : (
          <>
            <button type="button" className="btn ghost small" aria-label="Hear it again" onClick={hear}>
              🔊 <span className="small">Hear it again</span>
            </button>
            <ParentScoring payload={p} onScore={(pts) => submit({ parentScore: pts })} />
          </>
        )}
      </div>
    );
  }

  // The question: printed in practice/tutor (reading support), heard only in test mode.
  const header = testLike ? (
    <ListenCard label={listenLabel} onHear={hear} />
  ) : reveal ? (
    <div className="prompt" style={{ maxWidth: 640 }}>
      <Emphasize text={p.prompt} />
    </div>
  ) : (
    <ListenCard label={listenLabel} text={p.prompt} onHear={hear} />
  );

  if (reveal) {
    return (
      <div className="stage">
        {header}
        {p.picture && <Picture emoji={p.picture} label={p.pictureLabel} />}
        {reveal.response?.transcript && <SaidChip text={reveal.response.transcript} />}
        <RevealList choices={p.choices} chosen={reveal.response?.choice} />
      </div>
    );
  }

  return (
    <div className="stage">
      {header}
      {p.picture && <Picture emoji={p.picture} label={p.pictureLabel} />}
      {scaffold}

      {step === 'say' ? (
        <div className="stack" style={{ alignItems: 'center', width: '100%' }}>
          <PipSays mood="think">Say your answer out loud — in your own words!</PipSays>
          <MicButton onTranscript={setTranscript} />
          {transcript && <SaidChip text={transcript} />}
          <button type="button" className="btn big go" onClick={() => toChoices(true)}>
            I said my answer ✓
          </button>
          {!testLike && (
            <button
              type="button"
              className="btn ghost small"
              style={{ border: 'none', boxShadow: 'none', textDecoration: 'underline', background: 'transparent' }}
              onClick={() => toChoices(false)}
            >
              Skip to choices
            </button>
          )}
        </div>
      ) : (
        <>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.3rem', textAlign: 'center' }}>
            {CLOSEST}
          </div>
          {transcript && <SaidChip text={transcript} />}
          <button type="button" className="btn ghost small" onClick={() => void readAll()} aria-label="Read all the answers to me">
            🔊 <span className="small">Read the answers</span>
          </button>
          <div style={{ width: '100%', maxWidth: 760 }}>
            <ChoiceGrid
              minWidth={280}
              disabled={sent}
              options={p.choices.map((c) => ({
                key: c.text,
                ariaLabel: spokenText(c.text),
                content: <ChoiceBody choice={c} right={<SpeakChip text={c.text} onSpeak={say} />} />,
              }))}
              onSelect={(key) => submit({ choice: key, saidFirst, ...(transcript ? { transcript } : {}) })}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default VerbalPlayer;
