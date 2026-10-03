import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import type { BasesPropertyId } from 'obsidian';
import { KanbanView } from '../src/kanbanView.ts';
import { CSS_CLASSES, UNCATEGORIZED_LABEL } from '../src/constants.ts';
import {
	createStatusValue,
	getStatusColumn,
	parseStatusLabels,
	statusPrefsKey,
	updateStatusValue,
} from '../src/utils/statusGrouping.ts';
import {
	createDivWithMethods,
	createMockApp,
	createMockBasesEntry,
	createMockQueryController,
	createMockTFile,
	triggerDataUpdate,
} from './helpers.ts';
import { ListValue, StringValue } from './mocks/obsidian.ts';

const STATUS: BasesPropertyId = 'note.currentStatus';
const LABELS = ['Backlog', 'Active', 'Done', 'Planned'];

describe('Status list values', () => {
	test('defaults are empty and arbitrary values are configurable', () => {
		assert.deepEqual(parseStatusLabels(null), []);
		assert.deepEqual(parseStatusLabels(' Queue, Shipping, Queue, \n Done '), ['Queue', 'Shipping', 'Done']);
		assert.deepEqual(parseStatusLabels('["A, B", "Any status"]'), ['A, B', 'Any status']);
	});
	test('uses list item membership and priority, independent of note order', () => {
		const value = new ListValue(['Planned', 'Project', 'Backlog'].map((item) => new StringValue(item)));
		assert.equal(getStatusColumn(value, LABELS), 'Backlog');
		assert.equal(getStatusColumn(value, ['Planned', 'Backlog']), 'Planned');
		assert.equal(getStatusColumn(['Backlogged', 'Content'], LABELS), UNCATEGORIZED_LABEL);
		assert.equal(getStatusColumn('Content, Backlog', LABELS), UNCATEGORIZED_LABEL);
	});
	test('replaces the source entry and preserves all other labels and their order', () => {
		const original = ['Planned', 'Content', 'Backlog', '[[Minecraft]]'];
		assert.deepEqual(updateStatusValue(original, 'Backlog', 'Active', LABELS), [
			'Planned',
			'Content',
			'Active',
			'[[Minecraft]]',
		]);
		assert.deepEqual(original, ['Planned', 'Content', 'Backlog', '[[Minecraft]]']);
	});
	test('does not duplicate an existing destination or remove unrelated duplicates', () => {
		assert.deepEqual(updateStatusValue(['Content', 'Backlog', 'Active', 'Content'], 'Backlog', 'Active', LABELS), [
			'Content',
			'Active',
			'Content',
		]);
	});
	test('handles clear, missing and scalar values without losing labels', () => {
		assert.deepEqual(updateStatusValue(['Content', 'Backlog'], 'Backlog', UNCATEGORIZED_LABEL, LABELS), ['Content']);
		assert.deepEqual(updateStatusValue(['Backlog'], 'Backlog', UNCATEGORIZED_LABEL, LABELS), []);
		assert.equal(updateStatusValue('Backlog', 'Backlog', 'Active', LABELS), 'Active');
		assert.equal(updateStatusValue('Backlog', 'Backlog', UNCATEGORIZED_LABEL, LABELS), undefined);
		assert.deepEqual(updateStatusValue(undefined, UNCATEGORIZED_LABEL, 'Active', LABELS), ['Active']);
		assert.deepEqual(updateStatusValue('Content', UNCATEGORIZED_LABEL, 'Active', LABELS), ['Content', 'Active']);
	});
	test('rejects stale moves, unsupported properties and unknown destinations', () => {
		assert.throws(() => updateStatusValue(['Active'], 'Backlog', 'Done', LABELS), /status changed/);
		assert.throws(() => updateStatusValue({ nested: 'Backlog' }, 'Backlog', 'Done', LABELS), /text or list/);
		assert.throws(() => updateStatusValue(['Backlog'], 'Backlog', 'Anything', LABELS), /destination/);
	});
	test('keeps additional statuses unless the user chooses to replace all', () => {
		const original = ['Content', 'Backlog', 'Active'];
		assert.throws(() => updateStatusValue(original, 'Backlog', 'Done', LABELS), /takes priority/);
		assert.deepEqual(original, ['Content', 'Backlog', 'Active']);
		assert.deepEqual(updateStatusValue(original, 'Backlog', 'Done', LABELS, 'all'), ['Content', 'Done']);
	});
	test('quick-add preserves template labels', () => {
		assert.deepEqual(createStatusValue(['Content', 'Planned', 'Backlog'], 'Active', LABELS), [
			'Content',
			'Planned',
			'Active',
		]);
		assert.deepEqual(createStatusValue(undefined, 'Active', LABELS), ['Active']);
	});
});

function board(frontmatter: Record<string, unknown>, extra: Record<string, unknown> = {}) {
	const file = createMockTFile('Project.md');
	const entry = createMockBasesEntry(file);
	entry.getValue = ((property: string) => {
		const value = frontmatter[property.replace(/^(note|formula)\./, '')];
		return Array.isArray(value)
			? new ListValue(value.map((item) => new StringValue(String(item))))
			: value == null
				? null
				: new StringValue(String(value));
	}) as any;
	const controller: any = createMockQueryController([entry], [STATUS, 'note.priority']);
	const config = { groupByProperty: STATUS, statusGrouping: true, statusLabels: JSON.stringify(LABELS), ...extra };
	Object.entries(config).forEach(([key, value]) => controller.config.set(key, value));
	controller.config.getAsPropertyId = (key: string) => (controller.config.get(key) ?? null) as any;
	const app = createMockApp();
	app.fileManager.processFrontMatter = (async (_file: unknown, callback: (fm: Record<string, unknown>) => void) =>
		callback(frontmatter)) as any;
	const view = new KanbanView(controller, createDivWithMethods());
	view.app = app;
	triggerDataUpdate(view);
	return { view, app, controller, entry, frontmatter };
}

async function drop(view: KanbanView, from: string, to: string, fromLane?: string, toLane?: string) {
	const body = (value: string, lane?: string) => {
		const root = lane ? view.containerEl.querySelector(`[data-swimlane-value="${lane}"]`) : view.containerEl;
		return root?.querySelector(`[data-column-value="${value}"] .${CSS_CLASSES.COLUMN_BODY}`) as HTMLElement;
	};
	const source = body(from, fromLane);
	const destination = body(to, toLane);
	assert.ok(source && destination, 'Both columns exist');
	const card = source.querySelector(`.${CSS_CLASSES.CARD}`);
	assert.ok(card);
	destination.appendChild(card);
	await (view as any).handleCardDrop({ item: card, from: source, to: destination, oldIndex: 0, newIndex: 0 });
	triggerDataUpdate(view);
}

describe('Status list board integration', () => {
	test('combined dragging and quick add retain the automatic destination list, including commas', async () => {
		const fixture = board({ currentStatus: ['Business'] }, { columnMode: 'combined', quickAddFolder: 'cards' });
		const destination = createMockBasesEntry(createMockTFile('Destination.md'));
		destination.getValue = (() =>
			new ListValue([new StringValue('Content, business'), new StringValue('Minecraft')])) as any;
		fixture.controller.data.data.push(destination);
		triggerDataUpdate(fixture.view);
		await drop(fixture.view, 'Business', 'Content, business, Minecraft');
		assert.deepEqual(fixture.frontmatter.currentStatus, ['Content, business', 'Minecraft']);
		const created: Record<string, unknown>[] = [];
		const files: any[] = [];
		fixture.app.vault.getMarkdownFiles = () => files;
		(fixture.view as any).createFileForView = async (path: string, set: (fm: Record<string, unknown>) => void) => {
			const fm = { currentStatus: ['Template'], untouched: 1 };
			set(fm);
			created.push(fm);
			files.push(createMockTFile(`${path}.md`));
		};
		await (fixture.view as any).createQuickAddCard('Custom card', 'Active', null);
		await (fixture.view as any).createQuickAddCard('Other card', 'Content, business, Minecraft', null);
		assert.deepEqual(created[0], { currentStatus: ['Template', 'Active'], untouched: 1 });
		assert.deepEqual(created[1], { currentStatus: ['Content, business', 'Minecraft'], untouched: 1 });
		fixture.view.onClose();
	});
	test('the native menu has one grouping control and three column modes', () => {
		const options = KanbanView.getViewOptions() as any[];
		assert.equal(options.filter((option) => option.key === 'groupByProperty').length, 1);
		assert.equal(
			options.some((option) => option.key === 'statusGrouping'),
			false,
		);
		const mode = options.find((option) => option.key === 'columnMode');
		assert.equal(mode.displayName, 'Custom Columns in use');
		assert.deepEqual(Object.keys(mode.options), ['custom', 'combined', 'property']);
	});
	test('all modes regroup live cards and preserve hidden automatic column colors and positions', () => {
		const fixture = board({ currentStatus: ['Business'] }, { columnMode: 'combined' });
		const key = statusPrefsKey(STATUS, true);
		const order = ['Backlog', 'Business', 'Active', 'Uncategorized', 'Planned', 'Done'];
		fixture.controller.config.set('columnOrders', { [key]: order });
		fixture.controller.config.set('columnColors', { [key]: { Business: 'blue' } });
		triggerDataUpdate(fixture.view);
		assert.ok(fixture.view.containerEl.querySelector('[data-column-value="Business"] .obk-card'));
		fixture.controller.config.set('columnMode', 'custom');
		triggerDataUpdate(fixture.view);
		assert.equal(fixture.view.containerEl.querySelector('[data-column-value="Business"]'), null);
		assert.ok(fixture.view.containerEl.querySelector('[data-column-value="Uncategorized"] .obk-card'));
		fixture.controller.config.set('columnMode', 'property');
		triggerDataUpdate(fixture.view);
		assert.ok(fixture.view.containerEl.querySelector('[data-column-value="Business"] .obk-card'));
		assert.equal(fixture.view.containerEl.querySelector('[data-column-value="Backlog"]'), null);
		fixture.controller.config.set('columnMode', 'combined');
		triggerDataUpdate(fixture.view);
		assert.deepEqual(fixture.controller.config.get('columnOrders')[key], order);
		const column = fixture.view.containerEl.querySelector('[data-column-value="Business"]') as HTMLElement;
		assert.equal(column.style.getPropertyValue('--obk-column-accent-color'), 'var(--color-blue)');
		assert.equal(fixture.controller.config.get('columnMode'), 'combined');
		fixture.view.onClose();
	});
	test('combined moves work in swimlanes and retain category labels through round trips', async () => {
		const fixture = board(
			{ currentStatus: ['Business'], priority: 'High' },
			{ columnMode: 'combined', swimlaneByProperty: 'note.priority' },
		);
		await drop(fixture.view, 'Business', 'Backlog', 'High', 'High');
		assert.deepEqual(fixture.frontmatter.currentStatus, ['Business', 'Backlog']);
		assert.equal(fixture.frontmatter.priority, 'High');
		await drop(fixture.view, 'Backlog', 'Business', 'High', 'High');
		assert.deepEqual(fixture.frontmatter.currentStatus, ['Business']);
		fixture.view.onClose();
	});
	test('combined mode without a custom list still displays other property values', () => {
		const fixture = board({ currentStatus: 'customTextProperty' }, { columnMode: 'combined', statusLabels: '' });
		assert.ok(fixture.view.containerEl.querySelector('[data-column-value="customTextProperty"] .obk-card'));
		fixture.view.onClose();
	});
	test('hiding Uncategorized preserves its cards, color and saved position during reordering', () => {
		const fixture = board({ currentStatus: ['Business'] });
		const key = statusPrefsKey(STATUS, true);
		fixture.controller.data.data.push(createMockBasesEntry(createMockTFile('Other.md'), { [STATUS]: 'Business' }));
		const order = ['Backlog', UNCATEGORIZED_LABEL, 'Active', 'Planned', 'Done'];
		fixture.controller.config.set('columnOrders', { [key]: order });
		fixture.controller.config.set('cardOrders', { [key]: { [UNCATEGORIZED_LABEL]: ['Other.md', 'Project.md'] } });
		fixture.controller.config.set('columnColors', { [key]: { [UNCATEGORIZED_LABEL]: 'red' } });
		triggerDataUpdate(fixture.view);
		fixture.controller.config.set('showUncategorized', false);
		triggerDataUpdate(fixture.view);
		assert.equal(fixture.view.containerEl.querySelector('[data-column-value="Uncategorized"]'), null);
		assert.deepEqual(fixture.controller.config.get('cardOrders')[key].Uncategorized, ['Other.md', 'Project.md']);
		const boardEl = fixture.view.containerEl.querySelector('.obk-board')!;
		boardEl.insertBefore(boardEl.children[1], boardEl.children[0]);
		(fixture.view as any).handleSwimlaneColumnDrop({ to: boardEl });
		assert.deepEqual(fixture.controller.config.get('columnOrders')[key], [
			'Active',
			UNCATEGORIZED_LABEL,
			'Backlog',
			'Planned',
			'Done',
		]);
		fixture.controller.config.set('showUncategorized', true);
		triggerDataUpdate(fixture.view);
		const column = fixture.view.containerEl.querySelector('[data-column-value="Uncategorized"]') as HTMLElement;
		assert.equal(column.style.getPropertyValue('--obk-column-accent-color'), 'var(--color-red)');
		assert.deepEqual(
			Array.from(column.querySelectorAll('.obk-card')).map((card) => card.getAttribute('data-entry-path')),
			['Other.md', 'Project.md'],
		);
		assert.deepEqual(fixture.frontmatter.currentStatus, ['Business']);
		fixture.view.onClose();
	});
	test('visibility applies across swimlanes while preserving the Uncategorized swimlane itself', () => {
		const fixture = board({ currentStatus: ['Business'] }, { swimlaneByProperty: 'note.priority' });
		fixture.controller.config.set('showUncategorized', false);
		triggerDataUpdate(fixture.view);
		assert.ok(fixture.view.containerEl.querySelector('[data-swimlane-value="Uncategorized"]'));
		assert.equal(fixture.view.containerEl.querySelector('[data-column-value="Uncategorized"]'), null);
		fixture.controller.config.set('showUncategorized', true);
		triggerDataUpdate(fixture.view);
		assert.ok(fixture.view.containerEl.querySelector('[data-column-value="Uncategorized"] .obk-card'));
		fixture.view.onClose();
	});
	test('the board switch, view menu and whole-value grouping share the same visibility setting', async () => {
		const fixture = board({}, { statusGrouping: false });
		assert.ok(fixture.view.containerEl.querySelector('[data-column-value="Uncategorized"]'));
		const toggle = fixture.view.scrollEl.querySelector<HTMLButtonElement>('[aria-label="Show Uncategorized"]')!;
		toggle.click();
		assert.equal(fixture.controller.config.get('showUncategorized'), false);
		triggerDataUpdate(fixture.view);
		assert.equal(fixture.view.containerEl.querySelector('[data-column-value="Uncategorized"]'), null);
		assert.equal(toggle.getAttribute('aria-checked'), 'false');
		const option: any = KanbanView.getViewOptions().find((option: any) => option.key === 'showUncategorized');
		assert.equal(option.type, 'toggle');
		assert.equal(option.default, true);
		fixture.controller.config.set(option.key, true);
		triggerDataUpdate(fixture.view);
		assert.equal(toggle.getAttribute('aria-checked'), 'true');
		assert.ok(fixture.view.containerEl.querySelector('[data-column-value="Uncategorized"]'));
		await Promise.resolve();
		fixture.view.onClose();
		assert.equal(fixture.view.scrollEl.querySelector('.obk-view-controls'), null);
	});
	beforeEach(() => mock.method(console, 'error', () => undefined));
	afterEach(() => mock.restoreAll());
	test('grouping, repeated moves and reopened views keep the same labels', async () => {
		const fixture = board({ currentStatus: ['Content', 'Planned', 'Backlog'], unrelated: 42 });
		await drop(fixture.view, 'Backlog', 'Active');
		assert.deepEqual(fixture.frontmatter, { currentStatus: ['Content', 'Planned', 'Active'], unrelated: 42 });
		await drop(fixture.view, 'Active', 'Done');
		assert.deepEqual(fixture.frontmatter.currentStatus, ['Content', 'Planned', 'Done']);
		const reopened = new KanbanView(fixture.controller, createDivWithMethods());
		reopened.app = fixture.app;
		triggerDataUpdate(reopened);
		assert.equal(
			reopened.containerEl.querySelector('[data-column-value="Done"] .obk-card')?.getAttribute('data-entry-path'),
			'Project.md',
		);
		fixture.view.onClose();
		reopened.onClose();
	});
	test('all configured empty columns exist and clearing status preserves categories', async () => {
		const fixture = board({ currentStatus: ['Business', 'Backlog'] });
		assert.ok(fixture.view.containerEl.querySelector('[data-column-value="Done"]'));
		await drop(fixture.view, 'Backlog', UNCATEGORIZED_LABEL);
		assert.deepEqual(fixture.frontmatter.currentStatus, ['Business']);
		fixture.view.onClose();
	});
	test('swimlane-only moves never flatten the combined status property', async () => {
		const fixture = board(
			{ currentStatus: ['Content', 'Backlog'], priority: 'High' },
			{ swimlaneByProperty: 'note.priority' },
		);
		// Provide the other lane without a second note.
		(fixture.view as any)._prefs.swimlaneOrder = ['High', 'Low'];
		const original = fixture.entry.getValue;
		const other = createMockBasesEntry(createMockTFile('Other.md'), { [STATUS]: 'Done', 'note.priority': 'Low' });
		fixture.controller.data.data.push(other);
		triggerDataUpdate(fixture.view);
		await drop(fixture.view, 'Backlog', 'Backlog', 'High', 'Low');
		assert.deepEqual(fixture.frontmatter.currentStatus, ['Content', 'Backlog']);
		assert.equal(fixture.frontmatter.priority, 'Low');
		fixture.entry.getValue = original;
		fixture.view.onClose();
	});
	test('formula grouping cannot write a property named after the formula', async () => {
		const fixture = board(
			{ currentStatus: ['Content', 'Backlog'], boardStatus: 'Backlog' },
			{ groupByProperty: 'formula.boardStatus', statusGrouping: false },
		);
		(fixture.view as any)._prefs.columnOrder.push('Active');
		(fixture.view as any).render();
		await drop(fixture.view, 'Backlog', 'Active');
		assert.deepEqual(fixture.frontmatter.currentStatus, ['Content', 'Backlog']);
		assert.equal(fixture.frontmatter.boardStatus, 'Backlog');
		fixture.view.onClose();
	});
	test('settings changes refresh names, colors, order and status priority in an open board', () => {
		const fixture = board({ currentStatus: ['Planned', 'Backlog'] });
		const key = statusPrefsKey(STATUS, true);
		fixture.controller.config.set('columnColors', { [key]: { Backlog: '#336699' } });
		fixture.controller.config.set('statusColumnNames', { Backlog: 'Ideas' });
		fixture.controller.config.set('columnOrders', {
			[key]: ['Done', 'Backlog', 'Active', 'Planned', UNCATEGORIZED_LABEL],
		});
		triggerDataUpdate(fixture.view);
		const column = fixture.view.containerEl.querySelector('[data-column-value="Backlog"]') as HTMLElement;
		assert.equal(column.querySelector('.obk-column-title')?.textContent, 'Ideas');
		assert.equal(column.style.getPropertyValue('--obk-column-accent-color'), '#336699');
		assert.equal(fixture.view.containerEl.querySelector('.obk-column')?.getAttribute('data-column-value'), 'Done');
		fixture.view.onClose();
	});
	test('switching between whole-value and status grouping does not retain old combination columns', () => {
		const fixture = board({ currentStatus: ['Content', 'Backlog'] }, { statusGrouping: false });
		assert.ok(fixture.view.containerEl.querySelector('[data-column-value="Content, Backlog"]'));
		fixture.controller.config.set('columnMode', 'custom');
		triggerDataUpdate(fixture.view);
		assert.equal(fixture.view.containerEl.querySelector('[data-column-value="Content, Backlog"]'), null);
		assert.ok(fixture.view.containerEl.querySelector('[data-column-value="Backlog"] .obk-card'));
		fixture.view.onClose();
	});
});
