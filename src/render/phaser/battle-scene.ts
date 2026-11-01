import Phaser from 'phaser';
import { DEFAULT_TUNING } from '../../content/tuning';
import { TEST_RANGE } from '../../content/maps/test-range';
import { TICKS_PER_SECOND } from '../../sim/core/time';
import { createWorld, getView, spawnSoldier, step, type World } from '../../sim/sim';
import type { SoldierView, WorldView } from '../../sim/view';
import { advance, createFixedStepper, type FixedStepper } from '../../app/fixed-step';
import { KeyboardMouseInput, type InputSource } from './keyboard-mouse-input';

/** PHASE01 battle scene: draws with primitive shapes. PHASE02-b switches to placeholder sprites. */
export class BattleScene extends Phaser.Scene {
  private world!: World;
  private liveId!: string;
  private stepper!: FixedStepper;
  private input2!: InputSource;
  private prevView!: WorldView;
  private view!: WorldView;
  private gfx!: Phaser.GameObjects.Graphics;

  constructor() {
    super('battle');
  }

  create(): void {
    this.world = createWorld(TEST_RANGE, DEFAULT_TUNING);
    this.liveId = spawnSoldier(this.world, 'west');
    this.stepper = createFixedStepper(TICKS_PER_SECOND);
    this.input2 = new KeyboardMouseInput(this);
    this.view = getView(this.world);
    this.prevView = this.view;

    const map = this.world.map;
    const statics = this.add.graphics();
    statics.fillStyle(0x2a3a2a).fillRect(0, 0, map.width, map.height);
    statics.fillStyle(0x2b5d8a);
    for (const w of map.water) statics.fillRect(w.x, w.y, w.w, w.h);
    statics.fillStyle(0x555b63);
    for (const w of map.walls) statics.fillRect(w.x, w.y, w.w, w.h);
    this.gfx = this.add.graphics();
    this.cameras.main.setBounds(0, 0, map.width, map.height);
  }

  override update(_time: number, deltaMs: number): void {
    const { steps, alpha } = advance(this.stepper, deltaMs);
    for (let i = 0; i < steps; i++) {
      const live = this.view.soldiers.find((s) => s.id === this.liveId);
      const input = this.input2.read(live ?? { x: 0, y: 0 });
      this.prevView = this.view;
      step(this.world, new Map([[this.liveId, input]]));
      this.view = getView(this.world);
    }
    this.draw(alpha);
  }

  private draw(alpha: number): void {
    const g = this.gfx;
    g.clear();
    const r = this.world.tuning.soldier.spriteRadius;
    for (const s of this.view.soldiers) {
      const p = lerpSoldier(this.prevView.soldiers.find((o) => o.id === s.id) ?? s, s, alpha);
      g.fillStyle(s.role === 'live' ? 0xf2c94c : 0x9fb3c8).fillCircle(p.x, p.y, r);
      g.lineStyle(3, 0x111111).strokeCircle(p.x, p.y, r);
      g.lineStyle(4, 0x111111).lineBetween(
        p.x,
        p.y,
        p.x + Math.cos(s.facing) * r * 1.4,
        p.y + Math.sin(s.facing) * r * 1.4,
      );
      if (s.id === this.liveId) this.cameras.main.centerOn(p.x, p.y);
    }
  }
}

function lerpSoldier(a: SoldierView, b: SoldierView, t: number): { x: number; y: number } {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
