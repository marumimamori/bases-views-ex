import { type BasesViewConfig } from 'obsidian';
import { BOARD_CONFIG_KEYS, isObject, type BoardTarget } from './boardConfig.ts';
import { sameBoard } from './boardReferences.ts';

export function configRecord(config: BasesViewConfig): Record<string, unknown> {
	return Object.fromEntries(BOARD_CONFIG_KEYS.map((key) => [key, structuredClone(config.get(key))]));
}

export interface LiveBoard {
	controller: unknown;
	getConfig(): BasesViewConfig | null;
	refresh(): void;
}

/** Native and embedded Bases both keep their source file on the query. Guard this
 * optional owner information; use normal vault writes if it is unavailable.
 * All configuration reads/writes use the public BasesViewConfig API. */
function targetFor(board: LiveBoard): BoardTarget | null {
	const controller: unknown = board.controller;
	if (!isObject(controller) || !isObject(controller.query) || !isObject(controller.query.file)) return null;
	const path = controller.query.file.path;
	const config = board.getConfig();
	return typeof path === 'string' && path.endsWith('.base') && config?.name ? { path, viewName: config.name } : null;
}

export class LiveBoards {
	private boards = new Set<LiveBoard>();
	private snapshots = new WeakMap<LiveBoard, string>();
	constructor(
		private changed: (target: BoardTarget) => void,
		private openViews: () => unknown[] = () => [],
	) {}

	add(board: LiveBoard): () => void {
		this.boards.add(board);
		return () => this.boards.delete(board);
	}

	get(target: BoardTarget): LiveBoard | null {
		const active = [...this.boards].find((board) => sameBoard(targetFor(board), target));
		if (active) return active;
		// A hidden sibling view belongs to the same open query and can otherwise
		// be overwritten by that query's pending save as well.
		for (const owner of this.boards) {
			if (targetFor(owner)?.path !== target.path) continue;
			const controller: unknown = owner.controller;
			if (!isObject(controller) || !isObject(controller.query) || !Array.isArray(controller.query.views)) continue;
			const matches = controller.query.views.filter(isConfig).filter((config) => config.name === target.viewName);
			if (matches.length === 1)
				return { controller: owner.controller, getConfig: () => matches[0], refresh: () => owner.refresh() };
		}
		// The same Base can be open on a Table/Cards view without an active Kanban.
		for (const view of this.openViews()) {
			if (!isObject(view) || !isObject(view.controller) || !isObject(view.controller.query)) continue;
			const query = view.controller.query;
			if (!isObject(query.file) || query.file.path !== target.path || !Array.isArray(query.views)) continue;
			const matches = query.views.filter(isConfig).filter((config) => config.name === target.viewName);
			if (matches.length === 1) return { controller: view.controller, getConfig: () => matches[0], refresh: () => {} };
		}
		return null;
	}

	notify(board: LiveBoard): void {
		const target = targetFor(board);
		const config = board.getConfig();
		if (!target || !config) return;
		const snapshot = JSON.stringify({
			...configRecord(config),
			...Object.fromEntries(
				['spotlight_property', 'hyperlink_property', 'cardSize', 'image', 'imageFit', 'imageAspectRatio'].map((key) => [
					key,
					config.get(key),
				]),
			),
		});
		if (snapshot === this.snapshots.get(board)) return;
		this.snapshots.set(board, snapshot);
		this.changed(target);
	}
}

function isConfig(value: unknown): value is BasesViewConfig {
	return (
		isObject(value) &&
		typeof value.name === 'string' &&
		typeof value.get === 'function' &&
		typeof value.set === 'function'
	);
}
