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

.rs-head { display: flex; align-items: center; gap: 6px 28px; flex-wrap: wrap; }
.rs-head h1 { margin: 0; font-size: 22px; color: #ffd34d; letter-spacing: .02em; }
.rs-head dl { display: flex; gap: 4px 22px; margin: 0; flex-wrap: wrap; }
.rs-head dl div { display: flex; flex-direction: column; }
.rs-head dt { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #8a96a3; }
.rs-head dd { margin: 0; font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; }
.rs-head .done dd { color: #5ee38a; }

.rs-main { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 12px; }
.rs-tl, .rs-spawn { background: rgba(16,20,24,.94); border: 1px solid #39424c; border-radius: 6px;
  min-height: 0; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
.rs-tl-bar { display: flex; align-items: center; gap: 10px; padding: 4px 6px 4px 12px; }
.rs-tl-bar h2, .rs-spawn h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em;
  color: #9fb3c8; margin: 0; white-space: nowrap; }
.rs-hint { color: #6f7b88; font-size: 12px; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rs-tools { display: flex; gap: 6px; margin-left: auto; }
.rs-tool { min-width: 44px; height: 44px; font: 600 20px system-ui, sans-serif; background: #222a32;
  color: #e6e9ec; border: 1px solid #3c4650; border-radius: 4px; cursor: pointer; padding: 0; }
.rs-tool.wide { font-size: 13px; padding: 0 12px; }
.rs-tool:hover { border-color: #66727e; }

.rs-captions { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 12px 8px; align-items: center; }
.rs-cap-title { font-size: 11px; text-transform: uppercase; color: #ffd34d; letter-spacing: .06em; font-weight: 700; }
.rs-cap { background: #262110; border: 1px solid #5c4e1c; color: #e8d9a6; padding: 3px 9px;
  border-radius: 12px; font-size: 13px; font-weight: 600; }
.rs-cap.newest { background: #3b3112; border-color: #ffd34d; color: #fff1c2; }
.rs-cap.lost { background: #3a1414; border-color: #ff5a5a; color: #ffd6d6; font-weight: 700; }
.rs-cap.lost.newest { animation: rs-lost 1.2s ease-in-out 3; }
@keyframes rs-lost { 50% { background: #6a1c1c; } }
.flag { fill: #4ade80; stroke: #0b3d1f; stroke-width: 1; }
.capflag line { stroke: #4ade80; stroke-width: 2; }
.capflag path { fill: #4ade80; stroke: #0b3d1f; stroke-width: 1; }
.capflag.unconf path { fill: #35e0ff; }
.capflag .hit { fill: transparent; }
.capline { stroke: #4ade80; stroke-width: 1; stroke-dasharray: 2 4; opacity: .55; }
.mk-capture .flag { fill: #4ade80; stroke: #0b3d1f; stroke-width: 1; }
.mk-capture .pole { stroke: #d6f5e0; stroke-width: 1.5; }
.rs-opt.forward .t::before { content: '⚑ '; color: #4ade80; }
.rs-opt .c { font-size: 11px; color: #8fe3ae; }

.rs-tl-frame { position: relative; flex: 1; min-height: 0; border-top: 1px solid #2b333b; }
.rs-tl-scroll { position: absolute; inset: 0; overflow-y: auto; overflow-x: hidden; touch-action: pan-y;
  user-select: none; -webkit-user-select: none; overscroll-behavior: contain; cursor: grab; }
.rs-axis { position: sticky; top: 0; z-index: 2; height: 40px; }
.rs-axis svg, .rs-rows svg { display: block; }
.rs-empty { position: absolute; left: 16px; right: 16px; top: 60px; text-align: center; color: #b5c0cc;
  font-size: 16px; line-height: 1.5; }
.rs-legend { display: flex; flex-wrap: wrap; gap: 2px 14px; padding: 6px 12px; border-top: 1px solid #2b333b;
  font-size: 12px; color: #9aa7b6; }
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
.mk .hit, .end .hit { fill: transparent; }
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

/* Spawn panel */
.rs-spawn h2 { padding: 12px 12px 8px; }
.rs-opts { flex: 1; min-height: 0; overflow-y: auto; padding: 2px 10px 8px; display: flex; flex-direction: column;
  gap: 8px; overscroll-behavior: contain; }
.rs-opt { display: flex; align-items: center; gap: 10px; min-height: 66px; padding: 6px 10px 6px 6px;
  text-align: left; background: #1b2229; color: #e6e9ec; border: 2px solid #2f3842; border-radius: 6px;
  cursor: pointer; font: inherit; flex-shrink: 0; width: 100%; }
.rs-opt:hover { border-color: #56626e; }
.rs-opt.sel { border-color: #ffd34d; background: #2a2611; }
.rs-opt:focus { outline: none; }
.rs-opt:focus-visible { outline: 2px solid #35e0ff; outline-offset: 2px; }
.rs-opt-icon { flex: 0 0 84px; display: flex; justify-content: center; align-items: center; }
.rs-opt-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rs-opt .t { font-size: 15px; font-weight: 700; }
.rs-opt .d { font-size: 12px; color: #9aa7b6; }
.rs-opt .u { font-size: 11px; color: #35e0ff; text-transform: uppercase; letter-spacing: .05em; font-weight: 700; }
.rs-opt.resume .t { color: #8ff0ad; }
.rs-opt.appear { animation: rs-appear .7s ease-out both; }
@keyframes rs-appear { 0% { opacity: 0; transform: translateX(18px); border-color: #5ee38a; } 100% { opacity: 1; transform: none; } }
.rs-opt.leaving { animation: rs-leave .6s ease-in both; pointer-events: none; }
@keyframes rs-leave { 0% { opacity: 1; border-color: #ff4d5e; } 100% { opacity: 0; transform: translateX(-18px); } }
.rs-o-icon .g-o { filter: drop-shadow(0 0 4px #5ee38a); }
.thumb { border-radius: 3px; display: block; background: #1a2119; }
.th-bg { fill: #2c3829; }
.th-wall { fill: #707a86; }
.th-water { fill: #2f6390; }
.th-pt { fill: #c8d0d8; opacity: .55; }
.th-pt.on { fill: #ffd34d; opacity: 1; }
.th-ring { fill: none; stroke: #ffd34d; }
.rs-none { color: #8a96a3; padding: 10px; }
.rs-deploy-bar { padding: 10px 12px 12px; border-top: 1px solid #2b333b; display: flex; flex-direction: column; gap: 6px; }
.rs-deploy { min-height: 52px; font: 700 17px system-ui, sans-serif; background: #ffd34d; color: #1a1406;
  border: 0; border-radius: 6px; cursor: pointer; padding: 0 12px; }
.rs-deploy:hover:not(:disabled) { background: #ffe07a; }
.rs-deploy:disabled { background: #3a3f45; color: #8a96a3; cursor: default; }
.rs-keys { font-size: 11px; color: #6f7b88; text-align: center; }

@media (max-width: 760px) {
  .aoo-respawn { padding: 8px 16px 12px; gap: 8px; }
  .rs-head { gap: 2px 16px; }
  .rs-head h1 { font-size: 18px; }
  .rs-head dl { gap: 2px 14px; }
  .rs-head dt { font-size: 10px; }
  .rs-head dd { font-size: 14px; }
  .rs-main { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(160px, 1fr) auto; gap: 8px; }
  .rs-spawn { max-height: 40vh; }
  .rs-spawn h2 { padding: 8px 12px 6px; }
  .rs-hint, .rs-keys { display: none; }
  .rs-opt { min-height: 56px; }
  .rs-opt-icon { flex-basis: 64px; }
  .rs-opt-icon .thumb { width: 64px; height: 44px; }
  .rs-deploy-bar { padding: 8px 10px 10px; }
  .rs-legend { gap: 0 10px; font-size: 11px; padding: 4px 10px; }
}

/* (06-b) Revealed map panel ([D29]). Wide maps sit above the spawn list; tall maps (a vertical
   strip, forward = up) get their own column, sized from the height by map-panel.ts. */
.rs-main.with-map > .rs-tl { grid-area: tl; }
.rs-main.with-map > .rs-map { grid-area: map; }
.rs-main.with-map > .rs-spawn { grid-area: spawn; }
.rs-main.with-map.map-wide { grid-template-columns: minmax(0, 1fr) 360px;
  grid-template-rows: auto minmax(0, 1fr); grid-template-areas: "tl map" "tl spawn"; }
.rs-main.with-map.map-tall { grid-template-columns: minmax(0, 1fr) auto 320px;
  grid-template-rows: minmax(0, 1fr); grid-template-areas: "tl map spawn"; }
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

@media (max-width: 760px) {
  /* Wide map on a phone: the map shares the timeline's area (toggle buttons swap them). */
  .rs-main.with-map.map-wide { grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(160px, 1fr) auto; grid-template-areas: "tl" "spawn"; }
  .rs-main.with-map.map-wide > .rs-map { grid-area: tl; }
  .rs-main.with-map.map-wide:not(.phone-map) > .rs-map,
  .rs-main.with-map.map-wide.phone-map > .rs-tl { display: none; }
  .rs-main.with-map.map-wide .rs-view-toggle { display: inline-block; }
  .rs-main.with-map.map-wide .rs-map-body { flex: 1 1 auto; max-height: none; aspect-ratio: auto !important; }
  .rs-main.with-map.map-wide .rs-map-bar { height: 52px; align-items: center; }
  .rs-main.with-map.map-tall { grid-template-columns: auto minmax(0, 1fr);
    grid-template-rows: minmax(130px, 1fr) auto; grid-template-areas: "tl tl" "map spawn"; }
  .rs-main.with-map .rs-spawn { max-height: 36vh; }
  /* The map shows where each spawn is, so the option thumbnails go (more room for text). */
  .rs-main.with-map .rs-opt-icon { display: none; }
  .rs-main.with-map .rs-opt { padding-left: 10px; }
  .rs-map-bar { padding: 6px 10px 4px; height: 28px; }
  .rs-map-legend { display: none; }
}
`;
