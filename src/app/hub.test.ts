import { describe, expect, it } from 'vitest';
import { HUB_EXITS, HUB_MAP } from '../content/hub';
import { DEFAULT_TUNING } from '../content/tuning';
import { secondsToTicks } from '../sim/core/time';
import { IDLE_INPUT } from '../sim/entities/soldier';
import { getSoldier } from '../sim/sim';
import { HUB_TARGET_RESPAWN_S, HubDriver } from './hub';
import { validateMap } from '../sim/world/map';

const idle = (d: HubDriver, n: number) => {
  for (let i = 0; i < n; i++) d.step(IDLE_INPUT);
};

describe('HQ', () => {
  it('the map is valid', () => {
    expect(() => validateMap(HUB_MAP)).not.toThrow();
  });

  it('range targets stand still and get back up', () => {
    const d = new HubDriver(DEFAULT_TUNING, () => {});
    const t = d.targets[0]!;
    idle(d, 60);
    const s = getSoldier(d.world, t.id)!;
    expect(s.x).toBe(t.home.x);
    s.alive = false;
    s.hp = 0;
    s.deathTick = d.world.state.tick;
    idle(d, secondsToTicks(HUB_TARGET_RESPAWN_S) + 1);
    expect(getSoldier(d.world, t.id)!.alive).toBe(true);
  });

  it('the class rack swaps your role in place', () => {
    const d = new HubDriver(DEFAULT_TUNING, () => {});
    const before = getSoldier(d.world, d.liveId)!;
    d.setRole('sniper');
    d.step(IDLE_INPUT);
    const after = getSoldier(d.world, d.liveId)!;
    expect(after.roleId).toBe('sniper');
    expect(after.x).toBeCloseTo(before.x, 0);
  });

  it('you only leave through a gate once it has been opened', () => {
    const exits: string[] = [];
    const d = new HubDriver(DEFAULT_TUNING, (id) => exits.push(id));
    const me = getSoldier(d.world, d.liveId)!;
    const zone = HUB_EXITS.find((e) => e.id === 'skirmish')!.zone;
    me.x = zone.x + zone.w / 2;
    me.y = zone.y + zone.h / 2;
    d.step(IDLE_INPUT);
    expect(exits).toEqual([]);
    d.openExit('skirmish');
    me.x = zone.x + zone.w / 2;
    me.y = zone.y + zone.h / 2;
    d.step(IDLE_INPUT);
    expect(exits).toEqual(['skirmish']);
    expect(d.ended).toBe(true);
  });

  it('walking west from the skirmish room is blocked until the gate opens', () => {
    const d = new HubDriver(DEFAULT_TUNING, () => {});
    const me = getSoldier(d.world, d.liveId)!;
    me.x = 220;
    me.y = 620;
    const west = { ...IDLE_INPUT, move: { x: -1, y: 0 } };
    for (let i = 0; i < 60; i++) d.step(west);
    expect(getSoldier(d.world, d.liveId)!.x).toBeGreaterThan(150);
    d.openExit('skirmish');
    for (let i = 0; i < 60 && !d.ended; i++) d.step(west);
    expect(d.ended).toBe(true);
  });

  it('shooting a range target downs it', () => {
    const d = new HubDriver(DEFAULT_TUNING, () => {});
    const t = d.targets[0]!;
    const me = getSoldier(d.world, d.liveId)!;
    me.x = t.home.x;
    me.y = t.home.y - 160;
    const fire = { ...IDLE_INPUT, aim: Math.PI / 2, fire: true };
    let down = false;
    for (let i = 0; i < 240 && !down; i++) {
      d.step(fire);
      down = !getSoldier(d.world, t.id)!.alive;
    }
    expect(down).toBe(true);
  });
});
