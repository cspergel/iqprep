/**
 * Shared player for IST / DST / RST: optional teach cards, then a row of symbols and a response.
 *
 * Responses (see engine.ts):
 * - IST/DST multi-symbol items: BUILD the sentence. Under each symbol is a slot; below is a tray of
 *   word tiles (no pictures). Tapping a tile says its word and drops it into the next empty slot (left
 *   to right); pressing and holding a tile only says it; tapping a filled slot takes the word out.
 *   "Done" unlocks when every slot is filled. The symbol waiting for a word is highlighted, like a
 *   finger pointing along the row as the child reads.
 * - IST/DST single-symbol items (youngest): four picture choices.
 * - "Grown-up listens" (IST/DST): the child reads the symbols aloud and a grown-up marks ✓ / ✗ (and
 *   may tap the words that were missed). On when `parentScoring` is set, else a local toggle.
 * - RST: four choices, read aloud automatically one by one (as the examiner reads them), with each
 *   choice highlighted while it is read; 🔊 reads them again.
 */
import { useEffect, useRef, useState } from 'react';
import type { Mode, PlayerProps } from '../../core/types';
import { ChoiceGrid, PipSays } from '../../ui/kit';
import { WORDS } from './dictionary';
import { isAloud, sentenceText, type StPayload, type StResponse, type StTask } from './engine';
import { SymbolGlyph } from './glyphs';
import { grownUpListens, markSeen, setGrownUpListens, unseen } from './memory';

/**
 * Which symbols to teach before the question.
 * - IST always teaches its new symbols, plus any symbol in the sentence the child hasn't met this session.
 * - DST / RST: tutor mode shows a quick "remember these?" review of the item's symbols; practice mode
 *   teaches only symbols never seen this session (so stand-alone play works, but after IST it stays a
 *   real memory test); test mode never teaches.
 */
export function teachListFor(task: StTask, mode: Mode, p: StPayload, notSeen: (w: string[]) => string[] = unseen): string[] {
  const uniq = (ws: string[]) => [...new Set(ws)];
  const order = (ws: string[]) => ws.slice().sort((a, b) => p.known.indexOf(a) - p.known.indexOf(b));
  if (task === 'IST') return order(uniq([...p.teach, ...notSeen(p.symbols)]));
  if (mode === 'tutor') return order(uniq(p.symbols));
  if (mode === 'practice') return order(notSeen(p.symbols));
  return [];
}

/** Pause between read-aloud choices (RST), so they come at a calm, examiner-like pace. */
export const READ_GAP_MS = 300;
/** Delay before RST choices are read, so the question has appeared first. */
export const AUTO_READ_DELAY_MS = 400;
/** Hold a tile this long to hear it without placing it. */
const LONG_PRESS_MS = 450;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const letterOf = (i: number) => String.fromCharCode(65 + i);

function TeachCard({ word, onTap, showStory }: { word: string; onTap: () => void; showStory: boolean }) {
  const w = WORDS[word];
  return (
    <button
      type="button"
      className="card pop-in"
      onClick={onTap}
      aria-label={`Symbol for ${word}. Tap to hear it.`}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer', minWidth: 140, maxWidth: 220, flex: '1 1 140px' }}
    >
      <SymbolGlyph word={word} size={92} title={w.looks} />
      <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', fontWeight: 800 }}>
        {w.emoji && <span aria-hidden style={{ marginRight: 6 }}>{w.emoji}</span>}
        {word}
      </span>
      {showStory && <span className="small muted">{w.story}</span>}
      <span className="small muted" aria-hidden>🔊 tap</span>
    </button>
  );
}

function ListenToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Grown-up listens"
      className="btn ghost small"
      style={on ? { background: 'var(--sun)' } : undefined}
      onClick={() => onChange(!on)}
    >
      👂 Grown-up listens: {on ? 'on' : 'off'}
    </button>
  );
}

const glyphSizeFor = (n: number) => (n === 1 ? 110 : n > 5 ? 54 : 66);

// ---------- tile building (IST / DST) ----------

type SpeakFn = PlayerProps['speak'];

function TileBuilder({ symbols, tiles, speak, onSubmit, reveal }: {
  symbols: string[];
  tiles: string[];
  speak: SpeakFn;
  onSubmit: (r: StResponse) => void;
  reveal?: PlayerProps<StPayload, StResponse>['reveal'];
}) {
  // Each slot holds the index of the tile placed in it (tiles can repeat, e.g. two "the").
  const [slots, setSlots] = useState<(number | null)[]>(() => symbols.map(() => null));
  const [reading, setReading] = useState<number | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (pressTimer.current) clearTimeout(pressTimer.current);
    };
  }, []);

  const used = new Set(slots.filter((s): s is number => s !== null));
  const next = slots.indexOf(null);
  const full = next === -1;
  const built = slots.map((s) => (s === null ? null : tiles[s]));

  const place = (ti: number) => {
    void speak(tiles[ti], { force: true });
    if (used.has(ti) || full) return;
    setSlots((cur) => {
      const k = cur.indexOf(null);
      if (k < 0 || cur.includes(ti)) return cur;
      const c = cur.slice();
      c[k] = ti;
      return c;
    });
  };
  const removeAt = (si: number) => setSlots((cur) => cur.map((s, i) => (i === si ? null : s)));

  const startPress = (word: string) => {
    longPressed.current = false;
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      void speak(word, { force: true });
    }, LONG_PRESS_MS);
  };
  const endPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  const readBuilt = async () => {
    for (let i = 0; i < built.length; i++) {
      if (!alive.current) return;
      const w = built[i];
      if (!w) continue;
      setReading(i);
      await speak(w, { force: true });
    }
    if (alive.current) setReading(null);
  };

  // Reveal: the child's words (green if right, red if not) with the right word under any wrong one.
  const chosen = reveal && typeof reveal.response === 'string' ? reveal.response.split(' ') : null;
  const allRight = !!reveal?.outcome.correct;
  const size = glyphSizeFor(symbols.length);

  return (
    <>
      <div className="row" style={{ justifyContent: 'center', gap: 10, alignItems: 'flex-start' }} aria-label="Symbol sentence">
        {symbols.map((w, i) => {
          const pointing = !reveal && i === next;
          const word = built[i];
          return (
            <div key={i} className="stack" style={{ alignItems: 'center', gap: 6, minWidth: 64 }}>
              <span
                className="card flat"
                data-pointing={pointing || undefined}
                style={{ padding: 6, display: 'grid', placeItems: 'center', background: pointing ? 'var(--sun)' : undefined, transition: 'background 0.15s' }}
              >
                <SymbolGlyph word={w} size={size} />
              </span>
              {reveal ? (
                <>
                  {chosen && (
                    <span
                      className="chip"
                      aria-label={`Slot ${i + 1}: ${chosen[i] ?? 'empty'}`}
                      style={{ background: allRight || chosen[i] === w ? 'var(--good-bg)' : 'var(--bad-bg)', fontSize: '1rem', padding: '6px 10px' }}
                    >
                      {chosen[i] ?? '—'}
                    </span>
                  )}
                  {(!chosen || (!allRight && chosen[i] !== w)) && (
                    <span className="chip" aria-label={`Answer ${i + 1}: ${w}`} style={{ background: 'var(--good-bg)', fontSize: '1rem', padding: '6px 10px' }}>
                      {chosen && <span aria-hidden>✓</span>}
                      {w}
                    </span>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  className="btn ghost"
                  aria-label={word ? `Slot ${i + 1}: ${word}. Tap to take it out.` : `Slot ${i + 1}: empty`}
                  onClick={() => word && removeAt(i)}
                  style={{
                    minWidth: 64,
                    minHeight: 56,
                    padding: '4px 10px',
                    borderStyle: word ? 'solid' : 'dashed',
                    background: reading === i ? 'var(--sun)' : word ? 'var(--card)' : 'transparent',
                    boxShadow: word ? undefined : 'none',
                    fontSize: '1.05rem',
                  }}
                >
                  {word ?? <span aria-hidden className="muted">{pointing ? '?' : ' '}</span>}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {!reveal && (
        <>
          <div className="row" role="group" aria-label="Word tiles" style={{ justifyContent: 'center', gap: 10, maxWidth: 640 }}>
            {tiles.map((w, ti) => {
              const isUsed = used.has(ti);
              return (
                <button
                  key={ti}
                  type="button"
                  className="btn ghost pop-in"
                  aria-label={`Word tile: ${w}`}
                  disabled={isUsed}
                  style={{ minHeight: 56, minWidth: 72, fontSize: '1.2rem', opacity: isUsed ? 0.25 : 1, animationDelay: `${ti * 30}ms`, touchAction: 'manipulation', WebkitUserSelect: 'none', userSelect: 'none' }}
                  onPointerDown={() => startPress(w)}
                  onPointerUp={endPress}
                  onPointerLeave={endPress}
                  onPointerCancel={endPress}
                  onContextMenu={(e) => e.preventDefault()}
                  onClick={() => {
                    endPress();
                    if (longPressed.current) {
                      longPressed.current = false;
                      return;
                    }
                    place(ti);
                  }}
                >
                  {w}
                </button>
              );
            })}
          </div>
          <div className="small muted" style={{ textAlign: 'center' }}>Tap a word for each symbol. Hold a word to hear it.</div>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn ghost small" disabled={used.size === 0} onClick={() => { void readBuilt(); }}>
              🔊 Hear my sentence
            </button>
            <button type="button" className="btn go" disabled={!full} onClick={() => full && onSubmit(built.join(' '))}>
              Done ✓
            </button>
          </div>
        </>
      )}
    </>
  );
}

// ---------- grown-up listens (IST / DST) ----------

function AloudPanel({ symbols, onSubmit }: { symbols: string[]; onSubmit: (r: StResponse) => void }) {
  const [showAnswer, setShowAnswer] = useState(false);
  const [missed, setMissed] = useState<Set<number>>(() => new Set());
  const toggle = (i: number) =>
    setMissed((cur) => {
      const c = new Set(cur);
      if (c.has(i)) c.delete(i);
      else c.add(i);
      return c;
    });
  return (
    <>
      <PipSays mood="happy">Read the symbols out loud, left to right!</PipSays>
      <div className="card tint stack" style={{ alignItems: 'center', gap: 10, width: '100%', maxWidth: 640 }}>
        <div className="small" style={{ fontWeight: 700 }}>Grown-up: did they read every word right?</div>
        {showAnswer ? (
          <>
            <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
              {symbols.map((w, i) => (
                <button
                  key={i}
                  type="button"
                  className="btn ghost small"
                  aria-pressed={missed.has(i)}
                  aria-label={`Word ${i + 1}: ${w}, ${missed.has(i) ? 'missed' : 'right'}. Tap to change.`}
                  style={{ background: missed.has(i) ? 'var(--bad-bg)' : 'var(--good-bg)' }}
                  onClick={() => toggle(i)}
                >
                  {missed.has(i) ? '✗' : '✓'} {w}
                </button>
              ))}
            </div>
            <div className="small muted">Tap any word they missed or skipped.</div>
          </>
        ) : (
          <button type="button" className="btn ghost small" onClick={() => setShowAnswer(true)}>👀 Show the answer (grown-up)</button>
        )}
        <div className="row" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn go" aria-label="Read it right" disabled={missed.size > 0} onClick={() => onSubmit({ aloud: true, wordsWrong: 0 })}>
            ✓ Right
          </button>
          <button type="button" className="btn primary" aria-label="Not quite" onClick={() => onSubmit({ aloud: true, wordsWrong: Math.max(1, missed.size) })}>
            ✗ Not quite
          </button>
        </div>
      </div>
    </>
  );
}

// ---------- the player ----------

type Phase = 'teach' | 'question';

export function SymbolPlayer({ task, item, mode, onSubmit, reveal, hintLevel, speak, parentScoring }: PlayerProps<StPayload, StResponse> & { task: StTask }) {
  const p = item.payload;
  const tiles = p.tiles ?? [];
  const [cards] = useState(() => (reveal ? [] : teachListFor(task, mode, p)));
  const [phase, setPhase] = useState<Phase>(cards.length > 0 ? 'teach' : 'question');
  const [choice, setChoice] = useState<string | null>(null);
  const [peeked, setPeeked] = useState(0);
  const [peekOpen, setPeekOpen] = useState(false);
  const [listenLocal, setListenLocal] = useState(() => grownUpListens());
  const [reading, setReading] = useState<number | null>(null);
  const cancelled = useRef(false);
  const readToken = useRef(0);

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
      readToken.current++;
    };
  }, []);

  const canListen = task !== 'RST';
  const aloud = canListen && (!!parentScoring || listenLocal);
  const setListen = (on: boolean) => {
    setGrownUpListens(on);
    setListenLocal(on);
  };

  const finishTeaching = () => {
    markSeen(cards);
    setPhase('question');
  };

  /** Read the choices one at a time, highlighting each while it is read. A new call stops an older one. */
  const readChoices = async () => {
    const token = ++readToken.current;
    const live = () => !cancelled.current && token === readToken.current;
    for (let i = 0; i < p.options.length; i++) {
      if (!live()) return;
      setReading(i);
      await speak(`${letterOf(i)}. ${sentenceText(p.options[i].words)}`, { force: true, rate: 0.85 });
      if (!live()) return;
      if (task === 'RST' && i < p.options.length - 1) await wait(READ_GAP_MS);
    }
    if (live()) setReading(null);
  };

  // RST: the examiner reads the choices aloud, so read them as soon as the question appears.
  const autoRead = task === 'RST' && phase === 'question' && !reveal;
  useEffect(() => {
    if (!autoRead) return;
    const t = setTimeout(() => { void readChoices(); }, AUTO_READ_DELAY_MS);
    return () => {
      clearTimeout(t);
      readToken.current++;
    };
  }, [autoRead]);

  const single = p.symbols.length === 1;
  const canPeek = mode === 'tutor' && hintLevel >= 1 && peeked < 1 && !reveal;
  const reviewing = task !== 'IST';

  if (phase === 'teach') {
    return (
      <div className="stage">
        <div className="prompt">{reviewing ? 'Remember these?' : cards.length === 1 ? 'A new symbol!' : 'New symbols!'}</div>
        <PipSays mood="happy">Tap each symbol to hear its word. Make a little picture-story to remember it!</PipSays>
        <div className="row" style={{ justifyContent: 'center', alignItems: 'stretch', width: '100%' }}>
          {cards.map((w) => (
            <TeachCard key={w} word={w} showStory={mode !== 'test'} onTap={() => { void speak(w, { force: true }); }} />
          ))}
        </div>
        <button type="button" className="btn primary big" onClick={finishTeaching}>Got it! →</button>
        {canListen && !parentScoring && <ListenToggle on={listenLocal} onChange={setListen} />}
      </div>
    );
  }

  // What to show: a grown-up's mark, a tile sentence, or choices. In a reveal, follow the response.
  const revealAloud = !!reveal && isAloud(reveal.response);
  const showAloud = reveal ? revealAloud : aloud;
  const showTiles = !showAloud && tiles.length > 0;
  const showChoices = !showAloud && !showTiles;

  const symbolRow = (
    <div className="row" style={{ justifyContent: 'center', gap: 10 }} aria-label="Symbol sentence">
      {p.symbols.map((w, i) => (
        <div key={i} className="stack" style={{ alignItems: 'center', gap: 4 }}>
          <span className="card flat" style={{ padding: 6, display: 'grid', placeItems: 'center' }}>
            <SymbolGlyph word={w} size={glyphSizeFor(p.symbols.length)} />
          </span>
          {reveal && <span className="chip" style={{ background: 'var(--good-bg)' }}>{w}</span>}
        </div>
      ))}
    </div>
  );

  const prompt = showAloud
    ? 'Read it out loud!'
    : showTiles
      ? 'What does it say? Tap a word for each symbol.'
      : single ? 'What word is this?' : 'What does it say?';

  return (
    <div className="stage">
      <div className="prompt">{prompt}</div>

      {showTiles ? (
        <TileBuilder key={item.id} symbols={p.symbols} tiles={tiles} speak={speak} onSubmit={onSubmit} reveal={reveal} />
      ) : (
        symbolRow
      )}

      {peekOpen && (
        <div className="hint stack" style={{ alignItems: 'center', width: '100%' }}>
          <div className="small">Here’s your code book for these symbols:</div>
          <div className="row" style={{ justifyContent: 'center' }}>
            {[...new Set(p.symbols)].map((w) => (
              <span key={w} className="chip" style={{ padding: '4px 10px' }}>
                <SymbolGlyph word={w} size={30} /> {w}
              </span>
            ))}
          </div>
          <button type="button" className="btn ghost small" onClick={() => setPeekOpen(false)}>Hide</button>
        </div>
      )}

      {showAloud && !reveal && <AloudPanel key={item.id} symbols={p.symbols} onSubmit={onSubmit} />}

      {showChoices && (
        <ChoiceGrid
          letters
          minWidth={p.pictures ? 110 : 220}
          options={p.options.map((o, i) => ({
            key: o.key,
            ariaLabel: sentenceText(o.words),
            content: (
              <span
                data-reading={reading === i || undefined}
                style={{
                  borderRadius: 12,
                  padding: '2px 8px',
                  background: reading === i ? 'var(--sun)' : undefined,
                  boxShadow: reading === i ? '0 0 0 4px var(--sun)' : undefined,
                  transition: 'background 0.15s, box-shadow 0.15s',
                }}
              >
                {p.pictures ? (
                  <span className="stack" style={{ alignItems: 'center', gap: 2 }}>
                    <span aria-hidden style={{ fontSize: 40, lineHeight: 1 }}>{WORDS[o.words[0]]?.emoji}</span>
                    <span>{o.words[0]}</span>
                  </span>
                ) : (
                  <span style={{ fontSize: single ? '1.4rem' : '1.1rem', fontWeight: 700 }}>{sentenceText(o.words)}</span>
                )}
              </span>
            ),
          }))}
          selected={choice ? [choice] : []}
          onSelect={setChoice}
          reveal={reveal ? { correctKeys: [p.answer], chosenKeys: typeof reveal.response === 'string' ? [reveal.response] : [] } : undefined}
        />
      )}

      {!reveal && (
        <div className="row" style={{ justifyContent: 'center' }}>
          {showChoices && (
            <button type="button" className="btn ghost small" onClick={() => { void readChoices(); }}>🔊 Read the choices</button>
          )}
          {canPeek && (
            <button type="button" className="btn ghost small" onClick={() => { setPeeked(1); setPeekOpen(true); }}>
              📖 Peek at the code book
            </button>
          )}
          {showChoices && (
            <button type="button" className="btn go" disabled={!choice} onClick={() => choice && onSubmit(choice)}>
              Done ✓
            </button>
          )}
          {canListen && !parentScoring && <ListenToggle on={listenLocal} onChange={setListen} />}
        </div>
      )}
    </div>
  );
}
