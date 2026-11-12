/**
 * PHASE11: money in the game flow ([D51]–[D54]). A role the money at the entry tick can't pay
 * for deploys as a free Rifleman ([D18], [Q30]); the HUD money includes the live soldier's
 * purchase; the respawn screen gets the ledger.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING, withTuning } from '../content/tuning';
import { createHarness } from './test-harness';

const tuning = (startMoney: number) =>
  withTuning(DEFAULT_TUNING, { ai: { enabled: false }, economy: { startMoney } });

async function deployAs(startMoney: number) {
  const h = createHarness({ tuning: tuning(startMoney) });
  await h.game.newMission();
  await h.settle(100);
  const screen = h.ui.current!;
  expect(screen.latest.economy?.start).toBe(startMoney);
  h.game.roleId = 'gunner'; // $50
  await h.game.deploy(screen.latest.options[0]!);
  return h;
}

describe('economy in the flow (PHASE11)', () => {
  it('deploys the picked role when the money covers it', async () => {
    const h = await deployAs(100);
    const run = h.runs[0]!.run;
    expect(run.attempt.live).toMatchObject({ mode: 'new', roleId: 'gunner' });
    expect(run.money!()).toEqual({ balance: 50, rate: 1 });
  });

  it('falls back to a free Rifleman when it does not', async () => {
    const h = await deployAs(40);
    const run = h.runs[0]!.run;
    expect(run.attempt.live?.mode).toBe('new');
    expect(run.attempt.live && 'roleId' in run.attempt.live && run.attempt.live.roleId).toBeFalsy();
    expect(run.money!()).toEqual({ balance: 40, rate: 1 });
  });

  it('shows no money with the economy off', async () => {
    const h = createHarness({
      tuning: withTuning(DEFAULT_TUNING, { ai: { enabled: false }, economy: { enabled: false } }),
    });
    await h.game.newMission();
    await h.settle(100);
    h.game.roleId = 'gunner';
    await h.game.deploy(h.ui.current!.latest.options[0]!);
    const run = h.runs[0]!.run;
    expect(run.attempt.live).toMatchObject({ roleId: 'gunner' });
    expect(run.money!()).toBeNull();
  });
});
