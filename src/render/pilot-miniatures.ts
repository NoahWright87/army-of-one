/** Delivered pilot only. Unsupported roles retain the original renderer. */
import type { ImageKey } from '../content/assets';
import type { RoleId } from '../contracts/mission';
import type { SoldierRole } from '../sim/view';

export interface MiniaturePiece {
  base: ImageKey;
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
    fallenLive: { base: gold, figure: 'mini_figure_fallen_ally' },
    fallenAlly: { base: tarnished, figure: 'mini_figure_fallen_ally' },
    fallenEnemy: { base: silver, figure: 'mini_figure_fallen_enemy' },
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
  if (!set) return null;
  if (!alive)
    return role === 'enemy' ? set.fallenEnemy : role === 'live' ? set.fallenLive : set.fallenAlly;
  return role === 'live' ? set.live : role === 'enemy' ? set.enemy : set.echo;
}
