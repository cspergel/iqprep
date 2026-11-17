/** How often does total area alone identify the Visual Puzzles answer? Shape = list of quarter-triangle cells. */
import { MODULES } from '../src/subtests/registry';
type P = { target: unknown[]; pieces: unknown[][]; answer: number[] };
const bands: Record<string, { n: number; unique: number }> = {};
for (let i = 0; i < 600; i++) {
  const d = 4 + (i % 12);
  const it = MODULES.VP.generate({ difficulty: d, seed: i * 7 + 1, age: 8, mode: 'practice' });
  const p = it.payload as unknown as P;
  const area = p.target.length;
  let combos = 0;
  for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) for (let c = b + 1; c < 6; c++)
    if (p.pieces[a].length + p.pieces[b].length + p.pieces[c].length === area) combos++;
  const key = d < 7 ? '4-6' : d < 10 ? '7-9' : d < 13 ? '10-12' : '13-15';
  bands[key] ??= { n: 0, unique: 0 };
  bands[key].n++;
  if (combos === 1) bands[key].unique++;
}
for (const [k, v] of Object.entries(bands)) console.log(`VP difficulty ${k}: area alone gives the answer in ${Math.round((100 * v.unique) / v.n)}% of items`);
