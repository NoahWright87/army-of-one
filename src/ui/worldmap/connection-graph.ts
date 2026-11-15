/**
 * (PHASE13) The block connection graph ([D104]): every block as a small picture of its tiles,
 * linked to every block it can sit next to. Bigger = connects to more. A simple force layout pulls
 * well-connected blocks to the middle and pushes rare ones to the edge. Click a block to see what
 * it connects to; open it in the editor from there.
 */
import { BLOCK_CELLS, GROUND, isGroundKind } from '../../content/ground';
import { str } from '../../content/strings';
import type { BlockDef } from '../../gen/block';
import { blockGraph } from '../../gen/graph';
import { el, injectStyle } from '../dom';

const css = `
.aoo-graph { position: fixed; inset: 0; z-index: 30; display: grid; grid-template-columns: 1fr 300px;
  background: #0d1013; font: 13px/1.4 system-ui, sans-serif; color: #e7e9ec; }
.aoo-graph canvas { width: 100%; height: 100%; display: block; cursor: pointer; }
.aoo-graph aside { overflow-y: auto; padding: 12px; background: #181c21; border-left: 1px solid #262c33; }
.aoo-graph h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #8b95a1; margin: 12px 0 6px; }
.aoo-graph button { font: inherit; color: inherit; background: #232930; border: 1px solid #343c46;
  border-radius: 4px; padding: 5px 8px; cursor: pointer; width: 100%; margin-bottom: 4px; }
.aoo-graph .hint { color: #7d8792; font-size: 12px; }
.aoo-graph li { margin: 2px 0; cursor: pointer; }
.aoo-graph li:hover { color: #fff; }
@media (max-width: 900px) {
  .aoo-graph { grid-template-columns: 1fr; grid-template-rows: 60vh auto; overflow-y: auto; }
  .aoo-graph aside { border-left: 0; }
}
`;

export function openConnectionGraph(
  blocks: readonly BlockDef[],
  actions: { openBlock(id: string): void },
): void {
  injectStyle('aoo-graph', css);
  const graph = blockGraph(blocks);
  const n = blocks.length;
  const degree = graph.links.map((l) => l.filter((j, k, a) => a.indexOf(j) === k).length);
  const maxDeg = Math.max(1, ...degree);

  // Force layout: start on a circle (deterministic), springs along links, repulsion between all.
  const pos = blocks.map((_, i) => ({
    x: Math.cos((i / n) * Math.PI * 2) * 300,
    y: Math.sin((i / n) * Math.PI * 2) * 300,
  }));
  for (let it = 0; it < 400; it++) {
    const force = pos.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = pos[j]!.x - pos[i]!.x;
        const dy = pos[j]!.y - pos[i]!.y;
        const d2 = Math.max(100, dx * dx + dy * dy);
        const rep = 40000 / d2;
        const d = Math.sqrt(d2);
        force[i]!.x -= (dx / d) * rep;
        force[i]!.y -= (dy / d) * rep;
        force[j]!.x += (dx / d) * rep;
        force[j]!.y += (dy / d) * rep;
      }
      for (const j of graph.links[i]!) {
        if (j <= i) continue;
        const dx = pos[j]!.x - pos[i]!.x;
        const dy = pos[j]!.y - pos[i]!.y;
        const d = Math.max(1, Math.hypot(dx, dy));
        const pull = (d - 120) * 0.02;
        force[i]!.x += (dx / d) * pull;
        force[i]!.y += (dy / d) * pull;
        force[j]!.x -= (dx / d) * pull;
        force[j]!.y -= (dy / d) * pull;
      }
      // A gentle pull to the middle so loners don't fly off.
      force[i]!.x -= pos[i]!.x * 0.01;
      force[i]!.y -= pos[i]!.y * 0.01;
    }
    const cool = 1 - it / 400;
    pos.forEach((p, i) => {
      p.x += Math.max(-20, Math.min(20, force[i]!.x)) * cool;
      p.y += Math.max(-20, Math.min(20, force[i]!.y)) * cool;
    });
  }

  const root = el('div', 'aoo-graph');
  const canvas = el('canvas');
  const side = el('aside');
  root.append(canvas, side);
  document.body.append(root);
  let selected: number | null = null;
  let view = { k: 1, ox: 0, oy: 0 };
  const size = (i: number) => 10 + 18 * (degree[i]! / maxDeg);

  const thumbs = blocks.map((b) => {
    const c = document.createElement('canvas');
    c.width = BLOCK_CELLS;
    c.height = BLOCK_CELLS;
    const ctx = c.getContext('2d')!;
    b.ground.forEach((row, r) => {
      for (let col = 0; col < row.length; col++) {
        const ch = row[col]!;
        ctx.fillStyle = isGroundKind(ch)
          ? `#${GROUND[ch].color.toString(16).padStart(6, '0')}`
          : '#000';
        ctx.fillRect(col, r, 1, 1);
      }
    });
    return c;
  });

  const draw = () => {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const xs = pos.map((p) => p.x);
    const ys = pos.map((p) => p.y);
    const minX = Math.min(...xs) - 40;
    const minY = Math.min(...ys) - 40;
    const k = Math.min(w / (Math.max(...xs) + 40 - minX), h / (Math.max(...ys) + 40 - minY));
    view = {
      k,
      ox: (w - (Math.max(...xs) + 40 - minX) * k) / 2 - minX * k,
      oy: (h - (Math.max(...ys) + 40 - minY) * k) / 2 - minY * k,
    };
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const at = (i: number) => ({ x: pos[i]!.x * k + view.ox, y: pos[i]!.y * k + view.oy });
    for (let i = 0; i < n; i++) {
      for (const j of graph.links[i]!) {
        if (j <= i) continue;
        const hot = selected === i || selected === j;
        ctx.strokeStyle = hot ? 'rgba(255,225,77,0.85)' : 'rgba(160,180,200,0.12)';
        ctx.lineWidth = hot ? 2 : 1;
        const a = at(i);
        const b = at(j);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < n; i++) {
      const p = at(i);
      const s = size(i);
      const linked = selected !== null && graph.links[selected]!.includes(i);
      ctx.globalAlpha = selected === null || selected === i || linked ? 1 : 0.35;
      ctx.drawImage(thumbs[i]!, p.x - s, p.y - s, 2 * s, 2 * s);
      ctx.strokeStyle = selected === i ? '#ffe14d' : blocks[i]!.role ? '#ff8a80' : '#111';
      ctx.lineWidth = selected === i ? 3 : 1.5;
      ctx.strokeRect(p.x - s, p.y - s, 2 * s, 2 * s);
      ctx.globalAlpha = 1;
    }
  };

  const renderSide = () => {
    side.replaceChildren();
    const close = el('button', '', str('graph.close'));
    close.onclick = () => root.remove();
    side.append(close, el('h2', '', str('graph.title')), el('p', 'hint', str('graph.hint')));
    if (selected === null) return;
    const b = blocks[selected]!;
    side.append(
      el('h2', '', `${b.name}`),
      el('p', 'hint', str('graph.degree', { n: degree[selected]!, total: n })),
    );
    const open = el('button', '', str('world.block.open'));
    open.onclick = () => actions.openBlock(b.id);
    side.append(open);
    const ul = el('ul');
    for (const j of [...new Set(graph.links[selected])].sort((a, b2) => degree[b2]! - degree[a]!)) {
      const li = el('li', '', `${blocks[j]!.name} (${degree[j]})`);
      li.onclick = () => {
        selected = j;
        renderSide();
        draw();
      };
      ul.append(li);
    }
    side.append(ul);
  };

  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    selected = null;
    for (let i = n - 1; i >= 0; i--) {
      const px = pos[i]!.x * view.k + view.ox;
      const py = pos[i]!.y * view.k + view.oy;
      if (Math.abs(x - px) <= size(i) && Math.abs(y - py) <= size(i)) {
        selected = i;
        break;
      }
    }
    renderSide();
    draw();
  });
  window.addEventListener('keydown', function onKey(e) {
    if (e.key !== 'Escape' || !root.isConnected) return;
    root.remove();
    window.removeEventListener('keydown', onKey);
  });
  new ResizeObserver(draw).observe(canvas);
  renderSide();
}
