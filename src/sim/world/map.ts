import type { Vec2 } from '../core/vec';

/** Axis-aligned rectangle; (x, y) is the top-left corner. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SpawnPointId = string;

export interface SpawnPointDef {
  id: SpawnPointId;
  /** Key into src/content/strings.ts for the display name. */
  nameKey: string;
  position: Vec2;
  /** Initial facing in radians. */
  facing: number;
  /** 'initial' points open at tick 0 ([D8]); capture points arrive in PHASE05-a. */
  kind: 'initial';
}

export interface MapDef {
  id: string;
  nameKey: string;
  width: number;
  height: number;
  /** Solid walls: block movement and shots. */
  walls: Rect[];
  /** Impassable for movement, transparent to shots. */
  water: Rect[];
  spawnPoints: SpawnPointDef[];
}

export function rectContains(r: Rect, p: Vec2): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/** Helper for map authoring: walls around the map edge, `t` units thick. */
export function borderWalls(width: number, height: number, t = 20): Rect[] {
  return [
    { x: 0, y: 0, w: width, h: t },
    { x: 0, y: height - t, w: width, h: t },
    { x: 0, y: 0, w: t, h: height },
    { x: width - t, y: 0, w: t, h: height },
  ];
}
