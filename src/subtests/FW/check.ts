/**
 * Brute-force logic checker for balance-scale items.
 *
 * A "side" is a list of counts, one per shape type. The shown (balanced) scales only tell the child
 * relationships, not the actual weights, so an answer is legitimately *derivable* only if it balances
 * under EVERY weight assignment that keeps all shown scales level. We check that by enumerating every
 * assignment of integer weights 1..maxW to the shape types.
 */
export type Side = number[];
export interface Scale { left: Side; right: Side }

export function weightOf(side: Side, w: number[]): number {
  return side.reduce((s, n, i) => s + n * w[i], 0);
}

/** All weight vectors in [1..maxW]^k that keep every reference scale balanced. */
export function consistentWeights(k: number, refs: Scale[], maxW = 9): number[][] {
  const out: number[][] = [];
  const w = new Array(k).fill(1);
  const total = maxW ** k;
  for (let n = 0; n < total; n++) {
    let x = n;
    for (let i = 0; i < k; i++) {
      w[i] = (x % maxW) + 1;
      x = Math.floor(x / maxW);
    }
    if (refs.every((r) => weightOf(r.left, w) === weightOf(r.right, w))) out.push(w.slice());
  }
  return out;
}

export function balancesAlways(ws: number[][], a: Side, b: Side): boolean {
  return ws.length > 0 && ws.every((w) => weightOf(a, w) === weightOf(b, w));
}

export function balancesSometimes(ws: number[][], a: Side, b: Side): boolean {
  return ws.some((w) => weightOf(a, w) === weightOf(b, w));
}

export const pieces = (s: Side) => s.reduce((a, b) => a + b, 0);
export const sameSide = (a: Side, b: Side) => a.length === b.length && a.every((x, i) => x === b[i]);
