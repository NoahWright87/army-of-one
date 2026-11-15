/**
 * (PHASE13-d) `?scene=campaign`: the campaign map ([D106]). No Phaser. Starts a campaign if
 * there's none (a random seed); Attack opens that level's battle (`from=campaign`), and winning
 * it brings you back here with the level taken (app/main.ts).
 */
import { BLOCK_TUNING } from '../content/tuning';
import { str } from '../content/strings';
import {
  attackable,
  campaignBudget,
  campaignWon,
  hqLevel,
  newCampaign,
  type CampaignState,
} from '../gen/campaign';
import { worldMissionId } from '../gen/mission-id';
import { worldLevelMap } from '../gen/world';
import { CampaignView } from '../ui/campaign/campaign-view';
import {
  campaignIncludesMine,
  campaignWorld,
  openCampaignBattle,
  openMainMenu,
  readCampaign,
  writeCampaign,
} from './campaign-storage';

export function startCampaignMap(host: HTMLElement): void {
  document.title = str('campaign.title');
  let state: CampaignState = readCampaign() ?? fresh();

  function fresh(): CampaignState {
    const c = newCampaign(Math.floor(Math.random() * 1e9), campaignIncludesMine());
    writeCampaign(c);
    return c;
  }

  const view = new CampaignView(host, {
    levelInfo: (index) => {
      const world = campaignWorld(state);
      const budget = campaignBudget(world, state, index);
      const level = worldLevelMap(world, index, {
        id: worldMissionId(state.seed, index, budget),
        nameKey: 'map.world.name',
        budget,
      });
      const enemies = (level.map.squads ?? []).reduce((n, s) => n + s.members.length, 0);
      return { budget, enemies, map: level.map };
    },
    attack: (index) =>
      openCampaignBattle(state, index, campaignBudget(campaignWorld(state), state, index)),
    newCampaign: () => {
      state = fresh();
      show();
    },
    menu: openMainMenu,
  });

  function show(): void {
    const world = campaignWorld(state);
    view.show({
      world,
      taken: state.taken,
      attackable: attackable(world, state),
      hq: hqLevel(world),
      won: campaignWon(world, state),
      strength: 1 + BLOCK_TUNING.campaign.budgetGrowthPerLevel * state.taken.length,
    });
  }
  show();
  (window as unknown as { __aoo?: unknown }).__aoo = {
    view,
    get campaign() {
      return state;
    },
  };
}
