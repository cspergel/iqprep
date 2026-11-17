/** Answer-position and value cues in choice-based games. Run: npx vite-node scripts/positions.ts */
import { MODULES } from '../src/subtests/registry';
import { weightOf } from '../src/subtests/FW/check';
const pct = (xs: number[]) => { const t = xs.reduce((a, b) => a + b, 0); return xs.map((x) => Math.round((100 * x) / t) + '%').join(' '); };
{
  const rank = [0, 0, 0, 0, 0];
  for (let i = 0; i < 1500; i++) {
    const it = MODULES.FW.generate({ difficulty: 4 + (i % 13), seed: i * 13 + 1, age: 8, mode: 'practice' });
    const p = it.payload as { answer: number; options: number[][]; weights: number[] };
    const t = p.options.map((o) => weightOf(o, p.weights));
    const sorted = [...t].sort((a, b) => a - b);
    rank[sorted.indexOf(t[p.answer])] += 1;
  }
  console.log(`FW: answer's weight rank among options (lightest→heaviest) ${pct(rank)}`);
}
{
  const pos = [0, 0, 0, 0];
  for (let i = 0; i < 1000; i++) {
    const it = MODULES.PC.generate({ difficulty: 5 + (i % 11), seed: i * 17 + 3, age: 8, mode: 'practice' });
    const p = it.payload as { answer: string[]; rows: string[][] };
    p.answer.forEach((a, r) => { const k = p.rows[r].indexOf(a); if (k >= 0 && k < 4) pos[k] += 1; });
  }
  console.log(`PC: answer position within rows ${pct(pos)}`);
}
for (const id of ['IST', 'RST'] as const) {
  const pos = [0, 0, 0, 0];
  for (let i = 0; i < 800; i++) {
    const it = MODULES[id].generate({ difficulty: 5 + (i % 11), seed: i * 17 + 3, age: 8, mode: 'practice', variant: 'book-' + (i % 5) });
    const p = it.payload as { answer: string; options: { words: string[] }[] };
    const k = p.options.findIndex((o) => o.words.join(' ') === p.answer);
    if (k >= 0) pos[k] += 1;
  }
  console.log(`${id}: answer position ${pct(pos)}`);
}
