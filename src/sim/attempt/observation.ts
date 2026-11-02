/**
 * Builds an `AttemptObservation` from what an attempt (or resolve pass) simulated: every lane's
 * fate in [fromTick, toTick] and the timeline markers inside the window.
 */
import type {
  AttemptObservation,
  CaptureObservation,
  LaneFate,
  MarkerKind,
  SoldierId,
  TimelineMarker,
} from '../../contracts/mission';
import { compareIds } from '../core/ids';
import type { Tick } from '../core/time';
import type { SimEvent } from '../events';
import type { World } from '../state';
import { simPerf } from '../perf';
import { soldierIndex } from '../sim';
import type { EchoController, EchoTransition } from '../recording/echo-controller';

/** String keys (into src/content/strings.ts) for each marker kind's tooltip. */
export const MARKER_STRING_KEYS: Record<MarkerKind, string> = {
  spawn: 'marker.spawn',
  kill: 'marker.kill',
  hazardDestroyed: 'marker.hazardDestroyed',
  interact: 'marker.interact',
  damaged: 'marker.damaged',
  capture: 'marker.capture',
  objective: 'marker.objective',
  interrupted: 'marker.interrupted',
  death: 'marker.death',
  open: 'marker.open',
};

/** (05-a) Capture markers: our flag raised ('ours') vs. the enemy flag lowered ('neutral'). */
export const CAPTURE_STRING_KEYS = {
  ours: 'marker.capture',
  neutral: 'marker.captureNeutral',
} as const;

export interface ObservationHeader {
  kind: AttemptObservation['kind'];
  attempt: number;
  fromTick: Tick;
  live?: AttemptObservation['live'];
}

export class ObservationBuilder {
  readonly header: ObservationHeader;
  private readonly markers: TimelineMarker[] = [];
  private readonly captures: CaptureObservation[] = [];
  /** Soldiers that were alive (in the world, not dead) at fromTick or spawned later. */
  private readonly existed = new Set<SoldierId>();

  constructor(header: ObservationHeader, world: World) {
    this.header = header;
    for (const s of world.state.soldiers) if (s.alive) this.existed.add(s.id);
  }

  private mark(
    soldierId: SoldierId,
    tick: Tick,
    kind: MarkerKind,
    refId?: string,
    stringKey = MARKER_STRING_KEYS[kind],
  ): void {
    this.markers.push({
      soldierId,
      tick,
      kind,
      stringKey,
      ...(refId !== undefined ? { refId } : {}),
    });
  }

  /** Feeds one tick's events (only events by/about our soldiers become markers). */
  ingest(world: World, events: readonly SimEvent[]): void {
    const isSoldier = (id: string | undefined): id is string => {
      if (id === undefined) return false;
      if (!simPerf.soldierIndex) return world.state.soldiers.some((s) => s.id === id);
      return soldierIndex(world.state.soldiers).has(id);
    };
    /** (07-d) One of ours (a recorded/live soldier), not an enemy soldier. */
    const isOurs = (id: string | undefined): id is string => {
      if (!isSoldier(id)) return false;
      const s = simPerf.soldierIndex
        ? soldierIndex(world.state.soldiers).get(id)
        : world.state.soldiers.find((x) => x.id === id);
      return !!s && s.team === undefined;
    };
    let damagedThisTick: Set<string> | null = null;
    for (const e of events) {
      switch (e.kind) {
        case 'soldierSpawned':
          if (!isOurs(e.id)) break;
          this.existed.add(e.id);
          this.mark(e.id, e.tick, 'spawn');
          break;
        case 'soldierDied':
          // (07-d) An enemy soldier killed by one of ours is that soldier's kill.
          if (!isOurs(e.id)) {
            if (isOurs(e.by)) this.mark(e.by, e.tick, 'kill', e.id);
            break;
          }
          this.mark(e.id, e.tick, 'death', e.by ?? e.cause);
          break;
        case 'damaged':
          if (isOurs(e.target)) {
            damagedThisTick ??= new Set();
            if (!damagedThisTick.has(e.target)) {
              damagedThisTick.add(e.target);
              this.mark(e.target, e.tick, 'damaged', e.by);
            }
          }
          break;
        case 'hazardDestroyed':
          if (isOurs(e.by)) {
            const isTurret = (world.map.turrets ?? []).some((t) => t.id === e.id);
            this.mark(e.by, e.tick, isTurret ? 'kill' : 'hazardDestroyed', e.id);
          }
          break;
        case 'mineDetonated':
          if (isOurs(e.by)) this.mark(e.by, e.tick, 'hazardDestroyed', e.id);
          break;
        case 'interacted':
          if (isOurs(e.by)) this.mark(e.by, e.tick, 'interact', e.targetId);
          break;
        case 'objectiveDestroyed':
          if (isOurs(e.by)) this.mark(e.by, e.tick, 'objective', e.id);
          break;
        case 'captureStageChanged':
          // (07-d) Losses to enemy soldiers aren't part of the capture truth yet ([Q25]).
          if (e.stage === 'enemy' || e.lost) break;
          this.captures.push({
            pointId: e.id,
            stage: e.stage,
            tick: e.tick,
            by: [...e.contributors],
          });
          for (const id of e.contributors) {
            this.mark(
              id,
              e.tick,
              'capture',
              e.id,
              e.stage === 'ours' ? CAPTURE_STRING_KEYS.ours : CAPTURE_STRING_KEYS.neutral,
            );
          }
          break;
        default:
          break;
      }
    }
  }

  /** Echo lane transitions (O reached, interrupted). */
  ingestTransitions(transitions: readonly EchoTransition[]): void {
    for (const tr of transitions) {
      if (tr.kind === 'static') this.mark(tr.id, tr.tick, 'open');
      else if (tr.kind === 'interrupted') this.mark(tr.id, tr.tick, 'interrupted', tr.reason);
    }
  }

  build(
    world: World,
    echoes: EchoController,
    endReason: AttemptObservation['endReason'],
    liveSoldierId?: SoldierId,
  ): AttemptObservation {
    const toTick = world.state.tick;
    const lanes: Record<SoldierId, LaneFate> = {};
    const ids = new Set<SoldierId>([...echoes.schedules.keys()]);
    if (liveSoldierId) ids.add(liveSoldierId);
    const byId = simPerf.soldierIndex ? soldierIndex(world.state.soldiers) : null;
    for (const id of [...ids].sort(compareIds)) {
      const fate = laneFate(world, echoes, id, this.existed.has(id), byId);
      if (fate) lanes[id] = fate;
    }
    const mc = world.state.missionComplete;
    return {
      kind: this.header.kind,
      attempt: this.header.attempt,
      fromTick: this.header.fromTick,
      toTick,
      ...(this.header.live ? { live: { ...this.header.live } } : {}),
      lanes,
      markers: this.markers.map((m) => ({ ...m })),
      captures: this.captures.map((c) => ({ ...c, by: [...c.by] })),
      ...(mc && mc.tick >= this.header.fromTick && mc.by
        ? { missionComplete: { tick: mc.tick, bySoldierId: mc.by } }
        : {}),
      endReason,
    };
  }
}

function laneFate(
  world: World,
  echoes: EchoController,
  id: SoldierId,
  existed: boolean,
  byId: Map<SoldierId, World['state']['soldiers'][number]> | null,
): LaneFate | null {
  const echo = echoes.echo(id);
  if (echo?.mode === 'neverSpawned') return { kind: 'neverSpawned', reason: echo.reason ?? '' };
  const s = byId ? byId.get(id) : world.state.soldiers.find((x) => x.id === id);
  if (!s || !existed) return null; // not spawned in the window, or already dead at its start
  if (!s.alive) return { kind: 'died', tick: s.deathTick!, cause: s.deathCause ?? 'unknown' };
  if (echo?.mode === 'static') return { kind: 'static', tick: echo.fateTick! };
  if (echo?.mode === 'interrupted') {
    return { kind: 'interrupted', tick: echo.fateTick!, reason: echo.reason ?? '' };
  }
  return { kind: 'alive' };
}
