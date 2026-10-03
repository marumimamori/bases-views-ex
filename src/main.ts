import { Plugin } from 'obsidian';
import { HOVER_LINK_SOURCE_ID } from './constants.ts';
import { KanbanView, type LegacyData, isRecord, isColumnOrders, isColumnColors } from './kanbanView.ts';
import { BoardSettingsTab } from './settings/settingsTab.ts';
import { LiveBoards, type LiveBoard } from './settings/liveBoards.ts';
import { LibraryPreferences } from './settings/libraryPreferences.ts';

export const KANBAN_VIEW_TYPE = 'kanban-view';

/**
 * Reads column order and color data previously stored in plugin.data.json
 * (via Obsidian's Plugin.saveData API) and normalises it into LegacyData.
 *
 * Column state is now persisted per-base using BasesViewConfig.set/get, so
 * plugin.data.json keeps only the board library and retained legacy data. This is the bridge that
 * lets existing users keep their configuration when upgrading.
 *
 * Two historical shapes are handled:
 *   - Current:  { columnOrders: { [propertyId]: string[] }, columnColors: { [propertyId]: { [value]: color } } }
 *   - Pre-v0.1: { [propertyId]: string[] }  (columnOrders only, no color support)
 */
export function parseLegacyData(data: unknown): LegacyData | null {
	if (!isRecord(data)) return null;

	// Current on-disk format: { columnOrders: {...}, columnColors: {...} }
	if ('columnOrders' in data && isColumnOrders(data.columnOrders)) {
		return {
			columnOrders: data.columnOrders,
			columnColors: isColumnColors(data.columnColors) ? data.columnColors : {},
		};
	}

	// Pre-migration format: { 'note.status': ['To Do', ...], ... }
	const legacyColumns = Object.fromEntries(
		Object.entries(data).filter(([key, value]) => key !== 'boardLibrary' || !isRecord(value)),
	);
	if (isColumnOrders(legacyColumns)) {
		return {
			columnOrders: legacyColumns,
			columnColors: {},
		};
	}

	return null;
}

export default class KanbanBasesViewPlugin extends Plugin {
	private boardSettings: BoardSettingsTab | null = null;
	private liveBoards: LiveBoards | null = null;
	async onload() {
		// Read any data previously saved to plugin.data.json and pass it to each
		// view instance so it can lazily migrate state into the base config on
		// first render. Once migrated, plugin.data.json is no longer consulted.
		const raw: unknown = await this.loadData();
		const legacyData = parseLegacyData(raw);
		this.liveBoards = new LiveBoards(
			(target) => this.boardSettings?.onLiveBoardChanged(target),
			() => this.app.workspace.getLeavesOfType('bases').map((leaf) => leaf.view),
		);
		const library = new LibraryPreferences(raw, (data) => this.saveData(data));
		this.boardSettings = new BoardSettingsTab(this.app, this, this.liveBoards, library);
		this.addSettingTab(this.boardSettings);
		this.registerEvent(this.app.vault.on('modify', (file) => this.boardSettings?.onVaultChanged(file, 'modify')));
		this.registerEvent(this.app.vault.on('create', (file) => this.boardSettings?.onVaultChanged(file, 'create')));
		this.registerEvent(this.app.vault.on('delete', (file) => this.boardSettings?.onVaultChanged(file, 'delete')));
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => this.boardSettings?.onVaultChanged(file, 'rename', oldPath)),
		);

		this.registerHoverLinkSource(HOVER_LINK_SOURCE_ID, {
			display: 'Kanban',
			defaultMod: true,
		});

		this.registerBasesView(KANBAN_VIEW_TYPE, {
			name: 'Kanban',
			icon: 'columns',
			factory: (controller, scrollEl) => {
				let board: LiveBoard | null = null;
				const view = new KanbanView(controller, scrollEl, legacyData, () => {
					if (board) this.liveBoards?.notify(board);
				});
				board = { controller, getConfig: () => view.config ?? null, refresh: () => view.onDataUpdated() };
				const remove = this.liveBoards?.add(board);
				if (remove) view.register(remove);
				return view;
			},
			options: KanbanView.getViewOptions,
		});
	}

	onunload() {
		this.boardSettings?.hide();
		this.boardSettings = null;
		this.liveBoards = null;
	}
}
