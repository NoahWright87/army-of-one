/**
 * (PHASE18) Starts the HQ ([D153]): the hub world runs on the battle scene (same walking,
 * shooting, touch controls and camera as a battle) with a HubDriver, and its signs say what
 * there is to do. Signs with choices carry buttons; picking a skirmish or a campaign opens a gate
 * you walk out of.
 */
import { buildInfo, formatBuildTime, formatBuildUtc } from './build-info';
import type Phaser from 'phaser';
import { fitPx } from '../content/assets';
import {
  HUB_DECOR,
  HUB_DRILL_FRAME,
  HUB_LABELS,
  HUB_SIGNS,
  type HubExitId,
  type HubSignId,
} from '../content/hub';
import { MISSIONS } from '../content/maps';
import { ROLES } from '../content/roles';
import type { SignDef } from '../content/sign-styles';
import { str, strDynamic } from '../content/strings';
import type { Tuning } from '../content/tuning';
import { cloneWorldText } from '../content/world-text';
import { genMissionId, parseWorldMissionId } from '../gen/mission-id';
import { formatBattleTime } from '../sim/core/time';
import type { WorldView } from '../sim/view';
import type { InputSource } from '../render/input/input-source';
import { DEPTH } from '../render/depth';
import { loadWorldTextFonts } from '../render/worldtext/fonts';
import type { BattleSession } from '../render/phaser/services';
import {
  SignpostLayer,
  type SignButton,
  type SignContent,
} from '../render/worldtext/signpost-layer';
import { parseBests } from '../ui/results/results-model';
import { createCampaign, openCampaignMap, readCampaign } from './campaign-storage';
import { HubDriver } from './hub';
import { readLibrary, type LibraryEntry } from './replay-library';

export interface HubDeps {
  game: Phaser.Game;
  tuning: Tuning;
  uiRoot: HTMLElement;
  assetsReady: Promise<void>;
  makeInput(scene: Phaser.Scene, liveId: string): InputSource;
  /** The HUD (and the stance and weapon icons) is shown, except while a sign is open. */
  setHudVisible(on: boolean): void;
  /** Mission name key for a library entry (null: unknown mission). */
  missionNameKey(missionId: string): string | null;
}

const ROLE_KEY = 'army-of-one.hub.role';

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** A URL on this page with only these params (keeps `dev`). */
function pageUrl(params: Record<string, string>, hash = ''): string {
  const u = new URL(window.location.href);
  const dev = u.searchParams.get('dev');
  u.search = '';
  if (dev) u.searchParams.set('dev', dev);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.hash = hash;
  return u.toString();
}

export function startHub(deps: HubDeps): void {
  let skirmish: { id: string; label: string } | null = null;
  let campaign: 'continue' | 'new' | null = null;
  const savedRole = storage()?.getItem(ROLE_KEY);
  const role = ROLES.find((r) => r.id === savedRole)?.id ?? 'rifleman';

  const leave = (id: HubExitId) => {
    if (id === 'skirmish' && skirmish) {
      try {
        storage()?.setItem('army-of-one.mission', skirmish.id);
      } catch {
        // just this visit
      }
      window.location.assign(pageUrl({ mission: skirmish.id, go: '1' }));
    }
    if (id === 'campaign' && campaign) {
      if (campaign === 'new') createCampaign();
      openCampaignMap();
    }
  };
  const driver = new HubDriver(deps.tuning, leave, role);
  let signs: SignpostLayer | null = null;
  let hudShown = true;

  const watchButtons = (entries: LibraryEntry[]): SignButton[] =>
    entries.flatMap((e) => {
      const key = deps.missionNameKey(e.missionId);
      if (!key) return [];
      const label = str('library.won', {
        mission: strDynamic(key),
        soldiers: e.soldiers,
        time: formatBattleTime(e.battleTicks),
      });
      return [
        {
          label: str('hub.btn.watch', { label }),
          run: () => window.location.assign(pageUrl({ scene: 'title' }, `#replay=${e.packed}`)),
        },
      ];
    });

  const content = (def: SignDef): SignContent | null => {
    const id = def.id as HubSignId;
    const library = readLibrary(storage());
    switch (id) {
      case 'skirmish':
        return {
          text: skirmish
            ? str('hub.sign.skirmishPicked', { mission: skirmish.label })
            : str('hub.sign.skirmish'),
          buttons: [
            ...MISSIONS.map((m) => ({
              label: strDynamic(m.nameKey),
              run: () => pickSkirmish(m.id, strDynamic(m.nameKey)),
            })),
            {
              label: str('hub.btn.random'),
              run: () =>
                pickSkirmish(genMissionId(Math.floor(Math.random() * 1e9)), str('hub.btn.random')),
            },
          ],
        };
      case 'skirmishTv':
      case 'campaignTv': {
        const want = id === 'campaignTv';
        const list = library.filter((e) => !!parseWorldMissionId(e.missionId) === want);
        const buttons = watchButtons(list);
        return {
          text: str(buttons.length ? 'hub.sign.replays' : 'hub.sign.replaysNone'),
          buttons,
        };
      }
      case 'campaign': {
        const on = readCampaign() !== null;
        if (campaign) {
          return {
            text: str('hub.sign.campaignPicked', {
              what: str(campaign === 'new' ? 'hub.btn.new' : 'hub.btn.continue'),
            }),
          };
        }
        return {
          text: str(on ? 'hub.sign.campaignOn' : 'hub.sign.campaignNew'),
          buttons: [
            ...(on
              ? [{ label: str('hub.btn.continue'), run: () => pickCampaign('continue') }]
              : []),
            {
              label: str('hub.btn.new'),
              run: () => {
                if (on && !window.confirm(str('title.newConfirm'))) return;
                pickCampaign('new');
              },
            },
          ],
        };
      }
      case 'trophies': {
        const lines: string[] = [];
        for (const m of MISSIONS) {
          // storage() already caught a blocked localStorage.
          const b = parseBests(storage()?.getItem(`aoo:bests:${m.id}`) ?? null);
          if (b.fastestTicks === undefined) continue;
          lines.push(
            str('hub.sign.trophyLine', {
              mission: strDynamic(m.nameKey),
              time: formatBattleTime(b.fastestTicks),
              soldiers: b.fewestSoldiers ?? '?',
            }),
          );
        }
        return {
          text: lines.length
            ? `${str('hub.sign.trophies')}\n[small]${lines.join('\n')}[/]`
            : str('hub.sign.trophiesNone'),
        };
      }
      case 'guns':
        return {
          text: `${str('hub.sign.guns')}\n[small][gold]${strDynamic(
            ROLES.find((r) => r.id === driver.roleId)?.nameKey ?? 'role.rifleman',
          )}[/][/]`,
          buttons: ROLES.map((r) => ({
            label: strDynamic(r.nameKey),
            run: () => {
              driver.setRole(r.id);
              try {
                storage()?.setItem(ROLE_KEY, r.id);
              } catch {
                // just this visit
              }
              setTimeout(() => signs?.rebuild(), 50);
            },
          })),
        };
      case 'arrivals':
        return {
          text: str('hub.sign.arrivals'),
          buttons: [
            { label: str('hub.btn.arrivals'), run: () => driver.launchArrivals() },
            { label: str('hub.btn.arrivalsFew'), run: () => driver.launchArrivals('few') },
            { label: str('hub.btn.arrivalsMany'), run: () => driver.launchArrivals('many') },
          ],
        };
      case 'training':
        return {
          text: str('hub.sign.training'),
          buttons: [
            {
              label: str('hub.btn.training'),
              run: () => go({ mission: 'basic-training', go: '1', new: '1' }),
            },
          ],
        };
      case 'dev':
        return {
          text: str('hub.sign.dev'),
          buttons: [
            { label: str('hub.btn.arena'), run: () => go({ scene: 'arena' }) },
            { label: str('hub.btn.textlab'), run: () => go({ scene: 'textlab' }) },
            { label: str('hub.btn.editor'), run: () => go({ scene: 'editor' }) },
            { label: str('hub.btn.world'), run: () => go({ scene: 'world' }) },
            { label: str('hub.btn.gallery'), run: () => go({ scene: 'gallery' }) },
            { label: str('hub.btn.oldMenu'), run: () => go({ scene: 'title' }) },
          ],
        };
      case 'build': {
        const b = buildInfo();
        return {
          text: str('hub.sign.build', {
            version: b.version,
            sha: b.sha,
            branch: b.branch,
            time: formatBuildTime(b.time),
            utc: formatBuildUtc(b.time),
          }),
        };
      }
      default:
        return null;
    }
  };
  const go = (p: Record<string, string>) => window.location.assign(pageUrl(p));
  const pickSkirmish = (id: string, label: string) => {
    skirmish = { id, label };
    driver.openExit('skirmish');
    signs?.rebuild();
  };
  const pickCampaign = (what: 'continue' | 'new') => {
    campaign = what;
    driver.openExit('campaign');
    signs?.rebuild();
  };

  void deps.assetsReady.then(() => {
    const session: BattleSession = {
      world: driver.world,
      liveId: driver.liveId,
      driver,
      // No firing while pressing a sign's button (the game hears clicks anywhere on the page).
      makeInput: (scene: Phaser.Scene) => {
        const base = deps.makeInput(scene, driver.liveId);
        return {
          ...base,
          read: (pos) => {
            const input = base.read(pos);
            return signs?.blocksFire() ? { ...input, fire: false } : input;
          },
          pointerWorld: () => base.pointerWorld(),
          destroy: () => base.destroy(),
          ...(base.observe ? { observe: (v: WorldView) => base.observe!(v) } : {}),
          ...(base.manualAim ? { manualAim: () => base.manualAim!() } : {}),
          ...(base.aimTarget ? { aimTarget: () => base.aimTarget!() } : {}),
        };
      },
      holdLookAhead: () => signs?.anyOpen() ?? false,
      cameraFrame: () => {
        const live = driver.view().soldiers.find((s) => s.id === driver.liveId);
        return live && Math.abs(live.x - HUB_DRILL_FRAME.x) < 155 && live.y > 1920 && live.y < 2120
          ? HUB_DRILL_FRAME
          : null;
      },
      overlay: {
        create: (scene: Phaser.Scene) => {
          for (const d of HUB_DECOR) {
            scene.add
              .image(d.x, d.y, d.image)
              .setScale(d.w / fitPx(d.image))
              .setDepth(DEPTH.decals);
          }
          const labels: Phaser.GameObjects.Text[] = [];
          for (const l of HUB_LABELS) {
            const t = scene.add
              .text(l.x, l.y, str(l.key), {
                fontFamily: '"Black Ops One", "Arial Black", sans-serif',
                fontSize: l.big ? '44px' : '22px',
                color: l.big ? '#f4efe0' : '#e8dfbd',
                stroke: '#1d2212',
                strokeThickness: l.big ? 6 : 4,
              })
              .setOrigin(0.5)
              .setAlpha(l.big ? 1 : 0.85)
              .setDepth(DEPTH.decals + 0.5)
              .setResolution(2);
            labels.push(t);
          }
          // Drawn before the font arrived: redraw once it has.
          loadWorldTextFonts();
          const redraw = () => labels.forEach((t) => t.updateText());
          document.fonts?.addEventListener('loadingdone', redraw);
          scene.events.once('shutdown', () =>
            document.fonts?.removeEventListener('loadingdone', redraw),
          );
          signs = new SignpostLayer(scene, HUB_SIGNS, cloneWorldText(), {
            content,
            domRoot: deps.uiRoot,
          });
        },
        update: (nowMs, live, input) => {
          signs?.update(nowMs, live, input.fire);
          const hud = !(signs?.anyOpen() ?? false);
          if (hud !== hudShown) {
            hudShown = hud;
            deps.setHudVisible(hud);
          }
        },
      },
    };
    deps.game.scene.start('battle', { session });
  });
}
