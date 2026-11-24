import type { Vec2 } from '../sim/core/vec';
import type { SpawnPointDef } from '../sim/world/map';

import { roleDef } from '../content/roles';
import { ENTRANCE } from '../content/tuning';
import type { RoleId } from '../contracts/mission';

export interface ArrivalPose {
  pos: Vec2;
  facing: number;
  height: number;
  parachute?: { altitude: number; collapse: number };
  visible: boolean;
  transport?: { kind: 'truck' | 'boat'; pos: Vec2; facing: number; alpha: number };
}

/** Cosmetic only. Every arrival ends at the exact position and facing used by the sim. */
export function arrivalPose(
  sp: SpawnPointDef,
  role: RoleId | undefined,
  progress: number,
): ArrivalPose {
  const f = Math.min(1, Math.max(0, progress));
  const vehicle = roleDef(role).vehicle;
  const ground = { pos: sp.position, facing: sp.facing, height: 0, visible: true };
  if (sp.transport) {
    const { kind, path } = sp.transport;
    const drop = path[path.length - 1]!;
    if (vehicle) {
      if (kind === 'boat') return { ...ground, visible: false };
      const arrival = alongPath([...path, sp.position], f);
      return { ...ground, ...arrival, facing: f === 1 ? sp.facing : arrival.facing };
    }
    const boat = kind === 'boat';
    const length = boat ? ENTRANCE.boatLength : ENTRANCE.truckLength;
    const unload = boat ? ENTRANCE.boatUnloadFraction : ENTRANCE.truckUnloadFraction;
    const approach = alongPath(path, f / unload);
    const step = Math.max(0, (f - unload) / (1 - unload));
    const ramp = {
      x: drop.x + Math.cos(approach.facing) * length * 0.45,
      y: drop.y + Math.sin(approach.facing) * length * 0.45,
    };
    // Keep the ramp in place until the infantry has cleared it.
    const retreat = Math.max(0, (step - 0.25) / 0.75);
    const departure = alongPath(path, 1 - retreat * 0.8);
    return {
      ...ground,
      pos: alongPath([ramp, sp.position], step).pos,
      height: boat ? 0 : Math.sin(step * Math.PI) * ENTRANCE.truckJumpHeight,
      visible: f >= unload,
      transport: {
        kind,
        pos: f < unload ? approach.pos : departure.pos,
        facing: approach.facing + (boat ? 0 : Math.PI),
        alpha: Math.min(1, (1 - step) * 3),
      },
    };
  }
  if (vehicle) return { ...ground, visible: false };
  const touchdown = ENTRANCE.parachuteTouchdownFraction;
  const collapse = Math.max(0, (f - touchdown) / (1 - touchdown));
  return {
    ...ground,
    visible: collapse >= 0.5,
    parachute: {
      altitude: Math.max(0, 1 - f / touchdown),
      collapse,
    },
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
