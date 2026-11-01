import type Phaser from 'phaser';
import type { Vec2 } from '../../sim/core/vec';
import type { SoldierInput } from '../../sim/entities/soldier';
import type { SoldierId, World } from '../../sim/sim';
import type { WorldView } from '../../sim/view';
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
  /**
   * (PHASE04) Steps the battle instead of the scene: the game flow's attempt runner with its
   * lead-in. When present the scene never calls `step` on `world` itself.
   */
  driver?: SessionDriver;
}

/** What the scene needs from a driven battle (app/live-run.ts implements it). */
export interface SessionDriver {
  /** One fixed step with the input read this tick. Returns true if the world advanced. */
  step(input: SoldierInput): boolean;
  view(): WorldView;
  /** Lead-in countdown ticks (≤ 0 = GO), or null for none. */
  countdown(): number | null;
  /** The next step applies input (false during the countdown and after the end). */
  readonly willHonorInput: boolean;
  /** The attempt is over: the scene shows the frozen last frame. */
  readonly ended: boolean;
  /** Camera position until the live soldier exists (its spawn point). */
  readonly cameraHome: Vec2;
}

/** Commands a running scene exposes to app-level UI (settings panel buttons, hotkeys). */
export interface SceneCommands {
  playCountdown?: () => void;
}

/** App-wide services handed to scenes at construction (built in src/app/main.ts). */
export interface SceneServices {
  display: DisplaySettings;
  /** Lead-in: draw a ghost arrow for held movement (default true). */
  leadInPreview?: () => boolean;
  /** Lead-in "get ready" hint under the countdown. */
  leadInHint?: { set(on: boolean): void };
  hud: Hud;
  countdown: CountdownOverlay;
  debug: DebugOverlay;
  createSession(): BattleSession;
  commands: SceneCommands;
  /** (05-b) Latest perf readout from the battle scene (stress checks read it via `__aoo`). */
  perf?: BattlePerf;
  /** (06-c) Canvas render scale in use (display.renderScale); the camera zoom is multiplied by it. */
  renderScale?: () => number;
}

export interface BattlePerf {
  fps: number;
  stepMs: number;
  simFrameMs: number;
  renderMs: number;
  sprites: number;
  culled: number;
  counts: Record<string, number>;
  /** (06-c) Mean frame interval / JS update ms per frame. */
  frameMs?: number;
  updateMs?: number;
}
