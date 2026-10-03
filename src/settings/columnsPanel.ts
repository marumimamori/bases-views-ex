import { type App } from 'obsidian';
import Sortable from 'sortablejs';
import { type BoardChange, type BoardModel } from './boardConfig.ts';
import { ColumnRow } from './columnRow.ts';
import { ValueSuggest } from './suggestions.ts';
import { UNCATEGORIZED_LABEL } from '../constants.ts';
import { UncategorizedRow } from './uncategorizedRow.ts';

export class ColumnsPanel {
	private sortable: Sortable | null = null;
	private rows = new Map<string, ColumnRow>();
	private list: HTMLElement | null = null;
	private input: HTMLInputElement | null = null;
	private addSuggest: ValueSuggest | null = null;
	private model: BoardModel | null = null;
	private adding = false;
	private uncategorized: UncategorizedRow | null = null;
	dragging = false;
	constructor(
		private app: App,
		private container: HTMLElement,
		private change: (change: BoardChange) => Promise<void>,
	) {}
	get suggestions(): ValueSuggest[] {
		return [...this.rows.values()].map((row) => row.suggest);
	}
	close(): void {
		this.sortable?.destroy();
		this.sortable = null;
		this.rows.forEach((row) => row.close());
		this.rows.clear();
		this.uncategorized?.close();
		this.uncategorized = null;
		this.addSuggest?.destroy();
		this.addSuggest = null;
		this.list = null;
		this.input = null;
		this.model = null;
	}
	render(model: BoardModel, propertyValues: string[], change?: BoardChange): void {
		if (!this.list) this.create();
		const list = this.list;
		if (change?.type === 'value' && model.columns.some((column) => column.value === change.next.trim())) {
			const row = this.rows.get(change.value);
			if (row) {
				this.rows.delete(change.value);
				this.rows.set(change.next.trim(), row);
			}
		}
		const previous = this.model;
		this.model = model;
		for (const [value, row] of this.rows) {
			if (model.columns.some((column) => column.value === value)) continue;
			row.close();
			row.element.remove();
			this.rows.delete(value);
		}
		model.columns.forEach((column) => {
			let row = this.rows.get(column.value);
			if (!row) {
				row = new ColumnRow(this.app, list, column, this.change);
				this.rows.set(column.value, row);
			}
			row.update(column, propertyValues);
			row.setInactive(model.columnMode === 'property');
		});
		if (!this.uncategorized) this.uncategorized = new UncategorizedRow(list, this.change);
		this.uncategorized.update(model);
		model.columnOrder.forEach((value, index) => {
			const element = value === UNCATEGORIZED_LABEL ? this.uncategorized?.element : this.rows.get(value)?.element;
			if (element && list.children[index] !== element) list.insertBefore(element, list.children[index] ?? null);
		});
		this.addSuggest?.update(propertyValues.filter((value) => !model.columns.some((column) => column.value === value)));
		if (
			this.input &&
			previous &&
			model.columns.some((column) => column.value === this.input?.value.trim()) &&
			!previous.columns.some((column) => column.value === this.input?.value.trim())
		) {
			this.input.value = '';
			this.addSuggest?.close();
		}
	}
	private create(): void {
		this.container.empty();
		this.list = this.container.createDiv({ cls: 'obk-settings-columns' });
		const list = this.list;
		this.sortable = new Sortable(list, {
			handle: '.obk-setting-drag',
			animation: 120,
			onStart: () => {
				this.dragging = true;
			},
			onEnd: () => {
				this.dragging = false;
				const values = Array.from(list.children).map((row) => row.getAttribute('data-status-value') ?? '');
				if (JSON.stringify(values) !== JSON.stringify(this.model?.columnOrder))
					void this.change({ type: 'order', values }).catch(() => {});
			},
		});
		const addRow = this.container.createDiv({ cls: 'obk-settings-add-column' });
		this.input = addRow.createEl('input', {
			attr: { type: 'text', placeholder: 'Search values or enter a new one…', 'aria-label': 'New column value' },
		});
		this.addSuggest = new ValueSuggest(this.app, this.input, []);
		const add = () => {
			const value = this.input?.value.trim();
			if (!value || this.adding) return;
			this.adding = true;
			button.disabled = true;
			this.addSuggest?.close();
			void this.change({ type: 'add', value })
				.finally(() => {
					this.adding = false;
					button.disabled = false;
				})
				.catch(() => {});
		};
		const button = addRow.createEl('button', { text: 'Add column', attr: { type: 'button' } });
		button.addEventListener('click', add);
		this.input.addEventListener('keydown', (event) => {
			if (event.key === 'Enter' && !event.defaultPrevented) {
				event.preventDefault();
				add();
			}
		});
	}
}
