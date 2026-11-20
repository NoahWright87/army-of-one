/** Bounded presentation history. Samples actual positions, never extends a shot to its range. */
import { PROJECTILE_VISUAL_TUNING } from '../content/tuning';

export interface ProjectilePosition {
  id: string;
  x: number;
  y: number;
}
interface Sample {
  x: number;
  y: number;
  tick: number;
}
export interface TrailSegment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** 1 at the head, approaching 0 at the age/length limit. */
  strength: number;
}

export class ProjectileTrails {
  private readonly paths = new Map<string, Sample[]>();
  private lastTick = -1;
  private readonly scratch: TrailSegment[] = [];

  record(tick: number, positions: readonly ProjectilePosition[]): void {
    // Scrubbing, mission resets and non-contiguous views must not connect unrelated positions.
    if (tick !== this.lastTick + 1) this.paths.clear();
    this.lastTick = tick;
    const alive = new Set<string>();
    for (const p of positions) {
      alive.add(p.id);
      let path = this.paths.get(p.id);
      const prev = path?.[path.length - 1];
      if (
        !path ||
        (prev && Math.hypot(p.x - prev.x, p.y - prev.y) > PROJECTILE_VISUAL_TUNING.snapDistance)
      ) {
        path = [];
        this.paths.set(p.id, path);
      }
      path.push({ x: p.x, y: p.y, tick });
      if (path.length > PROJECTILE_VISUAL_TUNING.historyTicks) path.shift();
    }
    // A stopped/despawned projectile leaves no trail beyond the collision, or stale history.
    for (const id of this.paths.keys()) if (!alive.has(id)) this.paths.delete(id);
  }

  /** Reuses its output; consume before calling again. Head is the interpolated render position. */
  segments(
    id: string,
    x: number,
    y: number,
    tick: number,
    durationTicks: number,
    maxLength: number,
  ): readonly TrailSegment[] {
    const out = this.scratch;
    out.length = 0;
    const path = this.paths.get(id);
    if (!path || durationTicks <= 0 || maxLength <= 0) return out;
    let newerTick = tick;
    let distance = 0;
    for (let i = path.length - 1; i >= 0; i--) {
      const p = path[i]!;
      if (p.tick >= tick) continue;
      const ageLeft = durationTicks - (tick - newerTick);
      if (ageLeft <= 0) break;
      const length = Math.hypot(p.x - x, p.y - y);
      const f = Math.min(
        1,
        ageLeft / (newerTick - p.tick),
        length > 0 ? (maxLength - distance) / length : 1,
      );
      const tx = x + (p.x - x) * f;
      const ty = y + (p.y - y) * f;
      const endTick = newerTick + (p.tick - newerTick) * f;
      if (length > 0.001) {
        const n = Math.ceil((length * f) / PROJECTILE_VISUAL_TUNING.trailSegmentLength);
        for (let j = 0; j < n; j++) {
          const midpoint = (j + 0.5) / n;
          const age = tick - (newerTick + (endTick - newerTick) * midpoint);
          out.push({
            x0: x + ((tx - x) * j) / n,
            y0: y + ((ty - y) * j) / n,
            x1: x + ((tx - x) * (j + 1)) / n,
            y1: y + ((ty - y) * (j + 1)) / n,
            strength: Math.max(
              0,
              1 - Math.max(age / durationTicks, (distance + length * f * midpoint) / maxLength),
            ),
          });
        }
      }
      distance += length * f;
      x = tx;
      y = ty;
      newerTick = endTick;
      if (f < 1 || distance >= maxLength) break;
    }
    return out;
  }
}

/** Shared player hue, quieter echoes, and a distinct coral enemy hue. */
const STYLES = {
  hostile: { color: 0xff684f, core: 0xffe4da, alpha: 1 },
  echo: { color: 0xb5a47a, core: 0xe4d8b6, alpha: 0.55 },
  live: { color: 0xffdd83, core: 0xfff8df, alpha: 1 },
};
export function projectileStyle(hostile: boolean, by: string | undefined, liveId: string | null) {
  if (hostile) return STYLES.hostile;
  return by !== undefined && by !== liveId ? STYLES.echo : STYLES.live;
}
