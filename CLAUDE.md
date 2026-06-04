# Recomp — project context

This file is a handoff summary so an assistant (e.g. Claude Code) can continue
work with full context. It describes what Recomp is, its architecture, key
decisions, and open tasks.

## What it is

Recomp is a free, open-source After Effects script (ExtendScript / `.jsx`).
It is a trimmed, focused alternative to "True Comp Duplicator". Two jobs:

1. Duplicate selected comps + all nested sub-comps, keeping dependencies intact.
2. Batch-change resolution and/or frame rate across a whole comp tree.

Distribution: GitHub repo, install by dragging `Recomp.jsx` into the
`ScriptUI Panels` folder. Cross-platform (Windows + macOS). License: MIT.

## Repo layout

The repo root is flat (this folder IS the repo root):

```
Recomp.jsx            # the whole tool (single file, ScriptUI panel)
README.md             # English, install + usage + limitations
LICENSE               # MIT, (c) 2026 Denis Petriaev
CHANGELOG.md
CLAUDE.md             # this file
.gitignore
docs/
  logo.svg            # = logo-dark.svg (default)
  logo-dark.svg/.png        # logo on dark bg
  logo-transparent.svg/.png # logo on transparent bg
  README.txt          # notes about the logo files
  screenshot.png      # real panel screenshot, shown in README
```

Identity: author **Denis Petriaev**, GitHub **Petryaev-Art**, repo
`https://github.com/Petryaev-Art/Recomp`. Links: Behance
`behance.net/petryaev_art`, Instagram `@petryaev_art`, LinkedIn `in/dpetryaev`.

## Remaining before / after publishing

- `docs/screenshot.png`: DONE (real panel screenshot, embedded in README).
- Author/name/repo placeholders: DONE (filled in jsx header, LICENSE, README).

## Script architecture (`Recomp.jsx`)

Single IIFE `recomp(thisObj)`. ES3 style only — no `let`/`const`/arrow
functions/`for...of`. Target support is **After Effects 2021 (v18) through the
latest release**; only long-stable APIs are used, so it runs on older builds too.
`run()` does a soft `app.version` check (`MIN_AE_VERSION = 18`) and warns (but lets
the user continue) on anything older. No code comments by request (only the top
license header).

Key state (module-level):
- `compMap` — array of `{ source: CompItem, dest: CompItem }`. The spine of
  everything: maps each original comp to its duplicate.
- `fullRenameCounter` — counter used by "Full rename" mode for nested comps.
- `ui` — references to the built ScriptUI controls.

Core functions:
- `duplicateComp(comp, depth)` — recursive. Duplicates a comp, renames it via
  `makeName`, pushes to `compMap`, then walks its layers; for each layer whose
  source is a `CompItem` it either reuses an existing duplicate (dedup via
  `findDest`, matched by `comp.id`) or recurses. Uses `layer.replaceSource`.
- `findDest(sourceComp)` — dedup lookup by `id`.
- `makeName(originalName, isTopLevel)` — three modes:
  - "Suffix": append text.
  - "Increment number": regex `/\d+(?!.*\d)/` bumps the LAST digit group,
    preserving zero-padding via `padNum`. Falls back to appended text if no digit.
  - "Full rename": top comp gets the field text; nested get `"<base> N"`.
- Expression fixing: `updateAllExpressions` → `processProperty` (recurses
  property groups) → `fixExpressionString`. Only rewrites `comp("Name")` and
  `comp('Name')` literals from each source name to its dest name. Skips props
  that are not `canSetExpression`, empty, or disabled. `reCompRef` is a quick
  guard regex so we only touch expressions that contain a comp() ref.
- `fitAdjustmentLayers(comp, w, h)` — for solid-based adjustment layers only
  (`adjustmentLayer === true` and `source.mainSource instanceof SolidSource`).
  Creates ONE fresh comp-sized solid (via a temp `addSolid` then `remove`, the
  FootageItem persists), `replaceSource`s each adjustment layer to it, and
  centers anchor/position with scale 100%. `setStatic` only writes a transform
  value if it has no keyframes and no enabled expression (don't break animation).
- `recenterContent(comp, dx, dy)` — the "Keep content centered" option. After a
  resize, captures `dx/dy = (new - old) / 2` and offsets every UNPARENTED
  `AVLayer`'s position by it (children follow their parent automatically; cameras
  and lights are skipped since they are not `AVLayer`). Helpers `offsetPosition`
  (combined or separated X/Y dims, static value or all keyframes) and
  `offsetScalar` (separated-dimension followers). Layers with a position
  expression are skipped. MUST run BEFORE `fitAdjustmentLayers` so the refit can
  re-center static adjustment layers to the exact new center.
- `collectTree(comp, list, seen)` — used when duplication is OFF: gathers the
  selected comps + nested (dedup by id) so resolution/fps can be applied in place.
- `run()` — orchestrates. Order of operations is deliberate and must stay:
  1. duplicate (if enabled)
  2. fix expressions (if enabled)
  3. resolution → recenter content → adjustment refit (if enabled)
  4. frame rate (if enabled)
  Everything wrapped in one `app.beginUndoGroup` / `endUndoGroup`.

UI: two ScriptUI panels — "Duplicate compositions" and "Resolution / Frame rate".
Each action gated by its own checkbox; disabling duplication switches to
in-place editing of the selected comps + nested. Button label is "Apply".
Works both as a dockable panel (in `ScriptUI Panels`) and via Run Script File.

## Key design decisions (don't regress these)

- Only `comp("Name")` expression refs are remapped. `thisComp.layer("X")` and
  `comp("Y").layer("X")` keep working automatically because duplicate() preserves
  layer names. We intentionally do NOT remap layers by index (the original TCD
  did) — simpler and less likely to corrupt indices.
- Footage/solids are NOT duplicated; copies share originals (expected behavior).
  Adjustment refit creates NEW solids so originals are never mutated.
- Resolution change resizes the canvas only; layers are NOT scaled by design.
- Name-based comp lookup means if two comps share an identical name, first match
  wins (documented limitation).
- FPS change keeps duration in seconds; keyframe frame-numbers may shift.

## Logo notes

Vector recreation of a user mockup: two framed squares with corner ticks, dashed
diagonal links, a blue plus, wordmark "RE" (blue #2F7BF6) + "COMP" (grey).
The wordmark in the committed SVG/PNG uses a system sans-serif, NOT the exact
font from the mockup. For pixel-perfect output, swap the text for the intended
font (looks geometric — Poppins/Montserrat/Century Gothic family) and convert to
outlines before exporting. PNGs rendered with cairosvg at 2x. Note: cairosvg
mishandles multi-color `<tspan>` in one `<text>` (resets x), so the wordmark is
split into two separate `<text>` elements with explicit x coordinates.

## Recent hardening (v1.1.0)

A static review pass was done (syntax checked, linted for ES6 constructs which
must NOT appear). Fixes applied:
- `processProperty` / `setStatic`: reading `.expression` / `.expressionEnabled`
  is now wrapped in try/catch (some properties throw on access).
- `fitAdjustmentLayers`: `addSolid` wrapped in try; returns count actually
  changed; each layer's refit isolated in try so one failure doesn't abort.
- Suffix mode: empty suffix falls back to " copy" (avoids name == original,
  which would also make expression remap a no-op for that comp).
Still ES3-only, single file, no comments except the header. node --check passes.

## Open tasks / ideas (not yet done)

- Real `docs/screenshot.png` of the panel.
- Fill in author/name placeholders.
- Optional: Windows one-click installer via Inno Setup (`.iss`) as an *addition*,
  not a replacement for drag-install. Must locate AE folder, request admin, copy
  to ScriptUI Panels. Unsigned exe will trip SmartScreen/AV — note in README.
- Optional features discussed but not built: "grab resolution/FPS from active
  comp" button; multiple copies (N at once with auto-increment); progress bar
  for heavy projects; handle non-solid adjustment layers.
- Possible: a `.jsxbin` build, and/or packaging as a ZXP for ZXP Installer.
- Launch promo text for X / r/AfterEffects / Telegram (offered, not written yet).

## Testing notes

No automated tests possible (needs AE host). Manual test matrix worth running:
- Single comp; comp with nested comps; sub-comp reused in multiple places (dedup).
- Expressions with comp("...") cross-refs (double and single quotes).
- Each naming mode, including names with/without trailing digits and zero-padding.
- Resolution change with and without adjustment-layer refit; 2D and 3D adj layers;
  animated transforms on adj layers (must not be overwritten).
- FPS change incl. fractional (23.976, 29.97).
- Duplication OFF + resolution/FPS ON (in-place path).
- Verify single undo reverts everything.
