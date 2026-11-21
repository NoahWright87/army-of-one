/**
 * The text lab's panel (`?scene=textlab`): make soldiers talk (free markup or presets), stage
 * situations through the real chatter rules, and tune the look live. "Copy my settings" puts the
 * changed numbers on the clipboard so they can be pasted back into a review. Dev tool: plain look.
 */
import { str, stringsWithPrefix, type StringKey } from '../../content/strings';
import { DEFAULT_WORLD_TEXT, SPEECH_FONTS, type WorldTextTuning } from '../../content/world-text';
import { effectNames, getEffect } from '../../render/worldtext/effects';
import { COLORS } from '../../render/worldtext/markup';
import { LAB_DEMOS, type LabSituation } from '../../render/phaser/textlab-scene';
import { el, injectStyle } from '../dom';

export interface TextLabHooks {
  say(speakerId: string, markup: string): void;
  situation(s: LabSituation): void;
  firefight(seconds: number): void;
  /** Soldiers talk on their own every few seconds. */
  autoDemo(on: boolean): void;
  zoom(z: number): void;
  /** The tuning object was edited in place. */
  tuningChanged(): void;
  isHot(): boolean;
}

const css = `
.aoo-lab { position: fixed; top: 0; right: 0; bottom: 0; width: 340px; overflow-y: auto;
  background: #161a1f; color: #e7e9ec; font: 13px/1.35 system-ui, sans-serif; padding: 10px;
  border-left: 1px solid #262c33; box-sizing: border-box; z-index: 20; }
@media (max-width: 719px) { .aoo-lab { top: auto; left: 0; width: auto; height: 45%;
  border-left: 0; border-top: 1px solid #262c33; } }
.aoo-lab nav { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-bottom: 6px; font-size: 12px; }
.aoo-lab nav a { color: #9cc7ff; text-decoration: none; }
.aoo-lab nav b { color: #ffd34d; }
.aoo-lab .hint { color: #a9b0b7; font-size: 12px; margin-bottom: 8px; }
.aoo-lab details { border: 1px solid #2c333b; border-radius: 8px; padding: 6px 8px; margin-bottom: 8px; }
.aoo-lab summary { cursor: pointer; font-weight: 700; }
.aoo-lab select, .aoo-lab textarea { width: 100%; box-sizing: border-box; background: #20262d; color: inherit;
  border: 1px solid #39414a; border-radius: 6px; padding: 4px 6px; font: inherit; margin: 4px 0; }
.aoo-lab textarea { font-family: ui-monospace, monospace; font-size: 12px; min-height: 54px; }
.aoo-lab button { background: #20262d; color: inherit; border: 1px solid #39414a; border-radius: 6px;
  cursor: pointer; font: inherit; padding: 3px 8px; margin: 2px 2px 2px 0; }
.aoo-lab button:hover { border-color: #ffd34d; }
.aoo-lab .chips button { font-family: ui-monospace, monospace; font-size: 11px; text-align: left; }
.aoo-lab .row { display: grid; grid-template-columns: 112px 1fr 44px; gap: 6px; align-items: center; margin: 2px 0; }
.aoo-lab .row span { font-size: 11px; color: #c4cad0; }
.aoo-lab .row output { font-size: 11px; text-align: right; }
.aoo-lab .state { font-size: 12px; margin: 4px 0; }
.aoo-lab .state.hot { color: #ff8a7a; }
.aoo-lab .state.calm { color: #7ee08a; }
.aoo-lab code { background: #20262d; border-radius: 4px; padding: 0 3px; font-size: 11px; }
.aoo-lab ul { margin: 4px 0; padding-left: 16px; font-size: 12px; }
.aoo-lab h4 { margin: 8px 0 2px; font-size: 12px; color: #ffd34d; }
`;

/** Effect showcases (the bark lines below show them in context). */

/** Sliders: [section, key, min, max, step]. */
const SLIDERS: [keyof WorldTextTuning, string, number, number, number][] = [
  ['speech', 'fontPx', 10, 40, 1],
  ['speech', 'strokePx', 0, 10, 1],
  ['speech', 'shadowPx', 0, 8, 1],
  ['speech', 'headGapPx', 0, 50, 1],
  ['speech', 'maxWidthPx', 80, 400, 10],
  ['speech', 'letterSpacingPx', -2, 8, 0.5],
  ['speech', 'popMs', 40, 600, 10],
  ['speech', 'wordMs', 20, 400, 10],
  ['speech', 'wordPerCharMs', 0, 80, 2],
  ['speech', 'letterMs', 5, 120, 1],
  ['speech', 'holdMs', 200, 3000, 50],
  ['speech', 'holdPerCharMs', 0, 150, 5],
  ['speech', 'fadeMs', 50, 1200, 25],
  ['speech', 'echoAlpha', 0.2, 1, 0.05],
  ['speech', 'autoAllWords', 0, 8, 1],
  ['sign', 'fontPx', 10, 36, 1],
  ['sign', 'readRadius', 20, 150, 2],
  ['sign', 'closeRadius', 30, 250, 5],
  ['sign', 'readMs', 0, 2000, 25],
  ['sign', 'openMs', 50, 800, 10],
  ['sign', 'closeMs', 50, 800, 10],
  ['sign', 'hoverPx', 0, 150, 2],
  ['sign', 'maxWidthPx', 100, 400, 10],
  ['barks', 'maxHot', 0, 8, 1],
  ['barks', 'maxCalm', 0, 20, 1],
  ['barks', 'speakerCooldownMs', 0, 15000, 250],
  ['barks', 'categoryCooldownMs', 0, 10000, 250],
  ['barks', 'peripheryRadius', 0, 600, 10],
  ['barks', 'aimClearRadius', 0, 400, 10],
  ['barks', 'flavourChance', 0, 1, 0.05],
];

export class TextLabPanel {
  private readonly root: HTMLElement;
  private readonly speakerSel: HTMLSelectElement;
  private readonly stateEl: HTMLElement;
  private readonly sliders: (() => void)[] = [];

  constructor(
    parent: HTMLElement,
    private readonly tuning: WorldTextTuning,
    private readonly hooks: TextLabHooks,
    links: { label: string; href: string; here?: boolean }[],
  ) {
    injectStyle('aoo-lab-style', css);
    const r = (this.root = el('div', 'aoo-lab'));
    const nav = el('nav');
    for (const l of links) {
      if (l.here) nav.append(el('b', '', l.label));
      else {
        const a = el('a', '', l.label);
        a.href = l.href;
        nav.append(a);
      }
    }
    r.append(nav, el('div', 'hint', str('textlab.hint')));

    // Say.
    const say = this.section('textlab.say', true);
    this.speakerSel = el('select');
    const input = el('textarea');
    input.value = LAB_DEMOS[0]!;
    const go = el('button', '', str('textlab.sayButton'));
    go.onclick = () => this.hooks.say(this.speakerSel.value, input.value);
    input.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        go.click();
      }
      e.stopPropagation();
    };
    input.onkeyup = (e) => e.stopPropagation();
    say.append(this.speakerSel, input, go);
    const chips = el('div', 'chips');
    const chip = (text: string) => {
      const b = el('button', '', text);
      b.onclick = () => {
        input.value = text;
        this.hooks.say(this.speakerSel.value, text);
      };
      chips.append(b);
    };
    chips.append(el('h4', '', str('textlab.presets')));
    LAB_DEMOS.forEach(chip);
    for (const cat of [
      'grenadeWarn',
      'allyDown',
      'pinned',
      'save',
      'lastKill',
      'cheer',
      'ghostShot',
      'corpseShot',
      'echoSpawn',
    ]) {
      chips.append(el('h4', '', cat));
      stringsWithPrefix(`bark.${cat}.`).forEach(chip);
    }
    say.append(chips);

    // Situations.
    const sit = this.section('textlab.situations', true);
    this.stateEl = el('div', 'state');
    const sits: LabSituation[] = [
      'grenade',
      'manDown',
      'enemyDown',
      'pinned',
      'ghost',
      'corpse',
      'reset',
    ];
    for (const s of sits) {
      const b = el('button', '', str(`textlab.sit.${s}` as StringKey));
      b.onclick = () => this.hooks.situation(s);
      sit.append(b);
    }
    const ff = el('button', '', str('textlab.firefight'));
    ff.onclick = () => this.hooks.firefight(5);
    const autoRow = el('label');
    const auto = el('input');
    auto.type = 'checkbox';
    auto.checked = true;
    auto.onchange = () => this.hooks.autoDemo(auto.checked);
    autoRow.append(auto, document.createTextNode(' ' + str('textlab.auto')));
    sit.append(ff, el('br'), autoRow, this.stateEl);

    // Look.
    const look = this.section('textlab.look', true);
    look.append(this.fontPicker('speech'), this.fontPicker('sign'));
    const zoomRow = el('div', 'row');
    const zoom = el('input');
    zoom.type = 'range';
    zoom.min = '0.4';
    zoom.max = '2.5';
    zoom.step = '0.05';
    zoom.value = '1';
    const zoomOut = el('output', '', '1');
    zoom.oninput = () => {
      zoomOut.textContent = zoom.value;
      this.hooks.zoom(Number(zoom.value));
    };
    zoomRow.append(el('span', '', str('textlab.zoom')), zoom, zoomOut);
    look.append(zoomRow);
    let group = '';
    for (const [sec, key, min, max, step] of SLIDERS) {
      if (sec !== group) {
        group = sec;
        look.append(el('h4', '', sec));
      }
      look.append(this.slider(sec, key, min, max, step));
    }
    const copy = el('button', '', str('textlab.copy'));
    copy.onclick = () => {
      void navigator.clipboard?.writeText(JSON.stringify(this.diff(), null, 2)).then(
        () => (copy.textContent = str('textlab.copied')),
        () => window.prompt('Copy:', JSON.stringify(this.diff())),
      );
    };
    const reset = el('button', '', str('textlab.reset'));
    reset.onclick = () => {
      for (const sec of ['speech', 'sign', 'barks'] as const) {
        Object.assign(this.tuning[sec], DEFAULT_WORLD_TEXT[sec]);
      }
      this.sliders.forEach((f) => f());
      this.hooks.tuningChanged();
    };
    look.append(el('br'), copy, reset);

    // Cheat sheet.
    const sheet = this.section('textlab.markup', false);
    const ul = el('ul');
    const li = (code: string, text: string) => {
      const item = el('li');
      item.append(el('code', '', code), document.createTextNode(' ' + text));
      ul.append(item);
    };
    for (const name of effectNames()) li(`[${name}]…[/]`, getEffect(name)!.help);
    li(`[${Object.keys(COLORS).join('] [')}] [#ff8800]`, 'colour');
    li('[big] [small]', 'size');
    li(
      '[all] [words] [letters]',
      'pacing from here on (default: ≤3 words all at once, else word by word)',
    );
    li('[p] [p=600]', 'pause');
    li('[quake]', 'shake the screen at this point');
    li('{name} {rank} {rankShort} {rankAbbr} {full}', "the speaker's name");
    li('{theirName} {theirRankShort} {theirFull} …', 'who the line is about');
    sheet.append(ul);

    parent.append(r);
    this.loop();
  }

  setSpeakers(list: { id: string; label: string; alive: boolean }[]): void {
    const keep = this.speakerSel.value;
    this.speakerSel.replaceChildren();
    for (const s of list) {
      const o = el('option', '', s.alive ? s.label : `✝ ${s.label}`);
      o.value = s.id;
      this.speakerSel.append(o);
    }
    if (list.some((s) => s.id === keep)) this.speakerSel.value = keep;
  }

  private loop(): void {
    const tick = () => {
      if (!this.root.isConnected) return;
      const hot = this.hooks.isHot();
      this.stateEl.className = `state ${hot ? 'hot' : 'calm'}`;
      this.stateEl.textContent = str(hot ? 'textlab.state.hot' : 'textlab.state.calm');
      setTimeout(tick, 200);
    };
    tick();
  }

  private section(key: StringKey, open: boolean): HTMLElement {
    const d = el('details');
    d.open = open;
    d.append(el('summary', '', str(key)));
    this.root.append(d);
    return d;
  }

  private fontPicker(sec: 'speech' | 'sign'): HTMLElement {
    const row = el('div', 'row');
    const sel = el('select');
    for (const f of SPEECH_FONTS) {
      const o = el('option', '', f.label);
      o.value = f.id;
      o.style.fontFamily = `"${f.id}"`;
      sel.append(o);
    }
    sel.value = this.tuning[sec].font;
    sel.onchange = () => {
      this.tuning[sec].font = sel.value;
      this.hooks.tuningChanged();
    };
    this.sliders.push(() => (sel.value = this.tuning[sec].font));
    row.append(el('span', '', `${sec} font`), sel, el('output'));
    return row;
  }

  private slider(
    sec: keyof WorldTextTuning,
    key: string,
    min: number,
    max: number,
    step: number,
  ): HTMLElement {
    const obj = this.tuning[sec] as unknown as Record<string, number>;
    const row = el('div', 'row');
    const input = el('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    const out = el('output');
    const show = () => {
      input.value = String(obj[key]);
      out.textContent = String(obj[key]);
    };
    show();
    input.oninput = () => {
      obj[key] = Number(input.value);
      out.textContent = input.value;
      this.hooks.tuningChanged();
    };
    this.sliders.push(show);
    row.append(el('span', '', key), input, out);
    return row;
  }

  /** Only what differs from the defaults. */
  private diff(): Record<string, Record<string, unknown>> {
    const out: Record<string, Record<string, unknown>> = {};
    for (const sec of ['speech', 'sign', 'barks'] as const) {
      const cur = this.tuning[sec] as unknown as Record<string, unknown>;
      const def = DEFAULT_WORLD_TEXT[sec] as unknown as Record<string, unknown>;
      for (const k of Object.keys(def)) {
        if (cur[k] !== def[k]) (out[sec] ??= {})[k] = cur[k];
      }
    }
    return out;
  }
}
