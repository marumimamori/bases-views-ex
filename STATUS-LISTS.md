# Kanban EX — status-list guide

Based on [Kanban Bases View 0.10.6](https://github.com/xiwcx/obsidian-bases-kanban) by I. Welch Canavan, under the original MIT license. The full license is included in LICENSE, the bundled main.js, and Settings → Thanks & license.

## Install

Install the `bases-views-ex` folder from the release ZIP into your vault's `.obsidian/plugins/` folder. Disable the separate Kanban Bases View and Spotlight EX plugins before enabling Bases Views EX. Keep their installed folders and data for first-load migration and rollback. Existing Kanban views retain their saved view type and configuration.

Copying files installs the plugin but does not enable it. Open **Settings → Community plugins → Installed plugins** and turn on **Bases Views EX**. Reopen the vault after switching plugins. Its **Kanban EX** layout appears in Bases after the merged plugin is enabled.

This beta is a separate merged plugin. Updates are available from [Bases Views EX](https://github.com/marumimamori/bases-views-ex), including through BRAT.

## Configure your board without a formula

1. Open Settings → Bases Views EX → Kanban EX.
2. In **Board library**, search for your Base, folder or Kanban view anywhere in the vault. Choose a suggested Base and select **Add**. You can also enter `[[Gallery.base]]`, `[[Gallery.base#Kanban]]` or `[[Gallery#Kanban]]`. When two Bases have the same filename, include the folder path. Select a saved Base tab and one of its Kanban view tabs underneath. The refresh icon rescans manually; creation, renaming and deletion also refresh discovery automatically.
3. Set **Group by** to the original note property, for example `currentStatus`. This is the same **Group by** option used in the view menu. **Card title property** changes titles only and does not set the status property.
4. In **Kanban Columns**, focus the new-value field to show suggestions from your own note properties, then select a suggestion or enter a new value and select **Add column**. Already configured values are excluded from the add suggestions. There are no fixed status names.
5. Choose **Custom Columns in use**: **Only custom columns**, **Custom + other columns**, or **Only other columns**. Existing Status from list settings migrate to the equivalent mode.
6. Set each column's display name and color. The swatch shows the selected theme color; click it to choose a custom color. Drag the handles to adjust the order.
7. Uncategorized is a permanent row among your custom columns. Its Value cannot be edited or deleted, but its name and color can be changed. Use **Show Uncategorized** in that row, above the board, or in the view menu to show or hide the fallback. Hiding it preserves notes, card order, color and position; its settings row remains available. Drag its handle to reposition it. Choose **No snap**, **Always first**, or **Always last** under **Position**. The same choice is available as **Uncategorized position** in the view menu and controls both the settings and board order, including after new values are added.

Each Base/view keeps its own property, values, names, colors, order and status move behavior. Add more Bases to the library and select different view tabs to manage other boards. The × on a Base tab removes it from the library while keeping its file and view settings. Library tabs and the last selected view are saved in plugin data; board configuration stays in each `.base` file. Removing or renaming the selected view clears its old editor; renaming its Base file follows the new path.

Settings are organized into **Board library** and **Kanban Columns**. Hover over, focus or select a section's info button for help. The editor updates controls in place to preserve focus and draft input while settings save.

Card Moves is above Group by and Custom Columns in use at the top of Kanban Columns. Show Uncategorized and Position are inside the permanent Uncategorized row. Every change there also updates the section’s sync icon. Shared controls have a ↻ sync icon beside their label. It rotates while updating and smoothly turns green when the change has synced to the view; red indicates a failed update. Changes made in the view also update the matching settings controls and icons. Motion is reduced when your system requests it. Settings, Base and view tabs share Autotag’s shaded backdrop, hover and focus highlight, shadow and gentle lift. Selected tabs use the same default theme accent as Autotag. When switching boards, the old editor stays visible but inactive until the new one is ready. The chosen Base and view remain selected when you return from Thanks & license or reopen settings; their tabs identify the board without a redundant title or raw link underneath.

Settings save to the selected view in its `.base` file. When a Base is open, settings update its native configuration so a pending save includes your edits. Other views, filters and formulas are preserved. Labels, status move behavior, column order and colors synchronize in both directions between the board and the settings. Board settings operate on standalone `.base` files, including `.base` files embedded in Markdown; inline `base` code blocks do not appear in the selector.

The view menu's **Custom column values (comma-separated or JSON)** is another way to edit these same column values. It accepts `Backlog, Active, Done` or `["Backlog", "Active", "Done"]`; use your own labels. Use JSON when a label itself contains a comma. Adding individual column rows in plugin settings creates this configuration for you. **Card Moves** in the view and plugin settings controls the same option for that view.

**Value** is the exact item to match and write in the note property. **Name** is the displayed column heading. Changing Name leaves note labels untouched. Changing or removing Value changes what the board matches; it does not rename or remove that value in your notes. Colors support the theme palette and custom colors.

## Column modes

- **Only custom columns**: show the configured custom columns; unmatched notes go to Uncategorized.
- **Custom + other columns**: show the custom columns and columns for unmatched whole property values. A custom match wins, so a card appears once. For example, `[Content, Backlog]` goes to Backlog, while `[Content, Business]` goes to Content, Business. An unmatched scalar such as `customTextProperty` gets its own column.
- **Only other columns**: use ordinary whole-property grouping and ignore the saved custom list. Custom rows appear greyed out in settings and remain editable for future use. Uncategorized stays active. Switching back restores the custom list and its saved position.

Uncategorized represents an empty property in combined and ordinary modes. Custom and combined modes share saved custom names, colors and order; ordinary mode keeps its separate existing column preferences. Each view has its own mode.

In combined mode, moving into a custom column preserves category labels. Moving out to the column matching the remaining labels removes the custom status. A move to a different automatic column stops if it would discard those labels. Moves between automatic columns use the destination’s full property value, retaining list items containing commas. New cards in custom columns preserve template labels; automatic columns set their whole property value.

## Moving cards

With these columns configured, moving a note from Backlog to Active changes:

```yaml
currentStatus:
  - Content
  - Project
  - Backlog
```

to:

```yaml
currentStatus:
  - Content
  - Project
  - Active
```

The default **Replace the source status only** changes the displayed source status and keeps every other label, including other configured labels. If a note has multiple matching values, the first column in the board order wins. If preserving another status would prevent the card from reaching its destination, the move stops with an explanation and leaves the note intact. You can adjust the column priority, edit the extra status, or choose **Replace all status labels** to maintain one recognized status per note.

In custom-only mode, notes without a matching value appear in Uncategorized. Moving a card there clears the source status while retaining other labels, subject to the same multiple-status check. Existing YAML lists remain lists. Adding a status to a missing property creates a list; adding a status to a scalar category converts it to a list. Scalar-only status properties keep their scalar type. Matches are case-sensitive whole items, not substrings of comma-separated text.

Moves between swimlanes update only the changed property. Formula properties remain read-only when a move would write to them. New cards retain labels supplied by a template and receive the selected status. Empty configured columns and Uncategorized remain available as drop targets when shown. Uncategorized has no delete action.

## Attribution

Thanks to I. Welch Canavan for the original Kanban board, drag-and-drop behavior, swimlanes and colors. The original copyright and MIT permission notice are retained without alteration. See NOTICE for the upstream source and local additions.

SortableJS powers dragging and also uses the MIT license. Its complete notice is retained in THIRD-PARTY-NOTICES and the bundled main.js.
