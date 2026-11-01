/**
 * (06-b) Pure logic for the respawn screen's revealed map ([D29]): which markers to draw, their
 * tooltips and what clicking them selects, plus layout maths. The DOM layer (map-panel.ts) only
 * renders what these return. No DOM.
 */
import { str, strDynamic } from '../../content/strings';
import { DEFAULT_TUNING } from '../../content/tuning';
import type { SoldierId, SpawnOption } from '../../contracts/mission';
import { formatBattleTime, type Tick } from '../../sim/core/time';
import type { MapDef, Rect } from '../../sim/world/map';
import {
  knownThings,
  RevealGrid,
  revealOptions,
  sameRevealOptions,
  type RevealedMap,
  type RevealOptions,
} from '../../timeline/reveal';
import {
  optionKey,
  optionLabel,
  ordinalFromId,
  spawnPointName,
  type OptionKey,
  type RespawnProps,
} from './respawn-model';

export type MapMarkerKind =
  | 'spawn'
  | 'objective'
  | 'flag'
  | 'turret'
  | 'mine'
  | 'traffic'
  | 'gate'
  | 'bridge'
  | 'capture'
  | 'death'
  | 'open'
  | 'interrupted';

export interface MapMarker {
  kind: MapMarkerKind;
  id: string;
  x: number;
  y: number;
  /** Traffic lanes: the other end. */
  x2?: number;
  y2?: number;
  /** Gates and bridges. */
  rect?: Rect;
  tip: string;
  /** Short text drawn next to it (spawn names). */
  label?: string;
  /** Clicking it selects this spawn option. */
  select?: OptionKey;
  selected: boolean;
  /** Destroyed / not open / done: drawn muted (objectives: drawn as done). */
  inactive: boolean;
}

/** Draw order: area things, hazards, objectives, spawns, then X / ! (so a death on a spawn shows), then O. */
const ORDER: Record<MapMarkerKind, number> = {
  traffic: 0,
  gate: 1,
  bridge: 1,
  mine: 2,
  turret: 3,
  death: 7.5,
  interrupted: 7.5,
  capture: 5,
  objective: 6,
  flag: 6,
  spawn: 7,
  open: 8,
};

const time = (t: Tick) => formatBattleTime(t);

/** Markers for the map, sorted in draw order (stable by id within a layer). */
export function mapMarkers(
  props: Pick<RespawnProps, 'map' | 'soldiers' | 'options' | 'captures'>,
  known: RevealedMap,
  selected: OptionKey | null,
): MapMarker[] {
  const map = props.map;
  const out: MapMarker[] = [];
  const byKey = new Map<OptionKey, SpawnOption>(props.options.map((o) => [optionKey(o), o]));
  const ordinal = (id: SoldierId) =>
    props.soldiers.find((s) => s.id === id)?.ordinal ?? ordinalFromId(id);

  for (const s of known.spawns) {
    const key = `new:${s.id}`;
    const opt = byKey.get(key);
    const name = spawnPointName(map, s.id);
    out.push({
      kind: 'spawn',
      id: s.id,
      x: s.x,
      y: s.y,
      label: name,
      tip: opt ? optionLabel(opt, props).title : str('respawn.map.spawnClosed', { point: name }),
      ...(opt ? { select: key } : {}),
      selected: key === selected,
      inactive: !opt,
    });
  }

  for (const t of known.threats) {
    switch (t.kind) {
      case 'turret':
        out.push({
          kind: 'turret',
          id: t.id,
          x: t.x,
          y: t.y,
          tip: t.destroyed
            ? str('respawn.map.turretDestroyed', {
                time: time(t.destroyed.tick),
                n: ordinal(t.destroyed.by),
              })
            : str('respawn.map.turret'),
          selected: false,
          inactive: !!t.destroyed,
        });
        break;
      case 'mine':
        out.push({
          kind: 'mine',
          id: t.id,
          x: t.x,
          y: t.y,
          tip: t.destroyed
            ? str('respawn.map.mineGone', { time: time(t.destroyed.tick) })
            : str('respawn.map.mine'),
          selected: false,
          inactive: !!t.destroyed,
        });
        break;
      case 'traffic':
        out.push({
          kind: 'traffic',
          id: t.id,
          x: t.x,
          y: t.y,
          x2: t.x2,
          y2: t.y2,
          tip: str('respawn.map.traffic'),
          selected: false,
          inactive: false,
        });
        break;
      case 'gate':
        out.push({
          kind: 'gate',
          id: t.id,
          x: t.rect.x + t.rect.w / 2,
          y: t.rect.y + t.rect.h / 2,
          rect: t.rect,
          tip: str('respawn.map.gate'),
          selected: false,
          inactive: false,
        });
        break;
      case 'bridge':
        out.push({
          kind: 'bridge',
          id: t.id,
          x: t.rect.x + t.rect.w / 2,
          y: t.rect.y + t.rect.h / 2,
          rect: t.rect,
          tip: t.destroyed
            ? str('respawn.map.bridgeBlown', {
                time: time(t.destroyed.tick),
                n: ordinal(t.destroyed.by),
              })
            : str(t.bridgeKind === 'draw' ? 'respawn.map.drawbridge' : 'respawn.map.bridge'),
          selected: false,
          inactive: !!t.destroyed,
        });
        break;
    }
  }

  for (const o of known.objectives) {
    const point = o.nameKey ? strDynamic(o.nameKey) : '';
    out.push({
      kind: o.kind === 'flag' ? 'flag' : 'objective',
      id: o.id,
      x: o.x,
      y: o.y,
      tip:
        o.kind === 'flag'
          ? o.done
            ? str('respawn.map.flagDone', { point, time: time(o.done.tick) })
            : str('respawn.map.flag', { point })
          : o.done
            ? str('respawn.map.objectiveDone', { time: time(o.done.tick) })
            : str('respawn.map.objective'),
      selected: false,
      inactive: !!o.done,
    });
  }

  for (const c of known.capturePoints) {
    const point = strDynamic(c.nameKey);
    out.push({
      kind: 'capture',
      id: c.id,
      x: c.x,
      y: c.y,
      tip:
        c.oursTick !== null
          ? str('respawn.map.captureOurs', { point, time: time(c.oursTick) })
          : str('respawn.map.capture', { point }),
      selected: false,
      inactive: c.oursTick === null,
    });
  }

  for (const e of known.ends) {
    const n = e.ordinal;
    if (e.kind === 'open') {
      const key = `resume:${e.soldierId}`;
      const has = byKey.has(key);
      out.push({
        kind: 'open',
        id: e.soldierId,
        x: e.x,
        y: e.y,
        tip: str('respawn.map.open', { n, time: time(e.tick) }),
        ...(has ? { select: key } : {}),
        selected: key === selected,
        inactive: !has,
      });
    } else {
      out.push({
        kind: e.kind,
        id: e.soldierId,
        x: e.x,
        y: e.y,
        tip: str(e.kind === 'death' ? 'respawn.map.death' : 'respawn.map.interrupted', {
          n,
          time: time(e.tick),
        }),
        selected: false,
        inactive: false,
      });
    }
  }

  return out
    .map((m, i) => ({ m, i }))
    .sort((a, b) => ORDER[a.m.kind] - ORDER[b.m.kind] || a.i - b.i)
    .map(({ m }) => m);
}

/**
 * Spawn labels that fit without overlapping (selected first, then in order). `u` = map units per
 * px. On a narrow strip the spawns sit close together, so some names are dropped (their
 * tooltips and the spawn list still name them).
 */
export function labelsThatFit(markers: readonly MapMarker[], u: number): Set<string> {
  const boxes: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const out = new Set<string>();
  const spawns = markers.filter((m) => m.kind === 'spawn' && m.label);
  spawns.sort((a, b) => Number(b.selected) - Number(a.selected));
  for (const m of spawns) {
    const w = m.label!.length * 7.2 + 6;
    const x = m.x / u;
    const y = m.y / u;
    const box = { x0: x - w / 2, x1: x + w / 2, y0: y - 30, y1: y + 30 };
    if (boxes.some((b) => b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1))
      continue;
    boxes.push(box);
    out.add(m.id);
  }
  return out;
}

// ---------- Layout ----------

/** Maps clearly taller than wide get their own column (06-a's vertical strip). */
export function isTallMap(map: Pick<MapDef, 'width' | 'height'>): boolean {
  return map.height > map.width * 1.2;
}

/**
 * Width of the map column for a tall map: as wide as the map's aspect allows at the available
 * height, clamped so it neither vanishes nor crowds the timeline.
 */
export function tallMapWidth(
  map: Pick<MapDef, 'width' | 'height'>,
  availHeight: number,
  min: number,
  max: number,
): number {
  const w = availHeight * (map.width / map.height);
  return Math.round(Math.max(min, Math.min(max, w)));
}

/** World units per CSS pixel when the map is fitted ("meet") into a box. */
export function unitsPerPx(
  map: Pick<MapDef, 'width' | 'height'>,
  boxW: number,
  boxH: number,
  pad: number,
): number {
  if (boxW <= 0 || boxH <= 0) return 1;
  return Math.max((map.width + 2 * pad) / boxW, (map.height + 2 * pad) / boxH);
}

// ---------- Shared grid ----------

let cached: { mapId: string; opts: RevealOptions; grid: RevealGrid } | null = null;

/**
 * The reveal grid for a map, kept across respawn screens so every scrubber step and every open
 * is an incremental update.
 */
export function sharedRevealGrid(map: MapDef, opts?: RevealOptions): RevealGrid {
  const o = opts ?? revealOptions(DEFAULT_TUNING);
  if (!cached || cached.mapId !== map.id || !sameRevealOptions(cached.opts, o)) {
    cached = { mapId: map.id, opts: o, grid: new RevealGrid(map, o) };
  }
  return cached.grid;
}

/** Updates the shared grid from the props and returns it with what's known. */
export function revealFor(
  props: Pick<RespawnProps, 'map' | 'soldiers' | 'lanes' | 'captures' | 'reveal'>,
): { grid: RevealGrid; known: RevealedMap } {
  const grid = sharedRevealGrid(props.map, props.reveal);
  grid.update(props.soldiers, props.lanes);
  return {
    grid,
    known: knownThings(props.map, grid, props.soldiers, props.lanes, props.captures ?? []),
  };
}
