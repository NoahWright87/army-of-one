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
import { ingressPoints } from './ingress';
import { generateWeather } from './weather';
import { keyPosition } from './key-position';
import { BLOCK_CELLS, GROUND, isGroundKind } from '../content/ground';
import { BLOCK_TUNING, DEFAULT_TUNING } from '../content/tuning';
import type { Vec2 } from '../sim/core/vec';
import { borderWalls, type MapDef, type SpawnPointDef, type WeatherKind } from '../sim/world/map';
import {
  addBlockContent,
  addPaintedTrenches,
  paintedMist,
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
  weather?: WeatherKind;
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
  const runTiles = Math.round(
    (DEFAULT_TUNING.spawn.leadInSeconds * DEFAULT_TUNING.soldier.speed) / BLOCK_TUNING.cellSize,
  );
  const x0 = Math.max(0, lv.box.x - pad);
  const y0 = Math.max(0, lv.box.y - pad);
  const x1 = Math.min(W, lv.box.x + lv.box.w + pad);
  // A level on the start edge gets a strip of ground beyond the board to run in across ([D112]).
  const onStart = world.crossings.some((c) => c.a === -1 && c.b === index);
  const y1 = Math.min(H, lv.box.y + lv.box.h + pad) + (onStart ? pad : 0);
  const w = x1 - x0;
  const h = y1 - y0;
  const own = (x: number, y: number) => y0 + y < H && owner[(y0 + y) * W + x0 + x] === index;
  // Out of bounds: walkable ground of other levels, or nobody's beyond a couple of tiles (so
  // cover spots and wall gaps inside the level stay in it).
  const filled = fillGaps(owner, W, H, BLOCK_TUNING.carve.gapFill);
  const inside = (x: number, y: number) => y0 + y < H && filled[(y0 + y) * W + x0 + x] === index;

  // Who's held: by default every neighbour met earlier (you came through them).
  const touching = world.crossings.filter((c) => c.a === index || c.b === index);
  const held =
    opts.held ??
    new Set(touching.map((c) => (c.a === index ? c.b : c.a)).filter((o) => o >= 0 && o < index));
  const other = (c: Crossing) => (c.a === index ? c.b : c.a);
  const entries = touching.filter((c) => other(c) === -1 || held.has(other(c)));
  const exits = touching.filter((c) => other(c) >= 0 && !held.has(other(c)));

  // Ground, solid and water tiles. Neighbouring ground near the level is walkable ([D113]),
  // with a haze; beyond the margin is the edge of the map.
  // Beyond the board (the start's strip): the bottom row's ground carries on.
  const rows = Array.from({ length: y1 - y0 }, (_, k) =>
    ground[Math.min(H - 1, y0 + k)]!.slice(x0, x1),
  );
  const walls = [
    ...borderWalls(w * cs, h * cs, BLOCK_TUNING.borderThickness),
    ...solidRects(rows, cs),
  ];
  const near = withinOf(w, h, inside, pad);
  const passable = (x: number, y: number) => {
    const g = rows[y]![x]!;
    return isGroundKind(g) && GROUND[g].passable;
  };
  const bounds = maskRects(w, h, cs, (x, y) => passable(x, y) && !near[y * w + x]);
  const haze = maskRects(w, h, cs, (x, y) => passable(x, y) && !!near[y * w + x] && !inside(x, y));

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
  for (let br = Math.floor(y0 / n); br <= Math.floor((Math.min(y1, H) - 1) / n); br++) {
    for (let bc = Math.floor(x0 / n); bc <= Math.floor((x1 - 1) / n); bc++) {
      const clipped = keepClear(
        clipBlock(world.grid, owner, W, br, bc, index),
        br * n,
        bc * n,
        entries.map(ourTile),
      );
      if (!clipped) continue;
      let sum = 0;
      let count = 0;
      for (let y = Math.max(br * n, y0); y < Math.min((br + 1) * n, y1, H); y++) {
        for (let x = Math.max(bc * n, x0); x < Math.min((bc + 1) * n, x1); x++) {
          const d = far[(y - y0) * w + x - x0]!;
          if (d >= 0) {
            sum += d;
            count++;
          }
        }
      }
      caps.push(blockTotalCost(clipped));
      // (PHASE16) Blocks holding an exit get more of the budget: exits are guarded ([D136]).
      const guarded = exits.some((c) => {
        const [ty, tx] = ourTile(c);
        return Math.floor(ty / n) === br && Math.floor(tx / n) === bc;
      });
      weights.push(
        (1 + BLOCK_TUNING.level.ramp * (count ? sum / count / maxFar : 0)) *
          (guarded ? BLOCK_TUNING.carve.exitGuardWeight : 1),
      );
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
    concealment: [],
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
  // (PHASE16) Only the exits are capture points ([D136]): blocks' own points (and the forward
  // spawns and squad holds on them) go, unless `carve.extraCapturePoints`.
  if (!BLOCK_TUNING.carve.extraCapturePoints) {
    const gone = new Set(content.capturePoints.map((c) => c.id));
    content.capturePoints = [];
    content.spawnPoints = content.spawnPoints.filter(
      (sp) => !(sp.capturePointId && gone.has(sp.capturePointId)),
    );
    for (const q of content.squads) {
      if (q.capturePointId && gone.has(q.capturePointId)) delete q.capturePointId;
    }
  }

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
  /**
   * The run in through a crossing ([D112]): board tiles from about a lead-in's run away on the
   * far side up to it, along walkable ground (straight in from beyond the board's edge at the
   * start).
   */
  const runIn = (c: Crossing): [number, number][] => {
    const [ty, tx] = theirTile(c);
    if (ty >= H) {
      const out: [number, number][] = [];
      for (let d = runTiles; d >= 0; d--) out.push([H + d, tx]);
      return out;
    }
    return approachPath(world, index, [ty, tx], runTiles);
  };
  const spawns: SpawnPointDef[] = entries.map((c, k) => {
    const [oy, ox] = ourTile(c);
    const [ty, tx] = theirTile(c);
    const position = inward(c, 1);
    return {
      id: `entry-${k}`,
      nameKey: `spawn.cross.${side(c)}`,
      position,
      facing: Math.atan2(oy - ty, ox - tx),
      kind: 'initial' as const,
      approach: [...runIn(c).map(([y, x]) => centre(y, x)), position],
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
  // Each exit taken is a place to spawn ([D108]): just inside it, facing on.
  flags.forEach((f, k) => {
    content.capturePoints.push({
      id: `exit-${k}`,
      nameKey: f.key,
      position: f.pos,
      objective: true,
    });
    const c = exits[k];
    if (!c) return;
    const [oy, ox] = ourTile(c);
    const [ty, tx] = theirTile(c);
    const position = inward(c, 3);
    content.spawnPoints.push({
      id: `exit-spawn-${k}`,
      nameKey: `spawn.exit.${side(c)}`,
      position,
      facing: Math.atan2(ty - oy, tx - ox),
      kind: 'capture',
      capturePointId: `exit-${k}`,
      approach: [...runIn(c).map(([y, x]) => centre(y, x)), position],
    });
  });
  // (PHASE17) Entries you hold start as green flags ([D139]): yours, but enemies can retake them.
  entries.forEach((c, k) => {
    content.capturePoints.push({
      id: `entry-${k}`,
      nameKey: 'capture.cross.entry',
      position: inward(c, 1.5),
      objective: true,
      initialStage: 'ours',
    });
  });
  // (PHASE17) One key position to take besides the exits ([D139]), with a spawn once taken.
  const tile = (p: Vec2): [number, number] => [Math.floor(p.y / cs), Math.floor(p.x / cs)];
  const key = keyPosition({
    w,
    h,
    rows,
    own,
    far,
    walls: content.walls,
    cellSize: cs,
    avoid: content.capturePoints.map((c) => tile(c.position)),
    keepAway: BLOCK_TUNING.carve.keyKeepAway,
  });
  if (key) {
    const at = centre(key[0] + y0, key[1] + x0);
    content.capturePoints.push({
      id: 'key',
      nameKey: 'capture.cross.key',
      position: at,
      objective: true,
    });
    const back = downhill(far, w, h, key[1], key[0], 2);
    const [sy, sx] = back[Math.min(2, back.length - 1)] ?? key;
    content.spawnPoints.push({
      id: 'key-spawn',
      nameKey: 'spawn.block.forward',
      position: { x: (sx + 0.5) * cs, y: (sy + 0.5) * cs },
      facing: -Math.PI / 2,
      kind: 'capture',
      capturePointId: 'key',
    });
  }
  // (PHASE16) The nearest squad to each exit holds (and retakes) it ([D136]).
  exits.forEach((_, k) => {
    const at = content.capturePoints.find((c) => c.id === `exit-${k}`)?.position;
    if (!at) return;
    let best: { q: (typeof content.squads)[number]; d: number } | null = null;
    for (const q of content.squads) {
      const m = q.members[0];
      if (!m || q.capturePointId) continue;
      const d = Math.hypot(m.position.x - at.x, m.position.y - at.y);
      if (d <= BLOCK_TUNING.carve.exitHoldRadius && (!best || d < best.d)) best = { q, d };
    }
    if (best) best.q.capturePointId = `exit-${k}`;
  });
  // Bridged islands' outposts in this level: optional, a spawn and income once taken ([D111]).
  world.outposts.forEach(([y, x], k) => {
    if (owner[y * W + x] !== index) return;
    const at = centre(y, x);
    content.capturePoints.push({
      id: `outpost-${k}`,
      nameKey: 'capture.cross.outpost',
      position: at,
    });
    content.spawnPoints.push({
      id: `outpost-spawn-${k}`,
      nameKey: 'spawn.block.forward',
      position: { x: at.x, y: at.y + cs },
      facing: -Math.PI / 2,
      kind: 'capture',
      capturePointId: `outpost-${k}`,
    });
  });
  // (PHASE16) Capture points at natural ingress points along the way ([D130]).
  const tc = BLOCK_TUNING.carve;
  const ingress = !tc.extraCapturePoints
    ? []
    : ingressPoints({
        w,
        h,
        rows,
        own,
        far,
        walls: content.walls,
        cellSize: cs,
        existing: content.capturePoints.map(
          (c) => [Math.floor(c.position.y / cs), Math.floor(c.position.x / cs)] as [number, number],
        ),
        every: tc.ingressEvery,
        keepAway: tc.ingressKeepAway,
        endMargin: tc.ingressEndMargin,
      });
  ingress.forEach(([y, x], k) => {
    content.capturePoints.push({
      id: `ingress-${k}`,
      nameKey: 'capture.ingress',
      position: { x: (x + 0.5) * cs, y: (y + 0.5) * cs },
    });
    // The spawn sits a couple of tiles back toward the entries.
    const back = downhill(far, w, h, x, y, 2);
    const [sy, sx] = back[Math.min(2, back.length - 1)] ?? [y, x];
    content.spawnPoints.push({
      id: `ingress-spawn-${k}`,
      nameKey: 'spawn.block.forward',
      position: { x: (sx + 0.5) * cs, y: (sy + 0.5) * cs },
      facing: Math.atan2(y - sy, x - sx) || -Math.PI / 2,
      kind: 'capture',
      capturePointId: `ingress-${k}`,
    });
  });
  // Block spawns (forward posts at block capture points) stay; entries go first.
  content.spawnPoints.unshift(...spawns);
  // Spawns inside the level (forward posts, outposts): run in along the way from the entries.
  for (const sp of content.spawnPoints) {
    if (sp.approach) continue;
    const tx = Math.floor(sp.position.x / cs);
    const ty = Math.floor(sp.position.y / cs);
    const back = downhill(far, w, h, tx, ty, runTiles);
    if (back.length > 1) {
      sp.approach = [
        ...back.reverse().map(([y, x]) => ({ x: (x + 0.5) * cs, y: (y + 0.5) * cs })),
        sp.position,
      ];
    }
  }

  if (rows.some((row) => row.includes('T'))) {
    addPaintedTrenches(
      maskRects(w, h, cs, (x, y) => inside(x, y) && rows[y]?.[x] === 'T'),
      content.concealment,
    );
  }
  const mist = placed.some(({ pb }) => pb.block.mist)
    ? paintedMist(w, h, cs, (x, y) => {
        if (!inside(x, y)) return undefined;
        const gx = x0 + x;
        const gy = y0 + y;
        return world.grid[Math.floor(gy / n)]?.[Math.floor(gx / n)]?.placed.mist?.[gy % n]?.[
          gx % n
        ];
      })
    : [];

  const map: MapDef = {
    id: opts.id,
    nameKey: opts.nameKey,
    width: w * cs,
    height: h * cs,
    ground: { cellSize: cs, rows },
    ...(mist.length ? { mist } : {}),
    ...(opts.weather
      ? { weather: generateWeather(opts.weather, `${world.seed}:${index}`, w * cs, h * cs) }
      : {}),
    walls: content.walls,
    water: waterRects(rows, cs),
    bounds,
    haze,
    cover: content.cover,
    concealment: content.concealment,
    gates: content.gates,
    levers: content.levers,
    turrets: content.turrets,
    mines: content.mines,
    spawnPoints: content.spawnPoints,
    capturePoints: content.capturePoints,
    squads: content.squads,
    // (PHASE17) Take every objective, or kill every enemy soldier ([D139]).
    winByKillAll: true,
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

/**
 * A block (its top-left at board tile `oy`, `ox`) without enemies, turrets or mines within
 * `carve.safeEntry` tiles of an entry ([D114]): you don't spawn on top of them. Squads left with
 * no rally point go.
 */
function keepClear(
  block: BlockDef | null,
  oy: number,
  ox: number,
  entries: readonly [number, number][],
): BlockDef | null {
  if (!block || entries.length === 0) return block;
  const r = BLOCK_TUNING.carve.safeEntry;
  const close = (x: number, y: number) =>
    entries.some(([ey, ex]) => (ex - (ox + x)) ** 2 + (ey - (oy + y)) ** 2 <= r * r);
  const items = block.items.filter(
    (it) =>
      isRectItem(it) ||
      !(it.kind === 'rally' || it.kind === 'turret' || it.kind === 'mine') ||
      !close(it.at[0], it.at[1]),
  );
  const groups = block.groups.filter((g) =>
    items.some((it) => it.kind === 'rally' && it.group === g.id),
  );
  return { ...block, items, groups };
}

/**
 * Board tiles from about `run` tiles away on the far side of a crossing up to `from` (the far
 * side's tile), over walkable ground that isn't this level: where a soldier runs in from.
 */
function approachPath(
  world: GeneratedWorld,
  index: number,
  from: [number, number],
  run: number,
): [number, number][] {
  const { w, h, open } = world.tiles;
  const start = from[0] * w + from[1];
  const prev = new Map<number, number>([[start, -1]]);
  let front = [start];
  let last = start;
  for (let d = 0; d < run && front.length; d++) {
    const next: number[] = [];
    for (const i of front) {
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= w * h || prev.has(j) || !open[j] || world.owner[j] === index) continue;
        prev.set(j, i);
        next.push(j);
      }
    }
    if (next.length) last = next[0]!;
    front = next;
  }
  const out: [number, number][] = [];
  for (let i = last; i >= 0; i = prev.get(i)!) out.push([Math.floor(i / w), i % w]);
  return out;
}

/**
 * Up to `steps` tiles from (x, y) toward lower `dist` (map tiles): the way back toward the
 * entries. Starts with (x, y).
 */
function downhill(
  dist: readonly number[],
  w: number,
  h: number,
  x: number,
  y: number,
  steps: number,
): [number, number][] {
  const out: [number, number][] = [[y, x]];
  let cx = x;
  let cy = y;
  for (let k = 0; k < steps; k++) {
    const here = dist[cy * w + cx] ?? -1;
    if (here <= 0) break;
    let best: [number, number] | null = null;
    for (const [dx, dy] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const d = dist[ny * w + nx]!;
      if (d >= 0 && d < here) best = [nx, ny];
    }
    if (!best) break;
    [cx, cy] = best;
    out.push([cy, cx]);
  }
  return out;
}

/** 1 for map tiles within `r` steps (4-way, through anything) of an `inside` tile. */
function withinOf(
  w: number,
  h: number,
  inside: (x: number, y: number) => boolean,
  r: number,
): Uint8Array {
  const near = new Uint8Array(w * h);
  let front: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (inside(x, y)) {
        near[y * w + x] = 1;
        front.push(y * w + x);
      }
    }
  }
  for (let d = 0; d < r; d++) {
    const next: number[] = [];
    for (const i of front) {
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= w * h || near[j]) continue;
        near[j] = 1;
        next.push(j);
      }
    }
    front = next;
  }
  return near;
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
