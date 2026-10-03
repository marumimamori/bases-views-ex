import { type App } from 'obsidian';
import { boardLink, type BoardTarget } from './boardConfig.ts';
import { filterBoards } from './boardReferences.ts';
import { InputSuggestions } from './inputSuggestions.ts';

export class BoardSuggest extends InputSuggestions<BoardTarget> {
	constructor(
		_app: App,
		input: HTMLInputElement,
		private boards: BoardTarget[],
	) {
		super(input);
	}
	getSuggestions(query: string): BoardTarget[] {
		return filterBoards(this.boards, query);
	}
	updateBoards(boards: BoardTarget[]): void {
		this.boards = boards;
		this.refresh();
	}
	renderSuggestion(board: BoardTarget, el: HTMLElement): void {
		el.createDiv({ text: board.path, cls: 'obk-suggestion-base' });
		el.createDiv({ text: `↳ ${board.viewName}`, cls: 'obk-suggestion-view' });
	}
	selectSuggestion(board: BoardTarget, event: MouseEvent | KeyboardEvent): void {
		this.setValue(boardLink(board));
		this.selected(board, event);
	}
}

export interface BaseCatalogEntry {
	path: string;
	views: string[];
}
export class BaseSuggest extends InputSuggestions<BaseCatalogEntry> {
	constructor(
		input: HTMLInputElement,
		private bases: BaseCatalogEntry[],
		private layoutName = 'Kanban',
	) {
		super(input);
	}
	getSuggestions(query: string): BaseCatalogEntry[] {
		const text = query.replace(/^\[\[/, '').replace(/\]\]$/, '').trim().toLowerCase();
		return this.bases.filter((base) => `${base.path} ${base.views.join(' ')}`.toLowerCase().includes(text));
	}
	update(bases: BaseCatalogEntry[]): void {
		this.bases = bases;
		this.refresh();
	}
	renderSuggestion(base: BaseCatalogEntry, el: HTMLElement): void {
		el.createDiv({ text: base.path, cls: 'obk-suggestion-base' });
		el.createDiv({
			text: base.views.length ? base.views.join(' · ') : `No ${this.layoutName} views yet`,
			cls: 'obk-suggestion-view',
		});
	}
	selectSuggestion(base: BaseCatalogEntry, event: MouseEvent | KeyboardEvent): void {
		this.setValue(`[[${base.path}]]`);
		this.selected(base, event);
	}
}

export class ValueSuggest extends InputSuggestions<string> {
	constructor(
		_app: App,
		input: HTMLInputElement,
		private values: string[],
	) {
		super(input);
	}
	update(values: string[]): void {
		this.values = values;
		this.refresh();
	}
	getSuggestions(query: string): string[] {
		return this.values.filter((value) => value.toLowerCase().includes(query.toLowerCase()));
	}
	renderSuggestion(value: string, el: HTMLElement): void {
		el.textContent = value;
	}
	selectSuggestion(value: string, event: MouseEvent | KeyboardEvent): void {
		this.setValue(value);
		this.selected(value, event);
	}
}
