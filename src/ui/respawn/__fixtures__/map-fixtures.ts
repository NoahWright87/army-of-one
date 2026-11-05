/**
 * (06-b) Respawn-screen fixtures for the revealed map ([D29]), built from REAL recordings: each
 * life is played by the attempt runner (scripted inputs, echoes replaying earlier lives), and the
 * truth is folded with the real `applyObservation` / `applyCaptureObservation`.
 *
 * - `map`: mission-03 "Breach". S1 dawdles and walks into T1; S2 snipes T1 (S1 → O); S3 runs
 *   up the middle into the turret line; S4 opens the gate and dies in the mine strip.
 * - `map-forward`: mission-03. S1 captures the Forward Post (forward spawn opens); S2 dies to
 *   the first turret line.
 * - `map-tall`: a tall, narrow strip (forward = up, like mission-03) with three spawns at the
 *   bottom and a turret line ahead.
 * (`map` and `map-outpost` were on the removed mission-01/02 until [D31].)
 */
import { MISSION_03 } from '../../../content/maps/mission-03';
import { DEFAULT_TUNING, withTuning } from '../../../content/tuning';

/** (07-d) The scripted fixture lives play without the enemy squads. */
const FIXTURE_TUNING = withTuning(DEFAULT_TUNING, { ai: { enabled: false } });
import type {
  AttemptObservation,
  CaptureTruth,
  LaneChange,
  LaneTruth,
  SoldierRecord,
} from '../../../contracts/mission';
import { SnapshotStore } from '../../../sim/attempt/snapshots';
import type { LiveSpec } from '../../../sim/attempt';
import { secondsToTicks } from '../../../sim/core/time';
import type { ScriptStep } from '../../../sim/scenarios/driver';
import { playLife } from '../../../sim/scenarios/lives';
import {
  BREACH_CAPTURE,
  BREACH_MINES,
  BREACH_NAIVE,
  BREACH_OPEN_GATE,
  BREACH_RESCUER,
  BREACH_ROAD,
  BREACH_SLOW,
  BREACH_SNIPE_T1,
  findBreachScenario,
} from '../../../sim/scenarios/mission-03';
import { borderWalls, type MapDef } from '../../../sim/world/map';
import { applyCaptureObservation } from '../../../timeline/captures';
import { revealOptions } from '../../../timeline/reveal';
import { deriveSpawnOptions, spawnRules } from '../../../timeline/spawn-options';
import { applyObservation } from '../../../timeline/truth';
import type { RespawnProps } from '../respawn-model';

const RULES = spawnRules(DEFAULT_TUNING);
const sec = secondsToTicks;

/** Plays lives one attempt at a time through the real runner and folds the truth. */
class RealStory {
  records: SoldierRecord[] = [];
  lanes: LaneTruth[] = [];
  captures: CaptureTruth[] = [];
  changes: LaneChange[] = [];
  attempts = 0;
  reached = 0;
  private readonly snapshots = new SnapshotStore();

  constructor(readonly map: MapDef) {}

  options() {
    return deriveSpawnOptions(this.map, this.records, this.lanes, RULES, this.captures);
  }

  /** A new soldier at the point's next entry slot ([D7]) running `steps`. */
  life(pointId: string, steps: readonly ScriptStep[], maxSeconds = 120): void {
    const opt = this.options().find((o) => o.kind === 'new' && o.spawnPointId === pointId);
    if (!opt || opt.kind !== 'new') throw new Error(`no option at ${pointId}`);
    const live: LiveSpec = {
      mode: 'new',
      soldierId: `S${this.records.length + 1}`,
      spawnPointId: pointId,
      entryTick: opt.entryTick,
    };
    this.attempts++;
    const r = playLife({
      map: this.map,
      tuning: FIXTURE_TUNING,
      records: this.records,
      attempt: this.attempts,
      live,
      steps,
      fromTick: Math.max(0, opt.entryTick - RULES.leadInTicks),
      snapshots: this.snapshots,
      maxTick: opt.entryTick + sec(maxSeconds),
    });
    this.records = r.records;
    this.fold(r.observation);
  }

  /** The background resolve after the last attempt ([D23]): the rest of the battle. */
  resolve(): void {
    const to = Math.max(...this.records.map((r) => r.segments[r.segments.length - 1]!.endTick));
    const r = playLife({
      map: this.map,
      tuning: FIXTURE_TUNING,
      records: this.records,
      attempt: this.attempts,
      live: null,
      fromTick: 0,
      snapshots: this.snapshots,
      maxTick: to,
    });
    this.fold({ ...r.observation, kind: 'resolve', endReason: 'resolved' });
  }

  private fold(obs: AttemptObservation): void {
    const res = applyObservation(this.lanes, this.records, obs);
    this.lanes = res.lanes;
    this.changes = res.changes;
    this.captures = applyCaptureObservation(this.captures, obs).captures;
    this.reached = obs.toTick;
  }

  props(): RespawnProps {
    return {
      map: this.map,
      soldiers: this.records,
      lanes: this.lanes,
      options: this.options(),
      changes: this.changes,
      captures: this.captures,
      attemptsPlayed: this.attempts,
      reachedTick: this.reached,
      reveal: revealOptions(DEFAULT_TUNING),
    };
  }
}

const steps = (name: string): ScriptStep[] => [...(findBreachScenario(name)?.steps ?? [])];

export function mapBreach(): RespawnProps {
  const s = new RealStory(MISSION_03);
  s.life('west', BREACH_SLOW);
  s.life('west', BREACH_RESCUER);
  s.life('centre', BREACH_NAIVE);
  s.life('west', steps('breach-mines-naive'));
  s.resolve();
  return s.props();
}

export function mapForward(): RespawnProps {
  const s = new RealStory(MISSION_03);
  s.life('west', [
    ...BREACH_SNIPE_T1,
    ...BREACH_OPEN_GATE,
    ...BREACH_MINES,
    ...BREACH_ROAD,
    ...BREACH_CAPTURE,
  ]);
  s.life('centre', BREACH_NAIVE);
  s.resolve();
  return s.props();
}

/** A tall strip (forward = up): spawns along the bottom, a turret line, then the objective. */
export const STRIP_MAP: MapDef = {
  id: 'fixture-strip',
  nameKey: 'map.fixture.strip.name',
  width: 1400,
  height: 6000,
  walls: [
    ...borderWalls(1400, 6000, 40),
    // Cover stubs below the turret line.
    { x: 260, y: 4700, w: 160, h: 40 },
    { x: 980, y: 4700, w: 160, h: 40 },
    { x: 620, y: 4300, w: 160, h: 40 },
    // A choke further up.
    { x: 40, y: 3000, w: 500, h: 60 },
    { x: 860, y: 3000, w: 500, h: 60 },
    { x: 40, y: 1200, w: 560, h: 60 },
    { x: 800, y: 1200, w: 560, h: 60 },
  ],
  water: [
    { x: 40, y: 2200, w: 580, h: 120 },
    { x: 780, y: 2200, w: 580, h: 120 },
  ],
  bridges: [
    { id: 'strip-bridge', rect: { x: 620, y: 2200, w: 160, h: 120 }, axis: 'y', kind: 'draw' },
  ],
  spawnPoints: [
    {
      id: 'west',
      nameKey: 'spawn.west',
      position: { x: 250, y: 5850 },
      facing: -Math.PI / 2,
      kind: 'initial',
    },
    {
      id: 'centre',
      nameKey: 'spawn.fixture.centre',
      position: { x: 700, y: 5850 },
      facing: -Math.PI / 2,
      kind: 'initial',
    },
    {
      id: 'east',
      nameKey: 'spawn.fixture.east',
      position: { x: 1150, y: 5850 },
      facing: -Math.PI / 2,
      kind: 'initial',
    },
  ],
  turrets: [
    { id: 'strip-turret-w', position: { x: 400, y: 4000 }, facing: Math.PI / 2 },
    { id: 'strip-turret-e', position: { x: 1000, y: 4000 }, facing: Math.PI / 2 },
  ],
  mines: [
    { id: 'strip-mine-1', position: { x: 500, y: 3500 } },
    { id: 'strip-mine-2', position: { x: 700, y: 3450 } },
    { id: 'strip-mine-3', position: { x: 900, y: 3500 } },
  ],
  objectives: [{ id: 'strip-objective', position: { x: 700, y: 300 } }],
};

export function mapStrip(): RespawnProps {
  const s = new RealStory(STRIP_MAP);
  s.life(
    'centre',
    [
      { kind: 'moveTo', to: { x: 700, y: 3800 }, label: 'straight up' },
      { kind: 'wait', ticks: sec(10), label: 'in the open' },
    ],
    40,
  );
  s.life('west', [
    { kind: 'moveTo', to: { x: 340, y: 4780 }, label: 'behind cover' },
    {
      kind: 'shoot',
      at: { x: 400, y: 4000 },
      until: (w) => w.state.turrets[0]!.mode === 'destroyed',
    },
    { kind: 'wait', ticks: sec(4) },
  ]);
  s.life(
    'east',
    [
      { kind: 'moveTo', to: { x: 1150, y: 3700 }, label: 'up the east side, past the turret' },
      { kind: 'wait', ticks: sec(10) },
    ],
    40,
  );
  s.resolve();
  return s.props();
}
