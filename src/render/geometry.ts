/**
 * Geometry conventions the renderer assumes about WorldView.
 *
 * view.ts documents VehicleView x/y as the CENTER, but is silent for GateView and BridgeView.
 * We assume those use the same convention as MapDef `Rect`: (x, y) = TOP-LEFT corner. If
 * PHASE02-a lands them as centers, flip this one flag.
 */
export const RECT_VIEWS_ARE_TOP_LEFT = true;

export interface RectLike {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Center of a gate/bridge view. */
export function rectViewCenter(r: RectLike): { x: number; y: number } {
  return RECT_VIEWS_ARE_TOP_LEFT ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : { x: r.x, y: r.y };
}
