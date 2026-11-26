/**
 * (PHASE20, [D160]) The stance and weapon buttons' state: presses (from keys Z / Q or the icons)
 * and whether each is left to the game (auto). Presses are latched, so one shorter than a tick
 * still counts once. `read()` is merged into the soldier's input every tick. Manual by default
 * (the stance button does what it says); auto is the old behaviour, a choice that's remembered.
 */
import type { SoldierInput } from '../../sim/entities/soldier';
import { PressLatch } from './input-math';

const KEY = { stance: 'aoo:auto-stance', weapon: 'aoo:auto-weapon' } as const;

/** The part of `localStorage` this needs (so tests don't need a browser). */
export interface LoadoutStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class LoadoutControls {
  autoStance = false;
  autoWeapon = false;
  private readonly stanceLatch = new PressLatch();
  private readonly swapLatch = new PressLatch();

  constructor(private readonly store?: LoadoutStore) {
    try {
      this.autoStance = store?.getItem(KEY.stance) === '1';
      this.autoWeapon = store?.getItem(KEY.weapon) === '1';
    } catch {
      // Storage can be blocked: manual it is.
    }
  }

  pressStance(): void {
    this.stanceLatch.press();
  }

  pressSwap(): void {
    this.swapLatch.press();
  }

  /** Right-click or long-press on an icon. */
  toggleAuto(which: 'stance' | 'weapon'): void {
    if (which === 'stance') this.autoStance = !this.autoStance;
    else this.autoWeapon = !this.autoWeapon;
    try {
      this.store?.setItem(KEY.stance, this.autoStance ? '1' : '0');
      this.store?.setItem(KEY.weapon, this.autoWeapon ? '1' : '0');
    } catch {
      // Not remembered; still works this session.
    }
  }

  /** This tick's share of the soldier's input. */
  read(): Pick<SoldierInput, 'stance' | 'swap' | 'autoStance' | 'autoWeapon'> {
    return {
      stance: this.stanceLatch.consume(),
      swap: this.swapLatch.consume(),
      autoStance: this.autoStance,
      autoWeapon: this.autoWeapon,
    };
  }
}
