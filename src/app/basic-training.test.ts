import { describe, expect, it } from 'vitest';
import { BASIC_TRAINING } from '../content/maps/basic-training';
import type { SimEvent } from '../sim/events';
import type { SoldierView, WorldView } from '../sim/view';
import { DEFAULT_SARGE_SCRIPT } from '../content/sarge-script';
import { BasicTraining } from './basic-training';
import type { SargeStep } from '../content/sarge-script';
import { SargeRunner, checkWhen, validateScript } from './sarge-engine';

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
      { id: 'bt-a1', x: 420, y: 4700, hp: 50, destroyed: false, target: true },
      { id: 'bt-b1', x: 1010, y: 4500, hp: 50, destroyed: false, target: true },
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
const ids = (says: { id: string }[]) => says.map((x) => x.id);

describe('basic training director', () => {
  it('greets the first life, then each room once', () => {
    const bt = new BasicTraining(memory());
    bt.reset();
    expect(ids(bt.startLife('S1', view([me(600, 6040)]), 0))).toEqual(['intro', 'intro']);
    expect(ids(bt.step(view([me(600, 5500)]), 100, sarge))).toEqual(['r1.enter', 'r1.enter']);
    expect(ids(bt.step(view([me(600, 5450)]), 200, sarge))).toEqual([]);
  });

  it('nothing Sarge says names a button or a device (the painted instructions do that)', () => {
    const device =
      /\b(wasd|shift|click|clicking|button|buttons|tap|tapping|key|keys|press|mouse|touch|screen)\b/i;
    for (const rule of DEFAULT_SARGE_SCRIPT.rules) {
      for (const step of rule.steps) {
        if (step.k !== 'say') continue;
        for (const text of step.say) {
          expect(text, `${rule.id}: "${text}"`).not.toMatch(device);
        }
      }
    }
  });

  it('the default script has no mistakes in it', () => {
    expect(validateScript(DEFAULT_SARGE_SCRIPT)).toEqual([]);
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
    expect(ids(lines)).toContain('r4.done');
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
      'aoo:bt:v3',
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
    expect(ids(lines)).toContain('r3.minesEarly');
    expect(bt.progress.had).toContain('minesShot');
  });

  it('a stray shot past Sarge is nothing; sustained fire through him gets a varied reaction', () => {
    const bt = new BasicTraining(memory());
    bt.reset();
    bt.startLife('S1', view([me(600, 4000)]), 0);
    const shot = (t: number): SimEvent => ({
      kind: 'shotFired',
      tick: t,
      by: 'S1',
      fromX: 600,
      fromY: 4000,
      angle: Math.PI,
      hitX: 100,
      hitY: 4000,
    });
    // One stray shot, and an auto-fire sweep spread over a long time: no reaction.
    expect(ids(bt.step(view([me(600, 4000)], [shot(1)]), 100, sarge))).not.toContain('shotAt');
    for (let i = 0; i < 4; i++) {
      expect(
        ids(bt.step(view([me(600, 4000)], [shot(2 + i)]), 5000 + i * 5000, sarge)),
      ).not.toContain('shotAt');
    }
    // A burst of deliberate fire through him: he reacts, and cuts off whatever he was saying.
    const burst = Array.from({ length: 6 }, (_, i) => shot(10 + i));
    const says = bt.step(view([me(600, 4000)], burst), 60000, sarge);
    expect(ids(says)).toContain('shotAt');
    expect(says.find((x) => x.id === 'shotAt')!.urgent).toBe(true);
    // The next burst (after his cooldown) gets a different line.
    bt.step(view([me(600, 4000)]), 70000, sarge); // (the game keeps stepping in between)
    const again = bt.step(view([me(600, 4000)], burst), 80000, sarge);
    const lines = [says, again].map((x) => x.find((y) => y.id === 'shotAt')!.text);
    expect(lines[1]).not.toBe(lines[0]);
  });

  it('start: Sarge charges ahead to the door, and heckles within a couple of seconds of standing still', () => {
    const bt = new BasicTraining(memory());
    bt.reset();
    bt.startLife('S1', view([me(600, 6040)]), 0);
    const g = bt.guide(view([me(600, 6040)]))!;
    expect(g.at!.y).toBeLessThan(6040); // ahead of you, at the first door
    expect(g.at!.y).toBeGreaterThan(5680);
    const still = view([me(600, 6040)]);
    expect(bt.step(still, 1000, sarge)).toEqual([]);
    expect(bt.step(still, 2000, sarge)).toEqual([]); // still for 2 s: the clock starts
    const says = bt.step(still, 4100, sarge);
    expect(ids(says)).toEqual(['r0.heckle']);
    expect(says[0]!.text).toContain("C'mon, follow me maggot"); // the first of his four
    // ...and he keeps at it every couple of seconds, with a different line each time.
    const next = bt.step(still, 6200, sarge);
    expect(ids(next)).toEqual(['r0.heckle']);
    expect(next[0]!.text).not.toBe(says[0]!.text);
  });

  it('R1: an open field of targets: he cheers you on, and teases you if you hesitate', () => {
    const bt = new BasicTraining(memory());
    bt.reset();
    bt.startLife('S1', view([me(600, 6040)]), 0);
    const field = view([me(600, 5500)]);
    expect(ids(bt.step(field, 100, sarge))).toEqual(['r1.enter', 'r1.enter']);
    expect(bt.step(field, 2000, sarge)).toEqual([]);
    expect(bt.step(field, 4300, sarge)).toEqual([]); // 4 s without firing: the clock starts
    expect(ids(bt.step(field, 6500, sarge))).toEqual(['r1.hesitate']);
  });

  it('R1: lots of misses earn some gentle advice', () => {
    const bt = new BasicTraining(memory());
    bt.reset();
    bt.startLife('S1', view([me(600, 6040)]), 0);
    const shot = (n: number): SimEvent[] =>
      Array.from({ length: n }, (_, i) => ({
        kind: 'shotFired',
        tick: i,
        by: 'S1',
        fromX: 600,
        fromY: 4950,
        angle: 0,
        hitX: 1100,
        hitY: 4950,
      })) as SimEvent[];
    bt.step(view([me(1000, 5400)]), 100, sarge);
    expect(ids(bt.step(view([me(1000, 5400)], shot(5)), 500, sarge))).toEqual([]);
    expect(ids(bt.step(view([me(1000, 5400)], shot(5)), 900, sarge))).toEqual(['r1.aim']); // 10 misses
  });

  it('R1B: shooting from back on the path gets "get to cover"; next to the bags he explains bracing', () => {
    const bt = new BasicTraining(memory());
    bt.reset();
    bt.startLife('S1', view([me(2040, 4950)]), 0);
    const shot = (x: number): SimEvent[] => [
      {
        kind: 'shotFired',
        tick: 1,
        by: 'S1',
        fromX: x,
        fromY: 4500,
        angle: Math.PI,
        hitX: 1500,
        hitY: 4500,
      } as SimEvent,
    ];
    bt.step(view([me(2060, 4500)]), 100, sarge); // walks into the lane
    const back = bt.step(view([me(2060, 4500)], shot(2060)), 600, sarge);
    expect(ids(back)).toEqual(['r1b.back']);
    expect(bt.step(view([me(2060, 4500)], shot(2060)), 1000, sarge)).toEqual([]); // not every shot
    const at = view([
      me(1935, 4500, { loadout: { stance: 'standing', coverNear: true } as never }),
    ]);
    expect(ids(bt.step(at, 8000, sarge))).toContain('r1b.near');
    // Next to cover but not braced yet: he says how (without naming a button).
    const settle = bt.step(at, 10000, sarge);
    expect(ids(settle)).toEqual(['r1b.brace']);
    expect(settle[0]!.text).not.toMatch(/\b(Z|shift|click|tap|key|button)\b/i);
    expect(bt.guide(at)!.at!.x).toBeGreaterThan(1900); // he's at the bags, on your side
    // Once braced he explains what that buys.
    const braced = view([
      me(1935, 4500, { loadout: { stance: 'braced', coverNear: true } as never }),
    ]);
    expect(ids(bt.step(braced, 11000, sarge))).toContain('r1b.braced');
  });

  it('being hurt, anywhere, gets a "walk it off"', () => {
    const bt = new BasicTraining(memory());
    bt.reset();
    bt.startLife('S1', view([me(1000, 3700)]), 0);
    expect(bt.step(view([me(1000, 3700)]), 100, sarge)).toEqual([]);
    const says = bt.step(view([me(1000, 3700, { hp: 60 })]), 200, sarge);
    expect(ids(says)).toContain('hurt');
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
    const first = bt.step(taken, 200, sarge);
    expect(ids(first)).toContain('r2.done');
    const lines = bt.step(view([me(860, 3030)]), 250, sarge);
    expect(ids(lines)).toContain('r2.sprint');
    const closed = bt.guide(view([me(860, 3030)]))!;
    expect(closed.at!.y).toBeCloseTo(2910, -1); // just south of the gate
    const open = { ...view([me(860, 3030)]), gates: [{ id: 'bt-g2', open: true }] } as WorldView;
    expect(ids(bt.step(open, 300, sarge))).toEqual(['r2.go']);
    expect(bt.guide(open)!.at!.y).toBeLessThan(closed.at!.y); // through it, ahead of you
    expect(ids(bt.step(open, 8000, sarge))).toEqual(['r2.heckle']); // dawdling: he heckles
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
    const first = died(100);
    expect(ids(first)).toEqual(['death.first', 'r3.mine']);
    expect(first[0]!.urgent).toBe(true);
    const opts = [
      { kind: 'new' as const, spawnPointId: 'bt-start', entryTick: 0 },
      { kind: 'new' as const, spawnPointId: 'bt-sp-a', entryTick: 0 },
    ];
    bt.enterRespawn(bt.respawnHint(opts), true, 1000);
    const spot = bt.respawnGuide()!.at!;
    expect(Math.abs(spot.x - 860)).toBeLessThan(100); // by Alpha
    expect(Math.abs(spot.y - 3110)).toBeLessThan(100);
    const says = bt.respawnSays(1100);
    expect(ids(says)).toEqual(['rs.explain', 'rs.spawnA']);
    expect(says[1]!.text).toBe('Deploy at Alpha, the flag you took');
    expect(bt.respawnSays(2000)).toEqual([]);
    expect(ids(bt.respawnSays(4500))).toEqual(['rs.heckle']); // no deploy: "numbnuts"
    bt.leaveRespawn();
    expect(bt.respawnGuide()).toBeNull();
  });

  it('the first screen: a welcome, who he is, then DEPLOY', () => {
    const bt = new BasicTraining(memory());
    bt.reset();
    bt.enterRespawn(
      bt.respawnHint([{ kind: 'new', spawnPointId: 'bt-start', entryTick: 0 }]),
      false,
      0,
    );
    expect(ids(bt.respawnSays(10))).toEqual(['rs.welcome', 'rs.welcome', 'rs.welcome']);
  });

  it('his silence counts from when he stops talking (the overlay tells the director)', () => {
    const bt = new BasicTraining(memory());
    bt.reset();
    bt.enterRespawn(
      bt.respawnHint([{ kind: 'new', spawnPointId: 'bt-start', entryTick: 0 }]),
      false,
      0,
    );
    bt.respawnSays(10);
    bt.spoke(14000); // still talking at 14 s
    expect(bt.respawnSays(15000)).toEqual([]); // 1 s of quiet isn't enough
    expect(ids(bt.respawnSays(16500))).toEqual(['rs.heckle.first']); // a couple of seconds is
  });

  it('an edited script takes effect at once, and a beat can be switched off', () => {
    const bt = new BasicTraining(memory());
    bt.reset();
    bt.startLife('S1', view([me(600, 6040)]), 0);
    const script = structuredClone(bt.script);
    script.rules.find((x) => x.id === 'r1.enter')!.steps = [
      { k: 'say', say: ['Hello, [gold]private[/].'] },
    ];
    script.rules.find((x) => x.id === 'r1.hesitate')!.off = true;
    bt.setScript(script);
    const says = bt.step(view([me(600, 5500)]), 100, sarge);
    expect(says[0]!.text).toBe('Hello, [gold]private[/].');
    expect(ids(bt.step(view([me(600, 5500)]), 20000, sarge))).toEqual([]);
  });

  it('a zone from the script: entering and leaving it are moments rules can use', () => {
    const bt = new BasicTraining(memory());
    bt.reset();
    const script = structuredClone(bt.script);
    script.rules = [
      { id: 'in', when: 'enter:bags', steps: [{ k: 'say', say: ['in!'] }], repeat: true },
      { id: 'out', when: 'leave:bags', steps: [{ k: 'say', say: ['out!'] }], repeat: true },
      { id: 'long', when: 'inFor:bags:3', steps: [{ k: 'say', say: ['3s!'] }], repeat: true },
    ];
    bt.setScript(script);
    bt.startLife('S1', view([me(1500, 4500)]), 0);
    const bags = (x: number, t: number) => ids(bt.step(view([me(x, 4500)]), t, sarge));
    expect(bags(1700, 100)).toEqual([]); // outside
    expect(bags(1900, 200)).toEqual(['in']); // walks into the sandbag zone
    expect(bags(1900, 2000)).toEqual([]);
    expect(bags(1900, 3500)).toEqual(['long']); // 3 seconds in
    expect(bags(1700, 3600)).toEqual(['out']); // and out
  });

  it('start here: stations carry on from what has happened before them', () => {
    const bt = new BasicTraining(memory());
    bt.reset();
    bt.startAt(['captured:bt-a', 'minesShot'], ['shield']);
    expect(bt.roles()).toContain('shield');
    // The chute is behind him: no sprint talk, no mine hints; just the room he starts in.
    expect(ids(bt.startLife('S1', view([me(650, 1900)]), 0))).toEqual(['r4.enter']);
    expect(ids(bt.step(view([me(650, 1900)]), 100, sarge))).toEqual([]);
  });
});

describe('the script engine', () => {
  const clone = () => structuredClone(DEFAULT_SARGE_SCRIPT);
  const blank = {
    edges: new Set<string>(),
    inRoomS: 0,
    quietS: 0,
    had: new Set<string>(),
    lives: 1,
    deaths: 0,
    deathsIn: {},
    taught: [],
    cause: null,
    zonesIn: new Set<string>(),
    room: null as string | null,
    zoneSinceS: (() => null) as (z: string) => number | null,
    flags: new Set<string>(),
    flagSinceS: (() => null) as (f: string) => number | null,
    gateOpen: () => false,
    nextTarget: null,
    targetsLeft: (() => false) as (stall: string) => boolean,
    holdFireS: 0,
    stillS: 0,
    misses: 0,
    inCorridor: false,
    stance: 'standing',
    coverNear: false,
    atSpawn: () => false,
    respawn: null,
  };
  const say = (text: string): SargeStep => ({ k: 'say', say: [text] });

  it('says what is wrong with a condition, in words', () => {
    const s = clone();
    expect(checkWhen('enter:r1, bogus, waited:x, in:nowhere, flag:nope, enter:r99', s)).toEqual([
      '"bogus" isn\'t a token I know',
      '"waited:x" needs seconds (like waited:…)',
      'there\'s no zone called "nowhere"',
      'there\'s no flag called "nope"',
      'there\'s no zone called "r99"',
    ]);
    s.rules.push(
      { id: 'dup', when: 'in:r1', steps: [say('x')] },
      { id: 'dup', when: 'nope', steps: [say('y')] },
    );
    expect(validateScript(s).join('|')).toContain('Two rules are called "dup"');
    s.zones.push({ id: 'r1', name: 'clash', x: 0, y: 0, w: 1, h: 1 });
    expect(validateScript(s).join('|')).toContain("has a room's name");
  });

  it('a rule runs when its condition turns true, not every frame; repeat lets it run again', () => {
    const script = clone();
    script.rules = [
      { id: 'once', when: 'in:r1', steps: [say('a')] },
      { id: 'again', when: 'in:r1', steps: [say('b')], repeat: true },
    ];
    const runner = new SargeRunner(script, [], []);
    const at = (zone: string, nowMs: number) =>
      runner.run({ ...blank, nowMs, room: zone, zonesIn: new Set([zone]) });
    expect(at('r1', 0).map((f) => f.rule.id)).toEqual(['once', 'again']);
    expect(at('r1', 16)).toEqual([]); // still true: not again
    at('r2', 32); // leaves
    expect(at('r1', 48).map((f) => f.rule.id)).toEqual(['again']); // back: only the repeating one
  });

  it('steps run in order, with waits between, and can set and clear flags', () => {
    const script = clone();
    script.flags = ['explained'];
    script.rules = [
      {
        id: 'seq',
        when: 'lifeStart',
        steps: [
          say('one'),
          { k: 'wait', s: 2 },
          say('two'),
          { k: 'set', flag: 'explained' },
          say('three'),
        ],
      },
      { id: 'after', when: 'flag:explained', steps: [say('flag is up')] },
    ];
    const flags: string[] = [];
    const runner = new SargeRunner(script, [], flags);
    const look = (nowMs: number, edges: string[] = []) =>
      runner.run({ ...blank, nowMs, edges: new Set(edges), flags: new Set(flags) });
    expect(look(0, ['lifeStart']).map((f) => f.text)).toEqual(['one']); // then it waits
    expect(look(1000)).toEqual([]);
    expect(look(2100).map((f) => f.text)).toEqual(['two', 'three']);
    expect(flags).toEqual(['explained']);
    expect(look(2200).map((f) => f.text)).toEqual(['flag is up']); // the flag turned a rule on
  });

  it('zone, flag and timer conditions', () => {
    const script = clone();
    script.flags = ['f'];
    script.rules = [
      { id: 'enter', when: 'enter:bags', steps: [say('in')] },
      { id: 'leave', when: 'leave:bags', steps: [say('out')] },
      { id: 'stay', when: 'inFor:bags:5', steps: [say('5s')] },
      { id: 'late', when: 'flagFor:f:3', steps: [say('3s after')] },
      { id: 'later', when: 'firedFor:enter:2', steps: [say('2s after enter')] },
    ];
    const runner = new SargeRunner(script, [], []);
    const look = (nowMs: number, o: Partial<typeof blank> = {}) =>
      runner.run({ ...blank, nowMs, ...o }).map((f) => f.rule.id);
    expect(look(0, { edges: new Set(['enter:bags']) })).toEqual(['enter']);
    expect(look(1000, { zoneSinceS: () => 4 })).toEqual([]);
    expect(look(2500, { zoneSinceS: () => 5 })).toEqual(['stay', 'later']);
    expect(look(3000, { flagSinceS: () => 3 })).toEqual(['late']);
    expect(look(4000, { edges: new Set(['leave:bags']) })).toEqual(['leave']);
  });
});
