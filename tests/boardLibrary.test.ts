import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { stringify, parse } from 'yaml';
import { BoardStore } from '../src/settings/boardStore.ts';
import { BoardSettingsTab } from '../src/settings/settingsTab.ts';
import { LibraryPreferences } from '../src/settings/libraryPreferences.ts';
import { ColorControl } from '../src/settings/colorControl.ts';
import { ValueSuggest } from '../src/settings/suggestions.ts';
import { createDivWithMethods, createMockApp, createMockTFile } from './helpers.ts';
import { TFile } from './mocks/obsidian.ts';

const target = { path: 'Gallery.base', viewName: 'Kanban' };
const scope = 'note.currentStatus:status';
function fixture() {
	const documents: Record<string, string> = {
		'Gallery.base': stringify({
			views: [
				{
					type: 'kanban-view',
					name: 'Kanban',
					groupByProperty: 'note.currentStatus',
					statusGrouping: true,
					statusLabels: 'Backlog, Active',
				},
			],
		}),
		'Projects/Business.base': stringify({
			views: [{ type: 'kanban-view', name: 'Ideas', groupByProperty: 'note.currentStatus', statusLabels: 'Shipping' }],
		}),
		'Archive/Everything.base': stringify({ views: [{ type: 'table', name: 'Table' }] }),
	};
	const files = Object.keys(documents).map((path) => Object.assign(new TFile(), createMockTFile(path)));
	const app: any = createMockApp();
	let reads = 0;
	app.vault.getFiles = () => files;
	app.vault.getAbstractFileByPath = (path: string) => files.find((file) => file.path === path) ?? null;
	app.vault.read = async (file: TFile) => {
		reads++;
		return documents[file.path];
	};
	app.vault.process = async (file: TFile, transform: (text: string) => string) => {
		documents[file.path] = transform(documents[file.path]);
	};
	app.vault.getMarkdownFiles = () => [createMockTFile('Note.md')];
	app.metadataCache.getFileCache = () => ({
		frontmatter: { currentStatus: ['Backlog', 'Active', 'Shipping', 'Business'] },
	});
	const library = new LibraryPreferences({ boardLibrary: { paths: [target.path], selected: target } });
	const tab: any = new BoardSettingsTab(app, {} as any, undefined, library);
	return {
		app,
		files,
		documents,
		library,
		tab,
		reads: () => reads,
		view: (): any => parse(documents[target.path]).views[0],
	};
}
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const change = (input: HTMLInputElement | HTMLSelectElement) => input.dispatchEvent(new window.Event('change'));

describe('Vault-wide board library', () => {
	test('Card Moves sits above Group by and syncs its parent without a separate section', async () => {
		const saved = fixture();
		saved.tab.display();
		await settle();
		const container: HTMLElement = saved.tab.containerEl;
		const names = Array.from(container.querySelectorAll('.obk-settings-board-panel .setting-item')).map(
			(el) => el.firstElementChild?.textContent,
		);
		assert.ok(names[0]!.startsWith('Card Moves'));
		assert.ok(names[1]!.startsWith('Group by'));
		const moves = container.querySelector<HTMLSelectElement>('[aria-label="Card Moves"]')!;
		moves.value = 'all';
		change(moves);
		assert.equal(container.querySelector('[data-sync-for="Kanban Columns"]')!.getAttribute('data-sync-state'), 'pending');
		await settle();
		assert.equal(saved.view().statusMoveMode, 'all');
		assert.equal(container.querySelector('[data-sync-for="Card Moves"]')!.getAttribute('data-sync-state'), 'synced');
		assert.equal(container.querySelectorAll('.obk-settings-section').length, 2);
		saved.tab.hide();
	});
	test('fallback snap changes update both icons, reorder in place, and reflect native settings', async () => {
		const saved = fixture();
		saved.tab.display();
		await settle();
		const container: HTMLElement = saved.tab.containerEl;
		const position = container.querySelector<HTMLSelectElement>('[aria-label="Uncategorized position"]')!;
		const row = container.querySelector('[data-status-value="Uncategorized"]')!;
		position.value = 'first';
		change(position);
		assert.equal(container.querySelector('[data-sync-for="Kanban Columns"]')!.getAttribute('data-sync-state'), 'pending');
		assert.equal(container.querySelector('[data-sync-for="Position"]')!.getAttribute('data-sync-state'), 'pending');
		await settle();
		assert.equal(saved.view().uncategorizedPosition, 'first');
		assert.equal(container.querySelector('.obk-settings-columns')!.firstElementChild, row);
		assert.equal(container.querySelector('[data-sync-for="Position"]')!.getAttribute('data-sync-state'), 'synced');
		const view = saved.view();
		view.uncategorizedPosition = 'last';
		saved.documents[target.path] = stringify({ views: [view] });
		await saved.tab.selectBoard(target, false);
		assert.equal(position.value, 'last');
		assert.equal(container.querySelector('.obk-settings-columns')!.lastElementChild, row);
		assert.equal(container.querySelector('[aria-label="Uncategorized position"]'), position);
		saved.tab.hide();
	});
	test('grouping, modes and visibility share one section with identifiable Base and view rows', async () => {
		const saved = fixture();
		saved.tab.display();
		await settle();
		const container: HTMLElement = saved.tab.containerEl;
		assert.deepEqual(
			Array.from(container.querySelectorAll('.obk-board-selector-label')).map((el) => el.textContent),
			['Bases:', 'Views:'],
		);
		const section = container.querySelector('[data-sync-for="Kanban Columns"]')!.closest('.obk-settings-section')!;
		assert.ok(section.querySelector('[aria-label="Group by"]'));
		assert.ok(section.querySelector('[aria-label="Custom Columns in use"]'));
		assert.ok(section.querySelector('[aria-label="Show Uncategorized"]'));
		assert.equal(container.querySelector('.obk-sync-description'), null);
		assert.equal(container.textContent!.includes('Status matching'), false);
		for (const icon of container.querySelectorAll<HTMLElement>('.obk-sync-indicator')) {
			assert.ok(icon.title);
			assert.equal(icon.hasAttribute('aria-label'), false);
		}
		saved.tab.hide();
	});
	test('mode and Group by edits update their icons and the parent, and native changes flow back', async () => {
		const saved = fixture();
		saved.tab.display();
		await settle();
		const container: HTMLElement = saved.tab.containerEl;
		const parent = container.querySelector('[data-sync-for="Kanban Columns"]')!;
		const modeIcon = container.querySelector('[data-sync-for="Custom Columns in use"]')!;
		const mode = container.querySelector<HTMLSelectElement>('[aria-label="Custom Columns in use"]')!;
		assert.equal(mode.value, 'custom');
		assert.deepEqual(
			Array.from(mode.options).map((option) => option.textContent),
			['Only custom columns', 'Custom + other columns', 'Only other columns'],
		);
		mode.value = 'combined';
		change(mode);
		assert.equal(parent.getAttribute('data-sync-state'), 'pending');
		assert.equal(modeIcon.getAttribute('data-sync-state'), 'pending');
		await settle();
		assert.equal(saved.view().columnMode, 'combined');
		assert.equal(parent.getAttribute('data-sync-state'), 'synced');
		const property = container.querySelector<HTMLInputElement>('[aria-label="Group by"]')!;
		property.value = 'tags';
		change(property);
		assert.equal(parent.getAttribute('data-sync-state'), 'pending');
		assert.equal(container.querySelector('[data-sync-for="Group by"]')!.getAttribute('data-sync-state'), 'pending');
		await settle();
		assert.equal(saved.view().groupByProperty, 'note.tags');
		const view = saved.view();
		view.columnMode = 'property';
		view.groupByProperty = 'note.currentStatus';
		saved.documents[target.path] = stringify({ views: [view] });
		await saved.tab.selectBoard(target, false);
		assert.equal(mode.value, 'property');
		assert.equal(property.value, 'currentStatus');
		assert.equal(modeIcon.getAttribute('data-sync-state'), 'synced');
		assert.equal(parent.getAttribute('data-sync-state'), 'synced');
		saved.tab.hide();
	});
	test('discovers Bases in every folder including those without a Kanban view, and reuses unchanged catalog entries', async () => {
		const saved = fixture();
		const store = new BoardStore(saved.app);
		const catalog = await store.catalog();
		assert.deepEqual(
			catalog.map((base) => base.path),
			['Archive/Everything.base', 'Gallery.base', 'Projects/Business.base'],
		);
		assert.deepEqual(catalog[0].views, []);
		assert.equal(saved.reads(), 3);
		await store.catalog();
		assert.equal(saved.reads(), 3);
		saved.documents['Projects/Business.base'] = stringify({ views: [{ type: 'kanban-view', name: 'New ideas' }] });
		store.invalidateCatalog('Projects/Business.base');
		assert.deepEqual((await store.catalog())[2].views, ['New ideas']);
		assert.equal(saved.reads(), 4);
	});
	test('persists added tabs and selection while retaining legacy plugin data, and serializes rapid saves', async () => {
		const writes: any[] = [];
		const library = new LibraryPreferences(
			{ columnOrders: { 'note.status': ['Keep'] }, custom: 'Keep too' },
			async (data) => {
				writes.push(data);
			},
		);
		library.add('Gallery.base');
		library.selected = target;
		const first = library.persist();
		library.add('Projects/Business.base');
		library.rename('Projects', 'Work');
		await library.persist();
		await first;
		assert.deepEqual(writes[0].boardLibrary.paths, ['Gallery.base']);
		assert.deepEqual(writes[1].columnOrders, { 'note.status': ['Keep'] });
		assert.equal(writes[1].custom, 'Keep too');
		const reopened = new LibraryPreferences(writes[1]);
		assert.deepEqual(reopened.paths, ['Gallery.base', 'Work/Business.base']);
		assert.deepEqual(reopened.selected, target);
		reopened.remove(target.path);
		assert.equal(reopened.selected, null);
	});
	test('searches beyond saved tabs, requires Add, switches views, and removes only a library tab', async () => {
		const saved = fixture();
		saved.tab.display();
		await settle();
		const input = saved.tab.containerEl.querySelector('[aria-label="Base to add"]') as HTMLInputElement;
		input.value = 'Business';
		input.dispatchEvent(new window.Event('input'));
		assert.equal(saved.tab.picker.suggest.getSuggestions(input.value)[0].path, 'Projects/Business.base');
		const base = saved.tab.picker.suggest.getSuggestions(input.value)[0];
		saved.tab.picker.suggest.selectSuggestion(base, new window.MouseEvent('click'));
		assert.deepEqual(saved.library.paths, ['Gallery.base']);
		const add = Array.from(saved.tab.containerEl.querySelectorAll('button')).find(
			(button: any) => button.textContent === 'Add',
		) as HTMLButtonElement;
		add.click();
		await settle();
		assert.equal(saved.tab.selected.viewName, 'Ideas');
		assert.equal(saved.tab.containerEl.querySelectorAll('.obk-base-pill').length, 2);
		const before = saved.documents['Projects/Business.base'];
		(
			saved.tab.containerEl.querySelector('[aria-label="Remove Projects/Business.base from library"]') as HTMLButtonElement
		).click();
		await settle();
		assert.equal(saved.documents['Projects/Business.base'], before);
		assert.equal(saved.tab.selected.viewName, 'Kanban');
		assert.deepEqual(saved.library.paths, ['Gallery.base']);
		saved.tab.hide();
	});
});

describe('Stable settings controls', () => {
	test('restores the selected Base and view after repeated Thanks round trips, including changed settings', async () => {
		const saved = fixture();
		const business = 'Projects/Business.base';
		const document = parse(saved.documents[business]);
		document.views.push({
			type: 'kanban-view',
			name: 'Publishing',
			groupByProperty: 'note.currentStatus',
			statusLabels: 'Review',
		});
		saved.documents[business] = stringify(document);
		saved.library.add(business);
		saved.tab.display();
		await settle();
		const selected = { path: business, viewName: 'Publishing' };
		await saved.tab.selectBoard(selected);
		const container: HTMLElement = saved.tab.containerEl;
		const switchTab = (name: string) => {
			const button = Array.from(container.querySelectorAll<HTMLButtonElement>('.obk-settings-tabs button')).find(
				(button) => button.textContent === name,
			)!;
			button.click();
		};
		for (const value of ['Review', 'Published']) {
			switchTab('Thanks & license');
			assert.ok(saved.tab.containerEl.querySelector('.obk-license'));
			assert.deepEqual(saved.tab.selected, selected);
			assert.deepEqual(saved.library.selected, selected);
			document.views[1].statusLabels = value;
			saved.documents[business] = stringify(document);
			switchTab('Boards');
			await settle();
			assert.ok(saved.tab.containerEl.querySelector(`[aria-label="Match value for ${value}"]`));
			assert.equal(
				saved.tab.containerEl.querySelector('[data-base-path="Projects/Business.base"]').getAttribute('aria-pressed'),
				'true',
			);
			assert.equal(
				saved.tab.containerEl
					.querySelector('[data-board-link="[[Projects/Business.base#Publishing]]"]')
					.getAttribute('aria-pressed'),
				'true',
			);
			assert.equal(saved.tab.containerEl.querySelector('.obk-settings-board-panel h2'), null);
			assert.equal(saved.tab.containerEl.querySelector('.obk-board-reference'), null);
		}
		saved.tab.hide();
	});
	test('restores the saved view when settings reopen and when a fresh settings tab is created', async () => {
		const saved = fixture();
		saved.library.add('Projects/Business.base');
		saved.tab.display();
		await settle();
		const selected = { path: 'Projects/Business.base', viewName: 'Ideas' };
		await saved.tab.selectBoard(selected);
		saved.tab.hide();
		saved.tab.display();
		await settle();
		assert.ok(saved.tab.containerEl.querySelector('[aria-label="Match value for Shipping"]'));
		const persisted = new LibraryPreferences({
			boardLibrary: { paths: saved.library.paths, selected: saved.library.selected },
		});
		const reopened = new BoardSettingsTab(saved.app, {} as any, undefined, persisted);
		reopened.display();
		await settle();
		assert.ok(reopened.containerEl.querySelector('[aria-label="Match value for Shipping"]'));
		saved.tab.hide();
		reopened.hide();
	});
	test('switching keeps the previous panel until ready and retains the clicked Base tab', async () => {
		const saved = fixture();
		saved.library.add('Projects/Business.base');
		saved.tab.display();
		await settle();
		const panel = saved.tab.panel;
		const oldProperty = panel.querySelector('[aria-label="Group by"]');
		const button = saved.tab.containerEl.querySelector('[data-base-path="Projects/Business.base"]') as HTMLButtonElement;
		const read = saved.tab.store.read.bind(saved.tab.store);
		let finish: () => void = () => {};
		saved.tab.store.read = async (target: any) => {
			await new Promise<void>((resolve) => {
				finish = resolve;
			});
			return read(target);
		};
		button.click();
		assert.equal(panel.querySelector('[aria-label="Group by"]'), oldProperty);
		assert.equal(panel.inert, true);
		assert.equal(saved.tab.containerEl.querySelector('[data-base-path="Projects/Business.base"]'), button);
		finish();
		await settle();
		assert.ok(panel.querySelector('[aria-label="Match value for Shipping"]'));
		assert.equal(panel.inert, false);
		assert.equal(panel.hasAttribute('aria-busy'), false);
		saved.tab.hide();
	});
	test('a slow board read cannot replace a more recent selection', async () => {
		const saved = fixture();
		saved.tab.display();
		await settle();
		const read = saved.tab.store.read.bind(saved.tab.store);
		let finish: () => void = () => {};
		saved.tab.store.read = async (board: any) => {
			if (board.path !== target.path)
				await new Promise<void>((resolve) => {
					finish = resolve;
				});
			return read(board);
		};
		const delayed = saved.tab.selectBoard({ path: 'Projects/Business.base', viewName: 'Ideas' });
		await saved.tab.selectBoard(target);
		finish();
		await delayed;
		assert.ok(saved.tab.panel.querySelector('[aria-label="Match value for Backlog"]'));
		assert.equal(saved.tab.panel.inert, false);
		saved.tab.hide();
	});
	test('visibility syncs both ways without replacing controls, and only changed fields flash', async () => {
		const saved = fixture();
		saved.tab.display();
		await settle();
		const input = saved.tab.containerEl.querySelector('[aria-label="Show Uncategorized"]') as HTMLInputElement;
		const indicator = saved.tab.containerEl.querySelector('[data-sync-for="Show Uncategorized"]')!;
		const parent = saved.tab.containerEl.querySelector('[data-sync-for="Kanban Columns"]')!;
		assert.equal(input.checked, true);
		input.checked = false;
		change(input);
		assert.equal(indicator.getAttribute('data-sync-state'), 'pending');
		assert.equal(parent.getAttribute('data-sync-state'), 'pending');
		await settle();
		assert.equal(saved.view().showUncategorized, false);
		assert.equal(indicator.getAttribute('data-sync-state'), 'synced');
		assert.equal(parent.getAttribute('data-sync-state'), 'synced');
		assert.equal(
			saved.tab.containerEl.querySelector('[data-sync-for="Group by"]').getAttribute('data-sync-state'),
			'idle',
		);
		const view = saved.view();
		view.showUncategorized = true;
		view.columnColors = { [scope]: { Backlog: 'blue' } };
		saved.documents[target.path] = stringify({ views: [view] });
		await saved.tab.selectBoard(target, false);
		assert.equal(input.checked, true);
		assert.equal(saved.tab.containerEl.querySelector('[aria-label="Show Uncategorized"]'), input);
		assert.equal(
			saved.tab.containerEl.querySelector('[data-sync-for="Color for Backlog"]').getAttribute('data-sync-state'),
			'synced',
		);
		saved.tab.hide();
	});
	test('a failed save shows an error indicator and restores the saved toggle', async () => {
		const saved = fixture();
		saved.tab.display();
		await settle();
		saved.app.vault.process = async () => {
			throw new Error('Test write failure');
		};
		const input = saved.tab.containerEl.querySelector('[aria-label="Show Uncategorized"]') as HTMLInputElement;
		input.checked = false;
		change(input);
		await settle();
		assert.equal(saved.view().showUncategorized, undefined);
		assert.equal(input.checked, true);
		assert.equal(
			saved.tab.containerEl.querySelector('[data-sync-for="Show Uncategorized"]').getAttribute('data-sync-state'),
			'error',
		);
		assert.equal(
			saved.tab.containerEl.querySelector('[data-sync-for="Kanban Columns"]').getAttribute('data-sync-state'),
			'error',
		);
		saved.tab.hide();
	});
	test('color and move edits preserve the controls, focus and unsaved add-field text', async () => {
		const saved = fixture();
		document.body.appendChild(saved.tab.containerEl);
		saved.tab.display();
		await settle();
		const name = saved.tab.containerEl.querySelector('[aria-label="Display name for Backlog"]') as HTMLInputElement;
		const color = saved.tab.containerEl.querySelector('[aria-label="Color for Backlog"]') as HTMLSelectElement;
		const draft = saved.tab.containerEl.querySelector('[aria-label="New column value"]') as HTMLInputElement;
		draft.value = 'My draft';
		name.focus();
		await saved.tab.change({ type: 'color', value: 'Backlog', color: 'red' });
		await saved.tab.change({ type: 'move-mode', mode: 'all' });
		assert.equal(saved.tab.containerEl.querySelector('[aria-label="Color for Backlog"]'), color);
		assert.equal(document.activeElement, name);
		assert.equal(draft.value, 'My draft');
		assert.equal(color.value, 'red');
		assert.deepEqual(
			Array.from(saved.tab.containerEl.querySelectorAll('.obk-section-heading')).map(
				(el: any) => el.firstChild.textContent,
			),
			['Board library', 'Kanban Columns'],
		);
		saved.tab.hide();
		saved.tab.containerEl.remove();
	});
	test('renaming a value followed immediately by a color change keeps the row and saves both edits', async () => {
		const saved = fixture();
		saved.tab.display();
		await settle();
		const row = saved.tab.containerEl.querySelector('[data-status-value="Backlog"]');
		const value = saved.tab.containerEl.querySelector('[aria-label="Match value for Backlog"]') as HTMLInputElement;
		const color = saved.tab.containerEl.querySelector('[aria-label="Color for Backlog"]') as HTMLSelectElement;
		value.value = 'Queue';
		change(value);
		color.value = 'red';
		change(color);
		await settle();
		await settle();
		assert.equal(saved.tab.containerEl.querySelector('[data-status-value="Queue"]'), row);
		assert.equal(saved.view().columnColors[scope].Queue, 'red');
		assert.deepEqual(JSON.parse(saved.view().statusLabels), ['Queue', 'Active']);
		saved.tab.hide();
	});
	test('queued edits retain their original board when the user switches tabs', async () => {
		const saved = fixture();
		saved.tab.display();
		await settle();
		const name = saved.tab.containerEl.querySelector('[aria-label="Display name for Backlog"]') as HTMLInputElement;
		name.value = 'My ideas';
		change(name);
		await saved.tab.selectBoard({ path: 'Projects/Business.base', viewName: 'Ideas' });
		await settle();
		assert.equal(saved.view().statusColumnNames.Backlog, 'My ideas');
		assert.equal(parse(saved.documents['Projects/Business.base']).views[0].statusColumnNames, undefined);
		saved.tab.hide();
	});
	test('new values show suggestions on focus and filter out configured columns', async () => {
		const saved = fixture();
		document.body.appendChild(saved.tab.containerEl);
		saved.tab.display();
		await settle();
		const input = saved.tab.containerEl.querySelector('[aria-label="New column value"]') as HTMLInputElement;
		input.focus();
		const anchor = input.parentElement!;
		assert.equal(input.getAttribute('aria-expanded'), 'true');
		assert.deepEqual(
			Array.from(anchor.querySelectorAll('[role="option"]')).map((el) => el.textContent),
			['Business', 'Shipping'],
		);
		input.value = 'ship';
		input.dispatchEvent(new window.Event('input'));
		assert.equal(anchor.querySelectorAll('[role="option"]').length, 1);
		input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown' }));
		input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter' }));
		assert.equal(input.value, 'Shipping');
		const add = Array.from(saved.tab.containerEl.querySelectorAll('button')).find(
			(button: any) => button.textContent === 'Add column',
		) as HTMLButtonElement;
		add.click();
		await settle();
		assert.ok(JSON.parse(saved.view().statusLabels).includes('Shipping'));
		assert.equal(input.value, '');
		saved.tab.hide();
		saved.tab.containerEl.remove();
	});
	test('palette colors show their real swatch and custom picker input does not save until committed', () => {
		const container = createDivWithMethods();
		const changes: string[] = [];
		const control = new ColorControl(container, (value) => changes.push(value));
		control.setName('Ideas');
		control.setValue('red');
		const select = container.querySelector('select')!;
		const picker = container.querySelector('input')!;
		assert.equal(container.querySelector<HTMLElement>('.obk-color-swatch')!.style.backgroundColor, 'var(--color-red)');
		select.value = 'blue';
		change(select);
		assert.equal(container.querySelector<HTMLElement>('.obk-color-swatch')!.style.backgroundColor, 'var(--color-blue)');
		picker.value = '#123456';
		picker.dispatchEvent(new window.Event('input'));
		assert.deepEqual(changes, ['blue']);
		change(picker);
		assert.deepEqual(changes, ['blue', '#123456']);
		assert.equal(select.value, 'custom');
	});
	test('keyboard suggestions wrap upward and close on Escape without changing the input', () => {
		const container = createDivWithMethods();
		const input = container.createEl('input');
		const suggestions = new ValueSuggest(createMockApp(), input, ['One', 'Two', 'Three']);
		suggestions.open();
		input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp' }));
		assert.equal(container.querySelector('[aria-selected="true"]')!.textContent, 'Three');
		input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
		assert.equal(input.getAttribute('aria-expanded'), 'false');
		assert.equal(input.value, '');
		suggestions.destroy();
	});
});
