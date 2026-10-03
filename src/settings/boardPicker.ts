import { type App, setIcon } from 'obsidian';
import { boardLink, type BoardTarget } from './boardConfig.ts';
import { resolveBoardReference, sameBoard } from './boardReferences.ts';
import { BaseSuggest, type BaseCatalogEntry } from './suggestions.ts';
import { LibraryPreferences } from './libraryPreferences.ts';

export class BoardPicker {
	private catalog: BaseCatalogEntry[] = [];
	private selected: BoardTarget | null = null;
	private activePath = '';
	private input: HTMLInputElement;
	private tabs: HTMLElement;
	private views: HTMLElement;
	private status: HTMLElement;
	private suggest: BaseSuggest;
	private signature = '';
	private baseSignature = '';
	constructor(
		_app: App,
		container: HTMLElement,
		private choose: (board: BoardTarget | null) => void,
		refresh: () => void,
		private library = new LibraryPreferences(null),
		private preferencesChanged: () => void = () => {},
		private layoutName = 'Kanban',
	) {
		container.createEl('p', {
			cls: 'setting-item-description',
			text: `Find a Base anywhere in this vault, add it to your library, then select one of its ${layoutName} views.`,
		});
		const search = container.createDiv({ cls: 'obk-board-search' });
		this.input = search.createEl('input', {
			attr: { type: 'text', placeholder: 'Search Bases or paste a Base/view link…', 'aria-label': 'Base to add' },
		});
		this.suggest = new BaseSuggest(this.input, [], layoutName);
		search
			.createEl('button', { text: 'Add', cls: 'mod-cta', attr: { type: 'button' } })
			.addEventListener('click', () => this.add());
		const refreshButton = search.createEl('button', {
			cls: 'obk-icon-button',
			attr: { type: 'button', title: 'Refresh vault search', 'aria-label': 'Refresh vault search' },
		});
		setIcon(refreshButton, 'refresh-cw');
		refreshButton.addEventListener('click', refresh);
		this.input.addEventListener('keydown', (event) => {
			if (event.key === 'Enter' && !event.defaultPrevented && !event.isComposing) {
				event.preventDefault();
				this.add();
			}
		});
		this.status = container.createDiv({ cls: 'obk-board-status', attr: { role: 'status', 'aria-live': 'polite' } });
		const bases = container.createDiv({ cls: 'obk-board-selector-row' });
		bases.createSpan({ cls: 'obk-board-selector-label', text: 'Bases:' });
		this.tabs = bases.createDiv({ cls: 'obk-board-tabs', attr: { 'aria-label': 'Saved Bases' } });
		const views = container.createDiv({ cls: 'obk-board-selector-row' });
		views.createSpan({ cls: 'obk-board-selector-label', text: 'Views:' });
		this.views = views.createDiv({
			cls: 'obk-board-group-views',
			attr: { 'aria-label': `${layoutName} views in selected Base` },
		});
	}
	close(): void {
		this.suggest.destroy();
	}
	update(catalog: BaseCatalogEntry[]): void {
		this.catalog = catalog;
		this.suggest.update(catalog);
		const oldPaths = JSON.stringify(this.library.paths);
		if (!this.library.initialized) {
			this.library.initialized = true;
			const first = this.library.selected?.path ?? catalog[0]?.path;
			if (first) this.library.add(first);
		}
		this.library.paths = this.library.paths.filter((path) => catalog.some((base) => base.path === path));
		if (oldPaths !== JSON.stringify(this.library.paths)) this.preferencesChanged();
		if (!this.library.paths.includes(this.activePath)) this.activePath = this.library.paths[0] ?? '';
		this.renderTabs();
	}
	setSelected(board: BoardTarget | null): void {
		this.selected = board;
		if (board) {
			this.library.add(board.path);
			this.activePath = board.path;
		}
		this.renderTabs();
	}
	setMessage(message: string): void {
		this.status.textContent = message;
	}
	private add(): void {
		try {
			const text = this.input.value.trim().replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0].replace(/\\/g, '/');
			let target: BoardTarget | null = null;
			let path = '';
			if (text.includes('#')) {
				target = resolveBoardReference(
					this.catalog.flatMap((base) => base.views.map((viewName) => ({ path: base.path, viewName }))),
					text,
				);
				path = target.path;
			} else {
				const normalized = (value: string) => value.replace(/\.base$/i, '').toLowerCase();
				let matches = this.catalog.filter((base) => normalized(base.path) === normalized(text));
				if (!matches.length && !text.includes('/'))
					matches = this.catalog.filter((base) => normalized(base.path.split('/').pop() ?? '') === normalized(text));
				if (matches.length !== 1)
					throw new Error(
						matches.length ? 'Choose a suggestion with its full folder path.' : 'Choose a suggested Base, then select Add.',
					);
				path = matches[0].path;
			}
			this.library.add(path);
			this.activePath = path;
			this.input.value = '';
			this.suggest.close();
			this.setMessage('');
			this.preferencesChanged();
			this.renderTabs();
			this.select(target ?? this.firstView(path));
		} catch (error) {
			this.setMessage(error instanceof Error ? error.message : 'Could not add this Base.');
		}
	}
	private firstView(path: string): BoardTarget | null {
		const viewName = this.catalog.find((base) => base.path === path)?.views[0];
		return viewName ? { path, viewName } : null;
	}
	private select(target: BoardTarget | null): void {
		const changed = !sameBoard(this.selected, target);
		this.selected = target;
		this.renderTabs();
		if (changed) this.choose(target);
	}
	private renderTabs(): void {
		const signature = JSON.stringify([
			this.library.paths,
			this.activePath,
			this.catalog.filter((base) => base.path === this.activePath),
		]);
		const baseSignature = JSON.stringify(this.library.paths);
		if (baseSignature !== this.baseSignature) {
			this.baseSignature = baseSignature;
			this.tabs.empty();
			for (const path of this.library.paths) {
				const pill = this.tabs.createDiv({ cls: 'obk-base-pill' });
				const name = pill.createEl('button', {
					text: path.replace(/\.base$/i, ''),
					attr: { type: 'button', 'data-base-path': path, title: path },
				});
				name.addEventListener('click', () => {
					this.activePath = path;
					this.select(this.firstView(path));
				});
				const remove = pill.createEl('button', {
					cls: 'obk-base-remove',
					attr: {
						type: 'button',
						'aria-label': `Remove ${path} from library`,
						title: 'Remove from library; keep the Base and its settings',
					},
				});
				setIcon(remove, 'x');
				remove.addEventListener('click', () => {
					this.library.remove(path);
					if (this.activePath === path) {
						this.activePath = this.library.paths[0] ?? '';
						this.select(this.firstView(this.activePath));
					}
					this.preferencesChanged();
					this.renderTabs();
				});
			}
		}
		if (signature !== this.signature) {
			this.signature = signature;
			this.views.empty();
			const base = this.catalog.find((base) => base.path === this.activePath);
			if (base) {
				for (const viewName of base.views) {
					const target = { path: base.path, viewName };
					this.views
						.createEl('button', {
							text: viewName,
							cls: 'obk-board-choice',
							attr: { type: 'button', 'data-board-link': boardLink(target) },
						})
						.addEventListener('click', () => this.select(target));
				}
				if (!base.views.length)
					this.views.createEl('p', {
						cls: 'setting-item-description',
						text: `Add a ${this.layoutName} view inside this Base to configure it here.`,
					});
			} else
				this.views.createEl('p', {
					cls: 'setting-item-description',
					text: 'Add a Base above to begin. Removing a library tab keeps its file and board settings.',
				});
		}
		this.tabs
			.querySelectorAll<HTMLElement>('[data-base-path]')
			.forEach((button) =>
				button.setAttribute('aria-pressed', String(button.getAttribute('data-base-path') === this.activePath)),
			);
		this.views
			.querySelectorAll<HTMLElement>('[data-board-link]')
			.forEach((button) =>
				button.setAttribute(
					'aria-pressed',
					String(!!this.selected && button.getAttribute('data-board-link') === boardLink(this.selected)),
				),
			);
	}
}
