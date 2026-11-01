import { DEFAULT_TUNING, withTuning, type DeepPartial, type Tuning } from '../../content/tuning';
import type { Vec2 } from '../core/vec';
import type { SoldierInput } from '../entities/soldier';
import type { SimEvent } from '../events';
import { createWorld, spawnSoldier, step, type SpawnOptions, type World } from '../sim';
import { borderWalls, type MapDef } from '../world/map';

/** A 1000×1000 walled arena with one spawn point; pass entities/walls to add. */
export function arena(extra: Partial<MapDef> = {}): MapDef {
  return {
    id: 'arena',
    nameKey: 'map.arena',
    width: 1000,
    height: 1000,
    spawnPoints: [
      { id: 'a', nameKey: 'spawn.a', position: { x: 100, y: 500 }, facing: 0, kind: 'initial' },
    ],
    ...extra,
    walls: [...borderWalls(1000, 1000), ...(extra.walls ?? [])],
    water: extra.water ?? [],
  };
}

export function world(map: MapDef, tuning: DeepPartial<Tuning> = {}): World {
  return createWorld(map, withTuning(DEFAULT_TUNING, tuning));
}

export function soldierAt(w: World, position: Vec2, opts: SpawnOptions = {}): string {
  return spawnSoldier(w, w.map.spawnPoints[0]!.id, { position, ...opts });
}

export const idle = (aim = 0): SoldierInput => ({
  move: { x: 0, y: 0 },
  aim,
  fire: false,
  interact: false,
});

export const walk = (x: number, y: number, aim = 0): SoldierInput => ({
  move: { x, y },
  aim,
  fire: false,
  interact: false,
});

/** Steps `n` ticks with fixed inputs; returns all events. */
export function run(w: World, n: number, inputs: Record<string, SoldierInput> = {}): SimEvent[] {
  const out: SimEvent[] = [];
  const m = new Map(Object.entries(inputs));
  for (let i = 0; i < n; i++) out.push(...step(w, m));
  return out;
}

export const ofKind = <K extends SimEvent['kind']>(events: SimEvent[], kind: K) =>
  events.filter((e): e is Extract<SimEvent, { kind: K }> => e.kind === kind);
