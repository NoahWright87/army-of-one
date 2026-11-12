/**
 * Respawn screen stylesheet (placeholder art direction, same palette as the HUD and settings
 * panel). Readability rules: X (red) and O (glowing green) dominate; event markers stay subtle;
 * "no longer happens" is dashed grey; interruption is dotted orange; unknown is hatched.
 */
export const RESPAWN_CSS = `
.aoo-respawn { position: absolute; inset: 0; z-index: 20; display: flex; flex-direction: column;
  gap: 10px; padding: 12px 16px; box-sizing: border-box; overflow: hidden; background: #0d1116;
  color: #e6e9ec; font: 14px/1.3 system-ui, sans-serif; -webkit-tap-highlight-color: transparent; }
.aoo-respawn * { box-sizing: border-box; }
.aoo-respawn [hidden] { display: none !important; }


.rs-main { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 12px; }
.rs-tl { background: rgba(16,20,24,.94); border: 1px solid #39424c; border-radius: 6px;
  min-height: 0; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
.rs-tl-bar { display: flex; align-items: center; gap: 10px; padding: 4px 6px 4px 12px; }
.rs-tl-bar h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em;
  color: #9fb3c8; margin: 0; white-space: nowrap; }
.rs-tools { display: flex; gap: 6px; margin-left: auto; }
.rs-tool { min-width: 44px; height: 44px; font: 600 20px system-ui, sans-serif; background: #222a32;
  color: #e6e9ec; border: 1px solid #3c4650; border-radius: 4px; cursor: pointer; padding: 0; }
.rs-tool.wide { font-size: 13px; padding: 0 12px; }
.rs-tool:hover { border-color: #66727e; }

.flag { fill: #4ade80; stroke: #0b3d1f; stroke-width: 1; }
.capflag line { stroke: #4ade80; stroke-width: 2; }
.capflag path { fill: #4ade80; stroke: #0b3d1f; stroke-width: 1; }
.capflag.unconf path { fill: #35e0ff; }
.capflag .hit { fill: transparent; }
.capline { stroke: #4ade80; stroke-width: 1; stroke-dasharray: 2 4; opacity: .55; }
.mk-capture .flag { fill: #4ade80; stroke: #0b3d1f; stroke-width: 1; }
.mk-capture .pole { stroke: #d6f5e0; stroke-width: 1.5; }

.rs-tl-frame { position: relative; flex: 1; min-height: 0; border-top: 1px solid #2b333b; }
.rs-tl-scroll { position: absolute; inset: 0; overflow-y: auto; overflow-x: hidden; touch-action: pan-y;
  user-select: none; -webkit-user-select: none; overscroll-behavior: contain; cursor: grab; }
.rs-axis { position: sticky; top: 0; z-index: 2; height: 40px; }
.rs-axis svg, .rs-rows svg { display: block; }
.rs-empty { position: absolute; left: 16px; right: 16px; top: 60px; text-align: center; color: #b5c0cc;
  font-size: 16px; line-height: 1.5; }
.rs-tl { position: relative; }
/* The key: a popover behind the ℹ️ button (tap it, or the popover, to close). */
.rs-legend { position: absolute; top: 52px; right: 8px; z-index: 5; max-width: min(340px, calc(100% - 16px));
  display: flex; flex-direction: column; gap: 6px; padding: 10px 14px; font-size: 13px; color: #c9d3dc;
  background: #161c22; border: 1px solid #4a5560; border-radius: 6px; box-shadow: 0 6px 20px rgba(0,0,0,.5);
  cursor: pointer; }
.rs-legend[hidden] { display: none; }
.rs-info { font-size: 18px; }
.rs-legend .lg { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.rs-tip { position: absolute; left: 0; top: 0; z-index: 5; pointer-events: none; background: #0b0e12;
  border: 1px solid #4a5560; color: #f1f3f5; padding: 5px 8px; border-radius: 4px; font-size: 13px;
  max-width: 280px; opacity: 0; transition: opacity .1s; box-shadow: 0 2px 8px rgba(0,0,0,.6); }
.rs-tip.on { opacity: 1; }

/* Timeline SVG */
.ax-bg { fill: #141a20; }
.ax-tick { stroke: #4a5560; }
.ax-lbl { fill: #9aa7b6; font: 11px system-ui, sans-serif; text-anchor: middle; font-variant-numeric: tabular-nums; }
.row-bg { fill: transparent; }
.row.odd .row-bg { fill: rgba(255,255,255,.03); }
.row.sel .row-bg { fill: rgba(94,227,138,.14); }
.row.pulse .row-bg { animation: rs-pulse 1.8s ease-out; }
@keyframes rs-pulse { 0%, 35% { fill: rgba(255,211,77,.38); } 100% { fill: rgba(255,211,77,0); } }
.row.never { opacity: .5; }
.sp-alive { fill: #d5e2f0; }
.sp-lost { stroke: #7a8591; stroke-width: 3; stroke-dasharray: 7 5; fill: none; }
.sp-frozen { stroke: #ffae42; stroke-width: 3.5; stroke-dasharray: 1 6; stroke-linecap: round; fill: none; }
.sp-unresolved { opacity: .75; animation: rs-shimmer 1.6s ease-in-out infinite alternate; }
@keyframes rs-shimmer { from { opacity: .45; } to { opacity: .9; } }
.start { stroke: #d5e2f0; stroke-width: 2; }
.mk .hit, .end .hit, .sp-next .hit { fill: transparent; }
.mk .dot { fill: #8597aa; opacity: .7; }
.mk-kill .dot, .mk-hazardDestroyed .dot { fill: #c3d0dd; }
.mk-damaged .dot { fill: #c77b78; }
.mk-capture .dot, .mk-objective .dot { fill: #e7c65a; }
.mk:hover .dot { opacity: 1; }
.end-o { cursor: pointer; }
.g-back { fill: #141a20; }
.g-x { stroke: #ff4d5e; stroke-width: 4; stroke-linecap: round; fill: none; }
.g-o { fill: #0f2a1a; stroke: #5ee38a; stroke-width: 4;
  filter: drop-shadow(0 0 3px #5ee38a) drop-shadow(0 0 7px rgba(94,227,138,.7)); }
.end-o:hover .g-o { stroke: #b4ffcb; }
.rs-legend .g-o { filter: none; stroke-width: 3; }
.rs-legend .g-x { stroke-width: 3; }
.sel-ring { fill: none; stroke: #ffd34d; stroke-width: 2.5; stroke-dasharray: 4 3; }
.g-bang { fill: #ffae42; }
.g-bang-t { fill: #1a1206; font-weight: 800; text-anchor: middle; font-family: system-ui, sans-serif; }
.g-check { fill: #ffd34d; }
.g-check-t { stroke: #1a1206; stroke-width: 3; fill: none; stroke-linecap: round; stroke-linejoin: round; }
.q { fill: #9aa7b6; font: 700 14px system-ui, sans-serif; }
.dim { fill: rgba(6,9,13,.62); }
.scrub { stroke: #35e0ff; stroke-width: 2; }
.scrub-lbl rect { fill: #0b3440; stroke: #35e0ff; }
.scrub-lbl text { fill: #bff6ff; font: 600 12px system-ui, sans-serif; }
.guide { stroke: #ffd34d; stroke-width: 1.5; stroke-dasharray: 5 4; opacity: .75; }
.guide-lbl rect { fill: #3a3010; stroke: #ffd34d; }
.guide-lbl text { fill: #ffe9a3; font: 600 12px system-ui, sans-serif; }
.lbl rect { fill: #161c22; }
.lbl.sel rect { fill: #173323; }
.lbl .name { fill: #e6e9ec; font: 600 13px system-ui, sans-serif; }
.lbl .sub { fill: #7f8b97; font: 11px system-ui, sans-serif; }
.lbl.never .name { fill: #7f8b97; }
.lbl.never .sub { fill: #c08a90; }
.flash { fill: #ffd34d; opacity: 0; animation: rs-flash 1.4s ease-out forwards; pointer-events: none; }
.flash.fl-lost, .flash.fl-frozen { fill: #ff7a85; }
.flash.fl-alive { fill: #8ff0ad; }
@keyframes rs-flash { 0% { opacity: .65; } 100% { opacity: 0; } }

/* (06-b) Revealed map panel ([D29]). Wide maps sit above the spawn list; tall maps (a vertical
   strip, forward = up) get their own column, sized from the height by map-panel.ts. */
.rs-map { background: rgba(16,20,24,.94); border: 1px solid #39424c; border-radius: 6px; min-width: 0;
  min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.rs-map-bar { display: flex; align-items: baseline; gap: 8px; padding: 8px 12px 6px; height: 34px; flex-shrink: 0;
  min-width: 0; overflow: hidden; }
.rs-map-bar h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #9fb3c8; margin: 0; }
.rs-map-pct { font-size: 12px; color: #6f7b88; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.rs-map-body { position: relative; flex: 0 1 auto; width: 100%; min-height: 0; max-height: 42vh;
  touch-action: manipulation; user-select: none; -webkit-user-select: none; }
.rs-main.map-tall .rs-map-body { flex: 1 1 auto; max-height: none; }
.rs-map-svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.rs-map-tip { max-width: 220px; }
.rs-view-toggle { display: none; }
.rs-map-bar .rs-view-toggle { margin-left: auto; align-self: center; height: 44px; min-width: 44px; }
.rs-map-legend { display: flex; flex-wrap: wrap; gap: 2px 10px; padding: 4px 10px 6px; font-size: 11px;
  color: #9aa7b6; border-top: 1px solid #2b333b; flex-shrink: 0; }
.rs-map-legend .lg { display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; }
.rs-map-legend svg { overflow: visible; }
.mp-fog, .mp-fog-sw { fill: #050608; }
.mp-fog-sw { stroke: #39424c; stroke-width: 1; }
.mp-edge { fill: none; stroke: #2f3842; }
.mp-ground { fill: #3d4f38; }
.mp-water { fill: #3a76a8; }
.mp-wall { fill: #b4bdc7; }
.mp-cover { fill: #c9ad7a; }
.mp-hit { fill: transparent; cursor: default; }
.mp-hit[data-select] { cursor: pointer; }
.mp-spawn { fill: #12313d; stroke: #4fd1ff; }
.mp-spawn.sel { fill: #3a3010; stroke: #ffd34d; }
.mp-spawn.off { fill: #1b2229; stroke: #6f7b88; }
.mp-spawn-a { fill: none; stroke: #bff0ff; stroke-linecap: round; stroke-linejoin: round; }
.mp-spawn.sel + .mp-spawn-a { stroke: #ffe9a3; }
.mp-spawn.off + .mp-spawn-a { stroke: #8a96a3; }
.mp-sel-ring { fill: none; stroke: #ffd34d; }
.mp-label { fill: #d8f4ff; font-family: system-ui, sans-serif; font-weight: 700; text-anchor: middle;
  paint-order: stroke; stroke: #07090c; stroke-linejoin: round; }
.mp-label.sel { fill: #ffe9a3; }
.mp-turret { fill: #ff4d5e; stroke: #3a0d12; }
.mp-turret.off { fill: #59626c; stroke: #2a2f35; }
.mp-dead { stroke: #e6e9ec; fill: none; stroke-linecap: round; }
.mp-mine { fill: #ff8a3d; stroke: #3a1a06; }
.mp-mine.off { fill: none; stroke: #6f7b88; }
.mp-traffic { stroke: #ffae42; fill: none; opacity: .55; }
.mp-gate { fill: #ffae42; stroke: #3a2606; }
.mp-bridge { fill: #9a7246; stroke: #2a1c0c; }
.mp-bridge.off { fill: #2f6390; stroke: #ff4d5e; stroke-dasharray: 3 2; }
.mp-cap { fill: none; stroke: #c8d0d8; }
.mp-cap.ours { stroke: #4ade80; }
.mp-obj { fill: #2a1206; stroke: #ffd34d; filter: drop-shadow(0 0 3px rgba(255,211,77,.7)); }
.mp-obj-in { fill: #ffd34d; }
.mp-obj.done { stroke: #5ee38a; fill: #0f2a1a; }
.mp-obj-in.done { fill: #5ee38a; }
.mp-flag { fill: #ffd34d; stroke: #1a1406; stroke-linejoin: round; }
.mp-flag.done { fill: #4ade80; }
.mp-x { stroke: #ff4d5e; fill: none; stroke-linecap: round; }
.mp-x-back { stroke: #07090c; fill: none; stroke-linecap: round; opacity: .8; }
.mp-o { fill: #0f2a1a; stroke: #5ee38a; filter: drop-shadow(0 0 3px #5ee38a); }
.mp-o.off { stroke: #3f7a52; filter: none; }
.mp-bang { fill: #ffae42; }
.mp-bang-t { fill: #1a1206; font-weight: 800; text-anchor: middle; font-family: system-ui, sans-serif; }
.rs-map-legend .mp-o { filter: none; }

}
.aoo-respawn .rs-money { border-top: 1px solid #2c3742; background: #141b22; flex: none; }
.aoo-respawn .rs-money[hidden] { display: none; }
.aoo-respawn .rs-money-svg { display: block; }
.aoo-respawn .rs-money .mn-lbl { fill: #9ee59a; font: 600 12px system-ui, sans-serif; }
.aoo-respawn .rs-money .mn-line { fill: none; stroke: #9ee59a; stroke-width: 2; stroke-linejoin: round; }
.aoo-respawn .rs-money .mn-zero { stroke: #44515e; stroke-dasharray: 3 3; }
.aoo-respawn .rs-money .mn-debt { fill: rgba(255, 90, 80, .14); }
.aoo-respawn .rs-money .mn-bounty { fill: #ffd34d; }
.aoo-respawn .rs-money .mn-buy { fill: #ff8a80; stroke: #141b22; }
.aoo-respawn .rs-money .mn-sel circle { fill: #fff; stroke: #9ee59a; stroke-width: 2; }
.aoo-respawn .rs-money .mn-sel text { fill: #fff; font: 700 12px system-ui, sans-serif; paint-order: stroke; stroke: #141b22; stroke-width: 3px; }
.aoo-respawn .rs-money .guide { stroke: #fff; stroke-opacity: .35; stroke-dasharray: 4 3; }

/* (PHASE12-c) Layout: the timeline and a full-height map side by side, the role button and
   DEPLOY in a bar under your thumb. */
.rs-main { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto;
  grid-template-areas: "tl" "bar"; gap: 8px; }
.rs-main.with-map { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "tl map" "bar bar"; }
.rs-main > .rs-tl { grid-area: tl; }
.rs-main > .rs-map { grid-area: map; }
.rs-main > .rs-deploy-bar { grid-area: bar; }
.rs-main.map-wide > .rs-map { width: min(30vw, 420px); }
.rs-map-bar { display: none; }
.rs-map-body { flex: 1 1 auto; max-height: none; }
.rs-main.map-wide .rs-map-body { flex: 0 1 auto; }

/* Spawn rows: a short track per spawn point, a chevron at its next entry. */
.row.spawnrow .row-bg { fill: rgba(79,209,255,.05); }
.row.spawnrow.sel .row-bg { fill: rgba(255,211,77,.12); }
.sp-track { stroke: #2f6f86; stroke-width: 2; }
.sp-entry { stroke: #4fd1ff; stroke-width: 1.5; opacity: .6; }
.sp-chev { fill: #4fd1ff; stroke: #07090c; stroke-width: 1; }
.sp-next { cursor: pointer; }
.sp-next.sel .sp-chev { fill: #ffd34d; }
.lbl.spawn { cursor: pointer; }
.lbl.spawn rect { fill: #11202a; }
.lbl.spawn.sel rect { fill: #2a2611; }
.lbl.spawn .name { fill: #9fdcf2; font: 600 11px system-ui, sans-serif; }
.lbl.spawn.sel .name { fill: #ffe07a; }
.lbl .rs-ricon { fill: #c9d3dc; }
.lbl.inert .rs-ricon, .lbl.inert .name { opacity: .6; }
.lbl.sel .rs-ricon { fill: #8ff0ad; }

/* Bottom bar. */
.rs-deploy-bar { display: flex; gap: 8px; align-items: stretch; }
.rs-role-btn { flex: 0 0 76px; position: relative; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 2px; min-height: 60px; background: #1d242b; color: #e6e9ec;
  border: 1px solid #3a444e; border-radius: 8px; cursor: pointer; padding: 0; }
.rs-role-btn .p { font: 600 12px system-ui, sans-serif; color: #9ee59a; font-variant-numeric: tabular-nums; }
.rs-role-btn.poor .p { color: #ff8a80; text-decoration: line-through; }
.rs-role-btn.locked { background: #161b20; color: #7f8b97; cursor: default; }
.rs-role-btn .lock { position: absolute; font-size: 20px; opacity: .55; }
.rs-deploy { flex: 1; min-height: 60px; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 0; background: #ffd34d; color: #1a1406; border: 0; border-radius: 8px;
  cursor: pointer; padding: 0 12px; }
.rs-deploy .go { font: 800 20px system-ui, sans-serif; letter-spacing: .06em; }
.rs-deploy .where { font: 600 12px system-ui, sans-serif; opacity: .75; }
.rs-deploy:hover:not(:disabled) { background: #ffe07a; }
.rs-deploy:disabled { background: #3a3f45; color: #8a96a3; cursor: default; }

/* The role menu, above the bar. */
.rs-role-menu { position: absolute; left: 16px; right: 16px; bottom: 84px; z-index: 30; max-width: 520px;
  background: #161c22; border: 1px solid #4a5560; border-radius: 8px; padding: 8px;
  box-shadow: 0 8px 28px rgba(0,0,0,.6); }
.rs-rm-money { font-size: 12px; color: #9ee59a; padding: 2px 4px 8px; }
.rs-rm-money.debt { color: #ff8a80; }
.rs-rm-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.rs-rm-item { position: relative; display: flex; flex-direction: column; align-items: center; gap: 3px;
  padding: 8px 4px 6px; background: #1d242b; color: #e6e9ec; border: 1px solid #3a444e;
  border-radius: 6px; cursor: pointer; font: 600 12px system-ui, sans-serif; }
.rs-rm-item .p { font-size: 11px; color: #9ee59a; }
.rs-rm-item .k { position: absolute; top: 3px; left: 5px; font-size: 10px; color: #6f7b88; }
.rs-rm-item.sel { border-color: #ffd34d; background: #2c2a1c; color: #ffe07a; }
.rs-rm-item.poor { opacity: .45; cursor: default; }
.rs-rm-item.poor .p { color: #ff8a80; text-decoration: line-through; }

@media (max-width: 760px) {
  .aoo-respawn { padding: 8px 10px 10px; }
  .rs-rm-item .k { display: none; }
}
`;
