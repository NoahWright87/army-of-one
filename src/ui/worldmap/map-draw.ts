/**
 * (PHASE13-c) A quick top-down sketch of a `MapDef` on a 2D canvas: painted ground, walls,
 * water, cover, gates, and what's in it (enemy soldiers by role, turrets, mines, capture points,
 * the objective, our spawns). Used by the world map viewer's level preview.
 */
import { BLOCK_CELLS, GROUND, isGroundKind } from '../../content/ground';
import { isRectItem, type BlockDef } from '../../gen/block';
export { fillGaps as displayOwner } from '../../gen/carve';
import type { MapDef, Rect } from '../../sim/world/map';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

const ROLE_COLOR: Record<string, string> = {
  rifleman: '#e0534a',
  grenadier: '#f08a3a',
  gunner: '#c2185b',
  sniper: '#9c27b0',
  shield: '#8d99ae',
  shotgun: '#ff7043',
  bazooka: '#ffb300',
  truck: '#ffd54f',
  tank: '#fff176',
};

export function roleColor(role: string | undefined): string {
  return ROLE_COLOR[role ?? 'rifleman'] ?? '#e0534a';
}

/** Draws `map` scaled by `k` (px per world unit) at the context's origin. */
export function drawMapSketch(ctx: CanvasRenderingContext2D, map: MapDef, k: number): void {
  const rect = (r: Rect) => ctx.fillRect(r.x * k, r.y * k, r.w * k, r.h * k);
  ctx.fillStyle = '#3c5c2c';
  ctx.fillRect(0, 0, map.width * k, map.height * k);
  if (map.ground) {
    const cs = map.ground.cellSize * k;
    map.ground.rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        const ch = row[c]!;
        if (!isGroundKind(ch)) continue;
        ctx.fillStyle = hex(GROUND[ch].color);
        ctx.fillRect(c * cs, r * cs, cs + 0.5, cs + 0.5);
      }
    });
  }
  ctx.fillStyle = hex(GROUND.W.color);
  for (const w of map.water) rect(w);
  ctx.fillStyle = 'rgba(5,7,10,0.6)';
  for (const b of map.bounds ?? []) rect(b);
  ctx.fillStyle = '#1d2024';
  for (const w of map.walls) rect(w);
  ctx.fillStyle = '#b39b6b';
  for (const c of map.cover ?? []) rect(c.rect);
  ctx.fillStyle = '#d08a2a';
  for (const g of map.gates ?? []) rect(g.rect);
  const dot = (x: number, y: number, r: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x * k, y * k, r, 0, Math.PI * 2);
    ctx.fill();
  };
  for (const cp of map.capturePoints ?? []) {
    ctx.strokeStyle = cp.objective ? '#ffd34d' : '#7fb6ff';
    ctx.lineWidth = cp.objective ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.arc(cp.position.x * k, cp.position.y * k, Math.max(5, 90 * k), 0, Math.PI * 2);
    ctx.stroke();
    if (cp.objective) dot(cp.position.x, cp.position.y, 4, '#ffd34d');
  }
  for (const m of map.mines ?? []) dot(m.position.x, m.position.y, 1.8, '#ff5252');
  for (const t of map.turrets ?? []) {
    ctx.fillStyle = '#8e2b22';
    const s = 4;
    ctx.fillRect(t.position.x * k - s, t.position.y * k - s, 2 * s, 2 * s);
  }
  for (const sq of map.squads ?? []) {
    for (const m of sq.members) {
      const big = m.role === 'truck' || m.role === 'tank';
      dot(m.position.x, m.position.y, big ? 4.5 : 2.6, roleColor(m.role));
    }
  }
  for (const sp of map.spawnPoints) {
    if (sp.kind !== 'initial') continue;
    dot(sp.position.x, sp.position.y, 3.5, '#4caf50');
  }
}

/**
 * (PHASE13-c) A world board's painted ground and placed walls, `px` per tile, at the context's
 * origin. `oriented` is the board's blocks already turned as placed.
 */
export function drawBoardGround(
  ctx: CanvasRenderingContext2D,
  oriented: readonly (readonly Pick<BlockDef, 'ground' | 'items'>[])[],
  px: number,
): void {
  const bs = BLOCK_CELLS * px;
  oriented.forEach((row, br) =>
    row.forEach((b, bc) => {
      const ox = bc * bs;
      const oy = br * bs;
      b.ground.forEach((line, r) => {
        for (let col = 0; col < line.length; col++) {
          const ch = line[col]!;
          ctx.fillStyle = isGroundKind(ch) ? hex(GROUND[ch].color) : '#000';
          ctx.fillRect(ox + col * px, oy + r * px, px, px);
        }
      });
      ctx.fillStyle = '#1d2024';
      for (const it of b.items) {
        if (it.kind !== 'wall' || !isRectItem(it)) continue;
        const [x, y, ww, hh] = it.rect;
        ctx.fillRect(ox + x * px, oy + y * px, Math.max(1, ww * px), Math.max(1, hh * px));
      }
    }),
  );
}

/** RGBA 0–255. */
export type Rgba = readonly [number, number, number, number];

/**
 * (PHASE13-d) Carved levels as an image one pixel per board tile ([D109]): each level's ground
 * tinted by `fill`, its edge tiles in `edge`; ground in no level left clear. Draw it scaled up
 * with smoothing off.
 */
export function levelOverlay(
  owner: Int16Array,
  w: number,
  h: number,
  style: (level: number) => { fill: Rgba | null; edge: Rgba | null },
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const cache = new Map<number, ReturnType<typeof style>>();
  for (let i = 0; i < w * h; i++) {
    const lv = owner[i]!;
    if (lv < 0) continue;
    let st = cache.get(lv);
    if (!st) cache.set(lv, (st = style(lv)));
    const x = i % w;
    const edge =
      (x > 0 && owner[i - 1] !== lv) ||
      (x < w - 1 && owner[i + 1] !== lv) ||
      (i >= w && owner[i - w] !== lv) ||
      (i + w < w * h && owner[i + w] !== lv);
    const col = edge && st.edge ? st.edge : st.fill;
    if (!col) continue;
    img.data.set(col, i * 4);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** (PHASE13-d) Per level, the tile of its own nearest its middle ([y, x]): where labels go. */
export function levelAnchors(owner: Int16Array, w: number, count: number): [number, number][] {
  const sum = Array.from({ length: count }, () => ({ x: 0, y: 0, n: 0 }));
  for (let i = 0; i < owner.length; i++) {
    const lv = owner[i]!;
    if (lv < 0) continue;
    sum[lv]!.x += i % w;
    sum[lv]!.y += Math.floor(i / w);
    sum[lv]!.n++;
  }
  const best = sum.map(() => ({ d: Infinity, at: [0, 0] as [number, number] }));
  for (let i = 0; i < owner.length; i++) {
    const lv = owner[i]!;
    if (lv < 0) continue;
    const s = sum[lv]!;
    const x = i % w;
    const y = Math.floor(i / w);
    const d = (x - s.x / s.n) ** 2 + (y - s.y / s.n) ** 2;
    if (d < best[lv]!.d) best[lv] = { d, at: [y, x] };
  }
  return best.map((b) => b.at);
}
