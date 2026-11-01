/**
 * One deployed life on screen: wraps the attempt runner with the deploy lead-in ([D5], [D25]),
 * including the frozen pre-battle hold for lead-ins that would start before tick 0. The battle
 * scene (or a headless host) calls `step(input)` once per fixed sim step with the input read
 * that tick; this decides whether the world advances and when control begins.
 *
 * Countdown: `hold + attempt.leadInTicksLeft()` ticks; it reaches 0 exactly when the next step
 * applies input, so the input held at that moment acts on that very tick.
 */
import type { SoldierId, SpawnOption } from '../contracts/mission';
import type { Attempt } from '../sim/attempt';
import { damageSoldier } from '../sim/combat/damage';
import { TICKS_PER_SECOND, type Tick } from '../sim/core/time';
import type { Vec2 } from '../sim/core/vec';
import type { SoldierInput } from '../sim/entities/soldier';
import type { WorldView } from '../sim/view';

/** How long the countdown keeps reporting 0 ("GO") after control starts. */
const GO_TICKS = TICKS_PER_SECOND;

export interface LiveRunHooks {
  /** The countdown hit zero: the next step applies the player's input. */
  onControl(run: LiveRun): void;
  /** After every simulated tick (autosave). */
  onTick(run: LiveRun): void;
  /** The attempt is over (death, mission complete, history shifted). Called once. */
  onOver(run: LiveRun): void;
}

export class LiveRun {
  readonly liveId: SoldierId;
  private holdLeft: Tick;
  private over = false;
  private controlFired = false;
  private goTicks = 0;
  private killRequested = false;
  private cached: WorldView | null = null;

  constructor(
    readonly attempt: Attempt,
    readonly option: SpawnOption,
    /** Frozen pre-battle hold before the world starts at tick 0 ([D25]). */
    readonly holdTicks: Tick,
    /** Where the camera sits until the soldier exists (its spawn point). */
    readonly cameraHome: Vec2,
    private readonly hooks: LiveRunHooks,
  ) {
    this.liveId = attempt.liveSoldierId!;
    this.holdLeft = holdTicks;
  }

  get ended(): boolean {
    return this.over;
  }

  /** In the frozen pre-battle hold: the world shows tick 0 and doesn't advance. */
  get holding(): boolean {
    return this.holdLeft > 0;
  }

  /** The next `step` applies its input to the live soldier. */
  get willHonorInput(): boolean {
    return !this.over && this.holdLeft === 0 && this.attempt.inControl;
  }

  /** Ticks left in the countdown (0 = GO, lingers ~1 s), or null when none is shown. */
  countdown(): number | null {
    if (this.over) return null;
    if (!this.willHonorInput) return this.holdLeft + this.attempt.leadInTicksLeft();
    return this.goTicks < GO_TICKS ? 0 : null;
  }

  /** Dev tool (`K`): the live soldier dies before the next step. Ignored during the lead-in. */
  requestKill(): void {
    this.killRequested = true;
  }

  /** One fixed step. Returns true if the world advanced a tick. */
  step(input: SoldierInput): boolean {
    if (this.over) return false;
    if (this.holdLeft > 0) {
      this.holdLeft--;
      this.checkControl();
      return false;
    }
    if (this.killRequested && this.attempt.inControl) {
      this.killRequested = false;
      const s = this.attempt.liveSoldier();
      if (s?.alive) damageSoldier(this.attempt.world, s, s.hp + 1000, undefined, 'dev');
    }
    const r = this.attempt.step(input);
    this.cached = null;
    if (this.controlFired) this.goTicks++;
    this.checkControl();
    this.hooks.onTick(this);
    if (r.over && !this.over) {
      this.over = true;
      this.hooks.onOver(this);
    }
    return true;
  }

  /** The world as drawn. During the hold a new soldier isn't on the field yet ([D25]). */
  view(): WorldView {
    if (this.cached) return this.cached;
    const v = this.attempt.view();
    if (this.holdLeft > 0 && this.option.kind === 'new') {
      v.soldiers = v.soldiers.filter((s) => s.id !== this.liveId);
    }
    this.cached = v;
    return v;
  }

  get tick(): Tick {
    return this.attempt.tick;
  }

  private checkControl(): void {
    if (!this.controlFired && this.willHonorInput) {
      this.controlFired = true;
      this.hooks.onControl(this);
    }
  }
}
