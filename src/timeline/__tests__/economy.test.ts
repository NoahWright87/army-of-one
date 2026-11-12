import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING, withTuning } from '../../content/tuning';
import type {
  AttemptObservation,
  CaptureTruth,
  LaneTruth,
  LossTruth,
  RoleId,
  SoldierRecord,
} from '../../contracts/mission';
import type { MapDef } from '../../sim/world/map';
import {
  availableAt,
  balanceAt,
  buildLedger,
  canAfford,
  formatMoney,
  moneyCurve,
  rateAt,
} from '../economy';
import { applyLossObservation } from '../losses';
import { deriveSpawnOptions } from '../spawn-options';

const S = 60; // ticks per second

const MAP: MapDef = {
  id: 'eco',
  nameKey: 'eco',
  width: 1000,
  height: 1000,
  walls: [],
  water: [],
  spawnPoints: [
    { id: 'beach', nameKey: 'beach', kind: 'initial', position: { x: 500, y: 950 }, facing: 0 },
    {
      id: 'fwd',
      nameKey: 'fwd',
      kind: 'capture',
      capturePointId: 'cp',
      position: { x: 500, y: 300 },
      facing: 0,
    },
  ],
  capturePoints: [{ id: 'cp', nameKey: 'cp', position: { x: 500, y: 300 } }],
} as MapDef;

const T = DEFAULT_TUNING; // $100 start, $1/s, captures +$2/s, MG $50

function soldier(n: number, spawnTick: number, roleId?: RoleId, point = 'beach'): SoldierRecord {
  return {
    id: `S${n}`,
    ordinal: n,
    spawnPointId: point,
    spawnTick,
    ...(roleId ? { roleId } : {}),
    segments: [
      {
        startTick: spawnTick,
        endTick: spawnTick + 5 * S,
        waypoints: [],
        actions: [],
        endReason: 'death',
      },
    ],
  };
}

function lane(id: string, end: LaneTruth['end'] = { kind: 'death', tick: 0 }): LaneTruth {
  return { soldierId: id, recordedFrom: 0, recordedTo: 0, spans: [], end, markers: [] };
}

const captured = (tick: number): CaptureTruth[] => [
  { pointId: 'cp', stage: 'neutral', tick: tick - 1, by: ['S1'], observedInAttempt: 1 },
  { pointId: 'cp', stage: 'ours', tick, by: ['S1'], observedInAttempt: 1 },
];

/** The owner's worked example ([D51]): soldier N enters at (N−1) × 2 s; #10 is a $50 MG. */
function ownerExample() {
  const soldiers = Array.from({ length: 11 }, (_, i) =>
    soldier(i + 1, i * 2 * S, i === 9 ? 'gunner' : undefined),
  );
  return { soldiers, lanes: soldiers.map((s) => lane(s.id)) };
}

describe('economy ([D51]–[D54])', () => {
  it("reproduces the owner's example", () => {
    const { soldiers, lanes } = ownerExample();
    const l = buildLedger({
      map: MAP,
      tuning: T,
      soldiers,
      lanes,
      captures: captured(60 * S),
    });
    expect(balanceAt(l, 0)).toBe(100);
    expect(balanceAt(l, 2 * S)).toBe(102); // soldier B
    expect(balanceAt(l, 18 * S - 1)).toBeCloseTo(118 - 1 / S); // #10, just before buying
    expect(balanceAt(l, 18 * S)).toBe(68); // $118 − $50
    expect(balanceAt(l, 20 * S)).toBe(70); // #11
    expect(balanceAt(l, 60 * S)).toBe(110); // the capture: $60 earned − $50 spent
    expect(rateAt(l, 60 * S)).toBe(3); // $1 base + $2 from the point
    expect(balanceAt(l, 70 * S)).toBe(140);
  });

  it('income is battle time, not survival ([D52])', () => {
    const l = buildLedger({ map: MAP, tuning: T, soldiers: [], lanes: [] });
    expect(balanceAt(l, 30 * S)).toBe(130);
  });

  it('spendable money is the lowest balance from t on ([Q30])', () => {
    // A $50 MG bought at the forward point at 60 s, then a beach soldier at 26 s.
    const soldiers = [soldier(1, 0), soldier(2, 60 * S, 'gunner', 'fwd')];
    const l = buildLedger({
      map: MAP,
      tuning: T,
      soldiers,
      lanes: soldiers.map((s) => lane(s.id)),
      captures: captured(60 * S),
    });
    expect(balanceAt(l, 26 * S)).toBe(126);
    expect(balanceAt(l, 60 * S)).toBe(110);
    expect(availableAt(l, 26 * S)).toBe(110);
    expect(availableAt(l, 61 * S)).toBe(113); // $3/s after the capture
    expect(canAfford(l, 26 * S, 110)).toBe(true);
    expect(canAfford(l, 26 * S, 111)).toBe(false);
  });

  it('a lost capture becomes debt, never an un-spawn ([D54])', () => {
    // Bought a $50 MG and a $30 Grenadier at 2 s, $100 start → $22... then a costly forward MG.
    const soldiers = [soldier(1, 0, 'gunner'), soldier(2, 80 * S, 'gunner', 'fwd')];
    const lanes = soldiers.map((s) => lane(s.id));
    const before = buildLedger({
      map: MAP,
      tuning: T,
      soldiers,
      lanes,
      captures: captured(10 * S),
    });
    expect(balanceAt(before, 80 * S)).toBe(100 - 50 + 80 + 140 - 50);
    // A later attempt: the point is lost at 20 s (enemies retake it).
    const losses: LossTruth = {
      enemies: [],
      points: [{ pointId: 'cp', tick: 20 * S, observedInAttempt: 2 }],
    };
    const after = buildLedger({
      map: MAP,
      tuning: T,
      soldiers,
      lanes,
      captures: captured(10 * S),
      losses,
    });
    expect(balanceAt(after, 80 * S)).toBe(100 - 50 + 80 + 20 - 50);
    expect(after.purchases).toHaveLength(2); // still bought
    // Make it debt: a pricier forward purchase.
    const big = withTuning(T, { economy: { startMoney: 0 } });
    const debt = buildLedger({
      map: MAP,
      tuning: big,
      soldiers,
      lanes,
      captures: captured(10 * S),
      losses,
    });
    expect(balanceAt(debt, 0)).toBe(-50);
    expect(availableAt(debt, 0)).toBeLessThan(0);
    expect(canAfford(debt, 0, 0)).toBe(true); // a Rifleman is always free ([D18])
    expect(canAfford(debt, 0, 30)).toBe(false);
  });

  it('a soldier who never spawns is not charged ([Q31])', () => {
    const soldiers = [soldier(1, 0, 'gunner')];
    const l = buildLedger({
      map: MAP,
      tuning: T,
      soldiers,
      lanes: [lane('S1', { kind: 'neverSpawned' })],
    });
    expect(balanceAt(l, 0)).toBe(100);
  });

  it('every enemy loss pays once, at its tick, whoever caused it ([D53])', () => {
    const obs = (attempt: number, from: number, to: number, ticks: number[]) =>
      ({
        attempt,
        fromTick: from,
        toTick: to,
        enemyLosses: ticks.map((t, i) => ({
          refId: `E${i + 1}`,
          kind: 'soldier' as const,
          roleId: 'rifleman' as const,
          tick: t,
        })),
      }) as Pick<AttemptObservation, 'attempt' | 'fromTick' | 'toTick' | 'enemyLosses'>;
    let losses = applyLossObservation(undefined, obs(1, 0, 600, [100, 200]));
    // Attempt 2 replays only [0, 150]: E1 dies later now (outside), E2 keeps its old death.
    losses = applyLossObservation(losses, obs(2, 0, 150, []));
    expect(losses.enemies.map((e) => e.refId)).toEqual(['E2']);
    losses = applyLossObservation(losses, obs(3, 0, 600, [300, 200]));
    const l = buildLedger({ map: MAP, tuning: T, soldiers: [], lanes: [], losses });
    expect(l.bounties.map((b) => [b.refId, b.tick])).toEqual([
      ['E2', 200],
      ['E1', 300],
    ]);
    expect(balanceAt(l, 299) - balanceAt(l, 0)).toBeCloseTo(299 / S + T.economy.bounty.rifleman);
  });

  it('draws a curve with steps at bounties and purchases', () => {
    const { soldiers, lanes } = ownerExample();
    const l = buildLedger({ map: MAP, tuning: T, soldiers, lanes });
    const c = moneyCurve(l, 30 * S);
    const at18 = c.filter((p) => p.t === 18 * S).map((p) => p.v);
    expect(at18).toEqual([118, 68]);
    expect(c[c.length - 1]).toEqual({ t: 30 * S, v: 80 });
    expect(formatMoney(-12.4)).toBe('−$13');
  });

  it('economy off: every role is free', () => {
    const off = withTuning(T, { economy: { enabled: false } });
    const l = buildLedger({
      map: MAP,
      tuning: off,
      soldiers: [soldier(1, 0, 'gunner')],
      lanes: [],
    });
    expect(l.purchases).toEqual([]);
    expect(canAfford(l, 0, 1e9)).toBe(true);
  });

  it('a lost forward point closes its spawn from that tick ([Q25])', () => {
    const rules = { spawnIntervalTicks: 2 * S, leadInTicks: 5 * S };
    const caps = captured(10 * S);
    const open = deriveSpawnOptions(MAP, [], [], rules, caps);
    expect(open.some((o) => o.kind === 'new' && o.spawnPointId === 'fwd')).toBe(true);
    const losses: LossTruth = {
      enemies: [],
      points: [{ pointId: 'cp', tick: 10 * S, observedInAttempt: 2 }],
    };
    const closed = deriveSpawnOptions(MAP, [], [], rules, caps, losses);
    expect(closed.some((o) => o.kind === 'new' && o.spawnPointId === 'fwd')).toBe(false);
  });
});
