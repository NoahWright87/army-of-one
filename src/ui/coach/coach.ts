/**
 * (PHASE18) UI coach: dims the screen except one control, with a 👇 and a short line. Written
 * once, reused for every hint (basic training's respawn screen first). Purely visual: clicks go
 * through to the page underneath.
 *
 * A hint is a list of steps; each step names its target with a function (so it follows the
 * page as it re-renders) and is done when `done()` turns true, then the next step shows.
 */
import { el, injectStyle, setText } from '../dom';

export interface CoachStep {
  /** The control to point at (null: not on screen right now; the coach waits). */
  target(): Element | null;
  text: string;
  /** This step is done (e.g. the option got selected): move to the next. */
  done?(): boolean;
}

const css = `
.aoo-coach { position: fixed; inset: 0; pointer-events: none; z-index: 60; }
.aoo-coach .hole { position: fixed; border-radius: 10px; box-shadow: 0 0 0 9999px rgba(0,0,0,.55);
  outline: 3px solid #ffd34d; transition: left .15s, top .15s, width .15s, height .15s; }
.aoo-coach .say { position: fixed; transform: translate(-50%, -100%); text-align: center;
  font: 700 15px/1.25 system-ui, sans-serif; color: #fff; text-shadow: 0 2px 4px #000;
  max-width: 260px; }
.aoo-coach .say .hand { display: block; font-size: 30px; animation: aoo-coach-bob .8s ease-in-out infinite; }
@keyframes aoo-coach-bob { 0%,100% { transform: translateY(-4px); } 50% { transform: translateY(4px); } }
`;

/** First visible element matching any of `selectors` (in order). */
export function firstVisible(root: ParentNode, ...selectors: string[]): Element | null {
  for (const sel of selectors) {
    for (const e of root.querySelectorAll(sel)) {
      const r = e.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight) return e;
    }
  }
  return null;
}

export class Coach {
  private readonly root: HTMLElement;
  private readonly hole = el('div', 'hole');
  private readonly say = el('div', 'say');
  private readonly line = el('span');
  private steps: CoachStep[] = [];
  private raf = 0;

  constructor(parent: HTMLElement) {
    injectStyle('aoo-coach-style', css);
    this.root = el('div', 'aoo-coach');
    this.root.hidden = true;
    const hand = el('span', 'hand', '👇');
    this.say.append(hand, this.line);
    this.root.append(this.hole, this.say);
    parent.append(this.root);
  }

  show(steps: CoachStep[]): void {
    this.steps = [...steps];
    cancelAnimationFrame(this.raf);
    const tick = () => {
      this.place();
      if (this.steps.length) this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  hide(): void {
    this.steps = [];
    cancelAnimationFrame(this.raf);
    this.root.hidden = true;
  }

  private place(): void {
    while (this.steps.length > 1 && this.steps[0]!.done?.()) this.steps.shift();
    const step = this.steps[0];
    const target = step?.target() ?? null;
    if (!step || !target) {
      this.root.hidden = true;
      return;
    }
    const r = target.getBoundingClientRect();
    const pad = 6;
    Object.assign(this.hole.style, {
      left: `${r.left - pad}px`,
      top: `${r.top - pad}px`,
      width: `${r.width + pad * 2}px`,
      height: `${r.height + pad * 2}px`,
    });
    // Above the control if there's room, else below it (the hand still points at it).
    const above = r.top > 90;
    Object.assign(this.say.style, {
      left: `${Math.min(window.innerWidth - 130, Math.max(130, r.left + r.width / 2))}px`,
      top: above ? `${r.top - pad - 4}px` : `${r.bottom + pad + 70}px`,
    });
    setText(this.line, step.text);
    this.root.hidden = false;
  }
}
