/**
 * (PHASE13-d) A random campaign ([D106]): a generated world map and the levels you've taken on
 * it. You attack a level with a crossing from the start or a level you hold, from any side
 * ([D107]), and each level taken raises the next ones' enemy budgets. Taking
 * the enemy HQ's level wins the campaign. No other state carries over yet ([D91]).
 */
import { BLOCK_TUNING } from '../content/tuning';
import type { GeneratedWorld } from './world';

export const CAMPAIGN_VERSION = 2;

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

/** The level holding the enemy HQ. */
export function hqLevel(world: GeneratedWorld): number {
  return world.hq;
}

/**
 * Levels you can attack now ([D107]): not taken, with a crossing from ground you hold (the start
 * edge or a level taken), from any side. Empty once the campaign is won.
 */
export function attackable(world: GeneratedWorld, state: CampaignState): number[] {
  if (campaignWon(world, state)) return [];
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
