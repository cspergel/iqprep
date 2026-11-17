/**
 * Text-to-speech using the browser's built-in voices (no network, works offline in most browsers).
 * Everything resolves even when speech is unavailable, so games never hang.
 */

let preferredVoice: SpeechSynthesisVoice | null = null;

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
}

function pickVoice(): SpeechSynthesisVoice | null {
  const s = synth();
  if (!s) return null;
  if (preferredVoice) return preferredVoice;
  const voices = s.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
  const ranked = ['Samantha', 'Google US English', 'Microsoft Aria', 'Microsoft Jenny', 'Microsoft Zira', 'Karen', 'Moira'];
  for (const name of ranked) {
    const v = voices.find((x) => x.name.includes(name));
    if (v) return (preferredVoice = v);
  }
  return (preferredVoice = voices.find((v) => v.lang === 'en-US') ?? voices[0] ?? null);
}

if (typeof window !== 'undefined' && synth()) {
  synth()!.onvoiceschanged = () => {
    preferredVoice = null;
    pickVoice();
  };
}

export function speechSupported(): boolean {
  return synth() !== null;
}

export function stopSpeaking(): void {
  synth()?.cancel();
}

export function speakText(text: string, rate = 0.95): Promise<void> {
  const s = synth();
  if (!s || !text.trim()) return Promise.resolve();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = rate;
    u.pitch = 1.05;
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    u.onend = finish;
    u.onerror = finish;
    // Safety net: some browsers never fire onend.
    setTimeout(finish, 1500 + text.length * 120);
    s.speak(u);
  });
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Say a list of tokens at a steady pace — one per `intervalMs` — the way span tasks are read aloud
 * (digits at about one per second). Calls `onToken` as each one starts so the UI can pulse.
 */
export async function speakSequence(
  tokens: string[],
  intervalMs = 1000,
  onToken?: (index: number) => void,
  shouldStop?: () => boolean,
): Promise<void> {
  for (let i = 0; i < tokens.length; i++) {
    if (shouldStop?.()) return;
    onToken?.(i);
    const started = Date.now();
    await speakText(tokens[i], 1);
    const elapsed = Date.now() - started;
    if (elapsed < intervalMs) await wait(intervalMs - elapsed);
  }
}

/** Make the `speak` helper players receive. `readAloud` controls optional narration; `force` is for audio tasks. */
export function makeSpeak(readAloud: boolean) {
  return (text: string, opts?: { rate?: number; force?: boolean }) =>
    readAloud || opts?.force ? speakText(text, opts?.rate) : Promise.resolve();
}

/**
 * iOS/iPadOS Safari only allows speech after a speak() call made inside a user gesture.
 * Call once at startup: the first touch/click anywhere speaks a silent utterance to unlock the voice.
 */
export function installSpeechUnlock(): void {
  const s = synth();
  if (!s || typeof window === 'undefined') return;
  const unlock = () => {
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      s.speak(u);
    } catch {
      /* ignore */
    }
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
}
