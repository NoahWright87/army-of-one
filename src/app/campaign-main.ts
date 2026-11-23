/**
 * (PHASE13-d, PHASE14) `?scene=campaign`: the campaign map ([D106], [D122]). No Phaser. Starts a
 * campaign if there's none (a random seed); Attack makes a level the active one and opens its
 * battle (`from=campaign`); while it's active, Resume is the only way in. Winning it brings you
 * back here with the level taken and its money, survivors and unlocks carried over (app/main.ts).
 */
import { CAMPAIGN_CAMERA, DEFAULT_TUNING } from '../content/tuning';
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
import { parseWorldMissionId, worldMissionId } from '../gen/mission-id';
import { worldLevelMap } from '../gen/world';
import { CampaignView } from '../ui/campaign/campaign-view';
import {
  campaignWorld,
  createCampaign,
  prepareCampaignBattle,
  openMainMenu,
  readCampaign,
  writeCampaign,
} from './campaign-storage';

import { animate, CampaignFlight } from './campaign-flight';
import type { CampaignBattleFrame } from './campaign-frame';

export function startCampaignMap(host: HTMLElement, initialBattle?: URL): void {
  document.title = str('campaign.title');
  let state: CampaignState = readCampaign() ?? createCampaign();

  let frame: CampaignBattleFrame | null = null;
  const mapUrl = new URL(location.href);
  mapUrl.search = '';
  const dev = new URLSearchParams(location.search).get('dev');
  if (dev) mapUrl.searchParams.set('dev', dev);
  mapUrl.searchParams.set('scene', 'campaign');
  mapUrl.hash = '';

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
      return { budget, enemies };
    },
    attack: (index) => {
      if (frame) return;
      const url = prepareCampaignBattle(state, index);
      if (url) enterBattle(url, true);
    },
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

  function show(keepScroll = false): void {
    const world = campaignWorld(state);
    view.show(
      {
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
      },
      keepScroll,
    );
  }
  function enterBattle(url: URL, flyIn: boolean): void {
    const mission = parseWorldMissionId(url.searchParams.get('mission') ?? '');
    const world = campaignWorld(state);
    const level = mission?.seed === state.seed ? world.levels[mission.level] : null;
    if (!mission || !level) {
      location.replace(mapUrl);
      return;
    }

    if (flyIn) history.pushState(null, '', url);
    let returning = false;
    let entered = false;
    let failed = false;
    let flight: CampaignFlight | null = null;
    const battle = document.createElement('iframe') as CampaignBattleFrame;
    battle.title = str('map.world.name');
    battle.style.cssText =
      'position:fixed;inset:0;width:100%;height:100%;z-index:21;border:0;opacity:0';
    battle.inert = true;
    frame = battle;
    view.setInteractive(false);
    const canFlyIn = flyIn && !mission.turns;
    view.setLoading(flyIn);
    if (canFlyIn) flight = new CampaignFlight(view, host);
    // The first crossing estimates the opening camera while the battle renderer starts.
    const held = new Set([-1, ...(mission.held ?? [])]);
    const entry = world.crossings.find(
      (crossing) =>
        (crossing.a === level.index && held.has(crossing.b)) ||
        (crossing.b === level.index && held.has(crossing.a)),
    );
    const tile = entry && (entry.a === level.index ? entry.atA : entry.atB);
    const arrival = flight?.move(
      level,
      battle,
      true,
      tile && { x: tile[1] + 0.5, y: tile[0] + 0.5 },
    );

    const cleanup = () => {
      if (frame !== battle) return;
      window.removeEventListener('popstate', cleanup);
      flight?.remove();
      flight = null;
      battle.remove();
      frame = null;
      view.setInteractive(true);
      view.setLoading(false);
      state = readCampaign() ?? state;
      show(true);
    };
    battle.campaign = {
      ready: (projection, resume) => {
        if (entered) return;
        entered = true;
        void (async () => {
          if (frame !== battle || returning || failed) return;
          view.setLoading(false);
          if (flight && projection) {
            flight.register(projection);
            await arrival;
          } else {
            flight?.remove();
            flight = null;
            await animate(battle, [{ opacity: 0 }, { opacity: 1 }], CAMPAIGN_CAMERA.blendMs);
          }
          if (frame !== battle || returning || failed) return;
          flight?.remove();
          flight = null;
          battle.inert = false;
          battle.contentWindow?.focus();
          resume();
        })();
      },
      returnToMap: (projection, save) => {
        if (returning || frame !== battle) return;
        returning = true;
        battle.inert = true;
        void (async () => {
          state = readCampaign() ?? state;
          show(true);
          if (projection && !mission.turns) {
            flight = new CampaignFlight(view, host);
            flight.register(projection);
            await Promise.all([flight.move(level, battle, false), save]);
          } else {
            await Promise.all([
              animate(battle, [{ opacity: 1 }, { opacity: 0 }], CAMPAIGN_CAMERA.blendMs),
              save,
            ]);
          }
          if (frame !== battle) return;
          cleanup();
          if (flyIn) history.back();
          else history.replaceState(null, '', mapUrl);
        })();
      },
      failed: () => {
        failed = true;
        entered = true;
        flight?.remove();
        flight = null;
        battle.style.opacity = '1';
        battle.style.transform = '';
        battle.style.maskImage = '';
        const ui = battle.contentDocument?.getElementById('ui-root');
        if (ui) ui.style.opacity = '';
        battle.inert = false;
        battle.contentWindow?.focus();
      },
    };
    battle.src = url.href;
    host.append(battle);
    window.addEventListener('popstate', cleanup);
  }

  show();
  if (initialBattle) enterBattle(initialBattle, false);
  window.addEventListener('popstate', () => {
    if (!frame && new URLSearchParams(location.search).get('from') === 'campaign') {
      enterBattle(new URL(location.href), false);
    }
  });
  (window as unknown as { __aoo?: unknown }).__aoo = {
    view,
    get campaign() {
      return state;
    },
  };
}
