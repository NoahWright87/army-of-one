/**
 * Tiny map thumbnail for spawn options: walls and water from the MapDef, every spawn point as a
 * dot, the option's own point as a big ringed marker. Pure: returns SVG markup.
 */
import type { MapDef } from '../../sim/world/map';

export interface ThumbOptions {
  /** Spawn point to mark. */
  pointId: string;
  /** Rendered size in px (the map keeps its aspect ratio inside it). */
  width: number;
  height: number;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

export function mapThumbSvg(map: MapDef, o: ThumbOptions): string {
  const W = map.width;
  const H = map.height;
  const unit = Math.max(W, H) / 100; // marker sizes relative to the map, so they read at any size
  const pad = unit * 6;
  const rects = (list: MapDef['walls'], cls: string) =>
    list
      .map(
        (r) =>
          `<rect class="${cls}" x="${r1(r.x)}" y="${r1(r.y)}" width="${r1(r.w)}" height="${r1(r.h)}"/>`,
      )
      .join('');
  const points = map.spawnPoints
    .map((p) => {
      const on = p.id === o.pointId;
      const r = on ? unit * 5 : unit * 2.2;
      const ring = on
        ? `<circle class="th-ring" cx="${r1(p.position.x)}" cy="${r1(p.position.y)}" r="${r1(r * 1.9)}" stroke-width="${r1(unit * 1.2)}"/>`
        : '';
      return `${ring}<circle class="${on ? 'th-pt on' : 'th-pt'}" cx="${r1(p.position.x)}" cy="${r1(p.position.y)}" r="${r1(r)}"/>`;
    })
    .join('');
  return (
    // Padded so a marker on the map edge isn't clipped.
    `<svg class="thumb" viewBox="${r1(-pad)} ${r1(-pad)} ${r1(W + 2 * pad)} ${r1(H + 2 * pad)}" ` +
    `width="${o.width}" height="${o.height}" ` +
    `preserveAspectRatio="xMidYMid meet" aria-hidden="true">` +
    `<rect class="th-bg" x="0" y="0" width="${W}" height="${H}"/>` +
    rects(map.water, 'th-water') +
    rects(map.walls, 'th-wall') +
    points +
    `</svg>`
  );
}
