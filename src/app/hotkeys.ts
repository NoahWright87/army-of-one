/**
 * App-level hotkeys (DOM, independent of Phaser so they work on every scene):
 *   `   toggle debug overlay
 *   F2  toggle settings panel
 *   F4  play the countdown overlay (debug; handled by the battle scene)
 */
export interface HotkeyHandlers {
  toggleDebug(): void;
  toggleSettings(): void;
}

/** Pure: which action a key maps to. */
export function hotkeyAction(key: string, code: string): keyof HotkeyHandlers | null {
  if (code === 'Backquote' || key === '`') return 'toggleDebug';
  if (key === 'F2') return 'toggleSettings';
  return null;
}

export function installHotkeys(target: Window, handlers: HotkeyHandlers): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const action = hotkeyAction(e.key, e.code);
    if (!action) return;
    e.preventDefault();
    handlers[action]();
  };
  target.addEventListener('keydown', onKey);
  return () => target.removeEventListener('keydown', onKey);
}
