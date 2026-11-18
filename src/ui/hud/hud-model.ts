/** Pure HUD logic: turns a WorldView into the strings/numbers the HUD shows. */
import { str, strDynamic } from '../../content/strings';
import { formatBattleTime } from '../../sim/core/time';
import { formatMoney } from '../../timeline/economy';
import type { CapturePointView, ObjectiveView, SoldierView, WorldView } from '../../sim/view';

export type HudStatus = 'alive' | 'leadIn' | 'dead' | 'none';

/** (PHASE17) An objective flag on the HUD ([D140]): ours, being taken (0..1), or theirs. */
export interface FlagIcon {
  state: 'ours' | 'taking' | 'theirs';
  progress: number;
}

/** (PHASE17) Flag icons for the objective capture points ([D140]). */
export function flagIcons(points: readonly CapturePointView[]): FlagIcon[] {
  return points
    .filter((c) => c.objective)
    .map((c) =>
      c.stage === 'ours'
        ? { state: 'ours', progress: 1 }
        : c.progress > 0 || c.stage === 'neutral'
          ? {
              state: 'taking',
              progress: c.stage === 'neutral' ? 0.5 + c.progress / 2 : c.progress / 2,
            }
          : { state: 'theirs', progress: 0 },
    );
}

/** (PHASE17) Enemy soldiers alive, or null if the map never had any ([D140]). */
export function enemiesLeft(view: WorldView): number | null {
  let any = false;
  let n = 0;
  for (const s of view.soldiers) {
    if (s.role !== 'enemy') continue;
    any = true;
    if (s.alive) n++;
  }
  return any ? n : null;
}

export interface HudModel {
  clock: string;
  soldierLabel: string;
  hpText: string;
  /** 0..1 for the HP bar. */
  hpFraction: number;
  status: HudStatus;
  objective: string;
  /**
   * (PHASE17) Objective flags as icons ([D140]): one per flag, in map order. Empty: the
   * objective text shows instead.
   */
  flags: FlagIcon[];
  /** (PHASE17) Enemy soldiers left, or null on a map without any ([D140]). */
  enemiesLeft: number | null;
  missionComplete: boolean;
  /** (PHASE11) "$120", or null with the economy off / no driver. */
  money: string | null;
  moneyRate?: string;
  moneyDebt?: boolean;
}

/** (PHASE11) The money at the current tick ([D51]). */
export interface HudMoney {
  balance: number;
  rate: number;
}

export function formatHp(hp: number, maxHp: number): string {
  return `${Math.max(0, Math.ceil(hp))} / ${maxHp}`;
}

export function hpFraction(hp: number, maxHp: number): number {
  if (maxHp <= 0) return 0;
  return Math.max(0, Math.min(1, hp / maxHp));
}

export function soldierLabel(ordinal: number): string {
  return str('hud.soldier', { n: ordinal });
}

export function objectiveText(
  objectives: readonly ObjectiveView[],
  complete: boolean,
  capturePoints: readonly CapturePointView[] = [],
): string {
  if (complete) return str('mission.complete');
  // (05-a) Flag objectives ([D17]).
  const flags = capturePoints.filter((c) => c.objective);
  if (flags.length > 0) {
    if (objectives.length === 0 && flags.length === 1) {
      return str('objective.capture', { name: strDynamic(flags[0]!.nameKey) });
    }
    const done =
      objectives.filter((o) => o.destroyed).length + flags.filter((c) => c.stage === 'ours').length;
    return str('objective.mixed', { done, total: objectives.length + flags.length });
  }
  if (objectives.length === 0) return str('objective.none');
  if (objectives.length === 1) return str('objective.destroy');
  const done = objectives.filter((o) => o.destroyed).length;
  return str('objective.destroyMany', { done, total: objectives.length });
}

export function soldierStatus(s: SoldierView | undefined): HudStatus {
  if (!s) return 'none';
  if (!s.alive) return 'dead';
  return s.leadIn ? 'leadIn' : 'alive';
}

export function buildHudModel(
  view: WorldView,
  liveId: string | null,
  money: HudMoney | null = null,
): HudModel {
  const s = liveId ? view.soldiers.find((x) => x.id === liveId) : undefined;
  const complete = view.missionComplete !== null;
  return {
    clock: formatBattleTime(view.tick),
    soldierLabel: s ? soldierLabel(s.ordinal) : '',
    hpText: s ? (s.alive ? formatHp(s.hp, s.maxHp) : str('hud.kia')) : '',
    hpFraction: s && s.alive ? hpFraction(s.hp, s.maxHp) : 0,
    status: soldierStatus(s),
    objective: objectiveText(view.objectives, complete, view.capturePoints),
    flags: flagIcons(view.capturePoints),
    enemiesLeft: enemiesLeft(view),
    missionComplete: complete,
    money: money ? formatMoney(money.balance) : null,
    ...(money
      ? {
          moneyRate: str('money.rate', { n: Math.round(money.rate * 10) / 10 }),
          moneyDebt: money.balance < 0,
        }
      : {}),
  };
}
