/**
 * Integrity checks for verbal banks, used by each subtest's tests. Returns a list of problems
 * (empty = OK) so a failing test shows exactly which item is broken.
 */
import type { VerbalBankItem } from './types';

export interface BankCheckOptions {
  prefix: string;
  /** 2 for SI/VC/CO (one 2-point, others 1 or 0), 1 for IN (one correct, others 0). */
  maxPoints: 1 | 2;
  /** Allowed skill tags. */
  skills: string[];
  /** Require at least one 1-point choice in every item (SI/VC/CO). */
  requirePartial?: boolean;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function bankProblems(bank: readonly VerbalBankItem[], o: BankCheckOptions): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  const prompts = new Set<string>();
  for (const b of bank) {
    const at = b.id;
    if (ids.has(b.id)) out.push(`${at}: duplicate id`);
    ids.add(b.id);
    if (prompts.has(norm(b.prompt) + (b.picture ?? ''))) out.push(`${at}: duplicate prompt`);
    prompts.add(norm(b.prompt) + (b.picture ?? ''));
    if (!b.id.startsWith(`${o.prefix}:`)) out.push(`${at}: id must start with ${o.prefix}:`);
    if (!(b.difficulty >= 4 && b.difficulty <= 17)) out.push(`${at}: difficulty ${b.difficulty} out of range`);
    if (!o.skills.includes(b.skill)) out.push(`${at}: unknown skill ${b.skill}`);
    if (!b.prompt.trim()) out.push(`${at}: empty prompt`);
    if (b.explanation.trim().length < 15) out.push(`${at}: explanation too short`);
    if (b.choices.length !== 4) out.push(`${at}: expected 4 choices, got ${b.choices.length}`);
    const texts = b.choices.map((c) => norm(c.text));
    if (new Set(texts).size !== texts.length) out.push(`${at}: duplicate choice text`);
    const top = b.choices.filter((c) => c.points === o.maxPoints);
    if (top.length !== 1) out.push(`${at}: expected exactly one ${o.maxPoints}-point choice, got ${top.length}`);
    if (b.choices.some((c) => c.points > o.maxPoints)) out.push(`${at}: choice worth more than max`);
    if (o.maxPoints === 1 && b.choices.some((c) => c.points !== 0 && c.points !== 1)) out.push(`${at}: IN choices must be 0/1`);
    if (o.requirePartial && !b.choices.some((c) => c.points === 1)) out.push(`${at}: no 1-point choice`);
    if (b.choices.filter((c) => c.points === 0).length < 2) out.push(`${at}: needs at least two 0-point choices`);
    for (const c of b.choices) {
      if (!c.text.trim()) out.push(`${at}: empty choice`);
      if (!c.why.trim()) out.push(`${at}: choice "${c.text}" has no why`);
    }
    if (o.maxPoints === 2) {
      if (!b.rubric.two.length || !b.rubric.one.length || !b.rubric.zero.length) out.push(`${at}: rubric needs 2/1/0 examples`);
      const best = top[0];
      if (best && !b.rubric.two.includes(best.text)) out.push(`${at}: rubric.two should include the 2-point choice`);
    }
  }
  return out;
}

/** Count items with difficulty in [lo, hi]. */
export function countBetween(bank: readonly VerbalBankItem[], lo: number, hi: number): number {
  return bank.filter((b) => b.difficulty >= lo && b.difficulty <= hi).length;
}
