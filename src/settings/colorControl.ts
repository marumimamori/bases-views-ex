import { COLOR_PALETTE } from '../constants.ts';

function toHex(color: string): string {
	if (/^#[\da-f]{6}$/i.test(color)) return color;
	const rgb = color.match(/^rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/);
	return rgb
		? `#${rgb
				.slice(1, 4)
				.map((value) => Number(value).toString(16).padStart(2, '0'))
				.join('')}`
		: '#808080';
}

export class ColorControl {
	private select: HTMLSelectElement;
	private picker: HTMLInputElement;
	private swatch: HTMLElement;
	constructor(
		parent: HTMLElement,
		private changed: (value: string) => void,
	) {
		const controls = parent.createDiv({ cls: 'obk-color-controls' });
		this.select = controls.createEl('select');
		this.select.createEl('option', { text: 'No color', attr: { value: '' } });
		for (const choice of COLOR_PALETTE)
			this.select.createEl('option', {
				text: choice.name[0].toUpperCase() + choice.name.slice(1),
				attr: { value: choice.name },
			});
		this.select.createEl('option', { text: 'Custom', attr: { value: 'custom' } });
		this.swatch = controls.createSpan({ cls: 'obk-color-swatch' });
		this.picker = this.swatch.createEl('input', { attr: { type: 'color', title: 'Choose a custom color' } });
		this.select.addEventListener('change', () => {
			const value = this.select.value === 'custom' ? this.picker.value : this.select.value;
			this.setValue(value);
			this.changed(value);
		});
		this.picker.addEventListener('input', () => this.setValue(this.picker.value));
		this.picker.addEventListener('change', () => {
			const value = this.picker.value;
			this.setValue(value);
			this.changed(value);
		});
	}
	setName(name: string): void {
		this.select.setAttribute('aria-label', `Color for ${name}`);
		this.picker.setAttribute('aria-label', `Custom color for ${name}`);
	}
	setValue(value: string): void {
		const palette = COLOR_PALETTE.find((choice) => choice.name === value);
		this.select.value = value.startsWith('#') ? 'custom' : value;
		this.swatch.style.backgroundColor = palette?.cssVar ?? (value || 'transparent');
		this.swatch.classList.toggle('is-empty', !value);
		const resolved = this.swatch.ownerDocument.defaultView?.getComputedStyle(this.swatch).backgroundColor ?? '';
		this.picker.value = toHex(palette ? resolved : value);
	}
}
