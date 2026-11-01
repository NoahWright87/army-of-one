/**
 * Pure tick ↔ pixel math for the respawn timeline: the shared battle-time x-axis, zoom about a
 * point, pan, "fit all", clamping and axis tick labels. No DOM.
 */
import { formatBattleTime, TICKS_PER_SECOND, type Tick } from '../../sim/core/time';

/** What part of battle time is on screen. */
export interface TimeView {
  /** Tick at x = 0 of the plot. */
  startTick: number;
  /** Horizontal scale. */
  pxPerTick: number;
  /** Plot width in px. */
  width: number;
}

/** Inclusive tick range the timeline covers. */
export interface TimeDomain {
  from: Tick;
  to: Tick;
}

/** Most zoomed in: 3 px per tick = 180 px per second. */
export const MAX_PX_PER_TICK = 3;
/** Breathing room at both ends of the axis when fitted, in px. */
export const FIT_PAD_PX = 28;
/** Shortest domain we show (an empty or very short history still gets a readable axis). */
export const MIN_DOMAIN_TICKS = 30 * TICKS_PER_SECOND;

export function tickToX(v: TimeView, t: number): number {
  return (t - v.startTick) * v.pxPerTick;
}

export function xToTick(v: TimeView, x: number): number {
  return v.startTick + x / v.pxPerTick;
}

/** Ticks visible across the plot. */
export function visibleTicks(v: TimeView): number {
  return v.width / v.pxPerTick;
}

/** The whole domain on screen with a little padding on both sides. */
export function fitView(domain: TimeDomain, width: number, padPx = FIT_PAD_PX): TimeView {
  const w = Math.max(1, width);
  const span = Math.max(1, domain.to - domain.from);
  const usable = Math.max(1, w - 2 * padPx);
  const pxPerTick = Math.min(MAX_PX_PER_TICK, usable / span);
  return { startTick: domain.from - padPx / pxPerTick, pxPerTick, width: w };
}

/** Allowed zoom range: from "fit all" up to MAX_PX_PER_TICK. */
export function zoomLimits(domain: TimeDomain, width: number): { min: number; max: number } {
  const min = fitView(domain, width).pxPerTick;
  return { min, max: Math.max(min, MAX_PX_PER_TICK) };
}

/**
 * Keeps the view inside the domain (plus fit padding). When everything fits, the view is the
 * fitted one; otherwise the visible window is clamped so neither end runs past the data.
 */
export function clampView(v: TimeView, domain: TimeDomain): TimeView {
  const { min, max } = zoomLimits(domain, v.width);
  const pxPerTick = Math.min(max, Math.max(min, v.pxPerTick));
  if (pxPerTick <= min + 1e-12) return fitView(domain, v.width);
  const pad = FIT_PAD_PX / pxPerTick;
  const lo = domain.from - pad;
  const hi = domain.to + pad - v.width / pxPerTick;
  const startTick = Math.min(hi, Math.max(lo, v.startTick));
  return { startTick, pxPerTick, width: v.width };
}

/** Zooms by `factor` (>1 zooms in) keeping the tick under `anchorX` fixed. */
export function zoomAt(v: TimeView, anchorX: number, factor: number, domain: TimeDomain): TimeView {
  const anchorTick = xToTick(v, anchorX);
  const { min, max } = zoomLimits(domain, v.width);
  const pxPerTick = Math.min(max, Math.max(min, v.pxPerTick * factor));
  return clampView(
    { startTick: anchorTick - anchorX / pxPerTick, pxPerTick, width: v.width },
    domain,
  );
}

/** Pans by a pointer drag of `dx` px (dragging right shows earlier time). */
export function panBy(v: TimeView, dx: number, domain: TimeDomain): TimeView {
  return clampView({ ...v, startTick: v.startTick - dx / v.pxPerTick }, domain);
}

/** Same view at a new plot width, keeping the left edge (or refitting if it was fitted). */
export function resizeView(v: TimeView, width: number, domain: TimeDomain, wasFit: boolean) {
  return wasFit ? fitView(domain, width) : clampView({ ...v, width }, domain);
}

/** True when the view is (approximately) the fitted view. */
export function isFitted(v: TimeView, domain: TimeDomain): boolean {
  const f = fitView(domain, v.width);
  return Math.abs(f.pxPerTick - v.pxPerTick) / f.pxPerTick < 1e-6;
}

/** Candidate label spacings in seconds. */
const STEPS_S = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200];

/** Smallest "nice" step whose labels are at least `minPx` apart. */
export function axisStepTicks(v: TimeView, minPx = 64): Tick {
  for (const s of STEPS_S) {
    const t = s * TICKS_PER_SECOND;
    if (t * v.pxPerTick >= minPx) return t;
  }
  return STEPS_S[STEPS_S.length - 1]! * TICKS_PER_SECOND;
}

export interface AxisTick {
  tick: Tick;
  x: number;
  label: string;
}

/** Labeled ticks inside the visible window (never before battle time 0). */
export function axisTicks(v: TimeView, minPx = 64): AxisTick[] {
  const step = axisStepTicks(v, minPx);
  const first = Math.max(0, Math.ceil(v.startTick / step) * step);
  const last = xToTick(v, v.width);
  const out: AxisTick[] = [];
  for (let t = first; t <= last; t += step) {
    out.push({ tick: t, x: tickToX(v, t), label: formatBattleTime(t) });
  }
  return out;
}

/** Pinch: zoom factor between two finger distances (guards against zero). */
export function pinchFactor(prevDist: number, dist: number): number {
  if (prevDist <= 0 || dist <= 0) return 1;
  return dist / prevDist;
}

/** Wheel: zoom factor for a wheel delta (negative deltaY zooms in). */
export function wheelZoomFactor(deltaY: number): number {
  return Math.exp(-deltaY * 0.0015);
}
