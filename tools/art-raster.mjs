import { PNG } from 'pngjs';
export function resize(src, w, h, crop = { x: 0, y: 0, w: src.width, h: src.height }) {
  const out = new PNG({ width: w, height: h });
  // Area sampling in premultiplied alpha keeps the tiny copper/ivory outlines clean.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const x0 = crop.x + (x * crop.w) / w,
        x1 = crop.x + ((x + 1) * crop.w) / w;
      const y0 = crop.y + (y * crop.h) / h,
        y1 = crop.y + ((y + 1) * crop.h) / h;
      let alpha = 0,
        area = 0;
      const rgb = [0, 0, 0];
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++)
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const weight =
            Math.max(0, Math.min(sx + 1, x1) - Math.max(sx, x0)) *
            Math.max(0, Math.min(sy + 1, y1) - Math.max(sy, y0));
          if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) {
            area += weight;
            continue;
          }
          const k = (sy * src.width + sx) * 4;
          const a = (src.data[k + 3] / 255) * weight;
          alpha += a;
          area += weight;
          for (let c = 0; c < 3; c++) rgb[c] += src.data[k + c] * a;
        }
      const k = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) out.data[k + c] = alpha ? Math.round(rgb[c] / alpha) : 0;
      out.data[k + 3] = Math.round((alpha / area) * 255);
    }
  return out;
}
