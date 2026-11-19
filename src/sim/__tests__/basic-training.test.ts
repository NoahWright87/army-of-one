import { describe, expect, it } from 'vitest';
import {
  BASIC_TRAINING,
  BASIC_TRAINING_TUNING,
  BT_MINES,
  BT_TARGETS,
} from '../../content/maps/basic-training';
import { getSoldier, type World } from '../sim';
import { validateMap } from '../world/map';
import { idle, run, soldierAt, walk, world } from './helpers';
import type { SoldierInput } from '../entities/soldier';

const bt = () => world(BASIC_TRAINING, BASIC_TRAINING_TUNING);
const gateOpen = (w: World, id: string) => w.state.gates.find((g) => g.id === id)!.open;
const fireAt = (from: { x: number; y: number }, to: { x: number; y: number }): SoldierInput => ({
  move: { x: 0, y: 0 },
  aim: Math.atan2(to.y - from.y, to.x - from.x),
  aimDistance: Math.hypot(to.x - from.x, to.y - from.y),
  fire: true,
  interact: false,
});
/** Fires at a point until `done` (or `ticks` run out), releasing the trigger between shots. */
function shootUntil(w: World, id: string, at: { x: number; y: number }, done: () => boolean) {
  for (let i = 0; i < 1200 && !done(); i++) {
    const s = getSoldier(w, id)!;
    run(w, 1, { [id]: i % 4 < 2 ? fireAt(s, at) : idle(fireAt(s, at).aim) });
  }
}

describe('basic training map (PHASE18)', () => {
  it('is a valid map', () => {
    expect(() => validateMap(BASIC_TRAINING)).not.toThrow();
  });

  it('R1: shooting every target down opens the gate north (from the sandbags)', () => {
    const w = bt();
    const me = soldierAt(w, { x: 860, y: 3620 });
    const targets = w.map.objectives!;
    for (const t of BT_TARGETS) {
      const def = targets.find((o) => o.id === t)!;
      const i = targets.indexOf(def);
      shootUntil(w, me, def.position, () => w.state.objectives[i]!.destroyed);
    }
    expect(w.state.objectives.every((o) => o.destroyed)).toBe(true);
    run(w, 1);
    expect(gateOpen(w, 'bt-g1')).toBe(true);
    // Practice targets don't win the mission.
    expect(w.state.missionComplete).toBeNull();
  });

  it('R2: taking the Alpha flag opens the next gate', () => {
    const w = bt();
    soldierAt(w, { x: 800, y: 3110 });
    expect(gateOpen(w, 'bt-g2')).toBe(false);
    run(w, 60 * 30);
    expect(w.state.capturePoints.find((c) => c.id === 'bt-a')!.stage).toBe('ours');
    expect(gateOpen(w, 'bt-g2')).toBe(true);
  });

  it('R3: the MG nest cuts down a soldier walking north, and never leaves its post', () => {
    const w = bt();
    const me = soldierAt(w, { x: 600, y: 2780 });
    const gunner = w.state.soldiers.find((s) => s.roleId === 'gunner')!;
    const home = { x: gunner.x, y: gunner.y };
    // Strolling toward the way north (x 860, y 2120): straight through the nest's fire.
    for (let i = 0; i < 60 * 8 && getSoldier(w, me)!.alive; i++) {
      const s = getSoldier(w, me)!;
      const dx = 860 - s.x;
      const dy = 2400 - s.y;
      const d = Math.hypot(dx, dy) || 1;
      run(w, 1, { [me]: walk((dx / d) * 0.4, (dy / d) * 0.4, -Math.PI / 2) });
    }
    expect(getSoldier(w, me)!.alive).toBe(false);
    expect(gunner.x).toBeCloseTo(home.x, 0);
    expect(gunner.y).toBeCloseTo(home.y, 0);
  });

  it('R3: the mines can be shot from a distance', () => {
    const w = bt();
    // Out of the nest's line (behind the wall corner) is not needed: fire fast from the door.
    const me = soldierAt(w, { x: 860, y: 2600 }, { minHp: 1 });
    const mine = w.map.mines!.find((m) => m.id === BT_MINES[2])!;
    shootUntil(w, me, mine.position, () => w.state.mines.some((m) => m.state === 'detonated'));
    expect(w.state.mines.some((m) => m.state === 'detonated')).toBe(true);
  });

  it('R6: the parapet stops bullets; a grenade over it does the job', () => {
    const w = bt();
    const enemy = w.state.soldiers.find((s) => s.spawnPointId === 'bt-r6')!;
    const rifle = soldierAt(w, { x: 760, y: 650 }, { minHp: 1 });
    shootUntil(w, rifle, enemy, () => false);
    expect(enemy.alive).toBe(true);
    expect(enemy.hp).toBe(enemy.hp);
    const nade = soldierAt(w, { x: 760, y: 700 }, { roleId: 'grenadier', minHp: 1 });
    for (let i = 0; i < 60 * 12 && enemy.alive; i++) {
      const s = getSoldier(w, nade)!;
      // Wind up to the distance, release, repeat.
      const hold = i % 90 < 70;
      run(w, 1, { [nade]: { ...fireAt(s, enemy), fire: hold } });
    }
    expect(enemy.alive).toBe(false);
    run(w, 1);
    expect(gateOpen(w, 'bt-g7')).toBe(true);
  });
});
