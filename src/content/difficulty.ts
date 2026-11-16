/**
 * (PHASE16) Difficulty presets, chosen per campaign ([D134]): how rich the enemy is (it shapes
 * the generated levels, so it's fixed once a campaign starts), the money you start with, and
 * tuning on top of the defaults (AI handicaps [D132], regeneration [D133]). Normal is the
 * defaults. All numbers are tuning.
 */
import type { StringKey } from './strings';
import type { DeepPartial, Tuning } from './tuning';

export type Difficulty = 'easy' | 'normal' | 'hard';

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];

export interface DifficultyDef {
  nameKey: StringKey;
  blurbKey: StringKey;
  /** Enemy budgets × this (still capped at a level's full budget). */
  budget: number;
  /** Money the campaign starts with. */
  startMoney: number;
  /** On top of DEFAULT_TUNING for the campaign's battles (your F2 settings still win). */
  tuning: DeepPartial<Tuning>;
}

export const DIFFICULTY: Readonly<Record<Difficulty, DifficultyDef>> = {
  easy: {
    nameKey: 'difficulty.easy',
    blurbKey: 'difficulty.easy.blurb',
    budget: 0.6, // TUNE
    startMoney: 150, // TUNE
    tuning: {
      soldier: { regen: { perSecond: 4, delaySeconds: 3 } }, // TUNE
      ai: {
        sightRange: 400, // TUNE
        reactionSeconds: 0.9, // TUNE
        aimError: 0.08, // TUNE
        distanceAimError: 0.09, // TUNE
      },
    },
  },
  normal: {
    nameKey: 'difficulty.normal',
    blurbKey: 'difficulty.normal.blurb',
    budget: 1,
    startMoney: 100, // TUNE [D51]
    tuning: {},
  },
  hard: {
    nameKey: 'difficulty.hard',
    blurbKey: 'difficulty.hard.blurb',
    budget: 1.4, // TUNE
    startMoney: 100, // TUNE
    tuning: {
      soldier: { regen: { perSecond: 0 } }, // [D133]: off on Hard
      ai: {
        sightRange: 560, // TUNE: on Hard they see a little past your rifle's 520
        reactionSeconds: 0.5, // TUNE
        aimError: 0.05, // TUNE
        distanceAimError: 0.03, // TUNE
        burstPauseSeconds: 0.5, // TUNE
      },
    },
  },
};

export function isDifficulty(v: unknown): v is Difficulty {
  return v === 'easy' || v === 'normal' || v === 'hard';
}
