/**
 * Which symbols the child has been taught during this browser session.
 *
 * Items are generated independently, so an Immediate Symbol Translation item at a high level may use
 * symbols an earlier (skipped) item would have taught. Players use this record to add short
 * "catch-up" teach cards for symbols the child has not met yet, and DST/RST practice mode uses it to
 * teach only what is new (keeping the delayed test honest after IST). A glyph always means the same
 * word in every code book, so the record is simply a set of words.
 *
 * Stored in memory and mirrored to sessionStorage (best effort; works without it).
 */
const KEY = 'braincamp.symbols.seen';
let seen: Set<string> | null = null;

function load(): Set<string> {
  if (seen) return seen;
  seen = new Set();
  try {
    const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(KEY) : null;
    if (raw) for (const w of JSON.parse(raw) as string[]) seen.add(w);
  } catch {
    /* storage unavailable — memory only */
  }
  return seen;
}

export function markSeen(words: string[]): void {
  const s = load();
  words.forEach((w) => s.add(w));
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(KEY, JSON.stringify([...s]));
  } catch {
    /* ignore */
  }
}

export function unseen(words: string[]): string[] {
  const s = load();
  return [...new Set(words)].filter((w) => !s.has(w));
}

export function resetSeen(): void {
  seen = new Set();
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/**
 * "Grown-up listens" (Symbol Stories): the child reads the symbols aloud and a grown-up marks it,
 * instead of building the sentence from word tiles. A per-device preference (localStorage, best effort).
 */
const LISTEN_KEY = 'braincamp.symbols.grownupListens';
let listens: boolean | null = null;

export function grownUpListens(): boolean {
  if (listens !== null) return listens;
  listens = false;
  try {
    if (typeof localStorage !== 'undefined') listens = localStorage.getItem(LISTEN_KEY) === '1';
  } catch {
    /* storage unavailable */
  }
  return listens;
}

export function setGrownUpListens(on: boolean): void {
  listens = on;
  try {
    if (typeof localStorage !== 'undefined') {
      if (on) localStorage.setItem(LISTEN_KEY, '1');
      else localStorage.removeItem(LISTEN_KEY);
    }
  } catch {
    /* ignore */
  }
}
