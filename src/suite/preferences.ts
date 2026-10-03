import { type App } from 'obsidian';
import { isObject } from '../settings/boardConfig.ts';

/** One writer owns the envelope; a board-library save cannot overwrite editor settings. */
export class SuitePreferences {
	private writes: Promise<void> = Promise.resolve();
	constructor(
		public data: Record<string, unknown>,
		private save: (data: Record<string, unknown>) => Promise<void>,
	) {}
	get kanban(): Record<string, unknown> {
		return isObject(this.data.kanban) ? this.data.kanban : {};
	}
	get spotlight(): Record<string, unknown> {
		return isObject(this.data.spotlight) ? this.data.spotlight : {};
	}
	library(layout: string): unknown {
		return isObject(this.data.viewLibraries) ? this.data.viewLibraries[layout] : null;
	}
	saveKanban(data: Record<string, unknown>): Promise<void> {
		this.data.kanban = structuredClone(data);
		return this.persist();
	}
	saveSpotlight(data: unknown): Promise<void> {
		this.data.spotlight = structuredClone(data);
		return this.persist();
	}
	saveLibrary(layout: string, data: Record<string, unknown>): Promise<void> {
		if (!isObject(this.data.viewLibraries)) this.data.viewLibraries = {};
		const libraries = this.data.viewLibraries;
		if (isObject(libraries)) libraries[layout] = structuredClone(data);
		return this.persist();
	}
	persist(): Promise<void> {
		const snapshot = structuredClone(this.data);
		const operation = this.writes.then(() => this.save(snapshot));
		this.writes = operation.catch(() => {});
		return operation;
	}
}

export async function migratedPreferences(app: App, raw: unknown): Promise<Record<string, unknown>> {
	if (isObject(raw) && raw.schemaVersion === 1) return structuredClone(raw);
	if (isObject(raw) && raw.schemaVersion !== undefined)
		throw new Error(
			'These settings were saved by an unsupported Bases Views EX version. Keep your data.json and update the plugin.',
		);
	const adapter = app.vault.adapter;
	const plugins = `${app.vault.configDir}/plugins`;
	const read = async (id: string): Promise<unknown> => {
		let folders = [`${plugins}/${id}`];
		// Some manual installs use a folder name different from their manifest ID.
		if (adapter.list) {
			const listing = await adapter.list(plugins);
			folders = [...new Set([...folders, ...listing.folders])];
		}
		for (const folder of folders) {
			const manifest = `${folder}/manifest.json`;
			if (!(await adapter.exists(manifest))) continue;
			let info: unknown;
			try {
				info = JSON.parse(await adapter.read(manifest));
			} catch {
				continue;
			}
			if (!isObject(info) || info.id !== id) continue;
			const data = `${folder}/data.json`;
			return (await adapter.exists(data)) ? JSON.parse(await adapter.read(data)) : null;
		}
		return null;
	};
	const [kanban, spotlight] = await Promise.all([read('kanban-bases-view'), read('bases-spotlight-view-expanded')]);
	return {
		...(isObject(raw) ? raw : {}),
		schemaVersion: 1,
		kanban: isObject(kanban) ? kanban : {},
		spotlight: isObject(spotlight) ? spotlight : {},
		viewLibraries: {},
		activeTab: 'kanban',
	};
}
