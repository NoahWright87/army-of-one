/**
 * (PHASE13-b) Spending a block's budget ([D85]): what of an overfilled block actually spawns.
 *
 * - Priority 0 always spawns and is free.
 * - Then priorities 1…5 in order, all of one priority before the next (breadth-first: every post
 *   gets its first soldier before any is reinforced). Within a priority the order is seeded.
 * - Squad units ([Q54]) are bought like everything else; a lever needs its gate.
 * - Whatever doesn't fit is skipped; cheaper things at the same priority still get a go. So a
 *   tank at priority 1 with riflemen at 2: low budgets buy the riflemen, more buys the tank,
 *   lots buys both.
 *
 * Pure and deterministic: same block, budget and seed → same result.
 */
import { BLOCK_TUNING } from '../content/tuning';
import type { RoleId } from '../contracts/mission';
import { createRng, nextFloat } from '../sim/core/rng';
import { unitId, type BlockDef, type BlockItem, type GroupUnit, type Priority } from './block';

/** What one thing costs the enemy's budget (priority 0 is free whatever it is). */
export function itemCost(it: BlockItem): number {
  if (it.priority === 0) return 0;
  const t = BLOCK_TUNING.threat;
  switch (it.kind) {
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

/** What a squad unit costs ([D86]: nothing is free for the enemy). */
export function unitCost(u: GroupUnit): number {
  if (u.priority === 0) return 0;
  const roles: Record<RoleId, number> = BLOCK_TUNING.threat.role;
  return roles[u.role] ?? roles.rifleman;
}

/** Everything in the block at full strength. */
export function blockTotalCost(block: BlockDef): number {
  return (
    block.items.reduce((sum, it) => sum + itemCost(it), 0) +
    block.groups.reduce((sum, g) => sum + g.units.reduce((n, u) => n + unitCost(u), 0), 0)
  );
}

export interface SpendResult {
  /** Ids of the items, and squad units (`unitId`), that spawn. */
  spawned: ReadonlySet<string>;
  spent: number;
  /** Budget left over (carried to the next block in a level). */
  left: number;
}

interface Buyable {
  id: string;
  priority: Priority;
  cost: number;
  /** Gates first: levers depend on them. */
  first: boolean;
  needs?: string;
}

/** `budget` null = everything spawns (the editor with the slider at "all"). */
export function spendBudget(block: BlockDef, budget: number | null, seed = 1): SpendResult {
  const all: Buyable[] = [
    ...block.items.map((it) => ({
      id: it.id,
      priority: it.priority,
      cost: itemCost(it),
      first: it.kind === 'gate',
      ...(it.kind === 'lever' ? { needs: it.target } : {}),
    })),
    ...block.groups.flatMap((g) =>
      g.units.map((u, i) => ({
        id: unitId(g.id, i),
        priority: u.priority,
        cost: unitCost(u),
        first: false,
      })),
    ),
  ];
  const known = new Set(all.map((b) => b.id));
  const spawned = new Set<string>();
  let left = budget ?? Number.POSITIVE_INFINITY;
  let spent = 0;
  // Priority 0: always, free.
  for (const b of all) if (b.priority === 0) spawned.add(b.id);
  const rng = createRng(seed);
  const buy = (b: Buyable) => {
    left -= b.cost;
    spent += b.cost;
    spawned.add(b.id);
  };
  // A lever bought before its gate waits for it, then gets its turn.
  let waiting: Buyable[] = [];
  for (let p = 1; p <= 5; p++) {
    const tier = shuffle(
      all.filter((b) => b.priority === p),
      () => nextFloat(rng),
    );
    for (const b of ordered(tier)) {
      if (b.needs && known.has(b.needs) && !spawned.has(b.needs)) {
        waiting.push(b);
        continue;
      }
      if (b.cost <= left) buy(b);
    }
    waiting = waiting.filter((b) => {
      if (!spawned.has(b.needs!)) return true;
      if (b.cost <= left) buy(b);
      return false;
    });
  }
  return { spawned, spent, left: budget === null ? 0 : left };
}

/** Stable: gates first (levers depend on them), otherwise the given order. */
function ordered(items: Buyable[]): Buyable[] {
  return items
    .map((it, n) => ({ it, n }))
    .sort((a, b) => Number(b.it.first) - Number(a.it.first) || a.n - b.n)
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
