/**
 * (PHASE14) How a won campaign level went ([D117], [D118], [D124]), from its final truth: the
 * money at the win, what was earned and spent, who spawned, who died, which reserves were used
 * and who survived (they become reserves). Pure.
 */
import type { Tuning } from '../content/tuning';
import type { MissionState, RoleId } from '../contracts/mission';
import type { MapDef } from '../sim/world/map';
import { balanceAt, buildLedger } from '../timeline/economy';
import type { LevelResult, RoleCounts } from './campaign';

export interface LevelResultInput {
  level: number;
  map: MapDef;
  tuning: Pick<Tuning, 'economy'>;
  mission: MissionState;
}

/** The result of a completed mission (null if it isn't complete). */
export function levelResult(input: LevelResultInput): LevelResult | null {
  const { mission, map, tuning } = input;
  const win = mission.completed?.tick;
  if (win === undefined) return null;
  const ledger = buildLedger({
    map,
    tuning,
    soldiers: mission.soldiers,
    lanes: mission.lanes,
    captures: mission.captureTruth ?? [],
    ...(mission.lossTruth ? { losses: mission.lossTruth } : {}),
  });
  const startMoney = ledger.start;
  const endMoney = balanceAt(ledger, win);
  const spent = ledger.purchases.filter((p) => p.tick <= win).reduce((s, p) => s + p.cost, 0);

  const add = (c: RoleCounts, r: RoleId) => {
    c[r] = (c[r] ?? 0) + 1;
  };
  const reservesUsed: RoleCounts = {};
  for (const p of ledger.purchases) if (p.reserve && p.tick <= win) add(reservesUsed, p.roleId);

  // Every soldier who spawned by the win and wasn't dead by then survives, O's included.
  const lanes = new Map(mission.lanes.map((l) => [l.soldierId, l]));
  const survivors: RoleCounts = {};
  let spawned = 0;
  let lost = 0;
  for (const s of mission.soldiers) {
    const lane = lanes.get(s.id);
    if (lane?.end.kind === 'neverSpawned' || s.spawnTick > win) continue;
    spawned++;
    if (lane?.end.kind === 'death' && lane.end.tick <= win) lost++;
    else add(survivors, s.roleId ?? 'rifleman');
  }
  return {
    level: input.level,
    battleTicks: win,
    startMoney,
    endMoney: Math.floor(endMoney),
    earned: Math.round(endMoney - startMoney + spent),
    spent,
    spawned,
    lost,
    reservesUsed,
    survivors,
  };
}
