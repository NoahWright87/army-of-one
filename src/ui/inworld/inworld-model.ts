/**
 * (POC, in-world respawn) Pure logic for picking a spawn inside the battle replay instead of on
 * the respawn screen: the stops the jump buttons step through (spawns and deaths, by battle
 * time), which spawn options are close enough to the scrub time to show a circle, and where in
 * the world each circle goes. No DOM.
 */
import type { LaneTruth, SoldierId, SpawnOption } from '../../contracts/mission';
import type { Tick } from '../../sim/core/time';
import type { MapDef } from '../../sim/world/map';

export type StopKind = 'new' | 'resume' | 'death';

/** One place the |◀ / ▶| buttons jump to. */
export interface Stop {
  tick: Tick;
  kind: StopKind;
  /** Spawn stops: the option deployed from here. */
  option?: SpawnOption;
  /** Resume and death stops: whose. */
  soldierId?: SoldierId;
  /** Stable identity (for the scrub bar marks). */
  key: string;
}

export function optionTick(o: SpawnOption): Tick {
  return o.kind === 'new' ? o.entryTick : o.resumeTick;
}

export function optionKeyOf(o: SpawnOption): string {
  return o.kind === 'new' ? `new:${o.spawnPointId}:${o.entryTick}` : `resume:${o.soldierId}`;
}

const KIND_ORDER: Record<StopKind, number> = { death: 0, resume: 1, new: 2 };

/** Every spawn option and every death, by battle time (deaths first on a tie). */
export function buildStops(options: readonly SpawnOption[], lanes: readonly LaneTruth[]): Stop[] {
  const out: Stop[] = [];
  for (const o of options) {
    out.push({
      tick: optionTick(o),
      kind: o.kind,
      option: o,
      ...(o.kind === 'resume' ? { soldierId: o.soldierId } : {}),
      key: optionKeyOf(o),
    });
  }
  for (const l of lanes) {
    if (l.end.kind === 'death') {
      out.push({
        tick: l.end.tick,
        kind: 'death',
        soldierId: l.soldierId,
        key: `death:${l.soldierId}`,
      });
    }
  }
  return out.sort(
    (a, b) => a.tick - b.tick || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || cmp(a.key, b.key),
  );
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The next stop after `current` (dir 1) or before it (dir -1). `current` is the stop the player
 * last jumped to, so several stops on the same tick are stepped through one by one; without one,
 * it's strictly later / earlier than `tick`.
 */
export function stepStop(
  stops: readonly Stop[],
  tick: Tick,
  dir: 1 | -1,
  current: string | null,
): Stop | null {
  const at = current ? stops.findIndex((s) => s.key === current) : -1;
  if (at >= 0 && stops[at]!.tick === tick) return stops[at + dir] ?? null;
  if (dir === 1) return stops.find((s) => s.tick > tick) ?? null;
  for (let i = stops.length - 1; i >= 0; i--) if (stops[i]!.tick < tick) return stops[i]!;
  return null;
}

/**
 * The circles to draw at `tick`, nearest in time first: every new-soldier spawn point (they
 * stand still, so they're always shown; tapping one snaps to its slot), and resumes within
 * `window` ticks (their circle rides on the soldier, who is only there around that time).
 */
export function nearbyOptions(
  options: readonly SpawnOption[],
  tick: Tick,
  window: Tick,
): SpawnOption[] {
  return options
    .filter((o) => o.kind === 'new' || Math.abs(optionTick(o) - tick) <= window)
    .sort((a, b) => Math.abs(optionTick(a) - tick) - Math.abs(optionTick(b) - tick));
}

/**
 * Where an option's circle sits: a new soldier at its spawn point; a resume on the soldier
 * (from the replayed world, `soldierAt`), falling back to their spawn point.
 */
export function optionPlace(
  o: SpawnOption,
  map: MapDef,
  soldierAt: (id: SoldierId) => { x: number; y: number } | null,
  spawnPointOf: (id: SoldierId) => string | null,
): { x: number; y: number } | null {
  if (o.kind === 'resume') {
    const p = soldierAt(o.soldierId);
    if (p) return p;
    const sp = spawnPointOf(o.soldierId);
    return sp ? spawnPos(map, sp) : null;
  }
  return spawnPos(map, o.spawnPointId);
}

function spawnPos(map: MapDef, id: string): { x: number; y: number } | null {
  const p = map.spawnPoints.find((s) => s.id === id);
  return p ? { x: p.position.x, y: p.position.y } : null;
}

/** How far the replay should run: the latest recorded tick, or at least `min`. */
export function replayEnd(lanes: readonly LaneTruth[], min: Tick): Tick {
  let end = min;
  for (const l of lanes) end = Math.max(end, l.recordedTo);
  return end;
}

// ---------- (PHASE19) chevrons and letters ----------

/** A spawn point's letter: A, B, C… in the map's order. */
export function spawnLetter(map: MapDef, spawnPointId: string): string {
  const i = map.spawnPoints.findIndex((s) => s.id === spawnPointId);
  return i < 0 ? '?' : String.fromCharCode(65 + (i % 26));
}

/** A spawn point's name from its letter: Alpha, Bravo… (`names` from strings). */
export function spawnName(map: MapDef, spawnPointId: string, names: readonly string[]): string {
  const i = map.spawnPoints.findIndex((s) => s.id === spawnPointId);
  return names[i] ?? spawnLetter(map, spawnPointId);
}

/** One chevron over the timeline. */
export interface Chevron {
  option: SpawnOption;
  key: string;
  tick: Tick;
  /** A–Z for a new soldier's spawn point; the soldier's number for a resume. */
  label: string;
  kind: 'new' | 'resume';
  /** Its place in the stack at this time (0 = nearest the bar). */
  stack: number;
  /** The quick-redeploy choice (last spawn used). */
  last: boolean;
}

/** Every spawn option as a chevron, stacked where several share a time (new before resume). */
export function chevrons(
  options: readonly SpawnOption[],
  map: MapDef,
  ordinalOf: (id: SoldierId) => number,
  preferred: SpawnOption | null | undefined,
): Chevron[] {
  const pref = preferred ? optionKeyOf(preferred) : null;
  const sorted = [...options].sort(
    (a, b) =>
      optionTick(a) - optionTick(b) ||
      (a.kind === b.kind ? 0 : a.kind === 'new' ? -1 : 1) ||
      (a.kind === 'new' && b.kind === 'new'
        ? cmp(spawnLetter(map, a.spawnPointId), spawnLetter(map, b.spawnPointId))
        : cmp(optionKeyOf(a), optionKeyOf(b))),
  );
  const heights = new Map<Tick, number>();
  return sorted.map((o) => {
    const tick = optionTick(o);
    const stack = heights.get(tick) ?? 0;
    heights.set(tick, stack + 1);
    const key = optionKeyOf(o);
    return {
      option: o,
      key,
      tick,
      label: o.kind === 'new' ? spawnLetter(map, o.spawnPointId) : String(ordinalOf(o.soldierId)),
      kind: o.kind,
      stack,
      last: key === pref,
    };
  });
}
