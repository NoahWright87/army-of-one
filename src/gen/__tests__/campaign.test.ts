import { describe, expect, it } from 'vitest';
import { OFFICIAL_BLOCKS } from '../../content/blocks';
import { BLOCK_TUNING, DEFAULT_TUNING } from '../../content/tuning';
import {
  attackable,
  campaignBudget,
  campaignWon,
  enemyGrowth,
  finishLevel,
  hqLevel,
  levelGraph,
  levelSettings,
  levelTags,
  lockedRoles,
  newCampaign,
  openRoles,
  parseCampaign,
  settingsFor,
  startLevel,
  takeLevel,
  difficultyOpen,
  withDifficulty,
  type CampaignState,
  type LevelResult,
} from '../campaign';
import { generateWorld } from '../world';

const world = generateWorld(OFFICIAL_BLOCKS, { seed: 11 });
const MIN = 60 * 60; // ticks per minute

function result(level: number, over: Partial<LevelResult> = {}): LevelResult {
  return {
    level,
    battleTicks: 2 * MIN,
    startMoney: 100,
    endMoney: 240,
    earned: 300,
    spent: 160,
    spawned: 6,
    lost: 3,
    reservesUsed: {},
    survivors: { rifleman: 2, gunner: 1 },
    ...over,
  };
}

function start(c: CampaignState, level: number): CampaignState {
  return startLevel(world, c, levelSettings(world, c, level, `m-${level}`));
}

describe('campaign map', () => {
  it('starts with the levels the start edge leads into', () => {
    const c = newCampaign(11);
    const first = [...new Set(world.crossings.filter((x) => x.a === -1).map((x) => x.b))].sort(
      (p, q) => p - q,
    );
    expect(attackable(world, c)).toEqual(first);
  });

  it('taking a level opens the levels it has crossings to', () => {
    let c = newCampaign(11);
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

  it('is won by working through to the HQ', () => {
    let c = newCampaign(11);
    const hq = hqLevel(world);
    expect(world.levels[hq]!.kind).toBe('base');
    for (let i = 0; i < world.levels.length && !campaignWon(world, c); i++) {
      const opts = attackable(world, c);
      c = takeLevel(world, c, opts.includes(hq) ? hq : opts[0]!);
    }
    expect(campaignWon(world, c)).toBe(true);
    expect(attackable(world, c)).toEqual([]);
  });
});

describe('one level at a time ([D122])', () => {
  /** A campaign with at least two levels to choose from. */
  function twoChoices(): CampaignState {
    let c = newCampaign(11);
    while (attackable(world, c).length < 2) c = takeLevel(world, c, attackable(world, c)[0]!);
    return c;
  }

  it('only the active level can be entered until it is won', () => {
    const c0 = twoChoices();
    const [a, b] = attackable(world, c0);
    const c1 = start(c0, a!);
    expect(attackable(world, c1)).toEqual([a]);
    expect(start(c1, b!)).toBe(c1); // another level can't be started
    expect(settingsFor(c1, `m-${a}`)?.level).toBe(a);
    const c2 = finishLevel(world, c1, result(a!));
    expect(c2.active).toBeNull();
    expect(attackable(world, c2)).toContain(b);
    // Its settings stay findable for its results and replay.
    expect(settingsFor(c2, `m-${a}`)?.level).toBe(a);
  });

  it("can't start a level that isn't next to held ground", () => {
    const c = newCampaign(11);
    const far = world.levels.find((l) => !attackable(world, c).includes(l.index))!;
    expect(start(c, far.index).active).toBeNull();
  });

  it('a result for another level changes nothing', () => {
    const c0 = twoChoices();
    const [a, b] = attackable(world, c0);
    const c1 = start(c0, a!);
    expect(finishLevel(world, c1, result(b!))).toBe(c1);
    expect(finishLevel(world, c0, result(a!))).toBe(c0);
  });
});

describe('carry-over ([D117], [D118], [D120])', () => {
  it('money, reserves, battle time and the result carry over', () => {
    let c = newCampaign(11);
    expect(c.money).toBe(DEFAULT_TUNING.economy.startMoney);
    const a = attackable(world, c)[0]!;
    c = start(c, a);
    c = finishLevel(world, c, result(a));
    expect(c.money).toBe(240);
    expect(c.reserves).toEqual({ rifleman: 2, gunner: 1 });
    expect(c.battleTicks).toBe(2 * MIN);
    expect(c.results).toHaveLength(1);
    expect(c.results[0]!.settings?.level).toBe(a);

    // The next level starts with them; using a reserve and losing everyone leaves the rest.
    const b = attackable(world, c)[0]!;
    c = start(c, b);
    expect(c.active!.startMoney).toBe(240);
    expect(c.active!.reserves).toEqual({ rifleman: 2, gunner: 1 });
    c = finishLevel(
      world,
      c,
      result(b, { endMoney: -30, reservesUsed: { gunner: 1 }, survivors: { tank: 1 } }),
    );
    expect(c.money).toBe(0); // debt doesn't carry
    expect(c.reserves).toEqual({ rifleman: 2, tank: 1 });
  });

  it('starts with the starter roles; taking a level unlocks its role', () => {
    let c = newCampaign(11);
    expect(openRoles(c)).toEqual(['rifleman', 'grenadier', 'gunner', 'shield']);
    const tags = levelTags(world);
    // Take levels until one with an unlock falls.
    for (let i = 0; i < world.levels.length && c.unlocked.length === 0; i++) {
      const lv = attackable(world, c)[0]!;
      c = takeLevel(world, c, lv);
      const got = tags[lv]!.flatMap((t) => (t.kind === 'unlock' ? [t.role] : []));
      expect(c.unlocked).toEqual(expect.arrayContaining(got));
    }
    expect(openRoles(c).length).toBeGreaterThan(4);
    expect(c.active).toBeNull();
  });

  it('Income+ levels raise the income for the rest of the campaign', () => {
    const tags = levelTags(world);
    let c = newCampaign(11);
    for (let i = 0; i < world.levels.length && !campaignWon(world, c); i++) {
      c = takeLevel(world, c, attackable(world, c)[0]!);
    }
    const incomes = c.taken.filter((lv) => tags[lv]!.some((t) => t.kind === 'income')).length;
    expect(c.incomeBonus).toBeCloseTo(incomes * BLOCK_TUNING.campaign.incomeBonus);
  });
});

describe('level tags ([D121])', () => {
  const tags = levelTags(world);

  it('are deterministic', () => {
    expect(levelTags(generateWorld(OFFICIAL_BLOCKS, { seed: 11 }))).toEqual(tags);
  });

  it('every locked role is unlocked by exactly one level, never the HQ', () => {
    const unlocks = tags.flatMap((t, lv) =>
      t.flatMap((x) => (x.kind === 'unlock' ? [{ lv, role: x.role }] : [])),
    );
    expect(unlocks.map((u) => u.role).sort()).toEqual(lockedRoles().sort());
    expect(tags[world.hq]).toEqual([]);
    const g = levelGraph(world);
    for (const u of unlocks) expect(g.dist[u.lv]).toBeGreaterThanOrEqual(0);
  });

  it('Elite levels hold the big rewards', () => {
    for (const t of tags) {
      if (t.some((x) => x.kind === 'income')) expect(t[0]).toEqual({ kind: 'elite' });
    }
    expect(tags.flat().filter((x) => x.kind === 'income').length).toBeLessThanOrEqual(
      BLOCK_TUNING.campaign.incomeLevels,
    );
  });

  it('every role is unlockable on other seeds too', () => {
    for (const seed of [3, 7]) {
      const w = generateWorld(OFFICIAL_BLOCKS, { seed });
      const roles = levelTags(w).flatMap((t) =>
        t.flatMap((x) => (x.kind === 'unlock' ? [x.role] : [])),
      );
      expect(roles.sort()).toEqual(lockedRoles().sort());
    }
  });
});

describe('enemy funds ([D119])', () => {
  it('grow with battle time from each level’s own budget to full, × Elite', () => {
    const c0 = newCampaign(11);
    const tags = levelTags(world);
    const plain = world.levels.find(
      (l) => l.index !== world.hq && tags[l.index]!.length === 0 && l.budget < l.maxBudget,
    )!;
    expect(campaignBudget(world, c0, plain.index)).toBe(plain.budget);
    const half: CampaignState = {
      ...c0,
      battleTicks: (BLOCK_TUNING.campaign.minutesToFull / 2) * MIN,
    };
    expect(enemyGrowth(half)).toBeCloseTo(0.5);
    const mid = campaignBudget(world, half, plain.index);
    expect(mid).toBeGreaterThan(plain.budget);
    expect(mid).toBeLessThan(plain.maxBudget);
    const full: CampaignState = { ...c0, battleTicks: 999 * MIN };
    expect(campaignBudget(world, full, plain.index)).toBe(plain.maxBudget);

    const elite = world.levels.find((l) => tags[l.index]![0]?.kind === 'elite')!;
    const own = Math.min(elite.budget, elite.maxBudget);
    expect(campaignBudget(world, c0, elite.index)).toBe(
      Math.round(Math.min(elite.maxBudget, own * BLOCK_TUNING.campaign.eliteBudget)),
    );
  });
});

describe('saving', () => {
  it('round-trips through JSON and rejects junk and older versions', () => {
    let c = newCampaign(11, [OFFICIAL_BLOCKS[0]!]);
    const a = attackable(world, c)[0]!;
    c = finishLevel(world, start(c, a), result(a));
    c = start(c, attackable(world, c)[0]!);
    expect(parseCampaign(JSON.parse(JSON.stringify(c)))).toEqual(c);
    expect(parseCampaign({ version: 2, seed: 1, includeMine: false, taken: [] })).toBeNull();
    expect(parseCampaign({ ...c, reserves: { wizard: 2 } })).toBeNull();
    expect(parseCampaign(null)).toBeNull();
  });
});

describe('difficulty (PHASE16, [D134])', () => {
  it('scales enemy budgets and starting money, and is fixed once a level is attacked', () => {
    const normal = newCampaign(11);
    const easy = withDifficulty(normal, 'easy');
    const hard = withDifficulty(normal, 'hard');
    expect(easy.money).toBe(150);
    const lv = world.levels.find((l) => l.index !== world.hq && l.budget * 2 < l.maxBudget)!;
    const b = (c: CampaignState) => campaignBudget(world, c, lv.index);
    expect(b(easy)).toBeLessThan(b(normal));
    expect(b(hard)).toBeGreaterThan(b(normal));

    const started = start(easy, attackable(world, easy)[0]!);
    expect(difficultyOpen(started)).toBe(false);
    expect(withDifficulty(started, 'hard')).toBe(started);
    // Saved before PHASE16 (no difficulty): Normal.
    const old = JSON.parse(JSON.stringify(normal));
    delete old.difficulty;
    expect(parseCampaign(old)?.difficulty).toBe('normal');
  });
});
