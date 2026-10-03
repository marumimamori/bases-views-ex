import { Setting } from 'obsidian';
import { UNCATEGORIZED_LABEL } from '../constants.ts';
import { readUncategorizedPosition, UNCATEGORIZED_POSITION_OPTIONS } from '../utils/uncategorized.ts';
import { type BoardChange, type BoardModel } from './boardConfig.ts';
import { ColorControl } from './colorControl.ts';
import { SyncIndicator } from './syncIndicator.ts';

/** The fallback participates in sorting but its matching value is permanent. */
export class UncategorizedRow {
	readonly element: HTMLElement;
	private name: HTMLInputElement;
	private color: ColorControl;
	private model: BoardModel | null = null;
	private setShow: (show: boolean) => void = () => {};
	private setPosition: (position: string) => void = () => {};
	private indicators = new Map<string, SyncIndicator>();
	constructor(
		parent: HTMLElement,
		private change: (change: BoardChange) => Promise<void>,
	) {
		this.element = parent.createDiv({
			cls: 'obk-settings-column obk-uncategorized-row',
			attr: { 'data-status-value': UNCATEGORIZED_LABEL },
		});
		this.element.createSpan({
			cls: 'obk-setting-drag',
			text: '⋮⋮',
			attr: { title: 'Drag to reorder', 'aria-label': 'Drag to reorder' },
		});
		const field = (text: string) => {
			const label = this.element.createEl('label', { cls: 'obk-column-field' });
			const heading = label.createSpan({ cls: 'obk-synced-label', text });
			if (text !== 'Value')
				this.indicators.set(text.toLowerCase(), new SyncIndicator(heading, `${text} for ${UNCATEGORIZED_LABEL}`));
			return label;
		};
		const value = field('Value').createEl('input', {
			attr: { type: 'text', 'aria-label': 'Uncategorized value', readonly: '', title: 'Permanent fallback value' },
		});
		value.value = UNCATEGORIZED_LABEL;
		this.name = field('Name').createEl('input', {
			attr: { type: 'text', 'aria-label': 'Display name for Uncategorized' },
		});
		this.name.addEventListener('change', () => {
			void this.run('name', { type: 'name', value: UNCATEGORIZED_LABEL, name: this.name.value });
		});
		this.color = new ColorControl(field('Color'), (color) => {
			void this.run('color', { type: 'color', value: UNCATEGORIZED_LABEL, color });
		});
		this.color.setName(UNCATEGORIZED_LABEL);
		const controls = this.element.createDiv({ cls: 'obk-uncategorized-controls' });
		this.setting(controls, 'Show Uncategorized', 'uncategorized')
			.setDesc('Show cards with no matching column. Hiding them keeps their notes and order.')
			.addToggle((toggle) => {
				toggle.toggleEl.setAttribute('aria-label', 'Show Uncategorized');
				this.setShow = (show) => {
					void toggle.setValue(show);
				};
				toggle.onChange((show) => {
					void this.run('uncategorized', { type: 'uncategorized', show });
				});
			});
		this.setting(controls, 'Position', 'uncategorized-position')
			.setDesc('Keep its current place, or always place this column first or last.')
			.addDropdown((dropdown) => {
				dropdown.selectEl.setAttribute('aria-label', 'Uncategorized position');
				dropdown.addOptions(UNCATEGORIZED_POSITION_OPTIONS);
				this.setPosition = (position) => {
					void dropdown.setValue(position);
				};
				dropdown.onChange((position) => {
					void this.run('uncategorized-position', {
						type: 'uncategorized-position',
						position: readUncategorizedPosition(position),
					});
				});
			});
	}
	update(model: BoardModel): void {
		if (this.model) {
			for (const [key, before, after] of [
				['name', this.model.uncategorized.name, model.uncategorized.name],
				['color', this.model.uncategorized.color, model.uncategorized.color],
				['uncategorized', this.model.showUncategorized, model.showUncategorized],
				['uncategorized-position', this.model.uncategorizedPosition, model.uncategorizedPosition],
			] as const)
				if (before !== after) this.indicators.get(key)?.pulse();
		}
		this.model = model;
		if (this.name.ownerDocument.activeElement !== this.name) this.name.value = model.uncategorized.name;
		this.color.setValue(model.uncategorized.color);
		this.setShow(model.showUncategorized);
		this.setPosition(model.uncategorizedPosition);
	}
	close(): void {
		this.indicators.forEach((indicator) => indicator.close());
	}
	private setting(parent: HTMLElement, name: string, key: string): Setting {
		const setting = new Setting(parent).setName(name);
		const label = setting.nameEl ?? setting.settingEl.querySelector<HTMLElement>('span') ?? setting.settingEl;
		label.classList.add('obk-synced-label');
		this.indicators.set(key, new SyncIndicator(label, name));
		return setting;
	}
	private async run(key: string, change: BoardChange): Promise<void> {
		try {
			await this.indicators.get(key)?.run(() => this.change(change));
		} catch {
			/* The editor reports save failures and restores the row. */
		}
	}
}
