/**
 * The map editor ([D88]): blocks (stitched into random levels) and scenarios (whole maps,
 * played as is) in one screen. Works with a mouse or a finger: tools sit in layer tabs
 * (Ground, Build, Props, Weather, Logic, Enemies, File) beside the map on a wide screen and
 * under it on a phone. The map pans and zooms; each layer edits only its own things, the rest
 * are faded behind.
 *
 * All edits go through `EditorModel` (undo, gestures); this file only turns pointer and keys into
 * model calls and draws. Plays the document in the real game via `actions.play`.
 */
import { imageAsset, type ImageKey } from '../../content/assets';
import { EDGE_PRESETS, GROUND, GROUND_KINDS, PAINT_KINDS } from '../../content/ground';
import { ROLES } from '../../content/roles';
import { SIGN_KINDS } from '../../content/sign-styles';
import { str, strDynamic, type StringKey } from '../../content/strings';
import { TERRAIN_ART } from '../../content/terrain-art';
import type { RoleId } from '../../contracts/mission';
import { addPaintedBushes, addPaintedTrenches, maskRects } from '../../gen/assemble';
import {
  ALWAYS_KINDS,
  MAX_CELLS,
  MAX_MIST_COATS,
  MIN_CELLS,
  PRIORITIES,
  SIDES,
  blockSize,
  groupIds,
  isRectItem,
  isScenario,
  onEdge,
  spawnBlocked,
  unitId,
  validSide,
  validateBlock,
  type BlockDef,
  type BlockItem,
  type CellPoint,
  type CellRect,
  type ItemKind,
  type Priority,
  type Side,
} from '../../gen/block';
import { unitCost } from '../../gen/budget';
import { scenarioCellSize } from '../../gen/scenario';
import type { ScenarioTemplate } from '../../gen/scenario-templates';
import { assetUrl } from '../../render/assets/asset-urls';
import { coverArtLayout } from '../../render/cover-art';
import { drawConcealment, drawTrenchRims } from '../../render/terrain/concealment-art';
import { canvasConcealmentPainter } from '../../render/terrain/concealment-canvas';
import { buildTerrainAtlas, loadTerrainImages } from '../../render/terrain/transition-atlas';
import type { Vec2 } from '../../sim/core/vec';
import type { ConcealmentArea, CoverMaterial, Rect } from '../../sim/world/map';
import { el, injectStyle } from '../dom';
import { defaultItem, snap, type EditorModel } from './editor-model';
import { ScenarioGroundCache } from './scenario-ground-cache';
import { coverTiles, terrainTiles, tileStamp, wallTile } from './scenario-tiles';

/** (PHASE13) Where the open draft stands against My blocks. */
export type SaveState = 'saved' | 'dirty' | 'new' | 'official';

export interface EditorActions {
  newBlock(): void;
  newScenario(): void;
  /** Opens the HQ or basic training floor plan as a new scenario. */
  openTemplate(template: ScenarioTemplate): void;
  download(): void;
  copy(): Promise<boolean>;
  upload(file: File): void;
  /** Plays the draft: a block on its own at the budget slider's budget, or the scenario. */
  play(): void;
  /** Back to the game's main menu. */
  exit(): void;
  /** (13-b) The library: official blocks, the player's own, which is open. */
  library(): {
    official: readonly BlockDef[];
    custom: readonly BlockDef[];
    /** Where the open draft came from. */
    current: { kind: 'new' | 'official' | 'mine'; id: string };
  };
  /** (PHASE13) Is the draft saved, changed, new, or an untouched official block? */
  saveState(): SaveState;
  /** Save the draft into My blocks. */
  save(): void;
  /**
   * (PHASE13) How many blocks (in any orientation) could sit against each side of the draft
   * ([D101]): official ones plus your saved ones.
   */
  edgeFits(block: BlockDef): Record<Side, number>;
  /** Open one of the player's blocks; an official one opens as a copy. */
  openBlock(id: string): void;
  deleteBlock(id: string): void;
  /** Play a generated level stitched from the official + the player's blocks. */
  playLevel(): void;
  /** (PHASE13) The block connection graph ([D104]). */
  openGraph(): void;
  /** The budget slider moved (saved for Play). */
  budgetChanged(budget: number | null): void;
}

const css = `
.aoo-ed { position: fixed; inset: 0; display: grid; grid-template-columns: 364px minmax(0,1fr);
  background: #111418; color: #e7e9ec; font: 13px/1.35 system-ui,sans-serif; }
.aoo-ed aside { display: flex; flex-direction: column; min-height: 0; background: #181c21; border-right: 1px solid #343c46; }
.aoo-ed .toolbar { display: grid; gap: 4px; padding: 8px; }
.aoo-ed .toolbar .navigation { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; }
.aoo-ed .doc-title { display: flex; gap: 6px; align-items: baseline; min-width: 0; }
.aoo-ed .doc-title b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.aoo-ed .tag { font-size: 11px; padding: 1px 6px; border-radius: 3px; background: #2b333c; color: #aeb6c0; flex: none; }
.aoo-ed .tabs { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); padding: 0 4px; gap: 2px; border-bottom: 1px solid #343c46; }
.aoo-ed .tabs button { padding-inline: 1px; border-color: transparent; border-radius: 4px 4px 0 0; background: transparent; font-size: 11px; overflow: hidden; text-overflow: ellipsis; }
.aoo-ed .tabs button[aria-selected="true"] { background: #232930; border-bottom: 2px solid #7dc4f6; color: #fff; }
.aoo-ed .panels { overflow-y: auto; min-height: 0; padding: 8px; }
.aoo-ed .panels section > :first-child { margin-top: 0; }
.aoo-ed .brushes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin-bottom: 8px; }
.aoo-ed .brush { display: flex; align-items: center; justify-content: center; gap: 5px; }
.aoo-ed .brush-square { display: inline-block; border: 1px solid currentColor; }
.aoo-ed button.go:enabled { background: #2f7a3d; border-color: #3f9a50; font-weight: 600; }
.aoo-ed .history { margin-top: 8px; }
.aoo-ed .layer-help:empty, .aoo-ed .warning:empty { display: none; }
.aoo-ed h2 { font-size: 12px; margin: 14px 0 6px; }
.aoo-ed p { color: #aeb6c0; margin: 6px 0; }
.aoo-ed .hint { color: #7d8792; font-size: 12px; }
.aoo-ed button, .aoo-ed input, .aoo-ed select {
  font: inherit; color: inherit; background: #232930; border: 1px solid #343c46;
  padding: 5px; border-radius: 4px; min-width: 0; }
.aoo-ed button:hover:enabled { background: #2c343d; cursor: pointer; }
.aoo-ed button[aria-pressed="true"] { background: #2f5b86; border-color: #4a86bd; }
.aoo-ed button:disabled { opacity: .45; }
.aoo-ed .row { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 4px; }
.aoo-ed .row4 { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 4px; }
.aoo-ed .col, .aoo-ed label { display: grid; gap: 4px; }
.aoo-ed label { margin-bottom: 4px; color: #aeb6c0; }
.aoo-ed label.inline { display: flex; align-items: center; gap: 6px; }
.aoo-ed .stage canvas.panning { cursor: grabbing !important; }
.aoo-ed .stage canvas { width: 100%; height: 100%; display: block; touch-action: none; }
.aoo-ed .stage { position: relative; min-height: 0; }
.aoo-ed .inspector select { width: 100%; }
.aoo-ed .warning { color: #f0b37e; }
.aoo-ed .ok { color: #8fd18f; }
.aoo-ed .problems { padding-left: 16px; margin: 4px 0; }
.aoo-ed .problems li { color: #f0b37e; margin-bottom: 4px; cursor: pointer; }
.aoo-ed .swatch { display: flex; gap: 5px; align-items: center; text-align: left; }
.aoo-ed .swatch > canvas { width: 22px; height: 18px; object-fit: contain; flex: none; }
.aoo-ed .thumbnail { width: 22px; height: 18px; display: inline-flex; flex: none; }
.aoo-ed .prop-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; margin-bottom: 4px; }
.aoo-ed .prop-tile { display: grid; justify-items: center; gap: 4px; align-content: start; }
.aoo-ed .prop-tile .thumbnail { width: 100%; height: 38px; }
.aoo-ed .thumbnail > * { width: 100%; height: 100%; object-fit: contain; }
.aoo-ed .unit-row { display: grid; grid-template-columns: 1fr 58px 36px; gap: 4px; }
.aoo-ed .squad { border: 1px solid #343c46; border-radius: 6px; padding: 6px; margin-bottom: 6px; }
.aoo-ed .squad.active { border-color: #4a86bd; }
.aoo-ed .squad-head { display: flex; align-items: center; gap: 6px; }
.aoo-ed .squad-head i { width: 12px; height: 12px; border-radius: 50%; flex: none; }
.aoo-ed .squad-head button { flex: 1; text-align: left; }
.aoo-ed .budget input[type=range] { width: 100%; box-sizing: border-box; padding: 0; margin: 4px 0; }
.aoo-ed .budget-row { display: flex; justify-content: space-between; align-items: center; gap: 6px; }
@media (max-width: 640px) {
  .aoo-ed { grid-template: minmax(0, 54%) minmax(0, 1fr) / minmax(0, 1fr); }
  .aoo-ed .stage { grid-row: 1; }
  .aoo-ed aside { grid-row: 2; border-right: 0; border-top: 1px solid #343c46; }
  .aoo-ed button { min-height: 44px; }
  .aoo-ed .toolbar { padding: 4px 8px; }
  .aoo-ed .palette { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
.aoo-ask { position: fixed; inset: 0; z-index: 20; background: rgba(5,8,11,.7); display: flex;
  align-items: center; justify-content: center; font: 14px/1.4 system-ui, sans-serif; color: #e7e9ec; }
.aoo-ask .panel { background: #181c21; border: 1px solid #2c343d; border-radius: 8px; padding: 18px;
  width: min(380px, calc(100% - 32px)); }
.aoo-ask .btns { display: flex; gap: 8px; margin-top: 14px; justify-content: flex-end; flex-wrap: wrap; }
.aoo-ask button { font: inherit; color: inherit; background: #232930; border: 1px solid #343c46;
  border-radius: 4px; padding: 6px 12px; cursor: pointer; min-height: 40px; }
.aoo-ask button.go { background: #2f7a3d; border-color: #3f9a50; font-weight: 600; }
.aoo-lib { position: fixed; inset: 0; z-index: 10; background: rgba(5,8,11,.72); display: flex;
  align-items: flex-start; justify-content: center; padding: 24px 8px; overflow-y: auto;
  font: 13px/1.35 system-ui, sans-serif; color: #e7e9ec; }
.aoo-lib .panel { width: min(760px, 100%); background: #181c21; border: 1px solid #2c343d;
  border-radius: 8px; padding: 12px 14px; box-sizing: border-box; }
.aoo-lib header { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; flex-wrap: wrap; }
.aoo-lib header h1 { font-size: 17px; margin: 0; flex: 1 1 100%; }
.aoo-lib button { font: inherit; color: inherit; background: #232930; border: 1px solid #343c46;
  border-radius: 4px; padding: 4px 8px; cursor: pointer; min-height: 36px; }
.aoo-lib button:hover { background: #2c343d; }
.aoo-lib button.go { background: #2f7a3d; border-color: #3f9a50; font-weight: 600; }
.aoo-lib h2 { font-size: 12px; color: #9fb3c8; margin: 14px 0 4px; font-weight: 600; }
.aoo-lib h2 span { color: #7d8792; font-weight: 400; }
.aoo-lib .row { display: flex; align-items: center; gap: 6px; padding: 5px 8px; border-radius: 4px;
  background: #1e242b; margin-bottom: 3px; flex-wrap: wrap; }
.aoo-lib .row.current { outline: 1px solid #4a86bd; }
.aoo-lib .name { flex: 1 1 160px; }
.aoo-lib .tag { font-size: 11px; padding: 1px 6px; border-radius: 3px; background: #2b333c; color: #aeb6c0; }
.aoo-lib .tag.warn { background: #4a3520; color: #f0b37e; }
.aoo-lib .hint { color: #7d8792; margin: 0 0 6px; }
`;

const TABS = ['terrain', 'structures', 'props', 'weather', 'logic', 'enemies', 'file'] as const;
type Tab = (typeof TABS)[number];
type Layer = Exclude<Tab, 'file'>;

/** Tools: `draw` drags out a rect thing (`drawKind`), `place` taps down a point thing. */
type Tool = 'select' | 'pan' | 'erase' | 'paint' | 'draw' | 'place';
type DrawKind = Extract<BlockItem, { rect: CellRect }>['kind'];
type PlaceKind = Extract<BlockItem, { at: CellPoint }>['kind'];

/** Which layer tab edits a kind of thing. */
function itemLayer(kind: ItemKind): Layer {
  switch (kind) {
    case 'water':
    case 'bush':
    case 'trench':
      return 'terrain';
    case 'wall':
    case 'cover':
    case 'gate':
    case 'raised':
    case 'ladder':
      return 'structures';
    case 'prop':
    case 'target':
      return 'props';
    case 'mist':
      return 'weather';
    case 'spawn':
    case 'lever':
    case 'capture':
    case 'objective':
      return 'logic';
    case 'rally':
    case 'turret':
    case 'mine':
      return 'enemies';
  }
}

const MATERIALS: readonly CoverMaterial[] = [
  'sandbags',
  'crate',
  'halfWall',
  'fence',
  'window',
  'bunkerWindow',
];
const FACINGS = [0, 45, 90, 135, 180, 225, 270, 315];
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
  { image: 'lever_a', label: 'scenario.prop.lever' },
  { image: 'mine', label: 'scenario.prop.mine' },
  { image: 'capture_base', label: 'scenario.prop.flag' },
];
const AREA_COLORS: Partial<Record<ItemKind, string>> = {
  raised: '#937d5e',
  mist: '#d1d9c47a',
};

type Stroke = {
  id: number;
  start: Vec2;
  last: Vec2;
  /** Moving the selected thing: where on it the pointer took hold. */
  hold?: Vec2;
};
type Gesture = Stroke | { id: number; client: Vec2 };

export class EditorView {
  private readonly canvas = el('canvas');
  private readonly ctx = this.canvas.getContext('2d')!;
  private readonly status = el('p', 'warning');
  private readonly docTitle = el('div', 'doc-title');
  private readonly panels = el('div', 'panels');
  private readonly tabs = new Map<
    Tab,
    { button: HTMLButtonElement; panel: HTMLElement; dynamic: HTMLElement; help: HTMLElement }
  >();
  private readonly historyButtons = el('div', 'row history');
  private readonly undoButton: HTMLButtonElement;
  private readonly redoButton: HTMLButtonElement;
  private readonly canvasWrap = el('div', 'stage');
  private readonly concealmentPainter = canvasConcealmentPainter(this.ctx);
  private paintedConcealment: { block: BlockDef; areas: ConcealmentArea[] } | null = null;
  private framePending = false;
  private readonly images = new Map<ImageKey, HTMLImageElement>();
  /** Buttons that show whether their tool is on. */
  private readonly tools = new Map<HTMLButtonElement, () => boolean>();
  /** Tool buttons that only make sense for one kind of document. */
  private readonly onlyFor = new Map<HTMLElement, 'block' | 'scenario'>();
  private readonly terrainStamps = new Map(
    GROUND_KINDS.map((kind) => [kind, tileStamp(terrainTiles[kind])]),
  );
  private readonly groundCache = new ScenarioGroundCache(this.terrainStamps);
  private readonly wallStamp = tileStamp(wallTile);
  private readonly coverStamps = new Map(
    MATERIALS.map((material) => [material, tileStamp(coverTiles[material])]),
  );
  private tab: Tab = 'terrain';
  private tool: Tool = 'paint';
  private drawKind: DrawKind = 'wall';
  private material: CoverMaterial = 'sandbags';
  private propImage: ImageKey = 'hub_banner';
  private brushSize = 1;
  private hoverCell: Vec2 | null = null;
  private stroke: Gesture | null = null;
  private zoom = 1;
  private pan = { x: 0, y: 0 };
  private grid = { x: 0, y: 0, size: 1 };
  private fitCache: { block: BlockDef; fits: Record<Side, number> } | null = null;

  constructor(
    host: HTMLElement,
    private readonly model: EditorModel,
    private readonly actions: EditorActions,
  ) {
    injectStyle('aoo-editor', css);
    const root = el('div', 'aoo-ed');
    const sidebar = el('aside');
    const stage = this.canvasWrap;
    stage.append(this.canvas);
    root.append(sidebar, stage);
    host.append(root);
    this.canvas.setAttribute('aria-label', str('scenario.canvas'));
    model.paintKind = 'D';

    const toolbar = el('div', 'toolbar');
    toolbar.setAttribute('role', 'group');
    toolbar.setAttribute('aria-label', str('scenario.navigation'));
    const navigation = el('div', 'navigation');
    for (const [tool, label] of [
      ['select', 'scenario.select'],
      ['pan', 'scenario.pan'],
    ] as const) {
      const control = this.button(label, () => this.useTool(tool));
      navigation.append(control);
      this.tools.set(control, () => this.tool === tool);
    }
    navigation.append(
      this.button('scenario.zoomOut', () => this.zoomAt(1 / 1.4)),
      this.button('scenario.fit', () => this.fit()),
      this.button('scenario.zoomIn', () => this.zoomAt(1.4)),
    );
    toolbar.append(this.docTitle, navigation);
    const tabList = el('div', 'tabs');
    tabList.setAttribute('role', 'tablist');
    tabList.setAttribute('aria-label', str('scenario.layers'));
    for (const [index, tab] of TABS.entries()) {
      const button = this.button(`scenario.tab.${tab}`, () => this.switchTab(tab));
      const panel = el('section');
      button.id = `editor-tab-${tab}`;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', `editor-panel-${tab}`);
      panel.id = `editor-panel-${tab}`;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', button.id);
      button.onkeydown = (event) => {
        const next =
          event.key === 'ArrowLeft'
            ? (index + TABS.length - 1) % TABS.length
            : event.key === 'ArrowRight'
              ? (index + 1) % TABS.length
              : event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? TABS.length - 1
                  : -1;
        if (next < 0) return;
        event.preventDefault();
        const target = TABS[next]!;
        this.switchTab(target);
        this.tabs.get(target)?.button.focus();
      };
      tabList.append(button);
      this.panels.append(panel);
      const help = el('p', 'layer-help');
      const dynamic = el('div', 'inspector');
      this.tabs.set(tab, { button, panel, dynamic, help });
    }
    sidebar.append(toolbar, tabList, this.panels, this.status);
    this.status.setAttribute('role', 'status');
    this.buildToolPanels();

    this.undoButton = this.button('scenario.undo', () => model.undo());
    this.redoButton = this.button('scenario.redo', () => model.redo());
    this.historyButtons.append(this.undoButton, this.redoButton);

    new ResizeObserver(() => this.draw()).observe(stage);
    void loadTerrainImages(assetUrl)
      .then((images) => {
        this.groundCache.setTextures(images, buildTerrainAtlas(images));
        this.draw();
      })
      .catch(() => {
        // The base textures are still available if a transition texture fails.
      });
    this.canvas.onpointerdown = (event) => this.startStroke(event);
    this.canvas.onauxclick = (event) => {
      if (event.button === 1) event.preventDefault();
    };
    this.canvas.onpointermove = (event) => {
      const hover = event.pointerType === 'touch' ? null : this.cell(event, false);
      const changed = hover?.x !== this.hoverCell?.x || hover?.y !== this.hoverCell?.y;
      this.hoverCell = hover;
      if (this.stroke) this.moveStroke(event);
      else if (changed && this.tool === 'paint') this.draw();
    };
    this.canvas.onpointerleave = () => {
      this.hoverCell = null;
      if (this.tool === 'paint') this.draw();
    };
    this.canvas.onpointerup = (event) => this.finishStroke(event);
    this.canvas.onlostpointercapture = (event) => this.finishStroke(event, true);
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
    window.addEventListener('keydown', (event) => this.onKey(event));
    model.onChange(() => this.refresh());
    this.refresh();
  }

  // ---------------------------------------------------------------- panels

  private buildToolPanels(): void {
    const panel = (tab: Tab) => this.tabs.get(tab)!.panel;
    const eraser = () => {
      const b = this.button('scenario.erase', () => this.useTool('erase'));
      this.tools.set(b, () => this.tool === 'erase');
      return b;
    };

    // Ground: brush sizes and tiles.
    const brushes = el('div', 'brushes');
    brushes.setAttribute('role', 'group');
    brushes.setAttribute('aria-label', str('scenario.brushSize'));
    for (const n of [1, 2, 3]) {
      const button = el('button', 'brush', `${n}×${n}`);
      button.type = 'button';
      const square = el('span', 'brush-square');
      square.style.width = square.style.height = `${n * 3}px`;
      square.setAttribute('aria-hidden', 'true');
      button.prepend(square);
      button.onclick = () => {
        if (this.stroke) return;
        this.brushSize = n;
        if (this.model.paintKind === 'mist' || this.model.paintKind === 'eraseMist')
          this.model.paintKind = 'D';
        this.useTool('paint');
      };
      this.tools.set(button, () => this.tool === 'paint' && this.brushSize === n);
      brushes.append(button);
    }
    const paint = el('div', 'row palette');
    for (const kind of PAINT_KINDS) {
      const swatch = el('button', 'swatch', strDynamic(GROUND[kind].nameKey));
      swatch.type = 'button';
      swatch.onclick = () => {
        this.model.paintKind = kind;
        this.useTool('paint');
      };
      const icon = tileStamp(terrainTiles[kind]);
      icon.setAttribute('aria-hidden', 'true');
      swatch.prepend(
        kind === 'U' || kind === 'T'
          ? this.concealmentThumbnail(kind === 'U' ? 'bush' : 'trench')
          : this.thumbnail(TERRAIN_ART[kind], icon),
      );
      paint.append(swatch);
      this.tools.set(swatch, () => this.tool === 'paint' && this.model.paintKind === kind);
    }
    panel('terrain').append(brushes, paint, eraser());

    // Build: walls, gates, ladders, raised ground, cover.
    const objects = el('div', 'row');
    for (const kind of ['wall', 'gate', 'ladder', 'raised'] as const) {
      const button = this.drawButton(kind, `editor.kind.${kind}`);
      if (kind === 'wall') {
        button.classList.add('swatch');
        const icon = tileStamp(wallTile);
        icon.setAttribute('aria-hidden', 'true');
        button.prepend(this.thumbnail(TERRAIN_ART.X, icon));
      }
      objects.append(button);
    }
    const covers = el('div', 'row palette');
    for (const material of MATERIALS) {
      const button = this.button(`editor.material.${material}`, () => {
        this.material = material;
        this.drawKind = 'cover';
        this.useTool('draw');
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
      this.tools.set(
        button,
        () => this.tool === 'draw' && this.drawKind === 'cover' && this.material === material,
      );
    }
    panel('structures').append(objects, el('h2', '', str('editor.kind.cover')), covers, eraser());

    // Props: pictures and practice targets.
    const propGrid = el('div', 'prop-grid');
    for (const { image, label } of [
      ...PROP_IMAGES,
      { image: 'target_dummy', label: 'editor.kind.target' },
    ] as const) {
      const target = image === 'target_dummy';
      const button = this.button(label, () => {
        if (this.stroke) return;
        this.propImage = image;
        this.drawKind = target ? 'target' : 'prop';
        this.useTool('draw');
      });
      button.className = 'prop-tile';
      button.prepend(this.thumbnail(image));
      this.tools.set(button, () =>
        target
          ? this.tool === 'draw' && this.drawKind === 'target'
          : this.tool === 'draw' && this.drawKind === 'prop' && this.propImage === image,
      );
      propGrid.append(button);
    }
    panel('props').append(propGrid, eraser());

    // Weather: mist coats (painted, deepen by painting again) and ground-mist areas.
    const mist = el('div', 'row');
    for (const kind of ['mist', 'eraseMist'] as const) {
      const b = this.button(kind === 'mist' ? 'editor.paintMist' : 'editor.eraseMist', () => {
        this.model.paintKind = kind;
        this.brushSize = 1;
        this.useTool('paint');
      });
      this.tools.set(b, () => this.tool === 'paint' && this.model.paintKind === kind);
      mist.append(b);
    }
    panel('weather').append(mist, this.drawButton('mist', 'editor.kind.mist'), eraser());

    // Logic: where you start, what you capture, what opens gates.
    const logic = el('div', 'row');
    for (const kind of ['spawn', 'capture', 'objective', 'lever'] as const) {
      const b = this.placeButton(kind);
      if (kind === 'spawn') this.onlyFor.set(b, 'scenario');
      logic.append(b);
    }
    panel('logic').append(logic, eraser());

    // Enemies: squads and their rally points, turrets, mines.
    const enemies = el('div', 'row');
    for (const kind of ['rally', 'turret', 'mine'] as const) enemies.append(this.placeButton(kind));
    panel('enemies').append(enemies, eraser());
  }

  private drawButton(kind: DrawKind, label: StringKey): HTMLButtonElement {
    const button = this.button(label, () => {
      this.drawKind = kind;
      this.useTool('draw');
    });
    this.tools.set(button, () => this.tool === 'draw' && this.drawKind === kind);
    return button;
  }

  private placeButton(kind: PlaceKind): HTMLButtonElement {
    const button = this.button(`editor.kind.${kind}`, () => {
      this.model.placeKind = kind;
      this.useTool('place');
    });
    this.tools.set(button, () => this.tool === 'place' && this.model.placeKind === kind);
    return button;
  }

  /** The current tab's changing part: what's selected (and squads), or the File tab. */
  private renderDynamic(): void {
    const tab = this.tabs.get(this.tab)!;
    const box = tab.dynamic;
    box.replaceChildren();
    if (this.tab === 'file') {
      this.renderFile(box);
      return;
    }
    this.renderSelection(box, this.tab);
    if (this.tab === 'enemies') this.renderSquads(box);
  }

  private renderSelection(box: HTMLElement, layer: Layer): void {
    const m = this.model;
    const inLayer = m.block.items.filter((it) => itemLayer(it.kind) === layer);
    if (inLayer.length) {
      const picker = el('select');
      picker.setAttribute('aria-label', str('scenario.pieces'));
      const empty = el('option', '', str('scenario.pieces'));
      empty.value = '';
      picker.append(empty);
      for (const it of inLayer) {
        const [x, y] = isRectItem(it) ? it.rect : it.at;
        const option = el(
          'option',
          '',
          `${this.itemName(it)} · ${it.id} · ${round(x)}, ${round(y)}`,
        );
        option.value = it.id;
        picker.append(option);
      }
      const current = m.selectedItem;
      picker.value = current && itemLayer(current.kind) === layer ? current.id : '';
      picker.onchange = () => {
        const it = m.item(picker.value);
        if (it) this.focusOn(it);
        this.tool = 'select';
        m.select(it?.id ?? null);
      };
      box.append(picker);
    }
    const it = m.selectedItem;
    if (!it || itemLayer(it.kind) !== layer) return;
    const block = !isScenario(m.block);
    box.append(
      el('h2', '', this.itemName(it)),
      field(
        str('editor.prop.id'),
        input(it.id, (v) => m.renameItem(it.id, v.trim())),
      ),
    );
    if (block && !ALWAYS_KINDS.has(it.kind)) {
      box.append(
        field(
          str('editor.prop.priority'),
          select(
            PRIORITIES.map((p) => [String(p), String(p)]),
            String(it.priority),
            (v) => m.updateItem(it.id, { priority: Number(v) as Priority }),
          ),
        ),
        el('div', 'hint', str('editor.prop.priorityHint')),
      );
    }
    if (it.kind === 'rally') box.append(this.squadPicker(it));
    if (it.kind === 'capture') {
      // A squad may hold this point (it retakes it, [D45]).
      box.append(
        field(
          str('editor.prop.heldBy'),
          select(
            [['', str('editor.none')], ...groupIds(m.block).map((g) => [g, g] as [string, string])],
            it.group ?? '',
            (v) => m.updateItem(it.id, { group: v || undefined }),
          ),
        ),
      );
    }
    if (it.kind === 'cover') {
      box.append(
        field(
          str('editor.prop.material'),
          select(
            MATERIALS.map((x) => [x, strDynamic(`editor.material.${x}`)]),
            it.material,
            (v) => m.updateItem(it.id, { material: v as CoverMaterial }),
          ),
        ),
      );
    }
    if (it.kind === 'turret') {
      box.append(
        field(
          str('editor.prop.facing'),
          select(
            FACINGS.map((d) => [String(d), strDynamic(`editor.facing.${d}`)]),
            String((((Math.round(it.facing / 45) * 45) % 360) + 360) % 360),
            (v) => m.updateItem(it.id, { facing: Number(v) }),
          ),
        ),
      );
    }
    if (it.kind === 'gate') {
      box.append(
        checkbox(str('editor.prop.open'), !!it.open, (on) => m.updateItem(it.id, { open: on })),
      );
    }
    if (it.kind === 'lever') {
      const gates = m.block.items.filter((i) => i.kind === 'gate');
      box.append(
        field(
          str('editor.prop.target'),
          select(
            [['', str('editor.none')], ...gates.map((x) => [x.id, x.id] as [string, string])],
            it.target,
            (v) => m.updateItem(it.id, { target: v }),
          ),
        ),
      );
    }
    const at = el('div', 'row4');
    const num = (label: StringKey, value: number, set: (v: number) => void) => {
      const f = field(str(label), numberInput(value, set));
      at.append(f);
    };
    if (isRectItem(it)) {
      const [x, y, w, h] = it.rect;
      const set = (rect: CellRect) => {
        const size = blockSize(m.block);
        if (
          rect[2] <= 0 ||
          rect[3] <= 0 ||
          rect[0] < 0 ||
          rect[1] < 0 ||
          rect[0] + rect[2] > size.w + 1e-8 ||
          rect[1] + rect[3] > size.h + 1e-8
        ) {
          this.showStatus('scenario.pieceBounds');
          this.refresh();
          return;
        }
        m.updateItem(it.id, { rect });
      };
      num('scenario.x', x, (v) => set([v, y, w, h]));
      num('scenario.y', y, (v) => set([x, v, w, h]));
      num('scenario.width', w, (v) => set([x, y, v, h]));
      num('scenario.height', h, (v) => set([x, y, w, v]));
    } else {
      const [x, y] = it.at;
      num('scenario.x', x, (v) => m.moveItemTo(it.id, v, y));
      num('scenario.y', y, (v) => m.moveItemTo(it.id, x, v));
    }
    box.append(at);
    const row = el('div', 'row');
    row.append(
      this.button('editor.rotate', () => m.rotateSelected()),
      this.button('editor.delete', () => m.deleteSelected()),
    );
    box.append(row);
  }

  /** A rally point's squad ([Q54]): which squad it belongs to. */
  private squadPicker(it: Extract<BlockItem, { kind: 'rally' }>): HTMLElement {
    const m = this.model;
    const NEW = '\u0000new';
    return field(
      str('editor.prop.squad'),
      select(
        [
          ...groupIds(m.block).map((g) => [g, g] as [string, string]),
          [NEW, str('editor.squad.new')],
        ],
        it.group,
        (v) => {
          m.beginGesture();
          const target = v === NEW ? m.addGroup() : v;
          m.updateItem(it.id, { group: target });
          m.endGesture();
          m.select(it.id);
        },
      ),
    );
  }

  /**
   * (PHASE13) The squads ([Q54]): rosters, and which one new rally points join. Units spawn at a
   * random rally point of their squad and roam between them.
   */
  private renderSquads(box: HTMLElement): void {
    const m = this.model;
    box.append(el('h2', '', str('editor.squads')));
    const block = !isScenario(m.block);
    for (const g of m.block.groups) {
      const card = el('div', `squad${m.activeGroup === g.id ? ' active' : ''}`);
      const head = el('div', 'squad-head');
      const dot = el('i');
      dot.style.background = groupColor(g.id);
      const pick = el('button', '', g.id);
      pick.type = 'button';
      pick.setAttribute('aria-pressed', String(m.activeGroup === g.id));
      pick.onclick = () => {
        m.activeGroup = g.id;
        m.placeKind = 'rally';
        this.tool = 'place';
        m.touch();
      };
      head.append(dot, pick);
      card.append(head);
      if (m.activeGroup === g.id) {
        card.append(
          field(
            str('editor.squad.name'),
            input(g.id, (v) => m.renameGroup(g.id, v.trim())),
          ),
        );
        g.units.forEach((u, i) => {
          const row = el('div', 'unit-row');
          const role = select(
            ROLES.map((r) => [r.id, str(r.nameKey)]),
            u.role,
            (v) =>
              m.setGroupUnits(
                g.id,
                g.units.map((x, j) => (j === i ? { ...x, role: v as RoleId } : x)),
              ),
          );
          const pri = select(
            PRIORITIES.map((p) => [String(p), `P${p}`]),
            String(u.priority),
            (v) =>
              m.setGroupUnits(
                g.id,
                g.units.map((x, j) => (j === i ? { ...x, priority: Number(v) as Priority } : x)),
              ),
          );
          pri.hidden = !block;
          const del = el('button', '', '✕');
          del.type = 'button';
          del.title = str('editor.delete');
          del.onclick = () =>
            m.setGroupUnits(
              g.id,
              g.units.filter((_, j) => j !== i),
            );
          row.append(role, pri, del);
          card.append(row);
        });
        const add = this.button('editor.squad.addUnit', () => {
          const last = g.units[g.units.length - 1];
          m.setGroupUnits(g.id, [
            ...g.units,
            { role: last?.role ?? 'rifleman', priority: last?.priority ?? 1 },
          ]);
        });
        const cost = g.units.reduce((n, u) => n + unitCost(u), 0);
        const points = m.block.items.filter((x) => x.kind === 'rally' && x.group === g.id).length;
        const del = this.button('editor.squad.delete', () => {
          if (window.confirm(str('editor.squad.deleteConfirm', { name: g.id })))
            m.deleteGroup(g.id);
        });
        card.append(
          add,
          el('div', 'hint', str('editor.squad.summary', { n: g.units.length, cost, points })),
          del,
        );
      }
      box.append(card);
    }
    box.append(
      this.button('editor.squad.add', () => {
        m.addGroup();
        m.placeKind = 'rally';
        this.tool = 'place';
        m.touch();
      }),
    );
  }

  private renderFile(box: HTMLElement): void {
    const m = this.model;
    const b = m.block;
    const scenario = isScenario(b);

    box.append(el('h2', '', str(scenario ? 'editor.scenario' : 'editor.block')));
    box.append(
      field(
        str('editor.type'),
        select(
          [
            ['block', str('editor.type.block')],
            ['scenario', str('editor.type.scenario')],
          ],
          scenario ? 'scenario' : 'block',
          (v) =>
            m.setMeta(
              v === 'scenario' ? { kind: 'scenario', role: undefined } : { kind: undefined },
            ),
        ),
      ),
      el('div', 'hint', str(scenario ? 'editor.type.scenarioHint' : 'editor.type.blockHint')),
      field(
        str('editor.blockName'),
        input(b.name, (v) => m.setMeta({ name: v })),
      ),
      field(
        str('editor.blockId'),
        input(b.id, (v) => v.trim() && m.setMeta({ id: v.trim() })),
      ),
    );
    if (!scenario) {
      box.append(
        field(
          str('editor.role'),
          select(
            [
              ['', str('editor.role.none')],
              ['start', str('editor.role.start')],
              ['hq', str('editor.role.hq')],
            ],
            b.role ?? '',
            (v) => m.setMeta({ role: v === 'start' || v === 'hq' ? v : undefined }),
          ),
        ),
      );
    }

    // Problems, then save and play.
    const problems = validateBlock(b);
    if (problems.length) {
      const ul = el('ul', 'problems');
      for (const p of problems) {
        const li = el('li', '', strDynamic(p.key, p.params));
        if (p.itemId) {
          li.onclick = () => {
            const it = m.item(p.itemId!);
            if (!it) return;
            this.focusOn(it);
            this.tab = itemLayer(it.kind);
            this.tool = 'select';
            m.select(it.id);
          };
        }
        ul.append(li);
      }
      box.append(ul);
      if (!scenario) box.append(el('div', 'hint', str('editor.notInLevelsHint')));
    } else box.append(el('p', 'ok', str('editor.noProblems')));
    const state = this.actions.saveState();
    box.append(
      el('div', state === 'dirty' ? 'hint warning' : 'hint', str(`editor.state.${state}`)),
    );
    const actions = el('div', 'col');
    const save = this.button('editor.save', () => this.actions.save());
    save.disabled = state === 'saved';
    if (state === 'dirty' || state === 'new') save.classList.add('go');
    const play = this.button(scenario ? 'scenario.play' : 'editor.play', () => this.actions.play());
    play.classList.add('go');
    play.disabled =
      scenario &&
      problems.some(
        (p) => p.key === 'editor.problem.noSpawn' || p.key === 'editor.problem.spawnBlocked',
      );
    actions.append(save, play);
    if (!scenario) actions.append(this.button('editor.playLevel', () => this.actions.playLevel()));
    box.append(actions);

    // Size: any size; levels need BLOCK_CELLS square blocks (a problem says so).
    box.append(el('h2', '', str('editor.size')));
    const cols = el('input');
    const rows = el('input');
    for (const [i, v] of [
      [cols, m.cols],
      [rows, m.rows],
    ] as const) {
      i.type = 'number';
      i.min = String(MIN_CELLS);
      i.max = String(MAX_CELLS);
      i.value = String(v);
    }
    const size = el('form', 'col');
    const dims = el('div', 'row');
    dims.append(field(str('scenario.columns'), cols), field(str('scenario.rows'), rows));
    const resize = el('button', '', str('scenario.resize'));
    resize.type = 'submit';
    const pending = () => {
      const w = cols.valueAsNumber;
      const h = rows.valueAsNumber;
      resize.disabled = !(validSide(w) && validSide(h) && (w !== m.cols || h !== m.rows));
    };
    cols.oninput = rows.oninput = pending;
    pending();
    size.onsubmit = (e) => {
      e.preventDefault();
      if (!m.resize(cols.valueAsNumber, rows.valueAsNumber))
        this.showStatus('scenario.resizeBlocked');
      else this.fit();
    };
    size.append(dims, resize);
    box.append(size);

    if (!scenario) {
      // (PHASE13) Edges are the outer row of tiles; they join any block whose touching tiles
      // match, give or take one place ([D101]). Presets paint a standard edge.
      const square = m.cols === m.rows && EDGE_PRESETS.every((p) => p.profile.length === m.cols);
      box.append(el('h2', '', str('editor.edges')));
      box.append(el('div', 'hint', str('editor.edgesHint')));
      if (square) {
        const fits = this.fits();
        const edges = el('div', 'row');
        for (const side of SIDES) {
          const sel = select(
            [
              ['', str('editor.edgeFits', { n: fits[side] })],
              ...EDGE_PRESETS.map((p, i) => [String(i), strDynamic(p.nameKey)] as [string, string]),
            ],
            '',
            (v) => {
              const preset = EDGE_PRESETS[Number(v)];
              if (preset) m.applyEdgePreset(side, preset.profile);
            },
          );
          edges.append(field(str(`editor.edge.${side}` as StringKey), sel));
        }
        box.append(edges);
      }
      box.append(el('h2', '', str('editor.budget')), this.budgetPanel());
    }

    box.append(el('h2', '', str('editor.file')));
    const file = el('div', 'col');
    const up = el('input');
    up.type = 'file';
    up.accept = '.json,application/json';
    up.hidden = true;
    up.onchange = () => {
      const f = up.files?.[0];
      up.value = '';
      if (f) this.actions.upload(f);
    };
    const copy = this.button('editor.copy', () => {
      void this.actions.copy().then((ok) => {
        if (ok) copy.textContent = str('editor.copied');
        setTimeout(() => (copy.textContent = str('editor.copy')), 1200);
      });
    });
    const news = el('div', 'row');
    news.append(
      this.button('editor.new', () => this.actions.newBlock()),
      this.button('editor.newScenario', () => this.actions.newScenario()),
    );
    const templates = el('div', 'row');
    for (const [id, title] of [
      ['hq', 'hub.name'],
      ['basic-training', 'map.basic.name'],
    ] as const) {
      templates.append(this.button(title, () => this.actions.openTemplate(id)));
    }
    file.append(
      this.button('editor.library', () => this.openLibrary()),
      news,
      el('div', 'hint', str('scenario.templates')),
      templates,
      this.button('editor.upload', () => up.click()),
      up,
      this.button('editor.download', () => this.actions.download()),
      copy,
      this.button('world.graph', () => this.actions.openGraph()),
      this.button('editor.exit', () => this.actions.exit()),
    );
    box.append(file);
  }

  /**
   * (13-b) The budget slider ([D85]): drag to see what an enemy budget buys. Far right =
   * everything. Updates the canvas and its own label in place (no panel rebuild mid-drag).
   */
  private budgetPanel(): HTMLElement {
    const m = this.model;
    const box = el('div', 'budget');
    const total = m.totalCost();
    const max = Math.max(10, total);
    const range = el('input');
    range.type = 'range';
    range.min = '0';
    range.max = String(max);
    range.step = '1';
    range.value = String(m.budget === null ? max : Math.min(m.budget, max));
    const label = el('div', 'hint');
    const update = () => {
      const { spent } = m.spend();
      label.textContent =
        m.budget === null
          ? str('editor.budgetAll', { total })
          : str('editor.budgetValue', { budget: m.budget, total, spent });
    };
    range.oninput = () => {
      const v = Number(range.value);
      m.budget = v >= max ? null : v;
      update();
      this.draw();
    };
    range.onchange = () => this.actions.budgetChanged(m.budget);
    const row = el('div', 'budget-row');
    const shuffle = this.button('editor.reshuffle', () => {
      m.spendSeed++;
      update();
      this.draw();
    });
    shuffle.title = str('editor.reshuffleHint');
    row.append(label, shuffle);
    update();
    box.append(range, row, el('div', 'hint', str('editor.budgetHint')));
    return box;
  }

  /** (13-b) The library: the player's blocks and scenarios, and the official blocks. */
  private openLibrary(): void {
    const overlay = el('div', 'aoo-lib');
    const close = () => {
      overlay.remove();
      window.removeEventListener('keydown', onKey, true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener('keydown', onKey, true);
    overlay.onclick = (e) => {
      if (e.target === overlay) close();
    };
    const button = (key: StringKey, run: () => void, cls = '') => {
      const b = el('button', cls, str(key));
      b.type = 'button';
      b.onclick = run;
      return b;
    };
    const render = () => {
      const { official, custom, current } = this.actions.library();
      const panel = el('div', 'panel');
      const header = el('header');
      header.append(
        el('h1', '', str('editor.libraryTitle')),
        button('editor.new', () => {
          close();
          this.actions.newBlock();
        }),
        button('editor.newScenario', () => {
          close();
          this.actions.newScenario();
        }),
        button('world.graph', () => {
          close();
          this.actions.openGraph();
        }),
        button('editor.playLevel', () => this.actions.playLevel(), 'go'),
        button('editor.close', close),
      );
      panel.append(header, el('p', 'hint', str('editor.libraryHint')));
      for (const [title, list, isOfficial] of [
        [str('editor.mine'), custom, false],
        [str('editor.officialBlocks'), official, true],
      ] as const) {
        if (list.length === 0) continue;
        const h = el('h2', '', `${title} `);
        h.append(el('span', '', str('editor.layoutCount', { n: list.length })));
        panel.append(h);
        for (const b of list) {
          const isOpen =
            current.id === b.id &&
            (isOfficial ? current.kind === 'official' : current.kind === 'mine');
          const row = el('div', `row${isOpen ? ' current' : ''}`);
          row.append(el('span', 'name', `${b.name}  (${b.id})`));
          if (isScenario(b)) row.append(el('span', 'tag', str('editor.type.scenarioTag')));
          if (isOfficial) row.append(el('span', 'tag', str('editor.official')));
          if (isOpen) row.append(el('span', 'tag', str('editor.current')));
          if (b.role) row.append(el('span', 'tag', str(`editor.role.${b.role}`)));
          if (!isOfficial && !isScenario(b) && validateBlock(b).length) {
            row.append(el('span', 'tag warn', str('editor.notInLevels')));
          }
          row.append(
            button('editor.open', () => {
              close();
              this.actions.openBlock(b.id);
            }),
          );
          if (!isOfficial) {
            row.append(
              button('editor.deleteBlock', () => {
                if (window.confirm(str('editor.deleteConfirm', { name: b.name }))) {
                  this.actions.deleteBlock(b.id);
                  overlay.replaceChildren(render());
                }
              }),
            );
          }
          panel.append(row);
        }
      }
      return panel;
    };
    overlay.append(render());
    document.body.append(overlay);
  }

  /** (PHASE13) "You have unsaved changes": Save / Don't save / Cancel. */
  askUnsaved(name: string): Promise<'save' | 'discard' | 'cancel'> {
    return new Promise((resolve) => {
      const overlay = el('div', 'aoo-ask');
      const panel = el('div', 'panel');
      const done = (a: 'save' | 'discard' | 'cancel') => {
        overlay.remove();
        window.removeEventListener('keydown', onKey, true);
        resolve(a);
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          done('cancel');
        }
      };
      window.addEventListener('keydown', onKey, true);
      const save = el('button', 'go', str('editor.save'));
      save.onclick = () => done('save');
      const discard = el('button', '', str('editor.discard'));
      discard.onclick = () => done('discard');
      const cancel = el('button', '', str('editor.cancel'));
      cancel.onclick = () => done('cancel');
      const btns = el('div', 'btns');
      btns.append(cancel, discard, save);
      panel.append(el('div', '', str('editor.unsaved', { name })), btns);
      overlay.append(panel);
      document.body.append(overlay);
      save.focus();
    });
  }

  // ---------------------------------------------------------------- state

  /** Redraws everything after the model or the tool changed. */
  refresh(): void {
    const m = this.model;
    const scenario = isScenario(m.block);
    this.docTitle.replaceChildren(
      el('span', 'tag', str(scenario ? 'editor.type.scenarioTag' : 'editor.type.blockTag')),
      el('b', '', m.block.name),
    );
    for (const [elmt, kind] of this.onlyFor) elmt.hidden = (kind === 'scenario') !== scenario;
    if (this.tool === 'place' && m.placeKind === 'spawn' && !scenario) this.tool = 'select';
    for (const [tab, { button, panel, dynamic, help }] of this.tabs) {
      const active = this.tab === tab;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      panel.hidden = !active;
      if (!active) continue;
      // Tools first (they stay put), then what they do, what's selected, undo / redo.
      if (tab !== 'file') {
        help.textContent = this.helpText();
        panel.append(help);
      }
      panel.append(dynamic, this.historyButtons);
    }
    this.canvas.style.cursor =
      this.tool === 'pan' ? 'grab' : this.tool === 'select' ? 'default' : 'crosshair';
    this.undoButton.disabled = !m.canUndo;
    this.redoButton.disabled = !m.canRedo;
    for (const [button, active] of this.tools)
      button.setAttribute('aria-pressed', String(active()));
    this.renderDynamic();
    this.draw();
  }

  private helpText(): string {
    switch (this.tool) {
      case 'draw':
        return str(this.drawKind === 'ladder' ? 'scenario.help.ladder' : 'editor.help.draw');
      case 'place':
        return str(
          this.model.placeKind === 'spawn'
            ? 'scenario.help.spawn'
            : this.model.placeKind === 'rally'
              ? 'editor.help.rally'
              : 'editor.help.place',
        );
      case 'paint':
        return str(this.model.paintKind === 'mist' ? 'editor.mistHelp' : 'scenario.help.paint');
      default:
        return str(`scenario.help.${this.tool}`);
    }
  }

  private switchTab(tab: Tab): void {
    if (this.stroke || tab === this.tab) return;
    this.tab = tab;
    this.tool = tab === 'terrain' ? 'paint' : 'select';
    if (tab === 'terrain') {
      const k = this.model.paintKind;
      if (k === 'mist' || k === 'eraseMist') this.model.paintKind = 'D';
    }
    this.hoverCell = null;
    const sel = this.model.selectedItem;
    if (sel && (tab === 'file' || itemLayer(sel.kind) !== tab)) this.model.selected = null;
    this.panels.scrollTop = 0;
    this.model.touch();
  }

  private useTool(tool: Tool): void {
    if (this.stroke) return;
    this.tool = tool;
    if (tool !== 'select') this.model.selected = null;
    this.model.touch();
  }

  private onKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    if (document.querySelector('.aoo-lib, .aoo-ask, .aoo-graph')) return;
    const m = this.model;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      this.actions.save();
    } else if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (this.stroke) return;
      if (e.shiftKey) m.redo();
      else m.undo();
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      if (!this.stroke) m.redo();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && m.selected) {
      e.preventDefault();
      m.deleteSelected();
    } else if (e.key.toLowerCase() === 'r' && !mod) {
      m.rotateSelected();
    } else if (e.key === 'Escape') {
      m.select(null);
    }
  }

  private showStatus(key?: StringKey): void {
    this.status.textContent = key ? str(key) : '';
  }

  private fits(): Record<Side, number> {
    const b = this.model.block;
    if (this.fitCache?.block !== b) this.fitCache = { block: b, fits: this.actions.edgeFits(b) };
    return this.fitCache.fits;
  }

  private itemName(it: BlockItem): string {
    switch (it.kind) {
      case 'cover':
        return str(`editor.material.${it.material}`);
      case 'prop': {
        const found = PROP_IMAGES.find((p) => p.image === it.image);
        return found ? str(found.label) : it.image;
      }
      default:
        return str(`editor.kind.${it.kind}`);
    }
  }

  // ---------------------------------------------------------------- view

  private get world(): Vec2 {
    const { w, h } = blockSize(this.model.block);
    return { x: w, y: h };
  }

  /** Margin (px) around the map: blocks show how many neighbours fit on each side. */
  private get margin(): number {
    return isScenario(this.model.block) ? 12 : 26;
  }

  private fit(): void {
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.draw();
  }

  private focusOn(it: BlockItem): void {
    const [x, y, w, h] = isRectItem(it) ? it.rect : [...it.at, 0, 0];
    this.zoom = Math.max(this.zoom, 2);
    const world = this.world;
    const size =
      Math.min(
        (this.canvas.clientWidth - 2 * this.margin) / world.x,
        (this.canvas.clientHeight - 2 * this.margin) / world.y,
      ) * this.zoom;
    this.pan = { x: (world.x / 2 - x - w / 2) * size, y: (world.y / 2 - y - h / 2) * size };
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
    const cw = this.canvas.clientWidth / 2;
    const ch = this.canvas.clientHeight / 2;
    this.pan = {
      x: (this.pan.x + cw - at.x) * ratio - cw + at.x,
      y: (this.pan.y + ch - at.y) * ratio - ch + at.y,
    };
    this.zoom = next;
    this.draw();
  }

  private button(label: StringKey, click: () => void): HTMLButtonElement {
    const button = el('button', '', str(label));
    button.type = 'button';
    button.onclick = click;
    return button;
  }

  private concealmentThumbnail(kind: 'bush' | 'trench'): HTMLCanvasElement {
    const canvas = el('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.width = canvas.height = 80;
    const ctx = canvas.getContext('2d')!;
    drawConcealment(canvasConcealmentPainter(ctx), {
      id: kind,
      kind,
      rect: { x: 12, y: 12, w: 56, h: 56 },
    });
    return canvas;
  }

  private thumbnail(key: ImageKey, fallback?: HTMLCanvasElement): HTMLElement {
    const thumb = el('span', 'thumbnail');
    thumb.setAttribute('aria-hidden', 'true');
    const image = el('img');
    image.alt = '';
    if (fallback) image.onerror = () => image.replaceWith(fallback);
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

  // ---------------------------------------------------------------- pointer

  private cell(event: PointerEvent, clamp: boolean): Vec2 | null {
    const p = this.point(event);
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);
    const { cols, rows } = this.model;
    if (clamp)
      return { x: Math.max(0, Math.min(cols - 1, x)), y: Math.max(0, Math.min(rows - 1, y)) };
    return x >= 0 && x < cols && y >= 0 && y < rows ? { x, y } : null;
  }

  private point(event: PointerEvent): Vec2 {
    const box = this.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - box.left - this.grid.x) / this.grid.size,
      y: (event.clientY - box.top - this.grid.y) / this.grid.size,
    };
  }

  /** Things the current tab edits (in the File tab: everything). */
  private inLayer = (it: BlockItem) => this.tab === 'file' || itemLayer(it.kind) === this.tab;

  private startStroke(event: PointerEvent): void {
    const middle = event.button === 1;
    if (middle) event.preventDefault();
    if (this.stroke || (!middle && event.button !== 0)) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.showStatus();
    if (middle || this.tool === 'pan') {
      this.stroke = { id: event.pointerId, client: { x: event.clientX, y: event.clientY } };
      this.hoverCell = null;
      this.canvas.classList.add('panning');
      this.canvas.setPointerCapture(event.pointerId);
      this.draw();
      return;
    }
    const m = this.model;
    const p = this.point(event);
    const world = this.world;
    if (p.x < 0 || p.y < 0 || p.x > world.x || p.y > world.y) {
      if (this.tool === 'select') m.select(null);
      return;
    }
    switch (this.tool) {
      case 'erase': {
        const hit = m.hitTest(p.x, p.y, this.inLayer);
        if (hit) m.deleteItem(hit.id);
        return;
      }
      case 'place': {
        const x = Math.min(snap(p.x), world.x);
        const y = Math.min(snap(p.y), world.y);
        const spawn = m.placeKind === 'spawn' && m.block.items.find((i) => i.kind === 'spawn');
        if (spawn) {
          // One starting spawn: tapping moves it.
          m.moveItemTo(spawn.id, x, y);
          m.select(spawn.id);
        } else m.place(x, y);
        return;
      }
      case 'select': {
        const hit = m.hitTest(p.x, p.y, this.inLayer);
        m.select(hit?.id ?? null);
        if (!hit) return;
        const [ax, ay] = isRectItem(hit) ? hit.rect : hit.at;
        m.beginGesture();
        this.stroke = {
          id: event.pointerId,
          start: p,
          last: p,
          hold: { x: p.x - ax, y: p.y - ay },
        };
        break;
      }
      case 'paint': {
        const cell = this.cell(event, true)!;
        m.beginGesture();
        this.stroke = { id: event.pointerId, start: cell, last: cell };
        this.paint(cell, cell);
        break;
      }
      case 'draw':
        this.stroke = { id: event.pointerId, start: p, last: p };
        break;
    }
    this.canvas.setPointerCapture(event.pointerId);
    this.draw();
  }

  private moveStroke(event: PointerEvent): void {
    const stroke = this.stroke;
    if (!stroke || stroke.id !== event.pointerId) return;
    if ('client' in stroke) {
      this.pan.x += event.clientX - stroke.client.x;
      this.pan.y += event.clientY - stroke.client.y;
      stroke.client = { x: event.clientX, y: event.clientY };
    } else if (this.tool === 'paint') {
      const at = this.cell(event, true)!;
      if (at.x === stroke.last.x && at.y === stroke.last.y) return;
      this.paint(stroke.last, at);
      stroke.last = at;
      return; // the model's change redraws
    } else {
      stroke.last = this.point(event);
      if (stroke.hold && this.model.selected) {
        const it = this.model.selectedItem;
        if (it) {
          const world = this.world;
          const [, , w, h] = isRectItem(it) ? it.rect : [0, 0, 0, 0];
          const x = Math.max(0, Math.min(world.x - w, stroke.last.x - stroke.hold.x));
          const y = Math.max(0, Math.min(world.y - h, stroke.last.y - stroke.hold.y));
          this.model.moveItemTo(it.id, x, y);
          return;
        }
      }
    }
    this.draw();
  }

  private finishStroke(event: PointerEvent, cancel = false): void {
    const stroke = this.stroke;
    if (!stroke || stroke.id !== event.pointerId) return;
    if (!cancel) this.moveStroke(event);
    this.stroke = null;
    if ('client' in stroke) {
      this.canvas.classList.remove('panning');
      this.draw();
      return;
    }
    const m = this.model;
    if (this.tool === 'paint' || stroke.hold) {
      m.endGesture();
      if (cancel && m.canUndo) m.undo();
      this.refresh();
      return;
    }
    if (this.tool === 'draw' && !cancel) {
      const item = this.drawnItem(stroke);
      if (item) m.addItem(item);
    }
    this.draw();
  }

  /** The thing a draw stroke makes: a tap gives the usual size, a drag covers what it crossed. */
  private drawnItem(stroke: Stroke): DistributiveOmit<BlockItem, 'id' | 'priority'> | undefined {
    const world = this.world;
    const kind = this.drawKind;
    const tap =
      Math.abs(stroke.last.x - stroke.start.x) < 0.25 &&
      Math.abs(stroke.last.y - stroke.start.y) < 0.25;
    let rect: CellRect;
    if (tap) {
      const d = defaultItem(kind, '', stroke.start.x, stroke.start.y) as { rect: CellRect };
      const [, , w, h] = d.rect;
      const x = Math.max(0, Math.min(world.x - w, d.rect[0]));
      const y = Math.max(0, Math.min(world.y - h, d.rect[1]));
      rect = [x, y, Math.min(w, world.x), Math.min(h, world.y)];
    } else {
      const lo = (v: number) => Math.floor(v * 2) / 2;
      const hi = (v: number) => Math.ceil(v * 2) / 2;
      const x0 = Math.max(0, lo(Math.min(stroke.start.x, stroke.last.x)));
      const y0 = Math.max(0, lo(Math.min(stroke.start.y, stroke.last.y)));
      const x1 = Math.min(world.x, Math.max(x0 + 0.5, hi(Math.max(stroke.start.x, stroke.last.x))));
      const y1 = Math.min(world.y, Math.max(y0 + 0.5, hi(Math.max(stroke.start.y, stroke.last.y))));
      rect = [x0, y0, x1 - x0, y1 - y0];
    }
    switch (kind) {
      case 'cover':
        return { kind, rect, material: this.material };
      case 'gate':
        return { kind, rect, open: false };
      case 'prop': {
        // Keep the picture's shape, centred in what was drawn.
        const { w, h } = imageAsset(this.propImage).size;
        const height = Math.min(rect[3], (rect[2] * h) / w);
        const width = (height * w) / h;
        return {
          kind,
          image: this.propImage,
          rect: [rect[0] + (rect[2] - width) / 2, rect[1] + (rect[3] - height) / 2, width, height],
        };
      }
      case 'ladder': {
        const up = tap || stroke.start.y >= stroke.last.y;
        return {
          kind,
          rect,
          bottom: [0.5, up ? 0.85 : 0.15],
          top: [0.5, up ? 0.15 : 0.85],
        };
      }
      default:
        return { kind, rect };
    }
  }

  private paint(from: Vec2, to: Vec2): void {
    const m = this.model;
    const steps = Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y), 1);
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(from.x + ((to.x - from.x) * i) / steps);
      const y = Math.round(from.y + ((to.y - from.y) * i) / steps);
      const brush = this.brushRect({ x, y });
      for (let row = brush.y; row < brush.y + brush.h; row++)
        for (let col = brush.x; col < brush.x + brush.w; col++) m.paint(col, row);
    }
  }

  private brushRect(at: Vec2): Rect {
    const size =
      this.model.paintKind === 'mist' || this.model.paintKind === 'eraseMist' ? 1 : this.brushSize;
    const offset = Math.floor((size - 1) / 2);
    const left = at.x - offset;
    const top = at.y - offset;
    const x = Math.max(0, left);
    const y = Math.max(0, top);
    return {
      x,
      y,
      w: Math.min(this.model.cols, left + size) - x,
      h: Math.min(this.model.rows, top + size) - y,
    };
  }

  // ---------------------------------------------------------------- drawing

  private draw(): void {
    if (this.framePending) return;
    this.framePending = true;
    requestAnimationFrame(() => {
      this.framePending = false;
      this.drawFrame();
    });
  }

  private drawFrame(): void {
    const { canvas, ctx } = this;
    const m = this.model;
    const block = m.block;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    ctx.resetTransform();
    ctx.clearRect(0, 0, pixelWidth, pixelHeight);
    const world = this.world;
    const margin = this.margin;
    const fit = Math.min((width - 2 * margin) / world.x, (height - 2 * margin) / world.y);
    const size = Math.max(0.1, fit * this.zoom);
    this.pan.x = Math.max((-world.x * size) / 2, Math.min((world.x * size) / 2, this.pan.x));
    this.pan.y = Math.max((-world.y * size) / 2, Math.min((world.y * size) / 2, this.pan.y));
    const x = Math.floor((width - size * world.x) / 2 + this.pan.x);
    const y = Math.floor((height - size * world.y) / 2 + this.pan.y);
    this.grid = { x, y, size };
    const scenario = isScenario(block);
    ctx.setTransform(dpr * size, 0, 0, dpr * size, dpr * x, dpr * y);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, world.x, world.y);
    ctx.clip();
    const { cols, rows } = m;
    const left = Math.max(0, Math.floor(-x / size));
    const top = Math.max(0, Math.floor(-y / size));
    const right = Math.min(cols, Math.ceil((width - x) / size));
    const bottom = Math.min(rows, Math.ceil((height - y) / size));
    const view = { left, top, right, bottom };
    this.groundCache.draw(ctx, block.ground, size * dpr, view);

    // Painted bushes and trenches, in world units.
    const cs = scenarioCellSize(block);
    if (this.paintedConcealment?.block.ground !== block.ground) {
      this.paintedConcealment = { block, areas: paintedConcealment(block.ground, cs) };
    }
    if (this.paintedConcealment.areas.length) {
      ctx.save();
      ctx.scale(1 / cs, 1 / cs);
      for (const area of this.paintedConcealment.areas) {
        const r = area.rect;
        if (
          r.x + r.w < (left - 1) * cs ||
          r.x > (right + 1) * cs ||
          r.y + r.h < (top - 1) * cs ||
          r.y > (bottom + 1) * cs
        )
          continue;
        drawConcealment(this.concealmentPainter, area);
      }
      drawTrenchRims(this.concealmentPainter, block.ground, cs, view);
      ctx.restore();
    }
    // Mist coats and (blocks) the edge tiles neighbours match against.
    for (let r = top; r < bottom; r++) {
      for (let c = left; c < right; c++) {
        const coats = Number(block.mist?.[r]?.[c] ?? 0);
        if (coats > 0) {
          ctx.fillStyle = `rgba(218,230,230,${(coats * 0.54) / MAX_MIST_COATS})`;
          ctx.fillRect(c, r, 1, 1);
        }
        if (!scenario && onEdge(c, r, cols, rows)) {
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(c, r, 1, 1);
        }
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
    const overview = this.tab === 'file';
    if (!overview && this.tab !== 'terrain') {
      ctx.fillStyle = '#10141cb8';
      ctx.fillRect(0, 0, world.x, world.y);
    }
    // (13-b) Things the budget doesn't buy stay visible (and clickable), faded.
    const spawned = scenario ? null : m.spend().spawned;
    const bought = (it: BlockItem) => !spawned || spawned.has(it.id);
    // The current layer last, so faded things never cover what's being edited. Rects under points.
    const passes: [boolean, boolean][] = overview
      ? [
          [true, true],
          [true, false],
        ]
      : [
          [false, true],
          [false, false],
          [true, true],
          [true, false],
        ];
    for (const [active, rects] of passes) {
      for (const it of block.items) {
        if (isRectItem(it) !== rects || (!overview && this.inLayer(it) !== active)) continue;
        ctx.globalAlpha = (active ? 1 : 0.28) * (bought(it) ? 1 : 0.35);
        this.drawItem(it, m.selected === it.id);
      }
    }
    ctx.globalAlpha = 1;
    const showLogic = overview || this.tab === 'logic' || this.tab === 'enemies';
    ctx.globalAlpha = showLogic ? 1 : 0.28;
    this.drawLinks();
    ctx.globalAlpha = 1;
    if (this.stroke && 'start' in this.stroke && this.tool === 'draw') {
      const item = this.drawnItem(this.stroke);
      if (item) {
        ctx.globalAlpha = 0.65;
        this.drawItem({ ...item, id: '', priority: 0 } as BlockItem, false);
        ctx.globalAlpha = 1;
      }
    }
    if (this.tool === 'paint' && this.hoverCell && !(this.stroke && 'client' in this.stroke)) {
      const b = this.brushRect(this.hoverCell);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5 / size;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
    }
    ctx.restore();
    ctx.lineWidth = 2 / size;
    ctx.strokeStyle = '#000';
    ctx.strokeRect(0, 0, world.x, world.y);

    // Screen-space labels: squads, priorities, and (square blocks) what fits each side.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sx = (cx: number) => x + cx * size;
    const sy = (cy: number) => y + cy * size;
    if (showLogic) this.drawSquadLabels(sx, sy, spawned);
    if (!scenario) {
      for (const it of block.items) {
        if (!this.inLayer(it) || it.priority === 0) continue;
        const [px, py] = isRectItem(it) ? [it.rect[0] + it.rect[2], it.rect[1]] : it.at;
        badge(ctx, String(it.priority), sx(px) + 6, sy(py) - 6);
      }
      if (cols === rows && EDGE_PRESETS[0]!.profile.length === cols) {
        const fits = this.fits();
        const label = (s: Side) => str('editor.edgeFits', { n: fits[s] });
        ctx.fillStyle = '#aeb6c0';
        ctx.font = '12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const mx = sx(world.x / 2);
        const my = sy(world.y / 2);
        ctx.fillText(`▲ ${label('n')}`, mx, sy(0) - margin / 2);
        ctx.fillText(`${label('s')} ▼`, mx, sy(world.y) + margin / 2);
        for (const [s, px, turn] of [
          ['e', sx(world.x) + margin / 2, Math.PI / 2],
          ['w', sx(0) - margin / 2, -Math.PI / 2],
        ] as const) {
          ctx.save();
          ctx.translate(px, my);
          ctx.rotate(turn);
          ctx.fillText(label(s), 0, 0);
          ctx.restore();
        }
      }
    }
  }

  /** Lever → gate lines and each squad's rally points joined up, in cells. */
  private drawLinks(): void {
    const ctx = this.ctx;
    const items = this.model.block.items;
    const px = 1 / this.grid.size;
    ctx.save();
    ctx.setLineDash([4 * px, 4 * px]);
    ctx.strokeStyle = 'rgba(242,193,78,0.8)';
    ctx.lineWidth = 1.5 * px;
    for (const it of items) {
      if (it.kind !== 'lever') continue;
      const gate = items.find((g) => g.id === it.target);
      if (!gate || !isRectItem(gate)) continue;
      const [gx, gy, gw, gh] = gate.rect;
      ctx.beginPath();
      ctx.moveTo(it.at[0], it.at[1]);
      ctx.lineTo(gx + gw / 2, gy + gh / 2);
      ctx.stroke();
    }
    ctx.setLineDash([3 * px, 5 * px]);
    for (const g of this.model.block.groups) {
      const pts = items.flatMap((i) => (i.kind === 'rally' && i.group === g.id ? [i.at] : []));
      if (pts.length < 2) continue;
      ctx.strokeStyle = groupColor(g.id);
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (pts.length > 2) ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Each squad's roster by its first rally point ("squad-1: Ri Ri Ma 2/3"). */
  private drawSquadLabels(
    sx: (x: number) => number,
    sy: (y: number) => number,
    spawned: ReadonlySet<string> | null,
  ): void {
    const ctx = this.ctx;
    for (const g of this.model.block.groups) {
      const first = this.model.block.items.find((i) => i.kind === 'rally' && i.group === g.id);
      if (!first || !('at' in first)) continue;
      const bought = spawned
        ? g.units.filter((_, i) => spawned.has(unitId(g.id, i))).length
        : g.units.length;
      const roster = g.units
        .map((u) => {
          const role = ROLES.find((r) => r.id === u.role);
          return role ? str(role.nameKey).slice(0, 2) : '?';
        })
        .join(' ');
      const text = `${g.id}: ${roster}${spawned ? ` ${bought}/${g.units.length}` : ''}`;
      ctx.font = 'bold 11px system-ui, sans-serif';
      const w = ctx.measureText(text).width + 8;
      const lx = sx(first.at[0]) + 10;
      const ly = sy(first.at[1]) + 10;
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(lx, ly, w, 16);
      ctx.fillStyle = groupColor(g.id);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, lx + 4, ly + 8);
    }
  }

  private drawItem(it: BlockItem, selected: boolean): void {
    if (isRectItem(it)) this.drawRect(it, selected);
    else this.drawPoint(it, selected);
  }

  private drawRect(it: Extract<BlockItem, { rect: CellRect }>, selected: boolean): void {
    const ctx = this.ctx;
    const cs = scenarioCellSize(this.model.block);
    const [x, y, w, h] = it.rect;
    const rect = { x, y, w, h };
    const px = 1 / this.grid.size;
    let image: CanvasImageSource | undefined;
    if (it.kind === 'cover') {
      const art = coverArtLayout({ id: '', rect, material: it.material }, false);
      const tex = this.art(art.key);
      if (tex) {
        ctx.save();
        ctx.translate(art.x, art.y);
        ctx.rotate(art.rotation);
        const pattern = ctx.createPattern(tex, 'repeat-x');
        if (pattern) {
          pattern.setTransform(
            new DOMMatrix()
              .translate(-art.width / 2, -art.height / 2)
              .scale(art.tileScale, art.height / tex.naturalHeight),
          );
          ctx.fillStyle = pattern;
          ctx.fillRect(-art.width / 2, -art.height / 2, art.width, art.height);
        }
        ctx.restore();
      } else image = this.coverStamps.get(it.material);
    } else if (it.kind === 'bush' || it.kind === 'trench') {
      ctx.save();
      ctx.scale(1 / cs, 1 / cs);
      drawConcealment(this.concealmentPainter, {
        kind: it.kind,
        id: it.id,
        rect: { x: x * cs, y: y * cs, w: w * cs, h: h * cs },
      });
      ctx.restore();
      if (!selected) return;
    } else if (it.kind === 'water') {
      image = this.art(TERRAIN_ART.W) ?? this.terrainStamps.get('W');
    } else if (it.kind === 'wall') {
      image = this.art(TERRAIN_ART.X) ?? this.wallStamp;
    } else if (it.kind === 'gate') {
      image = this.art(it.open ? 'gate_open' : 'gate_closed');
      if (!image) {
        ctx.fillStyle = it.open ? '#d08a2a70' : '#d08a2a';
        ctx.fillRect(x, y, w, h);
      }
    } else if (it.kind === 'prop' || it.kind === 'target') {
      image = this.art(it.kind === 'prop' ? it.image : 'target_dummy');
    } else if (it.kind === 'ladder') {
      const a = { x: x + w * it.bottom[0], y: y + h * it.bottom[1] };
      const b = { x: x + w * it.top[0], y: y + h * it.top[1] };
      ctx.lineWidth = Math.max(0.08, 2 * px);
      ctx.strokeStyle = '#f0ce99';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    } else {
      ctx.fillStyle = AREA_COLORS[it.kind] ?? '#ffffff40';
      ctx.fillRect(x, y, w, h);
    }
    if (image) ctx.drawImage(image, x, y, w, h);
    const gc = it.group ? groupColor(it.group) : null;
    ctx.strokeStyle = selected ? '#77dfff' : (gc ?? (it.kind === 'wall' ? '#bac6cd' : '#e7e9ec88'));
    ctx.lineWidth = (selected ? 2 : 0.9) * px;
    ctx.strokeRect(x, y, w, h);
  }

  private drawPoint(it: Extract<BlockItem, { at: CellPoint }>, selected: boolean): void {
    const ctx = this.ctx;
    const [x, y] = it.at;
    const px = 1 / this.grid.size;
    const r = Math.max(0.3, 7 * px);
    ctx.lineWidth = 2 * px;
    switch (it.kind) {
      case 'spawn':
        ctx.fillStyle = spawnBlocked(this.model.block, it.at) ? '#ff8b74' : '#a4e7f9';
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y + r);
        ctx.lineTo(x - r, y + r);
        ctx.closePath();
        ctx.fill();
        break;
      case 'turret': {
        ctx.fillStyle = '#8e2b22';
        ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
        const a = (it.facing * Math.PI) / 180;
        ctx.strokeStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * r * 1.7, y + Math.sin(a) * r * 1.7);
        ctx.stroke();
        break;
      }
      case 'rally':
        // A rally point: a diamond in its squad's colour ([Q54]).
        ctx.fillStyle = groupColor(it.group);
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - r, y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1.5 * px;
        ctx.stroke();
        break;
      case 'mine':
        ctx.fillStyle = '#e74c3c';
        ctx.beginPath();
        ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'lever':
        ctx.fillStyle = '#f2c14e';
        ctx.fillRect(x - r * 0.5, y - r * 0.5, r, r);
        break;
      case 'capture':
        ctx.strokeStyle = '#7fb6ff';
        ctx.setLineDash([5 * px, 4 * px]);
        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#7fb6ff';
        ctx.beginPath();
        ctx.moveTo(x, y + r);
        ctx.lineTo(x, y - r);
        ctx.lineTo(x + r, y - r * 0.5);
        ctx.lineTo(x, y);
        ctx.fill();
        break;
      case 'objective':
        ctx.fillStyle = '#ffd34d';
        star(ctx, x, y, r);
        break;
    }
    if (it.group && it.kind !== 'rally') {
      ctx.strokeStyle = groupColor(it.group);
      ctx.lineWidth = 2 * px;
      ctx.beginPath();
      ctx.arc(x, y, r + 4 * px, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (selected) {
      ctx.strokeStyle = '#77dfff';
      ctx.lineWidth = 2 * px;
      ctx.beginPath();
      ctx.arc(x, y, r + 7 * px, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

// ---------------------------------------------------------------- helpers

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

const round = (v: number) => Math.round(v * 100) / 100;

/** Bushes and trenches painted as tiles (world units), as the game draws them. */
function paintedConcealment(ground: readonly string[], cs: number): ConcealmentArea[] {
  const out: ConcealmentArea[] = [];
  const cols = ground[0]?.length ?? 0;
  if (ground.some((row) => row.includes('U')))
    addPaintedBushes(
      maskRects(cols, ground.length, cs, (x, y) => ground[y]?.[x] === 'U'),
      out,
    );
  if (ground.some((row) => row.includes('T')))
    addPaintedTrenches(
      maskRects(cols, ground.length, cs, (x, y) => ground[y]?.[x] === 'T'),
      out,
    );
  return out;
}

function badge(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.font = 'bold 11px system-ui, sans-serif';
  const w = ctx.measureText(text).width + 6;
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(x - 2, y - 8, w, 14);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 1, y - 1);
}

function groupColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 80%, 62%)`;
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function field(label: string, control: HTMLElement): HTMLElement {
  const l = el('label');
  l.append(document.createTextNode(label), control);
  return l;
}

function input(value: string, onCommit: (v: string) => void): HTMLInputElement {
  const i = el('input');
  i.value = value;
  i.onchange = () => onCommit(i.value);
  return i;
}

function numberInput(value: number, onCommit: (v: number) => void): HTMLInputElement {
  const i = el('input');
  i.type = 'number';
  i.step = '0.5';
  i.value = String(round(value));
  i.onchange = () => {
    const v = Number(i.value);
    if (Number.isFinite(v)) onCommit(v);
  };
  return i;
}

function select(
  options: [string, string][],
  value: string,
  onChange: (v: string) => void,
): HTMLSelectElement {
  const s = el('select');
  for (const [v, text] of options) {
    const o = el('option', '', text);
    o.value = v;
    s.append(o);
  }
  s.value = value;
  s.onchange = () => onChange(s.value);
  return s;
}

function checkbox(label: string, on: boolean, onChange: (v: boolean) => void): HTMLElement {
  const l = el('label', 'inline');
  const c = el('input');
  c.type = 'checkbox';
  c.checked = on;
  c.onchange = () => onChange(c.checked);
  l.append(c, document.createTextNode(label));
  return l;
}
