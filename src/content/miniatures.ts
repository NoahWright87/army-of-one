/**
 * Miniature-art spec ([D116]–[D121]): the one source of truth for the collectible-miniature
 * look. Every soldier/vehicle is drawn as LAYERS: a shadow, a metal base (gold/silver, polished or
 * tarnished) and a painted figure that rotates on top of it to aim.
 *
 * Plain data + tiny pure helpers only (imported by the headless art checker in
 * `tools/check-miniatures.ts`, and by the renderer once PHASE16 wires the layers in).
 * The human-readable brief is `docs/art/`; keep this file and those docs in step.
 *
 * Conventions that EVERY image obeys (the "hard rules"; see docs/art/README.md):
 *  - Strictly top-down, orthographic (a camera looking straight down). Never 3/4, never side.
 *  - Must survive being rotated to ANY angle: no directional light, no cast shadow baked in.
 *  - Facing / forward is +x (to the right). The canvas CENTER is the pivot.
 *  - PNG, 8-bit RGBA, transparent background, no text/numbers/watermarks.
 */
import type { RoleId } from '../contracts/mission';

/** Base footprint classes. Chosen per role by `BASE_SHAPE_BY_ROLE`. */
export type BaseShape = 'round' | 'octagon' | 'square' | 'truck' | 'tank';

/**
 * Metal finishes of a base. `gold` = the player's live soldier; `gold-tarnished` = echoes (past
 * lives); `silver` = enemies; `silver-tarnished` = RESERVED (multiplayer / other players' echoes,
 * not used by the game yet, but drawn now so the set is complete).
 */
export type Colorway = 'gold' | 'silver' | 'gold-tarnished' | 'silver-tarnished';

/** Paint scheme of a figure. Same sculpt, different paint. */
export type Faction = 'ally' | 'enemy';

export const BASE_SHAPES: readonly BaseShape[] = ['round', 'octagon', 'square', 'truck', 'tank'];
export const COLORWAYS: readonly Colorway[] = [
  'gold',
  'silver',
  'gold-tarnished',
  'silver-tarnished',
];
export const FACTIONS: readonly Faction[] = ['ally', 'enemy'];

/** What each finish means in game (for the artist; the renderer picks them by soldier state). */
export const COLORWAY_USE: Record<Colorway, string> = {
  gold: 'The soldier the player is controlling right now. Bright, polished, glossy: the shiniest thing on the table.',
  silver: 'Enemy soldiers and vehicles. Polished silver / chrome, cool and clean.',
  'gold-tarnished':
    'Echoes: past lives replaying. The SAME gold, but dull, dark, aged and matte, with a hint of greenish-brown patina in the crevices. Must be obviously "the old gold" next to the polished one, even at 32 px.',
  'silver-tarnished':
    'Reserved for multiplayer / other players. Dull, blackened, aged silver. Not used by the game yet.',
};

/** Which paint scheme a base finish goes with. */
export const FACTION_OF_COLORWAY: Record<Colorway, Faction> = {
  gold: 'ally',
  'gold-tarnished': 'ally',
  silver: 'enemy',
  'silver-tarnished': 'enemy',
};

export interface Size {
  w: number;
  h: number;
}

export interface BaseSpec {
  /** Canvas (file) size in px. Pivot = canvas center. */
  canvas: Size;
  /** The metal part's bounding box in px (what must be filled; the rest is transparent margin). */
  footprint: Size;
  /**
   * `fitPx` for the manifest: the px extent the renderer maps onto the soldier's logical size
   * (infantry: 2 × `tuning.soldier.spriteRadius` = 32 world units; vehicles: 2 × `bodyRadius`
   * along the long axis). Figures of the same unit use the SAME canvas and `fitPx`.
   */
  fitPx: number;
  /** What it looks like. */
  look: string;
}

/** About 3 art px per world unit, everywhere, so every layer shares one scale. */
export const ART_PX_PER_UNIT = 3.1;

export const BASES: Record<BaseShape, BaseSpec> = {
  round: {
    canvas: { w: 128, h: 128 },
    footprint: { w: 100, h: 100 },
    fitPx: 100,
    look: 'Circular display base, 100 px across. The standard, light-infantry base.',
  },
  octagon: {
    canvas: { w: 128, h: 128 },
    footprint: { w: 96, h: 96 },
    fitPx: 100,
    look:
      'Regular octagon with FLAT sides facing up/down/left/right, 96 px across the flats (corners ' +
      'reach about 104 px). Angular and heavy-looking: chunkier bevel, thicker rim. For armored infantry.',
  },
  square: {
    canvas: { w: 128, h: 128 },
    footprint: { w: 82, h: 82 },
    fitPx: 100,
    look:
      'Rounded square, 82 px per side with 20 px corner radius (so its corners reach about the ' +
      'same 100 px circle as the others). Blocky and stable. For heavy-weapon infantry.',
  },
  truck: {
    canvas: { w: 192, h: 128 },
    footprint: { w: 160, h: 96 },
    fitPx: 160,
    look:
      'Long rounded rectangle (160 × 96, 20 px corner radius), long axis along x. Reads as a ' +
      'vehicle plinth. Rotates with the vehicle heading.',
  },
  tank: {
    canvas: { w: 256, h: 192 },
    footprint: { w: 200, h: 152 },
    fitPx: 200,
    look:
      'Large rectangle with chamfered (cut) corners (200 × 152, 28 px chamfer), long axis along ' +
      'x. The biggest, heaviest base. Rotates with the vehicle heading.',
  },
};

/**
 * Which base each role stands on. Light infantry round; armored infantry angular (octagon);
 * heavy weapons square; vehicles their own long plinths. PROPOSAL, see [Q59]: change a role's
 * shape here and the art needs no changes (every infantry shape is drawn in every finish).
 */
export const BASE_SHAPE_BY_ROLE: Record<RoleId, BaseShape> = {
  rifleman: 'round',
  grenadier: 'round',
  sniper: 'round',
  gunner: 'square',
  bazooka: 'square',
  shield: 'octagon',
  shotgun: 'octagon',
  truck: 'truck',
  tank: 'tank',
};

export const INFANTRY_ROLES: readonly RoleId[] = [
  'rifleman',
  'grenadier',
  'gunner',
  'sniper',
  'shield',
  'shotgun',
  'bazooka',
];

export type MiniKind = 'base' | 'figure' | 'hull' | 'turret' | 'fallen' | 'wreck' | 'shadow';

export interface MiniFile {
  /** Manifest key (code refers to art by key only). */
  key: string;
  /** Path relative to `assets/miniatures/`. */
  file: string;
  kind: MiniKind;
  canvas: Size;
  fitPx: number;
  /** 1 = pilot (deliver and get reviewed first), 2 = rest of the infantry, 3 = vehicles. */
  priority: 1 | 2 | 3;
  /** Role (figure/hull/turret) or shape (base). */
  subject: string;
  colorway?: Colorway;
  faction?: Faction;
  /** What to draw (a one-line brief; the long version is docs/art/PIECE-SPEC.md). */
  brief: string;
}

/** `base_round_gold-tarnished` → `mini_base_round_gold_tarnished`. */
export function miniKey(stem: string): string {
  return `mini_${stem.replace(/-/g, '_')}`;
}

/** Roles drawn in the first (pilot) delivery: three silhouettes that stress the system. */
const PILOT_ROLES: readonly RoleId[] = ['rifleman', 'shield', 'sniper'];
const PILOT_SHAPES: readonly BaseShape[] = ['round', 'octagon'];

const FIGURE_BRIEF: Record<RoleId, string> = {
  rifleman:
    'Standard rifleman: steel helmet, rifle held forward in both hands, small pack on the back.',
  grenadier:
    'Grenadier: helmet, grenade bandolier / pouches, one arm cocked holding a grenade forward, no rifle.',
  gunner:
    'Machine gunner: helmet, light machine gun with bipod legs folded out forward and an ammo belt / box on one side.',
  sniper:
    'Sniper: slimmer body, soft hat or netted helmet, a LONG scoped rifle reaching far forward (the longest gun of the infantry).',
  shield:
    'Shield bearer: low helmet tucked behind a big curved ballistic shield that spans the whole front arc (about 135°), sidearm hand visible.',
  shotgun:
    'Shotgunner: bulkier padded shoulders, helmet, short heavy pump shotgun forward, shell bandolier across the chest.',
  bazooka:
    'Bazooka gunner: helmet, long rocket tube resting on the shoulder, sticking out BOTH in front of and behind the body (the only figure with a symmetrical front/back silhouette).',
  truck:
    'Gun truck hull: military cargo truck seen from straight above, cab toward +x, open bed behind with a ring mount hole (the gun is a separate layer), tires just visible at the edges.',
  tank: 'Tank hull seen from straight above: wide tracks either side, engine deck at the back, turret ring (empty circle) in the middle (the turret is a separate layer), front glacis toward +x.',
};

/** Every miniature image the game will want, in delivery order. */
export function miniatureFiles(): MiniFile[] {
  const out: MiniFile[] = [];
  const dim = (shape: BaseShape) => BASES[shape];

  for (const shape of BASE_SHAPES) {
    const spec = dim(shape);
    const priority =
      shape === 'truck' || shape === 'tank' ? 3 : PILOT_SHAPES.includes(shape) ? 1 : 2;
    for (const colorway of COLORWAYS) {
      const stem = `base_${shape}_${colorway}`;
      out.push({
        key: miniKey(stem),
        file: `${stem}.png`,
        kind: 'base',
        canvas: spec.canvas,
        fitPx: spec.fitPx,
        priority,
        subject: shape,
        colorway,
        brief: `${spec.look} Finish: ${colorway}. ${COLORWAY_USE[colorway]}`,
      });
    }
  }

  for (const role of INFANTRY_ROLES) {
    const spec = BASES[BASE_SHAPE_BY_ROLE[role]];
    for (const faction of FACTIONS) {
      const stem = `figure_${role}_${faction}`;
      out.push({
        key: miniKey(stem),
        file: `${stem}.png`,
        kind: 'figure',
        canvas: spec.canvas,
        fitPx: spec.fitPx,
        priority: PILOT_ROLES.includes(role) ? 1 : 2,
        subject: role,
        faction,
        brief: FIGURE_BRIEF[role],
      });
    }
  }
  for (const faction of FACTIONS) {
    const stem = `figure_fallen_${faction}`;
    out.push({
      key: miniKey(stem),
      file: `${stem}.png`,
      kind: 'fallen',
      canvas: BASES.round.canvas,
      fitPx: BASES.round.fitPx,
      priority: 1,
      subject: 'fallen',
      faction,
      brief:
        'The same kind of miniature knocked over: lying on its side/back on the base, helmet and weapon visible, ' +
        'darker and lower contrast than a standing figure so it reads as background.',
    });
  }

  for (const role of ['truck', 'tank'] as const) {
    const spec = BASES[role];
    for (const faction of FACTIONS) {
      const hull = `hull_${role}_${faction}`;
      out.push({
        key: miniKey(hull),
        file: `${hull}.png`,
        kind: 'hull',
        canvas: spec.canvas,
        fitPx: spec.fitPx,
        priority: 3,
        subject: role,
        faction,
        brief: FIGURE_BRIEF[role],
      });
      const turret = `turret_${role}_${faction}`;
      out.push({
        key: miniKey(turret),
        file: `${turret}.png`,
        kind: 'turret',
        // The turret spins about its own center, so its canvas is square and roomy.
        canvas: role === 'truck' ? { w: 128, h: 128 } : { w: 192, h: 192 },
        fitPx: spec.fitPx,
        priority: 3,
        subject: role,
        faction,
        brief:
          role === 'truck'
            ? 'Ring-mounted machine gun for the truck bed, barrel pointing +x from the center pivot, gunner shield plate in front.'
            : 'Tank turret seen from straight above, round hatch near the center pivot, long cannon pointing +x (barrel tip within 4 px of the canvas edge).',
      });
    }
    const wreck = `wreck_${role}`;
    out.push({
      key: miniKey(wreck),
      file: `${wreck}.png`,
      kind: 'wreck',
      canvas: spec.canvas,
      fitPx: spec.fitPx,
      priority: 3,
      subject: role,
      brief:
        'Burnt, blown-open wreck of the hull above (no turret), charred black with scorch marks. Faction-neutral.',
    });
  }

  const shadows: { stem: string; canvas: Size }[] = [
    { stem: 'shadow_infantry', canvas: { w: 160, h: 160 } },
    { stem: 'shadow_truck', canvas: { w: 224, h: 160 } },
    { stem: 'shadow_tank', canvas: { w: 288, h: 224 } },
  ];
  for (const s of shadows) {
    out.push({
      key: miniKey(s.stem),
      file: `${s.stem}.png`,
      kind: 'shadow',
      canvas: s.canvas,
      fitPx: s.canvas.w,
      priority: s.stem === 'shadow_infantry' ? 1 : 3,
      subject: s.stem,
      brief:
        'GENERATED, not painted: a soft, radially symmetric dark blob (centered, black, alpha fading to 0 at the edge) ' +
        'that the renderer offsets in screen space. Write a script; do not use an image model.',
    });
  }
  return out;
}
