/**
 * Respawn-screen fixtures for the dev page (`?screen=respawn&fixture=<name>`) and tests. Each is
 * built by running the real truth model (`applyObservation`, `deriveSpawnOptions`) over
 * hand-written attempt observations on mission-01, so what you see is what the game will show.
 */
import { MISSION_01 } from '../../../content/maps/mission-01';
import type {
  AttemptObservation,
  LaneChange,
  LaneFate,
  LaneTruth,
  MarkerKind,
  SoldierId,
  SoldierRecord,
  TimelineMarker,
} from '../../../contracts/mission';
import { compareIds } from '../../../sim/core/ids';
import { createRng, nextFloat, nextInt } from '../../../sim/core/rng';
import { secondsToTicks, type Tick } from '../../../sim/core/time';
import type { MapDef } from '../../../sim/world/map';
import { applyObservation } from '../../../timeline/truth';
import { DEFAULT_TUNING } from '../../../content/tuning';
import { deriveSpawnOptions, spawnRules, type SpawnRules } from '../../../timeline/spawn-options';
import type { RespawnProps, RespawnUpdate } from '../respawn-model';
import { mapMission01, mapOutpost, mapStrip } from './map-fixtures';

/** The default spawn rules from tuning ([D7] 2 s interval, [D5] 5 s lead-in). */
export const FIXTURE_RULES: SpawnRules = spawnRules(DEFAULT_TUNING);

export interface RespawnFixture {
  name: string;
  /** Developer-facing one-liner (not shown to players). */
  about: string;
  props: RespawnProps;
  /** Progressive truth updates (the scrubber), applied one by one by the dev page. */
  stream?: RespawnUpdate[];
}

const sec = secondsToTicks;

type MarkerSpec = [kind: MarkerKind, offsetSeconds: number];

/** What the attempt did to other soldiers. Offsets are seconds after that soldier's spawn. */
interface Effects {
  /** Saved: now static at their old death tick → O. */
  rescue?: SoldierId[];
  /** Killed earlier than before. */
  kill?: [SoldierId, number][];
  /** Blocked and frozen. */
  interrupt?: [SoldierId, number][];
  /** Seen alive past their previously known death. */
  alive?: SoldierId[];
}

/** Builds a mission history attempt by attempt with the real truth model. */
export class Story {
  soldiers: SoldierRecord[] = [];
  lanes: LaneTruth[] = [];
  changes: LaneChange[] = [];
  attempts = 0;
  reached: Tick | null = null;
  complete = false;

  constructor(readonly map: MapDef = MISSION_01) {}

  options() {
    return deriveSpawnOptions(this.map, this.soldiers, this.lanes, FIXTURE_RULES);
  }

  lane(id: SoldierId): LaneTruth {
    const l = this.lanes.find((x) => x.soldierId === id);
    if (!l) throw new Error(`no lane ${id}`);
    return l;
  }

  soldier(id: SoldierId): SoldierRecord {
    const s = this.soldiers.find((x) => x.id === id);
    if (!s) throw new Error(`no soldier ${id}`);
    return s;
  }

  /** A new soldier at `pointId`'s next entry slot ([D7]) who lives `lifeS` seconds. */
  newLife(
    pointId: string,
    lifeS: number,
    cause: string | 'complete',
    fx: Effects = {},
    markers: MarkerSpec[] = [],
  ): SoldierId {
    const opt = this.options().find((o) => o.kind === 'new' && o.spawnPointId === pointId);
    const entry = opt && opt.kind === 'new' ? opt.entryTick : 0;
    return this.newLifeAt(pointId, entry, lifeS, cause, fx, markers);
  }

  /** A new soldier at an explicit spawn tick (e.g. a capture-point spawn, PHASE05-a). */
  newLifeAt(
    pointId: string,
    spawnTick: Tick,
    lifeS: number,
    cause: string | 'complete',
    fx: Effects = {},
    markers: MarkerSpec[] = [],
  ): SoldierId {
    const n = this.soldiers.length + 1;
    const id = `S${n}`;
    const end = spawnTick + sec(lifeS);
    this.soldiers.push({
      id,
      ordinal: n,
      spawnPointId: pointId,
      spawnTick,
      segments: [seg(spawnTick, end, cause === 'complete' ? 'missionComplete' : 'death')],
    });
    const fromTick = Math.max(0, spawnTick - FIXTURE_RULES.leadInTicks);
    this.play(id, 'new', spawnTick, fromTick, end, cause, fx, markers);
    return id;
  }

  /** Resumes an O and lives `lifeS` more seconds. */
  resume(
    id: SoldierId,
    lifeS: number,
    cause: string | 'complete',
    fx: Effects = {},
    markers: MarkerSpec[] = [],
  ): void {
    const l = this.lane(id);
    if (l.end.kind !== 'open') throw new Error(`${id} is not resumable`);
    const start = l.recordedTo + 1;
    const end = l.recordedTo + sec(lifeS);
    const s = this.soldier(id);
    s.segments = [
      ...s.segments,
      seg(start, end, cause === 'complete' ? 'missionComplete' : 'death'),
    ];
    const fromTick = Math.max(0, l.end.tick - FIXTURE_RULES.leadInTicks);
    this.play(id, 'resume', start, fromTick, end, cause, fx, markers);
  }

  private play(
    id: SoldierId,
    mode: 'new' | 'resume',
    controlFrom: Tick,
    fromTick: Tick,
    toTick: Tick,
    cause: string,
    fx: Effects,
    markers: MarkerSpec[],
  ): void {
    this.attempts++;
    const spawn = this.soldier(id).spawnTick;
    const lanes: Record<SoldierId, LaneFate> = {};
    for (const l of this.lanes) {
      const f = defaultFate(l, this.soldier(l.soldierId).spawnTick, fromTick, toTick);
      if (f) lanes[l.soldierId] = f;
    }
    const others = this.effectFates(fx);
    Object.assign(lanes, others.fates);
    const complete = cause === 'complete';
    lanes[id] = complete ? { kind: 'alive' } : { kind: 'died', tick: toTick, cause };
    const ms: TimelineMarker[] = [
      ...others.markers,
      ...markers.map(([kind, off]) => marker(id, controlFrom + sec(off), kind)),
    ];
    if (mode === 'new') ms.push(marker(id, spawn, 'spawn'));
    if (!complete) ms.push(marker(id, toTick, 'death'));
    this.fold({
      kind: 'attempt',
      attempt: this.attempts,
      fromTick,
      toTick,
      live: { soldierId: id, mode, controlFromTick: controlFrom },
      lanes,
      markers: ms.filter((m) => m.tick >= fromTick && m.tick <= toTick),
      missionComplete: complete ? { tick: toTick, bySoldierId: id } : undefined,
      endReason: complete ? 'missionComplete' : 'death',
    });
    this.reached = toTick;
    if (complete) this.complete = true;
  }

  private effectFates(fx: Effects): {
    fates: Record<SoldierId, LaneFate>;
    markers: TimelineMarker[];
  } {
    const fates: Record<SoldierId, LaneFate> = {};
    const markers: TimelineMarker[] = [];
    for (const id of fx.rescue ?? []) {
      const l = this.lane(id);
      fates[id] = { kind: 'static', tick: l.recordedTo };
    }
    for (const [id, off] of fx.kill ?? []) {
      const t = this.soldier(id).spawnTick + sec(off);
      fates[id] = { kind: 'died', tick: t, cause: 'fixture' };
      markers.push(marker(id, t - sec(1), 'damaged'), marker(id, t, 'death'));
    }
    for (const [id, off] of fx.interrupt ?? []) {
      const t = this.soldier(id).spawnTick + sec(off);
      fates[id] = { kind: 'interrupted', tick: t, reason: 'gate' };
      markers.push(marker(id, t, 'interrupted'));
    }
    for (const id of fx.alive ?? []) fates[id] = { kind: 'alive' };
    return { fates, markers };
  }

  /** A background resolve pass ([D23]) over [fromTick, toTick]. */
  resolve(
    fromTick: Tick,
    toTick: Tick,
    fates: Record<SoldierId, LaneFate>,
    markers: TimelineMarker[] = [],
  ) {
    this.fold({
      kind: 'resolve',
      attempt: this.attempts,
      fromTick,
      toTick,
      lanes: fates,
      markers: markers.filter((m) => m.tick >= fromTick && m.tick <= toTick),
      endReason: 'resolved',
    });
  }

  private fold(obs: AttemptObservation): void {
    const r = applyObservation(this.lanes, this.soldiers, obs);
    this.lanes = r.lanes;
    this.changes = r.changes;
  }

  props(): RespawnProps {
    return {
      map: this.map,
      soldiers: this.soldiers.map((s) => ({ ...s })),
      lanes: this.lanes,
      options: this.options(),
      changes: this.changes,
      attemptsPlayed: this.attempts,
      reachedTick: this.reached,
      objectiveComplete: this.complete,
      resolvedUntil: null,
    };
  }
}

function seg(start: Tick, end: Tick, endReason: 'death' | 'missionComplete') {
  return { startTick: start, endTick: end, waypoints: [], actions: [], endReason };
}

export function marker(soldierId: SoldierId, tick: Tick, kind: MarkerKind): TimelineMarker {
  return { soldierId, tick, kind, stringKey: `marker.${kind}` };
}

/**
 * What an unchanged replay of this lane does inside [fromTick, toTick]: the same as current truth.
 * Lanes not alive in the window are left out of the observation.
 */
function defaultFate(l: LaneTruth, spawn: Tick, fromTick: Tick, toTick: Tick): LaneFate | null {
  if (spawn > toTick) return null;
  const e = l.end;
  switch (e.kind) {
    case 'death':
      if (e.tick < fromTick) return null;
      return e.tick <= toTick ? { kind: 'died', tick: e.tick, cause: 'replay' } : { kind: 'alive' };
    case 'open':
      return e.tick <= toTick ? { kind: 'static', tick: e.tick } : { kind: 'alive' };
    case 'interrupted':
      return e.tick <= toTick
        ? { kind: 'interrupted', tick: e.tick, reason: 'replay' }
        : { kind: 'alive' };
    case 'neverSpawned':
      return { kind: 'neverSpawned', reason: 'replay' };
    case 'complete':
      return { kind: 'alive' };
    case 'unresolved':
      return l.recordedTo <= toTick ? { kind: 'static', tick: l.recordedTo } : { kind: 'alive' };
  }
}

// ---------- The fixtures ----------

function firstDeath(): RespawnFixture {
  const s = new Story();
  s.newLife('road', 41, 'turret', {}, [
    ['damaged', 38],
    ['damaged', 40],
  ]);
  return {
    name: 'first-death',
    about: 'S1 walks into the turret and dies at 0:41.',
    props: s.props(),
  };
}

function rescueStory(): Story {
  const s = new Story();
  s.newLife('road', 58, 'turret', {}, [
    ['interact', 12],
    ['damaged', 55],
  ]);
  s.newLife('beach', 70, 'mine', { rescue: ['S1'] }, [
    ['kill', 14],
    ['interact', 22],
    ['hazardDestroyed', 50],
    ['damaged', 68],
  ]);
  return s;
}

function rescue(): RespawnFixture {
  return {
    name: 'rescue',
    about: 'S2 destroys the turret; S1 survives: X becomes O.',
    props: rescueStory().props(),
  };
}

function oIgnored(): RespawnFixture {
  const s = rescueStory();
  s.newLife('road', 83, 'turret', {}, [
    ['kill', 30],
    ['damaged', 80],
  ]);
  return {
    name: 'o-ignored',
    about: 'S3 deploys new instead of resuming S1; S1 goes static at its O and stays offered.',
    props: s.props(),
  };
}

function worse(): RespawnFixture {
  const s = rescueStory();
  s.resume('S1', 42, 'turret', {}, [
    ['kill', 15],
    ['objective', 32],
  ]); // S1 lives on to 1:40
  // S3 sets off a mine that kills S2 at 0:24, before S2 destroys the turret, so S1 dies at
  // 0:58 again. Both lanes keep their old extent as a dashed "no longer happens" remainder.
  s.newLife(
    'beach',
    63,
    'turret',
    {
      kill: [
        ['S2', 24],
        ['S1', 58],
      ],
    },
    [['hazardDestroyed', 22]],
  );
  return {
    name: 'worse',
    about: 'S3 kills S2 early; the turret survives and S1 dies at 0:58 again (dashed after).',
    props: s.props(),
  };
}

function interruption(): RespawnFixture {
  const s = new Story();
  s.newLife('road', 80, 'turret', {}, [
    ['interact', 30],
    ['kill', 62],
  ]);
  s.newLife('road', 58, 'traffic', { interrupt: [['S1', 29]] }, [['interact', 23]]);
  return {
    name: 'interruption',
    about: 'S2 closes the gate before S1 reaches it: S1 freezes at 0:29 (!), frozen remainder.',
    props: s.props(),
  };
}

function twelve(): RespawnFixture {
  const s = new Story();
  s.newLife('road', 41, 'turret', {}, [['damaged', 39]]);
  s.newLife('beach', 52, 'mine', { rescue: ['S1'] }, [['hazardDestroyed', 30]]);
  s.newLife('road', 35, 'traffic');
  s.newLife('beach', 18, 'mine', {}, [['damaged', 17]]);
  s.newLife('road', 95, 'turret', {}, [
    ['kill', 30],
    ['interact', 50],
    ['hazardDestroyed', 70],
  ]);
  s.newLife('beach', 75, 'turret', { rescue: ['S4', 'S3'] }, [
    ['interact', 20],
    ['kill', 44],
  ]);
  s.newLife('road', 30, 'traffic', { kill: [['S5', 28]] });
  s.newLife('beach', 88, 'mine', { interrupt: [['S6', 40]] }, [['interact', 36]]);
  s.newLife('road', 40, 'traffic', { alive: ['S5'] }, [['kill', 20]]);
  s.newLife('beach', 60, 'mine', {}, [['damaged', 58]]);
  s.newLife('road', 70, 'turret', {}, [
    ['kill', 25],
    ['kill', 48],
  ]);
  s.newLife('beach', 45, 'mine', { rescue: ['S9'] });
  return {
    name: 'twelve',
    about:
      '12 soldiers across Road and Beach: rescues, a dashed loss, an interruption, unresolved.',
    props: s.props(),
  };
}

function dense(): RespawnFixture {
  const s = new Story();
  const rng = createRng(4040);
  const points = ['road', 'beach'];
  while (s.soldiers.length < 40) {
    const roll = nextFloat(rng);
    const opens = s.lanes.filter((l) => l.end.kind === 'open');
    if (roll < 0.12 && opens.length > 0) {
      const l = opens[nextInt(rng, 0, opens.length - 1)]!;
      s.resume(l.soldierId, nextInt(rng, 12, 50), 'turret', {}, randomMarkers(rng));
      continue;
    }
    const life = nextInt(rng, 15, 150);
    const point = points[nextInt(rng, 0, 1)]!;
    const fx: Effects = {};
    // Spawn tick of the life about to start, so effects only touch soldiers inside the window.
    const opt = s.options().find((o) => o.kind === 'new' && o.spawnPointId === point);
    const end = (opt && opt.kind === 'new' ? opt.entryTick : 0) + sec(life);
    const dead = s.lanes.filter((l) => l.end.kind === 'death' && l.end.tick <= end);
    if (dead.length > 0 && nextFloat(rng) < 0.35) {
      fx.rescue = [dead[nextInt(rng, 0, dead.length - 1)]!.soldierId];
    }
    const alive = s.lanes.filter(
      (l) => l.end.kind === 'death' && l.end.tick > end && !fx.rescue?.includes(l.soldierId),
    );
    if (alive.length > 0 && nextFloat(rng) < 0.15) {
      const v = alive[nextInt(rng, 0, alive.length - 1)]!;
      const spawn = s.soldier(v.soldierId).spawnTick;
      const off = Math.max(1, Math.floor((end - spawn) / 60) - 1);
      if (nextFloat(rng) < 0.5) fx.kill = [[v.soldierId, off]];
      else fx.interrupt = [[v.soldierId, off]];
    }
    s.newLife(point, life, 'turret', fx, randomMarkers(rng));
  }
  return {
    name: 'dense-40',
    about: '40 soldiers, generated (seeded): stress test for density and zoom.',
    props: s.props(),
  };
}

function randomMarkers(rng: ReturnType<typeof createRng>): MarkerSpec[] {
  const kinds: MarkerKind[] = ['kill', 'damaged', 'interact', 'hazardDestroyed'];
  const out: MarkerSpec[] = [];
  const n = nextInt(rng, 0, 4);
  for (let i = 0; i < n; i++)
    out.push([kinds[nextInt(rng, 0, kinds.length - 1)]!, nextInt(rng, 2, 14)]);
  return out;
}

/** Scrubber: after S5 dies at 0:40, the rest of the battle is re-resolved progressively. */
function scrubber(): RespawnFixture {
  const s = new Story();
  const s1 = s.newLife('road', 58, 'turret', {}, [['damaged', 55]]); // X 0:58
  // S2 saves S1 (O at 0:58) and dies at 1:10.
  const s2 = s.newLife('beach', 70, 'mine', { rescue: [s1] }, [['hazardDestroyed', 50]]);
  s.resume(s1, 32, 'turret', {}, [['kill', 20]]); // S1 X 1:30
  // S3 saves S1 again (O at 1:30) and dies at 1:45.
  const s3 = s.newLife('beach', 103, 'turret', { rescue: [s1] }, [['hazardDestroyed', 75]]);
  const s4 = s.newLifeAt('outpost', sec(95), 45, 'mine', {}, [['capture', 5]]); // captured point
  s.newLife('road', 38, 'traffic', {}, [['interact', 20]]); // S5 dies at 0:40: window [0, 0:40]
  const base = s.props();
  const from = (s.reached ?? 0) + 1;

  const stream: RespawnUpdate[] = [];
  const s2End = s.lane(s2).recordedTo;
  const s3End = s.lane(s3).recordedTo;
  const s4Spawn = s.soldier(s4).spawnTick;
  const end = Math.max(...s.lanes.map((l) => l.recordedTo)) + sec(2);
  for (let k = from + sec(1); ; k = Math.min(end, k + sec(1))) {
    const fates: Record<SoldierId, LaneFate> = {
      // S5 pulled the turret's attention at 0:39: it now shoots S1 at 1:12 (O -> X)...
      [s1]: k >= sec(72) ? { kind: 'died', tick: sec(72), cause: 'turret' } : { kind: 'alive' },
      // ...instead of S2, who now survives to the end of the recording (X -> O).
      [s2]: k >= s2End ? { kind: 'static', tick: s2End } : { kind: 'alive' },
      [s3]: k >= s3End ? { kind: 'died', tick: s3End, cause: 'turret' } : { kind: 'alive' },
    };
    // Without S1 the outpost is never captured, so S4 never spawns there ([D26]).
    if (k >= s4Spawn) fates[s4] = { kind: 'neverSpawned', reason: 'captureLost' };
    s.resolve(from, k, fates, [marker(s1, sec(71), 'damaged'), marker(s1, sec(72), 'death')]);
    stream.push({
      lanes: s.lanes,
      changes: s.changes,
      options: s.options(),
      resolvedUntil: k >= end ? null : k,
    });
    if (k >= end) break;
  }
  return {
    name: 'scrubber',
    about: 'Resolving history after S5 dies at 0:40: S2 X->O, S1 O->X, S4 never spawns.',
    props: { ...base, changes: [], resolvedUntil: s.reached },
    stream,
  };
}

function complete(): RespawnFixture {
  const s = rescueStory();
  s.newLife('road', 88, 'complete', {}, [
    ['kill', 30],
    ['objective', 80],
    ['objective', 86],
  ]);
  return { name: 'complete', about: 'S3 destroys the objective at 1:30 (✓).', props: s.props() };
}

function empty(): RespawnFixture {
  const s = new Story();
  return {
    name: 'empty',
    about: 'First deploy screen: no lanes yet, only spawn options.',
    props: s.props(),
  };
}

const BUILDERS: Record<string, () => RespawnFixture> = {
  empty,
  'first-death': firstDeath,
  rescue,
  'o-ignored': oIgnored,
  worse,
  interruption,
  twelve,
  'dense-40': dense,
  scrubber,
  complete,
  // (06-b) Revealed map, from real recordings (map-fixtures.ts).
  map: () => ({
    name: 'map',
    about: 'Mission 1 from real recordings: X at the turret and in the mines, S1 rescued → O',
    props: mapMission01(),
  }),
  'map-outpost': () => ({
    name: 'map-outpost',
    about: 'Mission 2 from real recordings: the Outpost captured (forward spawn on the map)',
    props: mapOutpost(),
  }),
  'map-tall': () => ({
    name: 'map-tall',
    about: 'A tall strip (forward = up) with three bottom spawns, from real recordings',
    props: mapStrip(),
  }),
};

export const FIXTURE_NAMES = Object.keys(BUILDERS);

export function buildFixture(name: string): RespawnFixture | null {
  const b = BUILDERS[name];
  return b ? b() : null;
}

/** All lane ids in stable order (handy for tests). */
export function laneIds(lanes: readonly LaneTruth[]): SoldierId[] {
  return lanes.map((l) => l.soldierId).sort(compareIds);
}
