# Bases Views EX

One Obsidian plugin with **Kanban EX**, **Spotlight EX** and **Cards EX** layouts for Bases. Version **0.1.1** combines Kanban's status-list edition 0.10.14 with Spotlight EX 0.1.12 and retains their existing saved view identifiers.

## Install with BRAT

1. Install and enable **Obsidian42 – BRAT** in Community plugins.
2. [Install Bases Views EX with BRAT](obsidian://brat?plugin=marumimamori%2Fbases-views-ex), or run **BRAT: Add a beta plugin for testing** and enter `marumimamori/bases-views-ex`.
3. Disable **Kanban Bases View** and the separate **Spotlight EX** plugin, then enable **Bases Views EX**. They register the same saved view types and must not run together.

[BRAT documentation](https://tfthacker.com/BRAT) explains installation and updates. Releases contain the three individual BRAT assets: `main.js`, `manifest.json` and `styles.css`.

This plugin was **vibecoded with AI assistance** and is still a beta. Be careful: keep a vault backup and try it in a test vault before relying on it for important notes.

### Manual install

Download [the latest release](https://github.com/marumimamori/bases-views-ex/releases), extract `bases-views-ex` into `<Vault>/.obsidian/plugins/`, and enable **Bases Views EX**. Keep its `data.json` when updating. Requires Obsidian **1.10.2+** and the core **Bases** plugin.

## Start with a Base

Open a `.base` file. Use its view menu → **Add view** → **Layout** to choose Kanban EX, Spotlight EX or Cards EX. **Properties**, **Filter** and **Sort** remain in the Base toolbar. Open **Settings → Bases Views EX** for the matching layout tab, a shared **Setup** guide and **Thanks & license**.

Each layout's tab has a vault-wide Base search, removable saved Base tabs and view tabs. Select a view to manage its own layout options. These synchronize with the Base menu and respect an open Base's pending native saves. Selections restore after switching tabs or reopening settings. All settings use the Kanban/Autotag backdrop, hover highlight and theme accent.

### Kanban EX

- Drag cards between columns; use swimlanes, card title/image properties, column colors and ordering, and new-card folders.
- Group by a combined list such as `Business, Backlog`. Custom column values match individual list items, while moves retain category labels.
- Choose **Only custom columns**, **Custom + other columns** or **Only other columns**. Saved custom rows appear muted when unused; their configuration remains editable and ready to reuse.
- Choose which recognized statuses a card move replaces. Names, colors, values, order and all section controls synchronize with the selected view.
- Uncategorized is a permanent draggable settings row with an editable heading/color, visibility and **No snap / Always first / Always last**. Its position remains saved across mode changes.

[Full Kanban guide](STATUS-LISTS.md).

### Spotlight EX

- Preview notes, images and PDFs, using Previous/Next or arrow keys.
- Edit typed properties, multi-value chips and native property types with suggestions and live synchronization.
- Resize and reorder properties; resize the sidebar; use fullscreen and optional preview/hyperlink properties.
- Edit attachment properties in Markdown companion notes without changing the attachment.

### Cards EX

- An editable, grouped gallery with card size, image property, Cover/Contain and aspect ratio options.
- The same property editors, chips and suggestions as Spotlight, plus validated JSON editing for objects and nested arrays.
- Virtualized rows, lazy images, pinned active editors, per-file save queues, and draft preservation during filtering and metadata updates.

Spotlight and Cards retain **shared editing preferences**, with individual reset arrows, attachment-sidecar settings and animation duration. Each Base view has its own preview/gallery options. Changing a shared preference in either tab affects both layouts. [Detailed Spotlight and Cards guide](docs/Spotlight-guide.md) describes the retained editing gestures; use the new plugin's tabs in place of the former General tab.

## Existing settings

On its first load, Bases Views EX copies the Kanban board library/legacy column preferences and Spotlight's editor preferences from their installed plugin data. It also detects manually named plugin folders through their manifest ID. Source folders and their data are retained. Existing `.base` view types and configurations remain compatible and are not rewritten during migration.

Later loads use the merged plugin's own data, so changing an old plugin cannot replace the merged settings. Each layout's library is independent, while a single serialized writer preserves all settings namespaces. The former source plugins remain available for rollback but must stay disabled while this plugin runs.

The saved view types remain `kanban-view`, `bases-spotlight-view-expanded` and `spotlight-ex-cards`. Standalone `.base` files and embedded `.base` files are supported by the library; inline Base code blocks can still use the views but do not appear in the library.

## Thanks and licenses

Thanks to **I. Welch Canavan** for [Kanban Bases View](https://github.com/xiwcx/obsidian-bases-kanban), and **Brendan Early / mymindstorm** for [Obsidian Bases Spotlight View](https://github.com/mymindstorm/obsidian-bases-spotlight-view). Spotlight EX, Cards EX and this merged edition are maintained by [marumimamori](https://marumimamori.me/). Thanks also to the SortableJS contributors and TfTHacker for BRAT.

Both original MIT copyright and full permission notices are retained in [LICENSE](LICENSE), their separate files under `licenses/`, the bundle and the combined **Thanks & license** tab. SortableJS's MIT notice is in [THIRD-PARTY-NOTICES](THIRD-PARTY-NOTICES). See [NOTICE](NOTICE) for the derivative basis. No endorsement by the original authors is implied. The plugin has no telemetry.

## Development

```sh
npm ci
npm run format
npm run lint
npm test
npm run build
npm run verify-release
```

Build output is in `dist/`. The modular Kanban implementation remains under `src/`; `src/suite/` owns combined registration, settings, migration and saving. `src/spotlight/runtime.js` retains Spotlight/Cards' existing editor and gallery implementations. `npm run build` combines both source stylesheets into the distributable stylesheet.

Run `node tests/serve.mjs` for the Spotlight and Cards browser regression fixtures, which use synthetic metadata and do not modify vault files. The Cards suite includes a 10,000-entry gallery check. Native property widgets are an optional Obsidian internal API and can require adjustments after Obsidian updates.
