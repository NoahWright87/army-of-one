/**
 * (PHASE17) The dev arena ([D142]): a TABS-style balance test. Two sides of AI soldiers (roles and
 * counts), each with a skill preset (HUMAN = the player's stats with no AI handicaps, or the CPU
 * at a difficulty), barriers switched on per side at fixed spots, and GO. Both sides walk to the middle and fight
 * until one side is gone. `runArena` plays it headless; `runArenaBatch` repeats it with the
 * formations jittered for win rates. Pure and deterministic.
 */
import { DIFFICULTY } from '../content/difficulty';
import { ROLES } from '../content/roles';
import { DEFAULT_TUNING, withTuning, type Tuning } from '../content/tuning';
import type { RoleId } from '../contracts/mission';
import { createRng, nextFloat } from '../sim/core/rng';
import { secondsToTicks, type Tick } from '../sim/core/time';
import type { Vec2 } from '../sim/core/vec';
import { createWorld, step, type World } from '../sim/sim';
import {
  borderWalls,
  type CoverDef,
  type CoverMaterial,
  type MapDef,
  type Rect,
  type SquadDef,
} from '../sim/world/map';

export type ArenaPreset = 'human' | 'easy' | 'normal' | 'hard';
export const ARENA_PRESETS: readonly ArenaPreset[] = ['human', 'easy', 'normal', 'hard'];

export interface ArenaSide {
  preset: ArenaPreset;
  units: Partial<Record<RoleId, number>>;
}

/** A placed piece: cover of a material, or a rock (a solid wall). */
export interface ArenaPiece {
  kind: CoverMaterial | 'rock';
  x: number;
  y: number;
  /** Long side along y instead of x. */
  vertical?: boolean;
}

/** Which halves of the field a kind of barrier is on. */
export type BarrierSides = 'none' | 'left' | 'right' | 'both';
export const BARRIER_SIDES: readonly BarrierSides[] = ['none', 'left', 'right', 'both'];
export const BARRIER_KINDS: readonly ArenaPiece['kind'][] = [
  'sandbags',
  'crate',
  'fence',
  'halfWall',
  'rock',
];

export interface ArenaConfig {
  left: ArenaSide;
  right: ArenaSide;
  /** Each kind of barrier, on neither, one or both halves (at its fixed spots). */
  barriers: Partial<Record<ArenaPiece['kind'], BarrierSides>>;
}

/**
 * Fixed spots for each kind of barrier on the left half (the right half mirrors them), laid out
 * so none overlap each other or the starting formations.
 */
export const BARRIER_SPOTS: Readonly<Record<ArenaPiece['kind'], readonly ArenaPiece[]>> = {
  sandbags: [
    { kind: 'sandbags', x: 480, y: 380, vertical: true },
    { kind: 'sandbags', x: 480, y: 620, vertical: true },
  ],
  crate: [
    { kind: 'crate', x: 560, y: 250 },
    { kind: 'crate', x: 560, y: 750 },
  ],
  fence: [
    { kind: 'fence', x: 640, y: 150, vertical: true },
    { kind: 'fence', x: 640, y: 850, vertical: true },
  ],
  halfWall: [
    { kind: 'halfWall', x: 420, y: 180, vertical: true },
    { kind: 'halfWall', x: 420, y: 820, vertical: true },
  ],
  rock: [
    { kind: 'rock', x: 700, y: 320 },
    { kind: 'rock', x: 700, y: 680 },
  ],
  window: [],
  bunkerWindow: [],
};

/** The barrier pieces a setup puts on the field. */
export function arenaPieces(cfg: ArenaConfig): ArenaPiece[] {
  const out: ArenaPiece[] = [];
  for (const kind of BARRIER_KINDS) {
    const sides = cfg.barriers?.[kind] ?? 'none';
    for (const p of BARRIER_SPOTS[kind]) {
      if (sides === 'left' || sides === 'both') out.push(p);
      if (sides === 'right' || sides === 'both') out.push({ ...p, x: ARENA_W - p.x });
    }
  }
  return out;
}

/** A stored setup, or the defaults for anything missing (old setups had hand-placed pieces). */
export function parseArenaConfig(raw: unknown, fallback: ArenaConfig): ArenaConfig {
  if (!raw || typeof raw !== 'object') return fallback;
  const o = raw as Partial<ArenaConfig>;
  const side = (s: unknown, d: ArenaSide): ArenaSide =>
    s && typeof s === 'object' && 'preset' in s && 'units' in s ? (s as ArenaSide) : d;
  const barriers: ArenaConfig['barriers'] = {};
  for (const k of BARRIER_KINDS) {
    const v = (o.barriers as Record<string, unknown> | undefined)?.[k];
    if (BARRIER_SIDES.includes(v as BarrierSides)) barriers[k] = v as BarrierSides;
  }
  return { left: side(o.left, fallback.left), right: side(o.right, fallback.right), barriers };
}

export const ARENA_W = 1600;
export const ARENA_H = 1000;
/** Most soldiers per side. */
export const ARENA_MAX_PER_SIDE = 40;

/**
 * The AI skill for a preset. HUMAN: the player's stats, no AI handicaps (sees as far as the
 * screen, reacts like a person, aims straight, no burst pauses). CPU: the difficulty's tuning.
 */
export function presetSkill(p: ArenaPreset): Partial<Tuning['ai']> {
  if (p === 'human') {
    return {
      sightRange: 900, // TUNE: about what a player sees on screen
      reactionSeconds: 0.25, // TUNE: a person's reaction
      aimError: 0,
      distanceAimError: 0,
      burstPauseSeconds: 0,
    };
  }
  return { ...(DIFFICULTY[p].tuning.ai ?? {}) };
}

/** The arena's world tuning: everyone awake from the start. */
export function arenaTuning(base: Tuning = DEFAULT_TUNING): Tuning {
  return withTuning(base, { ai: { enabled: true, wakeRadius: 5000, sleepRadius: 6000 } });
}

export const PIECE_SIZE: Readonly<Record<ArenaPiece['kind'], { w: number; h: number }>> = {
  sandbags: { w: 90, h: 22 },
  crate: { w: 44, h: 44 },
  fence: { w: 120, h: 10 },
  halfWall: { w: 120, h: 18 },
  window: { w: 60, h: 18 },
  bunkerWindow: { w: 60, h: 24 },
  rock: { w: 70, h: 70 },
};

function pieceRect(p: ArenaPiece): Rect {
  const s = PIECE_SIZE[p.kind];
  const w = p.vertical ? s.h : s.w;
  const h = p.vertical ? s.w : s.h;
  return { x: p.x - w / 2, y: p.y - h / 2, w, h };
}

/** Grid positions for `n` soldiers in a block centred at x, facing the other side. */
function formation(n: number, cx: number, rng: ReturnType<typeof createRng>): Vec2[] {
  const rows = Math.max(1, Math.ceil(Math.sqrt(n * 1.6)));
  const cols = Math.ceil(n / rows);
  const gap = 46;
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const c = Math.floor(i / rows);
    const r = i % rows;
    out.push({
      x: cx + (c - (cols - 1) / 2) * gap + (nextFloat(rng) - 0.5) * 16,
      y: ARENA_H / 2 + (r - (rows - 1) / 2) * gap + (nextFloat(rng) - 0.5) * 16,
    });
  }
  return out;
}

/** The arena's map: an open field, the pieces, and one squad per side (formations jittered by seed). */
export function arenaMap(cfg: ArenaConfig, seed = 0): MapDef {
  const rng = createRng(seed >>> 0);
  const centre = { x: ARENA_W / 2, y: ARENA_H / 2 };
  const squad = (side: 'left' | 'right'): SquadDef | null => {
    const s = cfg[side];
    const roles: RoleId[] = [];
    for (const r of ROLES) for (let k = 0; k < (s.units[r.id] ?? 0); k++) roles.push(r.id);
    const list = roles.slice(0, ARENA_MAX_PER_SIDE);
    if (list.length === 0) return null;
    const at = formation(list.length, side === 'left' ? 260 : ARENA_W - 260, rng);
    return {
      id: side,
      ...(side === 'left' ? { team: 'player' as const } : {}),
      skill: presetSkill(s.preset),
      members: list.map((role, i) => ({
        role,
        position: at[i]!,
        facing: side === 'left' ? 0 : Math.PI,
      })),
      order: { kind: 'guard' },
      // Both sides head for the middle and meet there.
      rally: [centre, { x: centre.x, y: centre.y - 160 }, { x: centre.x, y: centre.y + 160 }],
    };
  };
  const cover: CoverDef[] = [];
  const walls: Rect[] = [...borderWalls(ARENA_W, ARENA_H)];
  arenaPieces(cfg).forEach((p, i) => {
    if (p.kind === 'rock') walls.push(pieceRect(p));
    else cover.push({ id: `piece-${i}`, rect: pieceRect(p), material: p.kind });
  });
  return {
    id: 'dev-arena',
    nameKey: 'arena.title',
    width: ARENA_W,
    height: ARENA_H,
    walls,
    water: [],
    cover,
    // Unused (nobody deploys here), but every map has one.
    spawnPoints: [
      {
        id: 'arena',
        nameKey: 'arena.title',
        position: { x: 40, y: 40 },
        facing: 0,
        kind: 'initial',
      },
    ],
    // Which side spawns (and so acts) first alternates with the seed: no first-mover bias.
    squads: (seed % 2 ? [squad('right'), squad('left')] : [squad('left'), squad('right')]).filter(
      (q): q is SquadDef => q !== null,
    ),
    aiSeed: seed >>> 0,
  };
}

export interface ArenaState {
  /** Alive soldiers per side. */
  left: number;
  right: number;
  /** 'left' / 'right' once one side is gone, 'draw' if both are (or time ran out). */
  winner: 'left' | 'right' | 'draw' | null;
  tick: Tick;
}

export function arenaState(world: World, maxTicks: Tick = secondsToTicks(180)): ArenaState {
  let left = 0;
  let right = 0;
  for (const s of world.state.soldiers) {
    if (!s.alive || !s.ai) continue;
    if (s.team === 'enemy') right++;
    else left++;
  }
  const tick = world.state.tick;
  const winner =
    left === 0 && right === 0
      ? 'draw'
      : left === 0
        ? 'right'
        : right === 0
          ? 'left'
          : tick >= maxTicks
            ? 'draw'
            : null;
  return { left, right, winner, tick };
}

export function createArenaWorld(cfg: ArenaConfig, seed = 0, base?: Tuning): World {
  const w = createWorld(arenaMap(cfg, seed), arenaTuning(base));
  // Everyone awake and thinking from the first tick: no staggered wake-ups.
  for (const s of w.state.soldiers) {
    if (!s.ai) continue;
    s.ai.awake = true;
    s.ai.nextThink = 0;
  }
  return w;
}

/**
 * One arena tick. Before it, every soldier with no target knows where the nearest enemy is (a
 * radar: the arena is about the fight, not finding each other), so both sides move in at once
 * and the AI's own sight takes over once they meet.
 */
export function arenaStep(world: World): void {
  const st = world.state;
  for (const s of st.soldiers) {
    if (!s.ai || !s.alive || s.ai.targetId) continue;
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (const o of st.soldiers) {
      if (!o.alive || !o.ai || o.team === s.team) continue;
      const d = (o.x - s.x) ** 2 + (o.y - s.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    if (best) s.ai.lastSeen = { x: best.x, y: best.y, tick: st.tick };
  }
  step(world, NO_INPUT);
}

const NO_INPUT = new Map();

/** Plays one arena fight headless to the end (or `maxTicks`, a draw). */
export function runArena(cfg: ArenaConfig, seed = 0, maxTicks = secondsToTicks(180)): ArenaState {
  const w = createArenaWorld(cfg, seed);
  for (;;) {
    const st = arenaState(w, maxTicks);
    if (st.winner) return st;
    arenaStep(w);
  }
}

export interface ArenaBatch {
  runs: number;
  left: number;
  right: number;
  draws: number;
  /** Mean battle time of a fight, seconds. */
  meanSeconds: number;
  /** Mean survivors of the winning side. */
  meanSurvivors: number;
}

/** `runs` fights with the formations jittered by seed: win rates. */
export function runArenaBatch(cfg: ArenaConfig, runs: number, firstSeed = 1): ArenaBatch {
  const out: ArenaBatch = { runs, left: 0, right: 0, draws: 0, meanSeconds: 0, meanSurvivors: 0 };
  let survivors = 0;
  let wins = 0;
  for (let k = 0; k < runs; k++) {
    const r = runArena(cfg, firstSeed + k);
    if (r.winner === 'left') out.left++;
    else if (r.winner === 'right') out.right++;
    else out.draws++;
    out.meanSeconds += r.tick / 60 / runs;
    if (r.winner === 'left' || r.winner === 'right') {
      survivors += r.winner === 'left' ? r.left : r.right;
      wins++;
    }
  }
  out.meanSurvivors = wins ? survivors / wins : 0;
  return out;
}
