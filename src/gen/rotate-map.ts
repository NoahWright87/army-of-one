/**
 * (PHASE13-d) Turning a whole map by quarter turns ([D107]): so a level fits the screen's long
 * side (tall on a phone held upright, wide on a PC or a phone on its side). Everything that has a
 * place or a direction turns with it; the map's id doesn't change (the caller names it).
 *
 * Pure.
 */
import type { Vec2 } from '../sim/core/vec';
import type { MapDef, Rect } from '../sim/world/map';

/** `q` quarter turns clockwise (as seen on screen, y down). */
export function rotateMap(map: MapDef, q: number): MapDef {
  const turns = ((q % 4) + 4) % 4;
  if (turns === 0) return map;
  const W = map.width;
  const H = map.height;
  const pt = (p: Vec2): Vec2 =>
    turns === 1
      ? { x: H - p.y, y: p.x }
      : turns === 2
        ? { x: W - p.x, y: H - p.y }
        : { x: p.y, y: W - p.x };
  const rect = (r: Rect): Rect => {
    const a = pt({ x: r.x, y: r.y });
    const b = pt({ x: r.x + r.w, y: r.y + r.h });
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(b.x - a.x),
      h: Math.abs(b.y - a.y),
    };
  };
  const ang = (a: number) => a + (turns * Math.PI) / 2;
  const rects = (rs: readonly Rect[]) => rs.map(rect);

  const out: MapDef = {
    ...map,
    width: turns % 2 ? H : W,
    height: turns % 2 ? W : H,
    walls: rects(map.walls),
    water: rects(map.water),
    spawnPoints: map.spawnPoints.map((s) => ({
      ...s,
      nameKey: turnSideName(s.nameKey, turns),
      position: pt(s.position),
      facing: ang(s.facing),
      ...(s.approach ? { approach: s.approach.map(pt) } : {}),
    })),
  };
  if (map.bounds) out.bounds = rects(map.bounds);
  if (map.haze) out.haze = rects(map.haze);
  if (map.cover) out.cover = map.cover.map((c) => ({ ...c, rect: rect(c.rect) }));
  if (map.concealment) out.concealment = map.concealment.map((c) => ({ ...c, rect: rect(c.rect) }));
  if (map.groundMist) out.groundMist = map.groundMist.map(rect);
  if (map.turrets) {
    out.turrets = map.turrets.map((t) => ({
      ...t,
      position: pt(t.position),
      facing: ang(t.facing),
    }));
  }
  if (map.mines) out.mines = map.mines.map((m) => ({ ...m, position: pt(m.position) }));
  if (map.trafficLanes) {
    out.trafficLanes = map.trafficLanes.map((l) => ({ ...l, from: pt(l.from), to: pt(l.to) }));
  }
  if (map.gates) out.gates = map.gates.map((g) => ({ ...g, rect: rect(g.rect) }));
  if (map.bridges) {
    out.bridges = map.bridges.map((b) => ({
      ...b,
      rect: rect(b.rect),
      ...(b.charge ? { charge: pt(b.charge) } : {}),
    }));
  }
  if (map.levers) out.levers = map.levers.map((l) => ({ ...l, position: pt(l.position) }));
  if (map.objectives)
    out.objectives = map.objectives.map((o) => ({ ...o, position: pt(o.position) }));
  if (map.capturePoints) {
    out.capturePoints = map.capturePoints.map((c) => ({ ...c, position: pt(c.position) }));
  }
  if (map.squads) {
    out.squads = map.squads.map((s) => ({
      ...s,
      members: s.members.map((m) => ({
        ...m,
        position: pt(m.position),
        ...(m.facing !== undefined ? { facing: ang(m.facing) } : {}),
      })),
      order: s.order.kind === 'patrol' ? { kind: 'patrol', route: s.order.route.map(pt) } : s.order,
      ...(s.fallback ? { fallback: pt(s.fallback) } : {}),
      ...(s.rally ? { rally: s.rally.map(pt) } : {}),
    }));
  }
  if (map.ground) {
    const rows = map.ground.rows;
    const h = rows.length;
    const w = rows[0]?.length ?? 0;
    const at = (x: number, y: number) => rows[y]![x]!;
    const turned: string[] = [];
    const nw = turns % 2 ? h : w;
    const nh = turns % 2 ? w : h;
    for (let y = 0; y < nh; y++) {
      let line = '';
      for (let x = 0; x < nw; x++) {
        // The source tile that lands at (x, y).
        line +=
          turns === 1
            ? at(y, h - 1 - x)
            : turns === 2
              ? at(w - 1 - x, h - 1 - y)
              : at(w - 1 - y, x);
      }
      turned.push(line);
    }
    out.ground = { cellSize: map.ground.cellSize, rows: turned };
  }
  return out;
}

/** 'spawn.cross.south' → the side it's on after `turns` clockwise quarter turns. */
function turnSideName(key: string, turns: number): string {
  const m = /^(spawn\.(?:cross|exit)\.)(south|west|north|east)$/.exec(key);
  if (!m) return key;
  const order = ['south', 'west', 'north', 'east'];
  return m[1]! + order[(order.indexOf(m[2]!) + turns) % 4]!;
}

/**
 * The quarter turns that put a `w` × `h` level's long side along the screen's long side, with
 * its main way in (`entry`: the side it's on) at the bottom or left where possible. 0 when it
 * already fits.
 */
export function fitTurns(
  w: number,
  h: number,
  screen: 'portrait' | 'landscape',
  entry: 'south' | 'north' | 'east' | 'west',
): number {
  const tall = h >= w;
  if (tall === (screen === 'portrait')) return 0;
  // Clockwise turns: south → west → north → east → south.
  if (screen === 'landscape') return entry === 'north' || entry === 'west' ? 3 : 1;
  return entry === 'east' || entry === 'south' ? 1 : 3;
}
