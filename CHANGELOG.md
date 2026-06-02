# Changelog

All notable changes to Recomp are documented here.

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
