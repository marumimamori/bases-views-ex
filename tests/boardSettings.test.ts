import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { stringify as dump, parse as load } from 'yaml';
import { applyBoardChange, boardLink, findBoardView, readBoardModel } from '../src/settings/boardConfig.ts';
import { BoardStore } from '../src/settings/boardStore.ts';
import { BoardSuggest } from '../src/settings/suggestions.ts';
import { BoardSettingsTab } from '../src/settings/settingsTab.ts';
import { ColumnsPanel } from '../src/settings/columnsPanel.ts';
import { MIT_LICENSE } from '../src/settings/license.ts';
import { SWIMLANE_KEY_SEPARATOR } from '../src/constants.ts';
import { createDivWithMethods, createMockApp, createMockTFile } from './helpers.ts';
import { TFile } from './mocks/obsidian.ts';

const target = { path: 'Projects/Ata Base.base', viewName: 'Kanban' };
const key = 'note.currentStatus:status';
function base() {
	return {
		filters: { and: ['file.inFolder("Projects")'] },
		formulas: { boardStatus: 'if(currentStatus.contains("Backlog"), "Backlog", "Active")' },
		properties: { 'note.currentStatus': { displayName: 'Current status' } },
		views: [
			{ type: 'table', name: 'Everything', order: ['file.name'], limit: 10 },
			{
				type: 'kanban-view',
				name: 'Kanban',
				groupByProperty: 'note.currentStatus',
				statusGrouping: true,
				statusLabels: '["Backlog","Active","Done"]',
				columnOrders: { [key]: ['Backlog', 'Active', 'Done', 'Uncategorized'] },
				columnColors: { [key]: { Backlog: 'blue' } },
				cardOrders: { [key]: { Backlog: ['a.md', 'b.md'] } },
				customSetting: 'keep',
			},
			{ type: 'kanban-view', name: 'Other board', groupByProperty: 'note.priority' },
		],
	};
}

describe('Board settings configuration', () => {
	test('Uncategorized visibility defaults on and changing it preserves all other configuration', () => {
		const view = findBoardView(base(), target);
		const before = structuredClone(view);
		assert.equal(readBoardModel(view).showUncategorized, true);
		applyBoardChange(view, { type: 'uncategorized', show: false });
		assert.equal(readBoardModel(view).showUncategorized, false);
		assert.deepEqual(view, { ...before, showUncategorized: false });
		applyBoardChange(view, { type: 'uncategorized', show: true });
		assert.deepEqual(view, { ...before, showUncategorized: true });
	});
	test('updates only the chosen view in a realistic YAML Base', () => {
		const document: any = load(dump(base()));
		const unchanged = structuredClone(document);
		const view = findBoardView(document, target);
		applyBoardChange(view, { type: 'color', value: 'Backlog', color: '#336699' });
		const reopened: any = load(dump(document));
		assert.deepEqual(reopened.filters, unchanged.filters);
		assert.deepEqual(reopened.formulas, unchanged.formulas);
		assert.deepEqual(reopened.properties, unchanged.properties);
		assert.deepEqual(reopened.views[0], unchanged.views[0]);
		assert.deepEqual(reopened.views[2], unchanged.views[2]);
		assert.equal(reopened.views[1].customSetting, 'keep');
		assert.deepEqual(reopened.views[1].cardOrders, unchanged.views[1].cardOrders);
		assert.equal(readBoardModel(reopened.views[1]).columns[0].color, '#336699');
	});
	test('names are independent from matching values and order survives reload', () => {
		const view = findBoardView(base(), target);
		applyBoardChange(view, { type: 'name', value: 'Backlog', name: 'Ideas' });
		applyBoardChange(view, { type: 'order', values: ['Done', 'Backlog', 'Active'] });
		const model = readBoardModel(view);
		assert.deepEqual(
			model.columns.map((column) => column.value),
			['Done', 'Backlog', 'Active'],
		);
		assert.deepEqual(model.columns[1], { value: 'Backlog', name: 'Ideas', color: 'blue' });
	});
	test('editing a value keeps its name, color and card order in columns and swimlanes', () => {
		const view: any = findBoardView(base(), target);
		view.cardOrders[`${key}${SWIMLANE_KEY_SEPARATOR}note.priority`] = {
			[`High${SWIMLANE_KEY_SEPARATOR}Backlog`]: ['c.md'],
		};
		applyBoardChange(view, { type: 'name', value: 'Backlog', name: 'Ideas' });
		applyBoardChange(view, { type: 'value', value: 'Backlog', next: 'Queue' });
		assert.deepEqual(readBoardModel(view).columns[0], { value: 'Queue', name: 'Ideas', color: 'blue' });
		assert.deepEqual(view.cardOrders[key].Queue, ['a.md', 'b.md']);
		assert.deepEqual(
			view.cardOrders[`${key}${SWIMLANE_KEY_SEPARATOR}note.priority`][`High${SWIMLANE_KEY_SEPARATOR}Queue`],
			['c.md'],
		);
	});
	test('supports arbitrary labels and rejects duplicate or incomplete reorder requests', () => {
		const view = findBoardView(base(), target);
		applyBoardChange(view, { type: 'add', value: 'Shipping, review' });
		assert.equal(readBoardModel(view).columns[3].value, 'Shipping, review');
		assert.throws(() => applyBoardChange(view, { type: 'add', value: 'Backlog' }), /already/);
		assert.throws(() => applyBoardChange(view, { type: 'order', values: ['Backlog'] }), /changed/);
		assert.throws(
			() => applyBoardChange(view, { type: 'color', value: 'Backlog', color: 'url(https://example.com)' }),
			/color/,
		);
	});
	test('removing a column leaves the other column settings intact', () => {
		const view: any = findBoardView(base(), target);
		applyBoardChange(view, { type: 'remove', value: 'Backlog' });
		assert.deepEqual(
			readBoardModel(view).columns.map((column) => column.value),
			['Active', 'Done'],
		);
		assert.equal(view.cardOrders[key].Backlog, undefined);
	});
	test('missing, ambiguous and formula targets cannot enable writing', () => {
		assert.throws(() => findBoardView(base(), { ...target, viewName: 'Gone' }), /renamed/);
		const duplicate = base();
		duplicate.views.push({ ...duplicate.views[1] });
		assert.throws(() => findBoardView(duplicate, target), /duplicate/);
		const view: any = {
			type: 'kanban-view',
			name: 'Kanban',
			groupByProperty: 'formula.boardStatus',
			statusLabels: '["Backlog"]',
		};
		assert.throws(() => applyBoardChange(view, { type: 'enabled', enabled: true }), /note property/);
		applyBoardChange(view, { type: 'property', property: 'currentStatus' });
		applyBoardChange(view, { type: 'enabled', enabled: true });
		assert.equal(view.groupByProperty, 'note.currentStatus');
	});
});

function storeFixture() {
	const file = Object.assign(new TFile(), createMockTFile(target.path));
	let content = dump(base());
	const app: any = createMockApp();
	app.vault.getFiles = () => [file];
	app.vault.getAbstractFileByPath = (path: string) => (path === file.path ? file : null);
	app.vault.read = async () => content;
	app.vault.process = async (_file: unknown, processor: (text: string) => string) => {
		content = processor(content);
	};
	return {
		app,
		file,
		store: new BoardStore(app),
		read: () => load(content) as any,
		write: (value: unknown) => {
			content = dump(value);
		},
	};
}

describe('Board settings store and controls', () => {
	test('lists view subcategories and accepts the full Base/view reference in suggestions', async () => {
		const fixture = storeFixture();
		const boards = await fixture.store.list();
		assert.deepEqual(boards, [target, { ...target, viewName: 'Other board' }]);
		const suggest = new BoardSuggest(fixture.app, document.createElement('input'), boards);
		assert.deepEqual(suggest.getSuggestions('[[Ata Base#Kanban]]'), [target]);
		assert.equal(boardLink(target), '[[Projects/Ata Base.base#Kanban]]');
	});
	test('serializes independent edits without losing a concurrent color, name or order update', async () => {
		const fixture = storeFixture();
		await Promise.all([
			fixture.store.change(target, { type: 'name', value: 'Backlog', name: 'Ideas' }),
			fixture.store.change(target, { type: 'color', value: 'Backlog', color: 'purple' }),
			fixture.store.change(target, { type: 'order', values: ['Done', 'Backlog', 'Active'] }),
		]);
		const model = await fixture.store.read(target);
		assert.deepEqual(model.columns[1], { value: 'Backlog', name: 'Ideas', color: 'purple' });
		assert.equal(fixture.read().views[0].name, 'Everything');
	});
	test('an invalid edit cannot change the saved Base or block a later valid edit', async () => {
		const fixture = storeFixture();
		const before = fixture.read();
		await assert.rejects(fixture.store.change(target, { type: 'add', value: 'Backlog' }));
		assert.deepEqual(fixture.read(), before);
		await fixture.store.change(target, { type: 'color', value: 'Done', color: '#336699' });
		assert.equal((await fixture.store.read(target)).columns[2].color, '#336699');
	});
	test('column controls dispatch order changes and keep values separate from names', async () => {
		const fixture = storeFixture();
		const container = createDivWithMethods();
		const changes: unknown[] = [];
		const panel = new ColumnsPanel(fixture.app, container, async (change) => {
			changes.push(change);
		});
		panel.render(await fixture.store.read(target), ['Backlog', 'Active', 'Done', 'Business']);
		assert.equal(container.querySelector('[aria-label="Move Backlog down"]'), null);
		const list = container.querySelector('.obk-settings-columns')!;
		list.insertBefore(list.children[1], list.children[0]);
		(panel as any).sortable.options.onEnd();
		assert.deepEqual(changes[0], { type: 'order', values: ['Active', 'Backlog', 'Done', 'Uncategorized'] });
		const name = container.querySelector('[aria-label="Display name for Backlog"]') as HTMLInputElement;
		name.value = 'Ideas';
		name.dispatchEvent(new window.Event('change'));
		await new Promise<void>((resolve) => setImmediate(resolve));
		assert.deepEqual(changes[1], { type: 'name', value: 'Backlog', name: 'Ideas' });
		panel.close();
	});
	test('Thanks tab includes the complete MIT license and original project link', () => {
		const fixture = storeFixture();
		const tab: any = new BoardSettingsTab(fixture.app, {} as any);
		tab.tab = 'thanks';
		tab.display();
		assert.equal(tab.containerEl.querySelector('.obk-license').textContent, MIT_LICENSE);
		assert.equal(tab.containerEl.querySelector('a').href, 'https://github.com/xiwcx/obsidian-bases-kanban');
		tab.hide();
	});
	test('selecting a suggested column value saves once without requiring another keystroke', async () => {
		const fixture = storeFixture();
		const container = createDivWithMethods();
		const changes: unknown[] = [];
		const panel = new ColumnsPanel(fixture.app, container, async (change) => {
			changes.push(change);
		});
		panel.render(await fixture.store.read(target), ['Backlog', 'Queue']);
		const suggestion = (panel as any).suggestions[0];
		suggestion.selectSuggestion('Queue', new window.KeyboardEvent('keydown', { key: 'Enter' }));
		const input = container.querySelector('[aria-label="Match value for Backlog"]') as HTMLInputElement;
		input.dispatchEvent(new window.Event('change'));
		await new Promise<void>((resolve) => setImmediate(resolve));
		assert.equal(input.value, 'Queue');
		assert.deepEqual(changes, [{ type: 'value', value: 'Backlog', next: 'Queue' }]);
		panel.close();
	});
});
