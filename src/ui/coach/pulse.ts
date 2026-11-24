/**
 * (PHASE18) A pulsing outline on the control the coach would point at, with no dimming and no
 * text: the lighter way to say "this one" while the drill sergeant does the talking. Follows the
 * page as it re-renders; stops when `stop()` is called.
 */
import { injectStyle } from '../dom';
import { firstVisible, type CoachStep } from './coach';

const css = `
.aoo-pulse { animation: aoo-pulse 1s ease-in-out infinite; position: relative; z-index: 2; }
@keyframes aoo-pulse {
  0%, 100% { outline: 3px solid rgba(255, 211, 77, .95); outline-offset: 2px;
    box-shadow: 0 0 0 0 rgba(255, 211, 77, .55); }
  50% { outline: 3px solid rgba(255, 211, 77, .35); outline-offset: 5px;
    box-shadow: 0 0 18px 8px rgba(255, 211, 77, .6); }
}
`;

/** Pulses the target of the first step that isn't done yet. Returns a function that stops it. */
export function pulseSteps(steps: readonly CoachStep[]): () => void {
  injectStyle('aoo-pulse', css);
  let lit: Element | null = null;
  const tick = () => {
    const next = steps.find((s) => !s.done?.());
    const target = next ? next.target() : null;
    if (target === lit) return;
    lit?.classList.remove('aoo-pulse');
    lit = target;
    lit?.classList.add('aoo-pulse');
  };
  tick();
  const timer = window.setInterval(tick, 200);
  return () => {
    window.clearInterval(timer);
    lit?.classList.remove('aoo-pulse');
    lit = null;
  };
}

export { firstVisible };
