/**
 * Pure respawn-screen logic: rows, span/end styling, captions, labels, option selection and
 * keyboard cycling, the scrubber's dimmed range. The DOM layer (respawn-screen.ts) only renders
 * what these functions return. No DOM, no sim knowledge beyond the shared contracts.
 */
import { str, strDynamic } from '../../content/strings';
import type {
  CaptureChange,
  CaptureTruth,
  LaneChange,
  LaneEnd,
  LaneSpan,
  LaneSpanKind,
  LaneTruth,
  MarkerKind,
  SoldierId,
  SoldierRecord,
  SpawnOption,
  TimelineMarker,
} from '../../contracts/mission';
import { compareIds } from '../../sim/core/ids';
import { formatBattleTime, TICKS_PER_SECOND, type Tick } from '../../sim/core/time';
import type { MapDef } from '../../sim/world/map';
import { MIN_DOMAIN_TICKS, type TimeDomain } from './time-scale';

/** Everything the screen renders. PHASE04 builds this from MissionState + the latest fold. */
export interface RespawnProps {
  map: MapDef;
  /** Every recorded soldier (for ordinals and spawn points). */
  soldiers: readonly SoldierRecord[];
  lanes: readonly LaneTruth[];
  options: readonly SpawnOption[];
  /** Lanes whose endpoint changed in the latest fold (pulsed + captioned). */
  changes?: readonly LaneChange[];
  /** Attempts played so far (MissionState.attemptCount). The header shows the next one. */
  attemptsPlayed: number;
  /** Last simulated tick of the latest attempt, or null before the first attempt. */
  reachedTick: Tick | null;
  objectiveComplete?: boolean;
  /**
   * Scrubber position ([D23]): history is confirmed up to this tick; null/undefined = no
   * background resolve running (everything shown is current truth).
   */
  resolvedUntil?: Tick | null;
  /** (05-a) Capture truth: forward points and when they became ours. */
  captures?: readonly CaptureTruth[];
  /** (05-a) Points whose capture changed in the latest fold ("Point lost" etc.). */
  captureChanges?: readonly CaptureChange[];
}

/** A progressive truth update (from the scrubber, or a fresh fold). */
export interface RespawnUpdate {
  lanes?: readonly LaneTruth[];
  changes?: readonly LaneChange[];
  options?: readonly SpawnOption[];
  resolvedUntil?: Tick | null;
  reachedTick?: Tick | null;
  attemptsPlayed?: number;
  objectiveComplete?: boolean;
  soldiers?: readonly SoldierRecord[];
  captures?: readonly CaptureTruth[];
  captureChanges?: readonly CaptureChange[];
}

// ---------- Rows ----------

export interface LaneRow {
  soldierId: SoldierId;
  ordinal: number;
  label: string;
  spawnName: string;
  lane: LaneTruth;
  neverSpawned: boolean;
}

/** One row per lane, ordered by ordinal (falls back to id order for unknown soldiers). */
export function laneRows(
  lanes: readonly LaneTruth[],
  soldiers: readonly SoldierRecord[],
  map: MapDef,
): LaneRow[] {
  const byId = new Map(soldiers.map((s) => [s.id, s]));
  return lanes
    .map((lane) => {
      const s = byId.get(lane.soldierId);
      const ordinal = s?.ordinal ?? ordinalFromId(lane.soldierId);
      return {
        soldierId: lane.soldierId,
        ordinal,
        label: str('respawn.timeline.soldier', { n: ordinal }),
        spawnName: s ? spawnPointName(map, s.spawnPointId) : '',
        lane,
        neverSpawned: lane.end.kind === 'neverSpawned',
      };
    })
    .sort((a, b) => a.ordinal - b.ordinal || compareIds(a.soldierId, b.soldierId));
}

export function ordinalFromId(id: SoldierId): number {
  const m = /(\d+)$/.exec(id);
  return m ? Number(m[1]) : 0;
}

/** (05-a) Display name of a capture point. */
export function capturePointName(map: MapDef, pointId: string): string {
  const c = (map.capturePoints ?? []).find((p) => p.id === pointId);
  return strDynamic(c ? c.nameKey : pointId);
}

/** (05-a) The capture point a spawn point belongs to (forward spawns only). */
export function captureOfSpawn(map: MapDef, spawnPointId: string): string | null {
  const p = map.spawnPoints.find((sp) => sp.id === spawnPointId);
  return p?.kind === 'capture' ? (p.capturePointId ?? null) : null;
}

/** (05-a) "Point lost" / "captured" captions, flagged `lost` for the highlight. */
export function captureChangeCaption(
  c: CaptureChange,
  map: MapDef,
): { text: string; lost: boolean } {
  const point = capturePointName(map, c.pointId);
  if (c.after === null) return { text: str('respawn.change.pointLost', { point }), lost: true };
  if (c.before === null) {
    return {
      text: str('respawn.change.pointCaptured', { point, time: formatBattleTime(c.after) }),
      lost: false,
    };
  }
  return {
    text: str('respawn.change.pointMoved', { point, time: formatBattleTime(c.after) }),
    lost: false,
  };
}

/** (05-a) Capture flags drawn on the time axis: every point held as ours, with its tick. */
export function captureFlags(
  p: Pick<RespawnProps, 'map' | 'captures' | 'resolvedUntil'>,
): { pointId: string; tick: Tick; label: string; unconfirmed: boolean }[] {
  return (p.captures ?? [])
    .filter((c) => c.stage === 'ours')
    .map((c) => ({
      pointId: c.pointId,
      tick: c.tick,
      label: str('respawn.capture.tip', {
        point: capturePointName(p.map, c.pointId),
        time: formatBattleTime(c.tick),
      }),
      unconfirmed: isUnconfirmed(c.tick, p.resolvedUntil),
    }));
}

export function spawnPointName(map: MapDef, spawnPointId: string): string {
  const p = map.spawnPoints.find((sp) => sp.id === spawnPointId);
  return strDynamic(p ? p.nameKey : `spawn.fixture.${spawnPointId}`);
}

// ---------- Styling ----------

/** CSS class per span kind (see the stylesheet in respawn-screen.ts). */
export function spanClass(kind: LaneSpanKind): string {
  switch (kind) {
    case 'alive':
      return 'sp-alive'; // solid
    case 'lost':
      return 'sp-lost'; // dashed + grey: "you made it worse" / no longer happens
    case 'frozen':
      return 'sp-frozen'; // dashed, interruption colour
    case 'unresolved':
      return 'sp-unresolved'; // hatched + shimmer
  }
}

/**
 * Spans as drawn: adjacent spans of the same kind are joined even when different attempts
 * established them (the attempt doesn't matter to the player; a seam would look like an event).
 */
export function displaySpans(
  spans: readonly LaneSpan[],
): { from: Tick; to: Tick; kind: LaneSpanKind }[] {
  const out: { from: Tick; to: Tick; kind: LaneSpanKind }[] = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    if (last && last.kind === s.kind && last.to + 1 === s.from) last.to = s.to;
    else out.push({ from: s.from, to: s.to, kind: s.kind });
  }
  return out;
}

export type EndGlyph = 'X' | 'O' | '!' | '✓';

export interface EndStyle {
  glyph: EndGlyph | null;
  cls: string;
  tick: Tick | null;
  /** Only O endpoints can be clicked/tapped to select a resume. */
  selectable: boolean;
}

export function endStyle(end: LaneEnd): EndStyle {
  switch (end.kind) {
    case 'death':
      return { glyph: 'X', cls: 'end-x', tick: end.tick, selectable: false };
    case 'open':
      return { glyph: 'O', cls: 'end-o', tick: end.tick, selectable: true };
    case 'interrupted':
      return { glyph: '!', cls: 'end-bang', tick: end.tick, selectable: false };
    case 'complete':
      return { glyph: '✓', cls: 'end-check', tick: end.tick, selectable: false };
    case 'neverSpawned':
    case 'unresolved':
      return { glyph: null, cls: '', tick: null, selectable: false };
  }
}

export function endTooltip(end: LaneEnd, ordinal: number): string {
  const n = ordinal;
  switch (end.kind) {
    case 'death':
      return str('respawn.end.death', { n, time: formatBattleTime(end.tick) });
    case 'open':
      return str('respawn.end.open', { n, time: formatBattleTime(end.tick) });
    case 'interrupted':
      return str('respawn.end.interrupted', { n, time: formatBattleTime(end.tick) });
    case 'complete':
      return str('respawn.end.complete', { n, time: formatBattleTime(end.tick) });
    case 'neverSpawned':
      return str('respawn.end.neverSpawned', { n });
    case 'unresolved':
      return str('respawn.end.unresolved', { n });
  }
}

/** Markers drawn as subtle dots along the lane. End-type markers are covered by the glyph. */
const EVENT_MARKERS: ReadonlySet<MarkerKind> = new Set<MarkerKind>([
  'kill',
  'hazardDestroyed',
  'interact',
  'damaged',
  'capture',
  'objective',
]);

export function isEventMarker(m: TimelineMarker): boolean {
  return EVENT_MARKERS.has(m.kind);
}

export function markerTooltip(m: TimelineMarker, ordinal: number): string {
  const what = strDynamic(m.stringKey === '' ? `marker.${m.kind}` : m.stringKey);
  return str('marker.tip', { what, n: ordinal, time: formatBattleTime(m.tick) });
}

/**
 * Sub-ranges of `next` whose kind differs from what `prev` showed at the same ticks (or that
 * `prev` didn't cover). These get a one-shot "history changed" animation.
 */
export function changedRanges(
  prev: readonly LaneSpan[] | undefined,
  next: readonly LaneSpan[],
): { from: Tick; to: Tick; kind: LaneSpanKind }[] {
  if (!prev) return [];
  const out: { from: Tick; to: Tick; kind: LaneSpanKind }[] = [];
  for (const s of next) {
    let t = s.from;
    while (t <= s.to) {
      const p = prev.find((x) => x.from <= t && x.to >= t);
      const segEnd = p ? Math.min(s.to, p.to) : nextStart(prev, t, s.to);
      if (!p || p.kind !== s.kind) push(out, { from: t, to: segEnd, kind: s.kind });
      t = segEnd + 1;
    }
  }
  return out;
}

function nextStart(spans: readonly LaneSpan[], t: Tick, limit: Tick): Tick {
  let end = limit;
  for (const s of spans) if (s.from > t && s.from - 1 < end) end = s.from - 1;
  return end;
}

function push(out: { from: Tick; to: Tick; kind: LaneSpanKind }[], r: (typeof out)[number]) {
  const last = out[out.length - 1];
  if (last && last.kind === r.kind && last.to + 1 === r.from) last.to = r.to;
  else out.push(r);
}

// ---------- Captions ----------

export function changeCaption(change: LaneChange, ordinal: number): string {
  const n = ordinal;
  const a = change.after;
  switch (a.kind) {
    case 'open':
      return str('respawn.change.survived', { n });
    case 'death':
      return str('respawn.change.diesAt', { n, time: formatBattleTime(a.tick) });
    case 'interrupted':
      return str('respawn.change.interrupted', { n, time: formatBattleTime(a.tick) });
    case 'neverSpawned':
      return str('respawn.change.neverSpawned', { n });
    case 'unresolved':
      return str('respawn.change.unresolved', { n });
    case 'complete':
      return str('respawn.change.complete', { n });
  }
}

/** Visible captions: newest first, at most `max`, plus a "+N more" tail. */
export function captionList(captions: readonly string[], max = 4): string[] {
  const newest = [...captions].reverse();
  if (newest.length <= max) return newest;
  return [...newest.slice(0, max), str('respawn.change.more', { n: newest.length - max })];
}

// ---------- Header ----------

export interface HeaderItem {
  label: string;
  value: string;
  cls?: string;
}

export function headerItems(p: RespawnProps): { title: string; items: HeaderItem[] } {
  const flagOnly =
    (p.map.objectives ?? []).length === 0 && (p.map.capturePoints ?? []).some((c) => c.objective);
  const done = flagOnly ? 'respawn.header.objectiveCaptured' : 'respawn.header.objectiveDone';
  const open = flagOnly ? 'respawn.header.objectiveNotCaptured' : 'respawn.header.objectiveIntact';
  return {
    title: str('respawn.header.attempt', { n: p.attemptsPlayed + 1 }),
    items: [
      { label: str('respawn.header.soldiers'), value: String(p.soldiers.length) },
      {
        label: str('respawn.header.reached'),
        value:
          p.reachedTick === null
            ? str('respawn.header.reachedNone')
            : formatBattleTime(p.reachedTick),
      },
      {
        label: str('respawn.header.objective'),
        value: p.objectiveComplete ? str(done) : str(open),
        cls: p.objectiveComplete ? 'done' : 'pending',
      },
    ],
  };
}

// ---------- Domain / scrubber ----------

/** Battle-time range the axis covers: 0 to the latest thing worth showing. */
export function timelineDomain(p: {
  lanes: readonly LaneTruth[];
  options: readonly SpawnOption[];
  reachedTick: Tick | null;
  resolvedUntil?: Tick | null;
  captures?: readonly CaptureTruth[];
}): TimeDomain {
  let to = 0;
  for (const l of p.lanes) to = Math.max(to, l.recordedTo);
  for (const o of p.options) to = Math.max(to, o.kind === 'new' ? o.entryTick : o.resumeTick);
  for (const c of p.captures ?? []) to = Math.max(to, c.tick);
  if (p.reachedTick !== null) to = Math.max(to, p.reachedTick);
  if (p.resolvedUntil !== null && p.resolvedUntil !== undefined) to = Math.max(to, p.resolvedUntil);
  // A little room after the last event so end glyphs never sit on the edge.
  to = Math.ceil((to + 3 * TICKS_PER_SECOND) / TICKS_PER_SECOND) * TICKS_PER_SECOND;
  return { from: 0, to: Math.max(MIN_DOMAIN_TICKS, to) };
}

/** Time to the right of the scrubber is dimmed as unconfirmed. null = nothing dimmed. */
export function unconfirmedRange(
  resolvedUntil: Tick | null | undefined,
  domain: TimeDomain,
): TimeDomain | null {
  if (resolvedUntil === null || resolvedUntil === undefined) return null;
  if (resolvedUntil >= domain.to) return null;
  return { from: Math.max(domain.from, resolvedUntil), to: domain.to };
}

/** True while the scrubber hasn't confirmed this tick yet ([D23]: still deployable). */
export function isUnconfirmed(tick: Tick, resolvedUntil: Tick | null | undefined): boolean {
  return resolvedUntil !== null && resolvedUntil !== undefined && tick > resolvedUntil;
}

// ---------- Options and selection ----------

export type OptionKey = string;

export function optionKey(o: SpawnOption): OptionKey {
  return o.kind === 'new' ? `new:${o.spawnPointId}` : `resume:${o.soldierId}`;
}

export function findOption(
  options: readonly SpawnOption[],
  key: OptionKey | null,
): SpawnOption | null {
  if (key === null) return null;
  return options.find((o) => optionKey(o) === key) ?? null;
}

/** The resume option belonging to a lane's O, if offered. */
export function resumeOptionFor(
  options: readonly SpawnOption[],
  soldierId: SoldierId,
): SpawnOption | null {
  return options.find((o) => o.kind === 'resume' && o.soldierId === soldierId) ?? null;
}

/** Default selection on open: the first offered option (a new soldier at the first point). */
export function defaultSelection(options: readonly SpawnOption[]): OptionKey | null {
  return options[0] ? optionKey(options[0]) : null;
}

/**
 * After options change (e.g. the scrubber removes an O), keep the selection if it's still
 * offered. Otherwise clear it, so Enter never deploys something the player didn't pick.
 */
export function reconcileSelection(
  prev: OptionKey | null,
  options: readonly SpawnOption[],
): OptionKey | null {
  return prev !== null && findOption(options, prev) ? prev : null;
}

/** Arrow/Tab cycling through the option list (wraps around). */
export function cycleSelection(
  options: readonly SpawnOption[],
  current: OptionKey | null,
  dir: 1 | -1,
): OptionKey | null {
  if (options.length === 0) return null;
  const i = current === null ? -1 : options.findIndex((o) => optionKey(o) === current);
  if (i < 0) return optionKey(dir === 1 ? options[0]! : options[options.length - 1]!);
  const n = options.length;
  return optionKey(options[(i + dir + n) % n]!);
}

export type ScreenKeyAction = 'next' | 'prev' | 'deploy' | 'zoomIn' | 'zoomOut' | 'fit' | null;

/** Keyboard map for the respawn screen. */
export function screenKeyAction(key: string, shift: boolean): ScreenKeyAction {
  switch (key) {
    case 'ArrowDown':
    case 'ArrowRight':
      return 'next';
    case 'ArrowUp':
    case 'ArrowLeft':
      return 'prev';
    case 'Tab':
      return shift ? 'prev' : 'next';
    case 'Enter':
      return 'deploy';
    case '+':
    case '=':
      return 'zoomIn';
    case '-':
    case '_':
      return 'zoomOut';
    case '0':
    case 'f':
    case 'F':
      return 'fit';
    default:
      return null;
  }
}

export interface OptionLabel {
  key: OptionKey;
  title: string;
  detail: string;
  deployLabel: string;
  /** Tick the player takes control (entry or resume). */
  tick: Tick;
  unconfirmed: boolean;
  /** (05-a) A forward (capture) spawn point. */
  forward?: boolean;
  /** (05-a) "Captured at 0:45 by Soldier 1". */
  capturedBy?: string;
}

function ordinalOf(soldiers: readonly SoldierRecord[], id: SoldierId): number {
  return soldiers.find((s) => s.id === id)?.ordinal ?? ordinalFromId(id);
}

export function optionLabel(
  o: SpawnOption,
  p: Pick<RespawnProps, 'map' | 'soldiers' | 'resolvedUntil' | 'captures'>,
): OptionLabel {
  if (o.kind === 'new') {
    const point = spawnPointName(p.map, o.spawnPointId);
    const time = formatBattleTime(o.entryTick);
    const cpId = captureOfSpawn(p.map, o.spawnPointId);
    const cap = cpId
      ? (p.captures ?? []).find((c) => c.pointId === cpId && c.stage === 'ours')
      : undefined;
    const n = nextOrdinal(p.soldiers);
    const by = cap?.by[0] ? ordinalOf(p.soldiers, cap.by[0]) : null;
    return {
      key: optionKey(o),
      title: str('respawn.spawn.newTitle', { point, time }),
      detail: cap
        ? str('respawn.spawn.forwardDetail', { open: formatBattleTime(cap.tick), n })
        : str('respawn.spawn.newDetail', { n }),
      ...(cap && by !== null
        ? { capturedBy: str('respawn.spawn.forwardOpen', { time: formatBattleTime(cap.tick), by }) }
        : {}),
      deployLabel: str('respawn.deploy.new', { point, time }),
      tick: o.entryTick,
      unconfirmed: cap ? isUnconfirmed(cap.tick, p.resolvedUntil) : false,
      forward: !!cpId,
    };
  }
  const s = p.soldiers.find((x) => x.id === o.soldierId);
  const n = s?.ordinal ?? ordinalFromId(o.soldierId);
  const time = formatBattleTime(o.resumeTick);
  return {
    key: optionKey(o),
    title: str('respawn.spawn.resumeTitle', { n, time }),
    detail: str('respawn.spawn.resumeDetail', { from: formatBattleTime(o.leadInFromTick) }),
    deployLabel: str('respawn.deploy.resume', { n, time }),
    tick: o.resumeTick,
    unconfirmed: isUnconfirmed(o.resumeTick, p.resolvedUntil),
  };
}

export function nextOrdinal(soldiers: readonly SoldierRecord[]): number {
  let max = 0;
  for (const s of soldiers) max = Math.max(max, s.ordinal);
  return max + 1;
}
