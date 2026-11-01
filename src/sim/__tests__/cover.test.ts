/**
 * (07-c) Cover ([D32]–[D35]): partial cover stops a share of bullets with replay-stable rolls,
 * shooters fire over cover they stand next to, cover cuts turret sight, moving spreads shots.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../content/tuning';
import { castRay, fireRifle } from '../combat/shots';
import { hashState } from '../core/hash';
import { chooseTurretTarget } from '../entities/turret';
import { getSoldier, getView } from '../sim';
import { coverArcs, coverStops, seesThroughCover } from '../world/cover';
import type { CoverDef } from '../world/map';
import { arena, run, soldierAt, walk, world } from './helpers';

const wallOfCover = (bullet: number, id = 'c1'): CoverDef => ({
  id,
  rect: { x: 500, y: 0, w: 20, h: 1000 },
  material: 'sandbags',
  bullet,
});

describe('cover rolls', () => {
  it('stops roughly its share of bullets, and the same shots every time', () => {
    const shoot = () => {
      const w = world(arena({ cover: [wallOfCover(0.5)] }));
      let stopped = 0;
      for (let i = 0; i < 400; i++) {
        const hit = castRay(w, { x: 100, y: 100 + i * 2 }, 0, 900, 'player', {
          coverKey: `S1@${i}`,
        });
        if (hit.target?.kind === 'cover') stopped++;
      }
      return stopped;
    };
    const a = shoot();
    expect(a).toBeGreaterThan(160);
    expect(a).toBeLessThan(240);
    expect(shoot()).toBe(a);
  });

  it('0 never stops, 1 always stops', () => {
    expect(coverStops('k', 'c', 0)).toBe(false);
    expect(coverStops('k', 'c', 1)).toBe(true);
  });

  it('without a cover key (sight/LOS rays) partial cover is see-through', () => {
    const w = world(arena({ cover: [wallOfCover(0.9)] }));
    expect(castRay(w, { x: 100, y: 500 }, 0, 900, 'player').target?.kind).toBe('wall');
  });

  it('a shooter right next to cover fires over it; from farther back the cover rolls', () => {
    const w = world(arena({ cover: [wallOfCover(0.999)] }));
    const close = fireRifle(w, 'S1', { x: 480, y: 500 }, 0); // 20 from the cover's edge
    expect(close.hitX).toBeGreaterThan(900);
    const far = fireRifle(w, 'S1', { x: 300, y: 500 }, 0);
    expect(far.hitX).toBeCloseTo(500);
  });

  it('fire-over only works below fireOverBelow (solid-ish cover with the threshold lowered)', () => {
    const w = world(arena({ cover: [wallOfCover(0.95)] }), { cover: { fireOverBelow: 0.9 } });
    let stopped = 0;
    for (let i = 0; i < 50; i++) {
      const hit = castRay(w, { x: 480, y: 100 + i * 10 }, 0, 900, 'player', { coverKey: `k${i}` });
      if (hit.target?.kind === 'cover') stopped++;
    }
    expect(stopped).toBeGreaterThan(40);
  });

  it('enemy shots roll against cover too (turret shots can hit cover)', () => {
    const w = world(arena({ cover: [wallOfCover(1 - 1e-9)] }));
    soldierAt(w, { x: 560, y: 500 });
    const hit = castRay(w, { x: 100, y: 500 }, 0, 900, 'enemy', { coverKey: 't@1' });
    expect(hit.target?.kind).toBe('cover');
  });
});

describe('sight past cover ([D33])', () => {
  const T = DEFAULT_TUNING;
  it('remaining sight past cover is multiplied by (1 − cover)', () => {
    const w = world(arena({ cover: [wallOfCover(0.5)] }));
    // Viewer at x=100, range 400; cover at 500 is beyond range anyway.
    const from = { x: 100, y: 500 };
    // Cover entered at d=400 (x=500). Range 600: reach = 400 + 200 × 0.5 = 500.
    expect(seesThroughCover(w.cover, from, { x: 590, y: 500 }, 600, T)).toBe(true);
    expect(seesThroughCover(w.cover, from, { x: 610, y: 500 }, 600, T)).toBe(false);
  });

  it('turrets do not pick targets hidden far behind half cover, but do see ones hugging it', () => {
    const map = arena({
      cover: [wallOfCover(0.5)],
      turrets: [{ id: 't1', position: { x: 200, y: 500 }, facing: 0 }],
    });
    const w = world(map, { turret: { range: 420 } });
    // Cover at d = 300; reach = 300 + 120 × 0.5 = 360.
    const far = soldierAt(w, { x: 580, y: 500 }); // d = 380
    expect(chooseTurretTarget(w, map.turrets![0]!)).toBeNull();
    getSoldier(w, far)!.x = 535; // d = 335: hugging the cover
    expect(chooseTurretTarget(w, map.turrets![0]!)?.id).toBe(far);
  });

  it('obscuresSight off: cover is see-through for targeting', () => {
    const T2 = { ...T, cover: { ...T.cover, obscuresSight: false } };
    const w = world(arena({ cover: [wallOfCover(0.9)] }));
    expect(seesThroughCover(w.cover, { x: 100, y: 500 }, { x: 600, y: 500 }, 600, T2)).toBe(true);
  });
});

describe('cover arcs ([D34])', () => {
  it('points at nearby cover, darker for better cover, nothing far away', () => {
    const arcs = coverArcs(
      { x: 100, y: 100 },
      [
        { rect: { x: 120, y: 50, w: 10, h: 100 }, value: 0.1 }, // east, close
        { rect: { x: 50, y: 60, w: 100, h: 20 }, value: 1 }, // north, close
        { rect: { x: 400, y: 0, w: 10, h: 10 }, value: 1 }, // far
      ],
      30,
    );
    expect(arcs).toHaveLength(2);
    expect(arcs[0]!.angle).toBeCloseTo(0);
    expect(arcs[0]!.value).toBe(0.1);
    expect(arcs[1]!.angle).toBeCloseTo(-Math.PI / 2);
  });

  it('the view has arcs for the live soldier only', () => {
    const w = world(
      arena({ cover: [{ id: 'c1', rect: { x: 120, y: 450, w: 20, h: 100 }, material: 'fence' }] }),
    );
    soldierAt(w, { x: 100, y: 500 });
    soldierAt(w, { x: 100, y: 300 }, { controllable: false });
    const v = getView(w);
    expect(v.coverArcs).toHaveLength(1);
    expect(v.coverArcs![0]!.value).toBe(DEFAULT_TUNING.cover.materials.fence.bullet);
  });
});

describe('cover blocks movement', () => {
  it('soldiers cannot walk through cover', () => {
    const w = world(arena({ cover: [wallOfCover(0.1)] }));
    const id = soldierAt(w, { x: 450, y: 500 });
    run(w, 60, { [id]: walk(1, 0) });
    expect(getSoldier(w, id)!.x).toBeLessThan(500);
    expect(hashState(w.state)).toBeTypeOf('string');
  });
});
