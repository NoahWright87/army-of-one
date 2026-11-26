/**
 * The role card (the model is `role-card-model.ts`). One persistent DOM tree: every row, bar and
 * text slot is always in the same place, and `show()` only changes values, so tapping from role
 * to role slides the bars to their new values (CSS transition). Text comes from strings.ts.
 */
import { roleDef } from '../../content/roles';
import { str, type StringKey } from '../../content/strings';
import type { Tuning } from '../../content/tuning';
import type { RoleId } from '../../contracts/mission';
import { el } from '../dom';
import { roleCard, type RoleCard } from './role-card-model';

const pct = (n: number): string => `${(Math.max(0, Math.min(1, n)) * 100).toFixed(1)}%`;
const num = (n: number): string => String(Math.round(n * 10) / 10);

// Glyphs drawn inside the bars (white with a dark edge so they read on any fill).
const SHIELD =
  '<svg class="gl" viewBox="0 0 10 12" aria-hidden="true"><path d="M5 .6 9.4 2.1v3.8c0 2.9-2.3 4.7-4.4 5.5C2.9 10.6.6 8.8.6 5.9V2.1Z" fill="#fff"/></svg>';
const CHEVRON =
  '<svg class="gl" viewBox="0 0 6 10" aria-hidden="true"><path d="M1 1l4 4-4 4" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const BURST = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? 6 : 2.8;
    const a = (i / 16) * Math.PI * 2;
    pts.push(`${(6 + r * Math.cos(a)).toFixed(2)},${(6 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `<svg class="gl" viewBox="0 0 12 12" aria-hidden="true"><polygon points="${pts.join(' ')}" fill="#fff"/></svg>`;
})();

type Stat = 'surv' | 'leth' | 'range' | 'acc' | 'mob';
const ROWS: { id: Stat; label: StringKey }[] = [
  { id: 'surv', label: 'role.card.surv' },
  { id: 'leth', label: 'role.card.leth' },
  { id: 'range', label: 'role.card.range' },
  { id: 'acc', label: 'role.card.acc' },
  { id: 'mob', label: 'role.card.mob' },
];

interface Slots {
  a: HTMLElement;
  b: HTMLElement;
  left: HTMLElement;
  right: HTMLElement;
  btn: HTMLButtonElement;
}

export interface RoleCardEl {
  root: HTMLElement;
  /** Fills the card for `roleId`; `price` is shown top right. */
  show(tuning: Tuning, roleId: RoleId, price: string | undefined): void;
}

function setSpan(i: HTMLElement, left: number, width: number): void {
  i.style.left = pct(left);
  i.style.width = pct(width);
}

function details(c: RoleCard): Record<Stat, string> {
  const s = c.survivability;
  const l = c.lethality;
  const d = l.detail;
  const key = `role.card.leth.${d.kind === 'antiVehicle' ? 'anti' : d.kind}` as StringKey;
  const shield = roleDef(c.roleId).weapon === 'pistol' ? ` ${str('role.card.surv.shield')}` : '';
  return {
    surv:
      str('role.card.surv.detail', {
        hp: s.hp,
        armor: Math.round(s.armor * 100),
        regen: s.regenPerSecond
          ? str('role.card.regen.per', { n: num(s.regenPerSecond) })
          : str('role.card.regen.none'),
      }) + shield,
    leth: str(key, {
      low: Math.round(d.low),
      high: Math.round(d.high),
      every: num(d.every),
    }),
    range:
      l.range.min > 0
        ? str('role.card.range.detail', { min: l.range.min, max: l.range.max })
        : str('role.card.range.upTo', { max: l.range.max }),
    acc: str('role.card.acc.detail', { stand: l.spreadStandDeg, move: l.spreadMoveDeg }),
    mob: c.vehicle
      ? str('role.card.mob.vehicle', {
          walk: c.mobility.walk,
          turn: Math.round(((c.mobility.turnRate ?? 0) * 180) / Math.PI),
        })
      : str('role.card.mob.detail', { walk: c.mobility.walk, sprint: c.mobility.sprint }),
  };
}

export function createRoleCard(): RoleCardEl {
  const root = el('div', 'rs-card');
  const head = el('div', 'h');
  const name = el('b');
  const price = el('span', 'p');
  head.append(name, price);
  const blurb = el('div', 'blurb');
  root.append(head, blurb);

  const slots = {} as Record<Stat, Slots>;
  for (const r of ROWS) {
    const btn = el('button', `rs-stat r-${r.id}`);
    btn.type = 'button';
    btn.dataset['stat'] = r.id;
    const label = el('span', 'l', str(r.label));
    const meter = el('span', 'meter');
    const a = el('i', 'f a');
    const b = el('i', 'f b');
    const left = el('span', 'gl-l');
    const right = el('span', 'gl-r');
    meter.append(a, b, left, right);
    btn.append(label, meter);
    slots[r.id] = { a, b, left, right, btn };
    root.append(btn);
  }
  const detail = el('div', 'rs-stat-d');
  root.append(detail);

  let open: Stat | null = null;
  let texts: Record<Stat, string> | null = null;
  const paintDetail = (): void => {
    for (const r of ROWS) slots[r.id].btn.classList.toggle('open', open === r.id);
    const t = open && texts ? texts[open] : str('role.card.tapHint');
    detail.textContent = t;
    detail.classList.toggle('hint', !open);
  };
  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-stat]');
    if (!b) return;
    const id = b.dataset['stat'] as Stat;
    open = open === id ? null : id;
    paintDetail();
  });

  const show = (tuning: Tuning, roleId: RoleId, cost: string | undefined): void => {
    const c = roleCard(tuning, roleId);
    const def = roleDef(roleId);
    name.textContent = str(def.nameKey);
    price.textContent = cost ?? '';
    blurb.textContent = str(def.blurbKey);

    const sv = c.survivability;
    setSpan(slots.surv.a, 0, sv.hpShare);
    setSpan(slots.surv.b, 0, 0);
    slots.surv.left.innerHTML = SHIELD.repeat(sv.shields);
    slots.surv.right.innerHTML = CHEVRON.repeat(sv.regenArrows);

    const l = c.lethality;
    setSpan(slots.leth.a, 0, l.dpsShare.min);
    setSpan(slots.leth.b, l.dpsShare.min, l.dpsShare.max - l.dpsShare.min);
    slots.leth.right.innerHTML = l.explosive ? BURST : '';

    setSpan(slots.range.a, l.rangeShare.min, Math.max(0.03, l.rangeShare.max - l.rangeShare.min));
    setSpan(slots.range.b, 0, 0);

    setSpan(slots.acc.a, 0, l.accuracyShare);
    setSpan(slots.acc.b, 0, 0);

    setSpan(slots.mob.a, 0, c.mobility.sprintShare);
    setSpan(slots.mob.b, 0, c.mobility.walkShare);

    texts = details(c);
    paintDetail();
  };
  paintDetail();
  return { root, show };
}

/** Styles for the card (shared by the respawn screen and the in-world respawn). */
export const ROLE_CARD_CSS = `
.rs-card { margin-top: 8px; padding: 8px 10px; background: #1a2128; border: 1px solid #3a444e; border-radius: 6px; font: 12px/1.3 system-ui, sans-serif; }
.rs-card .h { display: flex; justify-content: space-between; font-size: 14px; color: #ffe07a; min-height: 18px; }
.rs-card .h .p { color: #9ee59a; font-weight: 600; }
.rs-card .blurb { color: #c9d3dc; margin: 2px 0 6px; min-height: 2.6em; }
.rs-stat { display: flex; align-items: center; gap: 8px; width: 100%; padding: 3px 0; background: none; border: 0; color: #c9d3dc; cursor: pointer; font: inherit; text-align: left; }
.rs-stat .l { flex: 0 0 96px; font-size: 11px; white-space: nowrap; }
.rs-stat.open .l { color: #ffe07a; }
.rs-stat .meter { position: relative; flex: 1; height: 14px; background: #0f1418; border: 1px solid #2c3640; border-radius: 3px; overflow: hidden; }
.rs-stat .meter .f { position: absolute; top: 0; bottom: 0; left: 0; width: 0; transition: left .3s ease, width .3s ease; }
.rs-stat.open .meter { border-color: #6f7b88; }
.r-surv .f.a { background: #5fcf86; }
.r-leth .f.a { background: #ff9d57; }
.r-leth .f.b { background: repeating-linear-gradient(135deg, #ff9d57 0 3px, #a9591f 3px 6px); }
.r-range .f.a { background: #6fb4ff; }
.r-acc .f.a { background: #ffd34d; }
.r-mob .f.a { background: #3f7058; }
.r-mob .f.b { background: #5fcf86; }
.rs-stat .gl-l, .rs-stat .gl-r { position: absolute; top: 0; bottom: 0; display: flex; align-items: center; gap: 1px; padding: 0 2px; pointer-events: none; }
.rs-stat .gl-l { left: 0; }
.rs-stat .gl-r { right: 0; }
.rs-stat .gl { height: 10px; width: auto; filter: drop-shadow(0 0 1px #000) drop-shadow(0 0 1px #000); }
.rs-stat-d { margin-top: 4px; min-height: 2.6em; color: #c9d3dc; }
.rs-stat-d.hint { color: #6f7b88; }
@media (prefers-reduced-motion: reduce) { .rs-stat .meter .f { transition: none; } }
`;
