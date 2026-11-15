/**
 * (PHASE13-d) A random campaign ([D106]): a generated world map and the levels you've taken on
 * it. You attack a level that borders the start or a level you hold (from the south: levels
 * are played attacking north), and each level taken raises the next ones' enemy budgets. Taking
 * the enemy HQ's level wins the campaign. No other state carries over yet ([D91]).
 */
import { BLOCK_TUNING } from '../content/tuning';
import type { GeneratedWorld, WorldLevel } from './world';

export const CAMPAIGN_VERSION = 1;

export interface CampaignState {
  version: typeof CAMPAIGN_VERSION;
  /** The world's seed. */
  seed: number;
  /** Whether the world uses your saved blocks as well as the official ones. */
  includeMine: boolean;
  /** Levels taken, in the order they were taken. */
  taken: number[];
}

export function newCampaign(seed: number, includeMine: boolean): CampaignState {
  return { version: CAMPAIGN_VERSION, seed: seed >>> 0, includeMine, taken: [] };
}

/** A stored campaign, or null if it isn't one. */
export function parseCampaign(raw: unknown): CampaignState | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== CAMPAIGN_VERSION || typeof o.seed !== 'number') return null;
  if (!Array.isArray(o.taken) || !o.taken.every((n) => Number.isInteger(n) && n >= 0)) return null;
  return {
    version: CAMPAIGN_VERSION,
    seed: o.seed >>> 0,
    includeMine: o.includeMine !== false,
    taken: [...new Set(o.taken as number[])],
  };
}

/** The level holding the enemy HQ block (the top row's HQ; else the top-left base level). */
export function hqLevel(world: GeneratedWorld): number {
  const row = world.grid[0] ?? [];
  let col = row.findIndex((g) => g.block.role === 'hq');
  if (col < 0)
    col = Math.max(
      0,
      row.findIndex((g) => g.side === 'enemy'),
    );
  const lv = world.levels.find((l) => l.row === 0 && col >= l.col && col < l.col + l.cols);
  return lv?.index ?? world.levels.length - 1;
}

/** Whether `a` sits directly north of `b` (touching, with columns in common). */
function northOf(a: WorldLevel, b: WorldLevel): boolean {
  return a.row + a.rows === b.row && a.col < b.col + b.cols && b.col < a.col + a.cols;
}

/**
 * Levels you can attack now: not taken, and either in the first band (they border the start)
 * or directly north of a level you hold. Empty once the campaign is won.
 */
export function attackable(world: GeneratedWorld, state: CampaignState): number[] {
  if (campaignWon(world, state)) return [];
  const held = world.levels.filter((l) => state.taken.includes(l.index));
  return world.levels
    .filter((l) => !state.taken.includes(l.index))
    .filter((l) => l.row + l.rows === world.rows || held.some((h) => northOf(l, h)))
    .map((l) => l.index);
}

/** A level's enemy budget in this campaign: its own, raised per level taken, capped at all. */
export function campaignBudget(world: GeneratedWorld, state: CampaignState, index: number): number {
  const lv = world.levels[index];
  if (!lv) return 0;
  const k = 1 + BLOCK_TUNING.campaign.budgetGrowthPerLevel * state.taken.length;
  return Math.round(Math.min(lv.maxBudget, lv.budget * k));
}

/** The campaign after winning level `index` (no change if it's taken or out of range). */
export function takeLevel(
  world: GeneratedWorld,
  state: CampaignState,
  index: number,
): CampaignState {
  if (!world.levels[index] || state.taken.includes(index)) return state;
  return { ...state, taken: [...state.taken, index] };
}

export function campaignWon(world: GeneratedWorld, state: CampaignState): boolean {
  return state.taken.includes(hqLevel(world));
}
