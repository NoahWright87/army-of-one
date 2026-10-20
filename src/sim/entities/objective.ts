import type { Tuning } from '../../content/tuning';
import type { ObjectiveDef } from '../world/map';

export interface ObjectiveEntity {
  id: string;
  hp: number;
  destroyed: boolean;
}

export function createObjectives(defs: readonly ObjectiveDef[], tuning: Tuning): ObjectiveEntity[] {
  return defs.map((d) => ({ id: d.id, hp: objectiveMaxHp(d, tuning), destroyed: false }));
}

export function objectiveMaxHp(def: ObjectiveDef, tuning: Tuning): number {
  return def.maxHp ?? tuning.objective.maxHp;
}

export function objectiveRadius(def: ObjectiveDef, tuning: Tuning): number {
  return def.radius ?? tuning.objective.radius;
}
