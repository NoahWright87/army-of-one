import { isEligible, type SoldierState } from '../entities/soldier';
import type { World } from '../state';

/**
 * (05-b) Uniform spatial hash over a list of points (soldiers), for "who is near here?" queries
 * at army scale. Queries return indices into the original list in ascending order, so callers
 * that iterate the result visit candidates in exactly the order a full scan would (minus the
 * ones that are too far away to matter): results stay bit-identical to the naive loops.
 */
export interface PointGrid {
  /** Ascending indices of points whose cell overlaps the box [x0, x1] × [y0, y1]. */
  query(x0: number, y0: number, x1: number, y1: number): number[];
}

export function buildPointGrid(
  points: readonly { x: number; y: number }[],
  cellSize: number,
  include: (index: number) => boolean = () => true,
): PointGrid {
  const cells = new Map<number, number[]>();
  // Cells are keyed by (col, row) packed into one number; maps are a few thousand units wide.
  const key = (c: number, r: number) => c * 65536 + r;
  for (let i = 0; i < points.length; i++) {
    if (!include(i)) continue;
    const p = points[i]!;
    const k = key(Math.floor(p.x / cellSize), Math.floor(p.y / cellSize));
    const list = cells.get(k);
    if (list) list.push(i);
    else cells.set(k, [i]);
  }
  return {
    query(x0, y0, x1, y1) {
      const c0 = Math.floor(x0 / cellSize);
      const c1 = Math.floor(x1 / cellSize);
      const r0 = Math.floor(y0 / cellSize);
      const r1 = Math.floor(y1 / cellSize);
      const out: number[] = [];
      for (let c = c0; c <= c1; c++) {
        for (let r = r0; r <= r1; r++) {
          const list = cells.get(key(c, r));
          if (list) for (const i of list) out.push(i);
        }
      }
      if (out.length > 1) out.sort((a, b) => a - b);
      return out;
    },
  };
}

/**
 * (05-b) One grid of the soldiers that are eligible (alive, interactive) when it's first asked
 * for in a tick, shared by the post-action phases (mines, traffic contact). Nobody moves between
 * those phases, and eligibility can only be lost (deaths), so callers re-check `isEligible` on
 * the candidates and get exactly the soldiers a full scan would find.
 */
const tickGrids = new WeakMap<readonly SoldierState[], { tick: number; grid: PointGrid }>();

export function postActionGrid(world: World): PointGrid {
  const soldiers = world.state.soldiers;
  const hit = tickGrids.get(soldiers);
  if (hit && hit.tick === world.state.tick) return hit.grid;
  const grid = buildPointGrid(soldiers, 128, (k) => isEligible(soldiers[k]!));
  tickGrids.set(soldiers, { tick: world.state.tick, grid });
  return grid;
}
