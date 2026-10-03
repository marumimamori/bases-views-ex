import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ListValue, StringValue } from './mocks/obsidian.ts';
import { applyBoardChange, readBoardModel } from '../src/settings/boardConfig.ts';
import { ColumnsPanel } from '../src/settings/columnsPanel.ts';
import { positionUncategorized } from '../src/utils/uncategorized.ts';
import { getColumnValue } from '../src/utils/columnMode.ts';
import { KanbanView } from '../src/kanbanView.ts';
import {
	createDivWithMethods,
	createMockApp,
	createMockBasesEntry,
	createMockQueryController,
	createMockTFile,
	triggerDataUpdate,
} from './helpers.ts';

const key = 'note.status:status';
const status = 'note.status' as const;
function config() {
	return {
		groupByProperty: status,
		columnMode: 'custom',
		statusLabels: 'Backlog, Active',
		columnOrders: { [key]: ['Backlog', 'Uncategorized', 'Active'] },
	} as Record<string, any>;
}
function board(mode: string, extra: Record<string, unknown> = {}) {
	const app = createMockApp();
	const controller: any = createMockQueryController(
		[createMockBasesEntry(createMockTFile('A.md'), { [status]: 'Business' })],
		[status],
	);
	Object.entries({ ...config(), columnMode: mode, ...extra }).forEach(([key, value]) =>
		controller.config.set(key, value),
	);
	controller.config.getAsPropertyId = (key: string) => controller.config.get(key);
	const view = new KanbanView(controller, createDivWithMethods());
	view.app = app;
	triggerDataUpdate(view);
	return { controller, view };
}
const values = (root: HTMLElement) =>
	Array.from(root.querySelectorAll('.obk-column')).map((el) => el.getAttribute('data-column-value'));

describe('Permanent Uncategorized column', () => {
	test('only explicit false values form false columns; missing text goes to Uncategorized', () => {
		assert.equal(getColumnValue(undefined, [], 'property'), 'Uncategorized');
		assert.equal(getColumnValue(null, [], 'property'), 'Uncategorized');
		assert.equal(getColumnValue(false, [], 'property'), 'false');
	});
	test('positions deduplicate fallback and preserve the exact slot with no snap', () => {
		assert.deepEqual(positionUncategorized(['A', 'Uncategorized', 'B', 'Uncategorized'], 'none'), [
			'A',
			'Uncategorized',
			'B',
		]);
		assert.deepEqual(positionUncategorized(['A', 'Uncategorized', 'B'], 'first'), ['Uncategorized', 'A', 'B']);
		assert.deepEqual(positionUncategorized(['A', 'Uncategorized', 'B'], 'last'), ['A', 'B', 'Uncategorized']);
	});
	test('value and delete edits reject the fallback without altering saved configuration', () => {
		const view = config();
		const before = structuredClone(view);
		assert.throws(() => applyBoardChange(view, { type: 'remove', value: 'Uncategorized' }), /permanent/);
		assert.throws(() => applyBoardChange(view, { type: 'value', value: 'Uncategorized', next: 'Missing' }), /permanent/);
		assert.deepEqual(view, before);
	});
	test('settings dragging repositions fallback, and no snap keeps its place when adding values', () => {
		const view = config();
		applyBoardChange(view, { type: 'order', values: ['Uncategorized', 'Active', 'Backlog'] });
		applyBoardChange(view, { type: 'add', value: 'Done' });
		assert.deepEqual(view.columnOrders[key], ['Uncategorized', 'Active', 'Backlog', 'Done']);
		assert.deepEqual(readBoardModel(view).columnOrder, view.columnOrders[key]);
		assert.deepEqual(JSON.parse(view.statusLabels), ['Active', 'Backlog', 'Done']);
	});
	test('always last overrides dragging and immediately moves after newly added columns', () => {
		const view = config();
		applyBoardChange(view, { type: 'uncategorized-position', position: 'last' });
		applyBoardChange(view, { type: 'order', values: ['Uncategorized', 'Active', 'Backlog'] });
		applyBoardChange(view, { type: 'add', value: 'Done' });
		assert.deepEqual(view.columnOrders[key], ['Active', 'Backlog', 'Done', 'Uncategorized']);
		assert.deepEqual(readBoardModel(view).columnOrder, view.columnOrders[key]);
	});
	test('always first syncs ordinary and custom scopes while preserving other properties', () => {
		const view = config();
		view.columnOrders[status] = ['Business', 'Content', 'Uncategorized'];
		view.columnOrders['note.priority'] = ['Low', 'High'];
		applyBoardChange(view, { type: 'uncategorized-position', position: 'first' });
		assert.equal(view.columnOrders[key][0], 'Uncategorized');
		assert.equal(view.columnOrders[status][0], 'Uncategorized');
		assert.deepEqual(view.columnOrders['note.priority'], ['Low', 'High']);
		applyBoardChange(view, { type: 'add', value: 'Done' });
		assert.equal(readBoardModel(view).columnOrder[0], 'Uncategorized');
	});
	test('fallback color and display name remain editable and shared across modes', () => {
		const view = config();
		applyBoardChange(view, { type: 'color', value: 'Uncategorized', color: '#123456' });
		applyBoardChange(view, { type: 'name', value: 'Uncategorized', name: 'No status' });
		assert.equal(readBoardModel(view).uncategorized.name, 'No status');
		assert.equal(view.columnColors[status].Uncategorized, '#123456');
		applyBoardChange(view, { type: 'column-mode', mode: 'property' });
		assert.equal(readBoardModel(view).uncategorized.color, '#123456');
		applyBoardChange(view, { type: 'color', value: 'Uncategorized', color: '' });
		assert.equal(view.columnColors[key].Uncategorized, undefined);
		assert.equal(view.columnColors[status].Uncategorized, undefined);
	});
	test('clearing the fallback color in the ordinary view reflects its actual active scope', () => {
		const view = config();
		view.columnMode = 'property';
		view.columnColors = { [key]: { Uncategorized: 'red' }, [status]: {} };
		assert.equal(readBoardModel(view).uncategorized.color, '');
	});
	test('the settings fallback is read-only, has no delete button and stays present when hidden', () => {
		const app = createMockApp();
		const container = createDivWithMethods();
		const panel = new ColumnsPanel(app, container, async () => {});
		const view = config();
		view.showUncategorized = false;
		panel.render(readBoardModel(view), []);
		const row = container.querySelector('[data-status-value="Uncategorized"]')!;
		assert.equal(row.querySelector<HTMLInputElement>('[aria-label="Uncategorized value"]')!.readOnly, true);
		assert.equal(row.querySelector('.obk-column-remove'), null);
		assert.equal(row.querySelector<HTMLInputElement>('[aria-label="Show Uncategorized"]')!.checked, false);
		assert.equal(row.querySelectorAll('[aria-label="Uncategorized position"] option').length, 3);
		assert.deepEqual(
			Array.from(container.querySelectorAll('[data-status-value]')).map((el) => el.getAttribute('data-status-value')),
			['Backlog', 'Uncategorized', 'Active'],
		);
		panel.close();
	});
	test('view menu exposes the snap choice and Card Moves before Group by', () => {
		const options = KanbanView.getViewOptions() as any[];
		assert.equal(options[0].displayName, 'Card Moves');
		assert.equal(options[1].key, 'groupByProperty');
		assert.deepEqual(Object.keys(options.find((option) => option.key === 'uncategorizedPosition').options), [
			'none',
			'first',
			'last',
		]);
	});
	for (const mode of ['custom', 'combined', 'property']) {
		test(`view snapping survives new values and drag attempts in ${mode} mode`, () => {
			const saved = board(mode, { uncategorizedPosition: 'last' });
			assert.equal(values(saved.view.containerEl).slice(-1)[0], 'Uncategorized');
			saved.controller.config.set('statusLabels', 'Backlog, Active, Done');
			saved.controller.data.data.push(createMockBasesEntry(createMockTFile('B.md'), { [status]: 'Other' }));
			triggerDataUpdate(saved.view);
			assert.equal(values(saved.view.containerEl).slice(-1)[0], 'Uncategorized');
			const boardEl = saved.view.containerEl.querySelector('.obk-board')!;
			boardEl.insertBefore(boardEl.lastElementChild!, boardEl.firstElementChild);
			(saved.view as any).handleSwimlaneColumnDrop({ to: boardEl });
			assert.equal(values(saved.view.containerEl).slice(-1)[0], 'Uncategorized');
			saved.controller.config.set('uncategorizedPosition', 'first');
			triggerDataUpdate(saved.view);
			assert.equal(values(saved.view.containerEl)[0], 'Uncategorized');
			assert.equal(saved.view.containerEl.querySelector('[aria-label="Remove column: Uncategorized"]'), null);
			saved.view.onClose();
		});
	}
	test('native drag with no snap preserves the position through new automatic values and swimlanes', () => {
		const saved = board('combined', { swimlaneByProperty: 'note.priority', uncategorizedPosition: 'none' });
		const boardEl = saved.view.containerEl.querySelector('.obk-swimlane-body')!;
		const fallback = Array.from(boardEl.children).find((el) => el.getAttribute('data-column-value') === 'Uncategorized');
		assert.ok(fallback);
		boardEl.insertBefore(fallback, boardEl.firstElementChild);
		(saved.view as any).handleSwimlaneColumnDrop({ to: boardEl });
		const before = saved.controller.config.get('columnOrders')[key];
		assert.equal(before[0], 'Uncategorized');
		const entry = createMockBasesEntry(createMockTFile('New.md'));
		entry.getValue = ((property: string) =>
			property === status ? new ListValue([new StringValue('New')]) : new StringValue('High')) as any;
		saved.controller.data.data.push(entry);
		triggerDataUpdate(saved.view);
		assert.equal(saved.controller.config.get('columnOrders')[key][0], 'Uncategorized');
		assert.ok(saved.controller.config.get('columnOrders')[key].includes('New'));
		saved.view.onClose();
	});
});
