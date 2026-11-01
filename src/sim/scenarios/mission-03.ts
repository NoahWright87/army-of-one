/**
 * Scripted runs on mission-03 "Breach" (PHASE06-a), shared by the scenario tests, the sim CLI
 * (`npm run sim -- --map mission-03 --script <name>`) and the dev autoplay lives.
 */
import { M3, MISSION_03 } from '../../content/maps/mission-03';
import type { Tuning } from '../../content/tuning';
import type { AttemptObservation, SoldierRecord } from '../../contracts/mission';
import { SnapshotStore } from '../attempt/snapshots';
import { secondsToTicks } from '../core/time';
import type { Vec2 } from '../core/vec';
import { recordedTo } from '../recording/records';
import type { SoldierState } from '../entities/soldier';
import type { World } from '../state';
import { isCrossingSafeUp, type Scenario, type ScriptStep } from './driver';
import { playLife, type LifeResult } from './lives';

const turretPos = (id: string): Vec2 => MISSION_03.turrets!.find((t) => t.id === id)!.position;
export const M3_T1 = turretPos('t1');
export const M3_T2 = turretPos('t2');
export const M3_T3 = turretPos('t3');
export const M3_T4 = turretPos('t4');
export const M3_T5 = turretPos('t5');
export const M3_COMMAND = MISSION_03.objectives![0]!.position;
export const M3_FORWARD = MISSION_03.capturePoints![0]!.position;
const LANES = ['m3-lane-east', 'm3-lane-west'];

export const m3TurretDown = (id: string) => (w: World) =>
  w.state.turrets[(w.map.turrets ?? []).findIndex((t) => t.id === id)]?.mode === 'destroyed';
export const m3GateOpen = (w: World) => w.state.gates[0]?.open === true;
export const m3ForwardOurs = (w: World) =>
  w.state.capturePoints.find((c) => c.id === 'cp-forward')?.stage === 'ours';
export const m3MissionComplete = (w: World) => w.state.missionComplete !== null;

/** Out-of-range sniping spots (rifle 520 > turret 420): straight below each turret, ~470 away. */
export const SNIPE_T1: Vec2 = { x: M3_T1.x, y: M3_T1.y + 470 };
export const SNIPE_T3: Vec2 = { x: M3_T3.x, y: M3_T3.y + 470 };
/** With T3 down: out of T4's and T5's range, with LOS to T5 past the nest sandbags. */
export const SNIPE_T5: Vec2 = { x: 700, y: 1460 };
/** In range of the Command Post, through the bunker opening, out of T4's range. */
export const SHOOT_COMMAND: Vec2 = { x: 800, y: 900 };
const LEVER_S = MISSION_03.levers![0]!.position;
const BRIDGE_LEVER_S = MISSION_03.levers!.find((l) => l.id === 'm3-lever-bridge-s')!.position;
export const m3BridgeDown = (w: World) => w.state.bridges[0]?.state === 'down';

/** Centre spawn: straight up the middle toward the gate. Both first-line turrets see you. */
export const BREACH_NAIVE: ScriptStep[] = [
  { kind: 'moveTo', to: { x: 800, y: M3.gateWallY + 80 }, label: 'straight up the middle' },
];

/** West spawn: stop out of T1's range and shoot it. */
export const BREACH_SNIPE_T1: ScriptStep[] = [
  { kind: 'moveTo', to: SNIPE_T1, label: 'out of T1 range' },
  { kind: 'shoot', at: M3_T1, until: m3TurretDown('t1'), label: 'shoot T1' },
];

/** With T1 down: up the west side (out of T2's range) to the gate lever, open the gate. */
export const BREACH_OPEN_GATE: ScriptStep[] = [
  { kind: 'moveTo', to: { x: 300, y: M3.turretLineY - 200 }, label: 'west side, past T1' },
  { kind: 'moveTo', to: { x: LEVER_S.x + 10, y: LEVER_S.y + 20 }, label: 'to the gate lever' },
  { kind: 'interact', label: 'open the gate' },
  { kind: 'waitUntil', until: m3GateOpen, label: 'gate open' },
];

/** Through the gate and the mine strip (weaving between the staggered rows at x 560/640). */
export const BREACH_MINES: ScriptStep[] = [
  { kind: 'moveTo', to: { x: 560, y: M3.mineRowsY[0] + 90 }, label: 'through the gate' },
  { kind: 'walkStraight', to: { x: 560, y: M3.mineRowsY[0] } },
  { kind: 'walkStraight', to: { x: 640, y: M3.mineRowsY[1] } },
  { kind: 'walkStraight', to: { x: 560, y: M3.mineRowsY[2] } },
  { kind: 'walkStraight', to: { x: 560, y: M3.mineRowsY[2] - 100 }, label: 'out of the mines' },
];

/** Time a gap in both traffic lanes and cross the road up the middle. */
export const BREACH_ROAD: ScriptStep[] = [
  { kind: 'moveTo', to: { x: 800, y: M3.roadSouthY + 90 }, label: 'to the kerb' },
  {
    kind: 'waitUntil',
    until: (w, me) => isCrossingSafeUp(w, me, 800, LANES),
    label: 'wait for a gap in traffic',
  },
  { kind: 'walkStraight', to: { x: 800, y: M3.roadNorthY - 90 }, label: 'cross the road' },
];

/** Stand on the Forward Post until it's ours. */
export const BREACH_CAPTURE: ScriptStep[] = [
  { kind: 'moveTo', to: { x: M3_FORWARD.x + 20, y: M3_FORWARD.y }, label: 'to the Forward Post' },
  { kind: 'waitUntil', until: m3ForwardOurs, label: 'capture the Forward Post' },
];

/** Lower the drawbridge over the canal from the south bank. */
export const BREACH_BRIDGE: ScriptStep[] = [
  {
    kind: 'moveTo',
    to: { x: BRIDGE_LEVER_S.x, y: BRIDGE_LEVER_S.y + 20 },
    label: 'to the drawbridge lever',
  },
  { kind: 'interact', label: 'lower the drawbridge' },
  { kind: 'waitUntil', until: m3BridgeDown, label: 'bridge down' },
];

/**
 * From the Forward Post: lower the drawbridge, snipe T3, then T5, then shoot the Command Post
 * through the bunker opening.
 */
export const BREACH_NEST_TO_WIN: ScriptStep[] = [
  ...BREACH_BRIDGE,
  { kind: 'moveTo', to: SNIPE_T3, label: 'out of T3 range' },
  { kind: 'shoot', at: M3_T3, until: m3TurretDown('t3'), label: 'shoot T3' },
  { kind: 'moveTo', to: SNIPE_T5, label: 'out of T5 range' },
  { kind: 'shoot', at: M3_T5, until: m3TurretDown('t5'), label: 'shoot T5' },
  { kind: 'moveTo', to: { x: 680, y: 1000 }, label: 'west of T4 range' },
  { kind: 'moveTo', to: SHOOT_COMMAND, label: 'to the bunker opening' },
  { kind: 'shoot', at: M3_COMMAND, until: m3MissionComplete, label: 'destroy the Command Post' },
];

/** S1 of the rescue story: dawdles at the West spawn, then heads for the gate past T1. */
export const BREACH_SLOW: ScriptStep[] = [
  { kind: 'wait', ticks: secondsToTicks(6), label: 'dawdle' },
  { kind: 'moveTo', to: { x: LEVER_S.x + 10, y: LEVER_S.y + 20 }, label: 'to the gate lever' },
];

/** S1 resumed from its O: open the gate, run the mines and the road, capture the Forward Post. */
export const BREACH_AFTER_O: ScriptStep[] = [
  { kind: 'moveTo', to: { x: LEVER_S.x + 10, y: LEVER_S.y + 20 }, label: 'to the gate lever' },
  { kind: 'interact', label: 'open the gate' },
  { kind: 'waitUntil', until: m3GateOpen, label: 'gate open' },
  ...BREACH_MINES,
];

// ---- [D31] More story pieces (ported from the removed mission-01/02 tests and lives) ----

/** A script predicate; autoplay wraps them in timeouts so a life can't wait forever. */
type Until = (w: World, me: SoldierState) => boolean;
const asIs = (u: Until): Until => u;

const minePos = (id: string): Vec2 => MISSION_03.mines!.find((m) => m.id === id)!.position;
export const m3MineGone = (id: string) => (w: World) =>
  w.state.mines[(w.map.mines ?? []).findIndex((m) => m.id === id)]?.state === 'detonated';
/** First-row mine in the middle: walking straight up x = 800 sets it off. */
export const MINE_MIDDLE = 'm3-mine-1-3';
/** Third-row mine next to BREACH_MINES' weave (80 from its (560, 3410) waypoint). */
export const MINE_WEAVE = 'm3-mine-3-2';
/** North of the gate, south of the mine strip: sees the middle of the strip, triggers nothing. */
export const MINE_WATCH: Vec2 = { x: 760, y: 3820 };
/** South of the gate, within reach of its south lever, clear of whoever stands at the lever. */
export const GATE_SHUT_SPOT: Vec2 = { x: 640, y: 4165 };
/** Where a later soldier waits for an echo to open the gate (out of everyone's way). */
const GATE_WAIT: Vec2 = { x: 450, y: 4300 };

/** S2 of the rescue chain: snipes T1 before S1 gets there, then holds 10 s. */
export const BREACH_RESCUER: ScriptStep[] = [
  ...BREACH_SNIPE_T1,
  { kind: 'wait', ticks: secondsToTicks(10), label: 'hold' },
];

/** From any initial spawn: wait for T1 to go down, then up the west side to wait at the gate. */
export function breachToGate(guard: (u: Until) => Until = asIs): ScriptStep[] {
  return [
    { kind: 'waitUntil', until: guard(m3TurretDown('t1')), label: 'T1 down' },
    { kind: 'moveTo', to: { x: 300, y: M3.turretLineY - 200 }, label: 'west side, past T1' },
    { kind: 'moveTo', to: GATE_WAIT, label: 'wait by the gate' },
  ];
}

/** West: T1, opens the gate, lingers 8 s, then straight up the middle into the mines (X). */
export const BREACH_MINE_WALKER: ScriptStep[] = [
  ...BREACH_SNIPE_T1,
  ...BREACH_OPEN_GATE,
  { kind: 'wait', ticks: secondsToTicks(8), label: 'linger' },
  { kind: 'moveTo', to: { x: 800, y: M3.gateWallY - 100 }, label: 'through the gate' },
  { kind: 'walkStraight', to: { x: 800, y: M3.rockY[0] - 50 }, label: 'straight up the mines' },
];

/** Once an echo opens the gate: shoot the middle mine before the mine walker reaches it. */
export function breachMineClear(guard: (u: Until) => Until = asIs): ScriptStep[] {
  return [
    ...breachToGate(guard),
    { kind: 'waitUntil', until: guard(m3GateOpen), label: 'an echo opens the gate' },
    { kind: 'moveTo', to: MINE_WATCH, label: 'below the mine strip' },
    {
      kind: 'shoot',
      at: minePos(MINE_MIDDLE),
      until: m3MineGone(MINE_MIDDLE),
      label: 'clear the middle mine',
    },
    { kind: 'wait', ticks: 60 },
  ];
}

/** Once an echo opens the gate: shut it again from the south lever (strands that echo). */
export function breachGateShut(guard: (u: Until) => Until = asIs): ScriptStep[] {
  return [
    ...breachToGate(guard),
    { kind: 'moveTo', to: GATE_SHUT_SPOT, label: 'next to the lever' },
    { kind: 'waitUntil', until: guard(m3GateOpen), label: 'an echo opens it' },
    { kind: 'interact', label: 'shut it' },
  ];
}

/**
 * Make history worse: wait below the mine strip and set off a mine next to `soldierId` while it
 * weaves through (BREACH_MINES), killing it earlier than its recording.
 */
export function breachMineUnder(
  soldierId = 'S1',
  mineId = MINE_WEAVE,
  guard: (u: Until) => Until = asIs,
): ScriptStep[] {
  const mine = minePos(mineId);
  const near: Until = (w) => {
    const s = w.state.soldiers.find((x) => x.id === soldierId);
    return !!s && s.alive && Math.hypot(s.x - mine.x, s.y - mine.y) < 85;
  };
  return [
    ...breachToGate(guard),
    { kind: 'waitUntil', until: guard(m3GateOpen), label: 'an echo opens the gate' },
    { kind: 'moveTo', to: MINE_WATCH, label: 'below the mine strip' },
    { kind: 'waitUntil', until: guard(near), label: `wait for ${soldierId} at the mine` },
    { kind: 'shoot', at: mine, until: m3MineGone(mineId), label: 'set it off' },
    { kind: 'wait', ticks: 30 },
  ];
}

/** Like breach-capture, but lingers 12 s at the gate first (a slow captor). */
export const BREACH_CAPTURE_SLOW: ScriptStep[] = [
  ...BREACH_SNIPE_T1,
  ...BREACH_OPEN_GATE,
  { kind: 'wait', ticks: secondsToTicks(12), label: 'dawdle' },
  ...BREACH_MINES,
  ...BREACH_ROAD,
  ...BREACH_CAPTURE,
];

/**
 * A later soldier behind an echo that handles T1 and the gate: wait for both, then the mines,
 * the road and the Forward Post (pressing the lever again would shut the echo's open gate).
 */
export function breachFollowToForward(guard: (u: Until) => Until = asIs): ScriptStep[] {
  return [
    ...breachToGate(guard),
    { kind: 'waitUntil', until: guard(m3GateOpen), label: 'an echo opens the gate' },
    ...BREACH_MINES,
    ...BREACH_ROAD,
    ...BREACH_CAPTURE,
  ];
}

/** East: straight up into T2's range (X within seconds). */
export const BREACH_NAIVE_EAST: ScriptStep[] = [
  { kind: 'walkStraight', to: { x: 1140, y: M3.gateWallY + 80 }, label: 'straight up the east' },
];

const S = (n: number) => secondsToTicks(n);

export const MISSION_03_SCENARIOS: Scenario[] = [
  {
    name: 'breach-naive',
    description: 'Centre spawn walks straight up the middle into the first turret line and dies.',
    map: MISSION_03,
    spawn: 'centre',
    steps: BREACH_NAIVE,
    maxTicks: S(30),
  },
  {
    name: 'breach-snipe',
    description: 'West spawn stops out of T1 range, shoots it, then opens the gate.',
    map: MISSION_03,
    spawn: 'west',
    steps: [...BREACH_SNIPE_T1, ...BREACH_OPEN_GATE],
    maxTicks: S(40),
  },
  {
    name: 'breach-mines-naive',
    description: 'West spawn: T1, opens the gate, walks straight up the middle into a mine.',
    map: MISSION_03,
    spawn: 'west',
    steps: BREACH_MINE_WALKER,
    maxTicks: S(60),
  },
  {
    name: 'breach-capture',
    description: 'West spawn: T1, gate, mines, road, then captures the Forward Post.',
    map: MISSION_03,
    spawn: 'west',
    steps: [
      ...BREACH_SNIPE_T1,
      ...BREACH_OPEN_GATE,
      ...BREACH_MINES,
      ...BREACH_ROAD,
      ...BREACH_CAPTURE,
    ],
    maxTicks: S(90),
  },
  {
    name: 'breach-win',
    description:
      'One life, bottom to top: everything in breach-capture, then the nest and the win.',
    map: MISSION_03,
    spawn: 'west',
    steps: [
      ...BREACH_SNIPE_T1,
      ...BREACH_OPEN_GATE,
      ...BREACH_MINES,
      ...BREACH_ROAD,
      ...BREACH_CAPTURE,
      ...BREACH_NEST_TO_WIN,
    ],
    maxTicks: S(150),
  },
];

export function findBreachScenario(name: string): Scenario | undefined {
  return MISSION_03_SCENARIOS.find((s) => s.name === name);
}

export const LEAD_IN_TICKS = secondsToTicks(5); // [D5]

export interface BreachRescueChain {
  lives: LifeResult[];
  records: SoldierRecord[];
  observations: AttemptObservation[];
}

/**
 * `breach-rescue`: the X → rescue → O → resume story on mission-03.
 * 1. S1 (West, 0:00) dawdles, then walks past T1 toward the gate: killed by T1 (X).
 * 2. S2 (West, 0:02) snipes T1 before S1 gets there. Replaying, S1 survives: O.
 * 3. S1 resumes from its O (5 s lead-in), opens the gate and runs the mine strip.
 */
export function runBreachRescueChain(tuning: Tuning): BreachRescueChain {
  const snapshots = new SnapshotStore();
  const base = { map: MISSION_03, tuning, snapshots };
  const a1 = playLife({
    ...base,
    records: [],
    attempt: 1,
    live: { mode: 'new', soldierId: 'S1', spawnPointId: 'west', entryTick: 0 },
    steps: BREACH_SLOW,
  });
  const a2 = playLife({
    ...base,
    records: a1.records,
    attempt: 2,
    live: { mode: 'new', soldierId: 'S2', spawnPointId: 'west', entryTick: S(2) },
    steps: BREACH_RESCUER,
    fromTick: 0,
  });
  const s1 = a2.records.find((r) => r.id === 'S1')!;
  const oTick = recordedTo(s1);
  const a3 = playLife({
    ...base,
    records: a2.records,
    attempt: 3,
    live: { mode: 'resume', soldierId: 'S1', controlFromTick: oTick },
    steps: BREACH_AFTER_O,
    fromTick: oTick - LEAD_IN_TICKS,
  });
  const lives = [a1, a2, a3];
  return { lives, records: a3.records, observations: lives.map((l) => l.observation) };
}
