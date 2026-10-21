/**
 * Dev settings panel (DOM overlay, F2). Renders every registered setting, grouped, with a
 * control per type. Changes go straight to the SettingsStore (which persists them).
 */
import { str, strDynamic } from '../../content/strings';
import { el, injectStyle } from '../dom';
import type { SettingDef, SettingsStore } from './registry';

export interface PanelAction {
  label: string;
  run: () => void;
}

const PANEL_CSS = `
.aoo-settings { position: fixed; top: 12px; right: 12px; width: 320px; max-height: calc(100% - 24px);
  overflow: auto; background: rgba(16,20,24,.94); color: #e6e9ec; font: 12px/1.35 system-ui, sans-serif;
  border: 1px solid #39424c; border-radius: 6px; padding: 10px 12px; z-index: 30; box-sizing: border-box; }
.aoo-settings[hidden] { display: none; }
.aoo-settings h2 { font-size: 14px; margin: 0 0 2px; }
.aoo-settings .hint { color: #8a96a3; margin-bottom: 8px; }
.aoo-settings h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #9fb3c8;
  margin: 12px 0 4px; border-bottom: 1px solid #2b333b; padding-bottom: 2px; }
.aoo-settings .row { display: grid; grid-template-columns: 1fr auto 16px; gap: 6px; align-items: center;
  padding: 2px 0; }
.aoo-settings .row.changed label { color: #ffd34d; }
.aoo-settings .ctl { display: flex; align-items: center; gap: 4px; justify-content: flex-end; }
.aoo-settings input[type=range] { width: 100px; }
.aoo-settings .num { width: 44px; text-align: right; font-variant-numeric: tabular-nums; color: #c8d0d8; }
.aoo-settings select, .aoo-settings button { font: inherit; background: #222a32; color: #e6e9ec;
  border: 1px solid #3c4650; border-radius: 3px; }
.aoo-settings .reset { padding: 0 3px; cursor: pointer; visibility: hidden; }
.aoo-settings .row.changed .reset { visibility: visible; }
.aoo-settings .actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
`;

export class SettingsPanel {
  readonly root: HTMLDivElement;
  private actions: PanelAction[] = [];

  constructor(
    parent: HTMLElement,
    private readonly store: SettingsStore,
  ) {
    injectStyle('aoo-settings-css', PANEL_CSS);
    this.root = el('div', 'aoo-settings');
    this.root.hidden = true;
    parent.appendChild(this.root);
    // Keep keyboard input inside the panel from steering the soldier.
    for (const t of ['keydown', 'keyup'] as const) {
      this.root.addEventListener(t, (e) => {
        if ((e as KeyboardEvent).key !== 'F2') e.stopPropagation();
      });
    }
    store.subscribe(() => {
      if (!this.root.hidden) this.render();
    });
  }

  addAction(action: PanelAction): void {
    this.actions.push(action);
    if (!this.root.hidden) this.render();
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  toggle(force?: boolean): void {
    this.root.hidden = !(force ?? this.root.hidden);
    if (!this.root.hidden) this.render();
  }

  private render(): void {
    const focusId = (document.activeElement as HTMLElement | null)?.dataset?.settingId;
    this.root.replaceChildren();
    this.root.append(el('h2', '', str('settings.title')), el('div', 'hint', str('settings.hint')));
    const groups = new Map<string, SettingDef[]>();
    for (const d of this.store.definitions()) {
      const g = groups.get(d.group) ?? [];
      g.push(d);
      groups.set(d.group, g);
    }
    for (const [group, defs] of groups) {
      this.root.append(el('h3', '', strDynamic(group)));
      for (const def of defs) this.root.append(this.row(def));
    }
    const actions = el('div', 'actions');
    for (const a of this.actions) {
      const b = el('button', '', a.label);
      b.onclick = () => a.run();
      actions.append(b);
    }
    const resetAll = el('button', '', str('settings.resetAll'));
    resetAll.onclick = () => this.store.reset();
    actions.append(resetAll);
    this.root.append(actions);
    if (focusId) {
      this.root.querySelector<HTMLElement>(`[data-setting-id="${CSS.escape(focusId)}"]`)?.focus();
    }
  }

  private row(def: SettingDef): HTMLElement {
    const row = el('div', 'row' + (this.store.isDefault(def.id) ? '' : ' changed'));
    const label = el('label', '', def.label);
    label.title = def.id;
    const ctl = el('div', 'ctl');
    const value = this.store.get(def.id);
    if (def.type === 'boolean') {
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = value === true;
      cb.dataset.settingId = def.id;
      cb.onchange = () => this.store.set(def.id, cb.checked);
      ctl.append(cb);
    } else if (def.type === 'number') {
      const range = el('input');
      range.type = 'range';
      range.min = String(def.min);
      range.max = String(def.max);
      range.step = String(def.step);
      range.value = String(value);
      range.dataset.settingId = def.id;
      const num = el('span', 'num', formatNumber(value as number, def.step));
      range.oninput = () => {
        num.textContent = formatNumber(Number(range.value), def.step);
      };
      range.onchange = () => this.store.set(def.id, Number(range.value));
      ctl.append(range, num);
    } else {
      const sel = el('select');
      sel.dataset.settingId = def.id;
      for (const o of def.options) {
        const opt = el('option', '', o.label);
        opt.value = o.value;
        opt.selected = o.value === value;
        sel.append(opt);
      }
      sel.onchange = () => this.store.set(def.id, sel.value);
      ctl.append(sel);
    }
    const reset = el('button', 'reset', '↺');
    reset.title = str('settings.reset');
    reset.onclick = () => this.store.reset(def.id);
    row.append(label, ctl, reset);
    return row;
  }
}

export function formatNumber(v: number, step: number): string {
  const decimals = Math.max(0, Math.min(4, -Math.floor(Math.log10(step))));
  return v.toFixed(decimals);
}
