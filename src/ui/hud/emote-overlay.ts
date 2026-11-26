import { str } from '../../content/strings';
import type { EmoteId } from '../../contracts/mission';
import { el, injectStyle } from '../dom';

const CSS = `
.aoo-emote { position: fixed; top: 44px; right: 62px; z-index: 25;
  font: 700 15px system-ui; color: #fff; cursor: auto; }
body.aoo-touch-mode .aoo-emote { right: auto; left: 108px; top: 62px; }
.aoo-emote-toggle { width: 44px; height: 44px; border: 0; border-radius: 8px;
  background: rgba(255,255,255,.25); color: inherit; font-size: 18px; cursor: pointer; }
.aoo-emote-options { position: absolute; top: 50px; right: 0; min-width: max-content; padding: 4px;
  display: grid; gap: 2px; border: 1px solid #67717c; border-radius: 8px; background: #20252c; }
body.aoo-touch-mode .aoo-emote-options { right: auto; left: 0; }
.aoo-emote-options[hidden] { display: none; }
.aoo-emote-options button { min-height: 44px; padding: 0 12px; border: 0; border-radius: 4px;
  text-align: left; color: inherit; background: transparent; font: inherit; cursor: pointer; }
.aoo-emote-options button:is(:hover, :focus-visible) { background: #3a4551; }
`;

export class EmoteOverlay {
  onSelect: (emote: EmoteId) => void = () => {};
  private readonly root = el('div', 'aoo-emote');
  private readonly toggle = el('button', 'aoo-emote-toggle', '💬');
  private readonly options = el('div', 'aoo-emote-options');

  constructor(parent: HTMLElement) {
    injectStyle('aoo-emote-css', CSS);
    this.options.id = 'aoo-emote-options';
    this.toggle.setAttribute('aria-label', str('emote.button'));
    this.toggle.setAttribute('aria-controls', this.options.id);
    this.root.hidden = true;
    this.setOpen(false);
    this.toggle.addEventListener('click', () => this.setOpen(this.options.hasAttribute('hidden')));
    for (const emote of ['countdown', 'ready', 'hold'] as const) {
      const button = el('button', undefined, str(`emote.${emote}`));
      button.addEventListener('click', () => {
        this.onSelect(emote);
        this.setOpen(false);
        this.toggle.focus({ preventScroll: true });
      });
      this.options.append(button);
    }
    for (const event of ['pointerdown', 'mousedown', 'touchstart'] as const) {
      this.root.addEventListener(event, (e) => e.stopPropagation());
    }
    document.addEventListener('pointerdown', (e) => {
      if (!this.options.hidden && !e.composedPath().includes(this.root)) this.setOpen(false);
    });
    this.root.append(this.toggle, this.options);
    parent.append(this.root);
  }

  setAvailable(available: boolean): void {
    if (this.root.hidden === !available) return;
    this.root.hidden = !available;
    if (!available) this.setOpen(false);
  }

  private setOpen(open: boolean): void {
    this.options.hidden = !open;
    this.toggle.setAttribute('aria-expanded', String(open));
  }
}
