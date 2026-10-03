import { ListValue, Value } from 'obsidian';
import { UNCATEGORIZED_LABEL } from '../constants.ts';

export const DEFAULT_STATUS_LABELS = '';
export type StatusMoveMode = 'source' | 'all';

export function parseStatusLabels(text: unknown): string[] {
	let labels: unknown[] = Array.isArray(text) ? text : [];
	if (typeof text === 'string') {
		try {
			const parsed: unknown = JSON.parse(text);
			labels = Array.isArray(parsed) ? parsed : text.split(/[,\n]/);
		} catch {
			labels = text.split(/[,\n]/);
		}
	}
	return [
		...new Set(
			labels
				.filter((label): label is string => typeof label === 'string')
				.map((label) => label.trim())
				.filter(Boolean),
		),
	].filter((label) => label !== UNCATEGORIZED_LABEL);
}

export function statusPrefsKey(propertyId: string, enabled: boolean): string {
	return enabled ? `${propertyId}:status` : propertyId;
}

/** Match whole list items, never a substring of the combined display text. */
export function getStatusColumn(value: unknown, labels: readonly string[]): string {
	let items: unknown[];
	if (value instanceof ListValue) {
		items = Array.from({ length: value.length() }, (_, index) => value.get(index).toString());
	} else if (Array.isArray(value)) {
		items = value;
	} else {
		items = [value instanceof Value ? value.toString() : value];
	}
	return (
		labels.find((label) => items.some((item) => typeof item === 'string' && item.trim() === label)) ?? UNCATEGORIZED_LABEL
	);
}

/**
 * Compute the complete replacement before touching frontmatter. In source mode,
 * a conflicting remaining status is reported instead of silently removing it.
 */
export function updateStatusValue(
	current: unknown,
	source: string,
	destination: string,
	labels: readonly string[],
	mode: StatusMoveMode = 'source',
): unknown {
	if (current != null && typeof current !== 'string' && !Array.isArray(current)) {
		throw new Error('Status grouping needs a text or list property.');
	}
	if (destination !== UNCATEGORIZED_LABEL && !labels.includes(destination)) {
		throw new Error('Add the destination to Custom column values before moving cards there.');
	}
	if (getStatusColumn(current, labels) !== source) {
		throw new Error('The status changed while this card was being moved. Try the move again.');
	}

	const items: unknown[] = Array.isArray(current) ? current : current == null || current === '' ? [] : [current];
	const matches = (item: unknown, label: string) => typeof item === 'string' && item.trim() === label;
	const shouldRemove = (item: unknown) =>
		mode === 'all'
			? labels.some((label) => matches(item, label))
			: source !== UNCATEGORIZED_LABEL && matches(item, source);
	const remaining = items.filter((item) => !shouldRemove(item));
	if (destination !== UNCATEGORIZED_LABEL && !remaining.some((item) => matches(item, destination))) {
		// Keep the new status at the old status's position; preserve other entries.
		const firstRemoved = items.findIndex(shouldRemove);
		const insertionIndex =
			firstRemoved < 0 ? remaining.length : items.slice(0, firstRemoved).filter((item) => !shouldRemove(item)).length;
		remaining.splice(insertionIndex, 0, destination);
	}
	const actualColumn = getStatusColumn(remaining, labels);
	if (actualColumn !== destination) {
		throw new Error(
			`The remaining status "${actualColumn}" takes priority. Edit that label or select "Replace all status labels" in Status moves.`,
		);
	}
	if (remaining.length === 0) return Array.isArray(current) ? [] : undefined;
	return Array.isArray(current) || current == null || remaining.length > 1 ? remaining : remaining[0];
}

/** Template-created cards keep their non-status labels and their property type. */
export function createStatusValue(
	current: unknown,
	destination: string,
	labels: readonly string[],
	mode: StatusMoveMode = 'source',
): unknown {
	return updateStatusValue(current, getStatusColumn(current, labels), destination, labels, mode);
}
