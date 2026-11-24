import { describe, expect, it } from 'vitest';
import { HUB_ARRIVAL_SPAWNS, HUB_EXITS, HUB_MAP } from '../content/hub';
import { DEFAULT_TUNING } from '../content/tuning';
import { gunRange, mountTicksNeeded } from '../sim/combat/guns';
import { secondsToTicks } from '../sim/core/time';
import { IDLE_INPUT } from '../sim/entities/soldier';
import { castRay, getSoldier, hasLineOfSight } from '../sim/sim';
import { HUB_TARGET_RESPAWN_S, HubDriver } from './hub';
import { canFireOver, standingCover } from '../sim/world/cover';
import { soldierVisibility } from '../sim/world/concealment';
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

  it('drills all three enemy entrances and can replay them without adding targets', () => {
    const d = new HubDriver(DEFAULT_TUNING, () => {});
    const initialCount = d.view().soldiers.length;
    const lead = secondsToTicks(DEFAULT_TUNING.spawn.leadInSeconds);
    d.launchArrivals();
    expect(d.arrivals().map((arrival) => arrival.spawnPointId)).toEqual(
      HUB_ARRIVAL_SPAWNS.map((spawn) => spawn.id),
    );
    expect(d.arrivals().every((arrival) => arrival.team === 'enemy')).toBe(true);
    idle(d, lead - 1);
    expect(d.view().soldiers).toHaveLength(initialCount);
    idle(d, 1);
    expect(d.arrivals()).toHaveLength(0);
    const ids = d
      .view()
      .soldiers.slice(initialCount)
      .map((soldier) => soldier.id);
    expect(ids).toHaveLength(3);
    d.launchArrivals();
    expect(d.view().soldiers).toHaveLength(initialCount);
    idle(d, lead);
    expect(
      d
        .view()
        .soldiers.slice(initialCount)
        .map((soldier) => soldier.id),
    ).toEqual(ids);
    expect(d.world.state.soldiers).toHaveLength(initialCount + 3);
  });

  it('routes a fallen drill target back through its entrance', () => {
    const d = new HubDriver(DEFAULT_TUNING, () => {});
    const lead = secondsToTicks(DEFAULT_TUNING.spawn.leadInSeconds);
    d.launchArrivals();
    idle(d, lead);
    const target = d.world.state.soldiers.find((soldier) => soldier.spawnPointId === 'range-boat')!;
    target.alive = false;
    target.hp = 0;
    target.deathTick = d.world.state.tick;
    idle(d, secondsToTicks(HUB_TARGET_RESPAWN_S));
    expect(d.arrivals().map((arrival) => arrival.spawnPointId)).toEqual(['range-boat']);
    expect(target.alive).toBe(false);
    idle(d, lead);
    expect(target.alive).toBe(true);
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

  it.each([340, 262])('walks up to the trench sandbags and mounts facing downrange (x=%i)', (x) => {
    const d = new HubDriver(DEFAULT_TUNING, () => {});
    d.setRole('gunner');
    d.step(IDLE_INPUT);
    const s = getSoldier(d.world, d.liveId)!;
    const aim = Math.PI / 2;
    const startingY = 1285;
    s.x = x;
    s.y = startingY;
    // Walk from the trench floor up to the bags while aiming downrange.
    for (let i = 0; i < 55; i++) {
      d.step({ ...IDLE_INPUT, aim, move: { x: 0, y: 1 } });
      expect(s.trenchClimb).toBeUndefined();
    }
    expect(s.y).toBeCloseTo(1340 - d.world.tuning.soldier.wallRadius);
    const atBags = s.y;
    for (let i = 0; i <= mountTicksNeeded(d.world.tuning, 'gunner'); i++) {
      d.step({ ...IDLE_INPUT, aim });
    }
    expect(s.y).toBe(atBags);
    expect(s.braceId).toBe('range-sandbags');
    expect(d.view().soldiers.find((soldier) => soldier.id === d.liveId)?.mounted).toBe(true);
    expect(gunRange(d.world, 'mg', s, aim)).toBeGreaterThan(d.world.tuning.mg.range);
  });

  it('reaches the tower from the lobby, mounts on the parapet and climbs back down', () => {
    const d = new HubDriver(DEFAULT_TUNING, () => {});
    d.setRole('gunner');
    const aim = Math.PI / 2;
    const south = { ...IDLE_INPUT, aim, move: { x: 0, y: 1 } };
    const north = { ...south, move: { x: 0, y: -1 } };
    for (let tick = 0; tick < 290; tick++) d.step(south);
    const s = getSoldier(d.world, d.liveId)!;
    expect(s.y).toBeCloseTo(1463);
    expect(soldierVisibility(d.world, s)).toBeGreaterThan(1);
    for (let i = 0; i <= mountTicksNeeded(d.world.tuning, 'gunner'); i++) {
      d.step({ ...IDLE_INPUT, aim });
    }
    expect(s.braceId).toBe('range-tower-south');
    const parapet = standingCover(d.world).find((c) => c.id === s.braceId)!;
    expect(parapet.bullet).toBe(0.4);
    expect(canFireOver(s, parapet, parapet.bullet, d.world.tuning)).toBe(true);
    expect(canFireOver({ x: s.x, y: 1500 }, parapet, parapet.bullet, d.world.tuning)).toBe(false);
    for (let tick = 0; tick < 150; tick++) d.step(north);
    expect(s.y).toBeLessThan(1334);
    expect(soldierVisibility(d.world, s)).toBe(1);
  });

  it('blocks the lobby wall face away from the ladder and allows a two-way climb', () => {
    const d = new HubDriver(DEFAULT_TUNING, () => {});
    const s = getSoldier(d.world, d.liveId)!;
    const north = { ...IDLE_INPUT, move: { x: 0, y: -1 } };
    const south = { ...IDLE_INPUT, move: { x: 0, y: 1 } };
    s.x = 1400;
    s.y = 765;
    for (let i = 0; i < 120; i++) d.step(north);
    expect(s.y).toBeCloseTo(729);

    s.x = 1450;
    s.y = 765;
    for (let i = 0; i < 120; i++) d.step(north);
    expect(s.y).toBeCloseTo(642);
    const ground = { x: s.x, y: 765 };
    expect(hasLineOfSight(d.world, s, ground, 'player')).toBe(true);
    expect(hasLineOfSight(d.world, ground, s, 'enemy')).toBe(false);
    // A flight segment about to enter the face still uses the wall-top launch position.
    expect(
      castRay(d.world, { x: s.x, y: 690 }, Math.PI / 2, 10, 'player', {
        coverKey: 'wall-walk-test',
        fireOverFrom: s,
      }).target,
    ).toBeNull();
    expect(castRay(d.world, ground, -Math.PI / 2, 50, 'player').target?.kind).toBe('wall');
    for (let i = 0; i < 120; i++) d.step(south);
    expect(s.y).toBeGreaterThan(735);
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
