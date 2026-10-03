import { type App, TFile, parseYaml, stringifyYaml } from 'obsidian';
import { BoardStore } from '../settings/boardStore.ts';
import { findBoardView, type BoardTarget } from '../settings/boardConfig.ts';
import { type LiveBoards } from '../settings/liveBoards.ts';

export type EditorLayout = 'spotlight' | 'cards';
export const VIEW_TYPES = { spotlight: 'bases-spotlight-view-expanded', cards: 'spotlight-ex-cards' };
export interface OptionField {
	key: string;
	name: string;
	description: string;
	kind: 'property' | 'number' | 'choice';
	default: string | number;
	min?: number;
	max?: number;
	step?: number;
	choices?: Record<string, string>;
}
export const VIEW_FIELDS: Record<EditorLayout, OptionField[]> = {
	spotlight: [
		{
			key: 'spotlight_property',
			name: 'Spotlight Content Property',
			description: 'A property containing a [[wikilink]] to the file to preview. Leave empty to preview the entry itself.',
			kind: 'property',
			default: '',
		},
		{
			key: 'hyperlink_property',
			name: 'Hyperlink Property',
			description: 'A displayed field that opens the current Base entry when clicked.',
			kind: 'property',
			default: '',
		},
	],
	cards: [
		{
			key: 'groupByProperty',
			name: 'Group by',
			description: 'Group the gallery by a Base property. Leave empty for one gallery.',
			kind: 'property',
			default: '',
		},
		{
			key: 'cardSize',
			name: 'Card size',
			description: 'Card width in pixels. Visible rows stay virtualized for large galleries.',
			kind: 'number',
			default: 260,
			min: 160,
			max: 640,
			step: 10,
		},
		{
			key: 'image',
			name: 'Image property',
			description: 'A local image link, external image URL, or hex color.',
			kind: 'property',
			default: '',
		},
		{
			key: 'imageFit',
			name: 'Image fit',
			description: 'Cover fills the image box; Contain shows the whole image.',
			kind: 'choice',
			default: 'cover',
			choices: { cover: 'Cover', contain: 'Contain' },
		},
		{
			key: 'imageAspectRatio',
			name: 'Image aspect ratio',
			description: 'Width divided by height for each image cover.',
			kind: 'number',
			default: 1,
			min: 0.25,
			max: 3,
			step: 0.05,
		},
	],
};

export class ViewOptionsStore {
	readonly inventory: BoardStore;
	private writes: Promise<void> = Promise.resolve();
	constructor(
		private app: App,
		private live: LiveBoards,
		readonly layout: EditorLayout,
	) {
		this.inventory = new BoardStore(app, live, VIEW_TYPES[layout]);
	}
	private file(target: BoardTarget): TFile {
		const file = this.app.vault.getAbstractFileByPath(target.path);
		if (!(file instanceof TFile) || file.extension !== 'base') throw new Error('This Base no longer exists.');
		return file;
	}
	async read(target: BoardTarget): Promise<Record<string, unknown>> {
		const document: unknown = parseYaml(await this.app.vault.read(this.file(target)));
		const saved = findBoardView(document, target, VIEW_TYPES[this.layout]);
		const config = this.live.get(target)?.getConfig();
		return Object.fromEntries(
			VIEW_FIELDS[this.layout].map((field) => [field.key, config ? config.get(field.key) : saved[field.key]]),
		);
	}
	change(target: BoardTarget, key: string, value: string | number): Promise<Record<string, unknown>> {
		const field = VIEW_FIELDS[this.layout].find((field) => field.key === key);
		if (!field) return Promise.reject(new Error('Unknown view option.'));
		if (
			field.kind === 'number' &&
			(typeof value !== 'number' || !Number.isFinite(value) || value < (field.min ?? 0) || value > (field.max ?? Infinity))
		)
			return Promise.reject(new Error(`Choose ${field.name} between ${field.min} and ${field.max}.`));
		if (field.choices && !(String(value) in field.choices)) return Promise.reject(new Error('Choose a listed option.'));
		const operation = this.writes.then(async () => {
			await this.read(target);
			const board = this.live.get(target);
			const config = board?.getConfig();
			if (board && config) {
				config.set(key, value || null);
				board.refresh();
				this.live.notify(board);
			} else {
				await this.app.vault.process(this.file(target), (content) => {
					const document: unknown = parseYaml(content);
					const view = findBoardView(document, target, VIEW_TYPES[this.layout]);
					if (value === '') delete view[key];
					else view[key] = value;
					return stringifyYaml(document);
				});
			}
			return this.read(target);
		});
		this.writes = operation.then(
			() => {},
			() => {},
		);
		return operation;
	}
}
