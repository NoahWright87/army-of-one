import type { Vec2 } from '../sim/core/vec';
import type { SpawnPointDef } from '../sim/world/map';

import { roleDef } from '../content/roles';
import { ENTRANCE } from '../content/tuning';
import type { RoleId } from '../contracts/mission';

export interface ArrivalPose {
  pos: Vec2;
  facing: number;
  height: number;
  canopy: number;
  visible: boolean;
  transport?: { pos: Vec2; facing: number; alpha: number };
}

/** Cosmetic only. Every arrival ends at the exact position and facing used by the sim. */
export function arrivalPose(
  sp: SpawnPointDef,
  role: RoleId | undefined,
  progress: number,
): ArrivalPose {
  const f = Math.min(1, Math.max(0, progress));
  const vehicle = roleDef(role).vehicle;
  const ground = { pos: sp.position, facing: sp.facing, height: 0, canopy: 0, visible: true };
  if (sp.transport) {
    const path = sp.transport.path;
    const drop = path[path.length - 1]!;
    if (vehicle) {
      const arrival = alongPath([...path, sp.position], f);
      return { ...ground, ...arrival, facing: f === 1 ? sp.facing : arrival.facing };
    }
    const unload = ENTRANCE.truckUnloadFraction;
    const backedIn = alongPath(path, f / unload);
    const step = Math.max(0, (f - unload) / (1 - unload));
    const rear = {
      x: drop.x + Math.cos(backedIn.facing) * ENTRANCE.truckLength * 0.45,
      y: drop.y + Math.sin(backedIn.facing) * ENTRANCE.truckLength * 0.45,
    };
    return {
      ...ground,
      pos: alongPath([rear, sp.position], step).pos,
      height: Math.sin(step * Math.PI) * ENTRANCE.truckJumpHeight,
      visible: f >= unload,
      transport: {
        pos: backedIn.pos,
        facing: backedIn.facing + Math.PI,
        alpha: 1 - step,
      },
    };
  }
  if (vehicle) return { ...ground, visible: false };
  return {
    ...ground,
    height: ENTRANCE.parachuteHeight * (1 - f),
    canopy: Math.min(1, (1 - f) * ENTRANCE.parachuteCollapseRate),
  };
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
