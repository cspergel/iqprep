/** Stress every generator across many seeds/difficulties/ages; any throw is a bug. Run: npx vite-node scripts/stress.ts */
import { MODULES } from '../src/subtests/registry';
import type { SubtestId } from '../src/core/types';
const N: Partial<Record<SubtestId, number>> = { VP: 600, BD: 1500 };
let total = 0;
for (const id of Object.keys(MODULES) as SubtestId[]) {
  const mod = MODULES[id];
  const n = N[id] ?? 4000;
  const variants = mod.variants?.map((v) => v.id) ?? [undefined];
  let fails = 0; const examples: string[] = [];
  for (let s = 0; s < n; s++) {
    const req = { difficulty: 3 + (s % 31) / 2, seed: s * 7919 + 13, age: [5, 6.5, 7, 8, 10, 13, 16][s % 7], mode: 'practice' as const,
      variant: ['IST', 'DST', 'RST'].includes(id) ? `book-${s % 50}` : variants[s % variants.length] };
    try { const it = mod.generate(req); mod.score(it, null); } catch (e) { fails++; if (examples.length < 2) examples.push(`${JSON.stringify(req)} → ${(e as Error).message}`); }
  }
  total += fails;
  console.log(`${id.padEnd(4)} ${n} seeds · ${fails} failures${examples.length ? '\n   ' + examples.join('\n   ') : ''}`);
}
console.log('TOTAL FAILURES', total);
