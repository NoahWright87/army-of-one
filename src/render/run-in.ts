/**
 * (PHASE13-d) Soldiers running in during the lead-in ([D112]): for show only. A spawn point's
 * `approach` (or, without one, a straight run up to it from behind its facing) and where along it
 * a runner is. Pure.
 */
import type { Vec2 } from '../sim/core/vec';
import type { SpawnPointDef } from '../sim/world/map';

/** The route a soldier runs in along to `sp`, ending at its position. */
export function approachFor(sp: SpawnPointDef, runDistance: number): Vec2[] {
  if (sp.approach && sp.approach.length >= 2) return sp.approach;
  const back = { x: -Math.cos(sp.facing), y: -Math.sin(sp.facing) };
  return [
    { x: sp.position.x + back.x * runDistance, y: sp.position.y + back.y * runDistance },
    sp.position,
  ];
}

/** The point `f` (0…1) of the way along `path`, and the way it's heading there. */
export function alongPath(path: readonly Vec2[], f: number): { pos: Vec2; facing: number } {
  const t = Math.min(1, Math.max(0, f));
  let total = 0;
  for (let i = 1; i < path.length; i++) total += dist(path[i - 1]!, path[i]!);
  let want = total * t;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const d = dist(a, b);
    if (want <= d || i === path.length - 1) {
      const k = d > 0 ? Math.min(1, want / d) : 1;
      return {
        pos: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k },
        facing: Math.atan2(b.y - a.y, b.x - a.x),
      };
    }
    want -= d;
  }
  const p = path[path.length - 1] ?? { x: 0, y: 0 };
  return { pos: { ...p }, facing: 0 };
}

/** The spawn point at `pos` (a live run's camera home), if any. */
export function spawnAt(spawns: readonly SpawnPointDef[], pos: Vec2): SpawnPointDef | undefined {
  return spawns.find(
    (s) => Math.abs(s.position.x - pos.x) < 1 && Math.abs(s.position.y - pos.y) < 1,
  );
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
