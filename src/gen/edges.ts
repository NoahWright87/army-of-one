/**
 * (PHASE13) Edge matching by tiles ([D101]): no tags. A block's side is its outer row of tiles,
 * read clockwise. Two touching sides match when every tile on each has a tile of the same type
 * on the other within one place (straight across or diagonal). Exact types: grass only meets
 * grass, so every change of ground needs a transition block, which is what keeps zones apart.
 *
 * Cheap: a check is ~90 comparisons. `EdgeMatcher` caches results per pair of edge strings, so
 * filling a world costs a few hundred thousand cache lookups.
 */
import { BLOCK_CELLS, GROUND, isGroundKind } from '../content/ground';
import type { BlockDef, Side } from './block';

export const SIDE_LIST: readonly Side[] = ['n', 'e', 's', 'w'];

/** A side's tiles, read clockwise around the block (corners included). */
export function sideProfile(block: BlockDef, side: Side): string {
  const n = BLOCK_CELLS;
  const g = block.ground;
  let out = '';
  for (let i = 0; i < n; i++) {
    if (side === 'n') out += g[0]![i];
    else if (side === 'e') out += g[i]![n - 1];
    else if (side === 's') out += g[n - 1]![n - 1 - i];
    else out += g[n - 1 - i]![0];
  }
  return out;
}

export function sideProfiles(block: BlockDef): Record<Side, string> {
  return {
    n: sideProfile(block, 'n'),
    e: sideProfile(block, 'e'),
    s: sideProfile(block, 's'),
    w: sideProfile(block, 'w'),
  };
}

export const OPPOSITE: Readonly<Record<Side, Side>> = { n: 's', e: 'w', s: 'n', w: 'e' };

const reverse = (s: string) => [...s].reverse().join('');

/**
 * Do two touching sides match? `mine` and `theirs` are both read clockwise around their own
 * blocks, so they run in opposite directions along the seam: `theirs` is reversed to line up.
 */
export function edgesMatch(mine: string, theirs: string): boolean {
  return fuzzyEqual(mine, reverse(theirs));
}

/** Same direction: every tile on each side has its type within one place on the other. */
export function fuzzyEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    if (b[i] !== x && b[i - 1] !== x && b[i + 1] !== x) return false;
    const y = b[i]!;
    if (a[i] !== y && a[i - 1] !== y && a[i + 1] !== y) return false;
  }
  return true;
}

/** Can you walk across this side? A run of at least two passable tiles. */
export function sidePassable(profile: string): boolean {
  let run = 0;
  for (const ch of profile) {
    run = isGroundKind(ch) && GROUND[ch].passable ? run + 1 : 0;
    if (run >= 2) return true;
  }
  return false;
}

/**
 * (PHASE13) How many blocks (any orientation) could sit against each side of `block` ([D101]):
 * the editor's "N blocks fit". `others` is every other block's sides in every orientation.
 */
export function countFits(
  block: BlockDef,
  others: readonly Record<Side, string>[],
  matcher: EdgeMatcher,
): Record<Side, number> {
  const mine = sideProfiles(block);
  const out = { n: 0, e: 0, s: 0, w: 0 };
  for (const side of SIDE_LIST) {
    const theirSide = OPPOSITE[side];
    for (const o of others) if (matcher.match(mine[side], o[theirSide])) out[side]++;
  }
  return out;
}

/** `edgesMatch`, cached by edge strings (a block library has a few hundred distinct edges). */
export class EdgeMatcher {
  private cache = new Map<string, boolean>();

  match(mine: string, theirs: string): boolean {
    const key = `${mine}|${theirs}`;
    let v = this.cache.get(key);
    if (v === undefined) {
      v = edgesMatch(mine, theirs);
      this.cache.set(key, v);
    }
    return v;
  }
}
