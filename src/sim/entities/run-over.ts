/**
 * (PHASE12-b) Vehicles running into things ([D66]). After movement, every vehicle moving faster
 * than `drive.crushMinSpeed` hurts each soldier (ours too) its body touches:
 * `crushDamage × weight × speed`, through armor with 100 % pierce ('crush'), at most once per
 * `crushRepeatSeconds` per target. So a slow tank still crushes (it's heavy), and a truck has
 * to be going fast to do more than hurt. A vehicle hitting another vehicle hurts it the same
 * way and takes `ramSelfShare` of what the other's weight would deal back. Breakable cover it
 * pushes into is battered the same way ([Q40]).
 *
 * Speed is what the vehicle actually moved this tick, so echoes replaying a drive crush the
 * same way the live drive did.
 */
import { secondsToTicks } from '../core/time';
import { damageSoldier } from '../combat/damage';
import type { World } from '../state';
import { circleOverlapsRect } from '../world/collision';
import { damageCover, standingCover } from '../world/cover';
import { driveOf, hitRadiusOf, isEligible } from './soldier';

export function stepRunOver(world: World, prevX: Float64Array, prevY: Float64Array): void {
  const st = world.state;
  const t = world.tuning;
  const dt = t.drive;
  const repeat = Math.max(1, secondsToTicks(dt.crushRepeatSeconds));
  const n = Math.min(st.soldiers.length, prevX.length);
  for (let i = 0; i < n; i++) {
    const v = st.soldiers[i]!;
    const d = driveOf(t, v.roleId);
    if (!d || !v.drive || !isEligible(v)) continue;
    const speed = Math.hypot(v.x - prevX[i]!, v.y - prevY[i]!) * 60;
    // Pushing into cover: count the speed it's trying to go, so it can batter through.
    const pushing = Math.max(speed, Math.abs(v.drive.speed));
    const r = d.bodyRadius + 2;
    if (speed >= dt.crushMinSpeed) {
      for (const o of st.soldiers) {
        if (o === v || !isEligible(o)) continue;
        const reach = r + hitRadiusOf(t, o);
        if ((o.x - v.x) ** 2 + (o.y - v.y) ** 2 > reach * reach) continue;
        const last = v.drive.hits[o.id];
        if (last !== undefined && st.tick - last < repeat) continue;
        v.drive.hits[o.id] = st.tick;
        damageSoldier(world, o, dt.crushDamage * d.weight * speed, v.id, 'crush', v);
        const od = driveOf(t, o.roleId);
        if (od) {
          // Ramming another vehicle hurts the rammer too.
          const back = dt.crushDamage * od.weight * speed * dt.ramSelfShare;
          damageSoldier(world, v, back, o.id, 'crush', o);
        }
      }
    }
    if (pushing >= dt.crushMinSpeed) {
      for (const c of standingCover(world)) {
        if (c.hp <= 0 || !circleOverlapsRect(v, r, c.rect)) continue;
        const key = `cover:${c.id}`;
        const last = v.drive.hits[key];
        if (last !== undefined && st.tick - last < repeat) continue;
        v.drive.hits[key] = st.tick;
        damageCover(world, c.id, dt.crushDamage * d.weight * pushing, 'crush', v.id);
      }
    }
  }
}
