import { describe, expect, it } from 'vitest';
import { COVER_ART } from '../content/battlefield-art';
import { IMAGE_ASSETS } from '../content/assets';
import type { CoverDef } from '../sim/world/map';
import { coverArtLayout } from './cover-art';

describe('painted cover layout', () => {
  it('tiles long and short barriers at the same material scale', () => {
    const short: CoverDef = { id: 's', material: 'sandbags', rect: { x: 10, y: 20, w: 90, h: 22 } };
    const long = { ...short, rect: { ...short.rect, w: 450 } };
    expect(coverArtLayout(short, false).tileScale).toBe(coverArtLayout(long, false).tileScale);
    expect(coverArtLayout(long, false)).toMatchObject({
      x: 235,
      y: 31,
      width: 450,
      height: 22,
      rotation: 0,
    });
  });

  it('rotates vertical cover while preserving its exact footprint', () => {
    const def: CoverDef = { id: 'v', material: 'halfWall', rect: { x: 10, y: 20, w: 18, h: 120 } };
    const before = structuredClone(def);
    expect(coverArtLayout(def, false)).toMatchObject({
      x: 19,
      y: 80,
      width: 120,
      height: 18,
      rotation: Math.PI / 2,
    });
    expect(def).toEqual(before);
  });

  it('maps every material to delivered intact and material-specific debris textures', () => {
    for (const material of Object.keys(COVER_ART) as CoverDef['material'][]) {
      const def: CoverDef = { id: material, material, rect: { x: 0, y: 0, w: 120, h: 24 } };
      const intact = coverArtLayout(def, false);
      const rubble = coverArtLayout(def, true);
      expect(IMAGE_ASSETS[intact.key].status).toBe('final');
      expect(IMAGE_ASSETS[rubble.key].status).toBe('final');
      expect(rubble).toEqual({ ...intact, key: COVER_ART[material].rubble });
    }
  });
});
