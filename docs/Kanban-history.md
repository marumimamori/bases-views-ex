# Local changes

## 0.10.14 — 2026-10-03

- Matched the settings, Base and view tab bars to Autotag’s shaded backdrop and rounded border.
- Added brighter hover and keyboard-focus highlights, inset shading, stronger shadows and a gentle lift. Selected tabs retain the theme accent; Base tabs and their remove buttons highlight as one pill.
- Reduced-motion preferences disable tab transitions and movement.

## 0.10.13 — 2026-10-03

- Fixed description/dropdown overlap with constrained grid columns and wrapping at narrow widths.
- Moved Card Moves above Group by inside Kanban Columns and removed the separate section. Card Moves changes now animate the parent sync icon.
- Added a permanent draggable Uncategorized row with a read-only Value, editable name/color, synced visibility toggle and No snap / Always first / Always last position menu.
- Enforced fallback position in both settings and the view after new columns, native menu edits or drag attempts. Hidden fallback positions remain saved; the empty fallback cannot be deleted.
- Added coverage for endpoint pinning in all modes, both drag paths, hidden rows, permanent values, sync feedback, comma-containing labels and native color clearing.

## 0.10.12 — 2026-10-03

- Added three independent per-view column modes: only custom, custom plus unmatched property values, or only property values. Previous Status from list toggles migrate without changing grouping behavior.
- Consolidated the note-property selector into the single synced Group by control. Moved Group by, Custom Columns in use and Show Uncategorized into Kanban Columns; removed Status matching.
- Animated the parent Kanban Columns sync icon for all changes within that section, including visibility, property and mode changes made in either place.
- Removed the sync explanation and duplicate Obsidian tooltip; retained the native tooltip. Labeled the library selectors Bases: and Views:.
- Preserved automatic column colors and hidden positions across mode changes, and custom column edits within mixed orders. Combined-mode card moves and new cards retain list types and comma-containing labels.

## 0.10.11 — 2026-10-02

- Matched selected settings, Base and view tabs to Autotag's default theme accent and text colors.
- Preserved the selected Base and view when returning from Thanks & license or reopening settings. Recreated controls read the current configuration even when no board settings changed.
- Removed the redundant board title and raw Base/view link beneath the library; the selected tabs identify the board.
- Added regression coverage for repeated tab round trips, updates while viewing Thanks, and restored selection after settings reopen.

## 0.10.10 — 2026-10-02

- Renamed the settings section to Kanban Columns and matched the other controls to its section-card layout.
- Added sync icons beside shared properties, statuses, names, colors, move policy and visibility, with rotating update feedback and a smooth change to green after syncing. Failed writes show red and restore saved toggle values; reduced motion is respected.
- Added Show Uncategorized to the board, view menu and per-view plugin settings. Hiding the column keeps its notes, saved card order, colors and position, including when visible columns are reordered.
- Reused saved Base tab elements when switching, and kept the previous editor visible but inactive until the next board is ready, avoiding the blank flash. Stale reads cannot replace a newer selection.
- Brightened inactive tabs and used a soft gray highlight for selected Base, view and settings tabs.

## 0.10.9 — 2026-10-02

- Added vault-wide Base search with suggestions and Add, saved Base tabs with × removal buttons, and view tabs underneath. Removing a library tab keeps its file and view configuration.
- Persisted the library and last selected view while retaining legacy plugin data; unchanged Base discovery entries are cached.
- Kept settings controls and rows in place during saves to preserve focus, draft text and subsequent clicks.
- Queued column edits with their original board so rapid rename/color edits and board switches cannot target the wrong value or view.
- Added section headers and info popovers for the board library, status matching, card moves, columns, attribution and license.
- Added visible, keyboard-accessible value suggestions on focus and typing, excluding configured values from the add field.
- Aligned value, name, color and remove fields; made narrower panes stack fields cleanly.
- Synchronized palette selections with their visible swatches and custom picker; removed reorder arrows and retained drag-and-drop.

## 0.10.8 — 2026-10-02

- Updated open Bases through their native view configuration so delayed saves retain plugin settings changes, including hidden sibling Kanban views and Bases open on Table or Cards.
- Accepted pasted Base/view links with or without `.base`, and rejected ambiguous short filenames.
- Added a grouped board list, explicit open/refresh/clear actions, and independent settings for each Base/view.
- Refreshed selection and suggestions after view/file creation, removal and renaming, including containing folders.
- Allowed an already enabled but incomplete board to be repaired by choosing its note property and adding columns.
- Clarified comma-separated or JSON Status labels and the difference between card titles and the grouping property.
- Preserved the Uncategorized column's color while editing other columns.
- Added regression checks for delayed saves, independent boards and settings lifecycle changes.

## 0.10.7 — 2026-10-02

- Added status grouping that matches complete items inside a shared list property.
- Added a settings screen with searchable Base and Kanban view selection, including full Base/view references.
- Added configurable matching values, separate display names, theme and custom colors, row drag-and-drop, and accessible order buttons.
- Synchronized column colors, names and order between the selected board and settings.
- Preserved project/category labels, YAML list types, other Base views, filters and formulas.
- Added source-only and all-status replacement policies, with protection against conflicting or stale moves.
- Preserved template labels during card creation and avoided writes to an unchanged column property during swimlane-only moves.
- Kept formula properties read-only when a card move would write to them.
- Added a Thanks & license tab, retained the original MIT license and attribution, and included them in the bundled release.
- Made the test command work on Windows as well as other platforms.

Based on upstream 0.10.6, commit e5fbe3c42419f1503a4ae11e307d2e00782b528a. This is a local release.
