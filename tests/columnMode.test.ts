import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ListValue, StringValue } from './mocks/obsidian.ts';
import {
	columnDestinationValue,
	createColumnValue,
	getColumnValue,
	mergeVisibleOrder,
	readColumnMode,
	updateColumnValue,
} from '../src/utils/columnMode.ts';
import { applyBoardChange, readBoardModel } from '../src/settings/boardConfig.ts';

const labels = ['Backlog', 'Active'];
describe('Custom column modes', () => {
	test('migrates the previous toggle and respects explicit modes', () => {
		assert.equal(readColumnMode(undefined, true), 'custom');
		assert.equal(readColumnMode(undefined, false), 'property');
		assert.equal(readColumnMode('combined', false), 'combined');
		assert.equal(readColumnMode('property', true), 'property');
	});
	test('combined mode prioritizes custom matches and exposes unmatched whole values', () => {
		assert.equal(getColumnValue(['Content', 'Active', 'Backlog'], labels, 'combined'), 'Backlog');
		assert.equal(getColumnValue(['Content', 'Business'], labels, 'combined'), 'Content, Business');
		assert.equal(getColumnValue('customTextProperty', labels, 'combined'), 'customTextProperty');
		assert.equal(getColumnValue(undefined, labels, 'combined'), 'Uncategorized');
		assert.equal(getColumnValue(new ListValue([new StringValue('Business')]), [], 'combined'), 'Business');
	});
	test('only custom hides unmatched values while only other ignores the custom list', () => {
		assert.equal(getColumnValue(['Business'], labels, 'custom'), 'Uncategorized');
		assert.equal(getColumnValue(['Business', 'Backlog'], labels, 'property'), 'Business, Backlog');
	});
	test('automatic to custom moves and template creation preserve category labels', () => {
		assert.deepEqual(
			updateColumnValue(['Business', 'Content'], 'Business, Content', 'Active', labels, 'combined', 'source'),
			['Business', 'Content', 'Active'],
		);
		assert.deepEqual(createColumnValue(['Content', 'Backlog'], 'Active', labels, 'combined', 'source'), [
			'Content',
			'Active',
		]);
	});
	test('custom to its category column removes only the source status', () => {
		assert.deepEqual(updateColumnValue(['Business', 'Backlog'], 'Backlog', 'Business', labels, 'combined', 'source'), [
			'Business',
		]);
		assert.throws(
			() => updateColumnValue(['Business', 'Backlog'], 'Backlog', 'Content', labels, 'combined', 'source'),
			/other labels/,
		);
		assert.throws(
			() => updateColumnValue(['Content', 'Active'], 'Backlog', 'Content', labels, 'combined', 'source'),
			/changed/,
		);
	});
	test('automatic destinations preserve list items that contain commas', () => {
		const destination = new ListValue([new StringValue('Content, business'), new StringValue('Minecraft')]);
		const raw = columnDestinationValue(destination);
		assert.deepEqual(raw, ['Content, business', 'Minecraft']);
		assert.deepEqual(
			updateColumnValue(['Business'], 'Business', 'Content, business, Minecraft', labels, 'combined', 'source', raw),
			raw,
		);
		assert.deepEqual(
			createColumnValue(undefined, 'Content, business, Minecraft', labels, 'combined', 'source', raw),
			raw,
		);
	});
	test('clearing an automatic column preserves list type', () => {
		assert.deepEqual(updateColumnValue(['Business'], 'Business', 'Uncategorized', labels, 'combined', 'source'), []);
		assert.equal(updateColumnValue('Business', 'Business', 'Uncategorized', labels, 'combined', 'source'), undefined);
	});
	test('reordering visible columns retains all hidden positions', () => {
		assert.deepEqual(
			mergeVisibleOrder(['Backlog', 'Business', 'Uncategorized', 'Active', 'Content'], ['Active', 'Backlog']),
			['Active', 'Business', 'Uncategorized', 'Backlog', 'Content'],
		);
	});
	test('mode round trips and column edits preserve mixed ordering, colors and other views', () => {
		const view: Record<string, any> = {
			groupByProperty: 'note.status',
			statusGrouping: true,
			statusLabels: 'Backlog, Active',
			columnOrders: { 'note.status:status': ['Backlog', 'Business', 'Uncategorized', 'Active'] },
			columnColors: { 'note.status:status': { Backlog: 'red', Business: 'blue', Uncategorized: 'green' } },
			cardOrders: { 'note.status:status': { Business: ['a.md'] } },
			custom: 'keep',
		};
		for (const mode of ['combined', 'property', 'custom'] as const) {
			applyBoardChange(view, { type: 'column-mode', mode });
			assert.equal(readBoardModel(view).columnMode, mode);
			assert.deepEqual(view.columnOrders['note.status:status'], ['Backlog', 'Business', 'Uncategorized', 'Active']);
			assert.equal(view.columnColors['note.status:status'].Business, 'blue');
			assert.deepEqual(view.cardOrders['note.status:status'].Business, ['a.md']);
		}
		applyBoardChange(view, { type: 'order', values: ['Active', 'Backlog'] });
		assert.deepEqual(view.columnOrders['note.status:status'], ['Active', 'Business', 'Uncategorized', 'Backlog']);
		applyBoardChange(view, { type: 'value', value: 'Active', next: 'Doing' });
		assert.deepEqual(view.columnOrders['note.status:status'], ['Doing', 'Business', 'Uncategorized', 'Backlog']);
		assert.equal(view.custom, 'keep');
	});
	test('combined mode accepts an empty custom list, and custom-only still requires setup', () => {
		const view = { groupByProperty: 'note.status' };
		applyBoardChange(view, { type: 'column-mode', mode: 'combined' });
		assert.equal(readBoardModel(view).columnMode, 'combined');
		assert.throws(() => applyBoardChange(view, { type: 'column-mode', mode: 'custom' }), /add a value/);
	});
});
