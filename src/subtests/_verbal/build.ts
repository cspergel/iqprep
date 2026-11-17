/**
 * Small helpers for writing verbal banks compactly.
 *
 * Wrong (0-point) answers are written as "code:text" so the bank doesn't repeat the same reason
 * hundreds of times, e.g. "d:A dog barks and a cat meows" → "That tells how they are DIFFERENT…".
 * A custom reason can be given instead with "text || why".
 */
import type { VerbalChoice } from './types';

export type WhyMap = Record<string, string>;

export const COMMON_ZERO_WHY: WhyMap = {
  d: 'That tells how they are DIFFERENT. The question asks how they are ALIKE.',
  o: "That's only true of one of them, not both.",
  w: "That isn't true.",
  g: "That's true of almost everything — it's too general to count.",
  s: "That's a different word — it only sounds a little like this one.",
  x: "That's the opposite!",
  u: 'That could get someone hurt — not a safe choice.',
  k: "That isn't kind or fair to other people.",
  n: "That wouldn't fix the problem.",
  r: "That isn't the real reason.",
};

/** Parse "code:text", "text || why" or plain text into a 0-point choice. */
export function zero(raw: string, whys: WhyMap, fallback = 'w'): VerbalChoice {
  const custom = raw.split('||');
  if (custom.length === 2) return { text: custom[0].trim(), points: 0, why: custom[1].trim() };
  const m = /^([a-z]):(.*)$/s.exec(raw);
  const code = m ? m[1] : fallback;
  const text = (m ? m[2] : raw).trim();
  const why = whys[code] ?? COMMON_ZERO_WHY[code];
  if (!why) throw new Error(`unknown zero code "${code}" in "${raw}"`);
  return { text, points: 0, why };
}

/** "an APPLE" → "apple"; "a POLICE OFFICER" → "police-officer". */
export function slug(text: string): string {
  const caps = text.match(/\b[A-Z][A-Z'-]+\b/g);
  const base = caps ? caps.join(' ') : text;
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
