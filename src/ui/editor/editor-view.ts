/**
 * (PHASE13-a) Block editor screen ([D88]): tools on the left, the block on a 2D canvas in the
 * middle, block settings / the selected thing / problems / file actions on the right.
 * Desktop first (mouse + keyboard). Plays the block in the real game via `actions.play`.
 */
import { BLOCK_CELLS, EDGE_PRESETS, GROUND, PAINT_KINDS } from '../../content/ground';
import { ROLES } from '../../content/roles';
import { str, strDynamic, type StringKey } from '../../content/strings';
import type { RoleId } from '../../contracts/mission';
import {
  ALWAYS_KINDS,
  onEdge,
  groupIds,
  isRectItem,
  ITEM_KINDS,
  PRIORITIES,
  SIDES,
  unitId,
  validateBlock,
  type BlockDef,
  type BlockItem,
  type Priority,
  type Side,
} from '../../gen/block';
import { unitCost } from '../../gen/budget';
import type { CoverMaterial } from '../../sim/world/map';
import { el, injectStyle } from '../dom';
import type { EditorModel } from './editor-model';
import { snap, type Tool } from './editor-model';
import { assetUrl } from '../../render/assets/asset-urls';
import { TERRAIN_ART } from '../../content/terrain-art';
import {
  buildTerrainAtlas,
  drawTerrainCanvas,
  loadTerrainImages,
  type TerrainAtlas,
  type TerrainImages,
} from '../../render/terrain/transition-atlas';

/** (PHASE13) Where the open draft stands against My blocks. */
export type SaveState = 'saved' | 'dirty' | 'new' | 'official';

export interface EditorActions {
  newBlock(): void;
  download(): void;
  copy(): Promise<boolean>;
  upload(file: File): void;
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

const MATERIALS: CoverMaterial[] = [
  'sandbags',
  'crate',
  'halfWall',
  'fence',
  'window',
  'bunkerWindow',
];
const FACINGS = [0, 45, 90, 135, 180, 225, 270, 315];
const MARGIN = 26;

const COVER_COLOR: Record<CoverMaterial, string> = {
  sandbags: '#b39b6b',
  crate: '#8a6a3d',
  halfWall: '#9a9a92',
  fence: '#d0d0d0',
  window: '#6fa0c0',
  bunkerWindow: '#4a4f55',
};

const css = `
.aoo-ed { position: fixed; inset: 0; display: grid; grid-template-columns: 210px 1fr 300px;
  font: 13px/1.35 system-ui, sans-serif; color: #e7e9ec; background: #111418; }
.aoo-ed aside { overflow-y: auto; padding: 10px; background: #181c21; }
.aoo-ed aside.left { border-right: 1px solid #262c33; }
.aoo-ed aside.right { border-left: 1px solid #262c33; }
.aoo-ed h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #8b95a1;
  margin: 14px 0 6px; }
.aoo-ed h2:first-child { margin-top: 0; }
.aoo-ed .stage { position: relative; overflow: hidden; }
.aoo-ed canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
.aoo-ed button, .aoo-ed select, .aoo-ed input { font: inherit; color: inherit; background: #232930;
  border: 1px solid #343c46; border-radius: 4px; padding: 4px 6px; }
.aoo-ed button { cursor: pointer; }
.aoo-ed label input, .aoo-ed label select, .aoo-ed .grid2 input { width: 100%; min-width: 0;
  box-sizing: border-box; }
.aoo-ed label.inline input { width: auto; }
.aoo-ed button:hover { background: #2c343d; }
.aoo-ed button.on { background: #2f5b86; border-color: #4a86bd; }
.aoo-ed .col { display: flex; flex-direction: column; gap: 4px; }
.aoo-ed .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.aoo-ed .swatch { display: flex; align-items: center; gap: 6px; text-align: left; }
.aoo-ed .swatch i { width: 14px; height: 14px; border-radius: 2px; display: inline-block;
  border: 1px solid #0006; }
.aoo-ed label { display: flex; flex-direction: column; gap: 2px; margin-bottom: 6px;
  color: #aeb6c0; }
.aoo-ed label.inline { flex-direction: row; align-items: center; gap: 6px; }
.aoo-ed .hint { color: #7d8792; font-size: 12px; }
.aoo-ed .problems li { color: #f0b37e; margin-bottom: 4px; cursor: pointer; }
.aoo-ed .problems { padding-left: 16px; margin: 0; }
.aoo-ed .ok { color: #8fd18f; }
.aoo-ed .bad { color: #f0b37e; }
.aoo-ed button:disabled { opacity: .45; cursor: default; }
.aoo-ask { position: fixed; inset: 0; z-index: 20; background: rgba(5,8,11,.7); display: flex;
  align-items: center; justify-content: center; font: 14px/1.4 system-ui, sans-serif; color: #e7e9ec; }
.aoo-ask .panel { background: #181c21; border: 1px solid #2c343d; border-radius: 8px; padding: 18px;
  width: min(380px, calc(100% - 32px)); }
.aoo-ask .btns { display: flex; gap: 8px; margin-top: 14px; justify-content: flex-end; }
.aoo-ask button { font: inherit; color: inherit; background: #232930; border: 1px solid #343c46;
  border-radius: 4px; padding: 6px 12px; cursor: pointer; }
.aoo-ask button.go { background: #2f7a3d; border-color: #3f9a50; font-weight: 600; }
.aoo-ed .play { background: #2f7a3d; border-color: #3f9a50; font-weight: 600; padding: 8px; }
.aoo-ed .play:hover { background: #378a47; }
.aoo-ed .unit-row { display: grid; grid-template-columns: 1fr 58px 30px; gap: 4px; }
.aoo-ed .unit-row select { width: 100%; min-width: 0; }
.aoo-ed .budget input[type=range] { width: 100%; box-sizing: border-box; padding: 0; margin: 4px 0; }
.aoo-ed .budget-row { display: flex; justify-content: space-between; align-items: center; gap: 6px; }
.aoo-lib { position: fixed; inset: 0; z-index: 10; background: rgba(5,8,11,.72); display: flex;
  align-items: flex-start; justify-content: center; padding: 40px 16px; overflow-y: auto;
  font: 13px/1.35 system-ui, sans-serif; color: #e7e9ec; }
.aoo-lib .panel { width: min(760px, 100%); background: #181c21; border: 1px solid #2c343d;
  border-radius: 8px; padding: 16px 18px; }
.aoo-lib header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.aoo-lib header h1 { font-size: 17px; margin: 0; flex: 1; }
.aoo-lib button { font: inherit; color: inherit; background: #232930; border: 1px solid #343c46;
  border-radius: 4px; padding: 4px 8px; cursor: pointer; }
.aoo-lib button:hover { background: #2c343d; }
.aoo-lib button.go { background: #2f7a3d; border-color: #3f9a50; font-weight: 600; }
.aoo-lib h2 { font-size: 12px; color: #9fb3c8; margin: 14px 0 4px; font-weight: 600; }
.aoo-lib h2 span { color: #7d8792; font-weight: 400; }
.aoo-lib .row { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: 4px;
  background: #1e242b; margin-bottom: 3px; }
.aoo-lib .row.current { outline: 1px solid #4a86bd; }
.aoo-lib .name { flex: 1; }
.aoo-lib .tag { font-size: 11px; padding: 1px 6px; border-radius: 3px; background: #2b333c; color: #aeb6c0; }
.aoo-lib .tag.warn { background: #4a3520; color: #f0b37e; }
.aoo-lib .hint { color: #7d8792; margin: 0 0 6px; }
`;

export class EditorView {
  readonly root: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private left: HTMLElement;
  private right: HTMLElement;
  private cellPx = 32;
  private origin = { x: MARGIN, y: MARGIN };
  private hover: { x: number; y: number } | null = null;
  private drag: { id: string; dx: number; dy: number } | null = null;
  private painting = false;
  private terrainImages: TerrainImages | null = null;
  private terrainAtlas: TerrainAtlas | null = null;
  private terrainCache: { rows: string; canvas: HTMLCanvasElement } | null = null;

  constructor(
    host: HTMLElement,
    private readonly model: EditorModel,
    private readonly actions: EditorActions,
  ) {
    injectStyle('aoo-editor', css);
    this.root = el('div', 'aoo-ed');
    this.left = el('aside', 'left');
    this.right = el('aside', 'right');
    const stage = el('div', 'stage');
    this.canvas = el('canvas');
    stage.append(this.canvas);
    this.root.append(this.left, stage, this.right);
    host.append(this.root);
    this.ctx = this.canvas.getContext('2d')!;

    new ResizeObserver(() => this.draw()).observe(stage);
    this.canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', () => this.onUp());
    this.canvas.addEventListener('pointerleave', () => {
      this.hover = null;
      this.draw();
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
    model.onChange(() => this.refresh());
    this.refresh();
    void loadTerrainImages(assetUrl)
      .then((images) => {
        const atlas = buildTerrainAtlas(images);
        this.terrainImages = images;
        this.terrainAtlas = atlas;
        this.renderLeft();
        this.draw();
      })
      .catch(() => {
        /* The existing colour preview remains available if image decoding fails. */
      });
  }

  private fitCache: { block: BlockDef; fits: Record<Side, number> } | null = null;

  private fits(): Record<Side, number> {
    const b = this.model.block;
    if (this.fitCache?.block !== b) this.fitCache = { block: b, fits: this.actions.edgeFits(b) };
    return this.fitCache.fits;
  }

  refresh(): void {
    this.renderLeft();
    this.renderRight();
    this.draw();
  }

  // ---------------------------------------------------------------- input

  private toCell(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - this.origin.x) / this.cellPx,
      y: (e.clientY - r.top - this.origin.y) / this.cellPx,
    };
  }

  private onDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    const p = this.toCell(e);
    const m = this.model;
    if (m.tool === 'paint') {
      m.beginGesture();
      this.painting = true;
      m.paint(Math.floor(p.x), Math.floor(p.y));
      return;
    }
    const hit = m.hitTest(p.x, p.y);
    if (m.tool === 'place' && !hit) {
      if (p.x < 0 || p.y < 0 || p.x > BLOCK_CELLS || p.y > BLOCK_CELLS) return;
      m.place(p.x, p.y);
      return;
    }
    if (!hit) {
      m.select(null);
      return;
    }
    m.select(hit.id);
    const [ax, ay] = isRectItem(hit) ? hit.rect : hit.at;
    this.drag = { id: hit.id, dx: p.x - ax, dy: p.y - ay };
    m.beginGesture();
  }

  private onMove(e: PointerEvent): void {
    const p = this.toCell(e);
    this.hover = p;
    if (this.painting) this.model.paint(Math.floor(p.x), Math.floor(p.y));
    else if (this.drag) this.model.moveItemTo(this.drag.id, p.x - this.drag.dx, p.y - this.drag.dy);
    this.draw();
  }

  private onUp(): void {
    if (this.painting || this.drag) this.model.endGesture();
    this.painting = false;
    this.drag = null;
  }

  private onKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    const m = this.model;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      this.actions.save();
    } else if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) m.redo();
      else m.undo();
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      m.redo();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      m.deleteSelected();
    } else if (e.key.toLowerCase() === 'r' && !mod) {
      m.rotateSelected();
    } else if (e.key === 'Escape') {
      m.select(null);
    }
  }

  // ---------------------------------------------------------------- left: tools

  private renderLeft(): void {
    const m = this.model;
    const box = this.left;
    box.replaceChildren();
    const exit = el('button', '', str('editor.exit'));
    exit.onclick = () => this.actions.exit();
    exit.style.width = '100%';
    exit.style.marginBottom = '12px';
    box.append(exit);
    box.append(el('h2', '', str('editor.tools')));
    const tools = el('div', 'col');
    const tool = (t: Tool, key: StringKey) => {
      const b = el('button', m.tool === t ? 'on' : '', str(key));
      b.onclick = () => {
        m.tool = t;
        m.touch();
      };
      tools.append(b);
    };
    tool('select', 'editor.tool.select');
    tool('paint', 'editor.tool.paint');
    tool('place', 'editor.tool.place');
    box.append(tools);

    box.append(el('h2', '', str('editor.ground')));
    const ground = el('div', 'grid2');
    for (const k of PAINT_KINDS) {
      const b = el('button', `swatch ${m.tool === 'paint' && m.paintKind === k ? 'on' : ''}`);
      const i = el('i');
      i.style.background = hex(GROUND[k].color);
      if (this.terrainImages) {
        i.style.backgroundImage = `url("${assetUrl(TERRAIN_ART[k])}")`;
        i.style.backgroundSize = 'cover';
      }
      b.append(i, document.createTextNode(strDynamic(GROUND[k].nameKey)));
      b.onclick = () => {
        m.tool = 'paint';
        m.paintKind = k;
        m.touch();
      };
      ground.append(b);
    }
    box.append(ground);

    box.append(el('h2', '', str('editor.place')));
    const things = el('div', 'col');
    for (const { kind } of ITEM_KINDS) {
      const b = el(
        'button',
        m.tool === 'place' && m.placeKind === kind ? 'on' : '',
        strDynamic(`editor.kind.${kind}`),
      );
      b.onclick = () => {
        m.tool = 'place';
        m.placeKind = kind;
        m.touch();
      };
      things.append(b);
    }
    box.append(things);
    box.append(el('p', 'hint', str('editor.help')));
  }

  // ---------------------------------------------------------------- right: block, selection, file

  private renderRight(): void {
    const m = this.model;
    // Fields commit on change (Enter / leaving the field), never per keystroke, so rebuilding
    // here never eats half-typed text.
    const box = this.right;
    box.replaceChildren();

    box.append(el('h2', '', str('editor.block')));
    box.append(
      field(
        str('editor.blockName'),
        input(m.block.name, (v) => m.setMeta({ name: v })),
      ),
      field(
        str('editor.blockId'),
        input(m.block.id, (v) => v.trim() && m.setMeta({ id: v.trim() })),
      ),
    );
    box.append(
      field(
        str('editor.role'),
        select(
          [
            ['', str('editor.role.none')],
            ['start', str('editor.role.start')],
            ['hq', str('editor.role.hq')],
          ],
          m.block.role ?? '',
          (v) => m.setMeta({ role: v === 'start' || v === 'hq' ? v : undefined }),
        ),
      ),
    );
    // (PHASE13) Edges are the outer row of tiles; they join any block whose touching tiles
    // match, give or take one place ([D101]). Presets paint a standard edge.
    box.append(el('h2', '', str('editor.edges')));
    box.append(el('div', 'hint', str('editor.edgesHint')));
    const fits = this.fits();
    const edges = el('div', 'grid2');
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

    box.append(el('h2', '', str('editor.budget')));
    box.append(this.budgetPanel());

    box.append(el('h2', '', str('editor.selected')));
    box.append(this.selectionPanel());

    box.append(el('h2', '', str('editor.problems')));
    box.append(el('div', 'problems-host'));
    this.renderProblems();

    box.append(el('h2', '', str('editor.file')));
    const file = el('div', 'col');
    // (PHASE13) Saved or not: nothing lands in My blocks until you save.
    const state = this.actions.saveState();
    file.append(el('div', state === 'dirty' ? 'hint bad' : 'hint', str(`editor.state.${state}`)));
    const saveBtn = el(
      'button',
      state === 'dirty' || state === 'new' ? 'play' : '',
      str('editor.save'),
    );
    saveBtn.disabled = state === 'saved';
    saveBtn.onclick = () => this.actions.save();
    file.append(saveBtn);
    const play = el('button', 'play', str('editor.play'));
    play.onclick = () => this.actions.play();
    const dl = el('button', '', str('editor.download'));
    dl.onclick = () => this.actions.download();
    const cp = el('button', '', str('editor.copy'));
    cp.onclick = () => {
      void this.actions.copy().then((ok) => {
        if (ok) cp.textContent = str('editor.copied');
        setTimeout(() => (cp.textContent = str('editor.copy')), 1200);
      });
    };
    const up = el('input');
    up.type = 'file';
    up.accept = '.json,application/json';
    up.style.display = 'none';
    up.onchange = () => {
      const f = up.files?.[0];
      if (f) this.actions.upload(f);
      up.value = '';
    };
    const open = el('button', '', str('editor.upload'));
    open.onclick = () => up.click();
    const fresh = el('button', '', str('editor.new'));
    fresh.onclick = () => this.actions.newBlock();
    const lib = el('button', '', str('editor.library'));
    lib.onclick = () => this.openLibrary();
    const level = el('button', '', str('editor.playLevel'));
    level.onclick = () => this.actions.playLevel();
    file.append(play, level, lib, fresh, dl, cp, open, up);
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
    const shuffle = el('button', '', str('editor.reshuffle'));
    shuffle.title = str('editor.reshuffleHint');
    shuffle.onclick = () => {
      m.spendSeed++;
      update();
      this.draw();
    };
    row.append(label, shuffle);
    update();
    box.append(range, row, el('div', 'hint', str('editor.budgetHint')));
    return box;
  }

  /** (13-b) The block library: the player's blocks and the official ones, by edge layout. */
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
    const render = () => {
      const { official, custom, current } = this.actions.library();
      const panel = el('div', 'panel');
      const header = el('header');
      const newB = el('button', '', str('editor.new'));
      newB.onclick = () => {
        close();
        this.actions.newBlock();
      };
      const level = el('button', 'go', str('editor.playLevel'));
      level.onclick = () => this.actions.playLevel();
      const x = el('button', '', str('editor.close'));
      x.onclick = close;
      const graphB = el('button', '', str('world.graph'));
      graphB.onclick = () => {
        close();
        this.actions.openGraph();
      };
      header.append(el('h1', '', str('editor.libraryTitle')), newB, graphB, level, x);
      panel.append(header, el('p', 'hint', str('editor.libraryHint')));

      const all = [
        ...custom.map((b) => ({ b, official: false })),
        ...official.map((b) => ({ b, official: true })),
      ];
      for (const [title, rowsOf] of [
        [str('editor.mine'), all.filter((x) => !x.official)],
        [str('editor.officialBlocks'), all.filter((x) => x.official)],
      ] as const) {
        if (rowsOf.length === 0) continue;
        const h = el('h2', '', `${title} `);
        h.append(el('span', '', str('editor.layoutCount', { n: rowsOf.length })));
        panel.append(h);
        for (const { b, official: isOfficial } of rowsOf) {
          const isOpen =
            current.id === b.id &&
            (isOfficial ? current.kind === 'official' : current.kind === 'mine');
          const row = el('div', `row${isOpen ? ' current' : ''}`);
          row.append(el('span', 'name', `${b.name}  (${b.id})`));
          if (isOfficial) row.append(el('span', 'tag', str('editor.official')));
          if (isOpen) row.append(el('span', 'tag', str('editor.current')));
          if (b.role) row.append(el('span', 'tag', str(`editor.role.${b.role}`)));
          if (!isOfficial && validateBlock(b).length) {
            row.append(el('span', 'tag warn', str('editor.notInLevels')));
          }
          const open = el('button', '', str('editor.open'));
          open.onclick = () => {
            close();
            this.actions.openBlock(b.id);
          };
          row.append(open);
          if (!isOfficial) {
            const del = el('button', '', str('editor.deleteBlock'));
            del.onclick = () => {
              if (window.confirm(str('editor.deleteConfirm', { name: b.name }))) {
                this.actions.deleteBlock(b.id);
                overlay.replaceChildren(render());
              }
            };
            row.append(del);
          }
          panel.append(row);
        }
      }
      return panel;
    };
    overlay.append(render());
    document.body.append(overlay);
  }

  /**
   * (PHASE13) A rally point's squad ([Q54]): which squad it belongs to, and that squad's roster.
   * Units spawn at a random rally point of their squad and roam between them.
   */
  private squadPanel(groupId: string): HTMLElement {
    const m = this.model;
    const box = el('div');
    const NEW = '\u0000new';
    const sel = el('div', 'col');
    const it = m.selectedItem;
    sel.append(
      field(
        str('editor.prop.squad'),
        select(
          [
            ...groupIds(m.block).map((g) => [g, g] as [string, string]),
            [NEW, str('editor.squad.new')],
          ],
          groupId,
          (v) => {
            if (!it) return;
            m.beginGesture();
            const target = v === NEW ? m.addGroup() : v;
            m.updateItem(it.id, { group: target });
            m.endGesture();
            m.select(it.id);
          },
        ),
      ),
    );
    box.append(sel);
    const g = m.group(groupId);
    if (!g) return box;
    box.append(
      field(
        str('editor.squad.name'),
        input(g.id, (v) => m.renameGroup(g.id, v.trim())),
      ),
    );
    const units = el('div', 'col');
    units.append(el('div', 'hint', str('editor.squad.units')));
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
      const del = el('button', '', '✕');
      del.title = str('editor.delete');
      del.onclick = () =>
        m.setGroupUnits(
          g.id,
          g.units.filter((_, j) => j !== i),
        );
      row.append(role, pri, del);
      units.append(row);
    });
    const add = el('button', '', str('editor.squad.addUnit'));
    add.onclick = () => {
      const last = g.units[g.units.length - 1];
      m.setGroupUnits(g.id, [
        ...g.units,
        { role: last?.role ?? 'rifleman', priority: last?.priority ?? 1 },
      ]);
    };
    units.append(add);
    const cost = g.units.reduce((n, u) => n + unitCost(u), 0);
    const points = m.block.items.filter((x) => x.kind === 'rally' && x.group === g.id).length;
    units.append(
      el('div', 'hint', str('editor.squad.summary', { n: g.units.length, cost, points })),
    );
    const delGroup = el('button', '', str('editor.squad.delete'));
    delGroup.onclick = () => {
      if (window.confirm(str('editor.squad.deleteConfirm', { name: g.id }))) m.deleteGroup(g.id);
    };
    units.append(delGroup);
    box.append(units);
    return box;
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

  private renderProblems(): void {
    const host = this.right.querySelector('.problems-host');
    if (!host) return;
    const problems = validateBlock(this.model.block);
    if (!problems.length) {
      host.replaceChildren(el('p', 'ok', str('editor.noProblems')));
      return;
    }
    const ul = el('ul', 'problems');
    for (const p of problems) {
      const li = el('li', '', strDynamic(p.key, p.params));
      if (p.itemId) li.onclick = () => this.model.select(p.itemId!);
      ul.append(li);
    }
    host.replaceChildren(ul);
  }

  private selectionPanel(): HTMLElement {
    const m = this.model;
    const it = m.selectedItem;
    const box = el('div');
    if (!it) {
      box.append(el('p', 'hint', str('editor.nothingSelected')));
      return box;
    }
    box.append(
      el('div', 'hint', strDynamic(`editor.kind.${it.kind}`)),
      field(
        str('editor.prop.id'),
        input(it.id, (v) => m.renameItem(it.id, v.trim())),
      ),
    );
    if (!ALWAYS_KINDS.has(it.kind)) {
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
    if (it.kind === 'rally') box.append(this.squadPanel(it.group));
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
    if (isRectItem(it)) {
      const [x, y, w, h] = it.rect;
      const size = el('div', 'grid2');
      size.append(
        numberInput(w, (v) => m.updateItem(it.id, { rect: [x, y, v, h] })),
        numberInput(h, (v) => m.updateItem(it.id, { rect: [x, y, w, v] })),
      );
      box.append(field(str('editor.prop.size'), size));
    }
    const pos = el('div', 'grid2');
    const [px, py] = isRectItem(it) ? it.rect : it.at;
    pos.append(
      numberInput(px, (v) => m.moveItemTo(it.id, v, py)),
      numberInput(py, (v) => m.moveItemTo(it.id, px, v)),
    );
    box.append(field(str('editor.prop.position'), pos));

    const row = el('div', 'grid2');
    const rot = el('button', '', str('editor.rotate'));
    rot.onclick = () => m.rotateSelected();
    const del = el('button', '', str('editor.delete'));
    del.onclick = () => m.deleteSelected();
    row.append(rot, del);
    box.append(row);
    return box;
  }

  // ---------------------------------------------------------------- canvas

  private draw(): void {
    const c = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (!w || !h) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const n = BLOCK_CELLS;
    this.cellPx = Math.max(8, Math.floor(Math.min(w - 2 * MARGIN, h - 2 * MARGIN) / n));
    const size = this.cellPx * n;
    this.origin = { x: Math.round((w - size) / 2), y: Math.round((h - size) / 2) };
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(this.origin.x, this.origin.y);
    const cp = this.cellPx;
    const block = this.model.block;

    // Same neighbour-aware terrain edges as the game; cache while hovering/placing items.
    if (this.terrainImages && this.terrainAtlas) {
      const key = block.ground.join('\n');
      if (this.terrainCache?.rows !== key) {
        const canvas = document.createElement('canvas');
        canvas.width = n * 64;
        canvas.height = n * 64;
        drawTerrainCanvas(
          canvas.getContext('2d')!,
          block.ground,
          64,
          this.terrainImages,
          this.terrainAtlas,
        );
        this.terrainCache = { rows: key, canvas };
      }
      ctx.drawImage(this.terrainCache.canvas, 0, 0, size, size);
    }
    // Ground fallback and editor edge markings.
    for (let r = 0; r < n; r++) {
      for (let col = 0; col < n; col++) {
        const k = block.ground[r]?.[col] ?? 'G';
        if (!this.terrainImages) {
          ctx.fillStyle = hex(GROUND[k as keyof typeof GROUND]?.color ?? 0x000000);
          ctx.fillRect(col * cp, r * cp, cp, cp);
        }
        if (onEdge(col, r)) {
          // Edge tiles (what neighbours match against): light stripes.
          ctx.save();
          ctx.beginPath();
          ctx.rect(col * cp, r * cp, cp, cp);
          ctx.clip();
          ctx.strokeStyle = 'rgba(255,255,255,0.13)';
          ctx.lineWidth = 2;
          for (let d = -cp; d < cp; d += 7) {
            ctx.beginPath();
            ctx.moveTo(col * cp + d, r * cp + cp);
            ctx.lineTo(col * cp + d + cp, r * cp);
            ctx.stroke();
          }
          ctx.restore();
        }
      }
    }
    // Grid.
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cp + 0.5, 0);
      ctx.lineTo(i * cp + 0.5, size);
      ctx.moveTo(0, i * cp + 0.5);
      ctx.lineTo(size, i * cp + 0.5);
      ctx.stroke();
    }
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, size, size);

    // How many blocks fit against each side ([D101]).
    ctx.fillStyle = '#aeb6c0';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fitsNow = this.fits();
    const label = (s: Side) => str('editor.edgeFits', { n: fitsNow[s] });
    ctx.fillText(`▲ ${label('n')}`, size / 2, -MARGIN / 2);
    ctx.fillText(`${label('s')} ▼`, size / 2, size + MARGIN / 2);
    ctx.save();
    ctx.translate(size + MARGIN / 2, size / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillText(label('e'), 0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(-MARGIN / 2, size / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(label('w'), 0, 0);
    ctx.restore();

    // Items: rects under points.
    const items = block.items;
    const { spawned } = this.model.spend();
    const drawFaded = (it: BlockItem) => {
      // (13-b) Things the budget doesn't buy stay visible (and clickable), faded.
      this.ctx.globalAlpha = spawned.has(it.id) ? 1 : 0.28;
      this.drawItem(it);
      this.ctx.globalAlpha = 1;
    };
    for (const it of items) if (isRectItem(it)) drawFaded(it);
    for (const it of items) if (!isRectItem(it)) drawFaded(it);

    this.drawSquads(spawned);

    // Lever → gate lines.
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(242,193,78,0.8)';
    ctx.lineWidth = 1.5;
    for (const it of items) {
      if (it.kind !== 'lever') continue;
      const gate = items.find((g) => g.id === it.target);
      if (!gate || !isRectItem(gate)) continue;
      const [gx, gy, gw, gh] = gate.rect;
      ctx.beginPath();
      ctx.moveTo(it.at[0] * cp, it.at[1] * cp);
      ctx.lineTo((gx + gw / 2) * cp, (gy + gh / 2) * cp);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Hover hint.
    const m = this.model;
    if (this.hover) {
      const { x, y } = this.hover;
      if (m.tool === 'paint' && x >= 0 && y >= 0 && x < n && y < n) {
        const col = Math.floor(x);
        const r = Math.floor(y);
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 2;
        ctx.strokeRect(col * cp + 1, r * cp + 1, cp - 2, cp - 2);
      } else if (m.tool === 'place') {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.arc(snap(x) * cp, snap(y) * cp, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private drawItem(it: BlockItem): void {
    const ctx = this.ctx;
    const cp = this.cellPx;
    const sel = this.model.selected === it.id;
    const gc = it.group ? groupColor(it.group) : null;
    if (isRectItem(it)) {
      const [x, y, w, h] = it.rect;
      const fill =
        it.kind === 'wall' ? '#2b2f33' : it.kind === 'gate' ? '#d08a2a' : COVER_COLOR[it.material];
      const alpha = ctx.globalAlpha;
      if (it.kind === 'gate' && it.open) ctx.globalAlpha = alpha * 0.45;
      ctx.fillStyle = fill;
      ctx.fillRect(x * cp, y * cp, w * cp, h * cp);
      ctx.globalAlpha = alpha;
      ctx.lineWidth = gc ? 3 : 1.5;
      ctx.strokeStyle = gc ?? '#111';
      ctx.strokeRect(x * cp, y * cp, w * cp, h * cp);
      if (sel) {
        ctx.strokeStyle = '#ffe14d';
        ctx.lineWidth = 2;
        ctx.strokeRect(x * cp - 3, y * cp - 3, w * cp + 6, h * cp + 6);
      }
      this.badge(it, (x + w) * cp, y * cp);
      return;
    }
    const px = it.at[0] * cp;
    const py = it.at[1] * cp;
    const r = Math.max(6, cp * 0.32);
    ctx.lineWidth = 2;
    switch (it.kind) {
      case 'turret': {
        ctx.fillStyle = '#8e2b22';
        ctx.beginPath();
        ctx.rect(px - r, py - r, 2 * r, 2 * r);
        ctx.fill();
        const a = (it.facing * Math.PI) / 180;
        ctx.strokeStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(a) * r * 1.7, py + Math.sin(a) * r * 1.7);
        ctx.stroke();
        break;
      }
      case 'rally': {
        // (PHASE13) A rally point: a diamond in its squad's colour ([Q54]).
        ctx.fillStyle = gc ?? '#c9473f';
        ctx.beginPath();
        ctx.moveTo(px, py - r);
        ctx.lineTo(px + r, py);
        ctx.lineTo(px, py + r);
        ctx.lineTo(px - r, py);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        break;
      }
      case 'mine':
        ctx.fillStyle = '#e74c3c';
        ctx.beginPath();
        ctx.arc(px, py, r * 0.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'lever':
        ctx.fillStyle = '#f2c14e';
        ctx.fillRect(px - r * 0.5, py - r * 0.5, r, r);
        break;
      case 'capture':
        ctx.strokeStyle = '#7fb6ff';
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.arc(px, py, cp * 1.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#7fb6ff';
        ctx.beginPath();
        ctx.moveTo(px, py + r);
        ctx.lineTo(px, py - r);
        ctx.lineTo(px + r, py - r * 0.5);
        ctx.lineTo(px, py);
        ctx.fill();
        break;
      case 'objective':
        ctx.fillStyle = '#ffd34d';
        star(ctx, px, py, r);
        break;
    }
    if (gc && it.kind !== 'rally') {
      ctx.strokeStyle = gc;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, r + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (sel) {
      ctx.strokeStyle = '#ffe14d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, r + 8, 0, Math.PI * 2);
      ctx.stroke();
    }
    this.badge(it, px + r, py - r);
  }

  /**
   * (PHASE13) Each squad: dashed lines joining its rally points, and its roster by the first
   * point ("squad-1: Ri Ri Ma 2/3": what the budget buys of it).
   */
  private drawSquads(spawned: ReadonlySet<string>): void {
    const ctx = this.ctx;
    const cp = this.cellPx;
    for (const g of this.model.block.groups) {
      const pts = this.model.block.items.flatMap((i) =>
        i.kind === 'rally' && i.group === g.id ? [i.at] : [],
      );
      if (pts.length === 0) continue;
      const color = groupColor(g.id);
      if (pts.length > 1) {
        ctx.save();
        ctx.setLineDash([3, 5]);
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * cp, y * cp) : ctx.moveTo(x * cp, y * cp)));
        if (pts.length > 2) ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
      const bought = g.units.filter((_, i) => spawned.has(unitId(g.id, i))).length;
      const roster = g.units
        .map((u) => {
          const role = ROLES.find((r) => r.id === u.role);
          return role ? str(role.nameKey).slice(0, 2) : '?';
        })
        .join(' ');
      const text = `${g.id}: ${roster} ${bought}/${g.units.length}`;
      const [x, y] = pts[0]!;
      ctx.font = 'bold 11px system-ui, sans-serif';
      const w = ctx.measureText(text).width + 8;
      const lx = x * cp + 10;
      const ly = y * cp + 12;
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(lx, ly, w, 16);
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, lx + 4, ly + 8);
    }
  }

  /** Priority next to a thing; nothing for priority 0. */
  private badge(it: BlockItem, x: number, y: number): void {
    const text = it.priority > 0 ? String(it.priority) : '';
    if (!text) return;
    const ctx = this.ctx;
    ctx.font = 'bold 11px system-ui, sans-serif';
    const w = ctx.measureText(text).width + 6;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(x - 2, y - 8, w, 14);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 1, y - 1);
  }
}

// ---------------------------------------------------------------- helpers

function hex(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
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
  i.value = String(value);
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
