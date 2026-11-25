import { describe, expect, it } from 'vitest';
import { ROLES } from '../../../content/roles';
import { DEFAULT_TUNING, withTuning } from '../../../content/tuning';
import { armorShields, roleCard } from '../role-card-model';

const card = (id: Parameters<typeof roleCard>[1], t = DEFAULT_TUNING) => roleCard(t, id);

describe('role card model', () => {
  it('shields: one per 20% armor, at least one for any armor', () => {
    expect(armorShields(0)).toBe(0);
    expect(card('shield').survivability.shields).toBe(4);
    expect(card('shotgun').survivability.shields).toBe(1);
    expect(card('truck').survivability.shields).toBe(3);
    expect(card('tank').survivability.shields).toBe(5);
    expect(card('rifleman').survivability.shields).toBe(0);
  });

  it('regen arrows follow tuning and are off for vehicles and on Hard', () => {
    expect(card('rifleman').survivability.regenArrows).toBeGreaterThan(0);
    expect(card('tank').survivability.regenArrows).toBe(0);
    const hard = withTuning(DEFAULT_TUNING, { soldier: { regen: { perSecond: 0 } } });
    expect(card('rifleman', hard).survivability.regenArrows).toBe(0);
  });

  it('damage spans: rocket soldier→vehicle, grenade graze→blast, shotgun far→point blank', () => {
    const b = card('bazooka').lethality;
    expect(b.dps.max).toBeGreaterThan(b.dps.min * 2);
    expect(b.detail).toMatchObject({ low: 120, high: 400, kind: 'antiVehicle' });
    const g = card('grenadier').lethality;
    expect(g.range.min).toBe(DEFAULT_TUNING.grenade.minRange);
    expect(g.detail.low).toBe(DEFAULT_TUNING.grenade.fragmentDamage);
    expect(g.explosive).toBe(true);
    const s = card('shotgun').lethality;
    expect(s.dps.min).toBeLessThan(s.dps.max);
    expect(card('rifleman').lethality.dps.min).toBe(card('rifleman').lethality.dps.max);
  });

  it('bars are shares of the role group, soldiers and vehicles scaled separately', () => {
    for (const r of ROLES) {
      const c = card(r.id);
      expect(c.survivability.hpShare).toBeGreaterThan(0);
      expect(c.survivability.hpShare).toBeLessThanOrEqual(1);
      expect(c.lethality.dpsShare.max).toBeLessThanOrEqual(1);
      expect(c.mobility.sprintShare).toBeLessThanOrEqual(1);
    }
    expect(card('tank').survivability.hpShare).toBe(1); // top of the vehicle scale
    expect(card('shotgun').survivability.hpShare).toBe(1); // top of the soldier scale
    expect(card('shield').mobility.walk).toBeLessThan(card('rifleman').mobility.walk);
    expect(card('rifleman').mobility.sprint).toBeGreaterThan(card('rifleman').mobility.walk);
  });

  it('tracks tuning', () => {
    const t = withTuning(DEFAULT_TUNING, { rifle: { damage: 50 } });
    expect(card('rifleman', t).lethality.dps.max).toBe(
      Math.round(50 / DEFAULT_TUNING.rifle.cooldownSeconds),
    );
  });
});
