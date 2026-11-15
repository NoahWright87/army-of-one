/**
 * (PHASE13-d) The random campaign in progress ([D106]): one at a time, in localStorage, plus the
 * links between the title screen, the campaign map and a campaign battle.
 */
import { parseCampaign, type CampaignState } from '../gen/campaign';
import { worldMissionId } from '../gen/mission-id';
import type { GeneratedWorld } from '../gen/world';
import { worldFor } from './editor-storage';

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

export function campaignWorld(c: CampaignState): GeneratedWorld {
  return worldFor(c.seed, c.includeMine);
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

/** A campaign battle: one level of the campaign's world at the campaign's budget. */
export function openCampaignBattle(c: CampaignState, level: number, budget: number): void {
  const url = freshUrl();
  url.searchParams.set('mission', worldMissionId(c.seed, level, budget));
  url.searchParams.set('from', 'campaign');
  if (c.includeMine) url.searchParams.set('pool', 'mine');
  window.location.assign(url.toString());
}
