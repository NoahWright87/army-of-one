import Phaser from 'phaser';
import type { SoldierInput } from '../../sim/entities/soldier';
import type { Vec2 } from '../../sim/core/vec';

/**
 * Source of per-tick soldier input. Keyboard/mouse today; touch, gamepad and auto-aim later.
 * `read` receives the soldier's world position so aim can be computed relative to it.
 */
export interface InputSource {
  read(soldierPos: Vec2): SoldierInput;
  destroy(): void;
}

export class KeyboardMouseInput implements InputSource {
  private keys: Record<
    'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd' | 'e' | 'space',
    Phaser.Input.Keyboard.Key
  >;
  private interactLatch = false;

  constructor(private scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = kb.addKeys({
      up: K.UP,
      down: K.DOWN,
      left: K.LEFT,
      right: K.RIGHT,
      w: K.W,
      a: K.A,
      s: K.S,
      d: K.D,
      e: K.E,
      space: K.SPACE,
    }) as KeyboardMouseInput['keys'];
    scene.input.mouse?.disableContextMenu();
  }

  read(soldierPos: Vec2): SoldierInput {
    const k = this.keys;
    const x = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    const y = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    const pointer = this.scene.input.activePointer;
    const world = pointer.positionToCamera(this.scene.cameras.main) as Phaser.Math.Vector2;
    const aim = Math.atan2(world.y - soldierPos.y, world.x - soldierPos.x);
    // Interact is edge-triggered in the sim; report it only on the first tick it is held.
    const interactHeld = k.e.isDown;
    const interact = interactHeld && !this.interactLatch;
    this.interactLatch = interactHeld;
    return {
      move: { x, y },
      aim,
      fire: pointer.leftButtonDown() || k.space.isDown,
      interact,
    };
  }

  destroy(): void {
    this.scene.input.keyboard?.removeAllKeys();
  }
}
