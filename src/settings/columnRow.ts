import { type App, setIcon } from 'obsidian';
import { type BoardChange, type BoardColumn } from './boardConfig.ts';
import { ColorControl } from './colorControl.ts';
import { ValueSuggest } from './suggestions.ts';
import { SyncIndicator } from './syncIndicator.ts';

export class ColumnRow {
	element: HTMLElement;
	suggest: ValueSuggest;
	private column: BoardColumn;
	private value: HTMLInputElement;
	private name: HTMLInputElement;
	private color: ColorControl;
	private remove: HTMLButtonElement;
	private writes: Promise<void> = Promise.resolve();
	private indicators = new Map<string, SyncIndicator>();
	constructor(
		app: App,
		parent: HTMLElement,
		column: BoardColumn,
		private change: (change: BoardChange) => Promise<void>,
	) {
		this.column = column;
		this.element = parent.createDiv({ cls: 'obk-settings-column' });
		this.element.createSpan({
			cls: 'obk-setting-drag',
			text: '⋮⋮',
			attr: { title: 'Drag to reorder', 'aria-label': 'Drag to reorder' },
		});
		const field = (text: string) => {
			const label = this.element.createEl('label', { cls: 'obk-column-field' });
			const heading = label.createSpan({ text, cls: 'obk-synced-label' });
			this.indicators.set(text.toLowerCase(), new SyncIndicator(heading, `${text} for ${column.value}`));
			return label;
		};
		this.value = field('Value').createEl('input', { attr: { type: 'text' } });
		this.suggest = new ValueSuggest(app, this.value, []);
		let submittedValue = column.value;
		const saveValue = () => {
			const next = this.value.value.trim();
			if (next === submittedValue) return;
			submittedValue = next;
			this.submit(() => ({ type: 'value', value: this.column.value, next }));
		};
		this.suggest.onSelect(saveValue);
		this.value.addEventListener('change', saveValue);
		this.name = field('Name').createEl('input', { attr: { type: 'text' } });
		this.name.addEventListener('change', () => {
			const name = this.name.value;
			if (name.trim() !== this.column.name) this.submit(() => ({ type: 'name', value: this.column.value, name }));
		});
		for (const input of [this.value, this.name])
			input.addEventListener('keydown', (event) => {
				if (event.key === 'Enter' && !event.defaultPrevented) input.blur();
			});
		this.color = new ColorControl(field('Color'), (color) =>
			this.submit(() => ({ type: 'color', value: this.column.value, color })),
		);
		this.remove = this.element.createEl('button', { cls: 'obk-column-remove', attr: { type: 'button' } });
		setIcon(this.remove, 'x');
		this.remove.addEventListener('click', () => this.submit(() => ({ type: 'remove', value: this.column.value })));
		this.update(column, []);
	}
	update(column: BoardColumn, values: string[]): void {
		for (const key of ['value', 'name', 'color'] as const) {
			if (column[key] !== this.column[key]) this.indicators.get(key)?.pulse();
		}
		this.column = column;
		this.element.setAttribute('data-status-value', column.value);
		if (this.value.ownerDocument.activeElement !== this.value) this.value.value = column.value;
		if (this.name.ownerDocument.activeElement !== this.name) this.name.value = column.name;
		this.value.setAttribute('aria-label', `Match value for ${column.name}`);
		this.name.setAttribute('aria-label', `Display name for ${column.value}`);
		this.remove.setAttribute('aria-label', `Remove ${column.name} from this board`);
		this.remove.title = `Remove ${column.name} from this board`;
		this.color.setName(column.name);
		this.color.setValue(column.color);
		this.suggest.update(values);
	}
	setInactive(inactive: boolean): void {
		this.element.classList.toggle('is-unused', inactive);
		this.element.setAttribute('data-in-use', String(!inactive));
		this.element.title = inactive ? 'Saved custom column; not used in Only other columns mode.' : '';
	}
	close(): void {
		this.indicators.forEach((indicator) => indicator.close());
		this.suggest.destroy();
	}
	private submit(change: () => BoardChange): void {
		this.writes = this.writes
			.then(() => {
				const next = change();
				return this.indicators.get(next.type)?.run(() => this.change(next)) ?? this.change(next);
			})
			.catch(() => {});
	}
}
