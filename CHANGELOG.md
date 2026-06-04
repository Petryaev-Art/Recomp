# Changelog

All notable changes to Recomp are documented here.

## [1.3.0]

### Added
- **Fit solids to new size** option (off by default) for resolution changes.
  Rebuilds plain (non-adjustment) solid layers at the new comp size with scale
  100% and centered — the same idea as the adjustment-layer refit, but for
  regular solids. Each solid keeps its original color, and identical colors share
  one new solid to avoid clutter. Null layers are left untouched.

### Fixed
- **Keep content centered** now also moves text and shape layers. They were being
  skipped because `TextLayer` / `ShapeLayer` do not satisfy `instanceof AVLayer`
  in some After Effects builds; recentering now processes every layer except
  cameras and lights.
- Resizing a composition that is used as a precomp now also offsets the precomp
  layer's anchor point in parent comps, so nested content stays centered instead
  of drifting.

## [1.2.0]

### Added
- **Keep content centered** option (on by default) for resolution changes. After
  resizing, all unparented layers are offset by half the size difference so the
  composition stays centered instead of sticking to the top-left corner. Handles
  static values, keyframed positions, and separated X/Y dimensions; layers with a
  position expression and camera/light layers are left untouched.

## [1.1.1]

### Changed
- Declared and documented supported range: After Effects 2021 (v18) through the
  latest release. Added a soft `app.version` check that warns (but lets you
  continue) when run on an older build.
- Removed unused `String.prototype.startsWith` / `endsWith` polyfills (dead code).

## [1.1.0]

### Changed
- Hardened error handling: reading and writing expressions, setting transform
  values, and creating the refit solid are all guarded so a single problem
  layer/property no longer aborts the whole run.
- Suffix mode now falls back to " copy" when the suffix field is empty, so a
  copy never ends up with a name identical to its original.
- Adjustment-layer refit now reports the number actually changed and skips
  cleanly if the temporary solid cannot be created.

## [1.0.0] - Initial public release

### Added
- Recursive duplication of selected comps and all nested sub-comps.
- Deduplication of shared sub-comps (duplicated once, referenced everywhere).
- Expression remapping for `comp("Name")` references between copies.
- Naming modes: Suffix, Increment number, Full rename.
- Optional batch resolution change (width/height in px).
- Optional fitting of solid-based adjustment layers to the new size.
- Optional batch frame-rate change (fractional rates supported).
- Independent checkboxes for each action; works with duplication off (in-place edits).
- Single undo group for the whole operation.
