import { type BasesViewConfig } from 'obsidian';
import SpotlightRuntime, { type EditorView, type EditorSettings } from '../spotlight/runtime.js';
import { HOVER_LINK_SOURCE_ID } from '../constants.ts';
import { KanbanView } from '../kanbanView.ts';
import { parseLegacyData, KANBAN_VIEW_TYPE } from '../main.ts';
import { BoardSettingsTab } from '../settings/settingsTab.ts';
import { LiveBoards, type LiveBoard } from '../settings/liveBoards.ts';
import { LibraryPreferences } from '../settings/libraryPreferences.ts';
import { SuitePreferences, migratedPreferences } from './preferences.ts';
import { SuiteSettingsTab } from './settingsTab.ts';

export default class BasesViewsEXPlugin extends SpotlightRuntime {
	preferences!: SuitePreferences;
	private suiteTab: SuiteSettingsTab | null = null;
	private live: LiveBoards | null = null;
	private tracked = new WeakMap<EditorView, LiveBoard>();
	async onload(): Promise<void> {
		const raw: unknown = await this.loadData();
		this.preferences = new SuitePreferences(await migratedPreferences(this.app, raw), (data) => this.saveData(data));
		this.live = new LiveBoards(
			(target) => this.suiteTab?.onLiveBoardChanged(target),
			() => this.app.workspace.getLeavesOfType('bases').map((leaf) => leaf.view),
		);
		await super.onload();
		const library = new LibraryPreferences(this.preferences.kanban, (data) => this.preferences.saveKanban(data));
		const kanbanSettings = new BoardSettingsTab(this.app, this, this.live, library, true);
		this.suiteTab = new SuiteSettingsTab(this.app, this, kanbanSettings, this.live);
		this.addSettingTab(this.suiteTab);
		this.registerEvent(this.app.vault.on('modify', (file) => this.suiteTab?.onVaultChanged(file, 'modify')));
		this.registerEvent(this.app.vault.on('create', (file) => this.suiteTab?.onVaultChanged(file, 'create')));
		this.registerEvent(this.app.vault.on('delete', (file) => this.suiteTab?.onVaultChanged(file, 'delete')));
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => this.suiteTab?.onVaultChanged(file, 'rename', oldPath)),
		);
		this.registerHoverLinkSource(HOVER_LINK_SOURCE_ID, { display: 'Kanban EX', defaultMod: true });
		const legacy = parseLegacyData(this.preferences.kanban);
		this.registerBasesView(KANBAN_VIEW_TYPE, {
			name: 'Kanban EX',
			icon: 'columns',
			options: KanbanView.getViewOptions,
			factory: (controller, scrollEl) => {
				let board: LiveBoard | null = null;
				const view = new KanbanView(controller, scrollEl, legacy, () => {
					if (board) this.live?.notify(board);
				});
				board = { controller, getConfig: () => view.config ?? null, refresh: () => view.onDataUpdated() };
				const remove = this.live?.add(board);
				if (remove) view.register(remove);
				return view;
			},
		});
		await this.preferences.persist();
	}
	async loadSettings(): Promise<void> {
		this.settings = { ...structuredClone(SpotlightRuntime.DEFAULT_SETTINGS), ...this.preferences.spotlight };
		this.settings.propertyHeights ||= {};
		this.settings.propertyOrder ||= [];
		const value: unknown = this.settings.animationDuration;
		const duration = Number(value);
		this.settings.animationDuration =
			value !== null && value !== '' && Number.isFinite(duration)
				? Math.max(0, Math.min(2000, Math.round(duration)))
				: 140;
	}
	persistEditorSettings(data: EditorSettings): Promise<void> {
		return this.preferences.saveSpotlight(data);
	}
	onViewConfigChanged(view: EditorView): void {
		let board = this.tracked.get(view);
		if (!board) {
			board = {
				controller: view.controller,
				getConfig: (): BasesViewConfig | null => view.config ?? null,
				refresh: () => view.onDataUpdated(),
			};
			this.tracked.set(view, board);
			const remove = this.live?.add(board);
			if (remove) view.register(remove);
		}
		this.live?.notify(board);
	}
	onunload(): void {
		this.suiteTab?.hide();
		this.suiteTab = null;
		this.live = null;
	}
}
