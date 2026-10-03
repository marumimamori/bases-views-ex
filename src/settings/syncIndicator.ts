import { setIcon } from 'obsidian';

/** Feedback for the shared view configuration, without rebuilding its controls. */
export class SyncIndicator {
	readonly element: HTMLElement;
	private timer: number | null = null;
	private pending = 0;
	private closed = false;
	constructor(
		parent: HTMLElement,
		private label: string,
		private layout = 'Kanban',
	) {
		this.element = parent.createSpan({ cls: 'obk-sync-indicator', attr: { role: 'img', 'data-sync-for': label } });
		setIcon(this.element, 'refresh-cw');
		this.state('idle', 'Synced with this Kanban view; changes work in both places.');
	}
	private state(state: string, description: string): void {
		if (this.closed) return;
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.timer = null;
		this.element.setAttribute('data-sync-state', state);
		this.element.title = `${this.label}: ${description.replace(/Kanban/g, this.layout)}`;
		// Obsidian creates another tooltip for aria-label; title supplies the native one.
		this.element.removeAttribute('aria-label');
	}
	pulse(): void {
		if (this.closed || this.pending) return;
		this.state('synced', 'Updated and synced with this Kanban view.');
		this.timer = window.setTimeout(() => {
			this.state('idle', 'Synced with this Kanban view; changes work in both places.');
		}, 1800);
	}
	async run(write: () => Promise<void>): Promise<void> {
		this.pending++;
		this.state('pending', 'Updating this Kanban view…');
		try {
			await write();
			this.pending--;
			this.pulse();
		} catch (error) {
			this.pending--;
			this.state('error', 'Could not sync this change. Check the error message.');
			throw error;
		}
	}
	close(): void {
		this.closed = true;
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.timer = null;
	}
}
