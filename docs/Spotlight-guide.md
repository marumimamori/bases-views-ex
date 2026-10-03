# Spotlight EX by [Maru](https://marumimamori.me/)

Browse notes, images, and PDFs in an Obsidian Base and edit their properties in a Spotlight sidebar or directly inside a Cards EX gallery.

**Current version:** `0.1.12`

**Original creator:** This is an expanded fork of [Obsidian Bases Spotlight View](https://github.com/mymindstorm/obsidian-bases-spotlight-view) by **Brendan Early / [mymindstorm](https://github.com/mymindstorm)**. The original MIT license and copyright notice are preserved.

---

## Features

- **Spotlight browsing:** a large preview beside a property sidebar, with Previous/Next navigation and arrow keys.
- **Cards EX:** a separate editable gallery layout with card width, image property, image fit, aspect ratio, and Base grouping.
- **Large galleries:** virtualized rows and lazy images keep offscreen cards out of the DOM; only the active property creates an editor.
- **Notes, images, and PDFs:** preview files directly from the current Base results.
- **Typed property editing:** Text, List, Tags, Number, Checkbox, Date, and Date & time editors.
- **Additional native pickers:** File, Folder, and Property editors when supported by your installed Obsidian version.
- **Real multi-value properties:** each List/Tags value has its own chip and remove button, while frontmatter stays a YAML array.
- **Direct value editing:** click an empty dash, a property name, or free space to add; rename inside an existing chip; click away to save and close. Property and card height changes animate quickly.
- **Continuous entry:** press Enter or choose a suggestion to save a value and keep the input ready for the next one.
- **Suggestions:** choose values from the whole vault or the current Base results, including file suggestions for wikilinks.
- **Live synchronization:** property edits and type changes update the sidebar while preserving unfinished input.
- **Property type icons:** shown by default; click an editable icon to change its shared Obsidian property type.
- **Flexible layout:** fields grow with content, the sidebar can be resized, and properties can be reordered or given a saved minimum height.
- **Attachment companion notes:** use `filename.ext.md` sidecars to store properties for images and PDFs.
- **Individual setting resets:** restore any setting's default using the arrow beside it.
- **Original creator attribution:** included in the README, bundled notices, source, and Credits & License tab.

## Install With BRAT

1. Install **Obsidian42 - BRAT** from Obsidian's Community Plugins.
2. Open the command palette.
3. Run **BRAT: Add a beta plugin for testing**.
4. Enter `https://github.com/marumimamori/spotlight-ex`.
5. Choose the latest version, let BRAT install it, and enable **Spotlight EX** under **Settings > Community plugins**.

[BRAT documentation](https://tfthacker.com/BRAT) explains installation and automatic updates.

> [!NOTE]
> This fork was **vibecoded** with AI assistance.

### Manual Installation

1. Download the install ZIP from the [latest release](https://github.com/marumimamori/spotlight-ex/releases/latest), or download `main.js`, `manifest.json`, and `styles.css` individually.
2. Create `<Vault>/.obsidian/plugins/bases-spotlight-view-expanded/`.
3. Extract the ZIP into that folder, or copy the three plugin files into it.
4. Reload Obsidian and enable **Spotlight EX** under **Settings > Community plugins**.

The ZIP also includes the license, attribution, and documentation.

## Requirements

- **Obsidian 1.10.0 or newer**, with the core **Bases** plugin enabled.
- A `.base` file containing the files you want to browse.
- Optional: **Obsidian42 - BRAT** for installation and updates.

The original Spotlight plugin is not required. This fork has its own plugin ID and view type, so both can be installed together.

## Information

### Configure A Base

1. Enable **Bases** under **Settings > Core plugins** and **Spotlight EX** under **Settings > Community plugins**.
2. Open an existing `.base` file, or run **Bases: Create new base** from the command palette.
3. Click the view name at the top left and choose **Add view**. Give it a name and select **Spotlight EX** as its layout.
4. To change an existing view, click the arrow beside its name in that menu, or right-click the view name. Choose **Spotlight EX** under **Layout**.
5. Use **Properties** in the Base toolbar to choose the fields shown in the sidebar. Use **Filter** to limit the files and **Sort** to set their navigation order.
6. Open the view settings again to choose **Spotlight Content Property** and **Hyperlink Property**, if needed. See [Base View Options](#base-view-options) below.

These instructions are also available under **Settings > Spotlight EX > Setup**. Obsidian's [Views guide](https://help.obsidian.md/bases/views) explains the Base toolbar and view settings.

Use **Previous**, **Next**, or the arrow keys to move through results. Arrow keys inside property editors remain available for editing. If the Base is empty, check its filters.

The center pane previews the selected file. The sidebar shows the properties configured for that Base view.

### Cards EX

1. Open a Base's view menu, add a view, or open an existing view's settings with its right arrow. Select **Cards EX** under **Layout**.
2. Use **Properties** to select and order the fields on each card. **Filter** and **Sort** continue to control the gallery; query-provided groups and group order are preserved.
3. In the view settings, configure **Card size**, **Image property**, **Image fit**, and **Image aspect ratio**. These use the same saved option names as the core Cards layout, so switching an existing Cards view can retain its cover configuration.
4. Click a displayed property value to open its editor. Text, List, Tags, Number, Checkbox, Date, Date & time, and available native picker types use the same editors as Spotlight EX. Click the card title or background to open the entry; editing controls keep you in the gallery.
5. Click a property's empty dash, name, or free space to start adding immediately. Click a List/Tags chip to rename inside that chip; its × removes it. Enter finishes a rename and focuses the separate adding field, or saves an addition and keeps that field ready for another value. Clicking away saves the current input and returns to compact values. Escape cancels unsubmitted input. Both layouts use these same gestures, without Add, Cancel, or Done buttons.

The image property accepts a local `[[image.jpg]]` link, an external HTTP(S) URL, or a hex color such as `#336699`. Cover crops to fill the image box; Contain shows the whole image. Aspect ratio sets the cover's proportions.

Objects and nested arrays open in a validated JSON editor, saved back through Obsidian as YAML. Use **Save object** or Ctrl/Cmd+Enter; invalid input stays available to correct. Formula and `file.*` fields remain read-only. Attachment edits use the same companion notes as Spotlight EX.

Only visible rows, nearby rows, and an active editor's row stay mounted. Images load lazily and decode asynchronously. A filter update keeps an edited card near its previous position under **Editing outside current results** until you finish. Saves are serialized per file across all open Spotlight EX and Cards EX views, while clean fields and covers update without replacing a different field's draft. Closing a view flushes its open list and text editors before cleanup; window blur and close events also initiate draft saves. Failed saves keep the input available to retry.

The gallery is a custom view built on Obsidian's public Bases API; it does not inherit the private core Cards renderer. The included fixture checks editing and scrolling with 10,000 synthetic image entries. Actual decoding and memory use also depend on image sizes and Obsidian's browser cache.

### Property Editing

| Property type | Editor |
| --- | --- |
| Text | Growing textarea; Enter saves, Shift+Enter adds a line break |
| List | Separate value chips, per-value removal, and suggestions |
| Tags | Separate tag chips and suggestions; an optional displayed `#` |
| Number | Numeric input, including decimals |
| Checkbox | Checkbox with an empty, true, or false state |
| Date | Date input |
| Date & time | Date and time input |
| File, Folder, Property | Native Obsidian picker when available |
| Complex YAML object or nested array | Validated JSON editor in Cards EX; read-only display in Spotlight EX |

Click an empty dash, the property name, or free space inside a List/Tags property to open its adding input immediately. Press Enter or select a suggestion to commit a new value and keep that input open for the next one. Click a chip's value to rename inside the chip; Enter or choosing a suggestion finishes the rename and focuses the separate “Add value…” field, and its × removes that item. The separate field is reserved for adding. Clicking away saves the current input and closes it without reopening adding. Escape discards only unsubmitted input. Clearing a renamed value removes it. A first click into an inactive pane activates it without taking focus from the selected editor.

Chip input widths, Spotlight property heights, and Cards EX card heights use the shared **Animation duration (ms)** setting under **Settings → Spotlight EX → General → Layout**. The default is 140 ms; choose 0 to disable animations, or a duration up to 2000 ms. The reset arrow restores 140 ms. Changes apply to both open views and respect your system's reduced-motion preference. Cards animate only mounted content, keeping the gallery virtualized.

Normal wikilinks such as `[[Sample]]` use their link labels. Click to rename the full stored link; Ctrl/Cmd+click follows it. Embed text such as `![[Sample]]` stays literal, matching Obsidian's Properties view. Stored strings are preserved.

### Property Types And Synchronization

Property type icons and labels are enabled by default. Changing an editable type through its icon updates the vault-wide Obsidian type. Changes made in Obsidian's Properties view also update Spotlight.

Tags, Aliases, and CSS classes keep their reserved native types. Changing a property's type does not silently convert incompatible existing values. Those values are shown for reference until you replace them. If a type changes while you are typing, unfinished input is retained under **Unfinished value from the previous type**.

Unfocused properties can sync while a different property has a draft. Saves are queued so rapid additions retain earlier values and concurrent metadata edits.

### Layout And Settings

Drag a property name to reorder it. Resize the sidebar using its divider, or resize a property using the handle beneath it. A saved property height acts as a minimum; additional content can still expand the field.

Empty-value dashes and checkboxes align beneath their type icons using the icons' measured size and position. Type icons have a darker box normally and a lighter hover state.

Open **Settings > Spotlight EX**. **General** controls editing preferences and defaults, **Setup** explains how to configure a Base, and **Credits & License** preserves the original attribution. Every General setting has a reset arrow; hover to see the default, then click to restore that setting.

Layout, visible properties, filters, sorting, and the preview options below are configured separately for each Base view using its toolbar.

| Setting | Default |
| --- | --- |
| Always show remove × buttons | On |
| Prevent duplicate list values | On |
| Suggestion source | Whole vault |
| Maximum suggestions | 12 |
| Display # for Tags | On |
| Show property type icons and labels | On |
| Create sidecars for attachments | On |
| Animation duration (ms) | 140 ms (0 disables) |
| Default sidebar width | 330 pixels |

### Base View Options

- **Spotlight Content Property:** choose a property containing a normal `[[wikilink]]` to the file you want in the preview. Leave it empty to preview the current Base entry.
- **Hyperlink Property:** choose a displayed property that opens the current Base entry when clicked.

---

## Examples

### Add Several List Values

For a List property named `related`, add `Architecture`, press Enter, and then add `Panorama`. Spotlight displays two removable chips and stores a real array:

```yaml
related:
  - Architecture
  - Panorama
```

### Use Wikilinks And Tags

Wikilinks remain strings inside their array. Tag values can be displayed with a `#` without rewriting the stored values just for display:

```yaml
related:
  - "[[Sample]]"
  - "![[Sample]]"
tags:
  - photography
  - architecture
```

The first `related` value appears as a link label that can be renamed or followed with Ctrl/Cmd+click. The second appears as the complete literal embed text.

### Edit Attachment Properties

An image called `Sample.jpg` can use `Sample.jpg.md` as its companion note. The image stays in the preview while property edits are stored in that Markdown sidecar. Automatic sidecar creation can be disabled in settings.

### Change A Property Type

Click a property's type icon and select **Date**. Spotlight switches to a date editor, and Obsidian sees the same shared type. If the property's previous value does not fit Date, it remains available for reference until you enter a replacement.

## Notice

- Standard editors, continuous entry, synchronization, formatting, and appearance changes are exercised in the included browser regression fixture with in-memory test metadata.
- Obsidian's native property widget registry is an internal API. Native type integration and optional File/Folder/Property pickers can need adjustments after Obsidian updates.
- The plugin was developed in English. Please report bugs with reproducible steps and your Obsidian version through [GitHub Issues](https://github.com/marumimamori/spotlight-ex/issues).

## Original Creator And Thanks

Thank you to **Brendan Early / [mymindstorm](https://github.com/mymindstorm)** for creating [Obsidian Bases Spotlight View](https://github.com/mymindstorm/obsidian-bases-spotlight-view) and releasing it under the MIT License.

The original plugin supplied the Spotlight layout, file previews, navigation, sidecar workflow, content property options, and property layout controls. This expanded fork builds on that work with typed editing, multi-value chips, continuous input, suggestions, live type/value synchronization, and additional settings.

The expanded fork is maintained by [Maru](https://marumimamori.me/). It is an independent derivative; no endorsement by the original creator is implied. See [NOTICE.md](NOTICE.md) and [UPSTREAM.md](UPSTREAM.md) for the attribution and upstream basis.

## Beta Notes

This plugin is still in beta. BRAT is the recommended distribution path while it is tested with real vaults before any wider Obsidian Community Plugin submission.

The plugin was renamed to **Spotlight EX** in version `0.1.8`. Its internal plugin ID and saved view type remain `bases-spotlight-view-expanded` for compatibility, so existing settings and `.base` views continue working. Keep the existing plugin folder when updating, including its `data.json`. New manual installs also use the folder named in [Manual Installation](#manual-installation). The current BRAT repository is `marumimamori/spotlight-ex`.

There is no telemetry in the plugin.

## License

Spotlight EX is free software licensed under **MIT**.

The original **Copyright (c) 2026 Brendan Early** notice and complete MIT permission notice are preserved in [LICENSE](LICENSE), included in release downloads, and displayed in **Credits & License**. Keep those notices when redistributing the plugin or a modified version.

## Development

The build uses Node.js and has no third-party build dependencies. The release workflow uses Node.js 24.

Build and check the plugin:

```bash
npm run build
npm run check
npm run verify-release
```

`src/main.js` contains the shared property editors, Spotlight view, settings, and registration. `src/cards-view.js` contains the virtualized gallery. The build combines both into `main.js` and prepares the manual-install files in `release/`.

Run the browser regression fixture:

```bash
node tests/serve.mjs
```

Open the printed local URL and choose **Run regression tests**. The fixture uses the real plugin code and stylesheet with an in-memory Obsidian adapter; it does not modify vault files.

Open `/cards` on the same local server for the Cards EX regression suite and a 10,000-image gallery preview.

For a future release, update the versions in `manifest.json` and `package.json`, add the version to `versions.json`, and update this README and [CHANGELOG.md](CHANGELOG.md). Build and verify the release, then push a matching tag such as `0.1.11` without a leading `v`. GitHub Actions publishes the BRAT files, license, attribution notice, and install ZIP.
