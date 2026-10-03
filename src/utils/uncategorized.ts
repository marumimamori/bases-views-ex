import { UNCATEGORIZED_LABEL } from '../constants.ts';

export type UncategorizedPosition = 'none' | 'first' | 'last';
export const UNCATEGORIZED_POSITION_OPTIONS = { none: 'No snap', first: 'Always first', last: 'Always last' };

export function readUncategorizedPosition(value: unknown): UncategorizedPosition {
	return value === 'first' || value === 'last' ? value : 'none';
}

/** Retain a movable fallback column, or enforce its chosen endpoint. */
export function positionUncategorized(order: readonly string[], position: UncategorizedPosition): string[] {
	const values = [...new Set(order)];
	if (position === 'none') return values.includes(UNCATEGORIZED_LABEL) ? values : [...values, UNCATEGORIZED_LABEL];
	const others = values.filter((value) => value !== UNCATEGORIZED_LABEL);
	return position === 'first' ? [UNCATEGORIZED_LABEL, ...others] : [...others, UNCATEGORIZED_LABEL];
}
