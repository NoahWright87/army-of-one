// Deliberately violates purity rules. tools/check-purity-lint.mjs asserts ESLint rejects it.
import Phaser from 'phaser';

export const bad = [Phaser, Math.random(), Date.now(), window, new Date()];
