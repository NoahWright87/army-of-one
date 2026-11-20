import type { Tuning } from '../../content/tuning';
import { POSITION_QUANTUM } from '../../contracts/quantize';
import type { Vec2 } from '../core/vec';
import { depthInRect, trenchAt } from './concealment';
import { moveCircle, rayRect } from './collision';
import { rectContains, type ConcealmentArea, type Rect } from './map';

export interface TrenchClimb {
  axis: 'x' | 'y';
  sign: number;
  start: number;
  edge: number;
  progress: number;
  areaId: string;
}

type Climber = Vec2 & { trenchClimb?: TrenchClimb };

export function moveInConcealment(
  s: Climber,
  direction: Vec2,
  delta: Vec2,
  walk: number,
  solids: readonly Rect[],
  tuning: Tuning,
  areas: readonly ConcealmentArea[],
): Vec2 {
  const radius = tuning.soldier.wallRadius;
  const move = (d: Vec2) => moveCircle(s, d, radius, solids);
  const trench = trenchAt(areas, s);
  let climb = trench && s.trenchClimb?.areaId === trench.id ? s.trenchClimb : undefined;
  if (!climb) delete s.trenchClimb;
  const next = move(delta);
  const { bush, trench: t } = tuning.concealment;
  if (trench && !climb) {
    const r = trench.rect;
    const dx = next.x - s.x;
    const dy = next.y - s.y;
    const x = dx > 0 ? r.x + r.w : r.x;
    const y = dy > 0 ? r.y + r.h : r.y;
    const tx = dx === 0 ? Infinity : (x - s.x) / dx;
    const ty = dy === 0 ? Infinity : (y - s.y) / dy;
    const axis = tx <= ty ? 'x' : 'y';
    const edge = axis === 'x' ? x : y;
    const outward = axis === 'x' ? dx : dy;
    const rim = Math.min(t.rimDepth, (axis === 'x' ? r.w : r.h) / 2);
    if (direction[axis] * outward > 0 && Math.abs(edge - s[axis]) <= rim) {
      climb = {
        areaId: trench.id,
        axis,
        edge,
        sign: Math.sign(outward),
        start: s[axis],
        progress: 0,
      };
      s.trenchClimb = climb;
    }
  }
  if (climb) {
    const { axis, edge, sign, start } = climb;
    const push = direction[axis] * sign;
    const d = { x: 0, y: 0 };
    if (push <= 0) {
      delete s.trenchClimb;
      d[axis] = start - s[axis];
      return move(d);
    }
    // Keep the center in the trench until the full rim effort is paid, even when
    // the soldier starts partway up the rim (e.g. just dropped in at the edge).
    const depth = Math.abs(edge - start) + POSITION_QUANTUM * 2;
    const needed = Math.max(t.rimDepth, depth);
    climb.progress = Math.min(needed, climb.progress + walk * t.climbSpeed * push);
    d[axis] = start + (sign * (depth * climb.progress)) / needed - s[axis];
    const p = move(d);
    if (climb.progress >= needed && (p[axis] - edge) * sign > POSITION_QUANTUM) {
      delete s.trenchClimb;
    } else if ((p[axis] - edge) * sign > 0) {
      return { ...p, [axis]: edge };
    }
    return p;
  }

  const dx = next.x - s.x;
  const dy = next.y - s.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return next;
  const dir = { x: dx / length, y: dy / length };
  let allowed = length;
  for (const { kind, rect } of areas) {
    if (kind !== 'bush') continue;
    if (rectContains(rect, s)) {
      const depth = depthInRect(s, rect);
      if (depth < bush.entryDepth && depthInRect(next, rect) > depth) {
        allowed = Math.min(allowed, length * bush.entrySpeed);
      }
    } else {
      const entry = rayRect(s, dir, rect);
      if (entry !== null && entry < length && rectContains(rect, next)) {
        allowed = Math.min(allowed, entry + (length - entry) * bush.entrySpeed);
      }
    }
  }
  return allowed < length ? move({ x: dir.x * allowed, y: dir.y * allowed }) : next;
}
