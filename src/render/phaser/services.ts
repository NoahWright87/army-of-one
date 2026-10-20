import type Phaser from 'phaser';
import type { SoldierId, World } from '../../sim/sim';
import type { CountdownOverlay } from '../../ui/hud/countdown-overlay';
import type { DebugOverlay, Hud } from '../../ui/hud/hud';
import type { DisplaySettings } from '../../ui/settings/display-settings';
import type { InputSource } from '../input/input-source';

/**
 * Everything the battle scene needs to run one attempt. PHASE04 builds these (fast-forwarded
 * world, live soldier id, input source) and starts the scene with
 *   game.scene.start('battle', { session })
 * When no session is passed, the scene asks `SceneServices.createSession()` for the default
 * sandbox (src/app/battle-setup.ts).
 */
export interface BattleSession {
  world: World;
  /** Soldier driven by `input`; the camera follows it and the HUD describes it. */
  liveId: SoldierId;
  makeInput(scene: Phaser.Scene): InputSource;
}

/** Commands a running scene exposes to app-level UI (settings panel buttons, hotkeys). */
export interface SceneCommands {
  playCountdown?: () => void;
}

/** App-wide services handed to scenes at construction (built in src/app/main.ts). */
export interface SceneServices {
  display: DisplaySettings;
  hud: Hud;
  countdown: CountdownOverlay;
  debug: DebugOverlay;
  createSession(): BattleSession;
  commands: SceneCommands;
}
