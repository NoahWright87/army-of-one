/**
 * Battlefield 2-style capture points (PHASE05-a, [D10]–[D12], [D17]).
 *
 * - Stages ([D11]): 'enemy' → (enemy flag fully lowered) → 'neutral' → (our flag fully raised) →
 *   'ours'. `progress` is how far the current stage has come, in integer units of
 *   `CAPTURE_FULL` (exact and snapshot-safe). Reaching a boundary locks the new stage in: decay
 *   never takes a point back to an earlier stage. A point that is ours stays ours (there are no
 *   enemy soldiers yet).
 * - Contributors ([D10]): alive, interactive soldiers (live or echo; statics are not
 *   interactive) inside the radius at the end of the tick. More contributors capture faster
 *   (`tuning.capture`).
 * - Empty ([D12]): progress decays toward 0 at base × (1 + accel × emptySeconds²), so a brief
 *   step-out costs little and staying out drains it quickly.
 *
 * Runs once per tick at the very end of `step`, after every movement, death and push-out, so
 * contributors are exactly who stands in the circle when the tick ends.
 */
import type { Tuning } from '../../content/tuning';
import { TICKS_PER_SECOND } from '../core/time';
import { emit, type World } from '../state';
import type { CapturePointDef, CaptureStage } from '../world/map';
import { isEligible } from './soldier';

/** Progress units per stage (progress is an integer in [0, CAPTURE_FULL)). */
export const CAPTURE_FULL = 1_000_000;

export interface CapturePointEntity {
  id: string;
  stage: CaptureStage;
  /** Integer progress through the current stage, 0 … CAPTURE_FULL - 1. */
  progress: number;
  /** Consecutive ticks with no contributor (drives the accelerating decay). */
  emptyTicks: number;
  /** Contributor ids at the end of the last tick, id-sorted. */
  contributors: string[];
  /** Tick the point became ours, if it has. */
  capturedTick: number | null;
}

export function createCapturePoints(defs: readonly CapturePointDef[]): CapturePointEntity[] {
  return defs.map((d) => ({
    id: d.id,
    stage: d.initialStage ?? 'enemy',
    progress: 0,
    emptyTicks: 0,
    contributors: [],
    capturedTick: null,
  }));
}

export function captureRadius(def: CapturePointDef, tuning: Tuning): number {
  return def.radius ?? tuning.capture.radius;
}

/** Progress units gained per tick with `n` contributors. */
export function captureRatePerTick(n: number, tuning: Tuning): number {
  if (n <= 0) return 0;
  const c = tuning.capture;
  const k = Math.min(n, Math.max(1, c.maxContributors));
  const perSecond = Math.pow(k, c.contributorExponent) / Math.max(1e-6, c.stageSeconds);
  return Math.max(1, Math.round((perSecond * CAPTURE_FULL) / TICKS_PER_SECOND));
}

/** Progress units lost on the `emptyTicks`-th consecutive empty tick. */
export function decayPerTick(emptyTicks: number, tuning: Tuning): number {
  const c = tuning.capture;
  const s = emptyTicks / TICKS_PER_SECOND;
  const perSecond = c.decayBasePerSecond * (1 + c.decayAccel * s * s);
  return Math.max(0, Math.round((perSecond * CAPTURE_FULL) / TICKS_PER_SECOND));
}

const NEXT: Record<CaptureStage, CaptureStage | null> = {
  enemy: 'neutral',
  neutral: 'ours',
  ours: null,
};

export function stepCapturePoints(world: World): void {
  const defs = world.map.capturePoints;
  if (!defs || defs.length === 0) return;
  const st = world.state;
  const t = world.tuning;
  for (let i = 0; i < defs.length; i++) {
    const def = defs[i]!;
    const cp = st.capturePoints[i]!;
    const r = captureRadius(def, t);
    const r2 = r * r;
    const ids: string[] = [];
    for (const s of st.soldiers) {
      if (!isEligible(s)) continue;
      const dx = s.x - def.position.x;
      const dy = s.y - def.position.y;
      if (dx * dx + dy * dy <= r2) ids.push(s.id);
    }
    const changed = ids.length !== cp.contributors.length;
    cp.contributors = ids;
    const next = NEXT[cp.stage];
    if (next === null) {
      cp.progress = 0;
      cp.emptyTicks = ids.length ? 0 : cp.emptyTicks + 1;
      continue;
    }
    if (ids.length > 0) {
      cp.emptyTicks = 0;
      cp.progress += captureRatePerTick(ids.length, t);
      if (cp.progress >= CAPTURE_FULL) {
        // Stage boundary: the new stage locks in; overflow is dropped ([D11]).
        cp.stage = next;
        cp.progress = 0;
        if (next === 'ours') cp.capturedTick = st.tick;
        emit(world, {
          kind: 'captureStageChanged',
          tick: st.tick,
          id: cp.id,
          stage: next,
          contributors: [...ids],
        });
        if (next === 'ours' && def.objective) completeIfAllObjectivesDone(world, ids);
        continue;
      }
    } else {
      cp.emptyTicks += 1;
      cp.progress = Math.max(0, cp.progress - decayPerTick(cp.emptyTicks, t));
    }
    if (changed) {
      emit(world, {
        kind: 'captureProgress',
        tick: st.tick,
        id: cp.id,
        stage: cp.stage,
        progress: cp.progress / CAPTURE_FULL,
        contributors: ids.length,
      });
    }
  }
}

/**
 * Every objective done: all destroy targets destroyed and every flag point ours ([D17]).
 * A map with no objectives at all never completes.
 */
export function allObjectivesDone(world: World): boolean {
  const st = world.state;
  const flags = (world.map.capturePoints ?? []).filter((d) => d.objective);
  if (st.objectives.length === 0 && flags.length === 0) return false;
  if (!st.objectives.every((o) => o.destroyed)) return false;
  return flags.every((d) => st.capturePoints.find((c) => c.id === d.id)?.stage === 'ours');
}

/** Flag captured: completes the mission if it was the last objective. Credits a live captor. */
function completeIfAllObjectivesDone(world: World, contributors: readonly string[]): void {
  const st = world.state;
  if (st.missionComplete || !allObjectivesDone(world)) return;
  const live = contributors.find((id) => st.soldiers.find((s) => s.id === id)?.controllable);
  const by = live ?? contributors[0];
  st.missionComplete = { tick: st.tick, ...(by ? { by } : {}) };
}

/** Is this capture point ours right now? */
export function isPointOurs(world: World, capturePointId: string): boolean {
  return world.state.capturePoints.find((c) => c.id === capturePointId)?.stage === 'ours';
}

/** Flag progress for drawing: how much of the pole each flag covers (0..1). */
export function flagHeights(
  stage: CaptureStage,
  progress: number,
): { enemy: number; ours: number } {
  if (stage === 'enemy') return { enemy: 1 - progress, ours: 0 };
  if (stage === 'neutral') return { enemy: 0, ours: progress };
  return { enemy: 0, ours: 1 };
}
