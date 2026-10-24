/**
 * (06-b) Respawn-screen fixtures for the revealed map ([D29]), built from REAL recordings: each
 * life is played by the attempt runner (scripted inputs, echoes replaying earlier lives), and the
 * truth is folded with the real `applyObservation` / `applyCaptureObservation`.
 *
 * - `map`: mission-01. S1 walks the road into the turret; S2 snipes the turret (S1 → O);
 *   S3 dies in the beach minefield; S4 crosses the highway and is killed by traffic or holds.
 * - `map-outpost`: mission-02. S1 captures the Outpost (forward spawn opens); S2 dies on the road.
 * - `map-tall`: a tall, narrow strip (forward = up, like 06-a's mission-03) with three spawns at
 *   the bottom and a turret line ahead.
 */
import { MISSION_01 } from '../../../content/maps/mission-01';
import { MISSION_02 } from '../../../content/maps/mission-02';
import { DEFAULT_TUNING } from '../../../content/tuning';
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
import { ROAD_TO_HIGHWAY, TURRET, turretDestroyed } from '../../../sim/scenarios/mission-01';
import { ROAD_CAPTURE_OUTPOST } from '../../../sim/scenarios/mission-02';
import { S1_ROAD_SLOW, S2_SNIPE_AND_HOLD } from '../../../sim/scenarios/rescue';
import { findScenario } from '../../../sim/scenarios/mission-01';
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
      tuning: DEFAULT_TUNING,
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
      tuning: DEFAULT_TUNING,
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

const steps = (name: string): ScriptStep[] => [...(findScenario(name)?.steps ?? [])];

export function mapMission01(): RespawnProps {
  const s = new RealStory(MISSION_01);
  s.life('road', S1_ROAD_SLOW);
  s.life('road', S2_SNIPE_AND_HOLD);
  s.life('beach', steps('beach-naive'));
  s.life('road', [
    ...ROAD_TO_HIGHWAY,
    { kind: 'moveTo', to: { x: 2600, y: 1000 }, label: 'north of the road' },
    { kind: 'shoot', at: TURRET, until: turretDestroyed, label: 'shoot the turret' },
  ]);
  s.resolve();
  return s.props();
}

export function mapOutpost(): RespawnProps {
  const s = new RealStory(MISSION_02);
  s.life('road', ROAD_CAPTURE_OUTPOST);
  s.life('road', steps('road-naive'));
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
