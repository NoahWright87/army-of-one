/**
 * (PHASE13-d, PHASE14) The random campaign in progress ([D106], [D125]): one at a time, in
 * localStorage, plus the links between the title screen, the campaign map and a campaign battle.
 */
import {
  campaignBlocks,
  heldSet,
  levelSettings,
  newCampaign,
  parseCampaign,
  startLevel,
  type CampaignState,
  type LevelSettings,
} from '../gen/campaign';
import { generateWorld, type GeneratedWorld } from '../gen/world';
import type { MapDef } from '../sim/world/map';
import { generationPool, worldFor, worldLevelMissionId } from './editor-storage';
import { OFFICIAL_BLOCKS } from '../content/blocks';

/** v1 held PHASE13-d's campaigns; v3 state is parsed by `parseCampaign` (older ones dropped). */
const CAMPAIGN_KEY = 'army-of-one.campaign.v1';
/** The world viewer's "Use my saved blocks too" (a new campaign follows it). */
const INCLUDE_MINE_KEY = 'army-of-one.world.includeMine';

export function readCampaign(): CampaignState | null {
  try {
    const raw = window.localStorage.getItem(CAMPAIGN_KEY);
    return raw ? parseCampaign(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeCampaign(c: CampaignState): void {
  try {
    window.localStorage.setItem(CAMPAIGN_KEY, JSON.stringify(c));
  } catch {
    // No storage (private mode): the campaign lasts this page only.
  }
}

/** Whether new campaigns use your saved blocks as well as the official ones. */
export function campaignIncludesMine(): boolean {
  try {
    return window.localStorage.getItem(INCLUDE_MINE_KEY) === 'true';
  } catch {
    return false;
  }
}

/** A new campaign on a random seed, keeping copies of your blocks if it uses them ([D126]). */
export function createCampaign(): CampaignState {
  const official = new Set(OFFICIAL_BLOCKS.map((b) => b.id));
  const mine = campaignIncludesMine() ? generationPool().filter((b) => !official.has(b.id)) : [];
  const c = newCampaign(Math.floor(Math.random() * 1e9), mine);
  writeCampaign(c);
  return c;
}

/** The campaign's world, from the blocks it keeps (cached). */
const worlds = new Map<string, GeneratedWorld>();
export function campaignWorld(c: CampaignState): GeneratedWorld {
  if (!c.includeMine) return worldFor(c.seed, false);
  const key = `${c.seed}:${c.blocks.map((b) => b.id).join(',')}`;
  let w = worlds.get(key);
  if (!w) {
    w = generateWorld(campaignBlocks(c), { seed: c.seed });
    worlds.set(key, w);
  }
  return w;
}

/**
 * (PHASE14) A campaign level's map with its campaign settings ([D117], [D118], [D120]): the
 * starting money and income it was started with, the reserves and the open roles.
 */
export function applyLevelSettings(map: MapDef, s: LevelSettings): MapDef {
  return {
    ...map,
    economy: {
      ...map.economy,
      startMoney: s.startMoney,
      baseIncomePerSecond: s.incomePerSecond,
      reserves: { ...s.reserves },
    },
    roles: [...s.roles],
  };
}

/** A fresh URL for another page of the game (keeps only `dev`). */
function freshUrl(): URL {
  const url = new URL(window.location.href);
  const dev = url.searchParams.get('dev');
  url.search = '';
  if (dev) url.searchParams.set('dev', dev);
  url.hash = '';
  return url;
}

/** The main menu. */
export function openMainMenu(): void {
  window.location.assign(freshUrl().toString());
}

/** `?scene=campaign`: the campaign map. */
export function openCampaignMap(): void {
  const url = freshUrl();
  url.searchParams.set('scene', 'campaign');
  window.location.assign(url.toString());
}

/**
 * Attacks a level ([D122]): it becomes the active level with the settings it starts with now,
 * or, if it's already active, resumes it as it was started. Does nothing if it can't be.
 */
export function prepareCampaignBattle(c: CampaignState, level: number): URL | null {
  let state = c;
  if (!state.active) {
    const world = campaignWorld(state);
    const budget = levelSettings(world, state, level, '').budget;
    const id = worldLevelMissionId(world, level, budget, heldSet(state));
    state = startLevel(world, state, levelSettings(world, state, level, id));
    writeCampaign(state);
  }
  if (state.active?.level !== level) return null;
  const url = freshUrl();
  url.searchParams.set('mission', state.active.missionId);
  url.searchParams.set('from', 'campaign');
  return url;
}
