/**
 * (PHASE13-b) Spending a block's budget ([D85]): what of an overfilled block actually spawns.
 *
 * - Priority 0 always spawns and is free.
 * - Then priorities 1…5 in order, all of one priority before the next (breadth-first: every post
 *   gets its first soldier before any is reinforced). Within a priority the order is seeded.
 * - A grouped thing needs its group's anchor to have spawned; a lever needs its gate.
 * - Whatever doesn't fit is skipped; cheaper things at the same priority still get a go.
 *
 * Pure and deterministic: same block, budget and seed → same result.
 */
import { BLOCK_TUNING } from '../content/tuning';
import { createRng, nextFloat } from '../sim/core/rng';
import type { BlockDef, BlockItem } from './block';

/** What one thing costs the enemy's budget (priority 0 is free whatever it is). */
export function itemCost(it: BlockItem): number {
  if (it.priority === 0) return 0;
  const t = BLOCK_TUNING.threat;
  switch (it.kind) {
    case 'soldier':
      return t.role[it.role] ?? t.role.rifleman;
    case 'turret':
      return t.turret;
    case 'mine':
      return t.mine;
    case 'cover':
      return t.cover[it.material] ?? 0;
    default:
      return 0;
  }
}

/** Everything in the block at full strength. */
export function blockTotalCost(block: BlockDef): number {
  return block.items.reduce((sum, it) => sum + itemCost(it), 0);
}

export interface SpendResult {
  /** Ids of the things that spawn. */
  spawned: ReadonlySet<string>;
  spent: number;
  /** Budget left over (carried to the next block in a level). */
  left: number;
}

/** `budget` null = everything spawns (the editor with the slider at "all"). */
export function spendBudget(block: BlockDef, budget: number | null, seed = 1): SpendResult {
  const spawned = new Set<string>();
  const byId = new Map(block.items.map((i) => [i.id, i] as const));
  let left = budget ?? Number.POSITIVE_INFINITY;
  let spent = 0;
  const ready = (it: BlockItem): boolean => {
    if (it.group && !it.anchor) {
      const anchor = block.items.find((a) => a.group === it.group && a.anchor);
      if (anchor && !spawned.has(anchor.id)) return false;
    }
    if (it.kind === 'lever') {
      const gate = byId.get(it.target);
      if (gate && !spawned.has(gate.id)) return false;
    }
    return true;
  };

  // Priority 0: always, free.
  for (const it of block.items) if (it.priority === 0) spawned.add(it.id);
  const rng = createRng(seed);
  for (let p = 1; p <= 5; p++) {
    const tier = shuffle(
      block.items.filter((i) => i.priority === p),
      () => nextFloat(rng),
    );
    for (const it of ordered(tier)) {
      if (!ready(it)) continue;
      const cost = itemCost(it);
      if (cost > left) continue;
      left -= cost;
      spent += cost;
      spawned.add(it.id);
    }
  }
  return { spawned, spent, left: budget === null ? 0 : left };
}

/** Stable: anchors and gates first (others depend on them), otherwise the given order. */
function ordered(items: BlockItem[]): BlockItem[] {
  const rank = (i: BlockItem) => (i.anchor || i.kind === 'gate' ? 0 : 1);
  return items
    .map((it, n) => ({ it, n }))
    .sort((a, b) => rank(a.it) - rank(b.it) || a.n - b.n)
    .map((x) => x.it);
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
