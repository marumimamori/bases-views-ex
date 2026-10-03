import { Notice, type BasesViewConfig } from 'obsidian';
import { BOARD_CONFIG_KEYS } from '../settings/boardConfig.ts';
import { SyncIndicator } from '../settings/syncIndicator.ts';

/** A public-DOM control beside the board, using the same config as the view menu. */
export class ViewControls {
	private element: HTMLElement;
	private toggle: HTMLButtonElement;
	private sync: SyncIndicator;
	private signature: string | null = null;
	constructor(
		parent: HTMLElement,
		private changed: (show: boolean) => void,
	) {
		this.element = parent.createDiv({ cls: 'obk-view-controls' });
		this.element.createSpan({ text: 'Show Uncategorized' });
		this.toggle = this.element.createEl('button', {
			cls: 'obk-visibility-toggle',
			attr: { type: 'button', role: 'switch', 'aria-label': 'Show Uncategorized' },
		});
		this.sync = new SyncIndicator(this.element, 'Board settings');
		this.toggle.addEventListener('click', () => {
			const show = this.toggle.getAttribute('aria-checked') !== 'true';
			void this.sync
				.run(async () => {
					this.changed(show);
				})
				.catch((error: unknown) => {
					new Notice(error instanceof Error ? error.message : 'Could not update board visibility.');
				});
		});
	}
	update(config: BasesViewConfig): void {
		const show = config.get('showUncategorized') !== false;
		this.toggle.setAttribute('aria-checked', String(show));
		this.toggle.classList.toggle('is-enabled', show);
		const signature = JSON.stringify(BOARD_CONFIG_KEYS.map((key) => config.get(key)));
		if (this.signature !== null && this.signature !== signature) this.sync.pulse();
		this.signature = signature;
	}
	close(): void {
		this.sync.close();
		this.element.remove();
	}
}
