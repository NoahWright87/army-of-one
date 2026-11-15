import { describe, expect, it } from 'vitest';
import { OFFICIAL_BLOCKS } from '../../content/blocks';
import {
  attackable,
  campaignBudget,
  campaignWon,
  hqLevel,
  newCampaign,
  parseCampaign,
  takeLevel,
} from '../campaign';
import { generateWorld } from '../world';

const world = generateWorld(OFFICIAL_BLOCKS, { seed: 11 });

describe('campaign', () => {
  it('starts with the first band attackable', () => {
    const c = newCampaign(11, false);
    const first = world.levels.filter((l) => l.row + l.rows === world.rows).map((l) => l.index);
    expect(attackable(world, c)).toEqual(first);
  });

  it('opens the levels north of a taken one', () => {
    let c = newCampaign(11, false);
    const lv = world.levels[attackable(world, c)[0]!]!;
    c = takeLevel(world, c, lv.index);
    const next = attackable(world, c).map((i) => world.levels[i]!);
    const north = next.filter((l) => l.row + l.rows === lv.row);
    expect(north.length).toBeGreaterThan(0);
    for (const l of north) expect(l.col < lv.col + lv.cols && lv.col < l.col + l.cols).toBe(true);
    expect(attackable(world, c)).not.toContain(lv.index);
  });

  it('raises budgets as levels are taken', () => {
    let c = newCampaign(11, false);
    const probe = world.levels.find((l) => l.kind === 'field' && l.row === 0) ?? world.levels[5]!;
    const before = campaignBudget(world, c, probe.index);
    c = takeLevel(world, c, 0);
    c = takeLevel(world, c, 1);
    const after = campaignBudget(world, c, probe.index);
    expect(after).toBeGreaterThanOrEqual(before);
    expect(after).toBeLessThanOrEqual(probe.maxBudget);
  });

  it('is won by climbing to the HQ', () => {
    let c = newCampaign(11, false);
    const hq = hqLevel(world);
    expect(world.levels[hq]!.row).toBe(0);
    // Always take the attackable level closest to the HQ's columns.
    const hqL = world.levels[hq]!;
    for (let i = 0; i < 20 && !campaignWon(world, c); i++) {
      const opts = attackable(world, c).map((n) => world.levels[n]!);
      opts.sort(
        (a, b) =>
          Math.abs(a.col + a.cols / 2 - (hqL.col + hqL.cols / 2)) -
            Math.abs(b.col + b.cols / 2 - (hqL.col + hqL.cols / 2)) || a.row - b.row,
      );
      c = takeLevel(world, c, opts[0]!.index);
    }
    expect(campaignWon(world, c)).toBe(true);
    expect(c.taken.length).toBeLessThanOrEqual(world.rows / 10 + 2);
    expect(attackable(world, c)).toEqual([]);
  });

  it('round-trips through JSON and rejects junk', () => {
    const c = takeLevel(world, newCampaign(11, true), 2);
    expect(parseCampaign(JSON.parse(JSON.stringify(c)))).toEqual(c);
    expect(parseCampaign({ version: 9 })).toBeNull();
    expect(parseCampaign(null)).toBeNull();
  });
});
