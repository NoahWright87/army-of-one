/**
 * (PHASE13-d, PHASE14) `?scene=campaign`: the campaign map ([D106], [D122]). No Phaser. Starts a
 * campaign if there's none (a random seed); Attack makes a level the active one and opens its
 * battle (`from=campaign`); while it's active, Resume is the only way in. Winning it brings you
 * back here with the level taken and its money, survivors and unlocks carried over (app/main.ts).
 */
import { DEFAULT_TUNING } from '../content/tuning';
import { str } from '../content/strings';
import {
  attackable,
  campaignBudget,
  campaignWon,
  difficultyOpen,
  enemyGrowth,
  heldSet,
  hqLevel,
  levelTags,
  openRoles,
  withDifficulty,
  buyRole,
  lockedRoles,
  roleTechCost,
  type CampaignState,
} from '../gen/campaign';
import { worldMissionId } from '../gen/mission-id';
import { worldLevelMap } from '../gen/world';
import { CampaignView } from '../ui/campaign/campaign-view';
import {
  campaignWorld,
  createCampaign,
  openCampaignBattle,
  openMainMenu,
  readCampaign,
  writeCampaign,
} from './campaign-storage';

export function startCampaignMap(host: HTMLElement): void {
  document.title = str('campaign.title');
  let state: CampaignState = readCampaign() ?? createCampaign();

  const view = new CampaignView(host, {
    levelInfo: (index) => {
      const world = campaignWorld(state);
      const budget =
        state.active?.level === index ? state.active.budget : campaignBudget(world, state, index);
      const level = worldLevelMap(world, index, {
        id: worldMissionId(state.seed, index, budget),
        nameKey: 'map.world.name',
        budget,
        held: heldSet(state),
      });
      const enemies = (level.map.squads ?? []).reduce((n, s) => n + s.members.length, 0);
      return { budget, enemies, map: level.map };
    },
    attack: (index) => openCampaignBattle(state, index),
    newCampaign: () => {
      state = createCampaign();
      show();
    },
    menu: openMainMenu,
    buyRole: (r) => {
      state = buyRole(state, r);
      writeCampaign(state);
      show();
    },
    setDifficulty: (d) => {
      state = withDifficulty(state, d);
      writeCampaign(state);
      show();
    },
  });

  function show(): void {
    const world = campaignWorld(state);
    view.show({
      world,
      taken: state.taken,
      attackable: attackable(world, state),
      hq: hqLevel(world),
      won: campaignWon(world, state),
      strength: enemyGrowth(state),
      active: state.active?.level ?? null,
      carry: {
        money: state.money,
        income: DEFAULT_TUNING.economy.baseIncomePerSecond + state.incomeBonus,
        reserves: state.reserves,
        roles: openRoles(state),
      },
      tags: levelTags(world),
      tech: state.tech,
      roleCosts: Object.fromEntries(lockedRoles().map((r) => [r, roleTechCost(r)])),
      difficulty: state.difficulty,
      difficultyOpen: difficultyOpen(state),
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
