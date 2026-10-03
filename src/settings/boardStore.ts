import { TFile, parseYaml, stringifyYaml, type App } from 'obsidian';
import {
	applyBoardChange,
	BOARD_CONFIG_KEYS,
	findBoardView,
	getBoardViews,
	readBoardModel,
	type BoardChange,
	type BoardModel,
	type BoardTarget,
} from './boardConfig.ts';
import { configRecord, type LiveBoards } from './liveBoards.ts';
import { type BaseCatalogEntry } from './suggestions.ts';

export class BoardStore {
	private writes: Promise<void> = Promise.resolve();
	private catalogCache = new Map<string, { stamp: string; base: BaseCatalogEntry }>();
	constructor(
		private app: App,
		private live?: LiveBoards,
		private viewType = 'kanban-view',
	) {}

	async list(): Promise<BoardTarget[]> {
		return (await this.catalog(true))
			.flatMap((base) => base.views.map((viewName) => ({ path: base.path, viewName })))
			.sort((a, b) => a.path.localeCompare(b.path) || a.viewName.localeCompare(b.viewName));
	}

	invalidateCatalog(path?: string): void {
		if (!path) this.catalogCache.clear();
		else
			for (const key of this.catalogCache.keys())
				if (key === path || key.startsWith(`${path}/`)) this.catalogCache.delete(key);
	}
	async catalog(force = false): Promise<BaseCatalogEntry[]> {
		const bases: BaseCatalogEntry[] = [];
		for (const file of this.app.vault.getFiles().filter((candidate) => candidate.extension === 'base')) {
			const stamp = `${file.stat?.mtime}:${file.stat?.size}`;
			const cached = this.catalogCache.get(file.path);
			if (!force && cached?.stamp === stamp) {
				bases.push(cached.base);
				continue;
			}
			const base: BaseCatalogEntry = { path: file.path, views: [] };
			try {
				const document: unknown = parseYaml(await this.app.vault.read(file));
				base.views = getBoardViews(document, this.viewType).flatMap((view) =>
					typeof view.name === 'string' ? [view.name] : [],
				);
			} catch {
				// An invalid Base should not prevent selecting the other boards.
			}
			bases.push(base);
			this.catalogCache.set(file.path, { stamp, base });
		}
		return bases.sort((a, b) => a.path.localeCompare(b.path));
	}

	private file(target: BoardTarget): TFile {
		const file = this.app.vault.getAbstractFileByPath(target.path);
		if (!(file instanceof TFile) || file.extension !== 'base')
			throw new Error('This Base file no longer exists. Select it again.');
		return file;
	}

	async read(target: BoardTarget): Promise<BoardModel> {
		const document: unknown = parseYaml(await this.app.vault.read(this.file(target)));
		const saved = findBoardView(document, target);
		const config = this.live?.get(target)?.getConfig();
		return readBoardModel(config ? configRecord(config) : saved);
	}

	change(target: BoardTarget, change: BoardChange): Promise<BoardModel> {
		let result: BoardModel;
		const operation = this.writes.then(async () => {
			const document: unknown = parseYaml(await this.app.vault.read(this.file(target)));
			findBoardView(document, target);
			const board = this.live?.get(target);
			const config = board?.getConfig();
			if (board && config) {
				const view = configRecord(config);
				applyBoardChange(view, change);
				// An open Base may have a delayed save pending. Update its own config
				// so that save includes our changes instead of overwriting a direct file edit.
				for (const key of BOARD_CONFIG_KEYS) {
					if (JSON.stringify(config.get(key)) !== JSON.stringify(view[key])) config.set(key, view[key] ?? null);
				}
				board.refresh();
				this.live?.notify(board);
				return readBoardModel(view);
			}
			await this.app.vault.process(this.file(target), (content) => {
				const document: unknown = parseYaml(content);
				const view = findBoardView(document, target);
				applyBoardChange(view, change);
				result = readBoardModel(view);
				return stringifyYaml(document);
			});
			return result;
		});
		this.writes = operation.then(
			(): void => undefined,
			(): void => undefined,
		);
		return operation;
	}

	propertyValues(property: string): string[] {
		const name = property.replace(/^note\./, '');
		const values = new Set<string>();
		for (const file of this.app.vault.getMarkdownFiles()) {
			const value: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter?.[name];
			for (const item of Array.isArray(value) ? value : [value]) {
				if (typeof item === 'string' && item.trim()) values.add(item.trim());
			}
		}
		return [...values].sort((a, b) => a.localeCompare(b));
	}

	propertyNames(): string[] {
		const names = new Set<string>();
		for (const file of this.app.vault.getMarkdownFiles()) {
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
			Object.keys(frontmatter ?? {})
				.filter((name) => name !== 'position')
				.forEach((name) => names.add(name));
		}
		return [...names].sort((a, b) => a.localeCompare(b));
	}
}
