import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../content/tuning';
import type { LaneTruth, MissionState, RoleId, SoldierRecord } from '../../contracts/mission';
import type { MapDef } from '../../sim/world/map';
import { levelResult } from '../campaign-result';

const S = 60;
const MAP = {
  id: 'r',
  nameKey: 'r',
  width: 100,
  height: 100,
  walls: [],
  water: [],
  spawnPoints: [],
  economy: { startMoney: 200, baseIncomePerSecond: 1, reserves: { gunner: 1 } },
} as unknown as MapDef;

function soldier(n: number, spawnTick: number, roleId?: RoleId): SoldierRecord {
  return {
    id: `S${n}`,
    ordinal: n,
    spawnPointId: 'beach',
    spawnTick,
    ...(roleId ? { roleId } : {}),
    segments: [],
  };
}
const lane = (id: string, end: LaneTruth['end']): LaneTruth => ({
  soldierId: id,
  recordedFrom: 0,
  recordedTo: 0,
  spans: [],
  end,
  markers: [],
});

describe('levelResult (PHASE14)', () => {
  it('counts money, losses, survivors (O’s too) and reserves used up to the win', () => {
    const win = 100 * S;
    const mission: MissionState = {
      schemaVersion: 1,
      missionId: 'r',
      attemptCount: 5,
      soldiers: [
        soldier(1, 0, 'gunner'), // a reserve: free; dies
        soldier(2, 10 * S, 'gunner'), // pays $50; an O
        soldier(3, 20 * S), // a free rifleman; alive at the win
        soldier(4, 30 * S, 'grenadier'), // never spawned
        soldier(5, 40 * S, 'grenadier'), // pays $30; dies after the win: survives
      ],
      lanes: [
        lane('S1', { kind: 'death', tick: 5 * S }),
        lane('S2', { kind: 'open', tick: 50 * S }),
        lane('S3', { kind: 'complete', tick: win }),
        lane('S4', { kind: 'neverSpawned' }),
        lane('S5', { kind: 'death', tick: win + 60 }),
      ],
      completed: { attempt: 5, tick: win, bySoldierId: 'S3' },
    };
    const r = levelResult({ level: 4, map: MAP, tuning: DEFAULT_TUNING, mission })!;
    expect(r).toMatchObject({
      level: 4,
      battleTicks: win,
      startMoney: 200,
      endMoney: 200 + 100 - 50 - 30,
      spent: 80,
      earned: 100,
      spawned: 4,
      lost: 1,
      reservesUsed: { gunner: 1 },
      survivors: { gunner: 1, rifleman: 1, grenadier: 1 },
    });
  });

  it('is null for a mission not won', () => {
    const mission: MissionState = {
      schemaVersion: 1,
      missionId: 'r',
      attemptCount: 0,
      soldiers: [],
      lanes: [],
    };
    expect(levelResult({ level: 0, map: MAP, tuning: DEFAULT_TUNING, mission })).toBeNull();
  });
});
