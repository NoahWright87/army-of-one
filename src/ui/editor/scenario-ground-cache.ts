import { type GroundKind } from '../../content/ground';
import {
  edgeFrame,
  type TerrainAtlas,
  type TerrainImages,
} from '../../render/terrain/transition-atlas';
import { terrainEdges } from '../../render/terrain/transition-rules';

const CHUNK = 16;
const CACHE_BYTES = 16 * 1024 * 1024;

interface GroundChunk {
  canvas: HTMLCanvasElement;
  rows: readonly string[];
  /** One tile of neighbouring ground supplies the transition masks. */
  signature: string;
}

/** Rasterize small, reusable parts of the map at the detail the viewport can display. */
export class ScenarioGroundCache {
  private textures: { images: TerrainImages; atlas: TerrainAtlas } | null = null;
  private pixelsPerCell = 0;
  private readonly chunks = new Map<string, GroundChunk>();

  constructor(private readonly fallback: ReadonlyMap<GroundKind, HTMLCanvasElement>) {}

  setTextures(images: TerrainImages, atlas: TerrainAtlas): void {
    this.textures = { images, atlas };
    this.chunks.clear();
  }

  draw(
    ctx: CanvasRenderingContext2D,
    rows: readonly string[],
    screenScale: number,
    bounds: { left: number; top: number; right: number; bottom: number },
  ): void {
    const pixels = Math.max(4, Math.min(64, 2 ** Math.ceil(Math.log2(screenScale))));
    if (pixels !== this.pixelsPerCell) {
      this.chunks.clear();
      this.pixelsPerCell = pixels;
    }
    const cols = rows[0]!.length;
    for (let y = Math.floor(bounds.top / CHUNK) * CHUNK; y < bounds.bottom; y += CHUNK) {
      for (let x = Math.floor(bounds.left / CHUNK) * CHUNK; x < bounds.right; x += CHUNK) {
        const w = Math.min(CHUNK, cols - x);
        const h = Math.min(CHUNK, rows.length - y);
        const key = `${x}:${y}`;
        let chunk = this.chunks.get(key);
        if (chunk?.rows !== rows) {
          const signature = rows
            .slice(Math.max(0, y - 1), y + h + 1)
            .map((row) => row.slice(Math.max(0, x - 1), x + w + 1))
            .join('\n');
          if (
            !chunk ||
            chunk.signature !== signature ||
            chunk.canvas.width !== w * pixels ||
            chunk.canvas.height !== h * pixels
          ) {
            const canvas = chunk?.canvas ?? document.createElement('canvas');
            this.paintChunk(canvas, rows, x, y, w, h, pixels);
            chunk = { canvas, rows, signature };
          } else {
            chunk.rows = rows;
          }
        }
        this.chunks.delete(key);
        this.chunks.set(key, chunk);
        ctx.drawImage(chunk.canvas, x, y, w, h);
      }
    }
    // Keep the current viewport cached even when a very large map is fully zoomed out.
    const visibleChunks =
      (Math.ceil(bounds.right / CHUNK) - Math.floor(bounds.left / CHUNK)) *
      (Math.ceil(bounds.bottom / CHUNK) - Math.floor(bounds.top / CHUNK));
    const spareChunks = Math.floor(CACHE_BYTES / ((CHUNK * pixels) ** 2 * 4));
    const limit = Math.max(spareChunks, visibleChunks);
    while (this.chunks.size > limit) this.chunks.delete(this.chunks.keys().next().value!);
  }

  private paintChunk(
    canvas: HTMLCanvasElement,
    rows: readonly string[],
    x: number,
    y: number,
    w: number,
    h: number,
    pixels: number,
  ): void {
    if (canvas.width !== w * pixels) canvas.width = w * pixels;
    if (canvas.height !== h * pixels) canvas.height = h * pixels;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let row = y; row < y + h; row++) {
      for (let col = x; col < x + w; col++) {
        const kind = rows[row]![col] as GroundKind;
        const dx = (col - x) * pixels;
        const dy = (row - y) * pixels;
        const texture = this.textures?.images[kind];
        if (texture)
          ctx.drawImage(texture, (col & 1) * 64, (row & 1) * 64, 64, 64, dx, dy, pixels, pixels);
        else ctx.drawImage(this.fallback.get(kind)!, dx, dy, pixels, pixels);

        const atlas = this.textures?.atlas;
        if (!atlas) continue;
        for (const edge of terrainEdges(rows, col, row)) {
          const frame = atlas.frames.get(edgeFrame(edge.kind, edge.style, edge.mask, col, row));
          if (frame)
            ctx.drawImage(atlas.canvas, frame.x, frame.y, frame.w, frame.h, dx, dy, pixels, pixels);
        }
      }
    }
  }
}
