# Changelog

## 0.1.12 — 2026-10-02

- Confirm a chip rename with Enter or a suggestion, then automatically focus the separate adding field in both views. Clicking away still saves and closes without reopening input.
- Keep cancellation focus on the value pill instead of highlighting the whole List/Tags group.
- Add Animation duration (ms) under General → Layout, with a 140 ms default, a reset arrow, and a 0–2000 ms range. Zero disables size animations; reduced motion remains respected.
- Apply the duration to chip width and property/card height changes in open views without reloading the plugin.
- Prevent suggestion clicks from opening duplicate inputs; cover continuation, failures, focus changes, numeric values, duration saving, disabling, and resetting in browser regressions.

## 0.1.11 — 2026-10-02

- Rename List and Tags values inside their existing chips in both layouts. Reserve the separate input for adding new values; Enter or a suggestion finishes an inline rename.
- Preserve the edited chip, cursor selection, and draft during updates and resizing; retain click-away saving, Escape cancellation, numeric types, and full stored wikilinks.
- Animate chip input widths, Spotlight property heights, and Cards EX card heights with quick 140 ms transitions that respect reduced motion.
- Carry property height transitions through sidebar refreshes, observe natural content to avoid resize feedback loops, and clean up animations with unmounted cards and closed views.
- Add regression coverage for inline editing, adding-to-renaming transitions, rename suggestions, and growth/shrink animations.

## 0.1.10 — 2026-10-02

- Match Cards EX's property type boxes, borders, shadows, and lighter hover state to Spotlight EX; center empty dashes and checkbox displays using the actual icon geometry.
- Replace Add Value buttons with direct clicks on an empty dash, property name, or free space inside a List/Tags property in both layouts.
- Click a chip to rename its stored value; keep the separate × for removal, preserve item order and numeric types, and retain concurrent metadata changes.
- Remove input Add/Cancel buttons and Cards EX Done/Cancel Draft controls. Enter saves and keeps input ready; clicking away saves the current value and closes input; Escape cancels unsubmitted input.
- Flush list and text drafts when a view closes and initiate saves on window blur/close events. Preserve failed input for retry.
- Update shared setup instructions and add regression coverage for renaming, direct activation, blur saves, close saves, and Cards EX alignment.

## 0.1.9 — 2026-10-02

- Add Cards EX as a separate editable Bases gallery with native-style card sizing, cover properties, image fit, aspect ratio, filtering, sorting, and grouping.
- Extract a shared property editor for Spotlight EX and Cards EX, with per-file write queues across all open views.
- Use compact card values until a field is activated; preserve its control and draft during refreshes, scrolling, and filter changes.
- Virtualize variable-height card rows, load mounted images lazily, and release offscreen card elements and editors.
- Add validated structured JSON editing for objects and nested arrays in Cards EX; formula and file properties remain read-only.
- Add Cards EX setup instructions and a browser suite including 10,000-image scrolling, sidecars, native pickers, draft recovery, and concurrent writes.

## 0.1.8 — 2026-10-02

- Rename the plugin, layout, repository, and current documentation to Spotlight EX.
- Add a Setup tab in plugin settings with Base creation, layout selection, properties, filters, sorting, and preview configuration instructions.
- Expand the repository's Base setup guide and explain per-view options versus global settings.
- Keep the persisted plugin ID and view type so existing settings and Base views continue working.
- Preserve Brendan Early / mymindstorm's original creator attribution and MIT license.

## 0.1.7 — 2026-10-02

- Restore the darker rounded box, border, and shadow around property type icons, with a lighter hover state using theme button colors.
- Keep the adaptive icon/value alignment and native icon-button behavior.

## 0.1.6 — 2026-10-02

- Align empty dashes and checkboxes using the icon's actual rendered dimensions and position instead of a fixed width.
- Recalculate alignment when theme sizing, fonts, or layout change, preserving active controls.
- Use Obsidian's native clickable-icon class so type icons are styled as icon buttons.
- Add coverage for 30px, 38px, and 52px icon widths, theme offsets, and changing appearance without a reload.

## 0.1.5 — 2026-10-02

- Center empty-value dashes and checkboxes beneath their property type icons using a shared column width.
- Align checkbox labels with property names while retaining the compact layout when type icons are hidden.

## 0.1.4 — 2026-10-02

- Add a reset arrow beside every General setting, with its default shown in the tooltip.
- Reset individual settings without changing other saved preferences; support mouse and keyboard activation.
- Apply saved or reset sidebar widths to open Spotlight views immediately.

## 0.1.3 — 2026-10-02

- Enable property-type display by default and use Obsidian's native icons beside property names.
- Click an editable type icon to change the vault-wide type in Obsidian; reserved Tags, Aliases, and CSS classes retain their native types.
- Read the live assigned widget/type, rather than a nonexistent registry field or a startup-only type snapshot.
- Listen for native type changes, metadata updates, and external `types.json` updates; refresh other fields while preserving active drafts.
- Replace editors immediately when types change, preserve unfinished values in a disclosure, and reject queued writes that no longer match the type.
- Support every standard property editor and use native File, Folder, and Property widgets when available.
- Preserve decimal numbers, date/time seconds, timezone-aware display, empty values, and indeterminate checkboxes.
- Show incompatible existing values without rewriting them during a type change.

## 0.1.2 — 2026-10-02

- Match native Properties formatting for embed values such as `![[adssa]]`: keep the complete literal text instead of turning it into a normal link label.
- Preserve normal wikilink labels, aliases, and per-value removal; keep stored YAML strings unchanged.
- Add browser regression checks for embed display and add/remove behavior.

## 0.1.1 — 2026-10-01

- Keep List/Tags entry open and focused after Enter, Add, or choosing a suggestion.
- Preserve drafts and focused controls during metadata saves and Base updates.
- Activate an inactive Spotlight pane on the first click without stealing editor focus.
- Queue metadata writes and update arrays from current frontmatter so rapid additions do not overwrite earlier values.
- Grow property fields with content and Add Value controls; wrap long labels and auto-size textareas.
- Treat saved manual field heights as minimums instead of clipping additional content.
- Build the installable plugin directly from its source and add browser regression coverage.

## 0.1.0 — 2026-10-01

Initial expanded fork release.

- New plugin/view ID so it can coexist with the upstream plugin.
- Type-aware editors for Text, List, Tags, Number, Checkbox, Date and Date & time properties.
- Real YAML arrays for List/Tags values instead of JSON/text flattening.
- Per-value chips with one-click `×` removal.
- Add-value editor with vault/Base suggestions and wikilink-aware file suggestions.
- Clickable wikilinks inside list chips.
- Attachment/PDF sidecar metadata support.
- Dual-pane preview, Previous/Next and arrow-key navigation.
- Property reorder and height resizing.
- General and Credits & License settings sub-tabs.
- Preserved upstream MIT license and explicit attribution to Brendan Early / mymindstorm.
