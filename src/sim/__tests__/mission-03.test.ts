/** (06-a) mission-03 "Breach": layout rules ([D27], [D28]), scripted lives, echoes, bots. */
import { describe, expect, it } from 'vitest';
import { DEFAULT_MISSION, MISSIONS, missionOrDefault } from '../../content/maps';
import { M3, MISSION_03 } from '../../content/maps/mission-03';
import { DEFAULT_TUNING } from '../../content/tuning';
import { outcomeHash } from '../attempt/outcome-hash';
import { SnapshotStore } from '../attempt/snapshots';
import { ArmyBuilder } from '../bots/army';
import { hashState } from '../core/hash';
import { secondsToTicks, ticksToSeconds } from '../core/time';
import { runScenario } from '../scenarios/driver';
import { playLife } from '../scenarios/lives';
import {
  BREACH_CAPTURE,
  BREACH_MINES,
  BREACH_NEST_TO_WIN,
  BREACH_OPEN_GATE,
  BREACH_ROAD,
  BREACH_SNIPE_T1,
  findBreachScenario,
  runBreachRescueChain,
  SHOOT_COMMAND,
} from '../scenarios/mission-03';
import { createWorld, findPath, getSoldier, pathLength, type World } from '../sim';
import { isSpawnPointOpen } from '../world/spawn-points';

const T = DEFAULT_TUNING;

function scenario(name: string) {
  const sc = findBreachScenario(name);
  if (!sc) throw new Error(`no scenario ${name}`);
  return sc;
}

/** Gate open and drawbridge down: the unopposed map. */
function openWorld(): World {
  const w = createWorld(MISSION_03, T);
  w.state.gates[0]!.open = true;
  w.state.bridges[0]!.state = 'down';
  w.state.bridges[0]!.progressTicks = 0;
  return w;
}

const initialSpawns = MISSION_03.spawnPoints.filter((s) => s.kind === 'initial');
const forwardTick = (w: World) =>
  w.state.capturePoints.find((c) => c.id === 'cp-forward')!.capturedTick;

describe('mission-03 layout', () => {
  it('is the default mission; the others stay selectable', () => {
    expect(DEFAULT_MISSION.id).toBe('mission-03');
    expect(missionOrDefault(null).id).toBe('mission-03');
    expect(missionOrDefault('nonsense').id).toBe('mission-03');
    expect(missionOrDefault('mission-01').id).toBe('mission-01');
    expect(MISSIONS.map((m) => m.id)).toEqual(['mission-03', 'mission-01', 'mission-02']);
  });

  it('is tall and narrow: spawns at the bottom facing up, the objective at the top', () => {
    expect(MISSION_03.height).toBeGreaterThan(MISSION_03.width * 3);
    expect(initialSpawns.length).toBeGreaterThanOrEqual(2);
    expect(initialSpawns.length).toBeLessThanOrEqual(3);
    for (const sp of MISSION_03.spawnPoints) expect(sp.facing).toBeCloseTo(-Math.PI / 2);
    for (const sp of initialSpawns) expect(sp.position.y).toBeGreaterThan(MISSION_03.height * 0.9);
    const obj = MISSION_03.objectives![0]!.position;
    expect(obj.y).toBeLessThan(MISSION_03.height * 0.1);
    // A forward capture spawn in between.
    const fwd = MISSION_03.spawnPoints.find((s) => s.kind === 'capture')!;
    expect(fwd.position.y).toBeLessThan(MISSION_03.height * 0.5);
    expect(fwd.position.y).toBeGreaterThan(obj.y);
    expect(() => createWorld(MISSION_03, T)).not.toThrow();
  });

  it('no spawn point starts inside a turret’s range', () => {
    for (const sp of MISSION_03.spawnPoints) {
      for (const t of MISSION_03.turrets!) {
        const d = Math.hypot(sp.position.x - t.position.x, sp.position.y - t.position.y);
        expect(d, `${sp.id} vs ${t.id}`).toBeGreaterThan(T.turret.range + 100);
      }
    }
  });

  it('the unopposed walk (gate open, bridge down) is ~20–30 s and only goes up ([D27])', () => {
    const w = openWorld();
    for (const sp of initialSpawns) {
      const path = findPath(w, sp.position, SHOOT_COMMAND)!;
      expect(path, sp.id).not.toBeNull();
      const seconds = pathLength(path) / T.soldier.speed;
      expect(seconds, sp.id).toBeGreaterThan(20);
      expect(seconds, sp.id).toBeLessThan(30);
      // Nothing sends you back down: no leg of the path goes down the map by more than a bit.
      for (let i = 1; i < path.length; i++) {
        expect(path[i]!.y - path[i - 1]!.y, `${sp.id} leg ${i}`).toBeLessThan(60);
      }
    }
  });

  it('the gate is the only way north until it opens', () => {
    const w = createWorld(MISSION_03, T);
    expect(findPath(w, initialSpawns[0]!.position, { x: 800, y: M3.gateWallY - 200 })).toBeNull();
    w.state.gates[0]!.open = true;
    expect(
      findPath(w, initialSpawns[0]!.position, { x: 800, y: M3.gateWallY - 200 }),
    ).not.toBeNull();
  });

  it('the canal cuts off the nest until the drawbridge is lowered', () => {
    const w = createWorld(MISSION_03, T);
    w.state.gates[0]!.open = true;
    const fwd = MISSION_03.spawnPoints.find((s) => s.id === 'forward')!.position;
    expect(findPath(w, fwd, { x: 800, y: M3.canalY[0] - 100 })).toBeNull();
    expect(findPath(openWorld(), fwd, { x: 800, y: M3.canalY[0] - 100 })).not.toBeNull();
  });
});

describe('mission-03 scripted lives', () => {
  it('breach-naive: the first turret line shoots within ~3 s and kills within ~5 s ([D28])', () => {
    let firstShot = -1;
    const res = runScenario(scenario('breach-naive'), T, (_w, events) => {
      for (const e of events) {
        if (firstShot < 0 && e.kind === 'shotFired' && e.by.startsWith('t')) firstShot = e.tick;
      }
    });
    const s = getSoldier(res.world, res.soldierId)!;
    expect(s).toMatchObject({ alive: false, deathCause: 'turret' });
    expect(ticksToSeconds(firstShot)).toBeLessThan(3.2);
    expect(ticksToSeconds(s.deathTick!)).toBeLessThan(5);
  });

  it('every initial spawn walking straight up meets turret fire within ~3.5 s', () => {
    for (const sp of initialSpawns) {
      let firstShot = -1;
      runScenario(
        {
          ...scenario('breach-naive'),
          spawn: sp.id,
          steps: [{ kind: 'walkStraight', to: { x: sp.position.x, y: M3.gateWallY + 60 } }],
        },
        T,
        (_w, events) => {
          for (const e of events) {
            if (firstShot < 0 && e.kind === 'shotFired' && e.by.startsWith('t')) firstShot = e.tick;
          }
        },
      );
      expect(firstShot, sp.id).toBeGreaterThan(0);
      expect(ticksToSeconds(firstShot), sp.id).toBeLessThan(3.5);
    }
  });

  it('breach-snipe: kills T1 from out of range unhurt, then opens the gate', () => {
    const res = runScenario(scenario('breach-snipe'), T);
    expect(res.completed).toBe(true);
    expect(getSoldier(res.world, res.soldierId)!.hp).toBe(T.soldier.maxHp);
    expect(res.world.state.turrets[0]!.mode).toBe('destroyed');
    expect(res.world.state.gates[0]!.open).toBe(true);
  });

  it('breach-capture and breach-win: one life takes the Forward Post, then the Command Post', () => {
    const cap = runScenario(scenario('breach-capture'), T);
    expect(cap.completed).toBe(true);
    expect(forwardTick(cap.world)).not.toBeNull();
    const win = runScenario(scenario('breach-win'), T);
    expect(win.completed).toBe(true);
    expect(win.world.state.missionComplete).toMatchObject({ by: win.soldierId });
    expect(ticksToSeconds(win.world.state.missionComplete!.tick)).toBeLessThan(60);
  });

  it('is deterministic: the same script twice gives the same hash every 60 ticks', () => {
    const run = () => {
      const hashes: string[] = [];
      runScenario(scenario('breach-win'), T, (w) => {
        if (w.state.tick % 60 === 0) hashes.push(hashState(w.state));
      });
      return hashes;
    };
    const a = run();
    expect(a.length).toBeGreaterThan(30);
    expect(run()).toEqual(a);
  });
});

describe('mission-03 echoes', () => {
  it('rescue → O → resume: S1 dies to T1, S2 snipes T1 first, S1 resumes and opens the gate', () => {
    const chain = runBreachRescueChain(T);
    const [o1, o2, o3] = chain.observations;
    expect(o1!.lanes['S1']).toMatchObject({ kind: 'died', cause: 'turret' });
    expect(ticksToSeconds((o1!.lanes['S1'] as { tick: number }).tick)).toBeLessThan(12);
    expect(o2!.lanes['S1']!.kind).toBe('static'); // the O
    expect(o3!.live).toMatchObject({ soldierId: 'S1', mode: 'resume' });
    expect(chain.lives[2]!.historyShifted).toBeNull();
    expect(o3!.markers.some((m) => m.soldierId === 'S1' && m.kind === 'interact')).toBe(true);
    expect(o3!.lanes['S1']!.kind).toBe('alive');
  });

  it('forward capture → forward spawn: deploy at the Forward Post at its capture tick and win', () => {
    const snapshots = new SnapshotStore();
    const base = { map: MISSION_03, tuning: T, snapshots };
    const a1 = playLife({
      ...base,
      records: [],
      attempt: 1,
      live: { mode: 'new', soldierId: 'S1', spawnPointId: 'west', entryTick: 0 },
      steps: [
        ...BREACH_SNIPE_T1,
        ...BREACH_OPEN_GATE,
        ...BREACH_MINES,
        ...BREACH_ROAD,
        ...BREACH_CAPTURE,
        { kind: 'wait', ticks: 60 },
      ],
    });
    const t1 = forwardTick(a1.attempt.world)!;
    expect(t1).toBeGreaterThan(0);
    expect(isSpawnPointOpen(a1.attempt.world, 'forward', t1)).toBe(true);
    expect(a1.observation.captures!.map((c) => c.stage)).toEqual(['neutral', 'ours']);
    const a2 = playLife({
      ...base,
      records: a1.records,
      attempt: 2,
      fromTick: t1 - secondsToTicks(5),
      live: { mode: 'new', soldierId: 'S2', spawnPointId: 'forward', entryTick: t1 },
      steps: BREACH_NEST_TO_WIN,
      maxTick: t1 + secondsToTicks(60),
    });
    expect(a2.historyShifted).toBeNull();
    expect(a2.records.find((r) => r.id === 'S2')!.spawnTick).toBe(t1);
    expect(a2.observation.missionComplete?.bySoldierId).toBe('S2');
  });

  it('replays deterministically: two echo-only replays give the same outcome hash', () => {
    const a1 = playLife({
      map: MISSION_03,
      tuning: T,
      records: [],
      attempt: 1,
      live: { mode: 'new', soldierId: 'S1', spawnPointId: 'west', entryTick: 0 },
      steps: [...BREACH_SNIPE_T1, ...BREACH_OPEN_GATE, ...BREACH_MINES],
    });
    const hashes = [0, 1].map(() => {
      const r = playLife({
        map: MISSION_03,
        tuning: T,
        records: a1.records,
        attempt: 2,
        live: null,
        maxTick: a1.attempt.tick + 30,
      });
      expect(r.observation.lanes['S1']!.kind).toBe('static');
      return outcomeHash(r.attempt.world.state);
    });
    expect(hashes[0]).toBe(hashes[1]);
  });
});

describe('mission-03 bots', () => {
  it('bots build an army on it across all three spawn points (stress mode)', () => {
    const army = new ArmyBuilder({ map: MISSION_03, tuning: T, seed: 7, lifeSeconds: [10, 30] });
    army.growTo(15);
    expect(army.records).toHaveLength(15);
    const points = new Set(army.records.map((r) => r.spawnPointId));
    expect(points).toEqual(new Set(initialSpawns.map((s) => s.id)));
    const last = army.observations.at(-1)!;
    // (An attempt from a snapshot only reports the lanes still in play after its start.)
    expect(Object.keys(last.lanes).length).toBeGreaterThan(5);
    // Same seed, same army.
    const again = new ArmyBuilder({ map: MISSION_03, tuning: T, seed: 7, lifeSeconds: [10, 30] });
    again.growTo(15);
    expect(again.observations.at(-1)!.lanes).toEqual(last.lanes);
  });
});
