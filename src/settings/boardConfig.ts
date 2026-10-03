import { COLOR_PALETTE, SWIMLANE_KEY_SEPARATOR, UNCATEGORIZED_LABEL } from '../constants.ts';
import { parseStatusLabels, statusPrefsKey, type StatusMoveMode } from '../utils/statusGrouping.ts';
import { mergeVisibleOrder, readColumnMode, type ColumnMode } from '../utils/columnMode.ts';
import {
	positionUncategorized,
	readUncategorizedPosition,
	type UncategorizedPosition,
} from '../utils/uncategorized.ts';

export interface BoardTarget {
	path: string;
	viewName: string;
}

export const BOARD_CONFIG_KEYS = [
	'groupByProperty',
	'statusGrouping',
	'columnMode',
	'statusLabels',
	'statusMoveMode',
	'showUncategorized',
	'uncategorizedPosition',
	'statusColumnNames',
	'columnOrders',
	'columnColors',
	'cardOrders',
] as const;

export interface BoardColumn {
	value: string;
	name: string;
	color: string;
}

export interface BoardModel {
	property: string;
	enabled: boolean;
	columnMode: ColumnMode;
	moveMode: StatusMoveMode;
	showUncategorized: boolean;
	uncategorizedPosition: UncategorizedPosition;
	uncategorized: BoardColumn;
	columnOrder: string[];
	columns: BoardColumn[];
}

export type BoardChange =
	| { type: 'enabled'; enabled: boolean }
	| { type: 'column-mode'; mode: ColumnMode }
	| { type: 'property'; property: string }
	| { type: 'move-mode'; mode: StatusMoveMode }
	| { type: 'uncategorized'; show: boolean }
	| { type: 'uncategorized-position'; position: UncategorizedPosition }
	| { type: 'add'; value: string }
	| { type: 'remove'; value: string }
	| { type: 'value'; value: string; next: string }
	| { type: 'name'; value: string; name: string }
	| { type: 'color'; value: string; color: string }
	| { type: 'order'; values: string[] };

export function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function getBoardViews(document: unknown, viewType = 'kanban-view'): Record<string, unknown>[] {
	if (!isObject(document) || !Array.isArray(document.views)) return [];
	return document.views.filter(isObject).filter((view) => view.type === viewType && typeof view.name === 'string');
}

export function findBoardView(
	document: unknown,
	target: BoardTarget,
	viewType = 'kanban-view',
): Record<string, unknown> {
	const matches = getBoardViews(document, viewType).filter((view) => view.name === target.viewName);
	if (matches.length !== 1)
		throw new Error('This board was renamed, removed, or has a duplicate view name. Select it again.');
	return matches[0];
}

export function boardLink(target: BoardTarget): string {
	return `[[${target.path}#${target.viewName}]]`;
}

function recordStrings(value: unknown): Record<string, string> {
	if (!isObject(value)) return {};
	return Object.fromEntries(
		Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
	);
}

function readOrder(view: Record<string, unknown>, key: string): string[] {
	const orders = isObject(view.columnOrders) ? view.columnOrders : {};
	const order = orders[key];
	return Array.isArray(order)
		? [
				...new Set(
					order
						.filter((value): value is string => typeof value === 'string' && value.trim() !== '')
						.map((value) => value.trim()),
				),
			]
		: parseStatusLabels(order);
}

function readColors(view: Record<string, unknown>, key: string): Record<string, string> {
	const colors = isObject(view.columnColors) ? view.columnColors : {};
	return recordStrings(colors[key]);
}

export function readBoardModel(view: Record<string, unknown>): BoardModel {
	const property = typeof view.groupByProperty === 'string' ? view.groupByProperty : '';
	const columnMode = readColumnMode(view.columnMode, view.statusGrouping);
	const enabled = columnMode !== 'property';
	const labels = parseStatusLabels(view.statusLabels);
	const key = statusPrefsKey(property, true);
	const order = readOrder(view, key).filter((label) => labels.includes(label));
	const values = [...order, ...labels.filter((label) => !order.includes(label))];
	const colors = readColors(view, key);
	const names = recordStrings(view.statusColumnNames);
	const activeKey = statusPrefsKey(property, enabled);
	const position = readUncategorizedPosition(view.uncategorizedPosition);
	let columnOrder = positionUncategorized(mergeVisibleOrder(readOrder(view, key), values), position).filter(
		(value) => values.includes(value) || value === UNCATEGORIZED_LABEL,
	);
	if (!enabled && position === 'none') {
		const index = readOrder(view, activeKey).indexOf(UNCATEGORIZED_LABEL);
		if (index >= 0) {
			columnOrder = columnOrder.filter((value) => value !== UNCATEGORIZED_LABEL);
			columnOrder.splice(Math.min(index, columnOrder.length), 0, UNCATEGORIZED_LABEL);
		}
	}
	return {
		property,
		enabled,
		columnMode,
		moveMode: view.statusMoveMode === 'all' ? 'all' : 'source',
		showUncategorized: view.showUncategorized !== false,
		uncategorizedPosition: position,
		columnOrder,
		uncategorized: {
			value: UNCATEGORIZED_LABEL,
			name: names[UNCATEGORIZED_LABEL] || UNCATEGORIZED_LABEL,
			color: readColors(view, activeKey)[UNCATEGORIZED_LABEL] ?? '',
		},
		columns: values.map((value) => ({
			value,
			name: typeof names[value] === 'string' ? names[value] : value,
			color: typeof colors[value] === 'string' ? colors[value] : '',
		})),
	};
}

function validateValue(value: string): string {
	const trimmed = value.trim();
	if (!trimmed || trimmed === UNCATEGORIZED_LABEL) throw new Error('Enter a nonempty value other than Uncategorized.');
	return trimmed;
}

function replaceCardOrderKey(key: string, previous: string, next: string | null): string | null {
	if (key === previous) return next;
	const suffix = `${SWIMLANE_KEY_SEPARATOR}${previous}`;
	return key.endsWith(suffix)
		? next === null
			? null
			: `${key.slice(0, -suffix.length)}${SWIMLANE_KEY_SEPARATOR}${next}`
		: key;
}

/** Update only this view. Card order, other views, filters and formulas survive. */
export function applyBoardChange(view: Record<string, unknown>, change: BoardChange): void {
	const model = readBoardModel(view);
	const previousValues = model.columns.map((column) => column.value);
	let rename: { previous: string; next: string | null } | null = null;
	const previousProperty = model.property;
	if ((change.type === 'value' || change.type === 'remove') && change.value === UNCATEGORIZED_LABEL)
		throw new Error('Uncategorized is permanent. Use its visibility toggle to hide it.');
	if (change.type === 'enabled' || change.type === 'column-mode') {
		model.columnMode = change.type === 'enabled' ? (change.enabled ? 'custom' : 'property') : change.mode;
		model.enabled = model.columnMode !== 'property';
	} else if (change.type === 'move-mode') model.moveMode = change.mode;
	else if (change.type === 'uncategorized') {
		// Visibility alone must not normalize columns, colors or saved card order.
		view.showUncategorized = change.show;
		return;
	} else if (change.type === 'uncategorized-position') {
		view.uncategorizedPosition = change.position;
		const orders = isObject(view.columnOrders) ? { ...view.columnOrders } : {};
		for (const scope of [model.property, statusPrefsKey(model.property, true)]) {
			orders[scope] = positionUncategorized(readOrder(view, scope), change.position);
		}
		view.columnOrders = orders;
		return;
	} else if (change.type === 'property') {
		const name = change.property.trim().replace(/^note\./, '');
		if (!name || name.startsWith('formula.') || name.startsWith('file.')) {
			throw new Error('Choose the original note property, such as currentStatus.');
		}
		model.property = `note.${name}`;
	} else if (change.type === 'add') {
		const value = validateValue(change.value);
		if (model.columns.some((column) => column.value === value)) throw new Error('That value already has a column.');
		model.columns.push({ value, name: value, color: '' });
	} else if (change.type === 'order') {
		const existing = new Set(model.columns.map((column) => column.value));
		if (change.values.includes(UNCATEGORIZED_LABEL)) existing.add(UNCATEGORIZED_LABEL);
		if (
			change.values.length !== existing.size ||
			new Set(change.values).size !== existing.size ||
			change.values.some((value) => !existing.has(value))
		) {
			throw new Error('The columns changed while you were reordering. Try again.');
		}
		model.columns.sort((a, b) => change.values.indexOf(a.value) - change.values.indexOf(b.value));
	} else {
		const column =
			change.value === UNCATEGORIZED_LABEL
				? model.uncategorized
				: model.columns.find((candidate) => candidate.value === change.value);
		if (!column) throw new Error('That column changed in the board. Refresh the settings.');
		if (change.type === 'remove') {
			model.columns = model.columns.filter((candidate) => candidate !== column);
			rename = { previous: column.value, next: null };
		} else if (change.type === 'name') column.name = change.name.trim() || column.value;
		else if (change.type === 'color') {
			if (
				change.color &&
				!COLOR_PALETTE.some((color) => color.name === change.color) &&
				!/^#[\da-f]{6}$/i.test(change.color)
			)
				throw new Error('Choose a palette color or a six-digit custom color.');
			column.color = change.color;
		} else if (change.type === 'value') {
			const value = validateValue(change.next);
			if (model.columns.some((candidate) => candidate !== column && candidate.value === value))
				throw new Error('That value already has a column.');
			rename = { previous: column.value, next: value };
			if (column.name === column.value) column.name = value;
			column.value = value;
		}
	}
	if (
		(change.type === 'enabled' || change.type === 'column-mode') &&
		model.enabled &&
		(!model.property.startsWith('note.') || (model.columnMode === 'custom' && model.columns.length === 0))
	) {
		throw new Error('Choose a note property in Group by and add a value before using only custom columns.');
	}
	const key = statusPrefsKey(model.property, true);
	const previousKey = statusPrefsKey(previousProperty, true);
	view.groupByProperty = model.property;
	view.statusGrouping = model.enabled;
	view.columnMode = model.columnMode;
	view.statusMoveMode = model.moveMode;
	view.statusLabels = JSON.stringify(model.columns.map((column) => column.value));
	view.statusColumnNames = Object.fromEntries(
		[...model.columns, model.uncategorized]
			.filter((column) => column.name !== column.value)
			.map((column) => [column.value, column.name]),
	);
	const values = model.columns.map((column) => column.value);
	const savedOrder = readOrder(view, key)
		.map((value) => (rename?.previous === value ? rename.next : value))
		.filter((value): value is string => value !== null && (!previousValues.includes(value) || values.includes(value)));
	const visible = change.type === 'order' && change.values.includes(UNCATEGORIZED_LABEL) ? change.values : values;
	const order = positionUncategorized(mergeVisibleOrder(savedOrder, visible), model.uncategorizedPosition);
	const columnOrders = {
		...(isObject(view.columnOrders) ? view.columnOrders : {}),
		[key]: order,
	};
	if (change.type === 'order' && change.values.includes(UNCATEGORIZED_LABEL) && !model.enabled) {
		const ordinary = readOrder(view, model.property).filter((value) => value !== UNCATEGORIZED_LABEL);
		ordinary.splice(Math.min(change.values.indexOf(UNCATEGORIZED_LABEL), ordinary.length), 0, UNCATEGORIZED_LABEL);
		columnOrders[model.property] = positionUncategorized(ordinary, model.uncategorizedPosition);
	}
	view.columnOrders = columnOrders;
	view.columnColors = {
		...(isObject(view.columnColors) ? view.columnColors : {}),
		[key]: {
			...Object.fromEntries(Object.entries(readColors(view, key)).filter(([value]) => !previousValues.includes(value))),
			...(model.uncategorized.color ? { [UNCATEGORIZED_LABEL]: model.uncategorized.color } : {}),
			...Object.fromEntries(model.columns.filter((column) => column.color).map((column) => [column.value, column.color])),
		},
	};
	if (change.type === 'color' && change.value === UNCATEGORIZED_LABEL) {
		const allColors = isObject(view.columnColors) ? { ...view.columnColors } : {};
		for (const scope of [model.property, key]) {
			const colors = { ...readColors(view, scope) };
			if (model.uncategorized.color) colors[UNCATEGORIZED_LABEL] = model.uncategorized.color;
			else delete colors[UNCATEGORIZED_LABEL];
			allColors[scope] = colors;
		}
		view.columnColors = allColors;
	}
	const allCardOrders = isObject(view.cardOrders) ? { ...view.cardOrders } : {};
	for (const [orderKey, value] of Object.entries(allCardOrders)) {
		if (orderKey !== previousKey && !orderKey.startsWith(`${previousKey}${SWIMLANE_KEY_SEPARATOR}`)) continue;
		if (!isObject(value)) continue;
		const migrated: Record<string, unknown> = {};
		for (const [cellKey, paths] of Object.entries(value)) {
			const nextKey = rename ? replaceCardOrderKey(cellKey, rename.previous, rename.next) : cellKey;
			if (nextKey !== null) migrated[nextKey] = paths;
		}
		allCardOrders[`${key}${orderKey.slice(previousKey.length)}`] = migrated;
	}
	if (Object.keys(allCardOrders).length) view.cardOrders = allCardOrders;
}
