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
 *
 * (06-c, [D28] "jump straight into what the game is")
 *  - A brand-new mission skips the empty respawn screen: title ─ newMission ─▶ respawn ─ deploy
 *    happen back to back and the screen is never drawn (`freshMissionOption`).
 *  - Quick redeploy (R / Space): from the death beat straight to preparing, skipping the rest of
 *    the beat and the respawn screen (`quickRedeployOption` picks the option).
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
      // (06-c) Quick redeploy cuts the beat short and skips the respawn screen.
      if (e.type === 'deploy' && s.next === 'respawn') {
        return { kind: 'preparing', option: e.option, recovery: false };
      }
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

/** (06-c) States where the quick-redeploy key (R / Space) works. */
export function canQuickRedeploy(s: FlowState): boolean {
  return s.kind === 'respawn' || (s.kind === 'deathBeat' && s.next === 'respawn');
}

/**
 * (06-c) The option a quick redeploy uses: a new soldier at the last-used spawn point's next
 * slot ([D7]). If that point isn't offered any more (a lost capture point, [D26]), the first new
 * soldier option; if there is none, the first option of any kind.
 */
export function quickRedeployOption(
  options: readonly SpawnOption[],
  lastSpawnPointId: string | null,
): SpawnOption | null {
  const news = options.filter((o) => o.kind === 'new');
  return (
    news.find((o) => o.kind === 'new' && o.spawnPointId === lastSpawnPointId) ??
    news[0] ??
    options[0] ??
    null
  );
}

/**
 * (06-c) A brand-new mission (no soldiers yet) has nothing to choose on the respawn screen but the
 * spawn point: with `skip` on, deploy the default option (the first offered) straight away.
 * Returns the option to deploy, or null to show the respawn screen as usual.
 */
export function freshMissionOption(
  soldierCount: number,
  options: readonly SpawnOption[],
  skip: boolean,
): SpawnOption | null {
  if (!skip || soldierCount > 0) return null;
  return options[0] ?? null;
}
