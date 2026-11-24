import { describe, expect, it } from 'vitest';
import { BASIC_TRAINING } from '../content/maps/basic-training';
import type { SimEvent } from '../sim/events';
import type { SoldierView, WorldView } from '../sim/view';
import { BasicTraining } from './basic-training';

const me = (x: number, y: number, more: Partial<SoldierView> = {}): SoldierView => ({
  kind: 'soldier',
  id: 'S1',
  ordinal: 1,
  x,
  y,
  facing: 0,
  hp: 100,
  maxHp: 100,
  alive: true,
  role: 'live',
  leadIn: false,
  ...more,
});
const view = (soldiers: SoldierView[], events: SimEvent[] = []): WorldView =>
  ({
    soldiers,
    events,
    gates: [{ id: 'bt-g2', open: false }],
    objectives: [
      { id: 'bt-t1', x: 1150, y: 3500, destroyed: false },
      { id: 'bt-t2', x: 1270, y: 3600, destroyed: false },
    ],
    tick: 0,
  }) as unknown as WorldView;

function memory() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
}
const sarge = { x: 140, y: 4000 };

describe('basic training director', () => {
  it('greets the first life, then each room once', () => {
    const bt = new BasicTraining(memory());
    bt.reset();
    expect(bt.startLife('S1', view([me(600, 4250)]), 0)[0]).toBe('bt.intro.0');
    expect(bt.step(view([me(600, 3700)]), 100, sarge)).toEqual(['bt.r1.enter', 'bt.r1.bags']);
    expect(bt.step(view([me(600, 3650)]), 200, sarge)).toEqual([]);
  });

  it('taking Bravo unlocks the Shield, and the respawn screen then teaches it', () => {
    const bt = new BasicTraining(memory());
    bt.reset();
    bt.startLife('S1', view([me(650, 1820)]), 0);
    const lines = bt.step(
      view(
        [me(650, 1820)],
        [{ kind: 'captureStageChanged', tick: 1, id: 'bt-b', stage: 'ours', contributors: ['S1'] }],
      ),
      100,
      sarge,
    );
    expect(lines).toContain('bt.r4.done');
    expect(bt.roles()).toContain('shield');
    expect(BASIC_TRAINING.roles).toContain('shield');
    const opts = [
      { kind: 'new' as const, spawnPointId: 'bt-start', entryTick: 0 },
      { kind: 'new' as const, spawnPointId: 'bt-sp-b', entryTick: 0 },
    ];
    const hint = bt.respawnHint(opts);
    // Back in at the newest flag, as the Shield.
    expect(hint).toMatchObject({ kind: 'spawn', spawnPointId: 'bt-sp-b', role: 'shield' });
    bt.followed(hint!);
    expect(bt.respawnHint(opts)).toMatchObject({ kind: 'spawn', spawnPointId: 'bt-sp-b' });
    expect(bt.respawnHint(opts)).not.toHaveProperty('role');
  });

  it('teaches the newest class first: the Grenadier at the parapet, not a skipped MG lesson', () => {
    const store = memory();
    store.setItem(
      'aoo:bt:v1',
      JSON.stringify({
        unlocked: ['rifleman', 'shield', 'gunner', 'grenadier'],
        taught: ['role:shield', 'resume', 'spawnA'],
        lives: 9,
      }),
    );
    const bt = new BasicTraining(store);
    const opts = [{ kind: 'new' as const, spawnPointId: 'bt-sp-d', entryTick: 0 }];
    const first = bt.respawnHint(opts);
    expect(first).toMatchObject({ kind: 'spawn', role: 'grenadier' });
    bt.followed(first!);
    expect(bt.respawnHint(opts)).toMatchObject({ kind: 'spawn', role: 'gunner' });
  });

  it('a saved soldier (an O) is taught before anything else', () => {
    const bt = new BasicTraining(memory());
    bt.reset();
    bt.startLife('S1', view([me(600, 4250)]), 0);
    const hint = bt.respawnHint([
      { kind: 'new', spawnPointId: 'bt-start', entryTick: 0 },
      { kind: 'resume', soldierId: 'S1', resumeTick: 100, leadInFromTick: 40 },
    ]);
    expect(hint).toMatchObject({ kind: 'resume', soldierId: 'S1' });
  });

  it('shooting the mines on the first life earns the medal line', () => {
    const bt = new BasicTraining(memory());
    bt.reset();
    bt.startLife('S1', view([me(800, 2600)]), 0);
    const lines = bt.step(
      view(
        [me(800, 2600)],
        [{ kind: 'mineDetonated', tick: 1, id: 'bt-m1', x: 0, y: 0, radius: 90, by: 'S1' }],
      ),
      100,
      sarge,
    );
    expect(lines).toContain('bt.r3.minesEarly');
    expect(bt.progress.minesDone).toBe(true);
  });

  it('shooting at the sergeant gets a reaction', () => {
    const bt = new BasicTraining(memory());
    bt.reset();
    bt.startLife('S1', view([me(600, 4000)]), 0);
    const shot: SimEvent = {
      kind: 'shotFired',
      tick: 1,
      by: 'S1',
      fromX: 600,
      fromY: 4000,
      angle: Math.PI,
      hitX: 100,
      hitY: 4000,
    };
    expect(bt.step(view([me(600, 4000)], [shot]), 100, sarge)).toContain('bt.shotAt');
  });

  it('R1: Sarge runs to the sandbags and heckles you if you ignore him', () => {
    const bt = new BasicTraining(memory());
    bt.reset();
    bt.startLife('S1', view([me(600, 4250)]), 0);
    expect(bt.step(view([me(600, 3700)]), 100, sarge)).toEqual(['bt.r1.enter', 'bt.r1.bags']);
    const at600 = view([me(600, 3700)]);
    expect(bt.guide(at600)?.at.x).toBeLessThan(880); // by the bags, on your side
    expect(bt.guide(at600)?.at.y).toBe(3500); // opposite the next target
    expect(bt.step(at600, 3000, sarge)).toEqual([]); // gives you a moment
    expect(bt.step(at600, 8000, sarge)[0]).toBe('bt.r1.ignore.0');
    expect(bt.step(at600, 16000, sarge)[0]).toBe('bt.r1.ignore.1'); // and again
  });

  it('R1: at the bags Sarge stops heckling and names the cover the target is in', () => {
    const bt = new BasicTraining(memory());
    bt.reset();
    bt.startLife('S1', view([me(600, 4250)]), 0);
    bt.step(view([me(600, 3700)]), 100, sarge);
    const near = view([me(860, 3500)]);
    expect(bt.step(near, 300, sarge)).toEqual(['bt.r1.near', 'bt.r1.t1']);
    expect(bt.step(near, 9000, sarge)).toEqual([]);
  });

  it('start: Sarge runs ahead to the door and heckles if you stand there', () => {
    const bt = new BasicTraining(memory());
    bt.reset();
    bt.startLife('S1', view([me(600, 4250)]), 0);
    expect(bt.guide(view([me(600, 4250)]))?.at.y).toBeLessThan(4250); // ahead of you, at the door
    expect(bt.guide(view([me(600, 4250)]))?.at.y).toBeGreaterThan(3900);
    bt.step(view([me(600, 4250)]), 1000, sarge);
    const lines = bt.step(view([me(600, 4250)]), 20000, sarge);
    expect(lines[0]).toBe('bt.r0.ignore.0');
  });

  it('sprint: after the flag he waits at the gate and says it will open; then he runs ahead', () => {
    const bt = new BasicTraining(memory());
    bt.reset();
    bt.startLife('S1', view([me(860, 3100)]), 0);
    bt.step(view([me(860, 3100)]), 100, sarge);
    const taken = view(
      [me(860, 3030)],
      [{ kind: 'captureStageChanged', tick: 1, id: 'bt-a', stage: 'ours', contributors: ['S1'] }],
    );
    bt.step(taken, 200, sarge);
    const lines = bt.step(view([me(860, 3030)]), 250, sarge);
    expect(lines).toContain('bt.r2.sprint');
    const closed = bt.guide(view([me(860, 3030)]))!;
    expect(closed.at.y).toBeCloseTo(2910, -1); // just south of the gate
    const open = { ...view([me(860, 3030)]), gates: [{ id: 'bt-g2', open: true }] } as WorldView;
    expect(bt.step(open, 300, sarge)).toEqual(['bt.r2.go']);
    expect(bt.guide(open)!.at.y).toBeLessThan(closed.at.y); // through it, ahead of you
    expect(bt.step(open, 9000, sarge)[0]).toBe('bt.r2.ignore.0'); // dawdling: he heckles
  });

  it('dying: he laughs (the first time too), then the respawn view has him walk to the flag', () => {
    const bt = new BasicTraining(memory());
    bt.reset();
    bt.startLife('S1', view([me(860, 2500)]), 0);
    const died = (t: number) =>
      bt.step(
        view(
          [me(860, 2500, { alive: false })],
          [{ kind: 'soldierDied', tick: 1, id: 'S1', cause: 'mine' } as SimEvent],
        ),
        t,
        sarge,
      );
    expect(died(100)[0]).toBe('bt.death.first');
    const opts = [
      { kind: 'new' as const, spawnPointId: 'bt-start', entryTick: 0 },
      { kind: 'new' as const, spawnPointId: 'bt-sp-a', entryTick: 0 },
    ];
    bt.enterRespawn(bt.respawnHint(opts), true, 1000);
    const spot = bt.respawnGuide()!.at;
    expect(Math.abs(spot.x - 860)).toBeLessThan(100); // by Alpha
    expect(Math.abs(spot.y - 3110)).toBeLessThan(100);
    const says = bt.respawnSays(1100).map((x) => x.key);
    expect(says).toEqual(['bt.rs.explain', 'bt.coach.spawnA']);
    expect(bt.respawnSays(5000)).toEqual([]);
    expect(bt.respawnSays(12000)[0]!.key).toBe('bt.rs.ignore.0'); // no deploy: "numbnuts"
    bt.leaveRespawn();
    expect(bt.respawnGuide()).toBeNull();
  });
});
