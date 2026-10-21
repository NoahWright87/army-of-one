/**
 * PHASE03-a echo behaviour in small arenas: detours, interruption, never early, crowds, static
 * figures vs. turrets, action tolerance, plus the 20-attempt chain benchmark on mission-01.
 */
import { describe, expect, it } from 'vitest';
import { MISSION_01 } from '../../content/maps/mission-01';
import { DEFAULT_TUNING } from '../../content/tuning';
import type { SoldierRecord } from '../../contracts/mission';
import { Attempt } from '../attempt/attempt';
import { secondsToTicks } from '../core/time';
import { distance, type Vec2 } from '../core/vec';
import { buildSchedule, poseAt, type Schedule } from '../recording/schedule';
import { nextSoldierId, recordedTo } from '../recording/records';
import type { ScriptStep } from '../scenarios/driver';
import { runBotChain } from '../scenarios/chain';
import { playLife, type LifeParams } from '../scenarios/lives';
import { getSoldier, type World } from '../sim';
import type { MapDef } from '../world/map';
import { arena } from './helpers';

const T = DEFAULT_TUNING;
const soldier = (w: World, id: string) => getSoldier(w, id)!;

/** Arena with a second spawn point 'b' next to a lever. */
function gateArena(extra: Partial<MapDef>): MapDef {
  const m = arena(extra);
  return {
    ...m,
    spawnPoints: [
      ...m.spawnPoints,
      { id: 'b', nameKey: 'spawn.b', position: { x: 300, y: 880 }, facing: 0, kind: 'initial' },
    ],
  };
}

function lifeOn(map: MapDef, p: Omit<LifeParams, 'map' | 'tuning'>) {
  return playLife({ map, tuning: T, ...p });
}

/** Records S1 walking `steps` from spawn 'a', then replays it with a live S2 at 'b'. */
function recordThenReplay(
  map: MapDef,
  s1: ScriptStep[],
  s2: ScriptStep[],
  onTick?: (a: Attempt, sched: Schedule) => void,
) {
  const first = lifeOn(map, {
    records: [],
    attempt: 1,
    live: { mode: 'new', soldierId: 'S1', spawnPointId: 'a', entryTick: 0 },
    steps: s1,
  });
  const sched = buildSchedule(first.records[0]!);
  const second = lifeOn(map, {
    records: first.records,
    attempt: 2,
    live: { mode: 'new', soldierId: 'S2', spawnPointId: 'b', entryTick: 0 },
    steps: s2,
    ...(onTick ? { onTick: (a: Attempt) => onTick(a, sched) } : {}),
  });
  return { first, second, sched };
}

const PULL_LEVER: ScriptStep[] = [
  { kind: 'walkStraight', to: { x: 300, y: 905 } },
  { kind: 'interact' },
];

describe('interruption and detours', () => {
  // A wall across the arena at x 490–510. S1 walks diagonally through a gate in it at y 450–550.
  const wallWith = (gap: boolean): MapDef =>
    gateArena({
      walls: [
        { x: 490, y: 0, w: 20, h: 450 },
        ...(gap
          ? [
              { x: 490, y: 550, w: 20, h: 10 },
              { x: 490, y: 640, w: 20, h: 360 },
            ]
          : [{ x: 490, y: 550, w: 20, h: 450 }]),
      ],
      gates: [{ id: 'g', rect: { x: 490, y: 450, w: 20, h: 100 }, initiallyOpen: true }],
      levers: [{ id: 'lev', position: { x: 300, y: 930 }, targetId: 'g' }],
    });
  const S1: ScriptStep[] = [
    { kind: 'walkStraight', to: { x: 150, y: 300 } },
    { kind: 'walkStraight', to: { x: 850, y: 700 } },
    { kind: 'wait', ticks: 30 },
  ];

  it('detours through another opening when that still reaches the schedule in time', () => {
    const { second, sched } = recordThenReplay(wallWith(true), S1, [
      ...PULL_LEVER,
      { kind: 'wait', ticks: 600 },
    ]);
    const w = second.attempt.world;
    expect(w.state.gates[0]!.open).toBe(false);
    expect(second.observation.lanes['S1']).toEqual({ kind: 'static', tick: sched.endTick });
    const end = sched.waypoints.at(-1)!;
    expect([soldier(w, 'S1').x, soldier(w, 'S1').y]).toEqual([end.x, end.y]);
  });

  it('freezes (interrupted) when no route reaches the schedule in time', () => {
    let frozen: Vec2 | null = null;
    const { second } = recordThenReplay(
      wallWith(false),
      S1,
      [...PULL_LEVER, { kind: 'wait', ticks: 600 }],
      (a) => {
        const s = soldier(a.world, 'S1');
        if (a.echoes.echo('S1')!.mode === 'interrupted') {
          frozen ??= { x: s.x, y: s.y };
          expect([s.x, s.y]).toEqual([frozen.x, frozen.y]);
        }
      },
    );
    expect(second.observation.lanes['S1']).toMatchObject({ kind: 'interrupted' });
    expect(frozen!.x).toBeLessThan(490);
  });
});

describe('never early', () => {
  // A closed gate stands alone in the open: S1 originally walked around it.
  const map = gateArena({
    gates: [{ id: 'g', rect: { x: 480, y: 380, w: 40, h: 240 }, initiallyOpen: false }],
    levers: [{ id: 'lev', position: { x: 300, y: 930 }, targetId: 'g' }],
  });
  const S1: ScriptStep[] = [
    { kind: 'moveTo', to: { x: 900, y: 500 } },
    { kind: 'wait', ticks: 30 },
  ];

  it('with the obstacle gone, the echo still walks its recorded detour, exactly on time', () => {
    const { first, second, sched } = recordThenReplay(
      map,
      S1,
      [...PULL_LEVER, { kind: 'wait', ticks: 600 }],
      (a, sched) => {
        if (a.tick < 10 || a.tick > sched.endTick) return;
        const s = soldier(a.world, 'S1');
        const p = poseAt(sched, a.tick);
        expect([s.x, s.y]).toEqual([p.x, p.y]);
      },
    );
    // The detour was real: the recording is much longer than the straight line.
    const ys = first.records[0]!.segments[0]!.waypoints.map((w) => w.y);
    expect(Math.min(...ys) < 380 || Math.max(...ys) > 620).toBe(true);
    expect(second.attempt.world.state.gates[0]!.open).toBe(true);
    expect(second.observation.lanes['S1']).toEqual({ kind: 'static', tick: sched.endTick });
  });

  it('knocked off schedule, it pathfinds (taking the new shortcut) but never arrives early', () => {
    const offTicks: number[] = [];
    const knockAt = 60;
    const { second, sched } = recordThenReplay(
      map,
      S1,
      [...PULL_LEVER, { kind: 'wait', ticks: 600 }],
      (a, sched) => {
        const s = soldier(a.world, 'S1');
        if (a.tick === knockAt) s.y += 40; // test hook: shove it off its schedule
        const echo = a.echoes.echo('S1')!;
        if (echo.mode !== 'offSchedule') return;
        offTicks.push(a.tick);
        // Never ahead of the schedule: not at the planned point before its tick.
        const goal = poseAt(sched, echo.pathGoalTick);
        if (a.tick < echo.pathGoalTick) expect(distance(s, goal)).toBeGreaterThan(0.5);
        // ...and never closer to the final destination than the schedule is.
        const end = sched.waypoints.at(-1)!;
        expect(distance(s, end)).toBeGreaterThanOrEqual(
          distance(poseAt(sched, a.tick), end) - T.echo.snapDistance - 40,
        );
      },
    );
    expect(offTicks.length).toBeGreaterThan(0);
    expect(offTicks[0]).toBe(knockAt + 1);
    // It rejoined and finished on schedule.
    expect(second.attempt.echoes.echo('S1')!.mode).toBe('static');
    expect(second.observation.lanes['S1']).toEqual({ kind: 'static', tick: sched.endTick });
    const end = sched.waypoints.at(-1)!;
    const s1 = soldier(second.attempt.world, 'S1');
    expect([s1.x, s1.y]).toEqual([end.x, end.y]);
  });
});

describe('crowd', () => {
  const map = gateArena({});
  // Ten soldiers line up across the live soldier's path and hold there.
  const post = (i: number): ScriptStep[] => [
    { kind: 'moveTo', to: { x: 500, y: 440 + i * 12 } },
    { kind: 'wait', ticks: secondsToTicks(12) - i * 30 },
  ];

  function crowd(): SoldierRecord[] {
    let records: SoldierRecord[] = [];
    for (let i = 0; i < 10; i++) {
      const id = nextSoldierId(records);
      records = lifeOn(map, {
        records,
        attempt: i + 1,
        live: { mode: 'new', soldierId: id, spawnPointId: 'a', entryTick: i * 30 },
        steps: post(i),
      }).records;
    }
    return records;
  }
  const records = crowd();

  it('a live soldier squirms through 10 on-schedule echoes without moving them', () => {
    const scheds = records.map(buildSchedule);
    let crossedAt = -1;
    let minStep = Infinity;
    let lastX: number | null = null;
    const res = lifeOn(map, {
      records,
      attempt: 11,
      live: { mode: 'new', soldierId: 'S11', spawnPointId: 'a', entryTick: secondsToTicks(8) },
      steps: [{ kind: 'walkStraight', to: { x: 800, y: 500 } }],
      onTick: (a) => {
        for (const sc of scheds) {
          if (a.tick < sc.spawnTick || a.tick > sc.endTick) continue;
          const s = soldier(a.world, sc.id);
          const p = poseAt(sc, a.tick);
          expect([s.x, s.y], `${sc.id} @${a.tick}`).toEqual([p.x, p.y]);
          expect(a.echoes.echo(sc.id)!.mode).toBe('following');
        }
        const live = getSoldier(a.world, 'S11');
        if (live && lastX !== null) minStep = Math.min(minStep, live.x - lastX);
        lastX = live?.x ?? null;
        if (crossedAt < 0 && (live?.x ?? 0) > 520) crossedAt = a.tick;
      },
    });
    expect(crossedAt).toBeGreaterThan(0);
    // It really was held back by the (unmoved) echoes for a moment.
    expect(minStep).toBeLessThan((T.soldier.speed / 60) * 0.75);
    // Got through without being held up for long (straight walk would take ~4.4 s).
    expect(crossedAt - secondsToTicks(8)).toBeLessThan(secondsToTicks(5));
    for (const sc of scheds) expect(res.observation.lanes[sc.id]!.kind).not.toBe('interrupted');
  });

  it('echoes knocked off schedule into the crowd get pushed around, then rejoin', () => {
    const knocked = ['S3', 'S5', 'S7'];
    const wasOff = new Set<string>();
    const res = lifeOn(map, {
      records,
      attempt: 11,
      live: { mode: 'new', soldierId: 'S11', spawnPointId: 'a', entryTick: secondsToTicks(8) },
      steps: [
        { kind: 'walkStraight', to: { x: 800, y: 500 } },
        { kind: 'wait', ticks: 240 },
      ],
      onTick: (a) => {
        if (a.tick === secondsToTicks(9)) for (const id of knocked) soldier(a.world, id).x -= 6;
        for (const id of knocked) if (a.echoes.echo(id)!.mode === 'offSchedule') wasOff.add(id);
      },
    });
    expect([...wasOff].sort()).toEqual(knocked);
    for (const r of records) {
      expect(res.observation.lanes[r.id], r.id).toEqual({ kind: 'static', tick: recordedTo(r) });
      const s = soldier(res.attempt.world, r.id);
      const end = buildSchedule(r).waypoints.at(-1)!;
      expect([s.x, s.y], r.id).toEqual([end.x, end.y]);
    }
  });
});

describe('static figures, actions', () => {
  const map = gateArena({
    turrets: [{ id: 't', position: { x: 800, y: 500 }, facing: Math.PI }],
  });

  it('a static echo inside a turret’s range is never targeted', () => {
    // S1 steps into range and its recording ends before the turret's wind-up finishes.
    const first = lifeOn(map, {
      records: [],
      attempt: 1,
      live: { mode: 'new', soldierId: 'S1', spawnPointId: 'a', entryTick: 0 },
      steps: [
        { kind: 'walkStraight', to: { x: 370, y: 500 } },
        { kind: 'walkStraight', to: { x: 400, y: 500 } },
      ],
    });
    expect(first.observation.lanes['S1']).toEqual({ kind: 'alive' });
    const a = new Attempt({
      map,
      tuning: T,
      soldiers: first.records,
      attempt: 2,
      from: { kind: 'start' },
      live: null,
    });
    a.runHeadless(recordedTo(first.records[0]!) + secondsToTicks(5));
    const o = a.finish().observation;
    expect(o.lanes['S1']).toEqual({ kind: 'static', tick: recordedTo(first.records[0]!) });
    expect(soldier(a.world, 'S1')).toMatchObject({ alive: true, hp: T.soldier.maxHp });
    expect(a.world.state.turrets[0]!.mode).toBe('idle');
  });

  it('recorded shots replay from the current position at the recorded angle, within tolerance only', () => {
    const shoot: ScriptStep[] = [
      { kind: 'walkStraight', to: { x: 300, y: 500 } },
      {
        kind: 'shoot',
        at: { x: 800, y: 500 },
        until: (w) => w.state.turrets[0]!.mode === 'destroyed',
      },
    ];
    const first = lifeOn(map, {
      records: [],
      attempt: 1,
      live: { mode: 'new', soldierId: 'S1', spawnPointId: 'a', entryTick: 0 },
      steps: shoot,
    });
    const shots = first.liveSegment!.actions.filter((x) => x.kind === 'shot');
    expect(shots.length).toBe(T.turret.maxHp / T.rifle.damage);
    // Replay with the echo shoved 30 units away right before its 3rd shot: that one is skipped.
    const third = shots[2]!;
    const a = new Attempt({
      map,
      tuning: T,
      soldiers: first.records,
      attempt: 2,
      from: { kind: 'start' },
      live: null,
    });
    const divergences: number[] = [];
    const fired: { t: number; x: number; y: number; angle: number }[] = [];
    while (a.tick < recordedTo(first.records[0]!) + 30) {
      if (a.tick === third.t - 1) soldier(a.world, 'S1').y += 30;
      for (const e of a.step().events) {
        if (e.kind === 'echoDivergence') divergences.push(e.tick);
        if (e.kind === 'shotFired' && e.by === 'S1')
          fired.push({ t: e.tick, x: e.fromX, y: e.fromY, angle: e.angle });
      }
    }
    // The shoved echo walks back (on time, never early), skipping shots while it's too far.
    expect(divergences[0]).toBe(third.t);
    expect([...divergences, ...fired.map((f) => f.t)].sort((x, y) => x - y)).toEqual(
      shots.map((s) => s.t),
    );
    for (const f of fired) {
      const rec = shots.find((s) => s.t === f.t)!;
      expect(f.angle).toBe(rec.angle);
      expect(Math.hypot(f.x - rec.x, f.y - rec.y)).toBeLessThanOrEqual(T.echo.actionTolerance);
    }
    expect(fired.length).toBeGreaterThan(divergences.length);
    // One shot short: the turret survives.
    expect(a.world.state.turrets[0]!.mode).not.toBe('destroyed');
  });
});

describe('chain of 20 attempts (mission-01)', () => {
  // The timeout is only a coarse guard against pathological slowdowns: it runs alongside the
  // whole suite in parallel, so a tight wall-clock limit flakes. Measure real speed with
  // `npm run sim -- --scenario chain`, which prints ticks/sec.
  it('runs headless fast, reusing snapshots', { timeout: 15_000 }, () => {
    const { records, lives } = runBotChain(T, 20);
    for (const l of lives) expect(l.historyShifted).toBeNull();
    // Attempts start from snapshots, not tick 0, once entries are past the lead-in.
    expect(lives.filter((l) => l.observation.fromTick > 0).length).toBeGreaterThan(5);
    expect(records).toHaveLength(20);
    // Everyone replayed to their O in the last attempt's history.
    const last = new Attempt({
      map: MISSION_01,
      tuning: T,
      soldiers: records,
      attempt: 21,
      from: { kind: 'start' },
      live: null,
    });
    const end = Math.max(...records.map(recordedTo));
    last.runHeadless(end + 1);
    const o = last.finish().observation;
    for (const r of records)
      expect(o.lanes[r.id], r.id).toEqual({ kind: 'static', tick: recordedTo(r) });
  });
});

describe('replaying lever presses (tuning.echo.replayInteract)', () => {
  // S1 walks to a lever and opens the gate. In attempt 2, S2 opened it first from another lever.
  const map = gateArena({
    gates: [{ id: 'g', rect: { x: 600, y: 100, w: 20, h: 200 }, initiallyOpen: false }],
    levers: [
      { id: 'lev-a', position: { x: 300, y: 520 }, targetId: 'g' },
      { id: 'lev-b', position: { x: 300, y: 930 }, targetId: 'g' },
    ],
  });
  const S1: ScriptStep[] = [
    { kind: 'wait', ticks: 60 },
    { kind: 'walkStraight', to: { x: 300, y: 500 } },
    { kind: 'interact' },
    { kind: 'wait', ticks: 30 },
  ];
  const run = (replayInteract: 'toggle' | 'restoreState') => {
    const tuning = { ...T, echo: { ...T.echo, replayInteract } };
    const first = playLife({
      map,
      tuning,
      records: [],
      attempt: 1,
      live: { mode: 'new', soldierId: 'S1', spawnPointId: 'a', entryTick: 0 },
      steps: S1,
    });
    expect(first.liveSegment!.actions).toContainEqual(
      expect.objectContaining({ kind: 'interact', targetId: 'lev-a', on: true }),
    );
    const second = playLife({
      map,
      tuning,
      records: first.records,
      attempt: 2,
      live: { mode: 'new', soldierId: 'S2', spawnPointId: 'b', entryTick: 0 },
      steps: [...PULL_LEVER, { kind: 'wait', ticks: 300 }],
    });
    return second.attempt.world.state.gates[0]!.open;
  };

  it("'toggle' presses again literally (closing the gate someone already opened)", () => {
    expect(run('toggle')).toBe(false);
  });

  it("'restoreState' leaves a target already in the recorded resulting state alone", () => {
    expect(run('restoreState')).toBe(true);
  });
});
