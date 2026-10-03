import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parse, stringify } from 'yaml';
import { BoardSettingsTab } from '../src/settings/settingsTab.ts';
import { BoardStore } from '../src/settings/boardStore.ts';
import { BoardPicker } from '../src/settings/boardPicker.ts';
import { resolveBoardReference } from '../src/settings/boardReferences.ts';
import { applyBoardChange, readBoardModel } from '../src/settings/boardConfig.ts';
import { LiveBoards, type LiveBoard } from '../src/settings/liveBoards.ts';
import { createDivWithMethods, createMockApp, createMockTFile } from './helpers.ts';
import { TFile } from './mocks/obsidian.ts';

const gallery = { path: 'Gallery.base', viewName: 'Kanban' };
const second = { ...gallery, viewName: 'Business board' };
const scope = 'note.currentStatus:status';
function fixture() {
	const file = Object.assign(new TFile(), createMockTFile(gallery.path));
	let content = stringify({
		views: [
			{
				type: 'kanban-view',
				name: gallery.viewName,
				groupByProperty: 'note.currentStatus',
				statusGrouping: true,
				statusLabels: 'Backlog, Active',
				statusMoveMode: 'source',
				columnOrders: { [scope]: ['Backlog', 'Active', 'Uncategorized'] },
			},
			{
				type: 'kanban-view',
				name: second.viewName,
				groupByProperty: 'note.currentStatus',
				statusGrouping: true,
				statusLabels: 'Ideas, Shipping',
				statusMoveMode: 'all',
			},
			{ type: 'table', name: 'Everything', limit: 5 },
		],
	});
	const app: any = createMockApp();
	app.vault.getFiles = () => [file];
	app.vault.getAbstractFileByPath = (path: string) => (path === file.path ? file : null);
	app.vault.read = async () => content;
	app.vault.process = async (_file: unknown, transform: (text: string) => string) => {
		content = transform(content);
	};
	return {
		app,
		file,
		read: (): any => parse(content),
		write: (value: unknown) => {
			content = stringify(value);
		},
	};
}
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const eventsSettled = () => new Promise<void>((resolve) => setTimeout(resolve, 220));
function choose(tab: BoardSettingsTab, target = gallery) {
	const button = Array.from(tab.containerEl.querySelectorAll<HTMLButtonElement>('[data-board-link]')).find(
		(el) => el.getAttribute('data-board-link') === `[[${target.path}#${target.viewName}]]`,
	);
	assert.ok(button, 'Board must be visible in the picker');
	button.click();
}
function liveFixture() {
	const saved = fixture();
	const document = saved.read();
	const configs = document.views.map((view: any) => ({
		name: view.name,
		get: (key: string) => view[key],
		set: (key: string, value: unknown) => {
			if (value == null) delete view[key];
			else view[key] = structuredClone(value);
		},
	}));
	const updates: unknown[] = [];
	const registry = new LiveBoards((target) => updates.push(target));
	const board: LiveBoard = {
		controller: { query: { file: saved.file, views: configs } } as any,
		getConfig: () => configs[0],
		refresh: () => {},
	};
	const remove = registry.add(board);
	return { ...saved, document, configs, board, registry, updates, remove, flush: () => saved.write(document) };
}

test('visibility changes use the open Base config, survive its delayed save, and remain view-specific', async () => {
	const saved = liveFixture();
	const store = new BoardStore(saved.app, saved.registry);
	const before = structuredClone(saved.document.views[0]);
	await store.change(gallery, { type: 'uncategorized', show: false });
	assert.equal(saved.configs[0].get('showUncategorized'), false);
	assert.equal(saved.configs[1].get('showUncategorized'), undefined);
	assert.deepEqual(saved.document.views[0], { ...before, showUncategorized: false });
	saved.flush();
	assert.equal(saved.read().views[0].showUncategorized, false);
	saved.configs[0].set('showUncategorized', true);
	saved.registry.notify(saved.board);
	assert.equal((await store.read(gallery)).showUncategorized, true);
	assert.equal((await store.read(second)).showUncategorized, true);
	saved.remove();
});

describe('Board discovery and editor lifecycle', () => {
	test('resolves Gallery links, optional extension and unique short paths without choosing ambiguous boards', () => {
		assert.deepEqual(resolveBoardReference([gallery, second], '[[Gallery.base#Kanban]]'), gallery);
		assert.deepEqual(resolveBoardReference([gallery], ' [[Gallery#kanban]] '), gallery);
		assert.deepEqual(resolveBoardReference([{ ...gallery, path: 'Projects/Gallery.base' }], '[[Gallery.base#Kanban]]'), {
			...gallery,
			path: 'Projects/Gallery.base',
		});
		assert.throws(
			() =>
				resolveBoardReference(
					[
						{ ...gallery, path: 'A/Gallery.base' },
						{ ...gallery, path: 'B/Gallery.base' },
					],
					'[[Gallery#Kanban]]',
				),
			/Several/,
		);
		assert.throws(() => resolveBoardReference([gallery], '[[Gallery#Gone]]'), /No matching/);
	});
	test('pasted Base/view links use Add; removing a library tab keeps the remaining catalog current', () => {
		const selected: unknown[] = [];
		const container = createDivWithMethods();
		const picker: any = new BoardPicker(
			createMockApp(),
			container,
			(target) => selected.push(target),
			() => {},
		);
		picker.update([{ path: gallery.path, views: [gallery.viewName, second.viewName] }]);
		const input = container.querySelector('input')!;
		input.value = '[[Gallery.base#Kanban]]';
		const add = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Add')!;
		add.click();
		assert.deepEqual(selected[selected.length - 1], gallery);
		picker.suggest.selectSuggestion(
			{ path: gallery.path, views: [gallery.viewName, second.viewName] },
			new window.KeyboardEvent('keydown', { key: 'Enter' }),
		);
		assert.equal(input.value, '[[Gallery.base]]');
		assert.equal(container.querySelectorAll('[data-board-link]').length, 2);
		(container.querySelector('.obk-base-remove') as HTMLButtonElement).click();
		assert.equal(selected[selected.length - 1], null);
		picker.update([{ path: gallery.path, views: [gallery.viewName] }]);
		assert.equal(picker.suggest.getSuggestions('Business').length, 0);
		picker.close();
	});
	test('can repair an already enabled but incomplete board without disabling it first', () => {
		const view: any = { statusGrouping: true, statusLabels: '', cardTitleProperty: 'note.currentStatus' };
		applyBoardChange(view, { type: 'property', property: 'currentStatus' });
		applyBoardChange(view, { type: 'add', value: 'Queue' });
		assert.equal(readBoardModel(view).property, 'note.currentStatus');
		assert.equal(readBoardModel(view).columns[0].value, 'Queue');
	});
	test('editing configured columns preserves the board’s Uncategorized color', () => {
		const view: any = {
			groupByProperty: 'note.currentStatus',
			statusLabels: 'Queue',
			columnColors: { [scope]: { Queue: 'blue', Uncategorized: '#112233' } },
		};
		applyBoardChange(view, { type: 'name', value: 'Queue', name: 'Ideas' });
		applyBoardChange(view, { type: 'color', value: 'Queue', color: '#abcdef' });
		assert.deepEqual(view.columnColors[scope], { Queue: '#abcdef', Uncategorized: '#112233' });
	});
	test('switching between two boards keeps names, values and move behavior separate', async () => {
		const saved = fixture();
		const tab: any = new BoardSettingsTab(saved.app, {} as any);
		tab.display();
		await settle();
		choose(tab);
		await settle();
		await tab.change({ type: 'name', value: 'Backlog', name: 'My ideas' });
		choose(tab, second);
		await settle();
		assert.deepEqual(
			tab.model.columns.map((c: any) => c.value),
			['Ideas', 'Shipping'],
		);
		assert.equal(tab.model.moveMode, 'all');
		choose(tab);
		await settle();
		assert.equal(tab.model.columns[0].name, 'My ideas');
		assert.equal(tab.model.moveMode, 'source');
		tab.hide();
	});
	test('removing a selected view clears its editor and updates suggestions; re-adding it refreshes the list', async () => {
		const saved = fixture();
		const tab: any = new BoardSettingsTab(saved.app, {} as any);
		tab.display();
		await settle();
		choose(tab);
		await settle();
		const document = saved.read();
		document.views = document.views.filter((v: any) => v.name !== gallery.viewName);
		saved.write(document);
		tab.onVaultChanged(saved.file, 'modify');
		await eventsSettled();
		assert.equal(tab.selected, null);
		assert.equal(tab.model, null);
		assert.equal(tab.containerEl.querySelectorAll('[data-board-link]').length, 1);
		assert.equal(tab.containerEl.querySelector('.obk-settings-board-panel input'), null);
		document.views.push({ type: 'kanban-view', name: 'New board' });
		saved.write(document);
		tab.onVaultChanged(saved.file, 'modify');
		await eventsSettled();
		assert.equal(tab.containerEl.querySelectorAll('[data-board-link]').length, 2);
		tab.hide();
	});
	test('renaming a Base follows its new path and deleting it immediately clears selection', async () => {
		const saved = fixture();
		const tab: any = new BoardSettingsTab(saved.app, {} as any);
		tab.display();
		await settle();
		choose(tab);
		await settle();
		saved.file.path = 'Boards/Renamed.base';
		tab.onVaultChanged(saved.file, 'rename', gallery.path);
		await eventsSettled();
		assert.equal(tab.selected.path, saved.file.path);
		assert.match(
			tab.containerEl.querySelector('[data-board-link][aria-pressed="true"]').getAttribute('data-board-link'),
			/Renamed/,
		);
		saved.app.vault.getFiles = (): unknown[] => [];
		saved.app.vault.getAbstractFileByPath = (): null => null;
		tab.onVaultChanged(saved.file, 'delete');
		assert.equal(tab.selected, null);
		assert.equal(tab.model, null);
		await eventsSettled();
		assert.equal(tab.containerEl.querySelectorAll('[data-board-link]').length, 0);
		tab.hide();
	});
	test('folder renames and deletions refresh the board catalog even without a selection', async () => {
		const saved = fixture();
		saved.file.path = 'Boards/Gallery.base';
		const tab: any = new BoardSettingsTab(saved.app, {} as any);
		tab.display();
		await settle();
		saved.file.path = 'Renamed/Gallery.base';
		tab.onVaultChanged({ path: 'Renamed' }, 'rename', 'Boards');
		await eventsSettled();
		assert.match(tab.containerEl.querySelector('[data-board-link]').getAttribute('data-board-link'), /Renamed/);
		saved.app.vault.getFiles = (): unknown[] => [];
		tab.onVaultChanged({ path: 'Renamed' }, 'delete');
		await eventsSettled();
		assert.equal(tab.containerEl.querySelectorAll('[data-board-link]').length, 0);
		tab.hide();
	});
});

describe('Live Base configuration synchronization', () => {
	test('edits an open board through its config so a delayed native save retains the edits', async () => {
		const live = liveFixture();
		const store = new BoardStore(live.app, live.registry);
		let directWrites = 0;
		live.app.vault.process = async () => {
			directWrites++;
		};
		live.configs[0].set('statusMoveMode', 'all'); // a native menu edit not saved to disk yet
		await store.change(gallery, { type: 'name', value: 'Backlog', name: 'Ideas' });
		await store.change(gallery, { type: 'color', value: 'Backlog', color: '#112233' });
		await store.change(gallery, { type: 'order', values: ['Active', 'Backlog'] });
		assert.equal(directWrites, 0);
		assert.equal((await store.read(gallery)).moveMode, 'all');
		live.flush();
		const reopened = readBoardModel(live.read().views[0]);
		assert.deepEqual(reopened.columns[1], { value: 'Backlog', name: 'Ideas', color: '#112233' });
		assert.equal(reopened.moveMode, 'all');
		live.remove();
	});
	test('hidden sibling boards use the same open query and keep their independent settings after its pending save', async () => {
		const live = liveFixture();
		const store = new BoardStore(live.app, live.registry);
		await store.change(second, { type: 'name', value: 'Ideas', name: 'Business ideas' });
		await store.change(second, { type: 'move-mode', mode: 'source' });
		live.flush();
		assert.equal(readBoardModel(live.read().views[1]).columns[0].name, 'Business ideas');
		assert.equal(readBoardModel(live.read().views[1]).moveMode, 'source');
		assert.equal(readBoardModel(live.read().views[0]).columns[0].name, 'Backlog');
		assert.equal(live.read().views[2].limit, 5);
		live.remove();
	});
	test('native label and move changes refresh the settings editor before the delayed file save', async () => {
		const live = liveFixture();
		const tab: any = new BoardSettingsTab(live.app, {} as any, live.registry);
		tab.display();
		await settle();
		choose(tab);
		await settle();
		live.configs[0].set('statusLabels', 'Backlog, Shipping');
		live.configs[0].set('statusMoveMode', 'all');
		live.registry.notify(live.board);
		assert.equal(live.updates.length, 1);
		tab.onLiveBoardChanged(gallery);
		await eventsSettled();
		assert.deepEqual(
			tab.model.columns.map((c: any) => c.value),
			['Backlog', 'Shipping'],
		);
		assert.equal(tab.model.moveMode, 'all');
		assert.equal(live.read().views[0].statusLabels, 'Backlog, Active');
		live.registry.notify(live.board);
		assert.equal(live.updates.length, 1);
		tab.hide();
		live.remove();
	});
	test('falls back to file updates when owner metadata is unavailable and refuses deleted targets', async () => {
		const saved = fixture();
		const registry = new LiveBoards(() => {});
		registry.add({ controller: {} as any, getConfig: () => null, refresh: () => {} });
		const store = new BoardStore(saved.app, registry);
		await store.change(gallery, { type: 'move-mode', mode: 'all' });
		assert.equal(saved.read().views[0].statusMoveMode, 'all');
		saved.app.vault.getAbstractFileByPath = (): null => null;
		await assert.rejects(store.change(gallery, { type: 'move-mode', mode: 'source' }), /no longer exists/);
	});
	test('uses the open Base query even when its active layout is Table or Cards', async () => {
		const live = liveFixture();
		live.remove();
		const registry = new LiveBoards(
			() => {},
			() => [{ controller: live.board.controller }],
		);
		live.configs[0].set('quickAddFolder', 'Keep this native setting');
		const store = new BoardStore(live.app, registry);
		await store.change(gallery, { type: 'color', value: 'Active', color: '#abcdef' });
		live.flush();
		assert.equal(readBoardModel(live.read().views[0]).columns[1].color, '#abcdef');
		assert.equal(live.read().views[0].quickAddFolder, 'Keep this native setting');
	});
});
