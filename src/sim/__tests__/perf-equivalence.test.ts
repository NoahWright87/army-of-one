/**
 * PHASE05-b: every optimization behind `simPerf` must be bit-exact. Build the same bot army with
 * all optimizations off (the reference implementations) and on, and compare recordings,
 * observations and the world hash of a full replay tick for tick.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { MISSION_01 } from '../../content/maps/mission-01';
import { DEFAULT_TUNING } from '../../content/tuning';
import { Attempt } from '../attempt/attempt';
import { SnapshotStore } from '../attempt/snapshots';
import { ArmyBuilder } from '../bots/army';
import { createBotDriver, planBot, type BotMix } from '../bots/bot';
import { hashState } from '../core/hash';
import { setSimPerf, SIM_PERF_OFF, SIM_PERF_ON, type SimPerfFlags } from '../perf';
import { recordedTo } from '../recording/records';
import { createWorld, getSoldier, spawnSoldier, step } from '../sim';
import { findPath } from '../world/nav';

const MIX: BotMix = { route: 30, hunter: 20, idler: 10, crowd: 40 };
let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
});

function buildAndReplay(flags: Readonly<SimPerfFlags>, lives: number) {
  restore = setSimPerf(flags);
  const army = new ArmyBuilder({
    map: MISSION_01,
    tuning: DEFAULT_TUNING,
    seed: 7,
    mix: MIX,
    lifeSeconds: [15, 35],
  });
  army.growTo(lives);
  const replay = new Attempt({
    map: MISSION_01,
    tuning: DEFAULT_TUNING,
    soldiers: army.records,
    attempt: lives + 1,
    from: { kind: 'start' },
    live: null,
    kind: 'resolve',
  });
  const end = Math.max(...army.records.map(recordedTo));
  const hashes: string[] = [];
  let peak = 0;
  while (replay.tick < end && !replay.isOver()) {
    replay.step();
    hashes.push(hashState(replay.world.state));
    peak = Math.max(peak, replay.world.state.soldiers.filter((s) => s.alive).length);
  }
  restore();
  restore = null;
  return {
    records: JSON.stringify(army.records),
    observations: JSON.stringify(army.observations),
    hashes,
    peak,
  };
}

describe('PHASE05-b optimizations are bit-exact', () => {
  it('a 36-life bot army: same recordings, observations and replay hashes with and without', () => {
    const naive = buildAndReplay(SIM_PERF_OFF, 36);
    const fast = buildAndReplay(SIM_PERF_ON, 36);
    // The scenario is crowded enough to exercise the grids (they kick in above 24 soldiers).
    expect(naive.peak).toBeGreaterThan(24);
    expect(fast.records).toBe(naive.records);
    expect(fast.observations).toBe(naive.observations);
    expect(fast.hashes.length).toBe(naive.hashes.length);
    const firstDiff = fast.hashes.findIndex((h, i) => h !== naive.hashes[i]);
    expect(firstDiff).toBe(-1);
  }, 120_000);

  it('a 40-soldier pile-up on one spot separates identically', () => {
    const run = (flags: Readonly<SimPerfFlags>) => {
      restore = setSimPerf(flags);
      const w = createWorld(MISSION_01, DEFAULT_TUNING);
      const ids: string[] = [];
      for (let i = 0; i < 40; i++) {
        ids.push(spawnSoldier(w, 'road', { position: { x: 400 + (i % 3), y: 1500 } }));
      }
      const out: string[] = [];
      for (let t = 0; t < 240; t++) {
        const inputs = new Map(
          ids.map((id, i) => [
            id,
            {
              move: { x: Math.cos(i + t / 30), y: Math.sin(i * 0.7) },
              aim: 0,
              fire: false,
              interact: false,
            },
          ]),
        );
        step(w, inputs);
        out.push(hashState(w.state));
      }
      restore();
      restore = null;
      return out;
    };
    expect(run(SIM_PERF_ON)).toEqual(run(SIM_PERF_OFF));
  });

  it('A* with reused buffers returns the same paths', () => {
    const w = createWorld(MISSION_01, DEFAULT_TUNING);
    const queries: [{ x: number; y: number }, { x: number; y: number }][] = [
      [MISSION_01.spawnPoints[0]!.position, { x: 5900, y: 400 }],
      [MISSION_01.spawnPoints[1]!.position, { x: 1990, y: 1440 }],
      [
        { x: 2600, y: 1000 },
        { x: 4200, y: 1300 },
      ],
      [
        { x: 300, y: 300 },
        { x: 300, y: 4000 },
      ],
    ];
    const run = (flags: Readonly<SimPerfFlags>) => {
      restore = setSimPerf(flags);
      const out = queries.map(([a, b]) => JSON.stringify(findPath(w, a, b)));
      out.push(JSON.stringify(findPath(w, queries[0]![0], queries[0]![1], { maxLength: 900 })));
      restore();
      restore = null;
      return out;
    };
    expect(run(SIM_PERF_ON)).toEqual(run(SIM_PERF_OFF));
  });

  it('bots are deterministic given a seed', () => {
    const plan = (seed: number) =>
      planBot({
        map: MISSION_01,
        tuning: DEFAULT_TUNING,
        kind: 'route',
        seed,
        spawnPointId: 'road',
      });
    expect(plan(3)).toEqual(plan(3));
    expect(plan(3)).not.toEqual(plan(4));
    const drive = () => {
      const w = createWorld(MISSION_01, DEFAULT_TUNING);
      const id = spawnSoldier(w, 'road');
      const d = createBotDriver(plan(3));
      for (let t = 0; t < 600; t++) {
        const me = getSoldier(w, id)!;
        if (!me.alive) break;
        const input = d.input(w, me);
        if (!input) break;
        step(w, new Map([[id, input]]));
      }
      return hashState(w.state);
    };
    expect(drive()).toBe(drive());
  });
});

describe('snapshot thinning', () => {
  it('keeps the newest window dense and older time sparse', () => {
    const store = new SnapshotStore({ denseWindowTicks: 600, sparseEveryTicks: 300 });
    const snap = (tick: number) =>
      ({ tick, attempt: 1, source: 'attempt', state: {}, echoes: { echoes: [] } }) as never;
    for (let t = 0; t <= 3000; t += 60) store.stage(snap(t));
    store.stage(snap(2999));
    store.commit({ attempt: 1, fromTick: 0, toTick: 3000 });
    const ticks = store.ticks();
    expect(ticks.filter((t) => t < 2400)).toEqual([0, 300, 600, 900, 1200, 1500, 1800, 2100]);
    expect(ticks.filter((t) => t >= 2400)).toEqual([
      2400, 2460, 2520, 2580, 2640, 2700, 2760, 2820, 2880, 2940, 2999, 3000,
    ]);
    expect(store.nearestValidSnapshot(1000)!.tick).toBe(900);
  });
});
