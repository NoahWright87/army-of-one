/**
 * (PHASE18) "Start here" for basic training ([D161]): each station is the course as it stands when
 * you reach it, so the script can be tried from that point without playing everything before it.
 * Everything before the station is done: flags held, gates open, classes unlocked, and the
 * script's `had:` things marked as having happened. Used with `?mission=basic-training&station=<id>`.
 */
import type { RoleId } from '../../contracts/mission';
import type { MapDef } from '../../sim/world/map';

export interface BtStation {
  id: string;
  label: string;
  /** Where you start (the map's first spawn point moves here). */
  start: { x: number; y: number };
  /** Flags already ours (capture point ids). */
  flags: string[];
  /** Gates already open. */
  gates: string[];
  /** Things that have already happened (the script's `had:` tokens). */
  had: string[];
  roles: RoleId[];
}

const FIELD_DONE = ['stallDone:a', 'gateOpened:bt-g1a'];
const LANE_DONE = [...FIELD_DONE, 'stallDone:b', 'gateOpened:bt-g1b'];
const R1_DONE = [...LANE_DONE, 'mgsDown', 'gateOpened:bt-g1'];
/** The range gates open once the stalls are done. */
const RANGE_GATES = ['bt-g1a', 'bt-g1b', 'bt-g1'];
const CHUTE_DONE = [...R1_DONE, 'captured:bt-a', 'gateOpened:bt-g2', 'minesShot'];
const BRAVO_DONE = [...CHUTE_DONE, 'captured:bt-b', 'gateOpened:bt-g4', 'nestCleared'];
const LEVER_DONE = [...BRAVO_DONE, 'gateOpened:bt-g5'];
const CHARLIE_DONE = [...LEVER_DONE, 'captured:bt-c', 'gateOpened:bt-g5b'];
const AMBUSH_DONE = [...CHARLIE_DONE, 'gateOpened:bt-g6'];
const DELTA_DONE = [...AMBUSH_DONE, 'captured:bt-d', 'gateOpened:bt-g7'];
const PARAPET_DONE = [...DELTA_DONE, 'gateOpened:bt-g8'];

export const BT_STATIONS: readonly BtStation[] = [
  {
    id: 'start',
    label: 'The start',
    start: { x: 600, y: 6040 },
    flags: [],
    gates: [],
    had: [],
    roles: [],
  },
  {
    id: 'r1',
    label: 'Range 1: open field',
    start: { x: 600, y: 5600 },
    flags: [],
    gates: [],
    had: [],
    roles: [],
  },
  {
    id: 'r1b',
    label: 'Range 2: sandbag lane',
    start: { x: 2040, y: 4920 },
    flags: [],
    gates: ['bt-g1a'],
    had: FIELD_DONE,
    roles: [],
  },
  {
    id: 'r1c',
    label: 'Range 3: live fire',
    start: { x: 2040, y: 4050 },
    flags: [],
    gates: ['bt-g1a', 'bt-g1b'],
    had: LANE_DONE,
    roles: [],
  },
  {
    id: 'r2',
    label: 'Flag, then the sprint gate',
    start: { x: 330, y: 3300 },
    flags: [],
    gates: RANGE_GATES,
    had: R1_DONE,
    roles: [],
  },
  {
    id: 'r3',
    label: 'The chute: MG and mines',
    start: { x: 860, y: 3110 },
    flags: ['bt-a'],
    gates: [...RANGE_GATES, 'bt-g2'],
    had: [...R1_DONE, 'captured:bt-a', 'gateOpened:bt-g2'],
    roles: [],
  },
  {
    id: 'r4',
    label: 'Bravo flag and the Shield',
    start: { x: 650, y: 1900 },
    flags: ['bt-a'],
    gates: [...RANGE_GATES, 'bt-g2'],
    had: CHUTE_DONE,
    roles: [],
  },
  {
    id: 'r5f',
    label: 'Charlie flag',
    start: { x: 600, y: 1460 },
    flags: ['bt-a', 'bt-b'],
    gates: [...RANGE_GATES, 'bt-g2', 'bt-g4', 'bt-g5'],
    had: LEVER_DONE,
    roles: ['shield'],
  },
  {
    id: 'r5',
    label: 'Riflemen ambush (Machine Gunner)',
    start: { x: 600, y: 1360 },
    flags: ['bt-a', 'bt-b', 'bt-c'],
    gates: [...RANGE_GATES, 'bt-g2', 'bt-g4', 'bt-g5', 'bt-g5b'],
    had: CHARLIE_DONE,
    roles: ['shield'],
  },
  {
    id: 'r6',
    label: 'Parapet (Grenadier)',
    start: { x: 600, y: 850 },
    flags: ['bt-a', 'bt-b', 'bt-c', 'bt-d'],
    gates: [...RANGE_GATES, 'bt-g2', 'bt-g4', 'bt-g5', 'bt-g5b', 'bt-g6', 'bt-g7'],
    had: DELTA_DONE,
    roles: ['shield', 'gunner'],
  },
  {
    id: 'r7',
    label: 'Sniper range',
    start: { x: 340, y: 340 },
    flags: ['bt-a', 'bt-b', 'bt-c', 'bt-d'],
    gates: [...RANGE_GATES, 'bt-g2', 'bt-g4', 'bt-g5', 'bt-g5b', 'bt-g6', 'bt-g7', 'bt-g8'],
    had: PARAPET_DONE,
    roles: ['shield', 'gunner', 'grenadier'],
  },
];

export const btStation = (id: string): BtStation | undefined =>
  BT_STATIONS.find((s) => s.id === id);

/** Sets the course up as it stands at `station` (changes `map` in place, for this page only). */
export function applyStation(map: MapDef, station: BtStation): void {
  const m = map as {
    capturePoints?: MapDef['capturePoints'];
    gates?: MapDef['gates'];
    spawnPoints: MapDef['spawnPoints'];
  };
  m.capturePoints = map.capturePoints?.map((c) =>
    station.flags.includes(c.id) ? { ...c, initialStage: 'ours' as const } : c,
  );
  m.gates = map.gates?.map((g) =>
    station.gates.includes(g.id) ? { ...g, initiallyOpen: true } : g,
  );
  m.spawnPoints = map.spawnPoints.map((s) =>
    s.id === 'bt-start' ? { ...s, position: { ...station.start } } : s,
  );
}

/** The gates that open from a mission rule, with what each waits for (for the Sarge editor). */
export function gateRules(map: MapDef): { gate: string; delayS: number; when: string }[] {
  return (map.triggers ?? []).map((t) => ({
    gate: t.openGate,
    delayS: t.delaySeconds ?? 0,
    when:
      'captured' in t.when
        ? `${t.when.captured} is captured`
        : 'destroyed' in t.when
          ? 'the range targets are destroyed'
          : 'a squad is dead',
  }));
}

/** Sets how long each gate waits after its rule is met (changes `map` in place, for this page). */
export function applyGateDelays(map: MapDef, delays: Readonly<Record<string, number>>): void {
  const m = map as { triggers?: MapDef['triggers'] };
  m.triggers = map.triggers?.map((t) => {
    const d = delays[t.openGate];
    return d === undefined ? t : { ...t, delaySeconds: d };
  });
}
