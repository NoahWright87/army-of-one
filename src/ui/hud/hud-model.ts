/** Pure HUD logic: turns a WorldView into the strings/numbers the HUD shows. */
import { str, strDynamic } from '../../content/strings';
import { formatBattleTime } from '../../sim/core/time';
import type { CapturePointView, ObjectiveView, SoldierView, WorldView } from '../../sim/view';

export type HudStatus = 'alive' | 'leadIn' | 'dead' | 'none';

export interface HudModel {
  clock: string;
  soldierLabel: string;
  hpText: string;
  /** 0..1 for the HP bar. */
  hpFraction: number;
  status: HudStatus;
  objective: string;
  missionComplete: boolean;
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

export function buildHudModel(view: WorldView, liveId: string | null): HudModel {
  const s = liveId ? view.soldiers.find((x) => x.id === liveId) : undefined;
  const complete = view.missionComplete !== null;
  return {
    clock: formatBattleTime(view.tick),
    soldierLabel: s ? soldierLabel(s.ordinal) : '',
    hpText: s ? (s.alive ? formatHp(s.hp, s.maxHp) : str('hud.kia')) : '',
    hpFraction: s && s.alive ? hpFraction(s.hp, s.maxHp) : 0,
    status: soldierStatus(s),
    objective: objectiveText(view.objectives, complete, view.capturePoints),
    missionComplete: complete,
  };
}
