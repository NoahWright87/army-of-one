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
  it('starts with the levels the start edge leads into', () => {
    const c = newCampaign(11, false);
    const first = [...new Set(world.crossings.filter((x) => x.a === -1).map((x) => x.b))].sort(
      (p, q) => p - q,
    );
    expect(attackable(world, c)).toEqual(first);
  });

  it('taking a level opens the levels it has crossings to', () => {
    let c = newCampaign(11, false);
    const lv = attackable(world, c)[0]!;
    c = takeLevel(world, c, lv);
    const next = attackable(world, c);
    expect(next).not.toContain(lv);
    const linked = world.crossings
      .filter((x) => x.a === lv || x.b === lv)
      .map((x) => (x.a === lv ? x.b : x.a))
      .filter((o) => o >= 0 && o !== lv);
    for (const o of linked) expect(next).toContain(o);
  });

  it('raises budgets as levels are taken', () => {
    let c = newCampaign(11, false);
    const probe = world.levels[world.levels.length - 1]!;
    const before = campaignBudget(world, c, probe.index);
    c = takeLevel(world, c, 0);
    c = takeLevel(world, c, 1);
    const after = campaignBudget(world, c, probe.index);
    expect(after).toBeGreaterThanOrEqual(before);
    expect(after).toBeLessThanOrEqual(probe.maxBudget);
  });

  it('is won by working through to the HQ', () => {
    let c = newCampaign(11, false);
    const hq = hqLevel(world);
    expect(world.levels[hq]!.kind).toBe('base');
    for (let i = 0; i < world.levels.length && !campaignWon(world, c); i++) {
      const opts = attackable(world, c);
      c = takeLevel(world, c, opts.includes(hq) ? hq : opts[0]!);
    }
    expect(campaignWon(world, c)).toBe(true);
    expect(attackable(world, c)).toEqual([]);
  });

  it('round-trips through JSON and rejects junk', () => {
    const c = takeLevel(world, newCampaign(11, true), 2);
    expect(parseCampaign(JSON.parse(JSON.stringify(c)))).toEqual(c);
    expect(parseCampaign({ version: 9 })).toBeNull();
    expect(parseCampaign(null)).toBeNull();
  });
});
