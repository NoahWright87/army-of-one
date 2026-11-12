import type { Tuning } from '../../content/tuning';
import { driveOf, isEligible, wallRadiusOf, type SoldierState } from '../entities/soldier';
import { moveCircle } from './collision';
import type { Rect } from './map';
import { simPerf } from '../perf';
import { buildPointGrid } from './soldier-grid';

/** Below this many soldiers the plain pair scan is cheaper than building a grid. */
const GRID_MIN = 24;

/**
 * Soft soldier-vs-soldier separation ([D14]). Soldiers closer than two blocker radii are pushed
 * apart by a fraction of the overlap, capped per tick, so a crowd behaves like liquid: you can
 * always squirm through, nobody is ever hard-stopped. Kinematic soldiers ([E8]) push but are never
 * pushed. Pairs are resolved in id order (the soldiers array is id-sorted); pushes are accumulated
 * and applied at the end, then slid against `solids` so nobody is shoved into a wall.
 */
export function separateSoldiers(
  soldiers: SoldierState[],
  solids: readonly Rect[],
  tuning: Tuning,
): void {
  const { blockerRadius } = tuning.soldier;
  const { stiffness, maxPushPerTick } = tuning.separation;
  const active = soldiers.filter(isEligible);
  // (PHASE12-b) Vehicles have big bodies and push soldiers without being pushed by them.
  const radius = active.map((s) => driveOf(tuning, s.roleId)?.bodyRadius ?? blockerRadius);
  const heavy = active.map((s) => !!s.drive);
  const maxR = radius.reduce((m, r) => Math.max(m, r), blockerRadius);
  const minD = maxR * 2;
  const px = new Float64Array(active.length);
  const py = new Float64Array(active.length);
  let any = false;

  // (05-b) Pair candidates from a spatial hash for big crowds. Per soldier, pushes still
  // accumulate in ascending partner order (all i < k during earlier outer iterations, then
  // j > k ascending), exactly as in the full O(n²) scan, so the result is bit-identical.
  const grid =
    simPerf.soldierGrid && active.length > GRID_MIN ? buildPointGrid(active, minD * 2) : null;
  const pair = (i: number, j: number) => {
    const a = active[i]!;
    const b = active[j]!;
    // (PHASE12-b) A vehicle against a soldier acts kinematic; two vehicles push each other.
    const aKin = a.kinematic || (heavy[i]! && !heavy[j]!);
    const bKin = b.kinematic || (heavy[j]! && !heavy[i]!);
    if (aKin && bKin) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d2 = dx * dx + dy * dy;
    const pairD = radius[i]! + radius[j]!;
    if (d2 >= pairD * pairD) return;
    const d = Math.sqrt(d2);
    // Exactly coincident: push along a direction derived from the pair's order (deterministic).
    const nx = d > 1e-9 ? dx / d : Math.cos(j * 2.399963);
    const ny = d > 1e-9 ? dy / d : Math.sin(j * 2.399963);
    const push = (pairD - d) * stiffness * (heavy[i]! || heavy[j]! ? 2 : 1);
    if (aKin) {
      px[j] = px[j]! + nx * push;
      py[j] = py[j]! + ny * push;
    } else if (bKin) {
      px[i] = px[i]! - nx * push;
      py[i] = py[i]! - ny * push;
    } else {
      px[i] = px[i]! - nx * push * 0.5;
      py[i] = py[i]! - ny * push * 0.5;
      px[j] = px[j]! + nx * push * 0.5;
      py[j] = py[j]! + ny * push * 0.5;
    }
    any = true;
  };

  for (let i = 0; i < active.length; i++) {
    if (grid) {
      const a = active[i]!;
      for (const j of grid.query(a.x - minD, a.y - minD, a.x + minD, a.y + minD)) {
        if (j > i) pair(i, j);
      }
    } else {
      for (let j = i + 1; j < active.length; j++) pair(i, j);
    }
  }
  if (!any) return;

  for (let i = 0; i < active.length; i++) {
    let dx = px[i]!;
    let dy = py[i]!;
    if (dx === 0 && dy === 0) continue;
    const len = Math.hypot(dx, dy);
    if (len > maxPushPerTick) {
      dx = (dx / len) * maxPushPerTick;
      dy = (dy / len) * maxPushPerTick;
    }
    const s = active[i]!;
    const next = moveCircle(s, { x: dx, y: dy }, wallRadiusOf(tuning, s), solids);
    s.x = next.x;
    s.y = next.y;
  }
}
