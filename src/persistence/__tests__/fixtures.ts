import type {
  LaneTruth,
  MissionState,
  RecordingSegment,
  SoldierRecord,
} from '../../contracts/mission';
import { quantizeFacing, quantizePosition } from '../../contracts/quantize';
import { createRng, nextFloat } from '../../sim/core/rng';

/** A plausible recorded life: walks with occasional direction changes, sweeps aim, fires sometimes. */
export function syntheticSegment(seed: number, startTick: number, ticks: number): RecordingSegment {
  const rng = createRng(seed);
  let x = 200 + nextFloat(rng) * 400;
  let y = 200 + nextFloat(rng) * 400;
  let facing = 0;
  let dir = nextFloat(rng) * Math.PI * 2;
  let moving = true;
  let turn = 0;
  const speed = 2.5; // units/tick (150 units/s)
  const waypoints = [];
  const actions: RecordingSegment['actions'] = [];
  for (let i = 0; i < ticks; i++) {
    const t = startTick + i;
    if (nextFloat(rng) < 0.02) dir = Math.floor(nextFloat(rng) * 8) * (Math.PI / 4);
    // Keys are held for a while: toggle walking rarely, like a real player.
    if (nextFloat(rng) < 0.01) moving = !moving;
    if (moving) {
      x = quantizePosition(x + Math.cos(dir) * speed);
      y = quantizePosition(y + Math.sin(dir) * speed);
    }
    // Mouse aim drifts with some momentum plus jitter.
    turn = turn * 0.9 + (nextFloat(rng) - 0.5) * 0.02;
    facing = quantizeFacing(facing + turn);
    waypoints.push({ t, x: quantizePosition(x), y: quantizePosition(y), facing });
    if (nextFloat(rng) < 0.03) actions.push({ kind: 'shot', t, x, y, angle: facing });
  }
  return { startTick, endTick: startTick + ticks - 1, waypoints, actions, endReason: 'death' };
}

export function syntheticSoldier(n: number, lifeTicks: number): SoldierRecord {
  const spawnTick = (n % 10) * 120;
  return {
    id: `S${n}`,
    ordinal: n,
    spawnPointId: n % 2 ? 'road' : 'beach',
    spawnTick,
    segments: [syntheticSegment(n, spawnTick, lifeTicks)],
  };
}

export function laneFor(s: SoldierRecord): LaneTruth {
  const last = s.segments[s.segments.length - 1]!;
  return {
    soldierId: s.id,
    recordedFrom: s.spawnTick,
    recordedTo: last.endTick,
    spans: [{ from: s.spawnTick, to: last.endTick, kind: 'alive', observedInAttempt: s.ordinal }],
    end: { kind: 'death', tick: last.endTick },
    markers: [{ soldierId: s.id, tick: last.endTick, kind: 'death', stringKey: 'marker.death' }],
  };
}

export function syntheticMission(soldiers: number, lifeTicks: number): MissionState {
  const records = Array.from({ length: soldiers }, (_, i) => syntheticSoldier(i + 1, lifeTicks));
  return {
    schemaVersion: 1,
    missionId: 'mission-01',
    attemptCount: soldiers,
    soldiers: records,
    lanes: records.map(laneFor),
  };
}
