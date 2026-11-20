import type { ImageKey } from '../content/assets';
import type { RoleId } from '../contracts/mission';
import type { SoldierRole } from '../sim/view';
/** Pure layer selection; hull heading and turret aim are applied independently by the renderer. */
export function vehicleMiniature(
  role: RoleId | undefined,
  state: SoldierRole,
  alive: boolean,
): { hull: ImageKey; base: ImageKey; turret: ImageKey | null; shadow: ImageKey } | null {
  if (role !== 'truck' && role !== 'tank') return null;
  const faction = state === 'enemy' ? 'enemy' : 'ally';
  const finish =
    state === 'enemy' ? 'silver' : state === 'live' && alive ? 'gold' : 'gold_tarnished';
  return {
    hull: `mini_${alive ? 'hull_' + role + '_' + faction : 'wreck_' + role}` as ImageKey,
    base: `mini_base_${role}_${finish}` as ImageKey,
    turret: alive ? (`mini_turret_${role}_${faction}` as ImageKey) : null,
    shadow: `mini_shadow_${role}` as ImageKey,
  };
}
