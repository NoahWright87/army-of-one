/** (PHASE12-b) Unified armor ([D70], [D71]). */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../content/tuning';
import { armorFrom, pierceOf, roleArmor, throughArmor, uniformArmor } from '../combat/armor';

const T = DEFAULT_TUNING;
const at = { x: 0, y: 0 };

describe('armor', () => {
  it('a tank: 99 % front and sides, 90 % at the back', () => {
    const tank = roleArmor(T, 'tank');
    expect(armorFrom(tank, at, 0, { x: 100, y: 0 })).toBe(0.99);
    expect(armorFrom(tank, at, 0, { x: 0, y: 100 })).toBe(0.99);
    expect(armorFrom(tank, at, 0, { x: -100, y: 10 })).toBe(0.9);
  });

  it('pierce subtracts from armor, never below zero', () => {
    expect(throughArmor(0.99, 0)).toBeCloseTo(0.01); // a rifle on a tank
    expect(throughArmor(0.99, pierceOf(T, 'rocket'))).toBeCloseTo(0.51);
    expect(throughArmor(0.1, pierceOf(T, 'rocket'))).toBe(1);
    expect(throughArmor(0.99, pierceOf(T, 'crush'))).toBe(1); // [D66]
    expect(pierceOf(T, 'pistol')).toBe(0);
  });

  it('grenades: the blast pierces, the shrapnel does not ([D71])', () => {
    expect(pierceOf(T, 'grenade')).toBe(0.5);
    expect(pierceOf(T, 'fragment')).toBe(0);
  });

  it('no source: the side armor', () => {
    expect(armorFrom(uniformArmor(0.6), at, 1, undefined)).toBe(0.6);
    expect(armorFrom(roleArmor(T, 'shield'), at, 0, undefined)).toBe(0);
  });
});
