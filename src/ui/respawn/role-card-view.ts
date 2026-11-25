/** The role card's markup (the model is `role-card-model.ts`). Text comes from strings.ts. */
import { roleDef } from '../../content/roles';
import { str, type StringKey } from '../../content/strings';
import type { Tuning } from '../../content/tuning';
import type { RoleId } from '../../contracts/mission';
import { roleCard, type RoleCard } from './role-card-model';

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
const pct = (n: number): string => `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;
const num = (n: number): string => String(Math.round(n * 10) / 10);

function row(
  id: string,
  label: string,
  body: string,
  detail: string | null,
  open: boolean,
): string {
  return (
    `<button type="button" class="rs-stat${open ? ' open' : ''}" data-stat="${id}">` +
    `<span class="l">${esc(label)}</span><span class="b">${body}</span></button>` +
    (open && detail ? `<div class="rs-stat-d">${esc(detail)}</div>` : '')
  );
}

function survivability(c: RoleCard): string {
  const s = c.survivability;
  const shields = s.shields ? `<span class="sh">${'🛡️'.repeat(s.shields)}</span>` : '';
  const arrows = s.regenArrows ? `<span class="rg">${'›'.repeat(s.regenArrows)}</span>` : '';
  return shields + `<span class="meter"><i style="width:${pct(s.hpShare)}"></i></span>` + arrows;
}

function lethality(c: RoleCard): string {
  const l = c.lethality;
  const marks =
    `<span class="acc" title="${esc(str('role.card.accuracy'))}">${'◎'.repeat(l.accuracy)}</span>` +
    (l.explosive ? `<span class="boom" title="${esc(str('role.card.explodes'))}">💥</span>` : '');
  return (
    `<span class="meter"><i class="lo" style="width:${pct(l.dpsShare.min)}"></i>` +
    `<i class="hi" style="left:${pct(l.dpsShare.min)};width:${pct(l.dpsShare.max - l.dpsShare.min)}"></i></span>` +
    marks +
    `<span class="meter range"><i style="left:${pct(l.rangeShare.min)};width:${pct(
      Math.max(0.02, l.rangeShare.max - l.rangeShare.min),
    )}"></i></span>`
  );
}

function mobility(c: RoleCard): string {
  const m = c.mobility;
  return (
    `<span class="meter"><i class="sp" style="width:${pct(m.sprintShare)}"></i>` +
    `<i style="width:${pct(m.walkShare)}"></i></span>`
  );
}

function details(c: RoleCard): { surv: string; leth: string; mob: string } {
  const s = c.survivability;
  const l = c.lethality;
  const key =
    `role.card.leth.${l.detail.kind === 'antiVehicle' ? 'anti' : l.detail.kind}` as StringKey;
  const d = l.detail;
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
      min: l.range.min,
      max: l.range.max,
    }),
    mob: c.vehicle
      ? str('role.card.mob.vehicle', {
          walk: c.mobility.walk,
          turn: Math.round(((c.mobility.turnRate ?? 0) * 180) / Math.PI),
        })
      : str('role.card.mob.detail', { walk: c.mobility.walk, sprint: c.mobility.sprint }),
  };
}

/** The selected role's card: name, price, one-line job, three stat rows (tap for numbers). */
export function roleCardHtml(
  tuning: Tuning,
  roleId: RoleId,
  price: string | undefined,
  openStat: string | null,
): string {
  const def = roleDef(roleId);
  const c = roleCard(tuning, roleId);
  const d = details(c);
  const how =
    roleId === 'gunner' || roleId === 'sniper'
      ? `<div class="how">${esc(str(`role.card.how.${roleId}` as StringKey))}</div>`
      : '';
  return (
    `<div class="rs-card" data-vehicle="${c.vehicle ? 1 : 0}">` +
    `<div class="h"><b>${esc(str(def.nameKey))}</b>${price ? `<span class="p">${esc(price)}</span>` : ''}</div>` +
    `<div class="blurb">${esc(str(def.blurbKey))}</div>${how}` +
    row('surv', str('role.card.surv'), survivability(c), d.surv, openStat === 'surv') +
    row('leth', str('role.card.leth'), lethality(c), d.leth, openStat === 'leth') +
    row('mob', str('role.card.mob'), mobility(c), d.mob, openStat === 'mob') +
    `<div class="hint">${esc(str('role.card.tapHint'))}</div></div>`
  );
}

/** Styles for the card (shared by the respawn screen and the in-world respawn). */
export const ROLE_CARD_CSS = `
/* Role card (below the role grid). */
.rs-card { margin-top: 8px; padding: 8px 10px; background: #1a2128; border: 1px solid #3a444e; border-radius: 6px; font: 12px system-ui, sans-serif; }
.rs-card .h { display: flex; justify-content: space-between; font-size: 14px; color: #ffe07a; }
.rs-card .h .p { color: #9ee59a; font-weight: 600; }
.rs-card .blurb { color: #c9d3dc; margin: 2px 0 6px; }
.rs-card .how { color: #ffd34d; margin: -2px 0 6px; }
.rs-stat { display: flex; align-items: center; gap: 8px; width: 100%; padding: 4px 0; background: none; border: 0; color: #c9d3dc; cursor: pointer; font: inherit; text-align: left; }
.rs-stat .l { flex: 0 0 84px; }
.rs-stat .b { flex: 1; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; min-width: 0; }
.rs-stat.open .l { color: #ffe07a; }
.rs-stat .meter { position: relative; flex: 1 1 60px; height: 10px; background: #0f1418; border: 1px solid #2c3640; border-radius: 3px; overflow: hidden; }
.rs-stat .meter i { position: absolute; left: 0; top: 0; bottom: 0; background: #8ff0ad; }
.rs-stat .meter i.hi { background: #ff9d57; }
.rs-stat .meter i.sp { background: #4f7f66; }
.rs-stat .meter.range { flex-basis: 100%; height: 5px; }
.rs-stat .meter.range i { background: #6fb4ff; }
.rs-stat .sh { font-size: 11px; letter-spacing: -1px; }
.rs-stat .rg { color: #8ff0ad; font-weight: 800; letter-spacing: -1px; }
.rs-stat .acc { color: #9fb0bf; font-size: 11px; }
.rs-stat-d { margin: 0 0 4px 0; color: #9fb0bf; line-height: 1.3; }
.rs-card .hint { margin-top: 4px; color: #6f7b88; font-size: 10px; }
`;
