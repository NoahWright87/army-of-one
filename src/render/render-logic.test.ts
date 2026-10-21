import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../sim/events';
import type { SoldierView, WorldView } from '../sim/view';
import { resolveAssetUrls } from './assets/resolve-asset-urls';
import { cueContextFromView, eventCues, type Cue } from './event-cues';
import { aimAngle, moveFromKeys, PressLatch } from './input/input-math';
import {
  indexById,
  interpPos,
  lerp,
  lerpAngle,
  pointSegmentDistance,
  smoothFollow,
} from './interp';
import { FreeList, KeyedPool } from './phaser/pool';
import { flickerNoise, soldierVisual } from './soldier-style';
import { distanceGain, effectiveVolume, SoundThrottle } from './sound-mix';
import { ASSET_MANIFEST } from '../content/assets';
import { DEPTH } from './depth';

const soldier = (p: Partial<SoldierView> = {}): SoldierView => ({
  kind: 'soldier',
  id: 'S1',
  ordinal: 1,
  x: 0,
  y: 0,
  facing: 0,
  hp: 100,
  maxHp: 100,
  alive: true,
  role: 'live',
  leadIn: false,
  ...p,
});

const view = (p: Partial<WorldView> = {}): WorldView => ({
  tick: 0,
  soldiers: [],
  turrets: [],
  mines: [],
  vehicles: [],
  gates: [],
  levers: [],
  bridges: [],
  objectives: [],
  events: [],
  missionComplete: null,
  ...p,
});

describe('interpolation', () => {
  it('lerps numbers and positions', () => {
    expect(lerp(0, 10, 0.25)).toBe(2.5);
    expect(interpPos({ x: 0, y: 0 }, { x: 10, y: 20 }, 0.5)).toEqual({ x: 5, y: 10 });
    expect(interpPos(undefined, { x: 10, y: 20 }, 0.5)).toEqual({ x: 10, y: 20 });
  });

  it('snaps teleports instead of sliding across the map', () => {
    expect(interpPos({ x: 0, y: 0 }, { x: 500, y: 0 }, 0.5)).toEqual({ x: 500, y: 0 });
  });

  it('interpolates angles along the short arc', () => {
    const a = lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5);
    expect(Math.abs(Math.cos(a) + 1)).toBeLessThan(1e-6); // ≈ ±π, not 0
    expect(lerpAngle(0, 1, 0.5)).toBeCloseTo(0.5);
  });

  it('smooth camera follow is frame-rate independent', () => {
    const target = { x: 100, y: 0 };
    let a = { x: 0, y: 0 };
    for (let i = 0; i < 4; i++) a = smoothFollow(a, target, 0.8, 1000 / 240);
    const b = smoothFollow({ x: 0, y: 0 }, target, 0.8, 1000 / 60);
    expect(a.x).toBeCloseTo(b.x, 6);
    expect(smoothFollow({ x: 0, y: 0 }, target, 0, 16)).toEqual(target);
  });

  it('point-segment distance', () => {
    expect(pointSegmentDistance({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
    expect(pointSegmentDistance({ x: -4, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
  });

  it('indexes by id', () => {
    expect(indexById([soldier({ id: 'A' }), soldier({ id: 'B' })]).get('B')?.id).toBe('B');
  });
});

describe('soldier style', () => {
  const settings = { echoOpacity: 0.5, echoLabels: true, staticFlicker: true };

  it('live soldier pops: opaque, on top, marker, no label', () => {
    const v = soldierVisual(soldier(), settings, 0);
    expect(v).toMatchObject({ texture: 'soldier_live', alpha: 1, liveMarker: true, label: null });
    for (const role of ['echo', 'static', 'interrupted'] as const) {
      expect(v.depth).toBeGreaterThan(soldierVisual(soldier({ role }), settings, 0).depth);
    }
  });

  it('dim echoes (05-b): everyone but the live soldier fades back, labels go', () => {
    const dim = { ...settings, dimEchoes: true, dimEchoesLevel: 0.2 };
    expect(soldierVisual(soldier(), dim, 0).alpha).toBe(1);
    const echo = soldierVisual(soldier({ role: 'echo', ordinal: 3 }), dim, 0);
    expect(echo.alpha).toBeCloseTo(0.2);
    expect(echo.label).toBeNull();
    const stat = soldierVisual(soldier({ role: 'static' }), dim, 0);
    expect(stat.alpha).toBeLessThan(soldierVisual(soldier({ role: 'static' }), settings, 0).alpha);
    const corpse = soldierVisual(soldier({ role: 'echo', alive: false }), dim, 0);
    expect(corpse.alpha).toBeLessThanOrEqual(0.2);
  });

  it('echoes are translucent and labelled (toggleable)', () => {
    const v = soldierVisual(soldier({ role: 'echo', ordinal: 7 }), settings, 0);
    expect(v).toMatchObject({ texture: 'soldier_echo', alpha: 0.5, label: '7' });
    expect(
      soldierVisual(soldier({ role: 'echo' }), { ...settings, echoLabels: false }, 0).label,
    ).toBeNull();
  });

  it('interrupted shows the ! icon; lead-in shows the shield', () => {
    expect(soldierVisual(soldier({ role: 'interrupted' }), settings, 0).interruptedIcon).toBe(true);
    expect(soldierVisual(soldier({ leadIn: true }), settings, 0).shield).toBe(true);
    expect(soldierVisual(soldier({ leadIn: true, alive: false }), settings, 0).shield).toBe(false);
  });

  it('static figures flicker deterministically', () => {
    const s = soldier({ role: 'static', ordinal: 3 });
    const alphas = [0, 60, 120, 180, 240].map((t) => soldierVisual(s, settings, t).alpha);
    expect(new Set(alphas).size).toBeGreaterThan(1);
    expect(soldierVisual(s, settings, 130).alpha).toBe(soldierVisual(s, settings, 130).alpha);
    expect(soldierVisual(s, settings, 0).staticOverlay).toBeGreaterThan(0);
    const still = soldierVisual(s, { ...settings, staticFlicker: false }, 0);
    expect(still.alpha).toBe(soldierVisual(s, { ...settings, staticFlicker: false }, 999).alpha);
    expect(flickerNoise(1, 0)).toBeGreaterThanOrEqual(0);
    expect(flickerNoise(1, 0)).toBeLessThan(1);
  });

  it('corpses use the corpse sprite under everything', () => {
    const v = soldierVisual(soldier({ role: 'echo', alive: false }), settings, 0);
    expect(v.texture).toBe('soldier_corpse');
    expect(v.depth).toBe(DEPTH.corpses);
    expect(v.label).toBeNull();
  });
});

describe('event cues', () => {
  const v = view({
    soldiers: [
      soldier({ id: 'S1', x: 100, y: 100 }),
      soldier({ id: 'S2', role: 'echo', x: 0, y: 0 }),
    ],
    turrets: [
      {
        kind: 'turret',
        id: 'T1',
        x: 400,
        y: 100,
        aim: Math.PI,
        state: 'windup',
        hp: 10,
        maxHp: 10,
        range: 500,
      },
    ],
  });
  const ctx = cueContextFromView(v, 'S1');
  const shot = (p: Partial<Extract<SimEvent, { kind: 'shotFired' }>>): SimEvent => ({
    kind: 'shotFired',
    tick: 1,
    by: 'T1',
    fromX: 400,
    fromY: 100,
    angle: Math.PI,
    hitX: 100,
    hitY: 100,
    ...p,
  });
  const tracer = (cues: Cue[]) =>
    cues.find((c) => c.type === 'tracer') as Extract<Cue, { type: 'tracer' }>;

  it('hostile fire that hits or grazes the live soldier is "incoming"', () => {
    expect(tracer(eventCues([shot({ hitId: 'S1' })], ctx)).style).toBe('incoming');
    expect(tracer(eventCues([shot({ hitX: 50, hitY: 120 })], ctx)).style).toBe('incoming');
    expect(tracer(eventCues([shot({ hitX: 400, hitY: 400 })], ctx)).style).toBe('hostile');
  });

  it('friendly shots are styled by shooter', () => {
    expect(
      tracer(eventCues([shot({ by: 'S1', fromX: 100, fromY: 100, hitX: 300 })], ctx)).style,
    ).toBe('live');
    expect(
      tracer(eventCues([shot({ by: 'S2', fromX: 0, fromY: 0, hitX: 50, hitY: 100 })], ctx)).style,
    ).toBe('friendly');
  });

  it('every shot gets a muzzle flash, an impact and a sound', () => {
    const types = eventCues([shot({})], ctx).map((c) => c.type);
    expect(types).toEqual(expect.arrayContaining(['tracer', 'muzzle', 'impact', 'sound']));
    const snd = eventCues([shot({})], ctx).find((c) => c.type === 'sound');
    expect(snd).toMatchObject({ key: 'sfx_turret_shot' });
  });

  it('damage to the live soldier flashes, shakes and reports', () => {
    const cues = eventCues([{ kind: 'damaged', tick: 1, target: 'S1', amount: 10 }], ctx);
    expect(cues.map((c) => c.type)).toEqual(
      expect.arrayContaining(['hitFlash', 'liveDamaged', 'shake', 'sound']),
    );
    const other = eventCues([{ kind: 'damaged', tick: 1, target: 'S2', amount: 10 }], ctx);
    expect(other.some((c) => c.type === 'liveDamaged')).toBe(false);
  });

  it('explosions for mines, destroyed hazards and the objective', () => {
    const m = eventCues(
      [{ kind: 'mineDetonated', tick: 1, id: 'M', x: 120, y: 100, radius: 50 }],
      ctx,
    );
    expect(m.find((c) => c.type === 'explosion')).toMatchObject({ x: 120, radius: 50 });
    expect(m.some((c) => c.type === 'shake')).toBe(true);
    const h = eventCues([{ kind: 'hazardDestroyed', tick: 1, id: 'T1' }], ctx);
    expect(h.find((c) => c.type === 'explosion')).toMatchObject({ x: 400, y: 100 });
  });

  it('turret windup is tracked with its target', () => {
    const w = eventCues([{ kind: 'turretWindup', tick: 1, id: 'T1', targetId: 'S1' }], ctx);
    expect(w[0]).toEqual({ type: 'windup', turretId: 'T1', targetId: 'S1' });
  });

  it('handles every SimEvent kind without throwing', () => {
    const all: SimEvent[] = [
      { kind: 'soldierSpawned', tick: 1, id: 'S1' },
      { kind: 'soldierDied', tick: 1, id: 'S1', cause: 'turret' },
      { kind: 'interacted', tick: 1, by: 'S1', targetId: 'L1' },
      { kind: 'gateChanged', tick: 1, id: 'G1', open: true },
      { kind: 'bridgeChanged', tick: 1, id: 'B1', state: 'raising' },
      { kind: 'objectiveDestroyed', tick: 1, id: 'missing' },
    ];
    expect(() => eventCues(all, ctx)).not.toThrow();
  });
});

describe('sound mixing', () => {
  it('falls off with distance', () => {
    expect(distanceGain(0)).toBe(1);
    expect(distanceGain(10000)).toBe(0);
    const mid = distanceGain(800);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it('throttles repeated sounds per key', () => {
    const t = new SoundThrottle(60, 2);
    expect([t.allow('a', 0), t.allow('a', 10), t.allow('a', 20), t.allow('b', 20)]).toEqual([
      true,
      true,
      false,
      true,
    ]);
    expect(t.allow('a', 100)).toBe(true);
  });

  it('applies master volume and mute', () => {
    expect(effectiveVolume(0.5, false, 0.5)).toBe(0.25);
    expect(effectiveVolume(1, true, 1)).toBe(0);
  });
});

describe('input math', () => {
  it('maps held keys to a move vector', () => {
    expect(moveFromKeys({ up: true, down: false, left: false, right: true })).toEqual({
      x: 1,
      y: -1,
    });
    expect(moveFromKeys({ up: true, down: true, left: false, right: false })).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('aims from soldier to cursor (y-down, radians)', () => {
    expect(aimAngle({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(Math.PI / 2);
    expect(aimAngle({ x: 5, y: 5 }, { x: 10, y: 5 })).toBe(0);
  });

  it('latches a press until consumed once', () => {
    const l = new PressLatch();
    expect(l.consume()).toBe(false);
    l.press();
    l.press();
    expect(l.consume()).toBe(true);
    expect(l.consume()).toBe(false);
  });
});

describe('asset url resolution', () => {
  it('maps every manifest key from glob results', () => {
    const glob = Object.fromEntries(
      ASSET_MANIFEST.map((a) => [`/assets/${a.file}`, `url:${a.key}`]),
    );
    const r = resolveAssetUrls(ASSET_MANIFEST, glob);
    expect(r.missing).toEqual([]);
    expect(r.urls.get('soldier_live')).toBe('url:soldier_live');
  });

  it('reports missing files', () => {
    const r = resolveAssetUrls(ASSET_MANIFEST, {});
    expect(r.missing.length).toBe(ASSET_MANIFEST.length);
  });
});

describe('pools', () => {
  const fake = () => {
    const o = { visible: false, setVisible: (v: boolean) => (o.visible = v) };
    return o;
  };

  it('reuses objects per id and recycles unused ones', () => {
    let created = 0;
    const pool = new KeyedPool(() => {
      created++;
      return fake();
    });
    for (let frame = 0; frame < 10; frame++) {
      pool.begin();
      pool.get('a');
      pool.get('b');
      pool.end();
    }
    expect(created).toBe(2);
    pool.begin();
    const a = pool.get('a');
    pool.end(); // b hidden + recycled
    expect(pool.activeCount).toBe(1);
    expect(a.visible).toBe(true);
    pool.begin();
    pool.get('a');
    pool.get('c'); // reuses b's object
    pool.end();
    expect(created).toBe(2);
    expect(pool.totalCount).toBe(2);
  });

  it('free list hides returned objects', () => {
    const fl = new FreeList(fake);
    const o = fl.take();
    expect(o.visible).toBe(true);
    fl.give(o);
    expect(o.visible).toBe(false);
    expect(fl.take()).toBe(o);
  });
});
