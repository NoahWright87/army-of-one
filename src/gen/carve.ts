/**
 * (PHASE13-d) Carving a world board into levels by its terrain ([D107]–[D110]).
 *
 * Everything works on the whole board's tiles:
 *
 * 1. **Walkable ground**: passable tiles not under a placed wall, joined to the start. Water,
 *    rocks, walls and anything cut off belong to no level (no-man's-land: the ocean, a lake).
 * 2. **Fronts**: bands of `carve.bandBlocks` (random) block rows from the south. Each border is
 *    the cheapest line across the board near its nominal row, where crossing walkable ground
 *    costs and crossing water/rocks/walls is free: so borders run along rivers and lakes and cut
 *    through the narrowest places (a bridge, a gate, a pass).
 * 3. **Levels**: each band is split the same way, side to side, into pieces of about
 *    `carve.levelBlocks` blocks of walkable ground; shapes follow the terrain.
 * 4. **Crossings**: where walkable ground of two levels touches, or a level touches the
 *    board's south edge (the start). They're the ways in and out of a level.
 *
 * Pure and deterministic.
 */
import { BLOCK_CELLS, GROUND, isGroundKind } from '../content/ground';
import { BLOCK_TUNING } from '../content/tuning';
import { nextFloat, nextInt, type RngState } from '../sim/core/rng';
import { isRectItem } from './block';
import { connect, type GrownCell } from './grow';

/** The board's tiles: ground letters and what's walkable (joined to the start). */
export interface BoardTiles {
  /** Width and height in tiles. */
  w: number;
  h: number;
  ground: string[];
  /** 1: walkable ground reachable from the start. */
  walk: Uint8Array;
  /** 1: walkable ground, reachable or not (islands too). */
  open: Uint8Array;
}

export function boardTiles(grid: readonly (readonly GrownCell[])[]): BoardTiles {
  const n = BLOCK_CELLS;
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const w = cols * n;
  const h = rows * n;
  const ground: string[] = [];
  for (let br = 0; br < rows; br++) {
    for (let r = 0; r < n; r++) {
      let line = '';
      for (let bc = 0; bc < cols; bc++) line += grid[br]![bc]!.placed.ground[r]!;
      ground.push(line);
    }
  }
  const open = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const g = ground[y]![x]!;
      if (isGroundKind(g) && GROUND[g].passable) open[y * w + x] = 1;
    }
  }
  // Placed walls and cover block too (cover stops movement like a wall, [D32]).
  for (let br = 0; br < rows; br++) {
    for (let bc = 0; bc < cols; bc++) {
      for (const it of grid[br]![bc]!.placed.items) {
        if ((it.kind !== 'wall' && it.kind !== 'cover') || !isRectItem(it)) continue;
        const [x0, y0, ww, hh] = it.rect;
        for (let y = Math.floor(y0); y < Math.ceil(y0 + hh); y++) {
          for (let x = Math.floor(x0); x < Math.ceil(x0 + ww); x++) {
            if (x >= 0 && y >= 0 && x < n && y < n) open[(br * n + y) * w + bc * n + x] = 0;
          }
        }
      }
    }
  }
  // Joined to the start: flood from the walkable south edge.
  const walk = new Uint8Array(w * h);
  const queue: number[] = [];
  for (let x = 0; x < w; x++) {
    const i = (h - 1) * w + x;
    if (open[i]) {
      walk[i] = 1;
      queue.push(i);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    for (const j of neighbours4(i, w, h)) {
      if (open[j] && !walk[j]) {
        walk[j] = 1;
        queue.push(j);
      }
    }
  }
  return { w, h, ground, walk, open };
}

/**
 * (PHASE17) Walled pockets ([D143]): walkable ground of `carve.pocketMinTiles` or more that's cut
 * off by walls or rocks (not water: islands are `bridgeIslands`') gets a way in cut through the
 * thinnest part of its wall (`connect`, mutating `grid`), so a walled base is played instead of
 * blacked out. Returns a tile near each breached pocket's middle ([y, x]).
 */
export function breachPockets(grid: GrownCell[][], t: BoardTiles): [number, number][] {
  const tune = BLOCK_TUNING.carve;
  const { w, h, walk, open, ground } = t;
  const seen = new Uint8Array(w * h);
  const out: [number, number][] = [];
  const yx = (i: number): [number, number] => [Math.floor(i / w), i % w];
  let targets: [number, number][] | null = null;
  for (let s = 0; s < w * h; s++) {
    if (!open[s] || walk[s] || seen[s]) continue;
    const pocket = flood([s], w, h, (j) => open[j] === 1 && !walk[j] && !seen[j]);
    for (const i of pocket) seen[i] = 1;
    if (pocket.length < tune.pocketMinTiles) continue;
    const wet = pocket.some((i) =>
      neighbours4(i, w, h).some((j) => ground[Math.floor(j / w)]![j % w] === 'W'),
    );
    if (wet) continue;
    if (!targets) {
      targets = [];
      for (let i = 0; i < w * h; i++) if (walk[i]) targets.push(yx(i));
    }
    connect(grid, pocket.map(yx), targets);
    let sx = 0;
    let sy = 0;
    for (const i of pocket) {
      sx += i % w;
      sy += Math.floor(i / w);
    }
    const mx = sx / pocket.length;
    const my = sy / pocket.length;
    let best = pocket[0]!;
    let bestD = Infinity;
    for (const i of pocket) {
      const d = ((i % w) - mx) ** 2 + (Math.floor(i / w) - my) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    out.push(yx(best));
  }
  return out;
}

/**
 * (PHASE13-d) Islands (walkable ground cut off by water) of `carve.islandMinTiles` or more, within
 * `carve.maxBridge` tiles of water from the mainland, get a bridge (cut into `grid`). Returns a
 * tile near each bridged island's middle ([y, x]): an outpost to take there.
 */
export function bridgeIslands(grid: GrownCell[][], t: BoardTiles): [number, number][] {
  const tune = BLOCK_TUNING.carve;
  const { w, h, walk, open, ground } = t;
  const seen = new Uint8Array(w * h);
  const out: [number, number][] = [];
  for (let s = 0; s < w * h; s++) {
    if (!open[s] || walk[s] || seen[s]) continue;
    const island = flood([s], w, h, (j) => open[j] === 1 && !walk[j] && !seen[j]);
    for (const i of island) seen[i] = 1;
    if (island.length < tune.islandMinTiles) continue;
    // The nearest mainland across water only, within reach.
    const dist = new Map<number, number>();
    let front = [...island];
    for (const i of island) dist.set(i, 0);
    let target = -1;
    for (let step = 1; step <= tune.maxBridge + 1 && front.length && target < 0; step++) {
      const next: number[] = [];
      for (const i of front) {
        for (const j of neighbours4(i, w, h)) {
          if (dist.has(j)) continue;
          dist.set(j, step);
          if (walk[j]) {
            target = j;
            break;
          }
          if (ground[Math.floor(j / w)]![j % w] === 'W' && step <= tune.maxBridge) next.push(j);
        }
        if (target >= 0) break;
      }
      front = next;
    }
    if (target < 0) continue;
    const at = (i: number): [number, number] => [Math.floor(i / w), i % w];
    connect(grid, island.map(at), [at(target)]);
    out.push(at(middleOf(island, w)));
  }
  return out;
}

export interface CarvedLevel {
  index: number;
  /** Tiles held, as a bounding box in board tiles. */
  box: { x: number; y: number; w: number; h: number };
  /** Walkable tiles held. */
  tiles: number;
  /** Blocks' worth of walkable ground (tiles / 225). */
  blocks: number;
  /** Which front (0 = the first, by the start). */
  band: number;
}

/** A way between two levels (or from the start edge into a level). */
export interface Crossing {
  /** The level on one side, or -1 for the start (the board's south edge). */
  a: number;
  b: number;
  /** Tiles along the border. */
  width: number;
  /** A tile on each side, near the middle of the crossing ([y, x] board tiles). */
  atA: [number, number];
  atB: [number, number];
}

export interface Carving {
  /** Level index per tile, -1 for no level. */
  owner: Int16Array;
  levels: CarvedLevel[];
  crossings: Crossing[];
  /** Walking distance (tiles) from the start edge, per tile (-1: not walkable). */
  dist: Int32Array;
}

export function carveBoard(t: BoardTiles, rng: RngState): Carving {
  const tune = BLOCK_TUNING.carve;
  const n = BLOCK_CELLS;
  const { w, h, walk } = t;
  const band = new Int16Array(w * h).fill(-1);

  // ---- 1. Fronts: borders across the board, near nominal rows.
  const depths: number[] = [];
  for (let left = h / n; left > 0;) {
    let d = nextInt(rng, tune.bandBlocks[0], tune.bandBlocks[1]);
    if (left - d < tune.bandBlocks[0]) d = left; // no sliver at the top
    depths.push(Math.min(d, left));
    left -= d;
  }
  let nominal = h;
  let floor = h; // the previous border's highest tile: the next one stays above it
  const borders: Uint8Array[] = [];
  for (let k = 0; k < depths.length - 1; k++) {
    nominal -= depths[k]! * n;
    const win = tune.borderSlack * n;
    const lo = Math.max(1, nominal - win);
    const hi = Math.min(floor - tune.minGap * n, nominal + win);
    const line = cheapestLine(t, {
      allowed: (i) => {
        const y = Math.floor(i / w);
        return y >= Math.min(lo, hi) && y <= hi;
      },
      starts: rangeCol(0, Math.min(lo, hi), hi, w),
      isGoal: (i) => i % w === w - 1,
      off: (i) => Math.abs(Math.floor(i / w) - nominal),
    });
    borders.push(line);
    let top = floor;
    for (let i = 0; i < w * h; i++) if (line[i]) top = Math.min(top, Math.floor(i / w));
    floor = top;
  }
  // Label bands: flood from below, each stopping at its border (its border tiles join it).
  let seeds: number[] = [];
  for (let x = 0; x < w; x++) seeds.push((h - 1) * w + x);
  for (let k = 0; k < depths.length; k++) {
    const stop = borders[k];
    const reached = flood(seeds, w, h, (j) => band[j] === -1 && !stop?.[j]);
    for (const i of reached) band[i] = k;
    if (stop) for (let i = 0; i < w * h; i++) if (stop[i] && band[i] === -1) band[i] = k;
    seeds = [];
    for (let i = 0; i < w * h; i++) {
      if (band[i] !== k) continue;
      for (const j of neighbours4(i, w, h)) if (band[j] === -1) seeds.push(j);
    }
  }
  for (let i = 0; i < w * h; i++) if (band[i] === -1) band[i] = depths.length - 1;

  // ---- 2. Split each band side to side into pieces of about `levelBlocks` blocks of ground.
  const piece = new Int32Array(w * h).fill(-1);
  let pieces = 0;
  for (let k = 0; k < depths.length; k++) {
    const inBand = (i: number) => band[i] === k;
    const colMass = new Array<number>(w).fill(0);
    let mass = 0;
    for (let i = 0; i < w * h; i++) {
      if (inBand(i) && walk[i]) {
        colMass[i % w]!++;
        mass++;
      }
    }
    const want = tune.levelBlocks * n * n;
    const parts = Math.max(1, Math.round(mass / want));
    const cuts: Uint8Array[] = [];
    let leftEdge = 0;
    for (let p = 1; p < parts; p++) {
      // The column where this share of the band's ground is reached, jittered a little.
      const target = (mass * p) / parts;
      let acc = 0;
      let x = 0;
      while (x < w - 1 && acc + colMass[x]! < target) acc += colMass[x++]!;
      x += Math.round((nextFloat(rng) - 0.5) * tune.splitJitter * n);
      const win = tune.borderSlack * n;
      const lo = Math.max(leftEdge + tune.minGap * n, x - win);
      const hi = Math.min(w - 2, x + win);
      if (lo > hi) break;
      // From the band's south side (touching the band below, or the board's edge) to its
      // north side (touching the band above, or the top edge).
      const touches = (i: number, other: number) =>
        neighbours4(i, w, h).some((j) => band[j] === other);
      const below = (i: number) => (k === 0 ? Math.floor(i / w) === h - 1 : touches(i, k - 1));
      const above = (i: number) =>
        k === depths.length - 1 ? Math.floor(i / w) === 0 : touches(i, k + 1);
      const allowed = (i: number) => inBand(i) && i % w >= lo && i % w <= hi;
      const starts: number[] = [];
      for (let i = 0; i < w * h; i++) if (allowed(i) && below(i)) starts.push(i);
      const line = cheapestLine(t, {
        allowed,
        starts,
        isGoal: (i) => above(i),
        off: (i) => Math.abs((i % w) - x),
      });
      cuts.push(line);
      let right = leftEdge;
      for (let i = 0; i < w * h; i++) if (line[i]) right = Math.max(right, i % w);
      leftEdge = right;
    }
    // Label pieces from the left, each stopping at its cut.
    let left: number[] = [];
    for (let i = 0; i < w * h; i++) if (inBand(i) && i % w === 0) left.push(i);
    for (let p = 0; p <= cuts.length; p++) {
      const stop = cuts[p];
      const id = pieces++;
      const reached = flood(left, w, h, (j) => inBand(j) && piece[j] === -1 && !stop?.[j]);
      for (const i of reached) piece[i] = id;
      if (stop) for (let i = 0; i < w * h; i++) if (stop[i] && piece[i] === -1) piece[i] = id;
      left = [];
      for (let i = 0; i < w * h; i++) {
        if (piece[i] !== id) continue;
        for (const j of neighbours4(i, w, h)) if (inBand(j) && piece[j] === -1) left.push(j);
      }
    }
    // Pockets nothing reached join a neighbouring piece.
    absorb(piece, w, h, inBand);
  }

  // ---- 3. Levels: each piece's walkable ground, in connected parts. Big parts are levels;
  // small ones join the level they touch most (or no level).
  const owner = new Int16Array(w * h).fill(-1);
  const partOf = new Int32Array(w * h).fill(-1);
  const parts: { piece: number; tiles: number[] }[] = [];
  for (let i = 0; i < w * h; i++) {
    if (!walk[i] || partOf[i] !== -1) continue;
    const id = parts.length;
    const p = piece[i]!;
    const tiles = flood([i], w, h, (j) => walk[j] === 1 && piece[j] === p && partOf[j] === -1);
    for (const j of tiles) partOf[j] = id;
    parts.push({ piece: p, tiles });
  }
  const minTiles = tune.minLevelBlocks * n * n;
  const levelOfPart = new Int32Array(parts.length).fill(-1);
  let levelCount = 0;
  parts.forEach((p, id) => {
    if (p.tiles.length >= minTiles) levelOfPart[id] = levelCount++;
  });
  // Small parts: join the touching level with the most contact; repeat while anything joins.
  for (let changed = true; changed;) {
    changed = false;
    parts.forEach((p, id) => {
      if (levelOfPart[id] !== -1) return;
      const contact = new Map<number, number>();
      for (const i of p.tiles) {
        for (const j of neighbours4(i, w, h)) {
          const q = partOf[j]!;
          if (q >= 0 && q !== id && levelOfPart[q] !== -1) {
            const lv = levelOfPart[q]!;
            contact.set(lv, (contact.get(lv) ?? 0) + 1);
          }
        }
      }
      let best = -1;
      let most = 0;
      for (const [lv, c] of [...contact].sort((a, b) => a[0] - b[0])) {
        if (c > most) {
          most = c;
          best = lv;
        }
      }
      if (best >= 0) {
        levelOfPart[id] = best;
        changed = true;
      }
    });
  }
  for (let i = 0; i < w * h; i++) if (partOf[i]! >= 0) owner[i] = levelOfPart[partOf[i]!]!;

  // Small parts touching no level (a yard walled off from both sides, entered from the start
  // edge): join the nearest level within reach, so they're played rather than blacked out.
  parts.forEach((p, id) => {
    if (levelOfPart[id] !== -1) return;
    const seen = new Uint8Array(w * h);
    let front = [...p.tiles];
    for (const i of front) seen[i] = 1;
    for (let step = 0; step < tune.orphanReach && front.length; step++) {
      const next: number[] = [];
      for (const i of front) {
        for (const j of neighbours4(i, w, h)) {
          if (seen[j]) continue;
          seen[j] = 1;
          if (owner[j]! >= 0) {
            levelOfPart[id] = owner[j]!;
            break;
          }
          next.push(j);
        }
        if (levelOfPart[id] !== -1) break;
      }
      if (levelOfPart[id] !== -1) break;
      front = next;
    }
    if (levelOfPart[id] !== -1) for (const i of p.tiles) owner[i] = levelOfPart[id]!;
  });

  // Levels too small to be worth a mission join the neighbour they share the most border with.
  const minLevel = tune.mergeBelowBlocks * n * n;
  for (let guard = 0; guard < levelCount; guard++) {
    const size = new Array<number>(levelCount).fill(0);
    for (let i = 0; i < w * h; i++) if (owner[i]! >= 0) size[owner[i]!]!++;
    const small = size
      .map((sz, lv) => ({ sz, lv }))
      .filter((x) => x.sz > 0 && x.sz < minLevel)
      .sort((a, b) => a.sz - b.sz || a.lv - b.lv);
    let merged = false;
    for (const { lv } of small) {
      const contact = new Map<number, number>();
      for (let i = 0; i < w * h; i++) {
        if (owner[i] !== lv) continue;
        for (const j of neighbours4(i, w, h)) {
          const o = owner[j]!;
          if (o >= 0 && o !== lv) contact.set(o, (contact.get(o) ?? 0) + 1);
        }
      }
      const best = [...contact].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
      if (!best) continue;
      for (let i = 0; i < w * h; i++) if (owner[i] === lv) owner[i] = best[0];
      merged = true;
      break;
    }
    if (!merged) break;
  }
  // Number the levels left 0…n-1.
  {
    const used = new Map<number, number>();
    for (let i = 0; i < w * h; i++) {
      const o = owner[i]!;
      if (o < 0) continue;
      if (!used.has(o)) used.set(o, used.size);
      owner[i] = used.get(o)!;
    }
    levelCount = used.size;
  }

  // ---- 4. Order levels by walking distance from the start (the order you'd meet them).
  const dist = new Int32Array(w * h).fill(-1);
  const queue: number[] = [];
  for (let x = 0; x < w; x++) {
    const i = (h - 1) * w + x;
    if (walk[i]) {
      dist[i] = 0;
      queue.push(i);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    for (const j of neighbours4(i, w, h)) {
      if (walk[j] && dist[j] === -1) {
        dist[j] = dist[i]! + 1;
        queue.push(j);
      }
    }
  }
  const first = new Array<number>(levelCount).fill(Infinity);
  const firstX = new Array<number>(levelCount).fill(0);
  for (let i = 0; i < w * h; i++) {
    const lv = owner[i]!;
    if (lv >= 0 && dist[i]! < first[lv]!) {
      first[lv] = dist[i]!;
      firstX[lv] = i % w;
    }
  }
  const order = Array.from({ length: levelCount }, (_, i) => i).sort(
    (a, b) => first[a]! - first[b]! || firstX[a]! - firstX[b]! || a - b,
  );
  const renumber = new Int16Array(levelCount);
  order.forEach((old, neu) => (renumber[old] = neu));
  for (let i = 0; i < w * h; i++) if (owner[i]! >= 0) owner[i] = renumber[owner[i]!]!;

  const levels: CarvedLevel[] = Array.from({ length: levelCount }, (_, index) => ({
    index,
    box: { x: w, y: h, w: 0, h: 0 },
    tiles: 0,
    blocks: 0,
    band: 0,
  }));
  const ext = levels.map(() => ({ x0: w, y0: h, x1: -1, y1: -1 }));
  for (let i = 0; i < w * h; i++) {
    const lv = owner[i]!;
    if (lv < 0) continue;
    const x = i % w;
    const y = (i - x) / w;
    const e = ext[lv]!;
    e.x0 = Math.min(e.x0, x);
    e.y0 = Math.min(e.y0, y);
    e.x1 = Math.max(e.x1, x);
    e.y1 = Math.max(e.y1, y);
    levels[lv]!.tiles++;
    levels[lv]!.band = Math.max(levels[lv]!.band, band[i]!);
  }
  for (const lv of levels) {
    const e = ext[lv.index]!;
    lv.box = { x: e.x0, y: e.y0, w: e.x1 - e.x0 + 1, h: e.y1 - e.y0 + 1 };
    lv.blocks = Math.round((lv.tiles / (n * n)) * 10) / 10;
  }

  return { owner, levels, crossings: findCrossings(owner, w, h), dist };
}

/**
 * Crossings: runs of walkable tiles of two different levels side by side (and runs of a level's
 * tiles along the board's south edge, from the start). Runs narrower than
 * `carve.minCrossing` tiles don't count.
 */
export function findCrossings(owner: Int16Array, w: number, h: number): Crossing[] {
  const minW = BLOCK_TUNING.carve.minCrossing;
  // Border pairs by level pair, keyed by the lower-numbered side's tile.
  const pairs = new Map<string, { i: number; j: number }[]>();
  const add = (a: number, b: number, i: number, j: number) => {
    const key = `${a},${b}`;
    let list = pairs.get(key);
    if (!list) pairs.set(key, (list = []));
    list.push({ i, j });
  };
  for (let i = 0; i < w * h; i++) {
    const a = owner[i]!;
    if (a < 0) continue;
    const x = i % w;
    for (const j of [x < w - 1 ? i + 1 : -1, i + w < w * h ? i + w : -1]) {
      if (j < 0) continue;
      const b = owner[j]!;
      if (b < 0 || b === a) continue;
      if (a < b) add(a, b, i, j);
      else add(b, a, j, i);
    }
  }
  const out: Crossing[] = [];
  const at = (i: number): [number, number] => [Math.floor(i / w), i % w];
  const keys = [...pairs.keys()].sort((p, q) => {
    const [a1, b1] = p.split(',').map(Number) as [number, number];
    const [a2, b2] = q.split(',').map(Number) as [number, number];
    return a1 - a2 || b1 - b2;
  });
  for (const key of keys) {
    const [a, b] = key.split(',').map(Number) as [number, number];
    const list = pairs.get(key)!;
    // Group pairs whose a-side tiles touch (8-way) into runs.
    const seen = new Set<number>();
    const byTile = new Map<number, { i: number; j: number }>();
    for (const p of list) if (!byTile.has(p.i)) byTile.set(p.i, p);
    for (const p of list) {
      if (seen.has(p.i)) continue;
      const run: { i: number; j: number }[] = [];
      const stack = [p.i];
      seen.add(p.i);
      while (stack.length) {
        const i = stack.pop()!;
        run.push(byTile.get(i)!);
        const x = i % w;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            if (x + dx < 0 || x + dx >= w) continue;
            const k = i + dy * w + dx;
            if (byTile.has(k) && !seen.has(k)) {
              seen.add(k);
              stack.push(k);
            }
          }
        }
      }
      if (run.length < minW) continue;
      run.sort((p1, p2) => p1.i - p2.i);
      const mid = middleOf(
        run.map((r) => r.i),
        w,
      );
      const pick = run.find((r) => r.i === mid)!;
      out.push({ a, b, width: run.length, atA: at(pick.i), atB: at(pick.j) });
    }
  }
  // From the start: runs of each level's tiles along the south edge.
  const y = h - 1;
  for (let x = 0; x < w;) {
    const lv = owner[y * w + x]!;
    if (lv < 0) {
      x++;
      continue;
    }
    let x1 = x;
    while (x1 + 1 < w && owner[y * w + x1 + 1] === lv) x1++;
    if (x1 - x + 1 >= minW) {
      const mx = Math.floor((x + x1) / 2);
      out.push({ a: -1, b: lv, width: x1 - x + 1, atA: [h, mx], atB: [y, mx] });
    }
    x = x1 + 1;
  }
  return mergeNear(out, BLOCK_TUNING.carve.mergeCrossings);
}

/**
 * Crossings between the same two levels closer than `gap` tiles are one way through (a wide
 * open border broken up by fences or trees): merged, keeping the widest one's tiles.
 */
function mergeNear(list: Crossing[], gap: number): Crossing[] {
  const out: Crossing[] = [];
  const groups = new Map<string, Crossing[]>();
  for (const c of list) {
    const key = `${c.a},${c.b}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push(c);
  }
  for (const g of groups.values()) {
    const done = new Array<boolean>(g.length).fill(false);
    for (let i = 0; i < g.length; i++) {
      if (done[i]) continue;
      const cluster = [g[i]!];
      done[i] = true;
      for (let k = 0; k < cluster.length; k++) {
        for (let j = 0; j < g.length; j++) {
          if (done[j]) continue;
          const p = cluster[k]!.atB;
          const q = g[j]!.atB;
          if (Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) <= gap) {
            done[j] = true;
            cluster.push(g[j]!);
          }
        }
      }
      const widest = cluster.reduce((m, c) => (c.width > m.width ? c : m));
      out.push({ ...widest, width: cluster.reduce((n, c) => n + c.width, 0) });
    }
  }
  return out;
}

/** The tile of a run nearest its centre. */
function middleOf(tiles: number[], w: number): number {
  const cx = tiles.reduce((s, i) => s + (i % w), 0) / tiles.length;
  const cy = tiles.reduce((s, i) => s + Math.floor(i / w), 0) / tiles.length;
  let best = tiles[0]!;
  let bd = Infinity;
  for (const i of tiles) {
    const d = ((i % w) - cx) ** 2 + (Math.floor(i / w) - cy) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/**
 * (PHASE13-d) Level per tile with the gaps filled: tiles in no level (walls, cover, a pond) within `gap`
 * tiles of a level join it, so small holes aren't outlined and levels reach the shore. Big
 * water and rock stay clear.
 */
export function fillGaps(owner: Int16Array, w: number, h: number, gap = 2): Int16Array {
  const out = owner.slice();
  let front: number[] = [];
  for (let i = 0; i < out.length; i++) if (out[i]! >= 0) front.push(i);
  for (let step = 0; step < gap; step++) {
    const next: number[] = [];
    for (const i of front) {
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= w * h || out[j] !== -1 || owner[j] !== -1) continue;
        out[j] = out[i]!;
        next.push(j);
      }
    }
    front = next;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------

function neighbours4(i: number, w: number, h: number): number[] {
  const x = i % w;
  const out: number[] = [];
  if (x > 0) out.push(i - 1);
  if (x < w - 1) out.push(i + 1);
  if (i >= w) out.push(i - w);
  if (i + w < w * h) out.push(i + w);
  return out;
}

function rangeCol(x: number, y0: number, y1: number, w: number): number[] {
  const out: number[] = [];
  for (let y = y0; y <= y1; y++) out.push(y * w + x);
  return out;
}

/** 4-way flood from `seeds` through tiles where `ok`. Seeds must pass `ok` to count. */
function flood(seeds: readonly number[], w: number, h: number, ok: (i: number) => boolean) {
  const seen = new Uint8Array(w * h);
  const out: number[] = [];
  for (const s of seeds) {
    if (!seen[s] && ok(s)) {
      seen[s] = 1;
      out.push(s);
    }
  }
  for (let head = 0; head < out.length; head++) {
    for (const j of neighbours4(out[head]!, w, h)) {
      if (!seen[j] && ok(j)) {
        seen[j] = 1;
        out.push(j);
      }
    }
  }
  return out;
}

/** Tiles in `region` still unlabelled take the label of a labelled neighbour (repeatedly). */
function absorb(label: Int32Array, w: number, h: number, region: (i: number) => boolean): void {
  const queue: number[] = [];
  for (let i = 0; i < w * h; i++) if (region(i) && label[i]! >= 0) queue.push(i);
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    for (const j of neighbours4(i, w, h)) {
      if (region(j) && label[j] === -1) {
        label[j] = label[i]!;
        queue.push(j);
      }
    }
  }
}

/**
 * The cheapest 8-way line of tiles from `starts` to a goal tile: walking across walkable ground
 * costs 1 a tile (that's a crossing), anything else next to nothing, plus a little for straying
 * from the nominal line (`off`). Returns the line's tiles as a mask.
 */
function cheapestLine(
  t: BoardTiles,
  q: {
    allowed: (i: number) => boolean;
    starts: readonly number[];
    isGoal: (i: number) => boolean;
    off: (i: number) => number;
  },
): Uint8Array {
  const { w, h, walk } = t;
  const tune = BLOCK_TUNING.carve;
  const cost = (i: number) => (walk[i] ? 1 : 0) + tune.stepCost + tune.strayCost * q.off(i);
  const dist = new Float64Array(w * h).fill(Infinity);
  const prev = new Int32Array(w * h).fill(-1);
  const heap = new MinHeap();
  for (const s of q.starts) {
    if (!q.allowed(s)) continue;
    const d = cost(s);
    if (d < dist[s]!) {
      dist[s] = d;
      heap.push(d, s);
    }
  }
  let end = -1;
  while (heap.size) {
    const [d, i] = heap.pop();
    if (d > dist[i]!) continue;
    if (q.isGoal(i)) {
      end = i;
      break;
    }
    const x = i % w;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (x + dx < 0 || x + dx >= w) continue;
        const j = i + dy * w + dx;
        if (j < 0 || j >= w * h || !q.allowed(j)) continue;
        const nd = d + cost(j);
        if (nd < dist[j]!) {
          dist[j] = nd;
          prev[j] = i;
          heap.push(nd, j);
        }
      }
    }
  }
  const line = new Uint8Array(w * h);
  for (let i = end; i >= 0; i = prev[i]!) line[i] = 1;
  return line;
}

class MinHeap {
  private d: number[] = [];
  private v: number[] = [];
  get size(): number {
    return this.d.length;
  }
  push(d: number, v: number): void {
    const a = this.d;
    const b = this.v;
    a.push(d);
    b.push(v);
    let k = a.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (a[p]! <= a[k]!) break;
      [a[p], a[k]] = [a[k]!, a[p]!];
      [b[p], b[k]] = [b[k]!, b[p]!];
      k = p;
    }
  }
  pop(): [number, number] {
    const a = this.d;
    const b = this.v;
    const top: [number, number] = [a[0]!, b[0]!];
    const ld = a.pop()!;
    const lv = b.pop()!;
    if (a.length) {
      a[0] = ld;
      b[0] = lv;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let s = k;
        if (l < a.length && a[l]! < a[s]!) s = l;
        if (r < a.length && a[r]! < a[s]!) s = r;
        if (s === k) break;
        [a[s], a[k]] = [a[k]!, a[s]!];
        [b[s], b[k]] = [b[k]!, b[s]!];
        k = s;
      }
    }
    return top;
  }
}
