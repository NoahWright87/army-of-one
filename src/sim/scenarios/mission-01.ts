/** Scripted single-soldier runs on mission-01, shared by scenario tests and the sim CLI. */
import { MISSION_01 } from '../../content/maps/mission-01';
import { secondsToTicks } from '../core/time';
import type { World } from '../state';
import { isCrossingSafe, type Scenario, type ScriptStep } from './driver';

const TURRET = MISSION_01.turrets![0]!.position;
const DEPOT = MISSION_01.objectives![0]!.position;
const HIGHWAY_Y = 1500;
const LANES = ['lane-north', 'lane-south'];

const turretDestroyed = (w: World) => w.state.turrets[0]!.mode === 'destroyed';
const missionComplete = (w: World) => w.state.missionComplete !== null;
const bridgeState = (w: World, id: string) =>
  w.state.bridges[(w.map.bridges ?? []).findIndex((b) => b.id === id)]!.state;

/** Spawn → around the ridge → time the highway crossing → east side of the highway. */
const ROAD_TO_HIGHWAY: ScriptStep[] = [
  { kind: 'moveTo', to: { x: 1990, y: HIGHWAY_Y }, label: 'to the highway' },
  {
    kind: 'waitUntil',
    until: (w, me) => isCrossingSafe(w, me, HIGHWAY_Y, LANES),
    label: 'wait for a gap in traffic',
  },
  { kind: 'walkStraight', to: { x: 2345, y: HIGHWAY_Y }, label: 'cross the highway' },
];

/** From inside the compound's west side, shoot the depot until the mission completes. */
const DESTROY_DEPOT: ScriptStep[] = [
  { kind: 'moveTo', to: { x: 5500, y: 700 }, label: 'into the compound' },
  { kind: 'shoot', at: DEPOT, until: missionComplete, label: 'destroy the depot' },
];

export const MISSION_01_SCENARIOS: Scenario[] = [
  {
    name: 'road-naive',
    description: 'Road spawn walks the obvious road route into the turret and dies.',
    map: MISSION_01,
    spawn: 'road',
    steps: [
      ...ROAD_TO_HIGHWAY,
      { kind: 'moveTo', to: { x: 5500, y: 1300 }, label: 'down the road' },
    ],
    maxTicks: secondsToTicks(120),
  },
  {
    name: 'road-snipe-turret',
    description:
      'Road spawn stops out of turret range, shoots it from there, then takes the depot.',
    map: MISSION_01,
    spawn: 'road',
    steps: [
      ...ROAD_TO_HIGHWAY,
      { kind: 'moveTo', to: { x: 4000, y: 1300 }, label: 'just outside turret range' },
      { kind: 'shoot', at: TURRET, until: turretDestroyed, label: 'shoot the turret' },
      ...DESTROY_DEPOT,
    ],
    maxTicks: secondsToTicks(150),
  },
  {
    name: 'road-gate',
    description: 'Road spawn takes the north corridor, opens the gate, and takes the depot.',
    map: MISSION_01,
    spawn: 'road',
    steps: [
      ...ROAD_TO_HIGHWAY,
      { kind: 'moveTo', to: { x: 3500, y: 380 }, label: 'to the gate lever' },
      { kind: 'interact', label: 'open the gate' },
      ...DESTROY_DEPOT,
    ],
    maxTicks: secondsToTicks(150),
  },
  {
    name: 'beach-naive',
    description: 'Beach spawn walks straight up the mine channel and dies to a mine.',
    map: MISSION_01,
    spawn: 'beach',
    steps: [
      { kind: 'moveTo', to: { x: 5400, y: 3600 }, label: 'to the mine channel' },
      { kind: 'walkStraight', to: { x: 5400, y: 3000 }, label: 'straight through' },
    ],
    maxTicks: secondsToTicks(90),
  },
  {
    name: 'beach-drawbridge',
    description:
      'Beach spawn weaves through the mines, lowers the drawbridge, and takes the depot.',
    map: MISSION_01,
    spawn: 'beach',
    steps: [
      { kind: 'moveTo', to: { x: 5320, y: 3580 }, label: 'to the mine channel' },
      { kind: 'walkStraight', to: { x: 5320, y: 3420 } },
      { kind: 'walkStraight', to: { x: 5400, y: 3300 } },
      { kind: 'walkStraight', to: { x: 5320, y: 3180 } },
      { kind: 'walkStraight', to: { x: 5320, y: 3040 }, label: 'out of the mines' },
      { kind: 'moveTo', to: { x: 3080, y: 2660 }, label: 'to the drawbridge lever' },
      { kind: 'interact', label: 'lower the drawbridge' },
      {
        kind: 'waitUntil',
        until: (w) => bridgeState(w, 'drawbridge-1') === 'down',
        label: 'wait for it',
      },
      ...DESTROY_DEPOT,
    ],
    maxTicks: secondsToTicks(150),
  },
];

export function findScenario(name: string): Scenario | undefined {
  return MISSION_01_SCENARIOS.find((s) => s.name === name);
}
