/**
 * PHASE03-a scenario tests on mission-01: exact replay, rescue → O, resume, ignore O, history
 * made worse, interruption at the gate, resolve passes, snapshot equivalence.
 */
import { describe, expect, it } from 'vitest';
import { MISSION_01 } from '../../content/maps/mission-01';
import { DEFAULT_TUNING } from '../../content/tuning';
import type { AttemptObservation, SoldierRecord } from '../../contracts/mission';
import { Attempt } from '../attempt/attempt';
import { outcomeHash } from '../attempt/outcome-hash';
import { startResolve } from '../attempt/resolve';
import { SnapshotStore } from '../attempt/snapshots';
import { damageSoldier } from '../combat/damage';
import { castRay } from '../combat/shots';
import { secondsToTicks } from '../core/time';
import { isEligible } from '../entities/soldier';
import { buildSchedule, poseAt, validateRecord } from '../recording/schedule';
import { recordedTo } from '../recording/records';
import type { ScriptStep } from '../scenarios/driver';
import { playLife, type LifeParams } from '../scenarios/lives';
import { findScenario, ROAD_TO_HIGHWAY, turretDestroyed } from '../scenarios/mission-01';
import { LEAD_IN_TICKS, runRescueChain, S2_SNIPE_AND_HOLD } from '../scenarios/rescue';
import { getSoldier, getView, type World } from '../sim';

const T = DEFAULT_TUNING;
const base = { map: MISSION_01, tuning: T };
const soldier = (w: World, id: string) => getSoldier(w, id)!;

// The rescue chain is deterministic; run it once and share it.
const chain = runRescueChain(T);
const [a1, a2, a3] = chain.lives as [
  (typeof chain.lives)[0],
  (typeof chain.lives)[0],
  (typeof chain.lives)[0],
];
const recordsAfter1 = a1.records;
const recordsAfter2 = a2.records;
const s1End = recordedTo(recordsAfter1.find((r) => r.id === 'S1')!);

function life(p: Omit<LifeParams, 'map' | 'tuning'>) {
  return playLife({ ...base, ...p });
}

describe('exact replay', () => {
  it('an unchanged history replays bit-exactly, tick for tick (idle live soldier far away)', () => {
    const naive = findScenario('road-naive')!;
    const hashes1: string[] = [];
    const first = life({
      records: [],
      attempt: 1,
      live: { mode: 'new', soldierId: 'S1', spawnPointId: 'road', entryTick: 0 },
      steps: naive.steps,
      onTick: (a) => hashes1.push(outcomeHash(a.world.state)),
    });
    const d = first.observation.lanes['S1'];
    expect(d).toMatchObject({ kind: 'died', cause: 'turret' });
    const deathTick = (d as { tick: number }).tick;

    const hashes2: string[] = [];
    const second = life({
      records: first.records,
      attempt: 2,
      // S2 idles at the beach: far from the turret, the mines and S1.
      live: { mode: 'new', soldierId: 'S2', spawnPointId: 'beach', entryTick: 0 },
      steps: [{ kind: 'wait', ticks: deathTick + 30 }],
      onTick: (a) => hashes2.push(outcomeHash(a.world.state, ['S2'])),
    });
    expect(second.observation.lanes['S1']).toEqual(d);
    expect(hashes2.length).toBeGreaterThan(hashes1.length);
    for (let i = 0; i < hashes1.length; i++) expect(hashes2[i], `tick ${i + 1}`).toBe(hashes1[i]);

    // Same with no live soldier at all (the resolve-pass setup).
    const third = new Attempt({
      ...base,
      soldiers: first.records,
      attempt: 3,
      from: { kind: 'start' },
      live: null,
    });
    for (let i = 0; i < hashes1.length; i++) {
      third.step();
      expect(outcomeHash(third.world.state), `tick ${i + 1}`).toBe(hashes1[i]);
    }
    expect(soldier(third.world, 'S1').deathTick).toBe(deathTick);
  });

  it('echo shots replay exactly: the sniper destroys the turret on the same tick', () => {
    const killTick = (o: AttemptObservation) => o.markers.find((m) => m.kind === 'kill')?.tick;
    const replay = new Attempt({
      ...base,
      soldiers: recordsAfter2.filter((r) => r.id === 'S2'),
      attempt: 9,
      from: { kind: 'start' },
      live: null,
    });
    replay.runHeadless(recordedTo(recordsAfter2.find((r) => r.id === 'S2')!) + 1);
    const obs = replay.finish().observation;
    expect(killTick(obs)).toBeDefined();
    expect(killTick(obs)).toBe(killTick(a2.observation));
    expect(obs.markers.some((m) => m.kind === 'interrupted')).toBe(false);
  });
});

describe('rescue chain: X → rescue → O → resume', () => {
  it('attempt 1: S1 walks into the turret and dies (X)', () => {
    expect(a1.observation.lanes).toEqual({ S1: { kind: 'died', tick: s1End, cause: 'turret' } });
    expect(a1.liveSegment).toMatchObject({ startTick: 0, endTick: s1End, endReason: 'death' });
    const kinds = a1.observation.markers.map((m) => m.kind);
    expect(kinds[0]).toBe('spawn');
    expect(kinds.at(-1)).toBe('death');
    expect(kinds.slice(1, -1).every((k) => k === 'damaged')).toBe(true);
    expect(a1.observation.markers.find((m) => m.kind === 'death')!.stringKey).toBe('marker.death');
  });

  it('attempt 2: S2 kills the turret first; S1 reaches its recording end alive → static (O)', () => {
    const o = a2.observation;
    const kill = o.markers.find((m) => m.kind === 'kill')!;
    expect(kill).toMatchObject({ soldierId: 'S2', refId: 'turret-1', stringKey: 'marker.kill' });
    expect(kill.tick).toBeLessThan(s1End);
    expect(o.lanes['S1']).toEqual({ kind: 'static', tick: s1End });
    expect(o.markers).toContainEqual(
      expect.objectContaining({ soldierId: 'S1', kind: 'open', tick: s1End }),
    );
    // S2 stayed alive past S1's recording end.
    expect(o.toTick).toBeGreaterThan(s1End);
    expect(o.lanes['S2']).toEqual({ kind: 'alive' });
    // The static S1 is frozen and out of play.
    const s1 = soldier(a2.attempt.world, 'S1');
    expect(isEligible(s1)).toBe(false);
    expect(getView(a2.attempt.world).soldiers.find((s) => s.id === 'S1')!.role).toBe('static');
    const last = buildSchedule(recordsAfter1[0]!).waypoints.at(-1)!;
    expect([s1.x, s1.y]).toEqual([last.x, last.y]);
  });

  it('attempt 3: resume S1 — lead-in follows the recording with HP floored, then obeys input', () => {
    const o = a3.observation;
    expect(o.live).toEqual({ soldierId: 'S1', mode: 'resume', controlFromTick: s1End + 1 });
    expect(o.fromTick).toBeLessThanOrEqual(s1End + 1 - LEAD_IN_TICKS);
    // New segment is contiguous with the old one.
    expect(a3.liveSegment!.startTick).toBe(s1End + 1);
    const s1 = chain.records.find((r) => r.id === 'S1')!;
    expect(s1.segments).toHaveLength(2);
    expect(() => validateRecord(s1)).not.toThrow();
    // After the lead-in S1 followed the script: it walked into the compound and took the depot.
    expect(o.missionComplete).toEqual({ tick: o.toTick, bySoldierId: 'S1' });
    expect(o.lanes['S1']).toEqual({ kind: 'alive' });
    expect(a3.liveSegment!.endReason).toBe('missionComplete');
  });

  it('during the lead-in the resumed soldier is on schedule, unkillable and shown as live', () => {
    const snapshots = new SnapshotStore();
    // Rebuild the snapshot cache the way PHASE04 would have it after attempt 2.
    life({
      records: recordsAfter1,
      attempt: 2,
      live: { mode: 'new', soldierId: 'S2', spawnPointId: 'road', entryTick: secondsToTicks(2) },
      steps: S2_SNIPE_AND_HOLD,
      snapshots,
    });
    const sched = buildSchedule(recordsAfter2.find((r) => r.id === 'S1')!);
    const seen = { leadIn: 0, control: 0 };
    let hpWhenControlStarted = -1;
    life({
      records: recordsAfter2,
      attempt: 3,
      live: { mode: 'resume', soldierId: 'S1', controlFromTick: s1End + 1 },
      steps: [{ kind: 'walkStraight', to: { x: 4600, y: 1500 } }],
      fromTick: s1End + 1 - LEAD_IN_TICKS,
      snapshots,
      maxTick: s1End + 120,
      onTick: (a) => {
        const s = soldier(a.world, 'S1');
        const v = getView(a.world).soldiers.find((x) => x.id === 'S1')!;
        if (a.tick <= s1End) {
          const p = poseAt(sched, a.tick);
          expect([s.x, s.y]).toEqual([p.x, p.y]);
        }
        if (a.tick < s1End) {
          // Still in the lead-in: the next step won't take input yet.
          seen.leadIn++;
          expect(s.minHp).toBe(1);
          expect(v).toMatchObject({ role: 'live', leadIn: true });
          // Lethal damage during the lead-in is floored ([D5]).
          if (a.tick === s1End - 60) damageSoldier(a.world, s, 1000, undefined, 'test');
          if (a.tick > s1End - 60) expect(s.alive && s.hp === 1).toBe(true);
        } else {
          // From tick s1End on, the next step takes input (control starts at s1End + 1).
          seen.control++;
          if (hpWhenControlStarted < 0) hpWhenControlStarted = s.hp;
          expect(s.minHp).toBe(0);
          expect(v).toMatchObject({ role: 'live', leadIn: false });
        }
        expect(a.leadInTicksLeft()).toBe(Math.max(0, s1End + 1 - (a.tick + 1)));
      },
    });
    expect(seen.leadIn).toBeGreaterThanOrEqual(LEAD_IN_TICKS - 1);
    expect(seen.control).toBeGreaterThan(60);
    expect(hpWhenControlStarted).toBe(1);
  });

  it('input given during the lead-in is ignored (not applied retroactively)', () => {
    const a = new Attempt({
      ...base,
      soldiers: recordsAfter2,
      attempt: 3,
      from: { kind: 'start' },
      live: { mode: 'resume', soldierId: 'S1', controlFromTick: s1End },
    });
    const sched = buildSchedule(recordsAfter2.find((r) => r.id === 'S1')!);
    const push = { move: { x: 0, y: 1 }, aim: 0, fire: true, interact: true };
    a.runHeadless(s1End - 10);
    while (a.tick < s1End) {
      const r = a.step(push);
      expect(r.controlled).toBe(false);
      const p = poseAt(sched, a.tick);
      expect([soldier(a.world, 'S1').x, soldier(a.world, 'S1').y]).toEqual([p.x, p.y]);
    }
    expect(a.leadInTicksLeft()).toBe(0);
    const before = soldier(a.world, 'S1').y;
    const r = a.step(push);
    expect(r.controlled).toBe(true);
    expect(soldier(a.world, 'S1').y).toBeGreaterThan(before);
  });
});

describe('ignore the O / make history worse', () => {
  it('ignore O: a new S3 plays; S1 replays, turns static at its O and is out of play', () => {
    const res = life({
      records: recordsAfter2,
      attempt: 3,
      live: { mode: 'new', soldierId: 'S3', spawnPointId: 'road', entryTick: secondsToTicks(4) },
      steps: [{ kind: 'wait', ticks: s1End + 60 }],
      onTick: (a) => {
        if (a.tick !== s1End + 30) return;
        const s1 = soldier(a.world, 'S1');
        expect(isEligible(s1)).toBe(false);
        // Turret rays pass through it.
        const hit = castRay(a.world, { x: s1.x - 50, y: s1.y }, 0, 100, 'enemy');
        expect(hit.target?.kind).not.toBe('soldier');
      },
    });
    expect(res.observation.lanes['S1']).toEqual({ kind: 'static', tick: s1End });
    expect(res.observation.lanes['S3']).toEqual({ kind: 'alive' });
  });

  it('history made worse: S3 blows the bridge under S1, who dies earlier than its recording end', () => {
    const s1Rec = recordsAfter2.find((r) => r.id === 'S1')!;
    const onBridge = (w: World) => {
      const s = getSoldier(w, 'S1');
      return !!s && s.alive && s.x > 3215 && s.x < 3300 && s.y > 1200 && s.y < 1400;
    };
    const bridgeGone = (w: World) => w.state.bridges[0]!.state === 'destroyed';
    const steps: ScriptStep[] = [
      ...ROAD_TO_HIGHWAY,
      { kind: 'moveTo', to: { x: 2900, y: 1260 }, label: 'west of the chasm' },
      { kind: 'waitUntil', until: onBridge, label: 'wait for S1 on the bridge' },
      { kind: 'shoot', at: MISSION_01.bridges![0]!.charge!, until: bridgeGone, label: 'blow it' },
      { kind: 'wait', ticks: 60 },
    ];
    const res = life({
      records: recordsAfter2,
      attempt: 3,
      live: { mode: 'new', soldierId: 'S3', spawnPointId: 'road', entryTick: secondsToTicks(4) },
      steps,
    });
    const fate = res.observation.lanes['S1']!;
    expect(fate).toMatchObject({ kind: 'died', cause: 'bridgeCollapse' });
    expect((fate as { tick: number }).tick).toBeLessThan(recordedTo(s1Rec));
    expect(res.observation.markers).toContainEqual(
      expect.objectContaining({ soldierId: 'S3', kind: 'hazardDestroyed', refId: 'bridge-road' }),
    );
  });
});

describe('interruption at the gate (mission-01)', () => {
  const gateOpen = (w: World) => w.state.gates[0]!.open;
  // S1 opens the gate, lingers by the lever, then walks through it.
  const S1_GATE: ScriptStep[] = [
    ...ROAD_TO_HIGHWAY,
    { kind: 'moveTo', to: { x: 3500, y: 380 }, label: 'to the gate lever' },
    { kind: 'interact', label: 'open the gate' },
    { kind: 'wait', ticks: secondsToTicks(12), label: 'linger' },
    { kind: 'moveTo', to: { x: 4200, y: 400 }, label: 'through the gate' },
  ];
  const s1Life = life({
    records: [],
    attempt: 1,
    live: { mode: 'new', soldierId: 'S1', spawnPointId: 'road', entryTick: 0 },
    steps: S1_GATE,
  });

  it('S2 shuts the gate before S1 walks through: S1 freezes (interrupted), stays frozen, stays killable', () => {
    expect(s1Life.observation.lanes['S1']).toEqual({ kind: 'alive' });
    let frozenAt: { x: number; y: number; tick: number } | null = null;
    let reopened = -1;
    let checkedFrozen = false;
    const S2: ScriptStep[] = [
      ...ROAD_TO_HIGHWAY,
      { kind: 'moveTo', to: { x: 3520, y: 420 }, label: 'next to the lever' },
      { kind: 'waitUntil', until: gateOpen, label: 'S1 opens it' },
      { kind: 'interact', label: 'shut it' },
      {
        kind: 'waitUntil',
        until: (w) => getSoldier(w, 'S1')!.viewRole === 'interrupted',
        label: 'S1 freezes',
      },
      { kind: 'interact', label: 'reopen it' },
      { kind: 'wait', ticks: secondsToTicks(4) },
    ];
    const res = life({
      records: s1Life.records,
      attempt: 2,
      live: { mode: 'new', soldierId: 'S2', spawnPointId: 'road', entryTick: secondsToTicks(2) },
      steps: S2,
      onTick: (a) => {
        const s1 = soldier(a.world, 'S1');
        const echo = a.echoes.echo('S1')!;
        if (echo.mode === 'interrupted' && !frozenAt) frozenAt = { x: s1.x, y: s1.y, tick: a.tick };
        if (frozenAt && gateOpen(a.world) && reopened < 0) reopened = a.tick;
        if (frozenAt && s1.alive) {
          // Permanent for the attempt: the gate reopening doesn't revive the schedule ([D24]).
          expect([s1.x, s1.y]).toEqual([frozenAt.x, frozenAt.y]);
          expect(echo.mode).toBe('interrupted');
          expect(isEligible(s1)).toBe(true);
          expect(getView(a.world).soldiers.find((v) => v.id === 'S1')!.role).toBe('interrupted');
        }
        if (reopened > 0 && a.tick === reopened + secondsToTicks(2)) {
          checkedFrozen = true;
          damageSoldier(a.world, s1, 1000, undefined, 'test'); // still killable
        }
      },
    });
    expect(frozenAt).not.toBeNull();
    expect(frozenAt!.x).toBeLessThan(3600); // never got through the gate
    expect(checkedFrozen).toBe(true);
    const o = res.observation;
    expect(o.markers).toContainEqual(
      expect.objectContaining({
        soldierId: 'S1',
        kind: 'interrupted',
        stringKey: 'marker.interrupted',
      }),
    );
    expect(o.markers.filter((m) => m.soldierId === 'S2' && m.kind === 'interact')).toHaveLength(2);
    expect(o.lanes['S1']).toMatchObject({ kind: 'died', cause: 'test' });
  });

  it('without the kill, the observation reports the lane as interrupted', () => {
    const S2: ScriptStep[] = [
      ...ROAD_TO_HIGHWAY,
      { kind: 'moveTo', to: { x: 3520, y: 420 } },
      { kind: 'waitUntil', until: gateOpen },
      { kind: 'interact' },
      { kind: 'wait', ticks: secondsToTicks(20) },
    ];
    const res = life({
      records: s1Life.records,
      attempt: 2,
      live: { mode: 'new', soldierId: 'S2', spawnPointId: 'road', entryTick: secondsToTicks(2) },
      steps: S2,
    });
    expect(res.observation.lanes['S1']).toMatchObject({ kind: 'interrupted' });
  });
});

describe('resolve pass', () => {
  // S2 kills the turret, then dies (scripted lethal hit) well before S1's recording ends.
  const snapshots = new SnapshotStore();
  let s2Dead = -1;
  const att = life({
    records: recordsAfter1,
    attempt: 2,
    live: { mode: 'new', soldierId: 'S2', spawnPointId: 'road', entryTick: secondsToTicks(2) },
    steps: [...S2_SNIPE_AND_HOLD.slice(0, -1), { kind: 'wait', ticks: 600 }],
    snapshots,
    onTick: (a) => {
      if (s2Dead < 0 && turretDestroyed(a.world)) {
        s2Dead = a.tick + 30;
      }
      if (a.tick === s2Dead)
        damageSoldier(a.world, soldier(a.world, 'S2'), 1000, undefined, 'test');
    },
  });

  it('the attempt itself only knows S1 is alive at its end ([D3])', () => {
    expect(att.observation.toTick).toBe(s2Dead);
    expect(att.observation.toTick).toBeLessThan(s1End);
    expect(att.observation.lanes['S1']).toEqual({ kind: 'alive' });
    expect(att.observation.lanes['S2']).toMatchObject({ kind: 'died', tick: s2Dead });
  });

  it('resolves the rest headless: S1 turns static at its recording end; progress is monotonic', () => {
    const progress: AttemptObservation[] = [];
    const r = startResolve({
      ...base,
      soldiers: att.records,
      attempt: 2,
      from: { kind: 'snapshot', snapshot: snapshots.nearestValidSnapshot(att.observation.toTick)! },
      snapshots,
      onProgress: (o) => progress.push(o),
    });
    expect(r.targetTick).toBe(s1End);
    let guard = 0;
    while (!r.done && guard++ < 1000) r.advance(97);
    const o = r.observation();
    expect(o).toMatchObject({ kind: 'resolve', attempt: 2, fromTick: s2Dead, toTick: s1End });
    expect(o.live).toBeUndefined();
    expect(o.endReason).toBe('resolved');
    expect(o.lanes['S1']).toEqual({ kind: 'static', tick: s1End });
    expect(o.lanes['S2']).toBeUndefined(); // already dead when the pass started
    expect(progress.length).toBeGreaterThan(5);
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]!.toTick).toBeGreaterThan(progress[i - 1]!.toTick);
      expect(progress[i]!.markers.length).toBeGreaterThanOrEqual(progress[i - 1]!.markers.length);
      expect(progress[i]!.markers.slice(0, progress[i - 1]!.markers.length)).toEqual(
        progress[i - 1]!.markers,
      );
    }
    expect(progress.at(-1)).toEqual(o);
    // Its snapshots are valid for later deployments.
    expect(snapshots.validUntil()).toBeGreaterThanOrEqual(s1End - T.attempt.snapshotIntervalTicks);
  });

  it('can be cancelled promptly', () => {
    const r = startResolve({
      ...base,
      soldiers: att.records,
      attempt: 2,
      from: { kind: 'snapshot', snapshot: att.endSnapshot },
    });
    r.advance(30);
    const at = r.tick;
    expect(r.cancel()).toMatchObject({ done: true, cancelled: true, tick: at });
    expect(r.advance(1000).tick).toBe(at);
    expect(r.observation().toTick).toBe(at);
  });
});

describe('snapshots', () => {
  it('running from a snapshot at s gives the same hashes at s+k as running from tick 0', () => {
    const records: SoldierRecord[] = recordsAfter2;
    const s = secondsToTicks(30);
    const k = secondsToTicks(15);
    const full = new Attempt({
      ...base,
      soldiers: records,
      attempt: 3,
      from: { kind: 'start' },
      live: null,
    });
    const fullHashes = new Map<number, string>();
    let snap = null as ReturnType<Attempt['takeSnapshot']> | null;
    while (full.tick < s + k) {
      full.step();
      // Knock S2 off its schedule just before the snapshot, so it holds a planned path.
      if (full.tick === s - 5) soldier(full.world, 'S2').y += 30;
      if (full.tick === s) {
        snap = full.takeSnapshot();
        expect(full.echoes.echo('S2')!.mode).toBe('offSchedule');
        expect(snap.echoes.echoes.find((e) => e.id === 'S2')!.path).not.toBeNull();
      }
      if (full.tick >= s) fullHashes.set(full.tick, outcomeHash(full.world.state));
    }
    const resumed = new Attempt({
      ...base,
      soldiers: records,
      attempt: 3,
      from: { kind: 'snapshot', snapshot: structuredClone(snap!) },
      live: null,
    });
    expect(outcomeHash(resumed.world.state)).toBe(fullHashes.get(s));
    while (resumed.tick < s + k) {
      resumed.step();
      expect(outcomeHash(resumed.world.state), `tick ${resumed.tick}`).toBe(
        fullHashes.get(resumed.tick),
      );
    }
    expect(resumed.echoes.echo('S2')!.mode).toBe('following'); // it rejoined
  });

  it('attempts stage snapshots every interval and commit them on finish', () => {
    const store = new SnapshotStore();
    const a = new Attempt({
      ...base,
      soldiers: recordsAfter1,
      attempt: 2,
      from: { kind: 'start' },
      live: null,
      snapshots: store,
    });
    a.runHeadless(600);
    expect(store.size).toBe(0);
    a.finish();
    expect(store.ticks()).toEqual([0, 60, 120, 180, 240, 300, 360, 420, 480, 540, 600]);
    const snap = store.nearestValidSnapshot(250)!;
    expect(snap.tick).toBe(240);
    expect(() => structuredClone(snap)).not.toThrow();
  });
});
