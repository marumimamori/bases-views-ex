import { ListValue, Value } from 'obsidian';
import { UNCATEGORIZED_LABEL } from '../constants.ts';
import { normalizePropertyValue } from './grouping.ts';
import { getStatusColumn, updateStatusValue, type StatusMoveMode } from './statusGrouping.ts';

export type ColumnMode = 'custom' | 'combined' | 'property';
export const COLUMN_MODE_OPTIONS = {
	custom: 'Only custom columns',
	combined: 'Custom + other columns',
	property: 'Only other columns',
};

export function readColumnMode(value: unknown, legacyEnabled?: unknown): ColumnMode {
	if (value === 'custom' || value === 'combined' || value === 'property') return value;
	return legacyEnabled === true ? 'custom' : 'property';
}

function wholeValue(value: unknown): string {
	if (Array.isArray(value)) return normalizePropertyValue(value.join(', '));
	if (value instanceof Value || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
		return normalizePropertyValue(value);
	return UNCATEGORIZED_LABEL;
}

/** Custom matches take priority; combined mode exposes unmatched whole values. */
export function getColumnValue(value: unknown, labels: readonly string[], mode: ColumnMode): string {
	if (mode === 'property') return wholeValue(value);
	const custom = getStatusColumn(value, labels);
	return custom === UNCATEGORIZED_LABEL && mode === 'combined' ? wholeValue(value) : custom;
}

/** Keep list-valued automatic destinations intact, including items containing commas. */
export function columnDestinationValue(value: unknown): unknown {
	if (value instanceof ListValue)
		return Array.from({ length: value.length() }, (_, index) => value.get(index).toString());
	return value instanceof Value ? value.toString() : value;
}

export function updateColumnValue(
	current: unknown,
	source: string,
	destination: string,
	labels: readonly string[],
	columnMode: ColumnMode,
	moveMode: StatusMoveMode,
	destinationValue: unknown = destination,
): unknown {
	if (columnMode === 'custom') return updateStatusValue(current, source, destination, labels, moveMode);
	if (columnMode === 'property') return destination === UNCATEGORIZED_LABEL ? undefined : destinationValue;
	if (getColumnValue(current, labels, columnMode) !== source) {
		throw new Error('The property changed while this card was being moved. Try the move again.');
	}
	const currentCustom = getStatusColumn(current, labels);
	if (labels.includes(destination)) return updateStatusValue(current, currentCustom, destination, labels, moveMode);
	if (currentCustom !== UNCATEGORIZED_LABEL) {
		const remaining = updateStatusValue(current, currentCustom, UNCATEGORIZED_LABEL, labels, moveMode);
		if (getColumnValue(remaining, labels, columnMode) === destination) return remaining;
		throw new Error('This move would replace your other labels. Choose the column matching those labels instead.');
	}
	if (destination === UNCATEGORIZED_LABEL) return Array.isArray(current) ? [] : undefined;
	return Array.isArray(current) && !Array.isArray(destinationValue) ? [destinationValue] : destinationValue;
}

export function createColumnValue(
	current: unknown,
	destination: string,
	labels: readonly string[],
	columnMode: ColumnMode,
	moveMode: StatusMoveMode,
	destinationValue: unknown = destination,
): unknown {
	return updateColumnValue(
		current,
		getColumnValue(current, labels, columnMode),
		destination,
		labels,
		columnMode,
		moveMode,
		destinationValue,
	);
}

/** Reordering displayed columns leaves hidden columns in their existing slots. */
export function mergeVisibleOrder(previous: readonly string[], visible: readonly string[]): string[] {
	const set = new Set(visible);
	const remaining = [...set];
	const merged = [...new Set(previous)].map((value) => (set.has(value) ? remaining.shift() : value));
	return [...merged, ...remaining];
}
