/**
 * (PHASE11) Money on the timeline ([D51]–[D54]). The balance is a pure function of battle time
 * and the current truth:
 *
 *   balance(t) = start + base income × t + capture income while ours + bounties ≤ t
 *                − costs of soldiers spawned ≤ t
 *
 * Income is battle time, not survival ([D52]). Every enemy loss pays once, at its tick, whatever
 * caused it ([D53]). Soldiers are charged at their spawn tick, only if they spawn in the current
 * truth ([Q31]). Money taken away by a history change becomes debt, never an un-spawn ([D54]).
 * What you can spend at t is the lowest balance from t on ([Q30]), so a purchase never leaves a
 * later one unpaid. Pure; the sim never reads it.
 */
import { roleDef } from '../content/roles';
import { str } from '../content/strings';
import type { Tuning } from '../content/tuning';
import type {
  CaptureTruth,
  EnemyLossKind,
  LaneTruth,
  LossTruth,
  RoleId,
  SoldierId,
  SoldierRecord,
} from '../contracts/mission';
import { TICKS_PER_SECOND, type Tick } from '../sim/core/time';
import type { MapDef } from '../sim/world/map';
import { pointLostAfter } from './losses';

export interface IncomeSpan {
  pointId: string;
  /** Income starts after this tick (the capture). */
  from: Tick;
  /** Income stops at this tick (the point was lost); null = until the end. */
  to: Tick | null;
  perSecond: number;
}

export interface Bounty {
  tick: Tick;
  amount: number;
  refId: string;
  kind: EnemyLossKind;
}

export interface Purchase {
  tick: Tick;
  cost: number;
  roleId: RoleId;
  /** Absent for a life that has no record yet (the one being played). */
  soldierId?: SoldierId;
  /** (PHASE14) A campaign reserve ([D117]): a free spawn, cost 0. */
  reserve?: true;
}

/** Everything that moves the money, from one truth. */
export interface Ledger {
  enabled: boolean;
  start: number;
  basePerSecond: number;
  incomes: IncomeSpan[];
  /** Sorted by tick. */
  bounties: Bounty[];
  /** Sorted by tick. */
  purchases: Purchase[];
  /** (PHASE14) Campaign reserves left per role after every purchase here ([D117]). */
  reservesLeft?: Partial<Record<RoleId, number>>;
}

export interface LedgerInput {
  map: MapDef;
  tuning: Pick<Tuning, 'economy'>;
  soldiers: readonly SoldierRecord[];
  lanes: readonly LaneTruth[];
  captures?: readonly CaptureTruth[];
  losses?: LossTruth;
  /** A purchase without a record yet (the life being played). */
  pending?: { tick: Tick; roleId: RoleId };
}

/** The bounty for one enemy loss ([D53]). */
export function bountyFor(
  e: { kind: EnemyLossKind; roleId?: RoleId },
  tuning: Pick<Tuning, 'economy'>,
): number {
  const b = tuning.economy.bounty;
  if (e.kind !== 'soldier') return b[e.kind];
  return b[e.roleId ?? 'rifleman'];
}

/** The spawn cost of a role ([D36]). 0 with the economy off. */
export function roleCost(roleId: RoleId | undefined, tuning: Pick<Tuning, 'economy'>): number {
  return tuning.economy.enabled ? roleDef(roleId).cost : 0;
}

export function buildLedger(input: LedgerInput): Ledger {
  const { map, tuning } = input;
  const eco = tuning.economy;
  const incomes: IncomeSpan[] = [];
  for (const c of input.captures ?? []) {
    if (c.stage !== 'ours') continue;
    const def = (map.capturePoints ?? []).find((p) => p.id === c.pointId);
    if (!def) continue;
    incomes.push({
      pointId: c.pointId,
      from: c.tick,
      to: pointLostAfter(input.losses, c.pointId, c.tick),
      perSecond: def.income ?? eco.captureIncomePerSecond,
    });
  }
  const bounties: Bounty[] = (input.losses?.enemies ?? [])
    .map((e) => ({ tick: e.tick, amount: bountyFor(e, tuning), refId: e.refId, kind: e.kind }))
    .filter((b) => b.amount !== 0)
    .sort((a, b) => a.tick - b.tick);

  const neverSpawned = new Set(
    input.lanes.filter((l) => l.end.kind === 'neverSpawned').map((l) => l.soldierId),
  );
  // Every spawn in tick order (recorded soldiers by ordinal first, then the pending life), so
  // the first ones of a role use up the campaign's reserves of it ([D117]).
  const spawns: { tick: Tick; roleId: RoleId; soldierId?: SoldierId }[] = input.soldiers
    .filter((s) => !neverSpawned.has(s.id)) // [Q31]: only soldiers who spawn are charged
    .map((s) => ({ tick: s.spawnTick, roleId: s.roleId ?? 'rifleman', soldierId: s.id }));
  if (input.pending) spawns.push({ tick: input.pending.tick, roleId: input.pending.roleId });
  spawns.sort((a, b) => a.tick - b.tick); // stable: ordinal order within a tick
  const left: Partial<Record<RoleId, number>> = { ...(map.economy?.reserves ?? {}) };
  const purchases: Purchase[] = [];
  for (const sp of spawns) {
    const ids = sp.soldierId !== undefined ? { soldierId: sp.soldierId } : {};
    if ((left[sp.roleId] ?? 0) > 0) {
      left[sp.roleId] = left[sp.roleId]! - 1;
      purchases.push({ tick: sp.tick, cost: 0, roleId: sp.roleId, ...ids, reserve: true });
      continue;
    }
    const cost = roleCost(sp.roleId, tuning);
    if (cost > 0) purchases.push({ tick: sp.tick, cost, roleId: sp.roleId, ...ids });
  }

  return {
    enabled: eco.enabled,
    start: map.economy?.startMoney ?? eco.startMoney,
    basePerSecond: map.economy?.baseIncomePerSecond ?? eco.baseIncomePerSecond,
    incomes,
    bounties,
    purchases,
    reservesLeft: left,
  };
}

/** (PHASE14) Campaign reserves of a role still unused in this ledger ([D117]). */
export function reservesLeft(l: Ledger, roleId: RoleId): number {
  return l.reservesLeft?.[roleId] ?? 0;
}

/** Accrued income (base + captures) up to tick t. */
function incomeUpTo(l: Ledger, t: Tick): number {
  let v = (l.basePerSecond * t) / TICKS_PER_SECOND;
  for (const s of l.incomes) {
    const end = s.to === null ? t : Math.min(t, s.to);
    if (end > s.from) v += (s.perSecond * (end - s.from)) / TICKS_PER_SECOND;
  }
  return v;
}

/** Bounties minus purchases at ticks ≤ t (or < t with `before`). */
function stepsUpTo(l: Ledger, t: Tick, before = false): number {
  let v = 0;
  for (const b of l.bounties) {
    if (before ? b.tick >= t : b.tick > t) break;
    v += b.amount;
  }
  for (const p of l.purchases) {
    if (before ? p.tick >= t : p.tick > t) break;
    v -= p.cost;
  }
  return v;
}

/** The balance at battle time t, after everything that happens at t. May be negative ([D54]). */
export function balanceAt(l: Ledger, t: Tick): number {
  const tt = Math.max(0, t);
  return l.start + incomeUpTo(l, tt) + stepsUpTo(l, tt);
}

/** Income per second at tick t (base + every point that's ours then). */
export function rateAt(l: Ledger, t: Tick): number {
  let r = l.basePerSecond;
  for (const s of l.incomes) if (t >= s.from && (s.to === null || t < s.to)) r += s.perSecond;
  return r;
}

/**
 * What a new purchase at t may cost ([Q30]): the lowest balance from t on, so no later purchase
 * is left unpaid. Balances only dip at purchases (income and bounties only add), so checking t
 * and every later purchase is enough. Whole money units; negative = in debt ([D54]).
 */
export function availableAt(l: Ledger, t: Tick): number {
  let min = balanceAt(l, t);
  for (const p of l.purchases) if (p.tick > t) min = Math.min(min, balanceAt(l, p.tick));
  return Math.floor(min + 1e-9);
}

/** Free roles are always affordable ([D18]); paid ones need the money available at t. */
export function canAfford(l: Ledger, t: Tick, cost: number): boolean {
  return !l.enabled || cost <= 0 || cost <= availableAt(l, t);
}

export interface MoneyPoint {
  t: Tick;
  v: number;
}

/**
 * The balance as a polyline from 0 to `toTick`: straight between points, with two points at
 * the same tick for a step (bounty up, purchase down). For drawing the money line.
 */
export function moneyCurve(l: Ledger, toTick: Tick): MoneyPoint[] {
  const end = Math.max(0, toTick);
  const ticks = new Set<Tick>([0, end]);
  for (const s of l.incomes) {
    if (s.from <= end) ticks.add(s.from);
    if (s.to !== null && s.to <= end) ticks.add(s.to);
  }
  const steps = new Set<Tick>();
  for (const b of l.bounties) if (b.tick <= end) steps.add(b.tick);
  for (const p of l.purchases) if (p.tick <= end) steps.add(p.tick);
  for (const t of steps) ticks.add(t);
  const out: MoneyPoint[] = [];
  for (const t of [...ticks].sort((a, b) => a - b)) {
    if (steps.has(t)) out.push({ t, v: l.start + incomeUpTo(l, t) + stepsUpTo(l, t, true) });
    out.push({ t, v: balanceAt(l, t) });
  }
  return out;
}

/** "$120", "−$12" (whole units, rounded down). */
export function formatMoney(v: number): string {
  const n = Math.floor(v + 1e-9);
  return n < 0 ? str('money.debt', { n: -n }) : str('money.amount', { n });
}
