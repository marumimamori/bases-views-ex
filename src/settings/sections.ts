/** Help stays in a popover so opening it does not move the settings controls. */
export function settingsSection(parent: HTMLElement, title: string, info: string): HTMLElement {
	const section = parent.createEl('section', { cls: 'obk-settings-section' });
	const heading = section.createEl('h3', { cls: 'obk-section-heading' });
	heading.createSpan({ text: title });
	const help = heading.createSpan({ cls: 'obk-info' });
	const button = help.createEl('button', {
		text: 'i',
		cls: 'obk-info-trigger',
		attr: { type: 'button', 'aria-label': `About ${title}`, 'aria-expanded': 'false' },
	});
	help.createSpan({ text: info, cls: 'obk-info-popover', attr: { role: 'tooltip' } });
	const close = () => {
		help.classList.remove('is-open');
		button.setAttribute('aria-expanded', 'false');
	};
	button.addEventListener('click', () => {
		button.setAttribute('aria-expanded', String(help.classList.toggle('is-open')));
	});
	button.addEventListener('blur', close);
	button.addEventListener('keydown', (event) => {
		if (event.key === 'Escape') close();
	});
	return section.createDiv({ cls: 'obk-section-body' });
}
