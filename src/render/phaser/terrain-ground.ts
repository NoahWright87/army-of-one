import type Phaser from 'phaser';
import { TERRAIN_ART } from '../../content/terrain-art';
import { TERRAIN_LAYERS, terrainEdges, kindAt } from '../terrain/transition-rules';
import {
  buildTerrainAtlas,
  TERRAIN_EDGE_ATLAS_KEY,
  edgeFrame,
  type TerrainImages,
} from '../terrain/transition-atlas';
import { DEPTH } from '../depth';
import type { MapDef } from '../../sim/world/map';

export function drawGround(scene: Phaser.Scene, ground: NonNullable<MapDef['ground']>): void {
  if (!scene.textures.exists(TERRAIN_EDGE_ATLAS_KEY)) {
    const images = Object.fromEntries(
      TERRAIN_LAYERS.map((kind) => [kind, scene.textures.get(TERRAIN_ART[kind]).getSourceImage()]),
    ) as TerrainImages;
    const atlas = buildTerrainAtlas(images);
    const texture = scene.textures.addCanvas(TERRAIN_EDGE_ATLAS_KEY, atlas.canvas);
    if (!texture) throw new Error('Cannot create terrain transition atlas');
    for (const [name, box] of atlas.frames) texture.add(name, 0, box.x, box.y, box.w, box.h);
  }
  const { rows, cellSize: cs } = ground;
  // Retain cheap repeating strips for interiors. Only boundaries need additional quads.
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      const kind = kindAt(rows, x, y);
      if (!kind) {
        x++;
        continue;
      }
      const start = x;
      while (x < row.length && kindAt(rows, x, y) === kind) x++;
      const tile = scene.add
        .tileSprite(start * cs, y * cs, (x - start) * cs, cs, TERRAIN_ART[kind])
        .setOrigin(0)
        .setDepth(DEPTH.ground + 0.1);
      tile.tilePositionX = start * cs;
      tile.tilePositionY = y * cs;
    }
  });
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++)
      for (const edge of terrainEdges(rows, x, y)) {
        scene.add
          .image(
            x * cs,
            y * cs,
            TERRAIN_EDGE_ATLAS_KEY,
            edgeFrame(edge.kind, edge.style, edge.mask, x, y),
          )
          .setOrigin(0)
          .setDisplaySize(cs, cs)
          .setDepth(DEPTH.ground + 0.2);
      }
  });
}
