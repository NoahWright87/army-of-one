/**
 * Big centered "5…4…3…2…1…GO" overlay for the lead-in ([D5]/[D25]).
 *
 * PHASE04 usage: each sim/render frame during a lead-in call
 *   `overlay.update(remainingTicks)`   // ticks until control switches; ≤ 0 shows GO
 * and `overlay.update(null)` (or just stop calling after GO) when no countdown is active.
 * GO lingers briefly on its own, then fades. `onCue` fires once per number ('tick') and once at
 * zero ('go'), so the caller can play sfx_countdown_tick / sfx_resume_go.
 */
import { el, injectStyle, setText } from '../dom';
import { CountdownTracker, countdownPhase, type CountdownCue } from './countdown-model';

const CSS = `
.aoo-countdown { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
  pointer-events: none; z-index: 20; }
.aoo-countdown[hidden] { display: none; }
.aoo-countdown .n { font: 800 160px/1 system-ui, sans-serif; color: #fff; opacity: .92;
  text-shadow: 0 0 24px rgba(53,224,255,.8), 0 4px 0 #000, 0 0 8px #000; }
.aoo-countdown.upper { align-items: flex-start; padding-top: 11vh; }
.aoo-countdown.upper .n { font-size: 120px; }
.aoo-countdown .n.go { color: #ffd34d; text-shadow: 0 0 30px rgba(255,211,77,.9), 0 4px 0 #000; }
`;

export class CountdownOverlay {
  readonly root: HTMLDivElement;
  private readonly num = el('div', 'n');
  private readonly tracker = new CountdownTracker();
  private goTimer: ReturnType<typeof setTimeout> | null = null;
  onCue: (cue: Exclude<CountdownCue, null>) => void = () => {};

  constructor(parent: HTMLElement) {
    injectStyle('aoo-countdown-css', CSS);
    this.root = el('div', 'aoo-countdown');
    this.root.hidden = true;
    this.root.append(this.num);
    parent.appendChild(this.root);
  }

  /** Remaining battle ticks of the countdown; null hides it (GO keeps its linger). */
  update(remainingTicks: number | null): void {
    const { label, changed, cue } = this.tracker.update(remainingTicks);
    if (remainingTicks === null || label === null) {
      if (!this.goTimer) this.root.hidden = true;
      return;
    }
    if (cue) this.onCue(cue);
    const isGo = remainingTicks <= 0;
    if (isGo) {
      // GO shows once, lingers, then hides by itself even if the caller keeps passing ≤ 0.
      if (!changed) return;
      this.show(label, true, 0);
      this.goTimer = setTimeout(() => {
        this.root.hidden = true;
        this.goTimer = null;
      }, 700);
      return;
    }
    if (this.goTimer) {
      clearTimeout(this.goTimer);
      this.goTimer = null;
    }
    this.show(label, false, countdownPhase(remainingTicks));
  }

  private show(label: string, go: boolean, phase: number): void {
    this.root.hidden = false;
    setText(this.num, label);
    this.num.className = go ? 'n go' : 'n';
    this.num.style.transform = `scale(${(1.25 - 0.25 * Math.min(1, phase * 3)).toFixed(3)})`;
  }

  /** 'upper': above the middle, so the soldier in the screen centre stays visible (PHASE04). */
  setPlacement(p: 'center' | 'upper'): void {
    this.root.classList.toggle('upper', p === 'upper');
  }

  get active(): boolean {
    return !this.root.hidden;
  }
}
