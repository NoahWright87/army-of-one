import type { ConcealmentPainter } from './concealment-art';

export function canvasConcealmentPainter(ctx: CanvasRenderingContext2D): ConcealmentPainter {
  const ink = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
  const fill = (color: number, alpha: number) => {
    ctx.fillStyle = ink(color);
    ctx.globalAlpha *= alpha;
    ctx.fill();
  };
  const rect = (x: number, y: number, w: number, h: number, radius: number) => {
    ctx.beginPath();
    if (radius) ctx.roundRect(x, y, w, h, radius);
    else ctx.rect(x, y, w, h);
  };
  const stroke = (color: number, width: number) => {
    ctx.strokeStyle = ink(color);
    ctx.lineWidth = width;
    ctx.stroke();
  };
  return {
    fillRect(x, y, w, h, color, alpha, radius = 0) {
      ctx.save();
      rect(x, y, w, h, radius);
      fill(color, alpha);
      ctx.restore();
    },
    outlineRect(x, y, w, h, color, width, radius) {
      rect(x, y, w, h, radius);
      stroke(color, width);
    },
    circle(x, y, radius, color, alpha) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      fill(color, alpha);
      ctx.restore();
    },
    line(ax, ay, bx, by, color, width) {
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      stroke(color, width);
    },
  };
}
