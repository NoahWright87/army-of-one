/**
 * Named scripted lives for dev autoplay (`?autoplay=road-slow,road-snipe-die,resume`) and the
 * headless flow tests. Each picks a respawn option and a mission-01 script from
 * src/sim/scenarios/. `end: 'kill'` dev-kills the soldier when its script runs out, so every
 * life ends without waiting.
 */
import { MISSION_01 } from '../content/maps/mission-01';
import type { SpawnOption } from '../contracts/mission';
import { secondsToTicks } from '../sim/core/time';
import type { ScriptStep } from '../sim/scenarios/driver';
import {
  DESTROY_DEPOT,
  findScenario,
  ROAD_TO_HIGHWAY,
  TURRET,
  turretDestroyed,
} from '../sim/scenarios/mission-01';
import { S1_ROAD_SLOW, S2_SNIPE_AND_HOLD } from '../sim/scenarios/rescue';
import { getSoldier } from '../sim/sim';
import type { World } from '../sim/state';
import type { ScriptEnd } from './scripted-input';

export interface AutoLife {
  name: string;
  about: string;
  /** Which option to deploy: a new soldier at a spawn point, or a resume (a soldier id, or the first O). */
  pick: { kind: 'new'; spawnPointId: string } | { kind: 'resume'; soldierId?: string };
  steps: ScriptStep[];
  end: ScriptEnd;
}

const bridgeGone = (w: World) => w.state.bridges[0]!.state === 'destroyed';
const gateOpen = (w: World) => w.state.gates[0]!.open;
const soldierIs =
  (id: string, test: (s: NonNullable<ReturnType<typeof getSoldier>>) => boolean) => (w: World) => {
    const s = getSoldier(w, id);
    return !!s && test(s);
  };
const timeout = (ticks: number, until: (w: World) => boolean) => {
  let start = -1;
  return (w: World) => {
    if (start < 0) start = w.state.tick;
    return until(w) || w.state.tick - start >= ticks;
  };
};

const SNIPE: ScriptStep[] = [
  ...ROAD_TO_HIGHWAY,
  { kind: 'moveTo', to: { x: 4000, y: 1300 }, label: 'just outside turret range' },
  { kind: 'shoot', at: TURRET, until: turretDestroyed, label: 'shoot the turret' },
];

const fromScenario = (name: string): ScriptStep[] => [...(findScenario(name)?.steps ?? [])];

export const AUTO_LIVES: AutoLife[] = [
  {
    name: 'road-slow',
    about: 'Road: dawdles past the highway, then walks into the turret (X at ~0:56).',
    pick: { kind: 'new', spawnPointId: 'road' },
    steps: S1_ROAD_SLOW,
    end: 'kill',
  },
  {
    name: 'road-snipe',
    about: 'Road: snipes the turret from out of range, holds 20 s, then is killed.',
    pick: { kind: 'new', spawnPointId: 'road' },
    steps: S2_SNIPE_AND_HOLD,
    end: 'kill',
  },
  {
    name: 'road-snipe-die',
    about: 'Road: snipes the turret, then is killed at once (the scrubber must find the rescue).',
    pick: { kind: 'new', spawnPointId: 'road' },
    steps: SNIPE,
    end: 'kill',
  },
  {
    name: 'road-blow-bridge',
    about: 'Road: blows the road bridge early, then is killed (S1 is cut off: history shifts).',
    pick: { kind: 'new', spawnPointId: 'road' },
    steps: [
      ...ROAD_TO_HIGHWAY,
      { kind: 'moveTo', to: { x: 2900, y: 1260 }, label: 'west of the chasm' },
      {
        kind: 'shoot',
        at: MISSION_01.bridges![0]!.charge!,
        until: bridgeGone,
        label: 'blow the bridge',
      },
    ],
    end: 'kill',
  },
  {
    name: 'bridge-under-s1',
    about: 'Road: waits west of the chasm, blows the road bridge under S1 (make it worse), killed.',
    pick: { kind: 'new', spawnPointId: 'road' },
    // A getter: the timeouts below keep per-play state.
    get steps(): ScriptStep[] {
      return [
        ...ROAD_TO_HIGHWAY,
        { kind: 'moveTo', to: { x: 2900, y: 1260 }, label: 'west of the chasm' },
        {
          kind: 'waitUntil',
          until: timeout(
            secondsToTicks(40),
            soldierIs('S1', (s) => s.alive && s.x > 3215 && s.x < 3300 && s.y > 1200 && s.y < 1400),
          ),
          label: 'wait for S1 on the bridge',
        },
        { kind: 'shoot', at: MISSION_01.bridges![0]!.charge!, until: bridgeGone, label: 'blow it' },
        { kind: 'wait', ticks: 60 },
      ];
    },
    end: 'kill',
  },
  {
    name: 'gate-walker',
    about: 'Road: opens the north gate, lingers 12 s, walks through, then is killed.',
    pick: { kind: 'new', spawnPointId: 'road' },
    steps: [
      ...ROAD_TO_HIGHWAY,
      { kind: 'moveTo', to: { x: 3500, y: 380 }, label: 'to the gate lever' },
      { kind: 'interact', label: 'open the gate' },
      { kind: 'wait', ticks: secondsToTicks(12), label: 'linger' },
      { kind: 'moveTo', to: { x: 4200, y: 400 }, label: 'through the gate' },
      { kind: 'wait', ticks: secondsToTicks(2) },
    ],
    end: 'kill',
  },
  {
    name: 'gate-closer',
    about: 'Road: shuts the gate after S1 opens it (S1 freezes with !), waits, then is killed.',
    pick: { kind: 'new', spawnPointId: 'road' },
    // A getter: the timeouts below keep per-play state.
    get steps(): ScriptStep[] {
      return [
        ...ROAD_TO_HIGHWAY,
        { kind: 'moveTo', to: { x: 3520, y: 420 }, label: 'next to the lever' },
        { kind: 'waitUntil', until: timeout(secondsToTicks(20), gateOpen), label: 'S1 opens it' },
        { kind: 'interact', label: 'shut it' },
        {
          kind: 'waitUntil',
          until: timeout(
            secondsToTicks(25),
            soldierIs('S1', (s) => s.viewRole === 'interrupted'),
          ),
          label: 'S1 freezes',
        },
        { kind: 'wait', ticks: secondsToTicks(4) },
      ];
    },
    end: 'kill',
  },
  {
    name: 'resume',
    about: 'Resume the first O, walk into the compound and destroy the depot.',
    pick: { kind: 'resume' },
    steps: DESTROY_DEPOT,
    end: 'idle',
  },
  {
    name: 'resume-wait',
    about: 'Resume the first O, stand still 3 s, then is killed.',
    pick: { kind: 'resume' },
    steps: [{ kind: 'wait', ticks: secondsToTicks(3) }],
    end: 'kill',
  },
  {
    name: 'road-idle',
    about: 'Road: stands still 3 s, then is killed.',
    pick: { kind: 'new', spawnPointId: 'road' },
    steps: [{ kind: 'wait', ticks: secondsToTicks(3) }],
    end: 'kill',
  },
  {
    name: 'beach-idle',
    about: 'Beach: stands still 3 s, then is killed.',
    pick: { kind: 'new', spawnPointId: 'beach' },
    steps: [{ kind: 'wait', ticks: secondsToTicks(3) }],
    end: 'kill',
  },
  {
    name: 'road-naive',
    about: 'Road: walks the road into the turret (X at ~0:46).',
    pick: { kind: 'new', spawnPointId: 'road' },
    steps: fromScenario('road-naive'),
    end: 'kill',
  },
  {
    name: 'road-gate',
    about: 'Road: north corridor, opens the gate, destroys the depot.',
    pick: { kind: 'new', spawnPointId: 'road' },
    steps: fromScenario('road-gate'),
    end: 'idle',
  },
  {
    name: 'beach-naive',
    about: 'Beach: straight up the mine channel (X to a mine).',
    pick: { kind: 'new', spawnPointId: 'beach' },
    steps: fromScenario('beach-naive'),
    end: 'kill',
  },
  {
    name: 'beach-drawbridge',
    about: 'Beach: weaves the mines, lowers the drawbridge, destroys the depot.',
    pick: { kind: 'new', spawnPointId: 'beach' },
    steps: fromScenario('beach-drawbridge'),
    end: 'idle',
  },
];

export function findAutoLife(name: string): AutoLife | undefined {
  return AUTO_LIVES.find((l) => l.name === name);
}

/** `"road-slow,road-naive*3"` → lives (`*N` repeats). Unknown names are reported in `unknown`. */
export function parseAutoplay(spec: string): { lives: AutoLife[]; unknown: string[] } {
  const lives: AutoLife[] = [];
  const unknown: string[] = [];
  for (const raw of spec.split(',')) {
    const part = raw.trim();
    if (!part) continue;
    const m = /^(.+?)(?:\*(\d+))?$/.exec(part)!;
    const life = findAutoLife(m[1]!);
    if (!life) {
      unknown.push(m[1]!);
      continue;
    }
    for (let i = 0; i < Number(m[2] ?? 1); i++) lives.push(life);
  }
  return { lives, unknown };
}

/** The respawn option a life deploys, or null if it isn't offered right now. */
export function pickOption(life: AutoLife, options: readonly SpawnOption[]): SpawnOption | null {
  const p = life.pick;
  for (const o of options) {
    if (p.kind === 'new' && o.kind === 'new' && o.spawnPointId === p.spawnPointId) return o;
    if (p.kind === 'resume' && o.kind === 'resume' && (!p.soldierId || p.soldierId === o.soldierId))
      return o;
  }
  return null;
}
