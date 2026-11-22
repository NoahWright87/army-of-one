/**
 * (PHASE19) Glues a run to the tape until the player takes control. Owner's model: before
 * control, everyone (you, echoes, enemies) is watching a replay of what happened; the sim takes
 * over exactly at the control tick. Re-simulating a stretch someone played live is never quite
 * the same (a live soldier and an enemy shove each other half and half; an echo replays pinned to
 * its path), so wherever the tape has a frame before control, the run is set to it: every
 * soldier's pose and HP, every objective's HP.
 */
import { quantizeFacing, quantizePosition } from '../../contracts/quantize';
import type { World } from '../state';
import type { WorldView } from '../view';

/** Sets `world` to what `frame` shows. Returns what had drifted (first difference), or null. */
export function alignToFrame(world: World, frame: WorldView): string | null {
  let first: string | null = null;
  const note = (what: string) => {
    first ??= what;
  };
  const byId = new Map(world.state.soldiers.map((s) => [s.id, s]));
  for (const v of frame.soldiers) {
    const s = byId.get(v.id);
    if (!s) continue;
    if (s.alive !== v.alive) {
      // Can't bring the dead back (or kill cleanly) here: report it, leave it.
      note(`${v.id} tape alive=${v.alive}, sim alive=${s.alive}`);
      continue;
    }
    if (!v.alive) continue;
    const d = Math.hypot(s.x - v.x, s.y - v.y);
    if (d > 0) {
      if (d > 0.5) note(`${v.id} ${d.toFixed(1)} px off`);
      s.x = quantizePosition(v.x);
      s.y = quantizePosition(v.y);
    }
    s.facing = quantizeFacing(v.facing);
    if (s.hp !== v.hp) {
      if (Math.abs(s.hp - v.hp) > 1e-6) note(`${v.id} hp ${s.hp.toFixed(1)} vs ${v.hp.toFixed(1)}`);
      s.hp = v.hp;
    }
  }
  world.state.objectives.forEach((o, i) => {
    const v = frame.objectives.find((x) => x.id === o.id) ?? frame.objectives[i];
    if (!v || o.destroyed || v.destroyed) return;
    if (o.hp !== v.hp) {
      note(`objective ${o.id} hp ${o.hp} vs ${v.hp}`);
      o.hp = v.hp;
    }
  });
  return first;
}
