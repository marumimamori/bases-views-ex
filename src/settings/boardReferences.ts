import { type BoardTarget } from './boardConfig.ts';

export function sameBoard(a: BoardTarget | null, b: BoardTarget | null): boolean {
	return a?.path === b?.path && a?.viewName === b?.viewName;
}

function referenceText(text: string): string {
	return text.trim().replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0].replace(/\\/g, '/');
}

function basePath(path: string): string {
	return path
		.replace(/^\.\//, '')
		.replace(/\.base$/i, '')
		.toLowerCase();
}

export function filterBoards(boards: readonly BoardTarget[], query: string): BoardTarget[] {
	const text = referenceText(query).toLowerCase();
	return boards.filter(
		(board) =>
			`${board.path}#${board.viewName}`.toLowerCase().includes(text) ||
			`${board.path.replace(/\.base$/i, '')}#${board.viewName}`.toLowerCase().includes(text),
	);
}

/** A short file name is accepted only when it identifies one view unambiguously. */
export function resolveBoardReference(boards: readonly BoardTarget[], text: string): BoardTarget {
	const reference = referenceText(text);
	const separator = reference.indexOf('#');
	if (separator < 1 || !reference.slice(separator + 1).trim())
		throw new Error('Choose a suggested view or enter [[Base.base#View]].');
	const path = basePath(reference.slice(0, separator).trim());
	const view = reference
		.slice(separator + 1)
		.trim()
		.toLowerCase();
	const matchingViews = boards.filter((board) => board.viewName.toLowerCase() === view);
	let matches = matchingViews.filter((board) => basePath(board.path) === path);
	if (matches.length === 0 && !path.includes('/'))
		matches = matchingViews.filter((board) => basePath(board.path.split('/').pop() ?? '') === path);
	if (matches.length > 1)
		throw new Error('Several boards match this link. Choose a suggestion with its full folder path.');
	if (matches.length === 0)
		throw new Error('No matching Kanban view found. Check the view name or refresh the board list.');
	return matches[0];
}
