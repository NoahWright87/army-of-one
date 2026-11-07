/**
 * PHASE11: `npm run sim -- --scenario economy [--lives a,b,c] [--enemies]`. Plays autoplay lives
 * through the real game flow (headless) and prints the money: who bought what, bounties,
 * capture income and the balance over battle time ([D51]–[D54]).
 */
import { DEFAULT_TUNING, withTuning } from '../src/content/tuning';
import { MISSION_03 } from '../src/content/maps/mission-03';
import { roleDef } from '../src/content/roles';
import { formatBattleTime, TICKS_PER_SECOND } from '../src/sim/core/time';
import { createHarness } from '../src/app/test-harness';
import { availableAt, balanceAt, formatMoney, rateAt } from '../src/timeline/economy';

export async function runEconomyScenario(lives: string[], enemies: boolean): Promise<void> {
  const tuning = withTuning(DEFAULT_TUNING, { ai: { enabled: enemies } });
  const h = createHarness({ map: MISSION_03, tuning });
  await h.game.boot();
  await h.game.newMission();
  for (const name of lives) {
    if (!h.ui.current) break; // the mission ended
    try {
      await h.play(name);
    } catch (e) {
      // The scripted stories assume no enemies ([Q27]): a later one may not be offered.
      console.log(`stopped before ${name}: ${(e as Error).message}`);
      break;
    }
    await h.settle();
    console.log(`played ${name} → ${h.game.flow.kind}`);
  }
  const m = h.game.mission;
  const l = h.game.ledger();
  const end = Math.max(...m.lanes.map((x) => x.recordedTo), 0);
  console.log(`\nStart ${formatMoney(l.start)}, base +${l.basePerSecond}/s`);
  for (const s of m.soldiers) {
    const lane = m.lanes.find((x) => x.soldierId === s.id);
    const r = roleDef(s.roleId);
    console.log(
      `  ${s.id} ${r.id} at ${formatBattleTime(s.spawnTick)} (${s.spawnPointId}): ` +
        `${r.cost ? formatMoney(r.cost) : 'free'}${lane?.end.kind === 'neverSpawned' ? ' (never spawned: refunded)' : ''}`,
    );
  }
  for (const i of l.incomes) {
    console.log(
      `  income ${i.pointId}: +${i.perSecond}/s from ${formatBattleTime(i.from)}` +
        (i.to !== null ? ` until ${formatBattleTime(i.to)} (lost)` : ''),
    );
  }
  for (const b of l.bounties) {
    console.log(
      `  bounty ${b.refId} (${b.kind}) at ${formatBattleTime(b.tick)}: ${formatMoney(b.amount)}`,
    );
  }
  console.log('\n  time   balance  available  rate');
  for (let t = 0; t <= end + TICKS_PER_SECOND * 10; t += TICKS_PER_SECOND * 10) {
    console.log(
      `  ${formatBattleTime(t).padStart(5)}  ${formatMoney(balanceAt(l, t)).padStart(7)}  ` +
        `${formatMoney(availableAt(l, t)).padStart(9)}  +${rateAt(l, t)}/s`,
    );
  }
}
