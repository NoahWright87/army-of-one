/**
 * Game-flow settings (F2 panel, group "Game flow"). Product owner: "when unsure about an option,
 * make it a setting". Gameplay numbers live in tuning.ts (spawn.*, deathBeatSeconds,
 * autosaveIntervalSeconds); these are presentation / convenience choices.
 */
import { str } from '../content/strings';
import { TICKS_PER_SECOND } from '../sim/core/time';
import type { SettingDef, SettingsStore } from '../ui/settings/registry';

export const GAME_SETTING_IDS = {
  /** How fast the respawn screen's scrubber sweeps ([D23]): 'max' or a battle-time multiple. */
  resolveSpeed: 'game.resolveSpeed',
  /** [D6]: a reload with a life in progress goes straight into its resume lead-in. */
  resumeOnReload: 'game.resumeOnReload',
  /** Lead-in: ghost arrow previewing held movement. */
  ghostArrow: 'game.ghostArrow',
} as const;

const SPEEDS = ['max', '40', '20', '10', '5'];

export function gameSettingDefs(): SettingDef[] {
  const G = 'settings.group.game';
  return [
    {
      id: GAME_SETTING_IDS.resolveSpeed,
      group: G,
      label: str('settings.game.resolveSpeed'),
      type: 'choice',
      default: '20',
      options: SPEEDS.map((v) => ({
        value: v,
        label:
          v === 'max'
            ? str('settings.game.resolveSpeed.max')
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
  ];
}

/** Scrubber pace in battle ticks per real second (null = flat out). */
export function resolvePace(store: SettingsStore): number | null {
  const v = store.getString(GAME_SETTING_IDS.resolveSpeed);
  const x = Number(v);
  return v === 'max' || !Number.isFinite(x) || x <= 0 ? null : x * TICKS_PER_SECOND;
}

/** `[` / `]`: the next sim speed choice down / up. */
export function cycleSpeed(current: string, dir: -1 | 1, choices: readonly string[]): string {
  const i = choices.indexOf(current);
  const j = Math.max(0, Math.min(choices.length - 1, (i < 0 ? choices.indexOf('1') : i) + dir));
  return choices[j] ?? current;
}
