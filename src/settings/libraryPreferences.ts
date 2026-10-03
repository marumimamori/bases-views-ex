import { isObject, type BoardTarget } from './boardConfig.ts';

/** Only the board library is plugin-wide; board configuration stays in each Base. */
export class LibraryPreferences {
	paths: string[] = [];
	selected: BoardTarget | null = null;
	initialized = false;
	private raw: Record<string, unknown>;
	private writes: Promise<void> = Promise.resolve();
	constructor(
		raw: unknown,
		private save: (data: Record<string, unknown>) => Promise<void> = async () => {},
	) {
		this.raw = isObject(raw) ? structuredClone(raw) : {};
		const library = this.raw.boardLibrary;
		if (!isObject(library)) return;
		this.initialized = true;
		if (Array.isArray(library.paths))
			this.paths = [...new Set(library.paths.filter((path): path is string => typeof path === 'string'))];
		const selected = library.selected;
		if (isObject(selected) && typeof selected.path === 'string' && typeof selected.viewName === 'string')
			this.selected = { path: selected.path, viewName: selected.viewName };
	}
	add(path: string): void {
		if (!this.paths.includes(path)) this.paths.push(path);
	}
	remove(path: string): void {
		this.paths = this.paths.filter((candidate) => candidate !== path);
		if (this.selected?.path === path) this.selected = null;
	}
	rename(oldPath: string, nextPath: string): void {
		const rename = (path: string) =>
			path === oldPath || path.startsWith(`${oldPath}/`) ? nextPath + path.slice(oldPath.length) : path;
		this.paths = [...new Set(this.paths.map(rename))];
		if (this.selected) this.selected = { ...this.selected, path: rename(this.selected.path) };
	}
	persist(): Promise<void> {
		this.raw.boardLibrary = { paths: [...this.paths], selected: this.selected ? { ...this.selected } : null };
		const snapshot = structuredClone(this.raw);
		const operation = this.writes.then(() => this.save(snapshot));
		this.writes = operation.catch(() => {});
		return operation;
	}
}
