/** Developer-only comparison page: ?scene=gallery&infantry=1. */
import { INFANTRY_ROLES } from '../../../content/miniatures';
import { TICKS_PER_SECOND, type Tick } from '../../../sim/core/time';
import { borderWalls, type MapDef } from '../../../sim/world/map';
import type { SoldierView, WorldView } from '../../../sim/view';
import { GALLERY_LIVE_ID, type Caption } from './gallery-fixture';

export const INFANTRY_GALLERY_MAP: MapDef = {
  id: 'infantry-gallery',
  nameKey: 'map.gallery.name',
  width: 1150,
  height: 650,
  water: [],
  walls: borderWalls(1150, 650),
  spawnPoints: [],
};

const STATES = ['live', 'echo', 'enemy', 'fallen'] as const;
const xAt = (column: number) => 95 + column * 160;
const yAt = (row: number) => 125 + row * 135;

export const INFANTRY_CAPTIONS: Caption[] = STATES.flatMap((state, row) =>
  INFANTRY_ROLES.map((role, column) => ({
    x: xAt(column),
    y: yAt(row) + 55,
    text: `${role}: ${state}`,
  })),
);

export function infantryGalleryView(tick: Tick): WorldView {
  const soldiers: SoldierView[] = [];
  const facing = (tick / TICKS_PER_SECOND) * 0.45;
  for (const [row, state] of STATES.entries()) {
    for (const [column, roleId] of INFANTRY_ROLES.entries()) {
      const fallen = state === 'fallen';
      soldiers.push({
        kind: 'soldier',
        id: row === 0 && column === 0 ? GALLERY_LIVE_ID : `infantry-${roleId}-${state}`,
        ordinal: row * 7 + column + 1,
        roleId,
        x: xAt(column),
        y: yAt(row),
        facing,
        hp: fallen ? 0 : 100,
        maxHp: 100,
        alive: !fallen,
        role: fallen ? 'echo' : state,
        leadIn: false,
        ...(fallen ? { deathDirection: Math.PI / 2 } : {}),
      });
    }
  }
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
    grenades: [],
    rockets: [],
    coverDestroyed: [],
    coverArcs: [],
    events: [],
    missionComplete: null,
  };
}
