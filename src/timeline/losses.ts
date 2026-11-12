/**
 * (PHASE11) Loss truth: when enemy soldiers/structures were lost ([D53]) and when our capture
 * points were lost to enemy soldiers ([D45], [Q25]), in the latest truth. Folded with the same
 * window rules as captures ([D2] latest wins, [D3] only the simulated window changes). Pure.
 */
import type { LossTruth, WorldObservation } from '../contracts/mission';
import type { Tick } from '../sim/core/time';

export const EMPTY_LOSSES: LossTruth = { enemies: [], points: [] };

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Folds one observation's losses. Entries inside the observed window are replaced by what the
 * observation saw there; entries outside it are kept. An enemy is lost at most once: if an
 * old entry outside the window and a new one both exist, the earliest wins.
 */
export function applyLossObservation(
  truth: LossTruth | undefined,
  obs: WorldObservation,
): LossTruth {
  const t0 = truth ?? EMPTY_LOSSES;
  const inWindow = (t: Tick) => t >= obs.fromTick && t <= obs.toTick;
  const a = obs.attempt;

  const enemies = new Map<string, LossTruth['enemies'][number]>();
  const allEnemies = [
    ...t0.enemies.filter((e) => !inWindow(e.tick)),
    ...(obs.enemyLosses ?? [])
      .filter((e) => inWindow(e.tick))
      .map((e) => ({ ...e, observedInAttempt: a })),
  ].sort((x, y) => x.tick - y.tick || cmp(x.refId, y.refId));
  for (const e of allEnemies) if (!enemies.has(e.refId)) enemies.set(e.refId, e);

  const points = new Map<string, LossTruth['points'][number]>();
  const allPoints = [
    ...t0.points.filter((p) => !inWindow(p.tick)),
    ...(obs.pointLosses ?? [])
      .filter((p) => inWindow(p.tick))
      .map((p) => ({ ...p, observedInAttempt: a })),
  ].sort((x, y) => x.tick - y.tick || cmp(x.pointId, y.pointId));
  for (const p of allPoints) {
    const k = `${p.pointId}\u0000${p.tick}`;
    if (!points.has(k)) points.set(k, p);
  }

  return { enemies: [...enemies.values()], points: [...points.values()] };
}

/** First tick at or after `from` at which `pointId` was lost, or null. */
export function pointLostAfter(
  truth: LossTruth | undefined,
  pointId: string,
  from: Tick,
): Tick | null {
  let best: Tick | null = null;
  for (const p of truth?.points ?? []) {
    if (p.pointId !== pointId || p.tick < from) continue;
    if (best === null || p.tick < best) best = p.tick;
  }
  return best;
}
