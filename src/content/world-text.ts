/**
 * In-world text: speech over soldiers and signposts. Render-side numbers (not sim tuning, so they
 * stay out of the sim's settings panel); the text lab (`?scene=textlab`) edits a live copy.
 *
 * Sizes are SCREEN pixels: world text stays the same size at any camera zoom.
 * Plain data only.
 */

export interface SpeechTuning {
  /** Font family list for speech. */
  font: string;
  fontPx: number; // TUNE
  /** Dark outline around every letter: the contrast that keeps it readable on any ground. */
  strokePx: number; // TUNE
  /** Soft drop shadow under the outline (px offset, 0 = off). */
  shadowPx: number; // TUNE
  /** Wrap width before a line breaks. */
  maxWidthPx: number; // TUNE
  /** Extra space between letters (px), so shaking letters don't collide. */
  letterSpacingPx: number; // TUNE
  /** Gap between the soldier's head and the bottom of the text. */
  headGapPx: number; // TUNE
  /** Lines with this many words or fewer appear all at once unless the markup says otherwise. */
  autoAllWords: number; // TUNE
  /** Word-by-word pacing: base gap after each word, plus per letter of that word. */
  wordMs: number; // TUNE
  wordPerCharMs: number; // TUNE
  /** Letter-by-letter pacing. */
  letterMs: number; // TUNE
  /** Default `[p]` pause. */
  pauseMs: number; // TUNE
  /** How long a letter takes to fly out of the soldier into its place. */
  popMs: number; // TUNE
  /** Shown time after the last word lands: base + per letter of the whole line. */
  holdMs: number; // TUNE
  holdPerCharMs: number; // TUNE
  /** Fade-out time; the text drifts up this many px while fading. */
  fadeMs: number; // TUNE
  fadeRisePx: number; // TUNE
  /** Echoes' lines are drawn this much fainter (echoes are ghosts of earlier lives). */
  echoAlpha: number; // TUNE
  /** Size multipliers for `[big]` / `[small]`. */
  bigScale: number; // TUNE
  smallScale: number; // TUNE
}

export interface SignTuning {
  font: string;
  fontPx: number; // TUNE
  /** Stand this close (world units) for the read ring to start filling. */
  readRadius: number; // TUNE
  /** Walk further than this (world units) and the sign closes. */
  closeRadius: number; // TUNE
  /** Time to fill the read ring. */
  readMs: number; // TUNE
  /** The frame grows out of the post / shrinks back into it. */
  openMs: number; // TUNE
  closeMs: number; // TUNE
  /** The open frame floats this far (screen px) above the post. */
  hoverPx: number; // TUNE
  /** Text wraps at this width inside the frame. */
  maxWidthPx: number; // TUNE
  /** Firing closes an open sign (and resets a filling ring). */
  closeOnFire: boolean;
}

export interface BarkTuning {
  /** Master switch for soldiers' chatter (the lab and F2 can turn it off). */
  enabled: boolean;
  /** Most lines on screen at once in a fight / when it's calm. */
  maxHot: number; // TUNE
  maxCalm: number; // TUNE
  /** A soldier says nothing again for this long. */
  speakerCooldownMs: number; // TUNE
  /** The same kind of line (say "ally down") isn't repeated by anyone for this long. */
  categoryCooldownMs: number; // TUNE
  /** It's a fight if shots or blasts happened within this radius of the player recently… */
  hotRadius: number; // TUNE
  /** …within this long. */
  hotMs: number; // TUNE
  /** In a fight, flavour lines only from soldiers at least this far from the player… */
  peripheryRadius: number; // TUNE
  /** …and this far from where the player is aiming. */
  aimClearRadius: number; // TUNE
  /** Who hears what: reactions come from soldiers within this distance of what happened. */
  hearRadius: number; // TUNE
  /** "I'm pinned down": this many near misses / hits within `pinnedMs`. */
  pinnedHits: number; // TUNE
  pinnedMs: number; // TUNE
  /** Chance (0..1) a flavour reaction is said at all, so it doesn't get repetitive. */
  flavourChance: number; // TUNE
  /** A grenade lands this close: "INCOMING!". */
  grenadeWarnRadius: number; // TUNE
}

export interface WorldTextTuning {
  speech: SpeechTuning;
  sign: SignTuning;
  barks: BarkTuning;
}

/** PLACEHOLDER fonts: the lab offers others. Loaded from Google Fonts by the renderer. */
export const SPEECH_FONTS = [
  { id: 'Bangers', label: 'Bangers (comic shout)' },
  { id: 'Black Ops One', label: 'Black Ops One (stencil)' },
  { id: 'Russo One', label: 'Russo One (blocky)' },
  { id: 'Oswald', label: 'Oswald (condensed)' },
  { id: 'Arial Black', label: 'System bold' },
] as const;

export const DEFAULT_WORLD_TEXT: WorldTextTuning = {
  speech: {
    font: 'Bangers',
    fontPx: 20,
    strokePx: 5,
    shadowPx: 2,
    maxWidthPx: 220,
    letterSpacingPx: 1.5,
    headGapPx: 18,
    autoAllWords: 3,
    wordMs: 110,
    wordPerCharMs: 18,
    letterMs: 28,
    pauseMs: 300,
    popMs: 170,
    holdMs: 900,
    holdPerCharMs: 45,
    fadeMs: 350,
    fadeRisePx: 14,
    echoAlpha: 0.75,
    bigScale: 1.45,
    smallScale: 0.75,
  },
  sign: {
    font: 'Black Ops One',
    fontPx: 17,
    readRadius: 46,
    closeRadius: 80,
    readMs: 450,
    openMs: 220,
    closeMs: 160,
    hoverPx: 56,
    maxWidthPx: 220,
    closeOnFire: true,
  },
  barks: {
    enabled: true,
    maxHot: 2,
    maxCalm: 6,
    speakerCooldownMs: 6000,
    categoryCooldownMs: 3500,
    hotRadius: 520,
    hotMs: 2500,
    peripheryRadius: 260,
    aimClearRadius: 160,
    hearRadius: 300,
    pinnedHits: 4,
    pinnedMs: 2000,
    flavourChance: 0.6,
    grenadeWarnRadius: 110,
  },
};

export function cloneWorldText(t: WorldTextTuning = DEFAULT_WORLD_TEXT): WorldTextTuning {
  return { speech: { ...t.speech }, sign: { ...t.sign }, barks: { ...t.barks } };
}
