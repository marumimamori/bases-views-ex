let nextId = 0;

/** Local, anchored suggestions support focus, typing and keyboard selection. */
export abstract class InputSuggestions<T> {
	private anchor: HTMLElement;
	private menu: HTMLElement;
	private matches: T[] = [];
	private active = -1;
	private callback: ((value: T, event: MouseEvent | KeyboardEvent) => void) | null = null;
	private disposers: Array<() => void> = [];
	constructor(protected input: HTMLInputElement) {
		const parent = input.parentElement ?? input.ownerDocument.defaultView?.createDiv() ?? createDiv();
		this.anchor = parent.createDiv({ cls: 'obk-suggestion-anchor' });
		this.anchor.appendChild(input);
		this.menu = this.anchor.createDiv({ cls: 'obk-suggestion-menu', attr: { role: 'listbox' } });
		this.menu.id = `obk-suggestions-${++nextId}`;
		input.setAttribute('role', 'combobox');
		input.setAttribute('autocomplete', 'off');
		input.setAttribute('aria-autocomplete', 'list');
		input.setAttribute('aria-controls', this.menu.id);
		this.close();
		this.listen('input', () => this.open());
		this.listen('focus', () => this.open());
		this.listen('blur', () => this.close());
		const keydown = (event: KeyboardEvent) => this.keydown(event);
		input.addEventListener('keydown', keydown);
		this.disposers.push(() => input.removeEventListener('keydown', keydown));
	}
	abstract getSuggestions(query: string): T[];
	abstract renderSuggestion(value: T, el: HTMLElement): void;
	abstract selectSuggestion(value: T, event: MouseEvent | KeyboardEvent): void;
	setValue(value: string): void {
		this.input.value = value;
	}
	onSelect(callback: (value: T, event: MouseEvent | KeyboardEvent) => void): this {
		this.callback = callback;
		return this;
	}
	protected selected(value: T, event: MouseEvent | KeyboardEvent): void {
		this.close();
		this.callback?.(value, event);
	}
	refresh(): void {
		if (this.input.ownerDocument.activeElement === this.input) this.open();
	}
	open(): void {
		this.matches = this.getSuggestions(this.input.value).slice(0, 30);
		this.active = -1;
		this.menu.empty();
		this.input.removeAttribute('aria-activedescendant');
		this.matches.forEach((value, index) => {
			const option = this.menu.createDiv({
				cls: 'obk-suggestion-option',
				attr: { role: 'option', 'aria-selected': 'false' },
			});
			option.id = `${this.menu.id}-${index}`;
			this.renderSuggestion(value, option);
			option.addEventListener('mousedown', (event) => event.preventDefault());
			option.addEventListener('click', (event) => this.selectSuggestion(value, event));
			option.addEventListener('mouseenter', () => this.highlight(index));
		});
		this.menu.hidden = this.matches.length === 0;
		this.input.setAttribute('aria-expanded', String(!this.menu.hidden));
	}
	close(): void {
		this.menu.hidden = true;
		this.active = -1;
		this.input.setAttribute('aria-expanded', 'false');
		this.input.removeAttribute('aria-activedescendant');
	}
	destroy(): void {
		this.close();
		this.disposers.forEach((dispose) => dispose());
		this.disposers = [];
		this.menu.remove();
	}
	private listen(event: 'input' | 'focus' | 'blur', handler: () => void): void {
		this.input.addEventListener(event, handler);
		this.disposers.push(() => this.input.removeEventListener(event, handler));
	}
	private highlight(index: number): void {
		this.active = index;
		Array.from(this.menu.children).forEach((element, position) =>
			element.setAttribute('aria-selected', String(position === index)),
		);
		const option = this.menu.children[index];
		if (option) this.input.setAttribute('aria-activedescendant', option.id);
	}
	private keydown(event: KeyboardEvent): void {
		if (event.isComposing) return;
		if (event.key === 'Escape') {
			this.close();
			return;
		}
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			if (this.menu.hidden) this.open();
			if (!this.matches.length) return;
			event.preventDefault();
			this.highlight(
				this.active < 0
					? event.key === 'ArrowDown'
						? 0
						: this.matches.length - 1
					: (this.active + (event.key === 'ArrowDown' ? 1 : -1) + this.matches.length) % this.matches.length,
			);
		} else if (event.key === 'Enter' && !this.menu.hidden && this.active >= 0) {
			event.preventDefault();
			event.stopImmediatePropagation();
			this.selectSuggestion(this.matches[this.active], event);
		}
	}
}
