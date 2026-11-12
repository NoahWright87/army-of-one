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
  RoleId,
} from '../../contracts/mission';
import { compareIds } from '../../sim/core/ids';
import { formatBattleTime, TICKS_PER_SECOND, type Tick } from '../../sim/core/time';
import type { MapDef } from '../../sim/world/map';
import { ROLES } from '../../content/roles';
import {
  availableAt,
  balanceAt,
  canAfford,
  formatMoney,
  rateAt,
  type Ledger,
} from '../../timeline/economy';
import type { RevealOptions } from '../../timeline/reveal';
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
  /** (06-b) Revealed-map options (`revealOptions(tuning)`); default: from DEFAULT_TUNING. */
  reveal?: RevealOptions;
  /**
   * (07-c) Role picker ([D36]): the role the next new soldier deploys as, and where a pick goes.
   * Without `onRole` there's no picker (dev fixtures).
   */
  roleId?: RoleId;
  onRole?: (roleId: RoleId) => void;
  /**
   * The option selected when the screen opens: the quick-redeploy choice (last spawn point's
   * next slot), so DEPLOY is one tap back into the action. Absent: the first option.
   */
  preferred?: SpawnOption | null;
  /** (PHASE11) Money on the timeline ([D51]); absent = no money shown (fixtures, economy off). */
  economy?: Ledger;
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
  economy?: Ledger;
}

// ---------- Rows ----------

export interface LaneRow {
  soldierId: SoldierId;
  ordinal: number;
  label: string;
  /** The soldier's role (an icon replaces the name, PHASE12-c). */
  roleId: RoleId;
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
        roleId: s?.roleId ?? 'rifleman',
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
      return end.hp === undefined
        ? str('respawn.end.open', { n, time: formatBattleTime(end.tick) })
        : str('respawn.end.openHp', {
            n,
            time: formatBattleTime(end.tick),
            hp: Math.round(end.hp * 100),
          });
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

// ---------- Money (PHASE11) ----------

/** The economy, if one is shown (present and enabled). */
export function shownEconomy(p: Pick<RespawnProps, 'economy'>): Ledger | null {
  return p.economy && p.economy.enabled ? p.economy : null;
}

/** The option card's money line: what a new soldier there can spend, or "already paid". */
export function optionMoney(
  o: SpawnOption,
  p: Pick<RespawnProps, 'economy'>,
): { text: string; debt: boolean } | null {
  const l = shownEconomy(p);
  if (!l) return null;
  if (o.kind === 'resume') return { text: str('money.resumePaid'), debt: false };
  const v = availableAt(l, o.entryTick);
  const money = formatMoney(v);
  return v < 0
    ? { text: str('money.availableDebt', { money }), debt: true }
    : { text: str('money.available', { money }), debt: false };
}

export interface RoleMoney {
  roleId: RoleId;
  /** "Free" / "$50". */
  price: string;
  affordable: boolean;
}

/** Each role's price, and whether a new soldier at the selected option can afford it. */
export function roleMoney(o: SpawnOption | null, p: Pick<RespawnProps, 'economy'>): RoleMoney[] {
  const l = shownEconomy(p);
  if (!l) return [];
  return ROLES.map((r) => {
    const cost = r.cost; // the economy is on here (shownEconomy)
    return {
      roleId: r.id,
      price: cost > 0 ? str('money.cost', { n: cost }) : str('money.free'),
      affordable: o?.kind !== 'new' || canAfford(l, o.entryTick, cost),
    };
  });
}

/** "Not enough money at 0:26 (needs $50, $20 to spend)": the picked role falls back to free. */
export function cantAffordText(
  o: SpawnOption | null,
  roleId: RoleId,
  p: Pick<RespawnProps, 'economy'>,
): string | null {
  const l = shownEconomy(p);
  if (!l || o?.kind !== 'new') return null;
  const m = roleMoney(o, p).find((r) => r.roleId === roleId);
  if (!m || m.affordable) return null;
  return str('money.cantAfford', {
    time: formatBattleTime(o.entryTick),
    cost: m.price,
    money: formatMoney(availableAt(l, o.entryTick)),
  });
}

/** Tooltip for a point on the money line. */
export function moneyTip(l: Ledger, t: Tick): string {
  return str('money.lineTip', {
    money: formatMoney(balanceAt(l, t)),
    time: formatBattleTime(t),
    rate: str('money.rate', { n: Math.round(rateAt(l, t) * 10) / 10 }),
  });
}

// ---------- Timeline rows (PHASE12-c: spawn points on the timeline) ----------

/** A spawn point's row: its marker sits at its next entry slot ([D7]). */
export interface SpawnTimelineRow {
  kind: 'spawn';
  spawnPointId: string;
  /** Its option's key, or null when the point isn't offered right now (closed / lost). */
  key: OptionKey | null;
  option: Extract<SpawnOption, { kind: 'new' }> | null;
  name: string;
  /** When the point opened (0 for initial points, the capture tick for forward ones). */
  openTick: Tick;
  /** Earlier entries at this point (the queue so far). */
  entries: Tick[];
  /** Its soldiers are folded into compact lines. */
  collapsed: boolean;
  /** How many soldiers belong to it. */
  count: number;
  y: number;
  h: number;
}

export interface LaneTimelineRow {
  kind: 'lane';
  row: LaneRow;
  /** The spawn point it's nested under. */
  spawnPointId: string;
  /** Resumable (offered) or selected: full height. Everything else is shorter. */
  interactive: boolean;
  /** Folded under a collapsed spawn point: a thin line, no label. */
  compact: boolean;
  /** Its spawn tick (where the branch leaves the spawn row). */
  spawnTick: Tick;
  y: number;
  h: number;
}

export type TimelineRow = SpawnTimelineRow | LaneTimelineRow;

/** Row heights from the base row height: spawn rows and inert lanes are shorter. */
export function rowHeights(rowH: number): {
  spawn: number;
  lane: number;
  inert: number;
  compact: number;
} {
  return {
    spawn: Math.max(22, Math.round(rowH * 0.6)),
    lane: rowH,
    inert: Math.max(22, Math.round(rowH * 0.62)),
    compact: 8,
  };
}

/**
 * (PHASE12-d) Every timeline row top to bottom, grouped by spawn point (map order): the point's
 * row, then its soldiers nested under it. Within a group, soldiers you can resume come first,
 * earliest resume first; the rest follow by spawn time. A collapsed point folds its soldiers
 * into thin unlabeled lines. Each row has its y and height.
 */
export function timelineRows(
  p: Pick<RespawnProps, 'map' | 'lanes' | 'soldiers' | 'options' | 'captures'>,
  selected: OptionKey | null,
  rowH: number,
  collapsed: ReadonlySet<string> = new Set(),
): TimelineRow[] {
  const hs = rowHeights(rowH);
  const resumeTick = new Map<SoldierId, Tick>();
  for (const o of p.options) if (o.kind === 'resume') resumeTick.set(o.soldierId, o.resumeTick);
  const bySoldier = new Map(p.soldiers.map((s) => [s.id, s]));
  const lanes = laneRows(p.lanes, p.soldiers, p.map);
  const groups = new Map<string, LaneRow[]>();
  for (const l of lanes) {
    const sp = bySoldier.get(l.soldierId)?.spawnPointId ?? '';
    const g = groups.get(sp) ?? [];
    g.push(l);
    groups.set(sp, g);
  }
  const out: TimelineRow[] = [];
  let y = 0;
  const known = new Set(p.map.spawnPoints.map((sp) => sp.id));
  const order = [
    ...p.map.spawnPoints.map((sp) => sp.id),
    ...[...groups.keys()].filter((k) => !known.has(k)),
  ];
  for (const spId of order) {
    const sp = p.map.spawnPoints.find((x) => x.id === spId);
    const members = groups.get(spId) ?? [];
    const option =
      p.options.find(
        (o): o is Extract<SpawnOption, { kind: 'new' }> =>
          o.kind === 'new' && o.spawnPointId === spId,
      ) ?? null;
    if (!option && members.length === 0) continue;
    const cap =
      sp?.kind === 'capture'
        ? (p.captures ?? []).find((c) => c.pointId === sp.capturePointId && c.stage === 'ours')
        : undefined;
    const openTick = cap?.tick ?? 0;
    const fold = collapsed.has(spId) && members.length > 0;
    if (sp) {
      out.push({
        kind: 'spawn',
        spawnPointId: spId,
        key: option ? optionKey(option) : null,
        option,
        name: spawnPointName(p.map, spId),
        openTick,
        entries: members
          .map((m) => bySoldier.get(m.soldierId)?.spawnTick ?? 0)
          .sort((a, b) => a - b),
        collapsed: fold,
        count: members.length,
        y,
        h: hs.spawn,
      });
      y += hs.spawn;
    }
    const sorted = [...members].sort((a, b) => {
      const ra = resumeTick.get(a.soldierId);
      const rb = resumeTick.get(b.soldierId);
      if (ra !== undefined || rb !== undefined) {
        if (ra === undefined) return 1;
        if (rb === undefined) return -1;
        if (ra !== rb) return ra - rb;
      }
      const sa = bySoldier.get(a.soldierId)?.spawnTick ?? 0;
      const sb = bySoldier.get(b.soldierId)?.spawnTick ?? 0;
      return sa - sb || a.ordinal - b.ordinal;
    });
    for (const row of sorted) {
      const interactive = resumeTick.has(row.soldierId) || selected === `resume:${row.soldierId}`;
      const h = fold ? hs.compact : interactive ? hs.lane : hs.inert;
      out.push({
        kind: 'lane',
        row,
        spawnPointId: spId,
        interactive,
        compact: fold,
        spawnTick: bySoldier.get(row.soldierId)?.spawnTick ?? row.lane.recordedFrom,
        y,
        h,
      });
      y += h;
    }
  }
  return out;
}

/** The option to select when the screen opens: `preferred` if still offered, else the first. */
export function initialSelection(
  options: readonly SpawnOption[],
  preferred: SpawnOption | null | undefined,
): OptionKey | null {
  if (preferred && findOption(options, optionKey(preferred))) return optionKey(preferred);
  return defaultSelection(options);
}
