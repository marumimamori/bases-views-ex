import { Setting } from 'obsidian';
import SpotlightRuntime, { type EditorSettings } from '../spotlight/runtime.js';
import { settingsSection } from '../settings/sections.ts';
import { type EditorLayout } from './viewOptions.ts';

interface EditorHost {
	settings: EditorSettings;
	saveSettings(): Promise<void>;
}
type PreferenceKey = Exclude<keyof EditorSettings, 'propertyHeights' | 'propertyOrder'>;
interface Preference {
	key: PreferenceKey;
	name: string;
	description: string;
	kind: 'toggle' | 'number' | 'choice';
	min?: number;
	max?: number;
}
const EDITING: Preference[] = [
	{
		key: 'removeButtonAlwaysVisible',
		name: 'Always show remove × buttons',
		description: 'Each List/Tags value has its × visible. Turn off to show it on hover or focus.',
		kind: 'toggle',
	},
	{
		key: 'preventDuplicateListValues',
		name: 'Prevent duplicate list values',
		description: 'Avoid adding the same list or tag value twice.',
		kind: 'toggle',
	},
	{
		key: 'suggestionScope',
		name: 'Suggestion source',
		description: 'Choose values from the whole vault or the current Base results.',
		kind: 'choice',
	},
	{
		key: 'maxSuggestions',
		name: 'Maximum suggestions',
		description: 'How many autocomplete values appear at once.',
		kind: 'number',
		min: 1,
		max: 100,
	},
	{
		key: 'tagHashDisplay',
		name: 'Display # for Tags',
		description: 'Show a # without rewriting stored tag values.',
		kind: 'toggle',
	},
	{
		key: 'showTypeBadge',
		name: 'Show property type icons and labels',
		description: 'Show the native type beside each field. Click an editable icon to change the vault-wide property type.',
		kind: 'toggle',
	},
];
export function renderEditorSettings(parent: HTMLElement, plugin: EditorHost, layout: EditorLayout): void {
	const editing = settingsSection(
		parent,
		'Property editing',
		'These preferences are shared by Spotlight EX and Cards EX. Changing them in either tab updates both layouts. Individual Base options above remain separate.',
	);
	editing.createEl('p', {
		cls: 'setting-item-description',
		text: 'These editing preferences apply to both Spotlight EX and Cards EX.',
	});
	EDITING.forEach((preference) => addPreference(editing, plugin, preference));
	const attachments = settingsSection(
		parent,
		'Attachments',
		'Properties for images and PDFs use a Markdown companion note. The attachment itself is preserved.',
	);
	addPreference(attachments, plugin, {
		key: 'createBinarySidecars',
		name: 'Create sidecars for attachments',
		description: 'Create filename.ext.md when editing attachment properties and no companion note exists.',
		kind: 'toggle',
	});
	const animation = settingsSection(
		parent,
		'Layout',
		'Size animations respect your system’s reduced-motion setting. Sidebar and property sizes can also be adjusted directly in Spotlight.',
	);
	addPreference(animation, plugin, {
		key: 'animationDuration',
		name: 'Animation duration (ms)',
		description: 'Chip, field and card size animations in both layouts. Default: 140 ms; choose 0 to disable.',
		kind: 'number',
		min: 0,
		max: 2000,
	});
	if (layout === 'spotlight')
		addPreference(animation, plugin, {
			key: 'sidebarWidth',
			name: 'Default sidebar width',
			description: 'Width in pixels. Dragging the live sidebar divider also saves this value.',
			kind: 'number',
			min: 180,
		});
}

function addPreference(parent: HTMLElement, plugin: EditorHost, preference: Preference): void {
	const setting = new Setting(parent).setName(preference.name).setDesc(preference.description);
	let update: (value: string | number | boolean) => void = () => {};
	const save = async (value: string | number | boolean) => {
		Object.assign(plugin.settings, { [preference.key]: value });
		await plugin.saveSettings();
	};
	if (preference.kind === 'toggle')
		setting.addToggle((toggle) => {
			toggle.setValue(Boolean(plugin.settings[preference.key])).onChange((value) => save(value));
			update = (value) => {
				toggle.setValue(Boolean(value));
			};
		});
	else if (preference.kind === 'choice')
		setting.addDropdown((dropdown) => {
			dropdown
				.addOption('vault', 'Whole vault')
				.addOption('base', 'Current Base results')
				.setValue(String(plugin.settings[preference.key]))
				.onChange(save);
			update = (value) => {
				dropdown.setValue(String(value));
			};
		});
	else
		setting.addText((text) => {
			text.inputEl.type = 'number';
			text.inputEl.min = String(preference.min ?? 0);
			if (preference.max !== undefined) text.inputEl.max = String(preference.max);
			text.inputEl.setAttribute('aria-label', preference.name);
			text.setValue(String(plugin.settings[preference.key])).onChange(async (input) => {
				if (!input.trim() || !Number.isFinite(Number(input))) return;
				const value = Math.max(preference.min ?? 0, Math.min(preference.max ?? Infinity, Math.round(Number(input))));
				await save(value);
			});
			update = (value) => {
				text.setValue(String(value));
			};
		});
	const value = SpotlightRuntime.DEFAULT_SETTINGS[preference.key];
	const defaultLabel =
		typeof value === 'boolean'
			? value
				? 'On'
				: 'Off'
			: preference.key === 'suggestionScope'
				? 'Whole vault'
				: String(value);
	setting.addExtraButton((button) => {
		const label = `Reset ${preference.name} to default (${defaultLabel})`;
		button
			.setIcon('rotate-ccw')
			.setTooltip(label)
			.onClick(async () => {
				update(value);
				await save(value);
			});
		button.extraSettingsEl.addClass('spotlight-ex-setting-reset');
		button.extraSettingsEl.setAttribute('aria-label', label);
		button.extraSettingsEl.setAttribute('role', 'button');
		button.extraSettingsEl.tabIndex = 0;
		button.extraSettingsEl.addEventListener('keydown', (event) => {
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				button.extraSettingsEl.click();
			}
		});
	});
}
