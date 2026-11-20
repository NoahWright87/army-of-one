# Automatic terrain transitions

Owner direction: [A128] in DECISIONS.md. Paint a terrain type and let the editor/game choose
its connecting edges and corners, in the spirit of Warcraft II's terrain brush.

The old renderer put three translucent bands of a neighbour's **flat colour** over a texture.
That washes out detail and leaves square texture boundaries. It is removed. The editor also
previously showed only flat colours; it now previews the same textured transitions as play.

## How it works

- Each cell reads its eight neighbours. Only different, higher presentation layers contribute
  a fringe: water, sand, dirt, grass, road, concrete, rock, wall, then bridge, bottom to top.
  This order resolves three/four-material junctions consistently, independently of brush order.
- Four edge bits and four corner bits reduce to 47 reusable fringe shapes. A diagonal adds an
  outer corner only if an adjoining straight edge does not already cover it. Paired edges also
  round the inner corner. Isolated tiles, bays, holes, narrow strips and T-junctions use the
  same rule; no hand-selected edge tiles are saved in the map.
- Masks cut the **actual neighbouring texture** into the fringe. Natural edges have a narrow,
  irregular antialiased silhouette; road/concrete/bridge/wall edges stay straight; rock has a
  dark rim. Land on water uses a small bank/foam accent. This is not a broad crossfade.
- A shared runtime atlas contains the textured mask variants, including four source-image
  phases so a repeating texture continues across cell boundaries. Border pixels are extruded
  into its gutters to prevent filtering seams. Geometry is calculated once per shape/style.
- Phaser retains repeating strips for full interiors and adds quads only at transitions.
  The Canvas editor uses that same atlas/rules and caches its ground preview while hovering
  or placing objects. Painting, erasing, undo and redo invalidate the preview automatically.
- Terrain-derived water/solid collision rectangles are no longer drawn as opaque square
  overlays over the finished terrain. Their simulation geometry remains intact. Explicit
  authored walls/water rectangles still render normally.

Main files: `src/render/terrain/transition-rules.ts`, `transition-atlas.ts`,
`src/render/phaser/terrain-ground.ts`, and `src/ui/editor/editor-view.ts`.
The general approach is terrain autotiling; see the [Tiled terrain documentation](https://doc.mapeditor.org/en/stable/manual/terrain/).

## Art requirements

We need transition **shapes**, but do not need a bespoke painted image for every terrain pair.
The current reusable masks work with all existing base textures. For a richer illustrated
look, the natural/shore/rock masks and bank/rim treatment can be replaced with painted edge
art while retaining neighbour selection and the map format. Cliffs with visible height,
overhangs, waves and decorative shoreline objects are not provided by this flat surface pass.

Painted edge fringes are decorative. They do not expand traversable terrain, create new
connections or change tile collision, projectile blocking, map generation, or recorded games.
The editor's striped outer ring still marks block matching, and its grid still marks saved cells.
Small world-map/minimap diagrams retain their existing terrain colours for readability.

## Review and verification

- `?scene=gallery&transitions=1`: inside/outside corners, islands, bays, a beach, road bend,
  bridge and mixed surfaces through the real renderer.
- `?scene=editor`: paint Grass/Dirt/Sand/Water/etc.; neighbours update immediately. Undo/redo
  and Play this block keep the same painted terrain types.
- `?scene=gallery&terrain=1`: all nine material swatches with transitions at their boundaries.

Screenshots: [transition cases](review/transitions.png), [painting preview](review/editor-transitions.png).

Unit tests cover all 256 neighbour inputs, the 47 canonical shapes, diagonal and concave
corners, material priority, shoreline/built/rock styles, periodic edge continuity and suppression
of duplicate terrain geometry. Browser QA also exercises actual painting, undo/redo and the
editor-to-game playtest flow. The saved block still contains only its original ground letters.
