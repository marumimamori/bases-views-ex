import { type App, Notice, Setting } from 'obsidian';
import { type BoardTarget } from '../settings/boardConfig.ts';
import { BoardPicker } from '../settings/boardPicker.ts';
import { sameBoard } from '../settings/boardReferences.ts';
import { LibraryPreferences } from '../settings/libraryPreferences.ts';
import { type LiveBoards } from '../settings/liveBoards.ts';
import { settingsSection } from '../settings/sections.ts';
import { ValueSuggest } from '../settings/suggestions.ts';
import { SyncIndicator } from '../settings/syncIndicator.ts';
import { ViewOptionsStore, VIEW_FIELDS, type EditorLayout } from './viewOptions.ts';

/** A saved library and selection for each layout, using the same picker as Kanban. */
export class ViewPanel {
	private store: ViewOptionsStore;
	private selected: BoardTarget | null;
	private picker: BoardPicker | null = null;
	private editor: HTMLElement | null = null;
	private error: HTMLElement | null = null;
	private visible = false;
	private request = 0;
	private timer: number | null = null;
	private controls = new Map<string, HTMLInputElement | HTMLSelectElement>();
	private indicators = new Map<string, SyncIndicator>();
	private suggestions: ValueSuggest[] = [];
	private model: Record<string, unknown> = {};
	private editorTarget: BoardTarget | null = null;
	constructor(
		private app: App,
		live: LiveBoards,
		readonly layout: EditorLayout,
		private library: LibraryPreferences,
	) {
		this.store = new ViewOptionsStore(app, live, layout);
		this.selected = library.selected;
	}
	display(parent: HTMLElement): void {
		this.hide();
		this.visible = true;
		const name = this.layout === 'spotlight' ? 'Spotlight EX' : 'Cards EX';
		const section = settingsSection(
			parent,
			'View library',
			`Each ${name} view has its own layout options. Add Bases and select a view to edit the same options available in its Base menu.`,
		);
		this.editor = parent.createDiv();
		this.error = parent.createDiv({ cls: 'obk-settings-error', attr: { role: 'status', 'aria-live': 'polite' } });
		this.picker = new BoardPicker(
			this.app,
			section,
			(target) => {
				this.selected = target;
				this.persist();
				if (target) void this.select(target);
				else this.clearEditor();
			},
			() => {
				this.store.inventory.invalidateCatalog();
				void this.refresh();
			},
			this.library,
			() => this.persist(),
			name,
		);
		this.picker.setSelected(this.selected);
		this.editor.createEl('p', { cls: 'setting-item-description', text: 'Choose a view above to edit its options.' });
		void this.refresh();
	}
	hide(): void {
		this.visible = false;
		this.request++;
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.timer = null;
		this.picker?.close();
		this.picker = null;
		this.clearEditor();
		this.editor = null;
		this.error = null;
	}
	private clearEditor(): void {
		this.indicators.forEach((indicator) => indicator.close());
		this.indicators.clear();
		this.suggestions.forEach((suggestion) => suggestion.destroy());
		this.suggestions = [];
		this.controls.clear();
		this.editor?.empty();
		this.editorTarget = null;
		this.model = {};
	}
	onVaultChanged(file: { path: string }, kind: string, oldPath?: string): void {
		this.store.inventory.invalidateCatalog();
		if (kind === 'rename' && oldPath) {
			this.library.rename(oldPath, file.path);
			this.selected = this.library.selected;
			this.persist();
		}
		if (kind === 'delete') {
			this.library.paths = this.library.paths.filter((path) => path !== file.path && !path.startsWith(`${file.path}/`));
			if (this.selected && (this.selected.path === file.path || this.selected.path.startsWith(`${file.path}/`)))
				this.selected = null;
			this.persist();
		}
		if (kind !== 'modify' || file.path.endsWith('.base')) this.schedule();
	}
	onLiveBoardChanged(target: BoardTarget): void {
		if (sameBoard(this.selected, target)) this.schedule();
	}
	private schedule(): void {
		if (!this.visible) return;
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => {
			this.timer = null;
			void this.refresh();
		}, 150);
	}
	private async refresh(): Promise<void> {
		const request = ++this.request;
		try {
			const catalog = await this.store.inventory.catalog();
			if (!this.visible || request !== this.request) return;
			this.picker?.update(catalog);
			if (!this.selected) {
				this.clearEditor();
				return;
			}
			if (!catalog.some((base) => base.path === this.selected?.path && base.views.includes(this.selected.viewName))) {
				this.selected = null;
				this.persist();
				this.picker?.setSelected(null);
				this.clearEditor();
				this.picker?.setMessage('The selected view was removed or renamed. Choose another view.');
				return;
			}
			await this.select(this.selected);
		} catch (error) {
			if (this.visible && request === this.request) this.showError(error);
		}
	}
	private async select(target: BoardTarget): Promise<void> {
		const request = ++this.request;
		if (this.editor && !sameBoard(this.editorTarget, target)) this.editor.inert = true;
		try {
			const model = await this.store.read(target);
			if (!this.visible || request !== this.request || !sameBoard(this.selected, target)) return;
			this.picker?.setSelected(target);
			this.render(target, model);
			if (this.error) this.error.textContent = '';
		} catch (error) {
			if (this.visible && request === this.request) {
				this.clearEditor();
				this.showError(error);
			}
		} finally {
			if (request === this.request && this.editor) this.editor.inert = false;
		}
	}
	private render(target: BoardTarget, model: Record<string, unknown>): void {
		if (!this.editor) return;
		if (!sameBoard(this.editorTarget, target)) {
			this.clearEditor();
			this.editorTarget = target;
			const section = settingsSection(
				this.editor,
				this.layout === 'spotlight' ? 'Preview options' : 'Gallery options',
				'These options synchronize with the selected Base view. Properties, Filter and Sort remain available in the Base toolbar.',
			);
			const heading = section.parentElement?.querySelector<HTMLElement>('.obk-section-heading');
			if (heading)
				this.indicators.set(
					'section',
					new SyncIndicator(heading, 'View options', this.layout === 'cards' ? 'Cards EX' : 'Spotlight EX'),
				);
			for (const field of VIEW_FIELDS[this.layout]) {
				const setting = new Setting(section).setName(field.name).setDesc(field.description);
				setting.nameEl.classList.add('obk-synced-label');
				this.indicators.set(
					field.key,
					new SyncIndicator(setting.nameEl, field.name, this.layout === 'cards' ? 'Cards EX' : 'Spotlight EX'),
				);
				const changed = (input: string) => {
					const value =
						field.kind === 'number'
							? Number(input)
							: field.kind === 'property' && input.trim() && !/^(note|file|formula)\./.test(input.trim())
								? `note.${input.trim()}`
								: input.trim();
					if (JSON.stringify(this.model[field.key] ?? field.default) !== JSON.stringify(value))
						void this.change(target, field.key, value);
				};
				if (field.kind === 'choice')
					setting.addDropdown((dropdown) => {
						dropdown.addOptions(field.choices ?? {}).onChange(changed);
						dropdown.selectEl.setAttribute('aria-label', field.name);
						this.controls.set(field.key, dropdown.selectEl);
					});
				else
					setting.addText((text) => {
						const input = text.inputEl;
						input.setAttribute('aria-label', field.name);
						if (field.kind === 'number') {
							input.type = 'number';
							input.min = String(field.min);
							input.max = String(field.max);
							input.step = String(field.step);
						} else {
							text.setPlaceholder('Search properties…');
							const suggest = new ValueSuggest(this.app, input, this.store.inventory.propertyNames());
							suggest.onSelect(() => changed(input.value));
							this.suggestions.push(suggest);
						}
						input.addEventListener('change', () => changed(input.value));
						this.controls.set(field.key, input);
					});
			}
		}
		for (const field of VIEW_FIELDS[this.layout]) {
			if (field.key in this.model && JSON.stringify(this.model[field.key]) !== JSON.stringify(model[field.key])) {
				this.indicators.get(field.key)?.pulse();
				this.indicators.get('section')?.pulse();
			}
			const control = this.controls.get(field.key);
			if (control && control.ownerDocument.activeElement !== control)
				control.value = optionString(model[field.key], field.default).replace(
					field.kind === 'property' ? /^note\./ : /^$/,
					'',
				);
		}
		this.model = model;
	}
	private async change(target: BoardTarget, key: string, value: string | number): Promise<void> {
		try {
			let model: Record<string, unknown> = {};
			const write = async () => {
				model = await this.store.change(target, key, value);
			};
			const operation = () => this.indicators.get(key)?.run(write) ?? write();
			await (this.indicators.get('section')?.run(operation) ?? operation());
			if (this.visible && sameBoard(this.selected, target)) this.render(target, model);
		} catch (error) {
			this.showError(error);
		}
	}
	private persist(): void {
		this.library.selected = this.selected;
		void this.library.persist().catch((error: unknown) => this.showError(error));
	}
	private showError(error: unknown): void {
		const message = error instanceof Error ? error.message : 'Could not update this view.';
		if (this.error) this.error.textContent = message;
		new Notice(message);
	}
}

function optionString(value: unknown, fallback: string | number): string {
	return typeof value === 'string' || typeof value === 'number' ? String(value) : String(fallback);
}
