import type { Tuning } from '../../content/tuning';
import { POSITION_QUANTUM } from '../../contracts/quantize';
import { distance, type Vec2 } from '../core/vec';
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
  return Math.max(distance(ladder.bottom, ladder.top), tuning.ladder.minimumEffort);
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
    if (length === 0 || distance(s, from) > tuning.ladder.reach) continue;
    const push = (dir.x * (to.x - from.x) + dir.y * (to.y - from.y)) / length;
    if (push <= 0) continue;
    const dock = moveCircle(s, { x: from.x - s.x, y: from.y - s.y }, radius, solids);
    if (distance(dock, from) > POSITION_QUANTUM) continue;
    const effort = ladderEffort(ladder, tuning);
    const progress = Math.min(
      effort,
      (active?.progress ?? 0) + walk * tuning.ladder.climbSpeed * push,
    );
    if (progress >= effort && !solids.some((r) => circleOverlapsRect(to, radius, r))) {
      delete s.ladderClimb;
      return to;
    }
    s.ladderClimb = { id, ascending, progress };
    return dock;
  }
  delete s.ladderClimb;
  return undefined;
}

/** Echoes may cross an edge only when their recording shows the same ladder transfer. */
export function recordedLadderTransfer(
  ladders: readonly LadderDef[],
  previous: Vec2,
  target: Vec2,
  actual: Vec2,
  radius: number,
  solids: readonly Rect[],
): boolean {
  return (
    ladders.some(({ bottom, top }) =>
      (
        [
          [bottom, top],
          [top, bottom],
        ] as const
      ).some(
        ([from, to]) =>
          distance(previous, from) <= POSITION_QUANTUM &&
          distance(actual, from) <= POSITION_QUANTUM &&
          distance(target, to) <= POSITION_QUANTUM,
      ),
    ) && !solids.some((r) => circleOverlapsRect(target, radius, r))
  );
}
