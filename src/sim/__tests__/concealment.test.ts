import { describe, expect, it } from 'vitest';
import { fireRifle, fireShot } from '../combat/shots';
import { hashState } from '../core/hash';
import { secondsToTicks } from '../core/time';
import { throwGrenade } from '../entities/grenade';
import { launchRocket } from '../entities/rocket';
import { chooseTurretTarget } from '../entities/turret';
import { getSoldier, getView } from '../sim';
import { addSmoke, perceivedVisibility, soldierVisibility } from '../world/concealment';
import { type ConcealmentArea } from '../world/map';
import { arena, idle, ofKind, run, soldierAt, walk, world } from './helpers';

const trench: ConcealmentArea = {
  id: 'ditch',
  kind: 'trench',
  rect: { x: 250, y: 400, w: 180, h: 200 },
};
const bush: ConcealmentArea = {
  id: 'hedge',
  kind: 'bush',
  rect: { x: 250, y: 400, w: 180, h: 200 },
};

describe('walkable cover', () => {
  it('drops in at walking speed and requires continuous input to climb out', () => {
    const scenario = () => {
      const w = world(arena({ concealment: [trench] }));
      const id = soldierAt(w, { x: 242, y: 500 });
      const s = getSoldier(w, id)!;
      run(w, 4, { [id]: walk(1, 0) });
      expect(s.x).toBeCloseTo(242 + (4 * w.tuning.soldier.speed) / 60, 1);
      expect(soldierVisibility(w, s)).toBe(w.tuning.concealment.trench.visibility);
      run(w, 37, { [id]: walk(1, 0) });
      expect(s.trenchClimb).toBeUndefined();
      run(w, 20, { [id]: walk(1, 0) });
      const climb = s.trenchClimb!;
      expect(climb).toBeDefined();
      expect(s.x).toBeGreaterThan(climb.start + 10);
      expect(s.x).toBeLessThan(430);
      run(w, 1, { [id]: idle() });
      expect(s.x).toBe(climb.start);
      expect(s.trenchClimb).toBeUndefined();
      run(w, 45, { [id]: walk(1, 0) });
      expect(s.x).toBeLessThan(430);
      run(w, 35, { [id]: walk(1, 0) });
      expect(s.x).toBeGreaterThan(430);
      return hashState(w.state);
    };
    expect(scenario()).toBe(scenario());
  });

  it('slows entry into a bush and lets a soldier leave at full speed', () => {
    const w = world(arena({ concealment: [bush] }));
    const id = soldierAt(w, { x: 246, y: 500 });
    const s = getSoldier(w, id)!;
    run(w, 10, { [id]: walk(1, 0) });
    const inside = s.x;
    expect(inside).toBeGreaterThan(250);
    expect(inside).toBeLessThan(270);
    const hiding = soldierVisibility(w, s);
    expect(hiding).toBeGreaterThan(w.tuning.concealment.bush.visibility);
    expect(hiding).toBeLessThan(1);
    run(w, 10, { [id]: walk(-1, 0) });
    expect(s.x).toBeCloseTo(inside - (10 * w.tuning.soldier.speed) / 60, 1);
  });

  it('can layer a sandbag block and an overhead miss, and still takes blast damage', () => {
    const w = world(
      arena({
        concealment: [trench],
        cover: [
          { id: 'bags', material: 'sandbags', bullet: 1, rect: { x: 220, y: 420, w: 20, h: 160 } },
        ],
      }),
      {
        concealment: { trench: { dodge: 1 } },
        bullets: { enabled: false },
        grenade: { fragments: 0 },
      },
    );
    const id = soldierAt(w, { x: 300, y: 500 });
    const s = getSoldier(w, id)!;
    const hp = s.hp;
    const shot = {
      by: 'test',
      team: 'enemy',
      angle: 0,
      range: 300,
      damage: 20,
      cause: 'rifle',
    } as const;
    expect(fireShot(w, { ...shot, from: { x: 100, y: 500 } }).hitId).toBe('bags');
    expect(fireShot(w, { ...shot, from: { x: 245, y: 500 } }).hitId).toBeUndefined();
    expect(s.hp).toBe(hp);
    const grenade = throwGrenade(w, 'test', s, 0, 0);
    grenade.vx = 0;
    run(w, secondsToTicks(w.tuning.grenade.fuseSeconds));
    expect(s.hp).toBeLessThan(hp);
  });

  it('rolls a bush once per bullet and lets shots from inside travel out', () => {
    const w = world(arena({ concealment: [bush] }), { concealment: { bush: { bullet: 1 } } });
    const id = soldierAt(w, { x: 500, y: 500 });
    const s = getSoldier(w, id)!;
    const hp = s.hp;
    const shot = {
      by: 'test',
      team: 'enemy',
      angle: 0,
      range: 500,
      damage: 20,
      cause: 'rifle',
      speed: 600,
    } as const;
    fireShot(w, { ...shot, from: { x: 100, y: 500 } });
    run(w, 45);
    expect(s.hp).toBe(hp);
    fireShot(w, { ...shot, from: { x: 275, y: 500 } });
    run(w, 45);
    expect(s.hp).toBeLessThan(hp);
  });
});

describe('visibility', () => {
  it('starts at 100%, rises while sprinting, and reveals a shooter only briefly', () => {
    const w = world(arena({ concealment: [bush] }));
    const id = soldierAt(w, { x: 200, y: 500 });
    const s = getSoldier(w, id)!;
    expect(soldierVisibility(w, s)).toBe(1);
    run(w, 1, { [id]: { ...walk(1, 0), sprint: true } });
    expect(soldierVisibility(w, s)).toBeGreaterThan(1);
    s.x = 300;
    run(w, 1, { [id]: idle() });
    const hidden = w.tuning.concealment.bush.visibility;
    expect(soldierVisibility(w, s)).toBe(hidden);
    fireRifle(w, id, s, 0);
    expect(soldierVisibility(w, s)).toBeGreaterThan(hidden);
    run(w, secondsToTicks(w.tuning.concealment.firingSeconds));
    expect(soldierVisibility(w, s)).toBe(hidden);
  });

  it('requires a turret to get a better look at a concealed target', () => {
    const def = { id: 'turret', position: { x: 100, y: 500 }, facing: 0 };
    const w = world(arena({ concealment: [bush], turrets: [def] }), {
      ai: { enabled: false },
      turret: { range: 520 },
    });
    const player = soldierAt(w, { x: 300, y: 500 });
    expect(chooseTurretTarget(w, def)).toBeNull();
    fireRifle(w, player, getSoldier(w, player)!, 0);
    expect(chooseTurretTarget(w, def)?.id).toBe(player);
  });

  it('allows an enemy soldier to spot a sprinter beyond its normal sight range', () => {
    const w = world(
      arena({
        squads: [
          { id: 'squad', members: [{ position: { x: 800, y: 500 } }], order: { kind: 'guard' } },
        ],
      }),
      { ai: { sightRange: 600 } },
    );
    const id = soldierAt(w, { x: 120, y: 500 });
    const ai = getSoldier(w, 'E1')!.ai!;
    ai.awake = true;
    run(w, 1);
    expect(ai.targetId).toBeNull();
    run(w, 1, { [id]: { ...walk(1, 0), sprint: true } });
    ai.nextThink = w.state.tick;
    run(w, 1);
    expect(ai.targetId).toBe(id);
  });

  it('obscures sight through smoke, lets occupants see out, and leaves bullets alone', () => {
    const w = world(arena(), { bullets: { enabled: false } });
    const id = soldierAt(w, { x: 430, y: 500 });
    const s = getSoldier(w, id)!;
    const outside = { x: 100, y: 500 };
    const inside = { x: 260, y: 500 };
    addSmoke(w, 'test-cloud', inside, 50);
    expect(perceivedVisibility(w, outside, s)).toBeCloseTo(w.tuning.concealment.smoke.visibility);
    expect(perceivedVisibility(w, inside, s)).toBe(1);
    addSmoke(w, 'another-cloud', inside, 50);
    expect(perceivedVisibility(w, outside, s)).toBe(w.tuning.concealment.minVisibility);
    expect(
      fireShot(w, {
        by: 'test',
        team: 'enemy',
        from: outside,
        angle: 0,
        range: 500,
        damage: 10,
        cause: 'rifle',
      }).hitId,
    ).toBe(id);
    const lifetime = secondsToTicks(w.tuning.concealment.smoke.seconds);
    run(w, Math.floor(lifetime / 2));
    expect(perceivedVisibility(w, outside, s)).toBeGreaterThan(0.25);
    run(w, lifetime);
    expect(getView(w).smoke).toBeUndefined();
    expect(perceivedVisibility(w, outside, s)).toBe(1);
  });

  it('creates smoke at normal grenade and rocket explosions', () => {
    const w = world(arena());
    const p = { x: 140, y: 400 };
    const grenade = throwGrenade(w, 'test', p, 0, 40);
    const rocket = launchRocket(w, 'test', p, 0);
    const events = run(w, secondsToTicks(w.tuning.grenade.fuseSeconds));
    const clouds = getView(w).smoke!;
    for (const event of [
      ...ofKind(events, 'grenadeExploded'),
      ...ofKind(events, 'rocketExploded'),
    ]) {
      expect(clouds.find((c) => c.id === event.id)).toMatchObject({ x: event.x, y: event.y });
    }
    expect(clouds.map((c) => c.id)).toEqual(expect.arrayContaining([grenade.id, rocket.id]));
  });
});
