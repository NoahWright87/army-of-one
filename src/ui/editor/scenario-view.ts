import { imageAsset, type ImageKey } from '../../content/assets';
import { SIGN_KINDS } from '../../content/sign-styles';
import { TERRAIN_ART } from '../../content/terrain-art';
import { assetUrl } from '../../render/assets/asset-urls';
import { coverArtLayout } from '../../render/cover-art';
import { scenarioTemplate, type ScenarioTemplate } from '../../gen/scenario-templates';
import { GROUND, GROUND_KINDS, PAINT_KINDS, type GroundKind } from '../../content/ground';
import { str, strDynamic, type StringKey } from '../../content/strings';
import {
  AREA_KINDS,
  ladderPoint,
  layoutExtent,
  SCENARIO_CELL,
  insideLayout,
  insideLayoutCell,
  parseScenarioLayout,
  SCENARIO_MATERIALS,
  SCENARIO_MAX_CELLS,
  SCENARIO_MIN_CELLS,
  scenarioSpawnProblem,
  validScenarioSize,
  type AreaKind,
  type LayoutItem,
  type ScenarioLayout,
} from '../../gen/scenario-layout';
import type { Vec2 } from '../../sim/core/vec';
import type { CoverMaterial, Rect } from '../../sim/world/map';
import { el, injectStyle } from '../dom';
import { EditHistory } from './edit-history';
import { coverTiles, terrainTiles, tileStamp, wallTile } from './scenario-tiles';

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
.aoo-scenario .stage canvas { width: 100%; height: 100%; display: block; touch-action: none; }
.aoo-scenario .stage { position: relative; min-height: 0; }
.aoo-scenario .view-controls { position: absolute; right: 8px; bottom: 8px; display: flex; gap: 4px; }
.aoo-scenario .inspector select { width: 100%; }
.aoo-scenario .inspector label { margin-bottom: 4px; }
.aoo-scenario .warning { color: #f0b37e; }
.aoo-scenario .swatch { display: flex; gap: 5px; align-items: center; text-align: left; }
.aoo-scenario .thumbnail { width: 22px; height: 18px; display: inline-flex; flex: none; }
.aoo-scenario .thumbnail > * { width: 100%; height: 100%; object-fit: contain; }
@media (max-width: 640px) {
  .aoo-scenario { grid-template: minmax(0, 54%) minmax(0, 1fr) / minmax(0, 1fr); }
  .aoo-scenario .stage { grid-row: 1; }
  .aoo-scenario aside { grid-row: 2; border-right: 0; border-top: 1px solid #343c46; }
  .aoo-scenario button { min-height: 44px; }
}
`;

type Tool =
  | 'select'
  | 'pan'
  | 'area'
  | 'prop'
  | 'target'
  | 'gate'
  | 'ladder'
  | 'paint'
  | 'wall'
  | 'cover'
  | 'spawn'
  | 'erase';
type Stroke = { id: number; start: Vec2; last: Vec2; before: ScenarioLayout; client: Vec2 };
const PROP_IMAGES: readonly { image: ImageKey; label: StringKey }[] = [
  { image: 'hub_banner', label: 'scenario.prop.banner' },
  { image: SIGN_KINDS.mapTable.post, label: 'scenario.prop.table' },
  { image: SIGN_KINDS.tv.post, label: 'scenario.prop.tv' },
  { image: SIGN_KINDS.trophy.post, label: 'scenario.prop.trophy' },
  { image: SIGN_KINDS.guns.post, label: 'scenario.prop.guns' },
  { image: SIGN_KINDS.clipboard.post, label: 'scenario.prop.clipboard' },
  { image: SIGN_KINDS.wood.post, label: 'scenario.prop.sign' },
  { image: SIGN_KINDS.plain.post, label: 'scenario.prop.plain' },
  { image: SIGN_KINDS.plate.post, label: 'scenario.prop.plate' },
  { image: 'lever_a', label: 'editor.kind.lever' },
  { image: 'mine', label: 'editor.kind.mine' },
  { image: 'capture_base', label: 'scenario.prop.flag' },
];
const AREA_COLORS: Record<AreaKind, string> = {
  water: '#4385ad',
  raised: '#937d5e',
  bush: '#354d2d',
  trench: '#775741',
  mist: '#d1d9c47a',
};

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
  private readonly selection = el('div', 'inspector');
  private readonly canvasWrap = el('div', 'stage');
  private readonly images = new Map<ImageKey, HTMLImageElement>();
  private readonly tools = new Map<HTMLButtonElement, () => boolean>();
  private readonly terrainStamps = new Map(
    GROUND_KINDS.map((kind) => [kind, tileStamp(terrainTiles[kind])]),
  );
  private readonly wallStamp = tileStamp(wallTile);
  private readonly coverStamps = new Map(
    SCENARIO_MATERIALS.map((material) => [material, tileStamp(coverTiles[material])]),
  );
  private tool: Tool = 'paint';
  private terrain: GroundKind = 'D';
  private material: CoverMaterial = 'sandbags';
  private stroke: Stroke | null = null;
  private area: AreaKind = 'raised';
  private propImage: ImageKey = 'hub_banner';
  private selected = -1;
  private zoom = 1;
  private pan = { x: 0, y: 0 };
  private grid = { x: 0, y: 0, size: 1 };

  constructor(
    host: HTMLElement,
    private layout: ScenarioLayout,
    private readonly actions: ScenarioActions,
  ) {
    injectStyle('aoo-scenario', css);
    const root = el('div', 'aoo-scenario');
    const sidebar = el('aside');
    const stage = this.canvasWrap;
    stage.append(this.canvas);
    root.append(sidebar, stage);
    host.append(root);
    this.canvas.setAttribute('aria-label', str('scenario.canvas'));

    sidebar.append(
      this.button('editor.title', actions.openBlocks),
      el('h1', '', str('scenario.title')),
    );
    const templates = el('div', 'row');
    for (const [id, title] of [
      ['hq', 'hub.name'],
      ['basic-training', 'map.basic.name'],
    ] as const) {
      templates.append(this.button(title, () => this.openTemplate(id)));
    }
    sidebar.append(el('h2', '', str('scenario.templates')), templates);
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
      swatch.className = 'swatch';
      const icon = tileStamp(terrainTiles[kind]);
      icon.setAttribute('aria-hidden', 'true');
      swatch.prepend(this.thumbnail(TERRAIN_ART[kind], icon));
      paint.append(swatch);
      this.tools.set(swatch, () => this.tool === 'paint' && this.terrain === kind);
    }

    const objects = el('div', 'row');
    for (const [tool, label] of [
      ['select', 'scenario.select'],
      ['pan', 'scenario.pan'],
      ['wall', 'editor.kind.wall'],
      ['gate', 'editor.kind.gate'],
      ['ladder', 'scenario.ladder'],
      ['target', 'scenario.target'],
      ['spawn', 'scenario.spawn'],
      ['erase', 'scenario.erase'],
    ] as const) {
      const button = this.button(label, () => this.useTool(tool));
      if (tool === 'wall') {
        button.className = 'swatch';
        const icon = tileStamp(wallTile);
        icon.setAttribute('aria-hidden', 'true');
        button.prepend(this.thumbnail(TERRAIN_ART.X, icon));
      }
      objects.append(button);
      this.tools.set(button, () => this.tool === tool);
    }
    const covers = el('div', 'row');
    for (const material of SCENARIO_MATERIALS) {
      const button = this.button(`editor.material.${material}`, () => {
        this.material = material;
        this.useTool('cover');
      });
      button.className = 'swatch';
      const icon = tileStamp(coverTiles[material]);
      icon.setAttribute('aria-hidden', 'true');
      button.prepend(
        this.thumbnail(
          coverArtLayout({ id: '', material, rect: { x: 0, y: 0, w: 1, h: 1 } }, false).key,
          icon,
        ),
      );
      covers.append(button);
      this.tools.set(button, () => this.tool === 'cover' && this.material === material);
    }
    const areas = this.toolPicker(
      'scenario.area',
      AREA_KINDS.map((area) => ({ value: area, label: `scenario.area.${area}` as const })),
      (area) => {
        this.area = area;
        this.useTool('area');
      },
    );
    const props = this.toolPicker(
      'scenario.props',
      PROP_IMAGES.map(({ image, label }) => ({ value: image, label })),
      (image) => {
        this.propImage = image;
        this.useTool('prop');
      },
    );
    sidebar.append(
      paint,
      el('h2', '', str('editor.place')),
      objects,
      areas,
      props,
      el('h2', '', str('editor.kind.cover')),
      covers,
      this.toolHelp,
      this.selection,
    );

    const viewControls = el('div', 'view-controls');
    viewControls.append(
      this.button('scenario.zoomOut', () => this.zoomAt(1 / 1.4)),
      this.button('scenario.fit', () => this.fit()),
      this.button('scenario.zoomIn', () => this.zoomAt(1.4)),
    );
    stage.append(viewControls);

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
    this.canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        const box = this.canvas.getBoundingClientRect();
        this.zoomAt(event.deltaY < 0 ? 1.18 : 1 / 1.18, {
          x: event.clientX - box.left,
          y: event.clientY - box.top,
        });
      },
      { passive: false },
    );
    this.canvas.onlostpointercapture = (event) => this.finishStroke(event, true);
    window.addEventListener('keydown', (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)
        return;
      if (event.key === 'Delete' && this.selected >= 0) this.deleteSelected();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        this.undo(event.shiftKey);
      }
    });
    this.refresh();
  }

  private thumbnail(key: ImageKey, fallback: HTMLCanvasElement): HTMLElement {
    const thumb = el('span', 'thumbnail');
    thumb.setAttribute('aria-hidden', 'true');
    const image = el('img');
    image.alt = '';
    image.onerror = () => image.replaceWith(fallback);
    image.src = assetUrl(key);
    thumb.append(image);
    return thumb;
  }

  private art(key: ImageKey): HTMLImageElement | undefined {
    let image = this.images.get(key);
    if (!image) {
      image = new Image();
      image.onload = () => this.draw();
      image.src = assetUrl(key);
      this.images.set(key, image);
    }
    return image.complete && image.naturalWidth ? image : undefined;
  }

  private toolPicker<T extends string>(
    label: StringKey,
    options: readonly { label: StringKey; value: T }[],
    choose: (value: T) => void,
  ): HTMLElement {
    const row = el('div', 'row');
    const select = el('select');
    select.setAttribute('aria-label', str(label));
    for (const entry of options) {
      const option = el('option', '', str(entry.label));
      option.value = entry.value;
      select.append(option);
    }
    const activate = () => {
      const entry = options[select.selectedIndex];
      if (entry) choose(entry.value);
    };
    select.onchange = activate;
    row.append(select, this.button(label, activate));
    return row;
  }

  private openTemplate(id: ScenarioTemplate): void {
    if (this.stroke) return;
    const hasWork =
      this.layout.extent ||
      this.layout.spawn ||
      this.layout.items.length ||
      this.layout.ground.some((row) => /[^G]/.test(row));
    if (hasWork && !window.confirm(str('scenario.replaceDraft'))) return;
    const layout = scenarioTemplate(id);
    this.tool = 'select';
    this.selected = -1;
    this.fit();
    this.commit(layout);
  }

  private get worldSize(): Vec2 {
    const { width, height } = layoutExtent(this.layout);
    return { x: width / SCENARIO_CELL, y: height / SCENARIO_CELL };
  }

  private fit(): void {
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.draw();
  }

  private zoomAt(
    factor: number,
    at = { x: this.canvas.clientWidth / 2, y: this.canvas.clientHeight / 2 },
  ): void {
    if (this.stroke) return;
    const next = Math.max(1, Math.min(32, this.zoom * factor));
    const ratio = next / this.zoom;
    if (next === 1) {
      this.fit();
      return;
    }
    this.pan = {
      x:
        (this.pan.x + this.canvas.clientWidth / 2 - at.x) * ratio -
        this.canvas.clientWidth / 2 +
        at.x,
      y:
        (this.pan.y + this.canvas.clientHeight / 2 - at.y) * ratio -
        this.canvas.clientHeight / 2 +
        at.y,
    };
    this.zoom = next;
    this.draw();
  }

  private itemName(item: LayoutItem): string {
    switch (item.kind) {
      case 'cover':
        return str(`editor.material.${item.material}`);
      case 'wall':
      case 'gate':
        return str(`editor.kind.${item.kind}`);
      case 'prop': {
        const found = PROP_IMAGES.find((p) => p.image === item.image);
        return found ? str(found.label) : item.image;
      }
      case 'ladder':
      case 'target':
        return str(`scenario.${item.kind}`);
      default:
        return str(`scenario.area.${item.kind}`);
    }
  }

  private updateSelected(item: LayoutItem): void {
    const size = this.worldSize;
    if (!insideLayout(item.rect, size.x, size.y)) {
      this.showStatus('scenario.pieceBounds');
      this.renderSelection();
      return;
    }
    this.commit({
      ...this.layout,
      items: this.layout.items.map((old, index) => (index === this.selected ? item : old)),
    });
  }

  private deleteSelected(): void {
    if (this.selected < 0 || this.stroke) return;
    const items = this.layout.items.filter((_, i) => i !== this.selected);
    this.selected = -1;
    this.commit({ ...this.layout, items });
  }

  private renderSelection(): void {
    const item = this.layout.items[this.selected];
    this.selection.replaceChildren();
    if (this.tool !== 'select') return;
    const picker = el('select');
    picker.setAttribute('aria-label', str('scenario.pieces'));
    const empty = el('option', '', str('scenario.pieces'));
    empty.value = '-1';
    picker.append(empty);
    this.layout.items.forEach((piece, index) => {
      const { x, y } = piece.rect;
      const option = el(
        'option',
        '',
        `${this.itemName(piece)} · ${Math.round(x * SCENARIO_CELL)}, ${Math.round(y * SCENARIO_CELL)}`,
      );
      option.value = String(index);
      picker.append(option);
    });
    picker.value = String(this.selected);
    picker.onchange = () => {
      this.selected = Number(picker.value);
      const piece = this.layout.items[this.selected];
      if (piece) {
        this.zoom = Math.max(this.zoom, 2);
        const world = this.worldSize;
        const size =
          Math.min(
            (this.canvas.clientWidth - 24) / world.x,
            (this.canvas.clientHeight - 24) / world.y,
          ) * this.zoom;
        this.pan = {
          x: (world.x / 2 - piece.rect.x - piece.rect.w / 2) * size,
          y: (world.y / 2 - piece.rect.y - piece.rect.h / 2) * size,
        };
      }
      this.refresh();
    };
    this.selection.append(picker);
    if (!item) return;
    const label = el('h2', '', this.itemName(item));
    const fields = el('div', 'row');
    for (const [axis, key] of [
      ['x', 'scenario.x'],
      ['y', 'scenario.y'],
      ['w', 'scenario.width'],
      ['h', 'scenario.height'],
    ] as const) {
      const field = el('label', '', str(key));
      const input = el('input');
      input.type = 'number';
      input.step = 'any';
      input.value = String(Math.round(item.rect[axis] * SCENARIO_CELL * 100) / 100);
      input.onchange = () => {
        this.updateSelected({
          ...item,
          rect: { ...item.rect, [axis]: input.valueAsNumber / SCENARIO_CELL },
        });
      };
      field.append(input);
      fields.append(field);
    }
    this.selection.append(label, fields);
    if (item.kind === 'cover') {
      const field = el('label', '', str('editor.prop.material'));
      const material = el('select');
      for (const choice of SCENARIO_MATERIALS) {
        const option = el('option', '', str(`editor.material.${choice}`));
        option.value = choice;
        material.append(option);
      }
      material.value = item.material;
      material.onchange = () => {
        const choice = SCENARIO_MATERIALS[material.selectedIndex];
        if (choice) this.updateSelected({ ...item, material: choice });
      };
      field.append(material);
      this.selection.append(field);
    }
    if (item.kind === 'gate') {
      const field = el('label', '', str('editor.prop.open'));
      const toggle = el('input');
      toggle.type = 'checkbox';
      toggle.checked = item.open;
      toggle.onchange = () => this.updateSelected({ ...item, open: toggle.checked });
      field.prepend(toggle);
      this.selection.append(field);
    }
    this.selection.append(this.button('editor.delete', () => this.deleteSelected()));
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
      (spawn &&
        !insideLayoutCell({ x: 0, y: 0, w: cols, h: rows }, { x: spawn.x + 0.5, y: spawn.y + 0.5 }))
    ) {
      this.showStatus('scenario.resizeBlocked');
      return;
    }
    this.commit({
      ...this.layout,
      ...(this.layout.extent
        ? {
            extent: {
              width: cols === this.cols ? this.layout.extent.width : cols * SCENARIO_CELL,
              height: rows === this.rows ? this.layout.extent.height : rows * SCENARIO_CELL,
            },
          }
        : {}),
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
      if (layout) {
        this.selected = -1;
        this.fit();
        this.commit(layout);
      } else this.showStatus('scenario.badFile');
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
    this.selected = -1;
    this.persist();
  }

  private useTool(tool: Tool): void {
    if (this.stroke) return;
    this.tool = tool;
    if (tool !== 'select') this.selected = -1;
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
    this.renderSelection();
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

  private point(event: PointerEvent): Vec2 {
    const box = this.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - box.left - this.grid.x) / this.grid.size,
      y: (event.clientY - box.top - this.grid.y) / this.grid.size,
    };
  }

  private startStroke(event: PointerEvent): void {
    if (event.button !== 0 || this.stroke) return;
    const point = this.point(event);
    const size = this.worldSize;
    const inside = insideLayoutCell({ x: 0, y: 0, w: size.x, h: size.y }, point);
    if (!inside && this.tool !== 'pan') return;
    const cell = this.cell(event, true)!;
    if (this.tool === 'spawn') {
      this.commit({
        ...this.layout,
        spawn: {
          x: Math.min(cell.x, size.x - 0.51),
          y: Math.min(cell.y, size.y - 0.51),
        },
      });
      return;
    }
    if (this.tool === 'erase') {
      this.erase(point);
      return;
    }
    if (this.tool === 'select') {
      this.selected = this.layout.items
        .map(({ rect }) => insideLayoutCell(rect, point))
        .lastIndexOf(true);
      this.refresh();
      if (this.selected < 0) return;
    }
    const at = this.tool === 'paint' ? cell : point;
    this.stroke = {
      id: event.pointerId,
      start: at,
      last: at,
      before: this.layout,
      client: { x: event.clientX, y: event.clientY },
    };
    this.canvas.setPointerCapture(event.pointerId);
    if (this.tool === 'paint') this.paint(cell, cell);
    this.draw();
  }

  private moveStroke(event: PointerEvent): void {
    const stroke = this.stroke;
    if (!stroke || stroke.id !== event.pointerId) return;
    if (this.tool === 'pan') {
      this.pan.x += event.clientX - stroke.client.x;
      this.pan.y += event.clientY - stroke.client.y;
      stroke.client = { x: event.clientX, y: event.clientY };
    } else if (this.tool === 'paint') {
      const at = this.cell(event, true)!;
      this.paint(stroke.last, at);
      stroke.last = at;
    } else {
      stroke.last = this.point(event);
    }
    this.draw();
  }

  private movedItem(stroke: Stroke): LayoutItem | undefined {
    const item = stroke.before.items[this.selected];
    if (!item) return undefined;
    const size = this.worldSize;
    const delta = (axis: 'x' | 'y') =>
      Math.round((stroke.last[axis] - stroke.start[axis]) * SCENARIO_CELL) / SCENARIO_CELL;
    const x = Math.max(0, Math.min(size.x - item.rect.w, item.rect.x + delta('x')));
    const y = Math.max(0, Math.min(size.y - item.rect.h, item.rect.y + delta('y')));
    return x === item.rect.x && y === item.rect.y
      ? undefined
      : { ...item, rect: { ...item.rect, x, y } };
  }

  private placedItem(stroke: Stroke): LayoutItem | undefined {
    const size = this.worldSize;
    const cell = (p: Vec2) => ({
      x: Math.max(0, Math.min(this.cols - 1, Math.floor(p.x))),
      y: Math.max(0, Math.min(this.rows - 1, Math.floor(p.y))),
    });
    const footprint = cellRect(cell(stroke.start), cell(stroke.last));
    const rect = {
      ...footprint,
      w: Math.min(footprint.w, size.x - footprint.x),
      h: Math.min(footprint.h, size.y - footprint.y),
    };
    switch (this.tool) {
      case 'wall':
        return { kind: 'wall', rect };
      case 'cover':
        return { kind: 'cover', rect, material: this.material };
      case 'area':
        return { kind: this.area, rect };
      case 'gate':
        return { kind: 'gate', rect, open: false };
      case 'target':
        return { kind: 'target', rect };
      case 'prop': {
        const { w, h } = imageAsset(this.propImage).size;
        const height = Math.min(rect.h, (rect.w * h) / w);
        const width = (height * w) / h;
        return {
          kind: 'prop',
          image: this.propImage,
          rect: {
            x: rect.x + (rect.w - width) / 2,
            y: rect.y + (rect.h - height) / 2,
            w: width,
            h: height,
          },
        };
      }
      case 'ladder': {
        const up = stroke.start.y >= stroke.last.y;
        return {
          kind: 'ladder',
          rect,
          bottom: { x: 0.5, y: up ? 0.85 : 0.15 },
          top: { x: 0.5, y: up ? 0.15 : 0.85 },
        };
      }
    }
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
    if (this.tool === 'select') {
      const item = this.movedItem(stroke);
      if (item) this.updateSelected(item);
      else this.draw();
      return;
    }
    const item = this.placedItem(stroke);
    if (item) this.commit({ ...this.layout, items: [...this.layout.items, item] });
    else if (this.layout !== stroke.before) {
      this.history.record(stroke.before);
      this.persist();
    }
  }

  private erase(at: Vec2): void {
    const { items, spawn } = this.layout;
    const index = items.map(({ rect }) => insideLayoutCell(rect, at)).lastIndexOf(true);
    if (spawn && insideLayoutCell({ ...spawn, w: 1, h: 1 }, at))
      this.commit({ ...this.layout, spawn: null });
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

  private draw(): void {
    const { canvas, ctx } = this;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const dpr = window.devicePixelRatio;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const world = this.worldSize;
    const fit = Math.min((width - 24) / world.x, (height - 24) / world.y);
    const size = Math.max(0.1, fit * this.zoom);
    this.pan.x = Math.max((-world.x * size) / 2, Math.min((world.x * size) / 2, this.pan.x));
    this.pan.y = Math.max((-world.y * size) / 2, Math.min((world.y * size) / 2, this.pan.y));
    const x = Math.floor((width - size * world.x) / 2 + this.pan.x);
    const y = Math.floor((height - size * world.y) / 2 + this.pan.y);
    this.grid = { x, y, size };
    ctx.setTransform(dpr * size, 0, 0, dpr * size, dpr * x, dpr * y);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, world.x, world.y);
    ctx.clip();
    const left = Math.max(0, Math.floor(-x / size));
    const top = Math.max(0, Math.floor(-y / size));
    const right = Math.min(this.cols, Math.ceil((width - x) / size));
    const bottom = Math.min(this.rows, Math.ceil((height - y) / size));
    for (let row = top; row < bottom; row++) {
      for (let col = left; col < right; col++) {
        const kind = this.layout.ground[row]![col] as GroundKind;
        const image = this.art(TERRAIN_ART[kind]) ?? this.terrainStamps.get(kind)!;
        if (
          image instanceof HTMLImageElement &&
          image.naturalWidth >= 128 &&
          image.naturalHeight >= 128
        ) {
          ctx.drawImage(image, (col & 1) * 64, (row & 1) * 64, 64, 64, col, row, 1, 1);
        } else ctx.drawImage(image, col, row, 1, 1);
      }
    }
    if (size >= 12) {
      ctx.beginPath();
      for (let col = left; col <= right; col++) {
        ctx.moveTo(col, top);
        ctx.lineTo(col, bottom);
      }
      for (let row = top; row <= bottom; row++) {
        ctx.moveTo(left, row);
        ctx.lineTo(right, row);
      }
      ctx.lineWidth = 1 / size;
      ctx.strokeStyle = '#11141866';
      ctx.stroke();
    }
    for (const [i, item] of this.layout.items.entries()) {
      const moving = this.tool === 'select' && i === this.selected && this.stroke;
      this.drawItem(moving ? (this.movedItem(moving) ?? item) : item, i === this.selected);
    }
    if (this.stroke) {
      const item = this.placedItem(this.stroke);
      if (item) {
        ctx.globalAlpha = 0.65;
        this.drawItem(item, false);
        ctx.globalAlpha = 1;
      }
    }
    if (this.layout.spawn) {
      const spawn = this.layout.spawn;
      const r = Math.max(0.31, 3 / size);
      ctx.fillStyle = scenarioSpawnProblem(this.layout) ? '#ff8b74' : '#a4e7f9';
      ctx.beginPath();
      ctx.moveTo(spawn.x + 0.5, spawn.y + 0.5 - r);
      ctx.lineTo(spawn.x + 0.5 + r, spawn.y + 0.5 + r);
      ctx.lineTo(spawn.x + 0.5 - r, spawn.y + 0.5 + r);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private drawItem(item: LayoutItem, selected: boolean): void {
    const ctx = this.ctx;
    const {
      rect: { x, y, w, h },
    } = item;
    let image: CanvasImageSource | undefined;
    if (item.kind === 'cover') {
      const art = coverArtLayout({ id: '', rect: item.rect, material: item.material }, false);
      image = this.art(art.key);
      if (image instanceof HTMLImageElement) {
        ctx.save();
        ctx.translate(art.x, art.y);
        ctx.rotate(art.rotation);
        const pattern = ctx.createPattern(image, 'repeat-x');
        if (pattern) {
          pattern.setTransform(
            new DOMMatrix()
              .translate(-art.width / 2, -art.height / 2)
              .scale(art.tileScale, art.height / image.naturalHeight),
          );
          ctx.fillStyle = pattern;
          ctx.fillRect(-art.width / 2, -art.height / 2, art.width, art.height);
        }
        ctx.restore();
        image = undefined;
      } else image = this.coverStamps.get(item.material);
    } else if (item.kind === 'water') {
      image = this.art(TERRAIN_ART.W) ?? this.terrainStamps.get('W');
    } else if (item.kind === 'wall') {
      image = this.art(TERRAIN_ART.X) ?? this.wallStamp;
    } else if (item.kind === 'gate') {
      image = this.art(item.open ? 'gate_open' : 'gate_closed');
    } else if (item.kind === 'prop' || item.kind === 'target') {
      image = this.art(item.kind === 'prop' ? item.image : 'target_dummy');
    } else if (item.kind === 'ladder') {
      const a = ladderPoint(item.rect, item.bottom);
      const b = ladderPoint(item.rect, item.top);
      ctx.lineWidth = Math.max(0.08, 2 / this.grid.size);
      ctx.strokeStyle = '#f0ce99';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    } else {
      ctx.fillStyle = AREA_COLORS[item.kind];
      ctx.fillRect(x, y, w, h);
    }
    if (image) ctx.drawImage(image, x, y, w, h);
    ctx.strokeStyle = selected ? '#77dfff' : item.kind === 'wall' ? '#bac6cd' : '#e7e9ec88';
    ctx.lineWidth = (selected ? 2 : 0.9) / this.grid.size;
    ctx.strokeRect(x, y, w, h);
  }
}
