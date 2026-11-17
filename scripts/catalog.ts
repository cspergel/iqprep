/**
 * Prints every question type each generator produces, with the difficulty range and share of items.
 * Run: npx vite-node scripts/catalog.ts
 */
import { MODULES } from '../src/subtests/registry';
import { SUBTESTS } from '../src/core/subtestInfo';
import type { SubtestId } from '../src/core/types';

const out: Record<string, { skill: string; n: number; min: number; max: number }[]> = {};
for (const id of Object.keys(MODULES) as SubtestId[]) {
  const mod = MODULES[id];
  if (SUBTESTS[id].kind === 'speeded') continue;
  const variants = mod.variants?.map((v) => v.id) ?? [undefined];
  const m = new Map<string, { skill: string; n: number; min: number; max: number }>();
  let total = 0;
  for (let i = 0; i < 600; i++) {
    const d = 3.5 + ((i * 7) % 140) / 10;
    const variant = ['IST', 'DST', 'RST'].includes(id) ? 'book-3' : variants[i % variants.length];
    const it = mod.generate({ difficulty: d, seed: 500 + i * 97, age: 8, mode: 'practice', variant });
    total++;
    for (const s of it.skills) {
      if (/span-\d+$/.test(s)) continue;
      const e = m.get(s) ?? { skill: s, n: 0, min: 99, max: 0 };
      e.n++;
      e.min = Math.min(e.min, it.difficulty);
      e.max = Math.max(e.max, it.difficulty);
      m.set(s, e);
    }
  }
  out[id] = [...m.values()].sort((a, b) => a.min - b.min).map((e) => ({ ...e, n: Math.round((100 * e.n) / total) }));
}
for (const [id, rows] of Object.entries(out)) {
  console.log(`\n${id} ${SUBTESTS[id as SubtestId].name}`);
  for (const r of rows) console.log(`  ${r.skill.padEnd(22)} ${String(r.n).padStart(3)}%  ${r.min.toFixed(1)}–${r.max.toFixed(1)}`);
}
