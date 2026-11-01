import type { Tick } from '../sim/core/time';

/**
 * Decides WHEN to autosave; the app performs the writes and wires page-lifecycle events.
 * Policy (PHASE03-c, [D6], [D20]):
 *  - full save at every attempt end (the app calls MissionSaver.save before the respawn screen)
 *  - in-progress save every `intervalTicks` of battle time while a life is being played
 *  - in-progress save immediately when the page is hidden or unloading
 */
export interface AutosavePolicy {
  intervalTicks: Tick;
  lastSavedTick: Tick | null;
}

export function createAutosavePolicy(intervalTicks: Tick): AutosavePolicy {
  return { intervalTicks, lastSavedTick: null };
}

export type AutosaveTrigger = 'tick' | 'hidden';

export function shouldSaveInProgress(
  p: AutosavePolicy,
  tick: Tick,
  trigger: AutosaveTrigger,
): boolean {
  if (trigger === 'hidden') return true;
  return p.lastSavedTick === null || tick - p.lastSavedTick >= p.intervalTicks;
}

export function markSaved(p: AutosavePolicy, tick: Tick): void {
  p.lastSavedTick = tick;
}

/** Call when a new life starts so the first save happens one interval in. */
export function resetForLife(p: AutosavePolicy, startTick: Tick): void {
  p.lastSavedTick = startTick;
}
