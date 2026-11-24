import { GROUND, PAINT_KINDS, type GroundKind } from '../../content/ground';
import { str, strDynamic, type StringKey } from '../../content/strings';
import {
  insideLayout,
  insideLayoutCell,
  parseScenarioLayout,
  SCENARIO_MATERIALS,
  SCENARIO_MAX_CELLS,
  SCENARIO_MIN_CELLS,
  scenarioSpawnProblem,
  validScenarioSize,
  type LayoutItem,
  type ScenarioLayout,
} from '../../gen/scenario-layout';
import type { Vec2 } from '../../sim/core/vec';
import type { CoverMaterial, Rect } from '../../sim/world/map';
import { el, injectStyle } from '../dom';
import { EditHistory } from './edit-history';

const css = `
.aoo-scenario { position: fixed; inset: 0; display: grid; grid-template-columns: 205px minmax(0,1fr);
  background: #111418; color: #e7e9ec; font: 13px/1.35 system-ui,sans-serif; }
.aoo-scenario aside { overflow: auto; padding: 12px; background: #181c21; border-right: 1px solid #343c46; }
.aoo-scenario h1 { font-size: 17px; margin: 12px 0; }
.aoo-scenario h2 { font-size: 12px; margin: 14px 0 6px; }
.aoo-scenario p { color: #aeb6c0; margin: 6px 0; }
.aoo-scenario button, .aoo-scenario input, .aoo-scenario select {
  font: inherit; color: inherit; background: #232930; border: 1px solid #343c46;
  padding: 5px; border-radius: 4px; min-width: 0; }
.aoo-scenario button:hover:enabled { background: #2c343d; cursor: pointer; }
.aoo-scenario button[aria-pressed="true"], .aoo-scenario button.play:enabled {
  background: #2f5b86; border-color: #4a86bd; }
.aoo-scenario button:disabled { opacity: .45; }
.aoo-scenario .row { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 4px; }
.aoo-scenario .col, .aoo-scenario label { display: grid; gap: 4px; }
.aoo-scenario canvas { width: 100%; height: 100%; display: block; touch-action: none; }
.aoo-scenario .stage { min-height: 0; }
.aoo-scenario .warning { color: #f0b37e; }
`;

type Tool = 'paint' | 'wall' | 'cover' | 'spawn' | 'erase';
type Stroke = { id: number; start: Vec2; last: Vec2; before: ScenarioLayout };

interface ScenarioActions {
  save(layout: ScenarioLayout): boolean;
  play(layout: ScenarioLayout): boolean;
  openBlocks(): void;
}

function cellRect(a: Vec2, b: Vec2): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x) + 1,
    h: Math.abs(a.y - b.y) + 1,
  };
}

export class ScenarioView {
  private readonly canvas = el('canvas');
  private readonly ctx = this.canvas.getContext('2d')!;
  private readonly history = new EditHistory<ScenarioLayout>();
  private readonly status = el('p', 'warning');
  private readonly problem = el('p', 'warning');
  private readonly toolHelp = el('p');
  private readonly colsInput = el('input');
  private readonly rowsInput = el('input');
  private readonly undoButton: HTMLButtonElement;
  private readonly redoButton: HTMLButtonElement;
  private readonly playButton: HTMLButtonElement;
  private readonly tools = new Map<HTMLButtonElement, () => boolean>();
  private tool: Tool = 'paint';
  private terrain: GroundKind = 'D';
  private material: CoverMaterial = 'sandbags';
  private stroke: Stroke | null = null;
  private grid = { x: 0, y: 0, size: 1 };

  constructor(
    host: HTMLElement,
    private layout: ScenarioLayout,
    private readonly actions: ScenarioActions,
  ) {
    injectStyle('aoo-scenario', css);
    const root = el('div', 'aoo-scenario');
    const sidebar = el('aside');
    const stage = el('div', 'stage');
    stage.append(this.canvas);
    root.append(sidebar, stage);
    host.append(root);
    this.canvas.setAttribute('aria-label', str('scenario.canvas'));

    sidebar.append(
      this.button('editor.title', actions.openBlocks),
      el('h1', '', str('scenario.title')),
    );
    const size = el('form', 'col');
    const dimensions = el('div', 'row');
    dimensions.append(
      this.dimension('scenario.columns', this.colsInput),
      this.dimension('scenario.rows', this.rowsInput),
    );
    const resize = el('button', '', str('scenario.resize'));
    resize.type = 'submit';
    size.onsubmit = (event) => {
      event.preventDefault();
      this.resize();
    };
    size.append(dimensions, resize);
    sidebar.append(size, el('h2', '', str('editor.ground')));
    const paint = el('div', 'row');
    for (const kind of PAINT_KINDS) {
      const swatch = el('button', '', strDynamic(GROUND[kind].nameKey));
      swatch.type = 'button';
      swatch.onclick = () => {
        this.terrain = kind;
        this.useTool('paint');
      };
      swatch.style.borderLeftColor = this.groundColor(kind);
      swatch.style.borderLeftWidth = '5px';
      paint.append(swatch);
      this.tools.set(swatch, () => this.tool === 'paint' && this.terrain === kind);
    }

    const objects = el('div', 'row');
    for (const [tool, label] of [
      ['wall', 'editor.kind.wall'],
      ['cover', 'editor.kind.cover'],
      ['spawn', 'scenario.spawn'],
      ['erase', 'scenario.erase'],
    ] as const) {
      const button = this.button(label, () => this.useTool(tool));
      objects.append(button);
      this.tools.set(button, () => this.tool === tool);
    }
    const coverLabel = el('label', '', str('editor.prop.material'));
    const materials = el('select');
    for (const material of SCENARIO_MATERIALS) {
      const option = el('option', '', str(`editor.material.${material}`));
      option.value = material;
      materials.append(option);
    }
    materials.onchange = () => {
      this.material = SCENARIO_MATERIALS[materials.selectedIndex] ?? 'sandbags';
      this.useTool('cover');
    };
    coverLabel.append(materials);
    sidebar.append(paint, el('h2', '', str('editor.place')), objects, coverLabel, this.toolHelp);

    const history = el('div', 'row');
    this.undoButton = this.button('scenario.undo', () => this.undo());
    this.redoButton = this.button('scenario.redo', () => this.undo(true));
    history.append(this.undoButton, this.redoButton);
    const files = el('div', 'col');
    const file = el('input');
    file.type = 'file';
    file.accept = '.json,application/json';
    file.hidden = true;
    file.onchange = () => {
      const selected = file.files?.[0];
      file.value = '';
      if (selected) void this.importFile(selected, this.layout);
    };
    this.playButton = this.button('scenario.play', () => {
      if (!actions.play(this.layout)) this.showStatus('scenario.previewFailed');
    });
    this.playButton.className = 'play';
    this.status.setAttribute('role', 'status');
    this.problem.setAttribute('role', 'status');
    files.append(
      this.button('editor.upload', () => file.click()),
      this.button('editor.download', () => this.download()),
      file,
      this.playButton,
    );
    sidebar.append(history, el('h2', '', str('editor.file')), files, this.problem, this.status);

    new ResizeObserver(() => this.draw()).observe(stage);
    this.canvas.onpointerdown = (event) => this.startStroke(event);
    this.canvas.onpointermove = (event) => this.moveStroke(event);
    this.canvas.onpointerup = (event) => this.finishStroke(event);
    this.canvas.onlostpointercapture = (event) => this.finishStroke(event, true);
    window.addEventListener('keydown', (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        this.undo(event.shiftKey);
      }
    });
    this.refresh();
  }

  private get cols(): number {
    return this.layout.ground[0]!.length;
  }

  private get rows(): number {
    return this.layout.ground.length;
  }

  private button(label: StringKey, click: () => void): HTMLButtonElement {
    const button = el('button', '', str(label));
    button.type = 'button';
    button.onclick = click;
    return button;
  }

  private dimension(label: StringKey, input: HTMLInputElement): HTMLElement {
    input.type = 'number';
    input.min = String(SCENARIO_MIN_CELLS);
    input.max = String(SCENARIO_MAX_CELLS);
    input.required = true;
    const field = el('label', '', str(label));
    field.append(input);
    return field;
  }

  private resize(): void {
    const cols = this.colsInput.valueAsNumber;
    const rows = this.rowsInput.valueAsNumber;
    if (
      !validScenarioSize(cols) ||
      !validScenarioSize(rows) ||
      (cols === this.cols && rows === this.rows)
    )
      return;
    const { items, spawn, ground } = this.layout;
    if (
      items.some(({ rect }) => !insideLayout(rect, cols, rows)) ||
      (spawn && !insideLayout({ ...spawn, w: 1, h: 1 }, cols, rows))
    ) {
      this.showStatus('scenario.resizeBlocked');
      return;
    }
    this.commit({
      ...this.layout,
      ground: Array.from({ length: rows }, (_, y) =>
        (ground[y] ?? '').slice(0, cols).padEnd(cols, 'G'),
      ),
    });
  }

  private async importFile(file: File, previous: ScenarioLayout): Promise<void> {
    try {
      const layout = file.size <= 2 * 1024 * 1024 ? parseScenarioLayout(await file.text()) : null;
      if (this.layout !== previous || this.stroke) {
        this.showStatus('scenario.importChanged');
        return;
      }
      if (layout) this.commit(layout);
      else this.showStatus('scenario.badFile');
    } catch {
      this.showStatus('scenario.badFile');
    }
  }

  private download(): void {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(this.layout, null, 2) + '\n'], {
        type: 'application/json',
      }),
    );
    const link = el('a');
    link.href = url;
    link.download = 'scenario-layout.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  private showStatus(key?: StringKey): void {
    this.status.textContent = key ? str(key) : '';
  }

  private persist(): void {
    this.showStatus(this.actions.save(this.layout) ? undefined : 'scenario.saveFailed');
    this.refresh();
  }

  private commit(next: ScenarioLayout): void {
    if (this.stroke || next === this.layout) return;
    this.history.record(this.layout);
    this.layout = next;
    this.persist();
  }

  private undo(redo = false): void {
    if (this.stroke) return;
    const next = redo ? this.history.redo(this.layout) : this.history.undo(this.layout);
    if (!next) return;
    this.layout = next;
    this.persist();
  }

  private useTool(tool: Tool): void {
    if (this.stroke) return;
    this.tool = tool;
    this.refresh();
  }

  private refresh(): void {
    this.colsInput.value = String(this.cols);
    this.rowsInput.value = String(this.rows);
    this.undoButton.disabled = !this.history.canUndo;
    this.redoButton.disabled = !this.history.canRedo;
    for (const [button, active] of this.tools)
      button.setAttribute('aria-pressed', String(active()));
    this.toolHelp.textContent = str(`scenario.help.${this.tool}`);
    const problem = scenarioSpawnProblem(this.layout);
    this.problem.textContent = problem ? str(`scenario.problem.${problem}`) : '';
    this.playButton.disabled = problem !== null;
    this.draw();
  }

  private cell(event: PointerEvent, clamp: boolean): Vec2 | null {
    const box = this.canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - box.left - this.grid.x) / this.grid.size);
    const y = Math.floor((event.clientY - box.top - this.grid.y) / this.grid.size);
    if (clamp)
      return {
        x: Math.max(0, Math.min(this.cols - 1, x)),
        y: Math.max(0, Math.min(this.rows - 1, y)),
      };
    return x >= 0 && x < this.cols && y >= 0 && y < this.rows ? { x, y } : null;
  }

  private startStroke(event: PointerEvent): void {
    if (event.button !== 0 || this.stroke) return;
    const at = this.cell(event, false);
    if (!at) return;
    if (this.tool === 'spawn') {
      this.commit({ ...this.layout, spawn: at });
      return;
    }
    if (this.tool === 'erase') {
      this.erase(at);
      return;
    }
    this.stroke = { id: event.pointerId, start: at, last: at, before: this.layout };
    this.canvas.setPointerCapture(event.pointerId);
    if (this.tool === 'paint') this.paint(at, at);
    this.draw();
  }

  private moveStroke(event: PointerEvent): void {
    const stroke = this.stroke;
    if (!stroke || stroke.id !== event.pointerId) return;
    const at = this.cell(event, true)!;
    if (this.tool === 'paint') this.paint(stroke.last, at);
    stroke.last = at;
    this.draw();
  }

  private finishStroke(event: PointerEvent, cancel = false): void {
    const stroke = this.stroke;
    if (!stroke || stroke.id !== event.pointerId) return;
    if (!cancel) this.moveStroke(event);
    this.stroke = null;
    if (cancel) {
      this.layout = stroke.before;
      this.refresh();
      return;
    }
    if (this.tool === 'wall' || this.tool === 'cover') {
      const rect = cellRect(stroke.start, stroke.last);
      const item: LayoutItem =
        this.tool === 'wall'
          ? { kind: 'wall', rect }
          : { kind: 'cover', rect, material: this.material };
      this.commit({ ...this.layout, items: [...this.layout.items, item] });
    } else if (this.layout !== stroke.before) {
      this.history.record(stroke.before);
      this.persist();
    }
  }

  private erase(at: Vec2): void {
    const { items, spawn } = this.layout;
    const index = items.map(({ rect }) => insideLayoutCell(rect, at)).lastIndexOf(true);
    if (spawn?.x === at.x && spawn.y === at.y) this.commit({ ...this.layout, spawn: null });
    else if (index !== -1) {
      this.commit({ ...this.layout, items: items.filter((_, i) => i !== index) });
    }
  }

  private paint(from: Vec2, to: Vec2): void {
    const steps = Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y), 1);
    const ground = [...this.layout.ground];
    let changed = false;
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(from.x + ((to.x - from.x) * i) / steps);
      const y = Math.round(from.y + ((to.y - from.y) * i) / steps);
      const row = ground[y]!;
      if (row[x] === this.terrain) continue;
      ground[y] = row.slice(0, x) + this.terrain + row.slice(x + 1);
      changed = true;
    }
    if (changed) this.layout = { ...this.layout, ground };
  }

  private groundColor(kind: GroundKind): string {
    return `#${GROUND[kind].color.toString(16).padStart(6, '0')}`;
  }

  private draw(): void {
    const { canvas, ctx } = this;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const dpr = window.devicePixelRatio;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const size = Math.max(
      1,
      Math.floor(Math.min((width - 24) / this.cols, (height - 24) / this.rows)),
    );
    const x = Math.floor((width - size * this.cols) / 2);
    const y = Math.floor((height - size * this.rows) / 2);
    this.grid = { x, y, size };
    ctx.setTransform(dpr * size, 0, 0, dpr * size, dpr * x, dpr * y);
    const fill = (r: Rect, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(r.x, r.y, r.w, r.h);
    };
    for (const [row, ground] of this.layout.ground.entries()) {
      for (const [col, kind] of [...ground].entries()) {
        fill({ x: col, y: row, w: 1, h: 1 }, this.groundColor(kind as GroundKind));
      }
    }
    ctx.beginPath();
    for (let col = 0; col <= this.cols; col++) {
      ctx.moveTo(col, 0);
      ctx.lineTo(col, this.rows);
    }
    for (let row = 0; row <= this.rows; row++) {
      ctx.moveTo(0, row);
      ctx.lineTo(this.cols, row);
    }
    ctx.lineWidth = 1 / size;
    ctx.strokeStyle = '#11141888';
    ctx.stroke();
    for (const item of this.layout.items) {
      fill(item.rect, item.kind === 'wall' ? '#262c33' : '#b39b6b');
      ctx.strokeStyle = '#e7e9ec88';
      ctx.strokeRect(item.rect.x, item.rect.y, item.rect.w, item.rect.h);
    }
    if (this.stroke && (this.tool === 'wall' || this.tool === 'cover')) {
      fill(cellRect(this.stroke.start, this.stroke.last), '#e7e9ec88');
    }
    if (this.layout.spawn) {
      const spawn = this.layout.spawn;
      ctx.fillStyle = scenarioSpawnProblem(this.layout) ? '#ff8b74' : '#a4e7f9';
      ctx.beginPath();
      ctx.moveTo(spawn.x + 0.5, spawn.y + 0.18);
      ctx.lineTo(spawn.x + 0.82, spawn.y + 0.79);
      ctx.lineTo(spawn.x + 0.18, spawn.y + 0.79);
      ctx.closePath();
      ctx.fill();
    }
  }
}
