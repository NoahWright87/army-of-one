import Phaser from 'phaser';
import type { Vec2 } from '../../sim/core/vec';
import type { SoldierInput } from '../../sim/entities/soldier';
import { aimAngle, moveFromKeys, PressLatch } from './input-math';
import type { InputSource } from './input-source';

/**
 * Keyboard + mouse: WASD/arrows move, mouse aims, LMB/Space fire (hold for auto), E interact,
 * Shift sprint (07-e).
 * Presses shorter than a tick are latched so they still register once.
 */
export class KeyboardMouseInput implements InputSource {
  private readonly keys: Record<
    'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd' | 'e' | 'space' | 'shift',
    Phaser.Input.Keyboard.Key
  >;
  private readonly interactLatch = new PressLatch();
  private readonly fireLatch = new PressLatch();
  private readonly onPointerDown = (p: Phaser.Input.Pointer) => {
    if (p.leftButtonDown()) this.fireLatch.press();
  };

  constructor(private readonly scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = kb.addKeys(
      {
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
        shift: K.SHIFT,
      },
      true,
    ) as KeyboardMouseInput['keys'];
    this.keys.e.on('down', () => this.interactLatch.press());
    this.keys.space.on('down', () => this.fireLatch.press());
    scene.input.on('pointerdown', this.onPointerDown);
    scene.input.mouse?.disableContextMenu();
  }

  pointerWorld(): Vec2 {
    const pointer = this.scene.input.activePointer;
    const cam = this.scene.cameras.main;
    const p = cam.getWorldPoint(pointer.x, pointer.y);
    return { x: p.x, y: p.y };
  }

  read(soldierPos: Vec2): SoldierInput {
    const k = this.keys;
    const move = moveFromKeys({
      up: k.up.isDown || k.w.isDown,
      down: k.down.isDown || k.s.isDown,
      left: k.left.isDown || k.a.isDown,
      right: k.right.isDown || k.d.isDown,
    });
    const tapped = this.fireLatch.consume();
    const held = this.scene.input.activePointer.leftButtonDown() || k.space.isDown;
    const pointer = this.pointerWorld();
    return {
      move,
      aim: aimAngle(soldierPos, pointer),
      // (07-c) The Grenadier throws to the cursor ([D37]).
      aimDistance: Math.hypot(pointer.x - soldierPos.x, pointer.y - soldierPos.y),
      fire: held || tapped,
      // Interact is edge-triggered in the sim: true on exactly one tick per press.
      interact: this.interactLatch.consume(),
      ...(k.shift.isDown ? { sprint: true } : {}),
    };
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onPointerDown);
    this.keys.e.removeAllListeners();
    this.keys.space.removeAllListeners();
    this.scene.input.keyboard?.removeAllKeys();
  }
}
