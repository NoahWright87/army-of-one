/**
 * (PHASE18) The script editor for basic training's drill sergeant ([D160]): a pencil button that
 * opens a panel over the running game. Edit his words, when he says them, where he stands and how
 * fast he talks; every change applies at once and is kept in this browser, so the loop is
 * edit → play → tweak. "Start here" reloads at any station without playing the ones before.
 * Download / paste the JSON to move a script between browsers (or to commit it as the default).
 */
import { lineDurationMs, checkWhen, validateScript } from '../../app/sarge-engine';
import type { SargeBeat, SargePlace, SargeScript, SargeSpot } from '../../content/sarge-script';
import { el, injectStyle } from '../dom';

/** What the editor needs from the game (so it knows nothing of the director). */
export interface SargeEditorHost {
  script(): SargeScript;
  /** The edited script, to apply and keep. */
  apply(script: SargeScript): void;
  /** Throw the edits away: the default again. */
  reset(): void;
  /** Replace the script from pasted JSON; returns an error message or null. */
  importJson(json: string): string | null;
  /** Say this line now. */
  say(text: string): void;
  stations: readonly { id: string; label: string }[];
  startAt(stationId: string): void;
  /** Edited, and the default has changed since. */
  outdated: boolean;
  edited: boolean;
}

const css = `
.aoo-se-btn { position: fixed; left: 12px; bottom: 12px; z-index: 70; padding: 8px 12px;
  border-radius: 8px; border: 2px solid #ffd34d; background: #1d232ae6; color: #ffd34d;
  font: 700 13px system-ui, sans-serif; cursor: pointer; }
.aoo-se { position: fixed; top: 0; right: 0; bottom: 0; width: min(460px, 100vw); z-index: 80;
  background: #151a20f2; color: #e6e9ec; font: 13px/1.35 system-ui, sans-serif; overflow-y: auto;
  border-left: 2px solid #ffd34d; padding: 10px 12px 60px; box-sizing: border-box; }
.aoo-se[hidden] { display: none; }
.aoo-se h2 { margin: 0 0 6px; font-size: 16px; color: #ffd34d; display: flex; gap: 8px; align-items: center; }
.aoo-se h2 span { flex: 1; }
.aoo-se h3 { margin: 14px 0 4px; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #9aa6b2; }
.aoo-se button { font: 600 12px system-ui, sans-serif; padding: 4px 8px; border-radius: 5px;
  border: 1px solid #4b5763; background: #232b33; color: #e6e9ec; cursor: pointer; }
.aoo-se button:hover { border-color: #ffd34d; }
.aoo-se button.go { background: #ffd34d; color: #1a1a1a; border-color: #ffd34d; }
.aoo-se input, .aoo-se textarea, .aoo-se select { width: 100%; box-sizing: border-box; background: #0f1318;
  color: #e6e9ec; border: 1px solid #3a444e; border-radius: 4px; padding: 4px 6px; font: 12px ui-monospace, monospace; }
.aoo-se textarea { min-height: 54px; resize: vertical; font-family: system-ui, sans-serif; font-size: 13px; }
.aoo-se input[type=checkbox] { width: auto; }
.aoo-se label { display: inline-flex; align-items: center; gap: 4px; margin-right: 10px; }
.aoo-se label.grow { display: flex; flex-direction: column; align-items: stretch; gap: 2px; margin-right: 0; }
.aoo-se label.wide { flex-basis: 100%; }
.aoo-se .row { display: flex; gap: 6px; align-items: center; margin: 4px 0; flex-wrap: wrap; }
.aoo-se .row > .grow { flex: 1; min-width: 80px; }
.aoo-se details { border: 1px solid #2b343d; border-radius: 6px; margin: 4px 0; background: #1a2027; }
.aoo-se details > summary { cursor: pointer; padding: 5px 8px; display: flex; gap: 8px; align-items: baseline; }
.aoo-se details > summary .id { font-weight: 700; color: #ffd34d; white-space: nowrap; }
.aoo-se details > summary .txt { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #b6bfc8; }
.aoo-se details > summary .dur { color: #7f8a95; white-space: nowrap; }
.aoo-se details.off > summary { opacity: .45; }
.aoo-se .body { padding: 4px 8px 8px; }
.aoo-se .err { color: #ff8a80; font-size: 12px; margin: 2px 0; }
.aoo-se .ok { color: #8fd694; }
.aoo-se .hint { color: #8b96a1; font-size: 11px; }
.aoo-se .long { color: #ffb86b; }
.aoo-se pre { white-space: pre-wrap; font: 11px/1.4 ui-monospace, monospace; color: #b6bfc8; margin: 4px 0; }
.aoo-se .stations { display: flex; flex-wrap: wrap; gap: 4px; }
`;

const TOKEN_HELP = `HAPPENS (true for one moment)
  lifeStart  enter:<room>  captured:<flag>  gateOpened:<gate>  targetsDown  minesShot
  died  died:<room>  nestCleared  rangeCleared  shotAtSarge  respawnOpen
IS (true while it holds)
  room:<room>  alive  firstLife  role:<role>  deaths:<n>  deaths>n  diedIn:<room>
  had:<thing or beat id>  gate:<gate>  near:<spot>  nextTarget:<id>  targetsLeft
  hurt  corridor  atSpawn:<spawn>  cause:mine|shot  inRoom:<s>  quiet:<s>
  waited:<s>  (everything else has held that long; repeats with "repeat")
  respawn  afterDeath  hint:deploy|spawn|resume  hintSpawn:<spawn>  hintRole  taught:<key>
Put ! in front to negate. Rooms: r0 r1 r2 r3 r4 r5f r5 r6f r6 r7.
Markup: [shake] [big] [small] [gold] [red] [wave] [p=ms] [words] [/]. {place} {role} on respawn lines.`;

export class SargeEditor {
  private readonly button: HTMLButtonElement;
  private readonly panel: HTMLElement;
  private readonly content: HTMLElement;
  private saveNote: HTMLElement | null = null;
  private filter = '';
  private openBeats = new Set<string>();

  constructor(
    root: HTMLElement,
    private readonly host: SargeEditorHost,
    open = false,
  ) {
    injectStyle('aoo-sarge-editor', css);
    this.button = el('button', 'aoo-se-btn', '✎ Sarge');
    this.button.title = "Edit Sarge's words, triggers and timing";
    this.button.addEventListener('click', () => this.toggle());
    this.panel = el('div', 'aoo-se');
    this.panel.hidden = !open;
    this.content = el('div');
    this.panel.append(this.content);
    // Typing here must not move the soldier or fire.
    for (const type of ['keydown', 'keyup', 'pointerdown', 'wheel']) {
      this.panel.addEventListener(type, (e) => e.stopPropagation());
    }
    root.append(this.button, this.panel);
    this.render();
  }

  toggle(): void {
    this.panel.hidden = !this.panel.hidden;
  }

  destroy(): void {
    this.button.remove();
    this.panel.remove();
  }

  // --- Change handling ---------------------------------------------------------------------

  private changed(): void {
    this.host.apply(this.host.script());
    if (this.saveNote) {
      const problems = validateScript(this.host.script());
      this.saveNote.className = problems.length ? 'err' : 'ok';
      this.saveNote.textContent = problems.length
        ? `${problems.length} problem${problems.length === 1 ? '' : 's'}: ${problems[0]}`
        : 'Saved in this browser ✓';
    }
  }

  /** A change to the list's shape (add, delete, move): draw it again. */
  private restructure(): void {
    this.changed();
    this.render();
  }

  // --- Drawing -----------------------------------------------------------------------------

  private render(): void {
    const scroll = this.panel.scrollTop;
    const script = this.host.script();
    const c = this.content;
    c.textContent = '';
    const head = el('h2');
    head.append(el('span', undefined, "Sarge's script"));
    const close = el('button', undefined, '✕');
    close.addEventListener('click', () => this.toggle());
    head.append(close);
    c.append(head);

    this.saveNote = el(
      'div',
      'ok',
      this.host.edited ? 'Your edited copy is in use.' : 'Showing the default.',
    );
    c.append(this.saveNote);
    if (this.host.outdated) {
      c.append(
        el(
          'div',
          'err',
          'The default script changed since you edited yours. Use "Back to default" to get the new one (this throws your edits away: download them first).',
        ),
      );
    }
    const problems = validateScript(script);
    if (problems.length) c.append(el('div', 'err', problems.slice(0, 4).join(' · ')));

    // File actions.
    const files = el('div', 'row');
    const dl = el('button', undefined, 'Download JSON');
    dl.addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(
        new Blob([JSON.stringify(this.host.script(), null, 2)], { type: 'application/json' }),
      );
      a.download = 'sarge-script.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });
    const copy = el('button', undefined, 'Copy JSON');
    copy.addEventListener('click', () => {
      void navigator.clipboard?.writeText(JSON.stringify(this.host.script(), null, 2));
      copy.textContent = 'Copied ✓';
    });
    const paste = el('button', undefined, 'Paste JSON…');
    paste.addEventListener('click', () => {
      const text = window.prompt('Paste a script (JSON). This replaces your current one.');
      if (!text) return;
      const err = this.host.importJson(text);
      if (err) window.alert(err);
      else this.render();
    });
    const reset = el('button', undefined, 'Back to default');
    reset.addEventListener('click', () => {
      if (!window.confirm('Throw away your edits and use the default script?')) return;
      this.host.reset();
      this.render();
    });
    files.append(dl, copy, paste, reset);
    c.append(files);

    // Stations.
    c.append(el('h3', undefined, 'Start here (reloads the mission)'));
    const st = el('div', 'stations');
    for (const s of this.host.stations) {
      const b = el('button', undefined, s.label);
      b.addEventListener('click', () => this.host.startAt(s.id));
      st.append(b);
    }
    c.append(st);

    // Timing.
    c.append(el('h3', undefined, 'How he talks'));
    c.append(this.timingEditor(script));

    // Beats.
    c.append(el('h3', undefined, 'What he says, and when'));
    const search = el('input');
    search.placeholder = 'Filter beats…';
    search.value = this.filter;
    search.addEventListener('input', () => {
      this.filter = search.value.toLowerCase();
      this.drawBeats(list, script);
    });
    c.append(search);
    const list = el('div');
    c.append(list);
    this.drawBeats(list, script);
    const add = el('button', 'go', '+ Add a line');
    add.addEventListener('click', () => {
      let n = 1;
      while (script.beats.some((b) => b.id === `new.${n}`)) n++;
      script.beats.push({ id: `new.${n}`, when: '', say: ['…'] });
      this.openBeats.add(`new.${n}`);
      this.restructure();
    });
    c.append(add);

    // Places.
    c.append(el('h3', undefined, 'Where he stands (first match wins; otherwise he follows you)'));
    script.places.forEach((p, i) => c.append(this.placeEditor(script, p, i)));
    const addPlace = el('button', undefined, '+ Add a place');
    addPlace.addEventListener('click', () => {
      script.places.push({
        id: `place.${script.places.length + 1}`,
        when: 'room:r1, alive',
        at: { x: 600, y: 3600 },
        face: 0,
      });
      this.restructure();
    });
    c.append(addPlace);

    // Spots.
    c.append(el('h3', undefined, 'Spots (for near:… and places)'));
    script.spots.forEach((s, i) => c.append(this.spotEditor(script, s, i)));
    const addSpot = el('button', undefined, '+ Add a spot');
    addSpot.addEventListener('click', () => {
      script.spots.push({ id: `spot${script.spots.length + 1}`, x: 600, y: 3600, radius: 60 });
      this.restructure();
    });
    c.append(addSpot);

    c.append(el('h3', undefined, 'Condition words'));
    const help = el('details');
    help.append(el('summary', undefined, 'Show the list'));
    help.append(el('pre', undefined, TOKEN_HELP));
    c.append(help);

    this.panel.scrollTop = scroll;
  }

  private field(
    label: string,
    value: string | number,
    onInput: (v: string) => void,
    type = 'text',
    wide = false,
  ): HTMLElement {
    const wrap = el('label', wide ? 'grow wide' : 'grow');
    wrap.append(el('span', 'hint', label));
    const input = el('input');
    input.type = type;
    input.value = String(value);
    input.addEventListener('input', () => onInput(input.value));
    wrap.append(input);
    return wrap;
  }

  private timingEditor(script: SargeScript): HTMLElement {
    const box = el('div');
    const rows: [keyof SargeScript['timing'], string][] = [
      ['holdMs', 'Stays on screen: base (ms)'],
      ['holdPerCharMs', '… plus per letter (ms)'],
      ['wordMs', 'Each word: base (ms)'],
      ['wordPerCharMs', '… plus per letter (ms)'],
      ['lineGapMs', 'Pause between lines (ms)'],
      ['staleMs', 'Drops a line you outran after (ms)'],
      ['speed', 'Running speed (units/s; sprint ≈ 360)'],
    ];
    const r = el('div', 'row');
    for (const [k, label] of rows) {
      r.append(
        this.field(
          label,
          script.timing[k],
          (v) => {
            const n = Number(v);
            if (Number.isFinite(n)) {
              script.timing[k] = n;
              this.changed();
            }
          },
          'number',
        ),
      );
    }
    box.append(r);
    return box;
  }

  private drawBeats(into: HTMLElement, script: SargeScript): void {
    into.textContent = '';
    script.beats.forEach((beat, i) => {
      const hay = `${beat.id} ${beat.when} ${beat.say.join(' ')}`.toLowerCase();
      if (this.filter && !hay.includes(this.filter)) return;
      into.append(this.beatEditor(script, beat, i));
    });
  }

  private beatEditor(script: SargeScript, beat: SargeBeat, index: number): HTMLElement {
    const d = el('details');
    d.open = this.openBeats.has(beat.id);
    d.classList.toggle('off', !!beat.off);
    d.addEventListener('toggle', () => {
      if (d.open) this.openBeats.add(beat.id);
      else this.openBeats.delete(beat.id);
    });
    const sum = el('summary');
    const id = el('span', 'id', beat.id);
    const txt = el('span', 'txt');
    const dur = el('span', 'dur');
    const redraw = () => {
      const first = beat.say[0] ?? '';
      txt.textContent = first.replace(/\[[^\]]*\]/g, '');
      const secs = Math.max(0, ...beat.say.map((s) => lineDurationMs(s, script.timing))) / 1000;
      dur.textContent = `≈${secs.toFixed(1)}s`;
      dur.classList.toggle('long', secs > 5);
    };
    redraw();
    sum.append(id, txt, dur);
    d.append(sum);

    const body = el('div', 'body');
    // When.
    const whenErr = el('div', 'err');
    const showErr = () => {
      whenErr.textContent = checkWhen(beat.when, script).join(' · ');
    };
    body.append(
      this.field(
        'When (all of these)',
        beat.when,
        (v) => {
          beat.when = v;
          showErr();
          this.changed();
        },
        'text',
        true,
      ),
      whenErr,
    );
    showErr();
    // Say.
    body.append(el('div', 'hint', 'He says (one variant per line; used in turn)'));
    const say = el('textarea');
    say.value = beat.say.join('\n');
    const perLine = el('div', 'hint');
    const lines = () => {
      perLine.textContent = beat.say
        .map((s) => `${(lineDurationMs(s, script.timing) / 1000).toFixed(1)}s`)
        .join(' · ');
    };
    lines();
    say.addEventListener('input', () => {
      beat.say = say.value.split('\n');
      redraw();
      lines();
      this.changed();
    });
    body.append(say, perLine);
    // Options.
    const opts = el('div', 'row');
    const flag = (key: 'repeat' | 'urgent' | 'stop' | 'off', label: string, title: string) => {
      const l = el('label');
      l.title = title;
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = !!beat[key];
      cb.addEventListener('change', () => {
        if (cb.checked) beat[key] = true;
        else delete beat[key];
        d.classList.toggle('off', !!beat.off);
        this.changed();
      });
      l.append(cb, document.createTextNode(label));
      return l;
    };
    opts.append(
      flag('repeat', 'repeat', 'Can fire again each time its condition turns true again'),
      flag('urgent', 'urgent', 'Cuts him off mid-sentence'),
      flag('stop', 'stop', "Later lines don't fire in the same moment"),
      flag('off', 'off', 'Switched off'),
    );
    body.append(opts);
    const more = el('div', 'row');
    more.append(
      this.field(
        'Least seconds between firings',
        beat.cooldownS ?? '',
        (v) => {
          const n = Number(v);
          if (v.trim() === '' || !Number.isFinite(n)) delete beat.cooldownS;
          else beat.cooldownS = n;
          this.changed();
        },
        'number',
      ),
      this.field('Id', beat.id, (v) => {
        beat.id = v;
        id.textContent = v;
        this.changed();
      }),
    );
    body.append(more);
    body.append(
      this.field('Note to self (he never says it)', beat.note ?? '', (v) => {
        if (v) beat.note = v;
        else delete beat.note;
        this.changed();
      }),
    );
    // Buttons.
    const btns = el('div', 'row');
    const mk = (label: string, run: () => void, cls?: string) => {
      const b = el('button', cls, label);
      b.addEventListener('click', run);
      return b;
    };
    btns.append(
      mk('▶ Say it now', () => this.host.say(beat.say.find((s) => s.trim()) ?? ''), 'go'),
      mk('↑', () => this.move(script.beats, index, -1)),
      mk('↓', () => this.move(script.beats, index, 1)),
      mk('Duplicate', () => {
        const copy = structuredClone(beat);
        copy.id = `${beat.id}.copy`;
        script.beats.splice(index + 1, 0, copy);
        this.openBeats.add(copy.id);
        this.restructure();
      }),
      mk('Delete', () => {
        if (!window.confirm(`Delete "${beat.id}"?`)) return;
        script.beats.splice(index, 1);
        this.restructure();
      }),
    );
    body.append(btns);
    d.append(body);
    return d;
  }

  private move<T>(list: T[], i: number, by: number): void {
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    this.restructure();
  }

  private placeEditor(script: SargeScript, p: SargePlace, i: number): HTMLElement {
    const d = el('details');
    const sum = el('summary');
    sum.append(el('span', 'id', p.id), el('span', 'txt', p.when));
    d.append(sum);
    const body = el('div', 'body');
    const err = el('div', 'err');
    const showErr = () => {
      err.textContent = checkWhen(p.when, script).join(' · ');
    };
    body.append(
      this.field(
        'When',
        p.when,
        (v) => {
          p.when = v;
          showErr();
          this.changed();
        },
        'text',
        true,
      ),
      err,
    );
    showErr();
    // Where: spot / point / sandbags opposite the next target.
    const kind = el('select');
    for (const [v, label] of [
      ['spot', 'a spot'],
      ['point', 'a point'],
      ['next', 'by the sandbags, opposite the next target'],
    ] as const) {
      const o = el('option', undefined, label);
      o.value = v;
      kind.append(o);
    }
    kind.value = 'spot' in p.at ? 'spot' : 'nextTarget' in p.at ? 'next' : 'point';
    kind.addEventListener('change', () => {
      p.at =
        kind.value === 'spot'
          ? { spot: script.spots[0]?.id ?? '' }
          : kind.value === 'next'
            ? { nextTarget: true, dx: -30 }
            : { x: 600, y: 3600 };
      this.restructure();
    });
    body.append(el('div', 'hint', 'Stands at'), kind);
    const at = el('div', 'row');
    if ('spot' in p.at) {
      const at0 = p.at;
      at.append(
        this.field('Spot id', at0.spot, (v) => {
          at0.spot = v;
          this.changed();
        }),
      );
    } else if ('nextTarget' in p.at) {
      const at0 = p.at;
      at.append(
        this.field(
          'Distance west of the bags',
          -at0.dx,
          (v) => {
            at0.dx = -Number(v) || 0;
            this.changed();
          },
          'number',
        ),
      );
    } else {
      const at0 = p.at;
      at.append(
        this.field(
          'x',
          at0.x,
          (v) => {
            at0.x = Number(v) || 0;
            this.changed();
          },
          'number',
        ),
        this.field(
          'y',
          at0.y,
          (v) => {
            at0.y = Number(v) || 0;
            this.changed();
          },
          'number',
        ),
      );
    }
    at.append(
      this.field(
        'Faces (° 0 east, -90 north)',
        p.face,
        (v) => {
          p.face = Number(v) || 0;
          this.changed();
        },
        'number',
      ),
    );
    body.append(at);
    const btns = el('div', 'row');
    const mk = (label: string, run: () => void) => {
      const b = el('button', undefined, label);
      b.addEventListener('click', run);
      return b;
    };
    btns.append(
      mk('↑', () => this.move(script.places, i, -1)),
      mk('↓', () => this.move(script.places, i, 1)),
      mk('Delete', () => {
        script.places.splice(i, 1);
        this.restructure();
      }),
    );
    body.append(btns);
    d.append(body);
    return d;
  }

  private spotEditor(script: SargeScript, s: SargeSpot, i: number): HTMLElement {
    const d = el('details');
    const sum = el('summary');
    sum.append(
      el('span', 'id', s.id),
      el('span', 'txt', s.rect ? 'a rectangle' : `(${s.x}, ${s.y})`),
    );
    d.append(sum);
    const body = el('div', 'body');
    const row = el('div', 'row');
    row.append(
      this.field('Id', s.id, (v) => {
        s.id = v;
        this.changed();
      }),
    );
    if (s.rect) {
      const r = s.rect;
      row.append(
        this.field(
          'x',
          r.x,
          (v) => {
            r.x = Number(v) || 0;
            this.changed();
          },
          'number',
        ),
        this.field(
          'y',
          r.y,
          (v) => {
            r.y = Number(v) || 0;
            this.changed();
          },
          'number',
        ),
        this.field(
          'width',
          r.w,
          (v) => {
            r.w = Number(v) || 0;
            this.changed();
          },
          'number',
        ),
        this.field(
          'height',
          r.h,
          (v) => {
            r.h = Number(v) || 0;
            this.changed();
          },
          'number',
        ),
      );
    } else {
      row.append(
        this.field(
          'x',
          s.x ?? 0,
          (v) => {
            s.x = Number(v) || 0;
            this.changed();
          },
          'number',
        ),
        this.field(
          'y',
          s.y ?? 0,
          (v) => {
            s.y = Number(v) || 0;
            this.changed();
          },
          'number',
        ),
      );
    }
    row.append(
      this.field(
        s.rect ? 'Margin' : 'Radius',
        s.radius,
        (v) => {
          s.radius = Number(v) || 0;
          this.changed();
        },
        'number',
      ),
    );
    body.append(row);
    const del = el('button', undefined, 'Delete');
    del.addEventListener('click', () => {
      script.spots.splice(i, 1);
      this.restructure();
    });
    body.append(del);
    d.append(body);
    return d;
  }
}
