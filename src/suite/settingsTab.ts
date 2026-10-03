import { Notice, PluginSettingTab, type App } from 'obsidian';
import { BoardSettingsTab } from '../settings/settingsTab.ts';
import { LibraryPreferences } from '../settings/libraryPreferences.ts';
import { type BoardTarget } from '../settings/boardConfig.ts';
import { type LiveBoards } from '../settings/liveBoards.ts';
import { ViewPanel } from './viewPanel.ts';
import { renderEditorSettings } from './editorSettings.ts';
import { renderSetup, renderThanks } from './guide.ts';
import { type BasesViewsEXPlugin } from './types.ts';

const TABS = {
	kanban: 'Kanban EX',
	spotlight: 'Spotlight EX',
	cards: 'Cards EX',
	setup: 'Setup',
	thanks: 'Thanks & license',
};
type Tab = keyof typeof TABS;
function isTab(value: string): value is Tab {
	return value in TABS;
}
export class SuiteSettingsTab extends PluginSettingTab {
	private active: Tab = 'kanban';
	private spotlight: ViewPanel;
	private cards: ViewPanel;
	constructor(
		app: App,
		private suite: BasesViewsEXPlugin,
		private kanban: BoardSettingsTab,
		live: LiveBoards,
	) {
		super(app, suite);
		const selected = suite.preferences.data.activeTab;
		if (typeof selected === 'string' && isTab(selected)) this.active = selected;
		this.spotlight = new ViewPanel(
			app,
			live,
			'spotlight',
			new LibraryPreferences(suite.preferences.library('spotlight'), (data) =>
				suite.preferences.saveLibrary('spotlight', data),
			),
		);
		this.cards = new ViewPanel(
			app,
			live,
			'cards',
			new LibraryPreferences(suite.preferences.library('cards'), (data) => suite.preferences.saveLibrary('cards', data)),
		);
	}
	display(): void {
		this.hide();
		this.containerEl.empty();
		this.containerEl.addClass('obk-settings', 'bvx-settings');
		const tabs = this.containerEl.createDiv({ cls: 'obk-settings-tabs', attr: { 'aria-label': 'View settings' } });
		Object.entries(TABS).forEach(([id, name]) => {
			const button = tabs.createEl('button', {
				text: name,
				cls: this.active === id ? 'is-active' : '',
				attr: { type: 'button', 'aria-pressed': String(this.active === id) },
			});
			button.addEventListener('click', () => {
				if (!isTab(id) || this.active === id) return;
				this.active = id;
				this.suite.preferences.data.activeTab = id;
				void this.suite.preferences.persist().catch(() => new Notice('Could not save the selected settings tab.'));
				this.display();
			});
		});
		const body = this.containerEl.createDiv({ cls: 'bvx-settings-body' });
		if (this.active === 'kanban') {
			this.kanban.containerEl = body;
			this.kanban.display();
		} else if (this.active === 'spotlight' || this.active === 'cards') {
			(this.active === 'spotlight' ? this.spotlight : this.cards).display(body);
			renderEditorSettings(body, this.suite, this.active);
		} else if (this.active === 'setup') renderSetup(body);
		else renderThanks(body);
	}
	hide(): void {
		this.kanban.hide();
		this.spotlight.hide();
		this.cards.hide();
	}
	onVaultChanged(file: { path: string }, kind: 'modify' | 'create' | 'delete' | 'rename', oldPath?: string): void {
		this.kanban.onVaultChanged(file, kind, oldPath);
		this.spotlight.onVaultChanged(file, kind, oldPath);
		this.cards.onVaultChanged(file, kind, oldPath);
	}
	onLiveBoardChanged(target: BoardTarget): void {
		this.kanban.onLiveBoardChanged(target);
		this.spotlight.onLiveBoardChanged(target);
		this.cards.onLiveBoardChanged(target);
	}
}
