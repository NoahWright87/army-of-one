import { TERRAIN_ART } from '../../content/terrain-art';
import type { GroundKind } from '../../content/ground';
import {
  TERRAIN_LAYERS,
  TRANSITION_MASKS,
  edgeStyle,
  transitionDistance,
  terrainEdges,
  kindAt,
  type EdgeStyle,
} from './transition-rules';

export const TERRAIN_EDGE_ATLAS_KEY = 'terrain_edge_atlas';
const TILE = 32,
  GUTTER = 1,
  STRIDE = TILE + GUTTER * 2,
  COLUMNS = 60;
export type TerrainImages = Record<GroundKind, CanvasImageSource>;
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface TerrainAtlas {
  canvas: HTMLCanvasElement;
  frames: Map<string, Box>;
}
export const edgeFrame = (kind: GroundKind, style: EdgeStyle, mask: number, x: number, y: number) =>
  `${kind}:${style}:${mask}:${x & 1}:${y & 1}`;

/** Shared by the Canvas editor and Phaser. Reusable masks choose actual textured edges,
 * outer/inner corners and multi-terrain junctions without a bespoke sheet for each pair. */
export function buildTerrainAtlas(images: TerrainImages): TerrainAtlas {
  const entries: { kind: GroundKind; style: EdgeStyle; mask: number; px: number; py: number }[] =
    [];
  for (const kind of TERRAIN_LAYERS.filter((k) => k !== 'W')) {
    const styles: EdgeStyle[] = [edgeStyle(kind, 'G')];
    if (kind === 'G' || kind === 'D' || kind === 'S') styles.push('shore');
    for (const style of styles)
      for (const mask of TRANSITION_MASKS.filter((m) => m !== 0))
        for (let py = 0; py < 2; py++)
          for (let px = 0; px < 2; px++) entries.push({ kind, style, mask, px, py });
  }
  const canvas = document.createElement('canvas');
  canvas.width = COLUMNS * STRIDE;
  canvas.height = Math.ceil(entries.length / COLUMNS) * STRIDE;
  const ctx = canvas.getContext('2d')!;
  const cell = document.createElement('canvas');
  cell.width = TILE;
  cell.height = TILE;
  const c = cell.getContext('2d', { willReadFrequently: true })!;
  const frames = new Map<string, Box>();
  const distances = new Map<string, Float32Array>();
  entries.forEach(({ kind, style, mask, px, py }, index) => {
    c.clearRect(0, 0, TILE, TILE);
    c.drawImage(images[kind], px * 64, py * 64, 64, 64, 0, 0, TILE, TILE);
    const pixels = c.getImageData(0, 0, TILE, TILE);
    const shapeKey = `${style}:${mask}`;
    let shape = distances.get(shapeKey);
    if (!shape) {
      shape = new Float32Array(TILE * TILE);
      for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++)
          shape[y * TILE + x] = transitionDistance(mask, (x + 0.5) / TILE, (y + 0.5) / TILE, style);
      distances.set(shapeKey, shape);
    }
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const k = (y * TILE + x) * 4,
          d = shape[y * TILE + x]!;
        const alpha = Math.max(0, Math.min(1, d * TILE + 0.5));
        // Symmetric material edges: a thin bank/foam line, rock rim or built-surface outline.
        if (style === 'shore' && Math.abs(d) < 0.045) {
          const col = d < 0.012 ? [187, 194, 163] : [155, 133, 91];
          const mix = 0.65;
          for (let channel = 0; channel < 3; channel++)
            pixels.data[k + channel] = Math.round(
              pixels.data[k + channel]! * (1 - mix) + col[channel]! * mix,
            );
        } else if ((style === 'rock' || style === 'hard') && d >= 0 && d < 0.025) {
          for (let channel = 0; channel < 3; channel++)
            pixels.data[k + channel] = Math.round(pixels.data[k + channel]! * 0.68);
        }
        pixels.data[k + 3] = Math.round(alpha * 255);
      }
    const box = {
      x: (index % COLUMNS) * STRIDE + GUTTER,
      y: Math.floor(index / COLUMNS) * STRIDE + GUTTER,
      w: TILE,
      h: TILE,
    };
    // Extrude border pixels into the gutter: linear filtering must not reveal a grid of
    // transparent lines where two neighbouring transition frames meet.
    const padded = ctx.createImageData(STRIDE, STRIDE);
    for (let y = 0; y < STRIDE; y++)
      for (let x = 0; x < STRIDE; x++) {
        const src =
          (Math.min(TILE - 1, Math.max(0, y - GUTTER)) * TILE +
            Math.min(TILE - 1, Math.max(0, x - GUTTER))) *
          4;
        const dst = (y * STRIDE + x) * 4;
        for (let channel = 0; channel < 4; channel++)
          padded.data[dst + channel] = pixels.data[src + channel]!;
      }
    ctx.putImageData(padded, box.x - GUTTER, box.y - GUTTER);
    frames.set(edgeFrame(kind, style, mask, px, py), box);
  });
  return { canvas, frames };
}

export function drawTerrainCanvas(
  ctx: CanvasRenderingContext2D,
  rows: readonly string[],
  cellPx: number,
  images: TerrainImages,
  atlas: TerrainAtlas,
): void {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const kind = kindAt(rows, x, y);
      if (!kind) continue;
      ctx.drawImage(
        images[kind],
        (x & 1) * 64,
        (y & 1) * 64,
        64,
        64,
        x * cellPx,
        y * cellPx,
        cellPx,
        cellPx,
      );
    }
  });
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++)
      for (const edge of terrainEdges(rows, x, y)) {
        const box = atlas.frames.get(edgeFrame(edge.kind, edge.style, edge.mask, x, y))!;
        ctx.drawImage(
          atlas.canvas,
          box.x,
          box.y,
          box.w,
          box.h,
          x * cellPx,
          y * cellPx,
          cellPx,
          cellPx,
        );
      }
  });
}

/** UI-only image loading. Phaser supplies its already-loaded sources instead. */
export async function loadTerrainImages(
  url: (key: (typeof TERRAIN_ART)[GroundKind]) => string,
): Promise<TerrainImages> {
  const entries = await Promise.all(
    TERRAIN_LAYERS.map(async (kind) => {
      const img = new Image();
      img.src = url(TERRAIN_ART[kind]);
      await img.decode();
      return [kind, img] as const;
    }),
  );
  return Object.fromEntries(entries) as TerrainImages;
}
