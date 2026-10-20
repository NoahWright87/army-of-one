import type { Tuning } from '../../content/tuning';
import { isEligible, type SoldierState } from '../entities/soldier';
import { moveCircle } from './collision';
import type { Rect } from './map';

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
  const { blockerRadius, wallRadius } = tuning.soldier;
  const { stiffness, maxPushPerTick } = tuning.separation;
  const minD = blockerRadius * 2;
  const active = soldiers.filter(isEligible);
  const px = new Float64Array(active.length);
  const py = new Float64Array(active.length);
  let any = false;

  for (let i = 0; i < active.length; i++) {
    const a = active[i]!;
    for (let j = i + 1; j < active.length; j++) {
      const b = active[j]!;
      if (a.kinematic && b.kinematic) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minD * minD) continue;
      const d = Math.sqrt(d2);
      // Exactly coincident: push along a direction derived from the pair's order (deterministic).
      const nx = d > 1e-9 ? dx / d : Math.cos(j * 2.399963);
      const ny = d > 1e-9 ? dy / d : Math.sin(j * 2.399963);
      const push = (minD - d) * stiffness;
      if (a.kinematic) {
        px[j] = px[j]! + nx * push;
        py[j] = py[j]! + ny * push;
      } else if (b.kinematic) {
        px[i] = px[i]! - nx * push;
        py[i] = py[i]! - ny * push;
      } else {
        px[i] = px[i]! - nx * push * 0.5;
        py[i] = py[i]! - ny * push * 0.5;
        px[j] = px[j]! + nx * push * 0.5;
        py[j] = py[j]! + ny * push * 0.5;
      }
      any = true;
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
    const next = moveCircle(s, { x: dx, y: dy }, wallRadius, solids);
    s.x = next.x;
    s.y = next.y;
  }
}
