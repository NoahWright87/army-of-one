/**
 * (PHASE13-d, PHASE14) A random campaign ([D106], [D116]–[D126]): a generated world map, the
 * levels you've taken on it, and what carries over between them.
 *
 * - One level at a time ([D122]): attacking a level makes it the active one, with the settings
 *   it starts with (mission id, budget, money, income, reserves, roles); until it's won it's
 *   the only level you can (re)enter.
 * - Winning it ([D117], [D118]): your balance is the next level's starting money; survivors join
 *   the reserves (free spawns); its rewards unlock roles and add income; its battle time makes
 *   the enemy richer ([D119]).
 * - Level tags ([D121]) are deterministic from the world: Elite enemies, Unlocks: <role>,
 *   Income+.
 * - The campaign keeps copies of your blocks it was made from ([D126]).
 *
 * Pure: storage and page links live in `src/app/campaign-storage.ts`.
 */
import { OFFICIAL_BLOCKS } from '../content/blocks';
import { DIFFICULTY, isDifficulty, type Difficulty } from '../content/difficulty';
import { ROLES, isRoleId } from '../content/roles';
import { BLOCK_TUNING, DEFAULT_TUNING } from '../content/tuning';
import type { RoleId } from '../contracts/mission';
import { createRng, nextFloat } from '../sim/core/rng';
import { TICKS_PER_SECOND, type Tick } from '../sim/core/time';
import { parseBlockObject, type BlockDef } from './block';
import type { GeneratedWorld } from './world';

export const CAMPAIGN_VERSION = 3;

/** A count per role (reserves, survivors). */
export type RoleCounts = Partial<Record<RoleId, number>>;

/** What a level offers or warns about on the campaign map ([D121]). */
export type LevelTag =
  | { kind: 'elite' }
  | { kind: 'income' }
  /** (PHASE17) Tech points for taking it ([D141]). */
  | { kind: 'tech'; n: number };

/** The settings a level was started with ([D122]): fixed until it's won. */
export interface LevelSettings {
  level: number;
  /** The mission id (also its save slot). */
  missionId: string;
  budget: number;
  startMoney: number;
  /** Base income per second in this level (default + the campaign's bonus). */
  incomePerSecond: number;
  reserves: RoleCounts;
  roles: RoleId[];
}

/** How a won level went: for carry-over and the reports ([D124]). */
export interface LevelResult {
  level: number;
  /** Battle time of the win. */
  battleTicks: Tick;
  startMoney: number;
  /** The balance at the win (may be negative: debt, [D54]). */
  endMoney: number;
  /** Income and bounties up to the win. */
  earned: number;
  /** Paid for soldiers up to the win. */
  spent: number;
  /** Soldiers who spawned. */
  spawned: number;
  /** Soldiers dead by the win. */
  lost: number;
  /** Reserves used (free spawns), by role. */
  reservesUsed: RoleCounts;
  /** Soldiers alive at the win (incl. O's never resumed), by role: they become reserves. */
  survivors: RoleCounts;
  /** Filled in when the win is applied: tech points and income gained by taking it. */
  techGained?: number;
  incomeGained?: number;
  /** The settings the level was fought with (so its results and replay keep their money). */
  settings?: LevelSettings;
}

export interface CampaignState {
  version: typeof CAMPAIGN_VERSION;
  /** The world's seed. */
  seed: number;
  /** Whether the world uses your saved blocks as well as the official ones. */
  includeMine: boolean;
  /** (PHASE16) Easy / Normal / Hard ([D134]): fixed once a level has been attacked. */
  difficulty: Difficulty;
  /** Copies of your blocks the world was made from ([D126]); empty without `includeMine`. */
  blocks: BlockDef[];
  /** Levels taken, in the order they were taken. */
  taken: number[];
  /** Money carried into the next level ([D118]). */
  money: number;
  /** Base income per second added by Income+ levels taken ([D118]). */
  incomeBonus: number;
  /** Roles bought so far, besides the starters ([D120], [D141]). */
  unlocked: RoleId[];
  /** (PHASE17) Tech points to buy roles with ([D141]). */
  tech: number;
  /** Free spawns waiting, by role ([D117]). */
  reserves: RoleCounts;
  /** Battle time of the levels taken: the enemy's funds grow with it ([D119]). */
  battleTicks: Tick;
  /** The level being fought ([D122]), or null. */
  active: LevelSettings | null;
  /** Won levels, in order. */
  results: LevelResult[];
  /** Real time played (ms), for the final report ([D124]). */
  realMs: number;
}

export function newCampaign(
  seed: number,
  myBlocks: readonly BlockDef[] = [],
  difficulty: Difficulty = 'normal',
): CampaignState {
  return {
    version: CAMPAIGN_VERSION,
    seed: seed >>> 0,
    includeMine: myBlocks.length > 0,
    difficulty,
    blocks: myBlocks.map((b) => structuredClone(b)),
    taken: [],
    money: DIFFICULTY[difficulty].startMoney,
    incomeBonus: 0,
    unlocked: [],
    tech: 0,
    reserves: {},
    battleTicks: 0,
    active: null,
    results: [],
    realMs: 0,
  };
}

/** The blocks this campaign's world is made from: official + the copies it keeps ([D126]). */
export function campaignBlocks(c: CampaignState): BlockDef[] {
  const official = new Set(OFFICIAL_BLOCKS.map((b) => b.id));
  return [...OFFICIAL_BLOCKS, ...c.blocks.filter((b) => !official.has(b.id))];
}

// ---------- Parsing ----------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isIndex = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

function parseCounts(v: unknown): RoleCounts | null {
  if (!isObj(v)) return null;
  const out: RoleCounts = {};
  for (const [k, n] of Object.entries(v)) {
    if (!isRoleId(k) || !isIndex(n)) return null;
    if (n > 0) out[k] = n;
  }
  return out;
}

function parseRoles(v: unknown): RoleId[] | null {
  return Array.isArray(v) && v.every(isRoleId) ? [...new Set(v)] : null;
}

function parseSettings(v: unknown): LevelSettings | null {
  if (!isObj(v)) return null;
  const reserves = parseCounts(v.reserves);
  const roles = parseRoles(v.roles);
  if (
    !isIndex(v.level) ||
    typeof v.missionId !== 'string' ||
    !isNum(v.budget) ||
    !isNum(v.startMoney) ||
    !isNum(v.incomePerSecond) ||
    !reserves ||
    !roles
  ) {
    return null;
  }
  return {
    level: v.level,
    missionId: v.missionId,
    budget: v.budget,
    startMoney: v.startMoney,
    incomePerSecond: v.incomePerSecond,
    reserves,
    roles,
  };
}

function parseResult(v: unknown): LevelResult | null {
  if (!isObj(v)) return null;
  const used = parseCounts(v.reservesUsed);
  const survivors = parseCounts(v.survivors);
  const nums = ['battleTicks', 'startMoney', 'endMoney', 'earned', 'spent', 'spawned', 'lost'];
  if (!isIndex(v.level) || !used || !survivors || !nums.every((k) => isNum(v[k]))) return null;
  const out: LevelResult = {
    level: v.level,
    battleTicks: v.battleTicks as number,
    startMoney: v.startMoney as number,
    endMoney: v.endMoney as number,
    earned: v.earned as number,
    spent: v.spent as number,
    spawned: v.spawned as number,
    lost: v.lost as number,
    reservesUsed: used,
    survivors,
  };
  if (isNum(v.techGained)) out.techGained = v.techGained;
  if (isNum(v.incomeGained)) out.incomeGained = v.incomeGained;
  const settings = v.settings === undefined ? null : parseSettings(v.settings);
  if (settings) out.settings = settings;
  return out;
}

/**
 * A stored campaign, or null if it isn't one. Older versions (PHASE13-d's v2 kept no money,
 * reserves or block copies) are dropped: the title screen offers a new campaign.
 */
export function parseCampaign(raw: unknown): CampaignState | null {
  if (!isObj(raw)) return null;
  const o = raw;
  if (o.version !== CAMPAIGN_VERSION || !isNum(o.seed)) return null;
  if (!Array.isArray(o.taken) || !o.taken.every(isIndex)) return null;
  if (!Array.isArray(o.blocks) || !Array.isArray(o.results)) return null;
  const blocks: BlockDef[] = [];
  for (const b of o.blocks) {
    const r = parseBlockObject(b);
    if (!r.ok) return null;
    blocks.push(r.block);
  }
  const results = o.results.map(parseResult);
  if (results.some((r) => r === null)) return null;
  const reserves = parseCounts(o.reserves);
  const unlocked = parseRoles(o.unlocked);
  const active = o.active === null ? null : parseSettings(o.active);
  if (!reserves || !unlocked || (o.active !== null && !active)) return null;
  if (!isNum(o.money) || !isNum(o.incomeBonus) || !isNum(o.battleTicks)) return null;
  return {
    version: CAMPAIGN_VERSION,
    seed: o.seed >>> 0,
    includeMine: o.includeMine === true,
    // Absent in campaigns saved before PHASE16: Normal.
    difficulty: isDifficulty(o.difficulty) ? o.difficulty : 'normal',
    blocks,
    taken: [...new Set(o.taken)],
    money: o.money,
    incomeBonus: o.incomeBonus,
    unlocked,
    tech: isNum(o.tech) ? o.tech : 0,
    reserves,
    battleTicks: o.battleTicks,
    active,
    results: results as LevelResult[],
    realMs: isNum(o.realMs) ? o.realMs : 0,
  };
}

// ---------- The map ----------

/** The level holding the enemy HQ. */
export function hqLevel(world: GeneratedWorld): number {
  return world.hq;
}

/**
 * Levels you can attack now ([D107]): not taken, with a crossing from ground you hold (the start
 * edge or a level taken), from any side. While a level is active only it ([D122]). Empty once
 * the campaign is won.
 */
export function attackable(world: GeneratedWorld, state: CampaignState): number[] {
  if (campaignWon(world, state)) return [];
  if (state.active) return [state.active.level];
  return reachableNow(world, state);
}

/** Levels with a crossing from held ground (whatever is active). */
function reachableNow(world: GeneratedWorld, state: CampaignState): number[] {
  const held = (lv: number) => lv === -1 || state.taken.includes(lv);
  const open = new Set<number>();
  for (const c of world.crossings) {
    if (held(c.a) && !held(c.b)) open.add(c.b);
    if (held(c.b) && !held(c.a)) open.add(c.a);
  }
  return [...open].sort((p, q) => p - q);
}

/** The levels you hold, as a set (for a level's entries and exits). */
export function heldSet(state: CampaignState): Set<number> {
  return new Set(state.taken);
}

export function campaignWon(world: GeneratedWorld, state: CampaignState): boolean {
  return state.taken.includes(hqLevel(world));
}

/** Roles open now ([D120]): the starters + every unlocked one, in the roster's order. */
export function openRoles(state: CampaignState): RoleId[] {
  const open = new Set<RoleId>([...BLOCK_TUNING.campaign.starterRoles, ...state.unlocked]);
  return ROLES.map((r) => r.id).filter((id) => open.has(id));
}

/** Roles a campaign starts without: each is bought with tech points ([D120], [D141]). */
export function lockedRoles(): RoleId[] {
  const starters = new Set<RoleId>(BLOCK_TUNING.campaign.starterRoles);
  return ROLES.filter((r) => !starters.has(r.id)).map((r) => r.id);
}

// ---------- Tags ([D121]) ----------

const tagCache = new WeakMap<GeneratedWorld, LevelTag[][]>();

/**
 * Each level's tags, deterministic from the world. Unlocks go to levels off the way to the HQ,
 * dearer roles further out and on dead ends; Income+ to other off-route levels; Elite enemies
 * on levels with the best rewards, plus a few at random. The HQ has none.
 */
export function levelTags(world: GeneratedWorld): LevelTag[][] {
  const hit = tagCache.get(world);
  if (hit) return hit;
  const t = BLOCK_TUNING.campaign;
  const n = world.levels.length;
  const tags: LevelTag[][] = world.levels.map(() => []);
  const rng = createRng((world.seed ^ 0x5eed7a65) >>> 0);
  const g = levelGraph(world);
  const route = new Set(g.route);

  // Reachable non-HQ levels, off the route first; "remote" = far and with few neighbours.
  const remote = (lv: number) => g.dist[lv]! + (g.degree[lv]! <= 1 ? 3 : 0);
  const cands = world.levels
    .map((l) => l.index)
    .filter((lv) => lv !== world.hq && g.dist[lv]! >= 0)
    .map((lv) => ({ lv, off: !route.has(lv), score: remote(lv) + nextFloat(rng) * 0.5 }))
    .sort((a, b) => Number(b.off) - Number(a.off) || a.score - b.score || a.lv - b.lv);
  const offRoute = cands.filter((c) => c.off);

  // Income+: the most remote off-route levels.
  const income = [...(offRoute.length ? offRoute : cands)]
    .sort((a, b) => b.score - a.score || a.lv - b.lv)
    .slice(0, t.incomeLevels);
  for (const c of income) tags[c.lv]!.push({ kind: 'income' });

  // Elite: Income+ levels, dead ends off the route, breached walled bases ([D143]), and a few
  // others past the first band at random.
  const fortress = new Set<number>();
  for (const [y, x] of world.fortresses ?? []) {
    const lv = world.owner[y * world.tiles.w + x] ?? -1;
    if (lv >= 0) fortress.add(lv);
  }
  const deadEnd = (lv: number) => !route.has(lv) && g.degree[lv]! <= 1;
  for (let lv = 0; lv < n; lv++) {
    if (lv === world.hq) continue;
    const big = tags[lv]!.some((x) => x.kind === 'income') || deadEnd(lv) || fortress.has(lv);
    const firstBand = world.levels[lv]!.band === 0;
    if (big || (!firstBand && nextFloat(rng) < t.eliteShare)) tags[lv]!.unshift({ kind: 'elite' });
  }
  // (PHASE17) Tech points for taking a level ([D141]): more at dead ends and elite levels.
  for (let lv = 0; lv < n; lv++) {
    if (g.dist[lv]! < 0) continue;
    const elite = tags[lv]!.some((x) => x.kind === 'elite');
    const pts = t.techBase + (deadEnd(lv) ? t.techDeadEnd : 0) + (elite ? t.techElite : 0);
    if (pts > 0) tags[lv]!.push({ kind: 'tech', n: pts });
  }
  tagCache.set(world, tags);
  return tags;
}

export function isElite(world: GeneratedWorld, index: number): boolean {
  return (levelTags(world)[index] ?? []).some((x) => x.kind === 'elite');
}

/** The levels as a graph: steps from the start, neighbour counts, and a shortest way to the HQ. */
export function levelGraph(world: GeneratedWorld): {
  dist: number[];
  degree: number[];
  route: number[];
} {
  const n = world.levels.length;
  const next: Set<number>[] = Array.from({ length: n + 1 }, () => new Set<number>());
  const node = (lv: number) => (lv < 0 ? n : lv); // the start is node n
  for (const c of world.crossings) {
    if (c.a === c.b) continue;
    next[node(c.a)]!.add(node(c.b));
    next[node(c.b)]!.add(node(c.a));
  }
  const dist = new Array<number>(n + 1).fill(-1);
  const prev = new Array<number>(n + 1).fill(-1);
  dist[n] = 0;
  const queue = [n];
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i]!;
    for (const nb of [...next[at]!].sort((p, q) => p - q)) {
      if (dist[nb]! >= 0) continue;
      dist[nb] = dist[at]! + 1;
      prev[nb] = at;
      queue.push(nb);
    }
  }
  const route: number[] = [];
  if (dist[world.hq]! >= 0) {
    for (let at = world.hq; at !== n && at >= 0; at = prev[at]!) route.unshift(at);
  }
  const degree = next.slice(0, n).map((s) => [...s].filter((x) => x !== n).length);
  return { dist: dist.slice(0, n), degree, route };
}

// ---------- Enemy funds ([D119], [Q60]) ----------

/** How far the enemy's funds have grown: 0 at the start, 1 when every level is full. */
export function enemyGrowth(state: Pick<CampaignState, 'battleTicks'>): number {
  const minutes = state.battleTicks / TICKS_PER_SECOND / 60;
  return Math.min(1, minutes / BLOCK_TUNING.campaign.minutesToFull);
}

/** A level's enemy budget now: from its own toward full with battle time, × Elite, ≤ full. */
export function campaignBudget(world: GeneratedWorld, state: CampaignState, index: number): number {
  const lv = world.levels[index];
  if (!lv) return 0;
  const own = Math.min(lv.budget, lv.maxBudget);
  let b = own + (lv.maxBudget - own) * enemyGrowth(state);
  if (isElite(world, index)) b *= BLOCK_TUNING.campaign.eliteBudget;
  b *= DIFFICULTY[state.difficulty].budget; // (PHASE16) [D134]
  return Math.round(Math.min(lv.maxBudget, b));
}

// ---------- Starting and winning a level ----------

/** The settings a mission of this campaign was (or is being) fought with, if it's one of them. */
export function settingsFor(state: CampaignState, missionId: string): LevelSettings | null {
  if (state.active?.missionId === missionId) return state.active;
  return state.results.find((r) => r.settings?.missionId === missionId)?.settings ?? null;
}

/** The settings a level starts with now ([D118], [D120], [D117]). */
export function levelSettings(
  world: GeneratedWorld,
  state: CampaignState,
  index: number,
  missionId: string,
): LevelSettings {
  return {
    level: index,
    missionId,
    budget: campaignBudget(world, state, index),
    startMoney: Math.max(0, Math.floor(state.money)),
    incomePerSecond: DEFAULT_TUNING.economy.baseIncomePerSecond + state.incomeBonus,
    reserves: { ...state.reserves },
    roles: openRoles(state),
  };
}

/**
 * Makes a level the active one ([D122]). No change if another level is active or this one
 * can't be attacked; the same level keeps the settings it started with.
 */
export function startLevel(
  world: GeneratedWorld,
  state: CampaignState,
  settings: LevelSettings,
): CampaignState {
  if (state.active) return state;
  if (!reachableNow(world, state).includes(settings.level)) return state;
  if (campaignWon(world, state)) return state;
  return { ...state, active: settings };
}

/**
 * The campaign after winning the active level ([D117], [D118], [D119]). No change if `result`
 * isn't for the active level (a reload of a won level's results, say).
 */
export function finishLevel(
  world: GeneratedWorld,
  state: CampaignState,
  result: LevelResult,
): CampaignState {
  const active = state.active;
  if (!active || active.level !== result.level || state.taken.includes(result.level)) return state;
  const tags = levelTags(world)[result.level] ?? [];
  const techGained = tags.reduce((n, x) => n + (x.kind === 'tech' ? x.n : 0), 0);
  const incomeGained = tags.some((x) => x.kind === 'income')
    ? BLOCK_TUNING.campaign.incomeBonus
    : 0;
  // Reserves: what was waiting, minus those used here, plus everyone who survived.
  const reserves: RoleCounts = {};
  for (const r of ROLES) {
    const n =
      (state.reserves[r.id] ?? 0) -
      (result.reservesUsed[r.id] ?? 0) +
      (result.survivors[r.id] ?? 0);
    if (n > 0) reserves[r.id] = n;
  }
  return {
    ...state,
    taken: [...state.taken, result.level],
    money: Math.max(0, Math.floor(result.endMoney)),
    incomeBonus: state.incomeBonus + incomeGained,
    tech: state.tech + techGained,
    reserves,
    battleTicks: state.battleTicks + result.battleTicks,
    active: null,
    results: [...state.results, { ...result, techGained, incomeGained, settings: active }],
  };
}

/** The level taken without a battle (tests, dev tools): an empty result. */
export function takeLevel(
  world: GeneratedWorld,
  state: CampaignState,
  index: number,
  battleTicks: Tick = 0,
): CampaignState {
  if (!world.levels[index] || state.taken.includes(index)) return state;
  const s = state.active ? state : startLevel(world, state, levelSettings(world, state, index, ''));
  if (!s.active || s.active.level !== index) return state;
  return finishLevel(world, s, {
    level: index,
    battleTicks,
    startMoney: s.active.startMoney,
    endMoney: s.active.startMoney,
    earned: 0,
    spent: 0,
    spawned: 0,
    lost: 0,
    reservesUsed: {},
    survivors: {},
  });
}

/**
 * (PHASE16) The campaign on another difficulty ([D134]): only before any level is attacked
 * (it changes the levels' budgets); else unchanged.
 */
export function withDifficulty(state: CampaignState, difficulty: Difficulty): CampaignState {
  if (state.active || state.taken.length > 0 || state.difficulty === difficulty) return state;
  return { ...state, difficulty, money: DIFFICULTY[difficulty].startMoney };
}

/** (PHASE16) Whether the difficulty can still be changed ([D134]). */
export function difficultyOpen(state: CampaignState): boolean {
  return !state.active && state.taken.length === 0;
}

/** (PHASE17) What a role costs in tech points ([D141]); 0 for the starters. */
export function roleTechCost(role: RoleId): number {
  return (BLOCK_TUNING.campaign.roleTech as Partial<Record<RoleId, number>>)[role] ?? 0;
}

/** (PHASE17) Buys a locked role with tech points ([D141]); unchanged if it can't. */
export function buyRole(state: CampaignState, role: RoleId): CampaignState {
  if (openRoles(state).includes(role)) return state;
  const cost = roleTechCost(role);
  if (cost <= 0 || state.tech < cost) return state;
  return { ...state, tech: state.tech - cost, unlocked: [...state.unlocked, role] };
}
