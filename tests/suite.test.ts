import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parse, stringify } from 'yaml';
import { TFile } from './mocks/obsidian.ts';
import { migratedPreferences, SuitePreferences } from '../src/suite/preferences.ts';
import BasesViewsEXPlugin from '../src/suite/main.ts';
import { ViewOptionsStore } from '../src/suite/viewOptions.ts';
import { LiveBoards } from '../src/settings/liveBoards.ts';
import { ColumnsPanel } from '../src/settings/columnsPanel.ts';
import { readBoardModel } from '../src/settings/boardConfig.ts';
import { createDivWithMethods, createMockApp, createMockTFile } from './helpers.ts';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const target = { path: 'Gallery.base', viewName: 'Gallery' };
function fixture() {
	let document: any = {
		filters: { and: ['file.ext == "md"'] },
		formulas: { custom: '1+1' },
		views: [
			{ type: 'spotlight-ex-cards', name: 'Gallery', cardSize: 260, image: 'note.cover' },
			{ type: 'bases-spotlight-view-expanded', name: 'Preview', spotlight_property: 'note.preview' },
			{ type: 'kanban-view', name: 'Board', groupByProperty: 'note.status', statusLabels: 'A, B' },
		],
	};
	const file = Object.assign(new TFile(), createMockTFile(target.path));
	const app: any = createMockApp();
	app.vault.configDir = '.obsidian';
	app.vault.getFiles = () => [file];
	app.vault.getAbstractFileByPath = (path: string) => (path === file.path ? file : null);
	app.vault.read = async () => stringify(document);
	let processed = 0;
	app.vault.process = async (_file: unknown, transform: (value: string) => string) => {
		document = parse(transform(stringify(document)));
		processed++;
	};
	app.vault.adapter = {
		exists: async () => false,
		list: async (): Promise<{ folders: string[]; files: string[] }> => ({ folders: [], files: [] }),
	};
	app.metadataCache.on = () => ({});
	app.workspace.getLeavesOfType = (): unknown[] => [];
	return { app, read: () => document, processed: () => processed };
}
describe('Bases Views EX integration', () => {
	test('migrates both source plugins by manifest ID even in a differently named folder', async () => {
		const { app } = fixture();
		const files: Record<string, string> = {
			'.obsidian/plugins/kanban-bases-view/manifest.json': JSON.stringify({ id: 'kanban-bases-view' }),
			'.obsidian/plugins/kanban-bases-view/data.json': JSON.stringify({
				boardLibrary: { paths: ['Gallery.base'], selected: { path: 'Gallery.base', viewName: 'Board' } },
				columnColors: { old: { A: 'red' } },
			}),
			'.obsidian/plugins/manual-source/manifest.json': JSON.stringify({ id: 'bases-spotlight-view-expanded' }),
			'.obsidian/plugins/manual-source/data.json': JSON.stringify({
				sidebarWidth: 410,
				propertyOrder: ['note.labels'],
				tagHashDisplay: false,
			}),
		};
		app.vault.adapter = {
			exists: async (path: string) => path in files,
			read: async (path: string) => files[path],
			list: async () => ({ folders: ['.obsidian/plugins/manual-source'] }),
		};
		const result: any = await migratedPreferences(app, null);
		assert.equal(result.kanban.boardLibrary.selected.viewName, 'Board');
		assert.equal(result.kanban.columnColors.old.A, 'red');
		assert.equal(result.spotlight.sidebarWidth, 410);
		assert.equal(result.spotlight.tagHashDisplay, false);
		assert.deepEqual(result.spotlight.propertyOrder, ['note.labels']);
	});
	test('reload uses merged settings without reimporting legacy changes', async () => {
		const { app } = fixture();
		app.vault.adapter = null;
		const raw = { schemaVersion: 1, spotlight: { sidebarWidth: 390 }, kanban: {}, custom: 'retain' };
		assert.deepEqual(await migratedPreferences(app, raw), raw);
		await assert.rejects(() => migratedPreferences(app, { schemaVersion: 9 }), /unsupported/);
	});
	test('concurrent board and editor saves keep both namespaces and unknown data', async () => {
		let written: any;
		const preferences = new SuitePreferences({ custom: 'keep' }, async (data) => {
			await tick();
			written = data;
		});
		await Promise.all([
			preferences.saveKanban({ boardLibrary: { paths: ['A.base'] } }),
			preferences.saveSpotlight({ sidebarWidth: 450 }),
			preferences.saveLibrary('cards', { boardLibrary: { paths: ['C.base'] } }),
		]);
		assert.equal(written.custom, 'keep');
		assert.equal(written.spotlight.sidebarWidth, 450);
		assert.deepEqual(written.kanban.boardLibrary.paths, ['A.base']);
		assert.deepEqual(written.viewLibraries.cards.boardLibrary.paths, ['C.base']);
	});
	test('a failed settings save does not poison subsequent writes', async () => {
		let fail = true;
		let written: any;
		const preferences = new SuitePreferences({}, async (data) => {
			if (fail) {
				fail = false;
				throw new Error('write failed');
			}
			written = data;
		});
		await assert.rejects(preferences.saveSpotlight({ sidebarWidth: 410 }), /write failed/);
		await preferences.saveKanban({ retained: true });
		assert.equal(written.spotlight.sidebarWidth, 410);
		assert.equal(written.kanban.retained, true);
	});
	test('registers all existing view types and one combined settings page', async () => {
		const { app } = fixture();
		const plugin: any = new BasesViewsEXPlugin(app, {
			id: 'bases-views-ex',
			name: 'Bases Views EX',
			author: 'Maru',
			version: '0.1.0',
			minAppVersion: '1.10.2',
			description: 'Test',
		});
		plugin.loadData = async (): Promise<null> => null;
		let saved: any;
		plugin.saveData = async (data: unknown) => {
			saved = data;
		};
		const registrations: Record<string, any> = {};
		const tabs: any[] = [];
		plugin.registerBasesView = (id: string, options: any) => {
			registrations[id] = options;
		};
		plugin.addSettingTab = (tab: any) => tabs.push(tab);
		await plugin.onload();
		assert.deepEqual(Object.keys(registrations).sort(), [
			'bases-spotlight-view-expanded',
			'kanban-view',
			'spotlight-ex-cards',
		]);
		assert.equal(registrations['kanban-view'].name, 'Kanban EX');
		assert.equal(tabs.length, 1);
		assert.equal(saved.schemaVersion, 1);
		await plugin.preferences.saveKanban({ boardLibrary: { paths: ['Gallery.base'] } });
		plugin.settings.sidebarWidth = 460;
		await plugin.saveSettings();
		assert.equal(saved.spotlight.sidebarWidth, 460);
		assert.deepEqual(saved.kanban.boardLibrary.paths, ['Gallery.base']);
		tabs[0].display();
		await tick();
		assert.deepEqual(
			Array.from(tabs[0].containerEl.querySelectorAll('.obk-settings-tabs button')).map(
				(button: any) => button.textContent,
			),
			['Kanban EX', 'Spotlight EX', 'Cards EX', 'Setup', 'Thanks & license'],
		);
		plugin.onunload();
	});
	test('view libraries list only their own layout and keep other Base content during changes', async () => {
		const value = fixture();
		const live = new LiveBoards(() => {});
		const store = new ViewOptionsStore(value.app, live, 'cards');
		assert.deepEqual((await store.inventory.catalog())[0].views, ['Gallery']);
		const other = structuredClone(value.read());
		await store.change(target, 'image', 'note.thumbnail');
		assert.equal(value.read().views[0].image, 'note.thumbnail');
		assert.deepEqual(value.read().views.slice(1), other.views.slice(1));
		assert.deepEqual(value.read().filters, other.filters);
		assert.deepEqual(value.read().formulas, other.formulas);
		await assert.rejects(store.read({ path: 'Gallery.base', viewName: 'Preview' }), /renamed|removed/);
	});
	test('layout tabs retain their independent selections across Setup and Thanks round trips', async () => {
		const value = fixture();
		const raw = {
			schemaVersion: 1,
			kanban: { boardLibrary: { paths: ['Gallery.base'], selected: { path: 'Gallery.base', viewName: 'Board' } } },
			spotlight: {},
			viewLibraries: {
				spotlight: { boardLibrary: { paths: ['Gallery.base'], selected: { path: 'Gallery.base', viewName: 'Preview' } } },
				cards: { boardLibrary: { paths: ['Gallery.base'], selected: target } },
			},
		};
		const plugin: any = new BasesViewsEXPlugin(value.app, {
			id: 'bases-views-ex',
			name: 'Bases Views EX',
			author: 'Maru',
			version: '0.1.0',
			minAppVersion: '1.10.2',
			description: 'Test',
		});
		plugin.loadData = async () => raw;
		plugin.saveData = async (_data: unknown): Promise<void> => {};
		let tab: any;
		plugin.addSettingTab = (next: any) => {
			tab = next;
		};
		await plugin.onload();
		tab.display();
		await tick();
		const choose = async (name: string) => {
			const button = Array.from(tab.containerEl.querySelectorAll('.obk-settings-tabs button')).find(
				(el: any) => el.textContent === name,
			) as HTMLButtonElement;
			button.click();
			await tick();
		};
		await choose('Cards EX');
		assert.equal(
			tab.containerEl.querySelector('[data-board-link][aria-pressed="true"]').getAttribute('data-board-link'),
			'[[Gallery.base#Gallery]]',
		);
		const image: HTMLInputElement = tab.containerEl.querySelector('[aria-label="Image property"]');
		image.value = 'alternate';
		image.dispatchEvent(new Event('change'));
		await tick();
		assert.equal(value.read().views[0].image, 'note.alternate');
		// Returning to the initial value must save too; a callback cannot capture the first model.
		image.value = 'cover';
		image.dispatchEvent(new Event('change'));
		await tick();
		assert.equal(value.read().views[0].image, 'note.cover');
		await choose('Setup');
		await choose('Cards EX');
		assert.equal(tab.containerEl.querySelector('[aria-label="Image property"]').value, 'cover');
		await choose('Spotlight EX');
		assert.equal(
			tab.containerEl.querySelector('[data-board-link][aria-pressed="true"]').getAttribute('data-board-link'),
			'[[Gallery.base#Preview]]',
		);
		await choose('Thanks & license');
		assert.ok(tab.containerEl.textContent.includes('2026 Brendan Early'));
		assert.ok(tab.containerEl.textContent.includes('2026 I. Welch Canavan'));
		await choose('Kanban EX');
		assert.equal(
			tab.containerEl.querySelector('[data-board-link][aria-pressed="true"]').getAttribute('data-board-link'),
			'[[Gallery.base#Board]]',
		);
		plugin.onunload();
	});
	test('view-option writes use the open Base configuration rather than overwrite a pending native save', async () => {
		const value = fixture();
		const notices: any[] = [];
		const live = new LiveBoards((target) => notices.push(target));
		const configValues: any = { cardSize: 300, image: 'note.pending' };
		const config: any = {
			name: 'Gallery',
			get: (key: string) => configValues[key],
			set: (key: string, value: unknown) => {
				configValues[key] = value;
			},
		};
		let refreshed = 0;
		live.add({
			controller: { query: { file: { path: 'Gallery.base' }, views: [config] } },
			getConfig: () => config,
			refresh: () => {
				refreshed++;
			},
		});
		const store = new ViewOptionsStore(value.app, live, 'cards');
		assert.equal((await store.read(target)).image, 'note.pending');
		await store.change(target, 'cardSize', 420);
		assert.equal(configValues.cardSize, 420);
		assert.equal(configValues.image, 'note.pending');
		assert.equal(value.processed(), 0);
		assert.equal(refreshed, 1);
		assert.equal(notices.length, 1);
	});
	test('clearing an option and rejecting invalid bounds preserves sibling views', async () => {
		const value = fixture();
		const store = new ViewOptionsStore(value.app, new LiveBoards(() => {}), 'cards');
		await store.change(target, 'image', '');
		assert.equal(value.read().views[0].image, undefined);
		const before = structuredClone(value.read());
		await assert.rejects(store.change(target, 'cardSize', 5), /between/);
		await assert.rejects(store.change(target, 'imageFit', 'bad'), /listed/);
		assert.deepEqual(value.read(), before);
	});
	test('unused custom rows are muted while Uncategorized and saved ordering remain available', () => {
		const parent = createDivWithMethods();
		const panel = new ColumnsPanel(createMockApp(), parent, async () => {});
		const source = {
			groupByProperty: 'note.status',
			columnMode: 'custom',
			statusLabels: 'A, B',
			columnOrders: { 'note.status:status': ['A', 'Uncategorized', 'B'] },
		};
		panel.render(readBoardModel(source), []);
		panel.render(readBoardModel({ ...source, columnMode: 'property' }), []);
		assert.equal(parent.querySelectorAll('.obk-settings-column.is-unused').length, 2);
		assert.equal(parent.querySelector('.obk-uncategorized-row')?.classList.contains('is-unused'), false);
		panel.render(readBoardModel(source), []);
		assert.equal(parent.querySelectorAll('.is-unused').length, 0);
		assert.deepEqual(
			Array.from(parent.querySelectorAll('[data-status-value]')).map((row) => row.getAttribute('data-status-value')),
			['A', 'Uncategorized', 'B'],
		);
		panel.close();
	});
});
