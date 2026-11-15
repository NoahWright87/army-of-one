/**
 * (PHASE13-d) One level of the world map as a playable map ([D107]–[D110]).
 *
 * - The map is the level's bounding box (plus a little margin): the ground around it is drawn,
 *   but walkable ground that isn't this level is out of bounds (`map.bounds`).
 * - **Entries** are crossings from ground you hold (the start edge, or levels taken): each one is
 *   a spawn point open from the start, named for its side ("South entry").
 * - **Exits** are crossings to ground you don't hold: each is a flag objective, and the level is
 *   won when every one is ours ([D108]). The HQ level's HQ is an objective too. A level with no
 *   exits gets one objective at its far end.
 * - The budget is spent block by block (clipped to the level), more further from the entries.
 *
 * Pure and deterministic.
 */
import { BLOCK_CELLS, GROUND, isGroundKind } from '../content/ground';
import { BLOCK_TUNING } from '../content/tuning';
import type { Vec2 } from '../sim/core/vec';
import { borderWalls, type MapDef, type SpawnPointDef } from '../sim/world/map';
import {
  addBlockContent,
  maskRects,
  solidRects,
  waterRects,
  type Content,
  type PlacedBlock,
} from './assemble';
import { isRectItem, type BlockDef, type BlockItem } from './block';
import { blockTotalCost, spendBudget } from './budget';
import { fillGaps, type Crossing } from './carve';
import type { GrownCell } from './grow';
import { mix, objectiveReachable } from './level';
import type { GeneratedWorld } from './world';

/**
 * A block's content that lies in level `index` (by the tile each thing sits on). Walls and gates
 * stay whole if any of their tiles is the level's. Squads keep only their rally points in the
 * level, and go if none is. Null if nothing's left.
 */
export function clipBlock(
  grid: readonly (readonly GrownCell[])[],
  owner: Int16Array,
  w: number,
  br: number,
  bc: number,
  index: number,
): BlockDef | null {
  const n = BLOCK_CELLS;
  const block = grid[br]![bc]!.placed;
  const mine = (x: number, y: number) => {
    const tx = Math.min(n - 1, Math.max(0, Math.floor(x)));
    const ty = Math.min(n - 1, Math.max(0, Math.floor(y)));
    return owner[(br * n + ty) * w + bc * n + tx] === index;
  };
  let any = false;
  for (let y = 0; y < n && !any; y++) for (let x = 0; x < n && !any; x++) any = mine(x, y);
  if (!any) return null;
  const keep = (it: BlockItem) => {
    if (isRectItem(it)) {
      const [x, y, ww, hh] = it.rect;
      if (it.kind === 'cover') return mine(x + ww / 2, y + hh / 2);
      for (let yy = Math.floor(y); yy < Math.ceil(y + hh); yy++) {
        for (let xx = Math.floor(x); xx < Math.ceil(x + ww); xx++) if (mine(xx, yy)) return true;
      }
      return false;
    }
    return mine(it.at[0], it.at[1]);
  };
  const items = block.items.filter(keep);
  const groups = block.groups.filter((g) =>
    items.some((it) => it.kind === 'rally' && it.group === g.id),
  );
  return { ...block, items, groups };
}

export interface LevelMapOptions {
  id: string;
  nameKey: string;
  /** Default: the level's own. */
  budget?: number;
  /**
   * Levels you hold. Default: the levels you'd have taken to get here (every neighbour met
   * earlier).
   */
  held?: ReadonlySet<number>;
}

export interface WorldLevelMap {
  map: MapDef;
  spent: number;
  reachable: boolean;
  entries: Crossing[];
  exits: Crossing[];
  /** Ids of the blocks it's made from. */
  blocks: string[];
}

export function worldLevelMap(
  world: GeneratedWorld,
  index: number,
  opts: LevelMapOptions,
): WorldLevelMap {
  const lv = world.levels[index];
  if (!lv) throw new Error(`world ${world.seed}: no level ${index}`);
  const n = BLOCK_CELLS;
  const cs = BLOCK_TUNING.cellSize;
  const { w: W, h: H, ground } = world.tiles;
  const owner = world.owner;
  const pad = BLOCK_TUNING.carve.mapMargin;
  const x0 = Math.max(0, lv.box.x - pad);
  const y0 = Math.max(0, lv.box.y - pad);
  const x1 = Math.min(W, lv.box.x + lv.box.w + pad);
  const y1 = Math.min(H, lv.box.y + lv.box.h + pad);
  const w = x1 - x0;
  const h = y1 - y0;
  const own = (x: number, y: number) => owner[(y0 + y) * W + x0 + x] === index;
  // Out of bounds: walkable ground of other levels, or nobody's beyond a couple of tiles (so
  // cover spots and wall gaps inside the level stay in it).
  const filled = fillGaps(owner, W, H, BLOCK_TUNING.carve.gapFill);
  const inside = (x: number, y: number) => filled[(y0 + y) * W + x0 + x] === index;

  // Who's held: by default every neighbour met earlier (you came through them).
  const touching = world.crossings.filter((c) => c.a === index || c.b === index);
  const held =
    opts.held ??
    new Set(touching.map((c) => (c.a === index ? c.b : c.a)).filter((o) => o >= 0 && o < index));
  const other = (c: Crossing) => (c.a === index ? c.b : c.a);
  const entries = touching.filter((c) => other(c) === -1 || held.has(other(c)));
  const exits = touching.filter((c) => other(c) >= 0 && !held.has(other(c)));

  // Ground, solid and water tiles; walkable ground that isn't ours is out of bounds.
  const rows = ground.slice(y0, y1).map((r) => r.slice(x0, x1));
  const walls = [
    ...borderWalls(w * cs, h * cs, BLOCK_TUNING.borderThickness),
    ...solidRects(rows, cs),
  ];
  const bounds = maskRects(w, h, cs, (x, y) => {
    const g = rows[y]![x]!;
    return isGroundKind(g) && GROUND[g].passable && !inside(x, y);
  });

  // Distance from the entries over our ground: the budget weighs the far end more, and a level
  // with no exits puts its objective at the far end.
  const ourTile = (c: Crossing): [number, number] => (c.a === index ? c.atA : c.atB);
  const theirTile = (c: Crossing): [number, number] => (c.a === index ? c.atB : c.atA);
  const far = distanceFrom(
    entries.map((c) => ourTile(c)).map(([y, x]) => [y - y0, x - x0] as [number, number]),
    w,
    h,
    own,
  );

  // Spend the budget over the blocks (clipped to the level), more further in.
  const placed: { pb: PlacedBlock; ox: number; oy: number }[] = [];
  const caps: number[] = [];
  const weights: number[] = [];
  const maxFar = Math.max(1, ...far.filter((d) => d >= 0));
  for (let br = Math.floor(y0 / n); br <= Math.floor((y1 - 1) / n); br++) {
    for (let bc = Math.floor(x0 / n); bc <= Math.floor((x1 - 1) / n); bc++) {
      const clipped = clipBlock(world.grid, owner, W, br, bc, index);
      if (!clipped) continue;
      let sum = 0;
      let count = 0;
      for (let y = Math.max(br * n, y0); y < Math.min((br + 1) * n, y1); y++) {
        for (let x = Math.max(bc * n, x0); x < Math.min((bc + 1) * n, x1); x++) {
          const d = far[(y - y0) * w + x - x0]!;
          if (d >= 0) {
            sum += d;
            count++;
          }
        }
      }
      caps.push(blockTotalCost(clipped));
      weights.push(1 + BLOCK_TUNING.level.ramp * (count ? sum / count / maxFar : 0));
      placed.push({
        pb: { block: clipped, col: bc, row: br, spawned: new Set(), prefix: `b${br}x${bc}-` },
        ox: bc * n - x0,
        oy: br * n - y0,
      });
    }
  }
  const budget = opts.budget ?? lv.budget;
  const shares = shareBudget(caps, weights, budget);
  let carry = 0;
  let spent = 0;
  const seed = mix(world.seed, 1000 + index);
  const content: Content = {
    walls,
    cover: [],
    gates: [],
    levers: [],
    turrets: [],
    mines: [],
    squads: [],
    capturePoints: [],
    spawnPoints: [],
  };
  placed.forEach((p, k) => {
    const share = shares[k]! + carry;
    const res = spendBudget(p.pb.block, Math.floor(share + 1e-6), mix(seed, k));
    carry = share - res.spent;
    spent += res.spent;
    addBlockContent({ ...p.pb, spawned: res.spawned }, p.ox, p.oy, content);
  });

  // Entries → spawn points; exits (and the HQ) → flag objectives.
  const centre = (y: number, x: number): Vec2 => ({
    x: (x - x0 + 0.5) * cs,
    y: (y - y0 + 0.5) * cs,
  });
  const inward = (c: Crossing, by: number): Vec2 => {
    const [oy, ox] = ourTile(c);
    const [ty, tx] = theirTile(c);
    const p = centre(oy, ox);
    return { x: p.x + (ox - tx) * by * cs, y: p.y + (oy - ty) * by * cs };
  };
  const side = (c: Crossing) => {
    const [oy, ox] = ourTile(c);
    const [ty, tx] = theirTile(c);
    return ty > oy ? 'south' : ty < oy ? 'north' : tx > ox ? 'east' : 'west';
  };
  const spawns: SpawnPointDef[] = entries.map((c, k) => {
    const [oy, ox] = ourTile(c);
    const [ty, tx] = theirTile(c);
    return {
      id: `entry-${k}`,
      nameKey: `spawn.cross.${side(c)}`,
      position: inward(c, 1),
      facing: Math.atan2(oy - ty, ox - tx),
      kind: 'initial' as const,
    };
  });
  const flags: { pos: Vec2; key: string }[] = exits.map((c) => ({
    pos: inward(c, 1.5),
    key: 'capture.cross.exit',
  }));
  if (index === world.hq) {
    const hqAt = hqObjective(world);
    if (hqAt)
      flags.push({ pos: { x: hqAt.x - x0 * cs, y: hqAt.y - y0 * cs }, key: 'capture.cross.hq' });
  }
  if (flags.length === 0) {
    // No way on: the far end.
    let best = -1;
    for (let i = 0; i < far.length; i++)
      if (far[i]! >= 0 && (best < 0 || far[i]! > far[best]!)) best = i;
    if (best >= 0) {
      flags.push({
        pos: { x: ((best % w) + 0.5) * cs, y: (Math.floor(best / w) + 0.5) * cs },
        key: 'capture.cross.exit',
      });
    }
  }
  flags.forEach((f, k) =>
    content.capturePoints.push({
      id: `exit-${k}`,
      nameKey: f.key,
      position: f.pos,
      objective: true,
    }),
  );
  // Block spawns (forward posts at block capture points) stay; entries go first.
  content.spawnPoints.unshift(...spawns);

  const map: MapDef = {
    id: opts.id,
    nameKey: opts.nameKey,
    width: w * cs,
    height: h * cs,
    ground: { cellSize: cs, rows },
    walls: content.walls,
    water: waterRects(rows, cs),
    bounds,
    cover: content.cover,
    gates: content.gates,
    levers: content.levers,
    turrets: content.turrets,
    mines: content.mines,
    spawnPoints: content.spawnPoints,
    capturePoints: content.capturePoints,
    squads: content.squads,
  };
  return {
    map,
    spent,
    reachable: spawns.length > 0 && objectiveReachable(map),
    entries,
    exits,
    blocks: placed.map((p) => p.pb.block.id),
  };
}

/**
 * Which side of the level its main way in is on (the widest entry), given what's held: for
 * turning the map to fit the screen ([D107]).
 */
export function mainEntrySide(
  world: GeneratedWorld,
  index: number,
  held?: ReadonlySet<number>,
): 'south' | 'north' | 'east' | 'west' {
  const touching = world.crossings.filter((c) => c.a === index || c.b === index);
  const other = (c: Crossing) => (c.a === index ? c.b : c.a);
  const h = held ?? new Set(touching.map(other).filter((o) => o >= 0 && o < index));
  const entries = touching.filter((c) => other(c) === -1 || h.has(other(c)));
  if (entries.length === 0) return 'south';
  const c = entries.reduce((m, x) => (x.width > m.width ? x : m));
  const [oy, ox] = c.a === index ? c.atA : c.atB;
  const [ty, tx] = c.a === index ? c.atB : c.atA;
  return ty > oy ? 'south' : ty < oy ? 'north' : tx > ox ? 'east' : 'west';
}

/** The HQ block's objective slot (else its centre), in board units. */
function hqObjective(world: GeneratedWorld): Vec2 | null {
  const n = BLOCK_CELLS;
  const cs = BLOCK_TUNING.cellSize;
  const row = world.grid[0] ?? [];
  let bc = row.findIndex((g) => g.block.role === 'hq');
  if (bc < 0) bc = row.findIndex((g) => g.side === 'enemy');
  if (bc < 0) return null;
  const b = row[bc]!.placed;
  const slot = b.items.find((i) => i.kind === 'objective');
  const [x, y] = slot && !isRectItem(slot) ? slot.at : [n / 2, n / 2];
  return { x: (bc * n + x) * cs, y: y * cs };
}

/** 4-way walking distance over `ok` tiles from `from` ([y, x]); -1 where unreached. */
function distanceFrom(
  from: readonly [number, number][],
  w: number,
  h: number,
  ok: (x: number, y: number) => boolean,
): number[] {
  const dist = new Array<number>(w * h).fill(-1);
  const queue: number[] = [];
  for (const [y, x] of from) {
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const i = y * w + x;
    if (dist[i] === -1) {
      dist[i] = 0;
      queue.push(i);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    const x = i % w;
    const y = (i - x) / w;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || !ok(nx, ny)) continue;
      const j = ny * w + nx;
      if (dist[j] === -1) {
        dist[j] = dist[i]! + 1;
        queue.push(j);
      }
    }
  }
  return dist;
}

/**
 * Splits `total` by weight, never more to one than its cap; the excess goes to the others (so a
 * budget at or above everything's cost buys everything).
 */
export function shareBudget(caps: number[], weights: number[], total: number): number[] {
  const share = caps.map(() => 0);
  let left = total;
  let open = caps.map((_, i) => i);
  const EPS = 1e-6;
  for (let guard = 0; left > EPS && open.length > 0 && guard < 64; guard++) {
    const sumW = open.reduce((s, i) => s + weights[i]!, 0);
    let used = 0;
    const still: number[] = [];
    for (const i of open) {
      const give = Math.min((left * weights[i]!) / sumW, caps[i]! - share[i]!);
      share[i]! += give;
      used += give;
      if (caps[i]! - share[i]! > EPS) still.push(i);
    }
    left -= used;
    if (used <= EPS) break;
    open = still;
  }
  return share;
}
