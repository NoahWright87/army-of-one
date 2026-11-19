/**
 * (PHASE18) Basic training is "on rails" ([D155]): a player who just does the obvious thing (what
 * the chevrons point at, what the Sarge yells) gets the outcome the station is built to teach.
 * These tests play that naive player headless, station by station.
 */
import { describe, expect, it } from 'vitest';
import {
  BASIC_TRAINING,
  BASIC_TRAINING_TUNING,
  BT,
  BT_CHUTE_DELAY_S,
  BT_MINES,
  BT_TARGETS,
} from '../../content/maps/basic-training';
import { secondsToTicks } from '../core/time';
import type { SoldierInput } from '../entities/soldier';
import { getSoldier, type World } from '../sim';
import type { RoleId } from '../../contracts/mission';
import { validateMap } from '../world/map';
import { idle, run, soldierAt, world } from './helpers';

type P = { x: number; y: number };
const bt = () => world(BASIC_TRAINING, BASIC_TRAINING_TUNING);
const gateOpen = (w: World, id: string) => w.state.gates.find((g) => g.id === id)!.open;
const enemiesOf = (w: World, squad: string) =>
  w.state.soldiers.filter((s) => s.team === 'enemy' && s.spawnPointId === squad);
const alive = (w: World, id: string) => getSoldier(w, id)!.alive;

/** Toward `to` (sprinting or not), aiming at `aim` (default: where it's going). */
function toward(from: P, to: P, opts: { sprint?: boolean; aim?: P; fire?: boolean } = {}) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  const look = opts.aim ?? to;
  const input: SoldierInput = {
    move: d < 4 ? { x: 0, y: 0 } : { x: dx / d, y: dy / d },
    aim: Math.atan2(look.y - from.y, look.x - from.x),
    aimDistance: Math.hypot(look.x - from.x, look.y - from.y),
    fire: !!opts.fire,
    interact: false,
    ...(opts.sprint ? { sprint: true } : {}),
  };
  return input;
}

/** Walks a path of waypoints; returns ticks used, or -1 if it died. */
function walkPath(w: World, id: string, path: P[], opts: { sprint?: boolean } = {}, max = 60 * 30) {
  let i = 0;
  for (let t = 0; t < max; t++) {
    const s = getSoldier(w, id)!;
    if (!s.alive) return -1;
    while (i < path.length && Math.hypot(path[i]!.x - s.x, path[i]!.y - s.y) < 14) i++;
    if (i >= path.length) return t;
    run(w, 1, { [id]: toward(s, path[i]!, opts) });
  }
  return max;
}

/** Fires at `at` (tap-tap, like a player clicking) until `done`. */
function shootAt(w: World, id: string, at: () => P, done: () => boolean, max = 60 * 10) {
  for (let i = 0; i < max && !done() && alive(w, id); i++) {
    const s = getSoldier(w, id)!;
    run(w, 1, { [id]: { ...toward(s, s, { aim: at() }), fire: i % 6 < 4 } });
  }
}

/** Takes a flag: stands on it until it's ours. */
function capture(w: World, id: string, cp: string) {
  const def = w.map.capturePoints!.find((c) => c.id === cp)!;
  walkPath(w, id, [def.position]);
  for (let i = 0; i < 60 * 10; i++) {
    if (w.state.capturePoints.find((c) => c.id === cp)!.stage === 'ours') return;
    run(w, 1, { [id]: idle() });
  }
}

const spawnAt = (w: World, sp: string, roleId: RoleId = 'rifleman') => {
  const p = w.map.spawnPoints.find((s) => s.id === sp)!;
  return soldierAt(w, p.position, { roleId, facing: -Math.PI / 2 });
};

describe('basic training (PHASE18): on rails', () => {
  it('is a valid map', () => {
    expect(() => validateMap(BASIC_TRAINING)).not.toThrow();
  });

  it('R1: from the sandbags, the targets go down and the gate opens', () => {
    const w = bt();
    const me = soldierAt(w, { x: 860, y: 3620 });
    const defs = w.map.objectives!;
    for (const t of BT_TARGETS) {
      const i = defs.findIndex((o) => o.id === t);
      shootAt(
        w,
        me,
        () => defs[i]!.position,
        () => w.state.objectives[i]!.destroyed,
      );
    }
    run(w, 1);
    expect(gateOpen(w, 'bt-g1')).toBe(true);
    expect(w.state.missionComplete).toBeNull(); // practice targets don't win
  });

  it('R2: taking Alpha is safe from the MG; the chute gate opens a few seconds later', () => {
    const w = bt();
    const me = spawnAt(w, 'bt-start');
    getSoldier(w, me)!.y = BT.r2 + 200; // walked in from R1
    capture(w, me, 'bt-a');
    expect(getSoldier(w, me)!.hp).toBe(getSoldier(w, me)!.hp); // alive…
    expect(alive(w, me)).toBe(true);
    expect(getSoldier(w, me)!.hp).toBe(100); // …and never hit
    expect(gateOpen(w, 'bt-g2')).toBe(false);
    run(w, secondsToTicks(BT_CHUTE_DELAY_S) + 2, { [me]: idle() });
    expect(gateOpen(w, 'bt-g2')).toBe(true);
  });

  /** A world where Alpha is taken and the chute's gate is open; a soldier at the gate. */
  function atTheChute(roleId: RoleId = 'rifleman') {
    const w = bt();
    const me = spawnAt(w, 'bt-sp-a', roleId);
    capture(w, me, 'bt-a');
    walkPath(w, me, [{ x: 860, y: 2880 }]);
    for (let i = 0; i < 60 * 10 && !gateOpen(w, 'bt-g2'); i++) run(w, 1, { [me]: idle() });
    return { w, me };
  }
  const chute = [
    { x: 860, y: 2800 },
    { x: 860, y: 2100 },
  ];

  it('R3: walking up the chute, you die (the MG or the mines)', () => {
    const { w, me } = atTheChute();
    expect(walkPath(w, me, chute)).toBe(-1);
  });

  it('R3: sprinting up the chute, the mines get you', () => {
    const { w, me } = atTheChute();
    expect(walkPath(w, me, chute, { sprint: true })).toBe(-1);
    expect(getSoldier(w, me)!.deathCause).toBe('mine');
  });

  it('R3: shoot the mines from the gate, then sprint: you make it', () => {
    const { w, me } = atTheChute();
    const mines = w.map.mines!;
    shootAt(
      w,
      me,
      () => mines.find((m) => m.id === BT_MINES[2])!.position,
      () => w.state.mines.every((m) => m.state === 'detonated'),
    );
    expect(w.state.mines.every((m) => m.state === 'detonated')).toBe(true);
    run(w, 30, { [me]: idle() });
    expect(walkPath(w, me, chute, { sprint: true })).toBeGreaterThan(0);
  });

  it('R3: the save: guy 2 from Alpha shoots the mines as the gate opens; guy 1 sprinting lives', () => {
    const w = bt();
    const one = spawnAt(w, 'bt-sp-a');
    capture(w, one, 'bt-a');
    // Guy 2 deploys at Alpha as it's taken (after his lead-in), walks to the gate, waits.
    run(w, secondsToTicks(w.tuning.spawn.leadInSeconds), { [one]: idle() });
    const two = spawnAt(w, 'bt-sp-a');
    const gate = { x: 860, y: 2880 };
    for (let i = 0; i < 60 * 10 && !gateOpen(w, 'bt-g2'); i++) {
      run(w, 1, {
        [two]: toward(getSoldier(w, two)!, gate),
        [one]: toward(getSoldier(w, one)!, { x: 860, y: 2900 }),
      });
    }
    expect(gateOpen(w, 'bt-g2')).toBe(true);
    // Gate opens: guy 1 sprints for it; guy 2 shoots the middle mine.
    const mine = w.map.mines!.find((m) => m.id === BT_MINES[2])!.position;
    let i = 0;
    for (; i < 60 * 6 && alive(w, one); i++) {
      const s1 = getSoldier(w, one)!;
      const s2 = getSoldier(w, two)!;
      const goal = chute.find((p) => p.y < s1.y - 10) ?? chute[1]!;
      run(w, 1, {
        [one]: toward(s1, goal, { sprint: true }),
        [two]: { ...toward(s2, s2, { aim: mine }), fire: i % 6 < 4 },
      });
      if (s1.y < BT.r3) break;
    }
    expect(alive(w, one)).toBe(true);
    expect(getSoldier(w, one)!.y).toBeLessThan(BT.r3 + 60);
  });

  it('R4: round the corridor corner, the shotgunner gets the jump on a rifleman', () => {
    const w = bt();
    const me = spawnAt(w, 'bt-sp-b');
    capture(w, me, 'bt-b');
    const path = [
      { x: 970, y: 1760 },
      { x: 1100, y: 1760 },
      { x: 1320, y: 1800 },
      { x: 1320, y: 2000 },
    ];
    expect(walkPath(w, me, path)).toBe(-1);
    const sg = enemiesOf(w, 'bt-ambush')[0]!;
    expect(sg.alive).toBe(true);
  });

  it('R4: as the Shield, the same walk wins: shotgunner and MG down, then the lever', () => {
    const w = bt();
    const me = spawnAt(w, 'bt-sp-b', 'shield');
    capture(w, me, 'bt-b');
    walkPath(w, me, [
      { x: 970, y: 1760 },
      { x: 1100, y: 1760 },
      { x: 1320, y: 1800 },
      { x: 1320, y: 1880 }, // round the corner: there he is
    ]);
    const sg = enemiesOf(w, 'bt-ambush')[0]!;
    shootAt(
      w,
      me,
      () => sg,
      () => !sg.alive,
      60 * 12,
    );
    expect(sg.alive).toBe(false);
    expect(alive(w, me)).toBe(true);
    const mg = enemiesOf(w, 'bt-nest')[0]!;
    walkPath(w, me, [{ x: 1300, y: 2250 }]);
    shootAt(
      w,
      me,
      () => mg,
      () => !mg.alive,
      60 * 15,
    );
    expect(mg.alive).toBe(false);
    expect(alive(w, me)).toBe(true);
  });

  it('R5: walking in as a rifleman, the ambush kills you quickly', () => {
    const w = bt();
    const me = spawnAt(w, 'bt-sp-c');
    capture(w, me, 'bt-c');
    const t = walkPath(w, me, [
      { x: 600, y: 1260 },
      { x: 670, y: 1200 },
    ]);
    if (t >= 0) {
      // Behind the sandbags, trading shots: still loses.
      const foes = enemiesOf(w, 'bt-r5');
      shootAt(
        w,
        me,
        () => foes.find((f) => f.alive) ?? foes[0]!,
        () => !alive(w, me),
        60 * 8,
      );
    }
    expect(alive(w, me)).toBe(false);
  });

  it('R5: the Machine Gunner braced on the sandbags wins', () => {
    const w = bt();
    const me = spawnAt(w, 'bt-sp-c', 'gunner');
    capture(w, me, 'bt-c');
    walkPath(w, me, [
      { x: 600, y: 1260 },
      { x: 670, y: 1200 },
    ]);
    const foes = enemiesOf(w, 'bt-r5');
    for (let i = 0; i < 60 * 15 && alive(w, me) && foes.some((f) => f.alive); i++) {
      const s = getSoldier(w, me)!;
      const f = foes.find((x) => x.alive)!;
      run(w, 1, { [me]: { ...toward(s, s, { aim: f }), fire: true } });
    }
    expect(foes.every((f) => !f.alive)).toBe(true);
    run(w, 1);
    expect(gateOpen(w, 'bt-g6')).toBe(true);
  });

  it("R6: a rifleman can't touch the parapet man; a grenade can", () => {
    const w = bt();
    const rifle = spawnAt(w, 'bt-sp-d');
    capture(w, rifle, 'bt-d');
    const enemy = enemiesOf(w, 'bt-r6')[0]!;
    walkPath(w, rifle, [{ x: 600, y: 650 }]);
    shootAt(
      w,
      rifle,
      () => enemy,
      () => !alive(w, rifle),
      60 * 12,
    );
    expect(alive(w, rifle)).toBe(false);
    expect(enemy.alive).toBe(true);
    const nade = spawnAt(w, 'bt-sp-d', 'grenadier');
    walkPath(w, nade, [{ x: 640, y: 650 }]);
    for (let i = 0; i < 60 * 12 && enemy.alive && alive(w, nade); i++) {
      const s = getSoldier(w, nade)!;
      run(w, 1, { [nade]: { ...toward(s, s, { aim: enemy }), fire: i % 90 < 70 } });
    }
    expect(enemy.alive).toBe(false);
    run(w, 1);
    expect(gateOpen(w, 'bt-g8')).toBe(true);
  });
});
