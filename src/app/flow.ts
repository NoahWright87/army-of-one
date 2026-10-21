/**
 * The game-flow state machine (PHASE04). Pure: no DOM, no timers, no sim. The GameController
 * (game.ts) feeds it events and reacts to the state it lands in.
 *
 *   boot ─▶ title (New mission / Continue)
 *              │
 *              ▼
 *           respawn ◀───────────────────────────────┐
 *              │ deploy(option)                     │
 *              ▼                                    │
 *           preparing (snapshot + headless FF)      │
 *              │                                    │
 *              ▼                                    │
 *           leadIn (5 s countdown, [D5]/[D25]) ─────┤ historyShifted ([D23]): straight back,
 *              │ control starts                     │ with a notice
 *              ▼                                    │
 *           live ── live soldier dies ─▶ deathBeat ─┘
 *              │ objective destroyed
 *              ▼
 *           deathBeat(complete) ─▶ complete ─ playAgain ─▶ respawn
 *
 * Reload mid-life ([D6]): boot ─ recover ─▶ preparing (the resume lead-in), no respawn screen.
 */
import type { SpawnOption } from '../contracts/mission';

export type FlowNotice = 'historyShifted' | null;

export type FlowState =
  | { kind: 'boot' }
  | { kind: 'title'; canContinue: boolean }
  | { kind: 'respawn'; notice: FlowNotice }
  | { kind: 'preparing'; option: SpawnOption; recovery: boolean }
  | { kind: 'leadIn'; option: SpawnOption }
  | { kind: 'live'; option: SpawnOption }
  | { kind: 'deathBeat'; next: 'respawn' | 'complete' }
  | { kind: 'complete' };

export type FlowEvent =
  | { type: 'loaded'; hasSave: boolean }
  /** Boot found a life in progress: go straight into its resume ([D6]). */
  | { type: 'recover'; option: SpawnOption }
  | { type: 'newMission' }
  | { type: 'continue'; completed: boolean }
  | { type: 'deploy'; option: SpawnOption }
  /** Snapshot chosen and fast-forward done: the countdown starts. */
  | { type: 'prepared' }
  /** The countdown hit zero: the player has control. */
  | { type: 'controlStarted' }
  | { type: 'attemptEnded'; reason: 'death' | 'missionComplete' | 'historyShifted' }
  | { type: 'beatDone' }
  | { type: 'playAgain' }
  /** Dev "Reset mission" (and "New mission" from anywhere). */
  | { type: 'reset' };

export const INITIAL_FLOW: FlowState = { kind: 'boot' };

export class FlowError extends Error {}

/** The next state, or throws FlowError for an event that makes no sense in this state. */
export function transition(s: FlowState, e: FlowEvent): FlowState {
  if (e.type === 'reset') return { kind: 'respawn', notice: null };
  switch (s.kind) {
    case 'boot':
      if (e.type === 'loaded') return { kind: 'title', canContinue: e.hasSave };
      if (e.type === 'recover') return { kind: 'preparing', option: e.option, recovery: true };
      break;
    case 'title':
      if (e.type === 'newMission') return { kind: 'respawn', notice: null };
      if (e.type === 'continue' && s.canContinue) {
        return e.completed ? { kind: 'complete' } : { kind: 'respawn', notice: null };
      }
      if (e.type === 'recover' && s.canContinue) {
        return { kind: 'preparing', option: e.option, recovery: true };
      }
      break;
    case 'respawn':
      if (e.type === 'deploy') return { kind: 'preparing', option: e.option, recovery: false };
      break;
    case 'preparing':
      if (e.type === 'prepared') return { kind: 'leadIn', option: s.option };
      // The deploy's own fast-forward ended it: history shifted ([D23]), or an echo finished
      // the mission before the countdown.
      if (e.type === 'attemptEnded') return endOf(e.reason);
      break;
    case 'leadIn':
      if (e.type === 'controlStarted') return { kind: 'live', option: s.option };
      if (e.type === 'attemptEnded') return endOf(e.reason);
      break;
    case 'live':
      if (e.type === 'attemptEnded') return endOf(e.reason);
      break;
    case 'deathBeat':
      if (e.type === 'beatDone') {
        return s.next === 'complete' ? { kind: 'complete' } : { kind: 'respawn', notice: null };
      }
      break;
    case 'complete':
      if (e.type === 'playAgain') return { kind: 'respawn', notice: null };
      break;
  }
  throw new FlowError(`Flow: '${e.type}' is not valid in state '${s.kind}'`);
}

function endOf(reason: 'death' | 'missionComplete' | 'historyShifted'): FlowState {
  if (reason === 'historyShifted') return { kind: 'respawn', notice: 'historyShifted' };
  return { kind: 'deathBeat', next: reason === 'missionComplete' ? 'complete' : 'respawn' };
}

/** True while a battle is on screen (the Phaser scene runs). */
export function inBattle(s: FlowState): boolean {
  return s.kind === 'leadIn' || s.kind === 'live' || s.kind === 'deathBeat';
}
