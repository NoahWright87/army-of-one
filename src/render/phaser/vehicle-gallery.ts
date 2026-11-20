/** Layered vehicle review: ?scene=gallery&vehicles=1. */
import type { WorldView, SoldierView } from '../../sim/view';
import { borderWalls, type MapDef } from '../../sim/world/map';
export const VEHICLE_GALLERY_MAP: MapDef = {
  id: 'vehicle-gallery',
  nameKey: 'map.gallery.name',
  width: 1100,
  height: 760,
  walls: borderWalls(1100, 760),
  water: [],
  spawnPoints: [],
};
const states = ['live', 'echo', 'enemy', 'wreck'] as const;
export const VEHICLE_CAPTIONS = states.flatMap((state, row) =>
  ['truck', 'tank'].map((role, col) => ({
    x: 280 + col * 540,
    y: 160 + row * 180,
    text: `${role} · ${state} · independent turret`,
  })),
);
export function vehicleGalleryView(tick: number): WorldView {
  const soldiers: SoldierView[] = states.flatMap((state, row) =>
    (['truck', 'tank'] as const).map((roleId, col) => ({
      kind: 'soldier',
      id: `vehicle-${state}-${roleId}`,
      ordinal: row * 2 + col + 1,
      roleId,
      role: state === 'wreck' ? 'echo' : state,
      x: 280 + col * 540,
      y: 110 + row * 180,
      facing: tick * 0.006,
      turret: -tick * 0.02,
      hp: state === 'wreck' ? 0 : 100,
      maxHp: 100,
      alive: state !== 'wreck',
      leadIn: false,
    })),
  );
  return {
    tick,
    soldiers,
    turrets: [],
    mines: [],
    vehicles: [],
    gates: [],
    levers: [],
    bridges: [],
    objectives: [],
    capturePoints: [],
    events: [],
    missionComplete: null,
  };
}
