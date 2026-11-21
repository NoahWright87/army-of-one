/**
 * Loads the world-text fonts (PLACEHOLDER: Google Fonts, picked in the text lab). Text drawn
 * before a font arrives uses the fallback; speech is short-lived, so it catches up on its own.
 */
import { SPEECH_FONTS } from '../../content/world-text';

let requested = false;

export function loadWorldTextFonts(): void {
  if (requested || typeof document === 'undefined') return;
  requested = true;
  const families = SPEECH_FONTS.filter((f) => f.id !== 'Arial Black')
    .map((f) => `family=${f.id.replace(/ /g, '+')}${f.id === 'Oswald' ? ':wght@700' : ''}`)
    .join('&');
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
  document.head.appendChild(link);
  link.onload = () => {
    for (const f of SPEECH_FONTS) void document.fonts?.load(`20px "${f.id}"`).catch(() => {});
  };
}

/** A CSS font-family list with fallbacks. */
export function fontStack(font: string): string {
  return `"${font}", "Arial Black", Impact, sans-serif`;
}
