/**
 * Pause button + "Paused" card + resume countdown. Dumb view: the battle scene owns the state
 * (`render/pause-model.ts`) and calls `render`; button presses come back through `onToggle`.
 */
import { str } from '../../content/strings';
import { el, injectStyle, setText } from '../dom';

const CSS = `
.aoo-pausebtn { position: fixed; top: 44px; right: 12px; z-index: 12; width: 40px; height: 40px;
  border: 0; border-radius: 8px; background: rgba(255,255,255,.25); color: #fff; font: 700 18px system-ui;
  touch-action: none; cursor: pointer; }
.aoo-pausebtn[hidden], .aoo-pause[hidden] { display: none; }
.aoo-pause { position: fixed; inset: 0; z-index: 30; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 14px; background: rgba(0,0,0,.6);
  color: #fff; font-family: system-ui, sans-serif; text-align: center; }
.aoo-pause .t { font-size: 56px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
.aoo-pause button { font: 700 24px system-ui; padding: 14px 40px; border: 0; border-radius: 10px;
  background: #ffd34d; color: #111; cursor: pointer; }
.aoo-pause .h { opacity: .7; font-size: 14px; }
.aoo-pause .n { font-size: 140px; font-weight: 800; line-height: 1; text-shadow: 0 0 24px rgba(53,224,255,.8); }
.aoo-pause.resuming { background: rgba(0,0,0,.25); pointer-events: none; }
`;

export class PauseOverlay {
  /** Wired by the scene: the button or the card was pressed. */
  onPause: () => void = () => {};
  onResume: () => void = () => {};
  private readonly btn = el('button', 'aoo-pausebtn', '⏸');
  private readonly card = el('div', 'aoo-pause');
  private readonly title = el('div', 't', str('pause.title'));
  private readonly resumeBtn = el('button', undefined, str('pause.resume'));
  private readonly hint = el('div', 'h', str('pause.hint'));
  private readonly num = el('div', 'n');
  private mode: 'running' | 'paused' | 'resuming' = 'running';

  constructor(parent: HTMLElement) {
    injectStyle('aoo-pause-css', CSS);
    this.btn.setAttribute('aria-label', str('pause.button'));
    this.btn.hidden = true;
    this.card.hidden = true;
    this.card.append(this.title, this.resumeBtn, this.hint, this.num);
    parent.append(this.btn, this.card);
    // pointerdown, not click: the game also listens for pointers and a touch must not fire a shot.
    this.btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onPause();
    });
    this.resumeBtn.addEventListener('click', () => this.onResume());
  }

  /** Whether the on-screen pause button shows (only in a live battle). */
  setAvailable(on: boolean): void {
    this.btn.hidden = !on;
  }

  render(state: 'running' | 'paused' | 'resuming', countdown: number | null): void {
    if (state !== this.mode) {
      this.mode = state;
      this.card.hidden = state === 'running';
      this.card.classList.toggle('resuming', state === 'resuming');
      this.title.hidden = state === 'resuming';
      this.resumeBtn.hidden = state === 'resuming';
      this.hint.hidden = state === 'resuming';
      this.num.hidden = state !== 'resuming';
      if (state === 'paused') this.resumeBtn.focus({ preventScroll: true });
      else this.resumeBtn.blur();
    }
    if (countdown !== null) setText(this.num, String(countdown));
  }
}
