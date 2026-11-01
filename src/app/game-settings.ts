/**
 * Game-flow settings (F2 panel, group "Game flow"). Product owner: "when unsure about an option,
 * make it a setting". Gameplay numbers live in tuning.ts (spawn.*, deathBeatSeconds,
 * autosaveIntervalSeconds); these are presentation / convenience choices.
 */
import { str } from '../content/strings';
import { TICKS_PER_SECOND } from '../sim/core/time';
import type { SettingDef, SettingsStore } from '../ui/settings/registry';

export const GAME_SETTING_IDS = {
  /**
   * How fast the respawn screen's scrubber sweeps ([D23]): 'fit' (06-c default: the whole
   * remaining battle in about `FIT_SWEEP_SECONDS`), 'max', or a battle-time multiple.
   */
  resolveSpeed: 'game.resolveSpeed',
  /** [D6]: a reload with a life in progress goes straight into its resume lead-in. */
  resumeOnReload: 'game.resumeOnReload',
  /** Lead-in: ghost arrow previewing held movement. */
  ghostArrow: 'game.ghostArrow',
  /** (06-c) A brand-new mission skips the empty respawn screen ([D28]). */
  skipEmptyRespawn: 'flow.skipEmptyRespawn',
  /** (06-c) R / Space redeploys at the last spawn point's next slot (death beat, respawn). */
  quickRedeploy: 'flow.quickRedeploy',
  /** (06-c) Ignore the quick-redeploy key this long after the death (a fire tap on Space). */
  quickRedeployGuardMs: 'flow.quickRedeployGuardMs',
  /** (06-c) Show the "Preparing…" spinner only for work longer than this. */
  spinnerThresholdMs: 'flow.spinnerThresholdMs',
  /** (06-c) Length of screen transitions / caption pop-ins. */
  transitionMs: 'flow.transitionMs',
} as const;

const SPEEDS = ['fit', 'max', '40', '20', '10', '5'];
/** (06-c) 'fit': the scrubber sweeps whatever is left in about this long. */
export const FIT_SWEEP_SECONDS = 1;
/** (06-c) 'fit' never sweeps slower than this many × battle time (short remainders). */
const FIT_MIN_MULTIPLE = 20;

export function gameSettingDefs(): SettingDef[] {
  const G = 'settings.group.game';
  return [
    {
      id: GAME_SETTING_IDS.resolveSpeed,
      group: G,
      label: str('settings.game.resolveSpeed'),
      type: 'choice',
      default: 'fit',
      options: SPEEDS.map((v) => ({
        value: v,
        label:
          v === 'max'
            ? str('settings.game.resolveSpeed.max')
            : v === 'fit'
              ? str('settings.game.resolveSpeed.fit', { s: FIT_SWEEP_SECONDS })
              : str('settings.game.resolveSpeed.x', { x: v }),
      })),
    },
    {
      id: GAME_SETTING_IDS.resumeOnReload,
      group: G,
      label: str('settings.game.resumeOnReload'),
      type: 'boolean',
      default: true,
    },
    {
      id: GAME_SETTING_IDS.ghostArrow,
      group: G,
      label: str('settings.game.ghostArrow'),
      type: 'boolean',
      default: true,
    },
    {
      id: GAME_SETTING_IDS.skipEmptyRespawn,
      group: G,
      label: str('settings.game.skipEmptyRespawn'),
      type: 'boolean',
      default: true,
    },
    {
      id: GAME_SETTING_IDS.quickRedeploy,
      group: G,
      label: str('settings.game.quickRedeploy'),
      type: 'boolean',
      default: true,
    },
    {
      id: GAME_SETTING_IDS.quickRedeployGuardMs,
      group: G,
      label: str('settings.game.quickRedeployGuardMs'),
      type: 'number',
      default: 300,
      min: 0,
      max: 2000,
      step: 50,
    },
    {
      id: GAME_SETTING_IDS.spinnerThresholdMs,
      group: G,
      label: str('settings.game.spinnerThresholdMs'),
      type: 'number',
      default: 150,
      min: 0,
      max: 2000,
      step: 50,
    },
    {
      id: GAME_SETTING_IDS.transitionMs,
      group: G,
      label: str('settings.game.transitionMs'),
      type: 'number',
      default: 150,
      min: 0,
      max: 1000,
      step: 25,
    },
  ];
}

/**
 * Scrubber pace in battle ticks per real second (null = flat out). `spanTicks` is how much battle
 * time the pass will sweep; 'fit' paces it to take about `FIT_SWEEP_SECONDS`.
 */
export function resolvePace(store: SettingsStore, spanTicks = 0): number | null {
  return paceFor(store.getString(GAME_SETTING_IDS.resolveSpeed), spanTicks);
}

/** Pure part of `resolvePace`. */
export function paceFor(choice: string, spanTicks: number): number | null {
  if (choice === 'fit') {
    return Math.max(FIT_MIN_MULTIPLE * TICKS_PER_SECOND, Math.ceil(spanTicks / FIT_SWEEP_SECONDS));
  }
  const x = Number(choice);
  return choice === 'max' || !Number.isFinite(x) || x <= 0 ? null : x * TICKS_PER_SECOND;
}

/** `[` / `]`: the next sim speed choice down / up. */
export function cycleSpeed(current: string, dir: -1 | 1, choices: readonly string[]): string {
  const i = choices.indexOf(current);
  const j = Math.max(0, Math.min(choices.length - 1, (i < 0 ? choices.indexOf('1') : i) + dir));
  return choices[j] ?? current;
}
