import type { Tuning } from '../../content/tuning';
import { POSITION_QUANTUM } from '../../contracts/quantize';
import { clampLength, distance, type Vec2 } from '../core/vec';
import { advanceClimbProgress } from './cover-movement';
import { circleOverlapsRect, moveCircle } from './collision';
import type { LadderDef, Rect } from './map';

export interface LadderClimb {
  id: string;
  ascending: boolean;
  progress: number;
}

/** Escarpment edges block walking. Shots use the separately authored walls and cover. */
export function raisedEdges({ x, y, w, h }: Rect): Rect[] {
  return [
    { x: x - 1, y: y - 1, w: w + 2, h: 2 },
    { x: x - 1, y: y + h - 1, w: w + 2, h: 2 },
    { x: x - 1, y, w: 2, h },
    { x: x + w - 1, y, w: 2, h },
  ];
}

export function ladderEffort(ladder: LadderDef, tuning: Tuning): number {
  return Math.max(distance(ladder.bottom, ladder.top), tuning.concealment.trench.rimDepth);
}

type Climber = Vec2 & { ladderClimb?: LadderClimb };

export function climbLadder(
  s: Climber,
  dir: Vec2,
  walk: number,
  solids: readonly Rect[],
  tuning: Tuning,
  ladders: readonly LadderDef[],
): Vec2 | undefined {
  const active = s.ladderClimb;
  const radius = tuning.soldier.wallRadius;
  for (const ladder of ladders) {
    const { id, bottom, top } = ladder;
    if (active && active.id !== id) continue;
    const ascending = active?.ascending ?? distance(s, bottom) <= distance(s, top);
    const from = ascending ? bottom : top;
    const to = ascending ? top : bottom;
    const length = distance(from, to);
    if (length === 0 || (!active && distance(s, from) > tuning.ladder.reach)) continue;
    const push = (dir.x * (to.x - from.x) + dir.y * (to.y - from.y)) / length;
    if (!active) {
      if (push <= 0) continue;
      const offset = { x: from.x - s.x, y: from.y - s.y };
      const dock = moveCircle(s, offset, radius, solids);
      if (distance(dock, from) > POSITION_QUANTUM) continue;
      if (distance(s, from) > POSITION_QUANTUM) {
        return moveCircle(s, clampLength(offset, walk), radius, solids);
      }
    }
    const effort = ladderEffort(ladder, tuning);
    const previous = active?.progress ?? 0;
    let progress = advanceClimbProgress(previous, effort, walk, push, tuning);
    const landing = progress === effort ? to : progress === 0 ? from : undefined;
    if (landing) {
      if (!solids.some((r) => circleOverlapsRect(landing, radius, r))) {
        delete s.ladderClimb;
        return landing;
      }
      progress = previous;
    }
    s.ladderClimb = { id, ascending, progress };
    return {
      x: from.x + ((to.x - from.x) * progress) / effort,
      y: from.y + ((to.y - from.y) * progress) / effort,
    };
  }
  delete s.ladderClimb;
  return undefined;
}

function fractionOnLadder(p: Vec2, { bottom, top }: LadderDef): number | undefined {
  const dx = top.x - bottom.x;
  const dy = top.y - bottom.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return undefined;
  const fraction = ((p.x - bottom.x) * dx + (p.y - bottom.y) * dy) / lengthSquared;
  const clamped = Math.max(0, Math.min(1, fraction));
  return distance(p, { x: bottom.x + dx * clamped, y: bottom.y + dy * clamped }) <= POSITION_QUANTUM
    ? clamped
    : undefined;
}

/** Follow consecutive recorded poses along the ladder without applying wall collision. */
export function recordedLadderStep(
  ladders: readonly LadderDef[],
  previous: Vec2,
  target: Vec2,
  actual: Vec2,
  walk: number,
  radius: number,
  solids: readonly Rect[],
  tuning: Tuning,
): { climb?: LadderClimb } | undefined {
  if (
    distance(actual, previous) > POSITION_QUANTUM ||
    distance(previous, target) > walk * tuning.concealment.trench.climbSpeed + 2 * POSITION_QUANTUM
  ) {
    return undefined;
  }
  for (const ladder of ladders) {
    const prior = fractionOnLadder(previous, ladder);
    const next = fractionOnLadder(target, ladder);
    if (prior === undefined || next === undefined) continue;
    if (next === 0 || next === 1) {
      if (solids.some((r) => circleOverlapsRect(target, radius, r))) continue;
      return {};
    }
    const ascending = next >= prior;
    return {
      climb: {
        id: ladder.id,
        ascending,
        progress: (ascending ? next : 1 - next) * ladderEffort(ladder, tuning),
      },
    };
  }
  return undefined;
}
