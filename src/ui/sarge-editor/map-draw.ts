/**
 * (PHASE18) Draws basic training's map for the Sarge editor ([D161]): plain rectangles on a 2D
 * canvas, enough to see where things are. Nothing here is the game's renderer.
 */
import { BASIC_TRAINING, BT_H, BT_ROOM_RECTS, BT_W } from '../../content/maps/basic-training';
import { SARGE_ROOM_NAMES, SARGE_ROOMS } from '../../content/sarge-script';
import { strDynamic } from '../../content/strings';
import type { CoverMaterial } from '../../sim/world/map';

/** The camera: world point at the canvas centre, and canvas pixels per world unit. */
export interface View {
  cx: number;
  cy: number;
  zoom: number;
}

export const worldToScreen = (v: View, w: number, h: number, x: number, y: number) => ({
  x: (x - v.cx) * v.zoom + w / 2,
  y: (y - v.cy) * v.zoom + h / 2,
});

export const screenToWorld = (v: View, w: number, h: number, x: number, y: number) => ({
  x: (x - w / 2) / v.zoom + v.cx,
  y: (y - h / 2) / v.zoom + v.cy,
});

const COVER_COLORS: Record<CoverMaterial, string> = {
  fence: '#8a8f73',
  sandbags: '#b79a5b',
  halfWall: '#8f8f8f',
  window: '#6d8fa0',
  bunkerWindow: '#566d78',
  crate: '#8a6a43',
};

/** Draws the map's own things (ground, rooms, walls, cover, gates, flags, spawns, targets, foes). */
export function drawMap(ctx: CanvasRenderingContext2D, v: View, w: number, h: number): void {
  const m = BASIC_TRAINING;
  const sx = (x: number) => (x - v.cx) * v.zoom + w / 2;
  const sy = (y: number) => (y - v.cy) * v.zoom + h / 2;
  const z = v.zoom;
  ctx.fillStyle = '#2a3326';
  ctx.fillRect(sx(0), sy(0), BT_W * z, BT_H * z);

  // The rooms (these are zones already).
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.textBaseline = 'top';
  for (const r of SARGE_ROOMS) {
    const rc = BT_ROOM_RECTS[r];
    ctx.strokeStyle = '#ffffff22';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx(rc.x), sy(rc.y), rc.w * z, rc.h * z);
    ctx.fillStyle = '#ffffff55';
    ctx.fillText(SARGE_ROOM_NAMES[r], sx(rc.x) + 6, sy(rc.y) + 5);
  }

  // Cover, walls.
  for (const c of m.cover ?? []) {
    ctx.fillStyle = COVER_COLORS[c.material] ?? '#999';
    ctx.fillRect(sx(c.rect.x), sy(c.rect.y), Math.max(2, c.rect.w * z), Math.max(2, c.rect.h * z));
  }
  ctx.fillStyle = '#5c6169';
  for (const r of m.walls)
    ctx.fillRect(sx(r.x), sy(r.y), Math.max(1.5, r.w * z), Math.max(1.5, r.h * z));
  // Gates.
  ctx.fillStyle = '#e08a3c';
  for (const g of m.gates ?? []) {
    ctx.fillRect(sx(g.rect.x), sy(g.rect.y), Math.max(2, g.rect.w * z), Math.max(3, g.rect.h * z));
  }
  // Mines (many: tiny).
  ctx.fillStyle = '#c0504d88';
  for (const mine of m.mines ?? [])
    ctx.fillRect(sx(mine.position.x) - 1, sy(mine.position.y) - 1, 2, 2);
  // Targets.
  ctx.strokeStyle = '#ff6a6a';
  ctx.lineWidth = 2;
  for (const o of m.objectives ?? []) {
    ctx.beginPath();
    ctx.arc(sx(o.position.x), sy(o.position.y), Math.max(4, (o.radius ?? 18) * z), 0, Math.PI * 2);
    ctx.stroke();
  }
  // Foes.
  ctx.fillStyle = '#ff6a6a';
  for (const sq of m.squads ?? []) {
    for (const mem of sq.members) {
      ctx.beginPath();
      ctx.arc(sx(mem.position.x), sy(mem.position.y), 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Flags and spawns, with names.
  ctx.lineWidth = 2;
  for (const c of m.capturePoints ?? []) {
    ctx.strokeStyle = '#6ad08a';
    ctx.beginPath();
    ctx.arc(sx(c.position.x), sy(c.position.y), (c.radius ?? 70) * z, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#6ad08a';
    ctx.fillText(strDynamic(c.nameKey), sx(c.position.x) + 4, sy(c.position.y) - 6);
  }
  ctx.fillStyle = '#5aa9ff';
  for (const s of m.spawnPoints) {
    ctx.beginPath();
    ctx.arc(sx(s.position.x), sy(s.position.y), 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#ffffff44';
  ctx.strokeRect(sx(0), sy(0), BT_W * z, BT_H * z);
}
