import { describe, expect, it } from 'vitest';
import type { SpawnOption } from '../../../contracts/mission';
import type { Ledger } from '../../../timeline/economy';
import { cantAffordText, optionMoney, roleMoney } from '../respawn-model';

const ledger = (start: number, purchases: Ledger['purchases'] = []): Ledger => ({
  enabled: true,
  start,
  basePerSecond: 1,
  incomes: [],
  bounties: [],
  purchases,
});
const at = (entryTick: number): SpawnOption => ({ kind: 'new', spawnPointId: 'beach', entryTick });

describe('respawn money (PHASE11)', () => {
  it('labels each option with what it can spend', () => {
    expect(optionMoney(at(600), { economy: ledger(100) })).toEqual({
      text: '$110 to spend',
      debt: false,
    });
    const resume: SpawnOption = {
      kind: 'resume',
      soldierId: 'S1',
      resumeTick: 60,
      leadInFromTick: 0,
    };
    expect(optionMoney(resume, { economy: ledger(100) })?.text).toBe('Already paid for');
    expect(optionMoney(at(0), { economy: ledger(-20) })).toEqual({
      text: 'In debt (−$20): only free roles',
      debt: true,
    });
    expect(optionMoney(at(0), {})).toBeNull();
    expect(optionMoney(at(0), { economy: { ...ledger(100), enabled: false } })).toBeNull();
  });

  it('prices roles and flags the ones the selected spawn cannot afford', () => {
    const m = roleMoney(at(0), { economy: ledger(40) });
    expect(m.map((r) => [r.roleId, r.price, r.affordable])).toEqual([
      ['rifleman', 'Free', true],
      ['grenadier', '$30', true],
      ['gunner', '$50', false],
      ['sniper', '$40', true], // exactly enough
      ['shield', '$35', true],
      ['shotgun', '$30', true],
      ['bazooka', '$60', false],
      ['truck', '$120', false],
      ['tank', '$250', false],
    ]);
    expect(cantAffordText(at(0), 'gunner', { economy: ledger(40) })).toBe(
      'Not enough money at 0:00 (needs $50, $40 to spend)',
    );
    expect(cantAffordText(at(0), 'grenadier', { economy: ledger(40) })).toBeNull();
  });

  it('a later purchase limits what an earlier spawn can spend ([Q30])', () => {
    const l = ledger(100, [{ tick: 3600, cost: 150, roleId: 'gunner' }]);
    // $160 at 60 s − $150 = $10 left then, so at 0:10 only $10 is spendable.
    expect(optionMoney(at(600), { economy: l })?.text).toBe('$10 to spend');
  });
});
