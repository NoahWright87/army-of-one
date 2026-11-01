/**
 * Named scripted lives for dev autoplay (`?autoplay=breach-slow,breach-rescue,breach-resume`) and
 * the headless flow tests. Each picks a respawn option and a script from
 * src/sim/scenarios/mission-03.ts (mission-03 "Breach" is the only mission, [D31]).
 * `end: 'kill'` dev-kills the soldier when its script runs out, so every life ends without
 * waiting.
 */
import type { SpawnOption } from '../contracts/mission';
import type { SoldierState } from '../sim/entities/soldier';
import { secondsToTicks } from '../sim/core/time';
import type { ScriptStep } from '../sim/scenarios/driver';
import {
  BREACH_AFTER_O,
  BREACH_CAPTURE,
  BREACH_CAPTURE_SLOW,
  BREACH_MINE_WALKER,
  BREACH_MINES,
  BREACH_NAIVE,
  BREACH_NAIVE_EAST,
  BREACH_NEST_TO_WIN,
  BREACH_OPEN_GATE,
  BREACH_RESCUER,
  BREACH_ROAD,
  BREACH_SLOW,
  BREACH_SNIPE_T1,
  breachFollowToForward,
  breachGateShut,
  breachMineClear,
  breachMineUnder,
} from '../sim/scenarios/mission-03';
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

type Until = (w: World, me: SoldierState) => boolean;

const soldierIs =
  (id: string, test: (s: NonNullable<ReturnType<typeof getSoldier>>) => boolean) => (w: World) => {
    const s = getSoldier(w, id);
    return !!s && test(s);
  };
/** `until`, or give up after `ticks` (so an autoplay life never waits forever). */
const timeout = (ticks: number, until: Until): Until => {
  let start = -1;
  return (w, me) => {
    if (start < 0) start = w.state.tick;
    return until(w, me) || w.state.tick - start >= ticks;
  };
};
const guard40 = (u: Until) => timeout(secondsToTicks(40), u);

const idle = (s: number): ScriptStep[] => [{ kind: 'wait', ticks: secondsToTicks(s) }];

export const AUTO_LIVES: AutoLife[] = [
  // ---- First deaths ----
  {
    name: 'breach-naive',
    about: 'Centre: straight up the middle into the first turret line (X at ~0:03).',
    pick: { kind: 'new', spawnPointId: 'centre' },
    steps: BREACH_NAIVE,
    end: 'kill',
  },
  {
    name: 'breach-naive-east',
    about: 'East: straight up into T2 (X at ~0:03).',
    pick: { kind: 'new', spawnPointId: 'east' },
    steps: BREACH_NAIVE_EAST,
    end: 'kill',
  },
  {
    name: 'breach-snipe',
    about: 'West: snipes T1 from out of range, opens the gate, holds 2 s, killed.',
    pick: { kind: 'new', spawnPointId: 'west' },
    steps: [...BREACH_SNIPE_T1, ...BREACH_OPEN_GATE, ...idle(2)],
    end: 'kill',
  },
  // ---- The rescue story: X → rescue → O → resume ----
  {
    name: 'breach-slow',
    about: 'West: dawdles 6 s, then walks past T1 toward the gate (X at ~0:08).',
    pick: { kind: 'new', spawnPointId: 'west' },
    steps: BREACH_SLOW,
    end: 'kill',
  },
  {
    name: 'breach-rescue',
    about: 'West: snipes T1 before breach-slow gets there (S1 → O), holds 3 s, killed.',
    pick: { kind: 'new', spawnPointId: 'west' },
    steps: [...BREACH_SNIPE_T1, ...idle(3)],
    end: 'kill',
  },
  {
    name: 'breach-rescue-hold',
    about: 'West: snipes T1 (S1 → O) and holds 10 s, outliving S1’s old X, then killed.',
    pick: { kind: 'new', spawnPointId: 'west' },
    steps: BREACH_RESCUER,
    end: 'kill',
  },
  {
    name: 'breach-snipe-die',
    about: 'West: snipes T1, then is killed at once (the scrubber must find the rescue).',
    pick: { kind: 'new', spawnPointId: 'west' },
    steps: BREACH_SNIPE_T1,
    end: 'kill',
  },
  {
    name: 'breach-resume',
    about: 'Resume the first O, open the gate, mines, road, capture the Forward Post, killed.',
    pick: { kind: 'resume' },
    steps: [...BREACH_AFTER_O, ...BREACH_ROAD, ...BREACH_CAPTURE, { kind: 'wait', ticks: 120 }],
    end: 'kill',
  },
  {
    name: 'breach-resume-win',
    about: 'Resume the first O and play the rest of Breach in one go (mission complete).',
    pick: { kind: 'resume' },
    steps: [...BREACH_AFTER_O, ...BREACH_ROAD, ...BREACH_CAPTURE, ...BREACH_NEST_TO_WIN],
    end: 'idle',
  },
  {
    name: 'resume-wait',
    about: 'Resume the first O, stand still 3 s, then is killed.',
    pick: { kind: 'resume' },
    steps: idle(3),
    end: 'kill',
  },
  // ---- Mines, gate: interruption, history shifted, make it worse ----
  {
    name: 'breach-mine-walker',
    about: 'West: T1, opens the gate, lingers 8 s, straight up the middle into a mine (X).',
    pick: { kind: 'new', spawnPointId: 'west' },
    steps: [...BREACH_MINE_WALKER, ...idle(2)],
    end: 'kill',
  },
  {
    name: 'breach-mine-clear',
    about: 'West: clears the middle mine before breach-mine-walker gets there (S1 → O), killed.',
    pick: { kind: 'new', spawnPointId: 'west' },
    get steps(): ScriptStep[] {
      return breachMineClear(guard40); // a getter: the timeouts keep per-play state
    },
    end: 'kill',
  },
  {
    name: 'breach-gate-shut',
    about: 'West: shuts the gate right after an echo opens it, then is killed at once.',
    pick: { kind: 'new', spawnPointId: 'west' },
    get steps(): ScriptStep[] {
      return breachGateShut(guard40);
    },
    end: 'kill',
  },
  {
    name: 'breach-gate-closer',
    about: 'West: shuts the gate after S1 opens it (S1 freezes with !), waits, then is killed.',
    pick: { kind: 'new', spawnPointId: 'west' },
    get steps(): ScriptStep[] {
      return [
        ...breachGateShut(guard40),
        {
          kind: 'waitUntil',
          until: timeout(
            secondsToTicks(25),
            soldierIs('S1', (s) => s.viewRole === 'interrupted'),
          ),
          label: 'S1 freezes',
        },
        ...idle(4),
      ];
    },
    end: 'kill',
  },
  {
    name: 'breach-mine-under-s1',
    about:
      'Centre: sets off a mine next to S1 as it weaves the mine strip (make it worse), killed.',
    pick: { kind: 'new', spawnPointId: 'centre' },
    get steps(): ScriptStep[] {
      return breachMineUnder('S1', undefined, guard40);
    },
    end: 'kill',
  },
  // ---- Forward capture ----
  {
    name: 'breach-capture',
    about: 'West: T1, gate, mines, road; captures the Forward Post (~0:32), killed.',
    pick: { kind: 'new', spawnPointId: 'west' },
    steps: [
      ...BREACH_SNIPE_T1,
      ...BREACH_OPEN_GATE,
      ...BREACH_MINES,
      ...BREACH_ROAD,
      ...BREACH_CAPTURE,
      ...idle(2),
    ],
    end: 'kill',
  },
  {
    name: 'breach-capture-slow',
    about: 'West: like breach-capture, but dawdles 12 s at the gate first; holds 1 s, killed.',
    pick: { kind: 'new', spawnPointId: 'west' },
    steps: [...BREACH_CAPTURE_SLOW, ...idle(1)],
    end: 'kill',
  },
  {
    name: 'breach-follow-capture',
    about: 'West: behind S1’s echo (T1, gate), rushes mines, road and the Forward Post; killed.',
    pick: { kind: 'new', spawnPointId: 'west' },
    get steps(): ScriptStep[] {
      return [...breachFollowToForward(guard40), ...idle(2)];
    },
    end: 'kill',
  },
  {
    name: 'breach-forward-hold',
    about: 'Deploys at the captured Forward Post, stands 3 s, killed.',
    pick: { kind: 'new', spawnPointId: 'forward' },
    steps: idle(3),
    end: 'kill',
  },
  {
    name: 'breach-win',
    about: 'Deploys at the Forward Post, snipes T3 and T5, destroys the Command Post.',
    pick: { kind: 'new', spawnPointId: 'forward' },
    steps: BREACH_NEST_TO_WIN,
    end: 'idle',
  },
  {
    name: 'breach-solo',
    about: 'West: the whole map in one life (capture included), ends the mission.',
    pick: { kind: 'new', spawnPointId: 'west' },
    steps: [
      ...BREACH_SNIPE_T1,
      ...BREACH_OPEN_GATE,
      ...BREACH_MINES,
      ...BREACH_ROAD,
      ...BREACH_CAPTURE,
      ...BREACH_NEST_TO_WIN,
    ],
    end: 'idle',
  },
  // ---- Idlers ----
  {
    name: 'west-idle',
    about: 'West: stands still 3 s, then is killed.',
    pick: { kind: 'new', spawnPointId: 'west' },
    steps: idle(3),
    end: 'kill',
  },
  {
    name: 'east-idle',
    about: 'East: stands still 3 s, then is killed.',
    pick: { kind: 'new', spawnPointId: 'east' },
    steps: idle(3),
    end: 'kill',
  },
];

export function findAutoLife(name: string): AutoLife | undefined {
  return AUTO_LIVES.find((l) => l.name === name);
}

/** `"breach-slow,breach-naive*3"` → lives (`*N` repeats). Unknown names are reported in `unknown`. */
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
