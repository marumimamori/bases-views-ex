import { Setting, type App } from 'obsidian';
import { type BoardChange, type BoardModel, type BoardTarget } from './boardConfig.ts';
import { BoardStore } from './boardStore.ts';
import { ColumnsPanel } from './columnsPanel.ts';
import { ValueSuggest } from './suggestions.ts';
import { sameBoard } from './boardReferences.ts';
import { settingsSection } from './sections.ts';
import { SyncIndicator } from './syncIndicator.ts';
import { COLUMN_MODE_OPTIONS, readColumnMode } from '../utils/columnMode.ts';

export class BoardEditor {
	private columns: ColumnsPanel | null = null;
	private propertySuggest: ValueSuggest | null = null;
	private property: HTMLInputElement | null = null;
	private hint: HTMLElement | null = null;
	private target: BoardTarget | null = null;
	private model: BoardModel | null = null;
	private setColumnMode: (mode: string) => void = () => {};
	private setMoveMode: (mode: string) => void = () => {};
	private indicators = new Map<string, SyncIndicator>();
	constructor(
		private app: App,
		private panel: HTMLElement,
		private store: BoardStore,
		private change: (change: BoardChange, target?: BoardTarget) => Promise<void>,
	) {}
	get isInteracting(): boolean {
		return this.columns?.dragging ?? false;
	}
	close(): void {
		this.indicators.forEach((indicator) => indicator.close());
		this.indicators = new Map();
		this.columns?.close();
		this.columns = null;
		this.propertySuggest?.destroy();
		this.propertySuggest = null;
		this.target = null;
		this.property = null;
		this.model = null;
	}
	render(target: BoardTarget, model: BoardModel, change?: BoardChange): void {
		if (!sameBoard(this.target, target)) this.create(target);
		const previous = this.model;
		if (previous) {
			let columnsChanged = false;
			for (const [key, before, after] of [
				['property', previous.property, model.property],
				['column-mode', previous.columnMode, model.columnMode],
				['move-mode', previous.moveMode, model.moveMode],
				['uncategorized', previous.showUncategorized, model.showUncategorized],
				[
					'columns',
					JSON.stringify([previous.columns, previous.uncategorized, previous.columnOrder, previous.uncategorizedPosition]),
					JSON.stringify([model.columns, model.uncategorized, model.columnOrder, model.uncategorizedPosition]),
				],
			] as const) {
				if (before !== after) {
					this.indicators.get(key)?.pulse();
				}
				columnsChanged ||= before !== after;
			}
			if (columnsChanged) this.indicators.get('columns')?.pulse();
		}
		this.model = model;
		if (this.property && this.property.ownerDocument.activeElement !== this.property)
			this.property.value = model.property.replace(/^note\./, '');
		this.propertySuggest?.update(this.store.propertyNames());
		this.setColumnMode(model.columnMode);
		this.setMoveMode(model.moveMode);
		if (this.hint)
			this.hint.hidden = !(
				model.enabled &&
				(!model.property.startsWith('note.') || (model.columnMode === 'custom' && model.columns.length === 0))
			);
		this.columns?.render(model, this.store.propertyValues(model.property), change);
	}
	private create(target: BoardTarget): void {
		this.close();
		this.target = target;
		const indicators = this.indicators;
		const changeForBoard = (change: BoardChange) => {
			const key =
				change.type === 'enabled'
					? 'column-mode'
					: ['property', 'column-mode', 'move-mode', 'uncategorized'].includes(change.type)
						? change.type
						: 'columns';
			const write = () => this.change(change, target);
			const run = () => indicators.get(key)?.run(write) ?? write();
			return key !== 'columns' ? (indicators.get('columns')?.run(run) ?? run()) : run();
		};
		this.panel.empty();
		this.hint = this.panel.createEl('p', {
			cls: 'obk-board-status',
			text: 'Finish setup: choose the note property below and add at least one column value.',
		});
		const columns = settingsSection(
			this.panel,
			'Kanban Columns',
			'Group by selects the same property as the view menu. Custom values match complete, case-sensitive items; the first matching column wins. Combined mode puts unmatched notes in columns for their whole property value. Name changes only the heading. Changing or removing custom values leaves note labels intact. The view’s Custom column values input accepts comma-separated text or a JSON array.',
		);
		const heading = columns.parentElement?.querySelector<HTMLElement>('.obk-section-heading');
		if (heading) indicators.set('columns', new SyncIndicator(heading, 'Kanban Columns'));
		this.sharedSetting(columns, 'Card Moves', 'move-mode')
			.setDesc('Choose which recognized status labels a move into a custom column replaces. Category labels are kept.')
			.addDropdown((dropdown) => {
				dropdown.selectEl.setAttribute('aria-label', 'Card Moves');
				dropdown.addOption('source', 'Replace the source status only').addOption('all', 'Replace all status labels');
				this.setMoveMode = (mode) => {
					void dropdown.setValue(mode);
				};
				dropdown.onChange((mode) => {
					void changeForBoard({ type: 'move-mode', mode: mode === 'all' ? 'all' : 'source' }).catch(() => {});
				});
			});
		this.sharedSetting(columns, 'Group by', 'property')
			.setDesc('Choose the note property used to group cards, including matching custom values.')
			.addText((text) => {
				text.setPlaceholder('Search note properties…');
				this.property = text.inputEl;
				this.property.setAttribute('aria-label', 'Group by');
				this.propertySuggest = new ValueSuggest(this.app, this.property, this.store.propertyNames());
				let submitted = '';
				const save = () => {
					const property = text.getValue().trim();
					const key = property.startsWith('note.') ? property : `note.${property}`;
					if (key === this.model?.property || key === submitted) return;
					submitted = key;
					void changeForBoard({ type: 'property', property }).catch(() => {
						submitted = '';
					});
				};
				this.propertySuggest.onSelect(save);
				this.property.addEventListener('change', save);
			});
		this.sharedSetting(columns, 'Custom Columns in use', 'column-mode')
			.setDesc('Choose custom columns, custom plus other property values, or other property values only.')
			.addDropdown((dropdown) => {
				dropdown.addOptions(COLUMN_MODE_OPTIONS);
				dropdown.selectEl.setAttribute('aria-label', 'Custom Columns in use');
				this.setColumnMode = (mode) => {
					void dropdown.setValue(mode);
				};
				dropdown.onChange((mode) => {
					void changeForBoard({ type: 'column-mode', mode: readColumnMode(mode) }).catch(() => {});
				});
			});
		columns.createEl('p', {
			cls: 'setting-item-description',
			text: 'Choose custom values from your notes or enter your own. Drag the handles to arrange columns.',
		});
		this.columns = new ColumnsPanel(this.app, columns.createDiv(), changeForBoard);
	}
	private sharedSetting(parent: HTMLElement, name: string, key: string): Setting {
		const setting = new Setting(parent).setName(name);
		const label = setting.nameEl ?? setting.settingEl.querySelector<HTMLElement>('span') ?? setting.settingEl;
		label.classList.add('obk-synced-label');
		this.indicators.set(key, new SyncIndicator(label, name));
		return setting;
	}
}
