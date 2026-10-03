import { Notice, PluginSettingTab, type App, type Plugin } from 'obsidian';
import { type BoardChange, type BoardModel, type BoardTarget } from './boardConfig.ts';
import { BoardStore } from './boardStore.ts';
import { BoardPicker } from './boardPicker.ts';
import { BoardEditor } from './boardEditor.ts';
import { sameBoard } from './boardReferences.ts';
import { type LiveBoards } from './liveBoards.ts';
import { MIT_LICENSE } from './license.ts';
import { LibraryPreferences } from './libraryPreferences.ts';
import { settingsSection } from './sections.ts';

export class BoardSettingsTab extends PluginSettingTab {
	private store: BoardStore;
	private tab: 'boards' | 'thanks' = 'boards';
	private selected: BoardTarget | null = null;
	private model: BoardModel | null = null;
	private panel: HTMLElement | null = null;
	private picker: BoardPicker | null = null;
	private editor: BoardEditor | null = null;
	private timer: number | null = null;
	private visible = false;
	private saving = 0;
	private selectionRequest = 0;
	private loadingTarget: BoardTarget | null = null;
	private catalogRequest = 0;
	private refreshPending = false;
	private errorEl: HTMLElement | null = null;
	constructor(
		app: App,
		plugin: Plugin,
		live?: LiveBoards,
		private library = new LibraryPreferences(null),
		private embedded = false,
	) {
		super(app, plugin);
		this.store = new BoardStore(app, live);
		this.selected = library.selected;
	}

	display(): void {
		this.hide();
		this.visible = true;
		this.containerEl.empty();
		this.containerEl.addClass('obk-settings');
		if (!this.embedded) {
			const tabs = this.containerEl.createDiv({ cls: 'obk-settings-tabs' });
			for (const [id, label] of [
				['boards', 'Boards'],
				['thanks', 'Thanks & license'],
			]) {
				const button = tabs.createEl('button', {
					text: label,
					attr: { type: 'button', 'aria-pressed': String(this.tab === id) },
				});
				if (this.tab === id) button.addClass('is-active');
				button.addEventListener('click', () => {
					this.tab = id === 'thanks' ? 'thanks' : 'boards';
					this.display();
				});
			}
		}
		if (!this.embedded && this.tab === 'thanks') {
			this.renderThanks();
			return;
		}
		const pickerPanel = settingsSection(
			this.containerEl,
			'Board library',
			'Search covers every .base file and its Kanban views throughout this vault. Add Bases as tabs, then select a view underneath. The × removes a tab from this library only; it keeps the file and all board settings. Each view has independent columns and move behavior.',
		);
		this.panel = this.containerEl.createDiv({ cls: 'obk-settings-board-panel' });
		this.errorEl = this.containerEl.createDiv({
			cls: 'obk-settings-error',
			attr: { role: 'status', 'aria-live': 'polite' },
		});
		this.picker = new BoardPicker(
			this.app,
			pickerPanel,
			(target) => {
				if (target) void this.selectBoard(target);
				else this.clearSelection(false);
			},
			() => {
				this.store.invalidateCatalog();
				void this.refreshBoards();
			},
			this.library,
			() => this.persistLibrary(),
		);
		this.editor = new BoardEditor(this.app, this.panel, this.store, (change, target) => this.change(change, target));
		this.panel.addEventListener('focusout', () => {
			if (this.refreshPending) this.scheduleRefresh();
		});
		this.picker.setSelected(this.selected);
		this.emptyPanel();
		void this.refreshBoards();
	}

	hide(): void {
		this.visible = false;
		this.selectionRequest++;
		this.loadingTarget = null;
		this.catalogRequest++;
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.timer = null;
		this.editor?.close();
		this.editor = null;
		// The model belongs to the destroyed controls. Keep the saved selection,
		// but force a fresh editor even when that board's config has not changed.
		this.model = null;
		this.panel = null;
		this.errorEl = null;
		this.refreshPending = false;
		this.picker?.close();
		this.picker = null;
	}

	onVaultChanged(file: { path: string }, kind: 'modify' | 'create' | 'delete' | 'rename', oldPath?: string): void {
		if (kind !== 'modify' || file.path.endsWith('.base')) this.store.invalidateCatalog(file.path);
		if (oldPath) this.store.invalidateCatalog(oldPath);
		if (kind === 'rename' && oldPath) this.library.rename(oldPath, file.path);
		if (kind === 'delete')
			this.library.paths = this.library.paths.filter((path) => path !== file.path && !path.startsWith(`${file.path}/`));
		if (
			kind === 'rename' &&
			oldPath &&
			this.selected &&
			(this.selected.path === oldPath || this.selected.path.startsWith(`${oldPath}/`))
		) {
			this.selectionRequest++;
			this.loadingTarget = null;
			if (this.panel) {
				this.panel.inert = false;
				this.panel.removeAttribute('aria-busy');
			}
			this.selected = { ...this.selected, path: file.path + this.selected.path.slice(oldPath.length) };
			this.picker?.setSelected(this.selected);
		}
		const affectsSelection =
			this.selected && (this.selected.path === file.path || this.selected.path.startsWith(`${file.path}/`));
		if (kind === 'delete' && affectsSelection)
			this.clearSelection(true, 'The selected Base was deleted. Choose another board.');
		if (kind === 'rename' || kind === 'delete') this.persistLibrary();
		if (kind !== 'modify' || file.path.endsWith('.base')) this.scheduleRefresh();
	}

	onLiveBoardChanged(target: BoardTarget): void {
		if (sameBoard(this.selected, target)) this.scheduleRefresh();
	}
	private editorFocused(): boolean {
		const focused = this.containerEl.ownerDocument.activeElement;
		return (
			this.editor?.isInteracting ||
			(!!focused && !!this.panel?.contains(focused) && focused.matches('input,select,textarea,[contenteditable="true"]'))
		);
	}
	private scheduleRefresh(): void {
		if (!this.visible || this.tab !== 'boards') return;
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => {
			this.timer = null;
			void this.refreshBoards();
		}, 150);
	}

	private async refreshBoards(): Promise<void> {
		const request = ++this.catalogRequest;
		const picker = this.picker;
		try {
			const catalog = await this.store.catalog();
			const boards = catalog.flatMap((base) => base.views.map((viewName) => ({ path: base.path, viewName })));
			if (!this.visible || request !== this.catalogRequest || picker !== this.picker) return;
			picker?.update(catalog);
			if (!this.selected) return;
			if (!boards.some((board) => sameBoard(board, this.selected))) {
				this.clearSelection(true, 'The selected view was removed or renamed. Choose a board from the updated list.');
				return;
			}
			if (this.saving > 0 || this.editorFocused()) {
				this.refreshPending = true;
				return;
			}
			this.refreshPending = false;
			await this.selectBoard(this.selected, false);
		} catch (error) {
			if (this.visible && request === this.catalogRequest) this.showError(error);
		}
	}

	private clearSelection(clearInput: boolean, message = ''): void {
		this.selectionRequest++;
		this.selected = null;
		this.loadingTarget = null;
		if (this.panel) {
			this.panel.inert = false;
			this.panel.removeAttribute('aria-busy');
		}
		this.model = null;
		this.persistLibrary();
		this.editor?.close();
		if (clearInput) this.picker?.setSelected(null);
		this.picker?.setMessage(message);
		if (this.errorEl) this.errorEl.textContent = '';
		this.emptyPanel();
	}
	private emptyPanel(): void {
		this.panel?.empty();
		this.panel?.createEl('p', { cls: 'setting-item-description', text: 'Choose a board above to edit its settings.' });
	}

	private async selectBoard(target: BoardTarget, reset = true): Promise<void> {
		if (!reset && this.loadingTarget) return;
		const request = ++this.selectionRequest;
		const switching = !sameBoard(this.selected, target);
		if (reset && !sameBoard(this.selected, target)) {
			this.selected = target;
			this.loadingTarget = target;
			if (this.panel) {
				this.panel.inert = true;
				this.panel.setAttribute('aria-busy', 'true');
			}
			this.persistLibrary();
		}
		try {
			const model = await this.store.read(target);
			if (!this.visible || request !== this.selectionRequest || !sameBoard(this.selected, target)) return;
			const changed = switching || JSON.stringify(model) !== JSON.stringify(this.model);
			this.model = model;
			this.picker?.setSelected(target);
			if (this.errorEl) this.errorEl.textContent = '';
			if (changed) this.editor?.render(target, model);
		} catch (error) {
			if (this.visible && request === this.selectionRequest) {
				this.clearSelection(true);
				this.showError(error);
			}
		} finally {
			if (request === this.selectionRequest) {
				this.loadingTarget = null;
				if (this.panel) {
					this.panel.inert = false;
					this.panel.removeAttribute('aria-busy');
				}
			}
		}
	}

	private async change(change: BoardChange, target: BoardTarget | null = this.selected): Promise<void> {
		if (!target) return;
		this.saving++;
		try {
			const model = await this.store.change(target, change);
			if (!this.visible || !sameBoard(this.selected, target)) return;
			this.selectionRequest++;
			this.model = model;
			if (this.errorEl) this.errorEl.textContent = '';
			this.editor?.render(target, model, change);
		} catch (error) {
			if (this.visible && sameBoard(this.selected, target)) {
				if (this.model) this.editor?.render(target, this.model);
				this.showError(error);
			}
			throw error;
		} finally {
			this.saving--;
			if (this.refreshPending) this.scheduleRefresh();
		}
	}
	private persistLibrary(): void {
		this.library.selected = this.selected;
		void this.library.persist().catch((error: unknown) => this.showError(error));
	}

	private showError(error: unknown): void {
		const message = error instanceof Error ? error.message : 'Could not update board settings.';
		if (this.errorEl) this.errorEl.textContent = message;
		new Notice(message);
	}
	private renderThanks(): void {
		const credits = settingsSection(
			this.containerEl,
			'Thanks to I. Welch Canavan',
			'This is a local edition of the original MIT-licensed plugin. The upstream author, copyright and permission notice are retained.',
		);
		credits.createEl('p', {
			text:
				'Thank you for creating Kanban Bases View and sharing it under the MIT license. This local edition builds on your board, drag-and-drop, swimlanes and column colors.',
		});
		credits.createEl('a', {
			text: 'Original project on GitHub',
			attr: { href: 'https://github.com/xiwcx/obsidian-bases-kanban', target: '_blank', rel: 'noopener noreferrer' },
		});
		credits.createEl('p', {
			text:
				'Local additions: configurable status matching, synchronized board settings, and preservation of other labels when cards move.',
		});
		const license = settingsSection(
			this.containerEl,
			'MIT license',
			'The full original license below applies to the upstream plugin and is included in every local release. Third-party notices are included with the installable files.',
		);
		license.createEl('pre', { text: MIT_LICENSE, cls: 'obk-license' });
	}
}
