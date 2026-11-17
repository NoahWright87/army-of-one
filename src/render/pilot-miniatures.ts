/** Delivered pilot only. Unsupported roles retain the original renderer. */
import { CORPSE_OFFSET_RADII } from '../content/miniatures';
import type { ImageKey } from '../content/assets';
import type { RoleId } from '../contracts/mission';
import type { SoldierRole } from '../sim/view';

export interface MiniaturePiece {
  base: ImageKey | null;
  figure: ImageKey;
}

function pieces(
  shape: 'round' | 'octagon',
  ally: ImageKey,
  enemy: ImageKey,
): Record<'live' | 'echo' | 'enemy' | 'fallenLive' | 'fallenAlly' | 'fallenEnemy', MiniaturePiece> {
  const gold = `mini_base_${shape}_gold` as const;
  const tarnished = `mini_base_${shape}_gold_tarnished` as const;
  const silver = `mini_base_${shape}_silver` as const;
  return {
    live: { base: gold, figure: ally },
    echo: { base: tarnished, figure: ally },
    enemy: { base: silver, figure: enemy },
    fallenLive: { base: null, figure: 'mini_figure_fallen_ally' },
    fallenAlly: { base: null, figure: 'mini_figure_fallen_ally' },
    fallenEnemy: { base: null, figure: 'mini_figure_fallen_enemy' },
  };
}

const PILOT: Partial<Record<RoleId, ReturnType<typeof pieces>>> = {
  rifleman: pieces('round', 'mini_figure_rifleman_ally', 'mini_figure_rifleman_enemy'),
  sniper: pieces('round', 'mini_figure_sniper_ally', 'mini_figure_sniper_enemy'),
  shield: pieces('octagon', 'mini_figure_shield_ally', 'mini_figure_shield_enemy'),
};

/** Cached layer choices: no allocations in the render loop. */
export function pilotMiniature(
  roleId: RoleId = 'rifleman',
  role: SoldierRole = 'live',
  alive = true,
): MiniaturePiece | null {
  const set = PILOT[roleId];
  if (!set) {
    if (alive || roleId === 'truck' || roleId === 'tank') return null;
    return role === 'enemy' ? PILOT.rifleman!.fallenEnemy : PILOT.rifleman!.fallenAlly;
  }
  if (!alive)
    return role === 'enemy' ? set.fallenEnemy : role === 'live' ? set.fallenLive : set.fallenAlly;
  return role === 'live' ? set.live : role === 'enemy' ? set.enemy : set.echo;
}

/** Head points along +x in fallen art. Keep this displacement out of sim collision geometry. */
export function corpsePose(x: number, y: number, direction: number, radius: number) {
  return {
    x: x + Math.cos(direction) * radius * CORPSE_OFFSET_RADII,
    y: y + Math.sin(direction) * radius * CORPSE_OFFSET_RADII,
    facing: direction,
  };
}
