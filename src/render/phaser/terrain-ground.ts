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

export function drawGround(scene: Phaser.Scene, map: MapDef): void {
  const ground = map.ground;
  if (!ground) return;
  const { width, height } = map;
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
  const rowsInMap = rows.slice(0, Math.ceil(height / cs));
  const colsInMap = Math.ceil(width / cs);
  rowsInMap.forEach((row, y) => {
    for (let x = 0; x < Math.min(row.length, colsInMap);) {
      const kind = kindAt(rows, x, y);
      if (!kind) {
        x++;
        continue;
      }
      const start = x;
      while (x < row.length && kindAt(rows, x, y) === kind) x++;
      const tile = scene.add
        .tileSprite(
          start * cs,
          y * cs,
          Math.min((x - start) * cs, width - start * cs),
          Math.min(cs, height - y * cs),
          TERRAIN_ART[kind],
        )
        .setOrigin(0)
        .setDepth(DEPTH.ground + 0.1);
      tile.tilePositionX = start * cs;
      tile.tilePositionY = y * cs;
    }
  });
  rowsInMap.forEach((row, y) => {
    for (let x = 0; x < Math.min(row.length, colsInMap); x++)
      for (const edge of terrainEdges(rows, x, y)) {
        const transition = scene.add
          .image(
            x * cs,
            y * cs,
            TERRAIN_EDGE_ATLAS_KEY,
            edgeFrame(edge.kind, edge.style, edge.mask, x, y),
          )
          .setOrigin(0)
          .setDisplaySize(cs, cs)
          .setDepth(DEPTH.ground + 0.2);
        const cropW = Math.min(1, (width - x * cs) / cs);
        const cropH = Math.min(1, (height - y * cs) / cs);
        if (cropW < 1 || cropH < 1)
          transition.setCrop(
            0,
            0,
            transition.frame.cutWidth * cropW,
            transition.frame.cutHeight * cropH,
          );
      }
  });
}
