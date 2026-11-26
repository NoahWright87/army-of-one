import { hash01 } from '../../sim/core/hash';
import type { ConcealmentArea } from '../../sim/world/map';

export interface ConcealmentPainter {
  fillRect(
    x: number,
    y: number,
    w: number,
    h: number,
    color: number,
    alpha: number,
    radius?: number,
  ): void;
  outlineRect(
    x: number,
    y: number,
    w: number,
    h: number,
    color: number,
    width: number,
    radius: number,
  ): void;
  circle(x: number, y: number, radius: number, color: number, alpha: number): void;
  line(ax: number, ay: number, bx: number, by: number, color: number, width: number): void;
}

/** World-space artwork shared by the battle renderer and the scenario editor. */
export function drawConcealment(painter: ConcealmentPainter, area: ConcealmentArea): void {
  const {
    id,
    kind,
    painted,
    rect: { x, y, w, h },
  } = area;
  if (painted) {
    painter.fillRect(x, y, w, h, 0x3f3028, 0.9);
  } else if (kind === 'trench') {
    painter.fillRect(x - 3, y - 3, w + 6, h + 6, 0x7c6348, 1, 6);
    painter.fillRect(x, y, w, h, 0x3f3028, 1, 4);
    if (w > 10 && h > 10) painter.outlineRect(x + 5, y + 5, w - 10, h - 10, 0x9b7652, 2, 4);
  } else {
    painter.fillRect(x, y, w, h, 0x293f28, 1, Math.min(12, w / 2, h / 2));
    const colors = [0x779250, 0x537141, 0x395a36];
    const count = Math.ceil((w * h) / 440);
    for (let i = 0; i < count; i++) {
      painter.circle(
        x + w * hash01(`${id}:${i}:x`),
        y + h * hash01(`${id}:${i}:y`),
        7 + (i % 9),
        colors[i % colors.length]!,
        0.8,
      );
    }
  }
}

export function drawTrenchRims(
  painter: ConcealmentPainter,
  rows: readonly string[],
  size: number,
  bounds = { left: 0, top: 0, right: rows[0]?.length ?? 0, bottom: rows.length },
): void {
  const edge = (ax: number, ay: number, bx: number, by: number) => {
    painter.line(ax, ay, bx, by, 0x7c6348, 7);
    painter.line(ax, ay, bx, by, 0x9b7652, 2);
  };
  for (let y = bounds.top; y < bounds.bottom; y++) {
    const row = rows[y]!;
    for (let x = bounds.left; x < Math.min(row.length, bounds.right); x++) {
      if (row[x] !== 'T') continue;
      const left = x * size;
      const top = y * size;
      const right = left + size;
      const bottom = top + size;
      if (row[x - 1] !== 'T') edge(left, top, left, bottom);
      if (row[x + 1] !== 'T') edge(right, top, right, bottom);
      if (rows[y - 1]?.[x] !== 'T') edge(left, top, right, top);
      if (rows[y + 1]?.[x] !== 'T') edge(left, bottom, right, bottom);
    }
  }
}
