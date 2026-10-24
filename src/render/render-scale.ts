/**
 * (06-c) Render resolution ([D30]). Phaser draws the canvas at CSS-pixel size (it ignores
 * devicePixelRatio), so GPU fill work grows with the window area. `display.renderScale` draws the
 * canvas smaller and lets the browser stretch it; the camera zoom is multiplied by the same factor
 * so the framing doesn't change. Pure, so it's unit-tested.
 */

/** 'auto' keeps full resolution up to about this many CSS pixels (1080p plus a little). */
export const AUTO_MAX_PIXELS = 1920 * 1080 * 1.1;
export const MIN_RENDER_SCALE = 0.5;

/** The render scale for a setting value and a window size (CSS px). Always in [0.5, 1]. */
export function resolveRenderScale(setting: string, cssWidth: number, cssHeight: number): number {
  if (setting !== 'auto') {
    const x = Number(setting);
    return Number.isFinite(x) && x > 0 ? clamp(x) : 1;
  }
  const px = Math.max(1, cssWidth) * Math.max(1, cssHeight);
  if (px <= AUTO_MAX_PIXELS) return 1;
  // Keep the pixel count near the budget, in steps of 0.05 so small resizes don't thrash.
  return clamp(Math.floor(Math.sqrt(AUTO_MAX_PIXELS / px) * 20) / 20);
}

function clamp(x: number): number {
  return Math.min(1, Math.max(MIN_RENDER_SCALE, x));
}
