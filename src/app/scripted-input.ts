/**
 * Scripted live soldiers for dev autoplay (`?autoplay=`) and the headless flow tests: a
 * `src/sim/scenarios/` script drives the live soldier through the same InputSource interface
 * the keyboard uses. It only reads the world, so a scripted life is identical on screen and
 * headless.
 */
import type { Vec2 } from '../sim/core/vec';
import { IDLE_INPUT, type SoldierInput } from '../sim/entities/soldier';
import { createScriptDriver, type ScriptDriver, type ScriptStep } from '../sim/scenarios/driver';
import type { InputSource } from '../render/input/input-source';
import type { LiveRun } from './live-run';

/** What a scripted soldier does when its script runs out. */
export type ScriptEnd = 'kill' | 'idle';

export class ScriptedInput implements InputSource {
  private readonly driver: ScriptDriver;
  private aimPoint: Vec2 | null = null;
  done = false;

  constructor(
    private readonly run: LiveRun,
    steps: readonly ScriptStep[],
    private readonly end: ScriptEnd = 'kill',
    name = 'autoplay',
  ) {
    this.driver = createScriptDriver(steps, name);
  }

  read(): SoldierInput {
    const run = this.run;
    if (!run.willHonorInput || this.done) return IDLE_INPUT;
    const me = run.attempt.liveSoldier();
    if (!me?.alive) return IDLE_INPUT;
    let input: SoldierInput | null;
    try {
      input = this.driver.input(run.attempt.world, me);
    } catch {
      input = null; // no path: treat as the end of the script
    }
    if (!input) {
      this.done = true;
      if (this.end === 'kill') run.requestKill();
      return IDLE_INPUT;
    }
    this.aimPoint = { x: me.x + Math.cos(input.aim) * 90, y: me.y + Math.sin(input.aim) * 90 };
    return input;
  }

  pointerWorld(): Vec2 | null {
    return this.aimPoint;
  }

  destroy(): void {}
}
