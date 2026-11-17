/**
 * Test-wiseness audit for multiple-choice verbal items: how often is the best answer the longest
 * (or shortest) choice? Chance is ~25%; much higher means kids could win by length alone.
 * Run: npx vite-node scripts/cues.ts
 */
import { MODULES } from '../src/subtests/registry';
import type { SubtestId } from '../src/core/types';

for (const id of ['SI', 'VC', 'IN', 'CO'] as SubtestId[]) {
  const mod = MODULES[id];
  const seen = new Set<string>();
  let n = 0;
  let longest = 0;
  let shortest = 0;
  for (let i = 0; i < 4000 && seen.size < 1000; i++) {
    const item = mod.generate({ difficulty: 3.5 + (i % 140) / 10, seed: i * 31 + 7, age: 8, mode: 'practice' });
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    const p = item.payload as { choices?: { text: string; points: number }[]; item?: { choices: { text: string; points: number }[] } };
    const choices = p.choices ?? p.item?.choices;
    if (!choices) continue;
    const best = Math.max(...choices.map((c) => c.points));
    const lens = choices.map((c) => c.text.length);
    const bi = choices.findIndex((c) => c.points === best);
    n++;
    if (lens[bi] === Math.max(...lens)) longest++;
    if (lens[bi] === Math.min(...lens)) shortest++;
  }
  console.log(`${id}: ${n} items · best answer is longest ${Math.round((100 * longest) / n)}% · shortest ${Math.round((100 * shortest) / n)}%`);
}
