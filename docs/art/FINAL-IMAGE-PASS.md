# Final image delivery

The owner requested the rest of the image backlog in one pass: interactive props, capture and
deployment annotations, muzzle flash/status overlays, title art, UI panels and campaign illustration.
This is an art/presentation change. Audio is outside this request.

## Delivered

`src/content/finished-art.ts` lists **40 new PNGs** registered through the existing manifest:

| Family | Location | Contents |
|---|---|---|
| Painted world objects/effect | `assets/finished/` | Idle/armed mines, scorch, objective intact/destroyed, gate open/closed, lever off/on, bridge down/up/destroyed, capture pad and muzzle flash (14) |
| Native status art | `assets/ui/symbols/` | Flagpole, friendly/enemy cloth flags, insertion arrow, lead-in/player rings, static overlay, interruption, X/O and compatibility reticle (11 PNGs plus editable SVG sources) |
| Presentation | `assets/ui/` | `title-background.png`, `panel-frame.png`, `campaign-table.png` (3) |
| Compatibility | `assets/finished/legacy/` | Five old soldier keys, traffic truck/wreck, three old terrain keys and two legacy effect stills, prepared from already delivered art (12) |

All requested image families are integrated, including the idle/armed mine pair delivered on the
owner's requested retry. The mine variants share their normalization transform and exact alpha
mask; only the central red status indicator changes while blinking. The existing world size,
arming/blink behavior and collision/trigger rules are preserved.

The closing audit reports **120 image keys, all final, no missing files and zero image placeholders**.
The 15 placeholder audio clips remain separate from this image request.

Thirty-seven superseded placeholder PNGs were removed by the normal generator. No unused background
images are uploaded to Phaser: the three `ui_*` assets are DOM-only and skipped in PreloadScene.

## Integration and behavior

- Gate art follows the long axis of the existing rectangle. Lever handles and lamps distinguish
  the two existing control states. Object/lever footprints and HP/interaction rules are unchanged.
- Bridge deck material repeats at its original world scale. The deck fades out completely while
  raising; one raised-frame image spans the bridge and reveals the water gap. A destroyed bridge
  uses one broken-plank composition across its rectangle. Both horizontal and vertical layouts
  preserve the original rectangle. No pathfinding, walkability, timings or sim states change.
- Objective roofs/rubble follow the existing target radius. Capture pads are neutral concrete;
  the existing flag heights, progress rings and team colors still convey ownership. Pole/flags
  are readable status annotations, retaining their existing billboard convention.
- Small symbols are native SVG art, matching the project's role/HUD vector system. Their PNG
  exports feed existing Phaser asset keys. The real aiming cone and timeline X/O remain native
  Graphics/SVG; their controls/hit areas are unchanged.
- Title text and all buttons remain DOM content over the illustrated tabletop. The panel image
  supplies a quiet, reusable nine-slice metal/felt frame for flow/results, respawn and campaign
  panels. The campaign illustration surrounds the **actual generated map**, which keeps its
  readable schematic terrain, ownership overlays, labels and interactions. No fake geography.

## Generate and reproduce

Selected painted masters were generated with the **built-in imagegen tool**, copied into the
ignored `art-source/finished/` directory, and packaged into the committed runtime files. Exact
selected prompts: [finished-prompts.json](finished-prompts.json) and [mine-prompts.json](mine-prompts.json).
The first scorch attempt looked
like a cloud; the delivered replacement is a flat, dark soot decal.

```
node --import tsx tools/package-finished-art.mjs art-source/finished
node --import tsx tools/export-status-art.mjs
npm run gen:placeholders
```

`export-status-art.mjs` uses a local Chrome and a development Playwright module (default:
`art-source/browser/node_modules/playwright/index.mjs`; an alternative module URL can be supplied
as the first argument; `ART_CHROME` selects Chrome). The browser rasterizes native SVG source data;
there is no image-generation API call or runtime dependency. `status-art.ts` is the editable source.
The normal packager only crops/resizes images and makes the deck tile periodic/opaque. Legacy
effect stills are fixed-frame crops of the delivered animations, not new effects.

## Review and validation

- `?scene=gallery&finished=1`: all mine/structure states, flags and overlays.
- `/`: title and panel art; `?scene=campaign`: campaign table and side panel.
- `?screen=respawn&fixture=rescue`: illustrated timeline/map panels and live native SVG controls.
- The existing fast `breach-solo` autoplay reaches the illustrated results overlay.

729 tests pass, plus ESLint/Prettier, purity lint and production build. New checks cover long-axis
layouts, bridge fade/gap behavior, actual PNG openings, identical friendly/enemy flag silhouettes
and steady mine silhouettes with a visible red armed indicator.
Desktop/mobile browser review checks gallery camera rotations, gate/bridge states, flag/ring/static
textures, DOM-only texture exclusion, all panel/backdrop URLs, 390px menu fit, campaign and respawn
views, results and shutdown. The final mine check confirms identical position/display size on both
blink frames in desktop/mobile Chrome, with no runtime/resource errors. Production is reviewed
under the GitHub Pages subpath.

The first full suite ran beside browser/build work and hit the existing 20-second world-generation
test timeout. With browser work closed and one test worker, all 729 tests pass; no timeout or test
expectation was changed.
