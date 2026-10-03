import { settingsSection } from '../settings/sections.ts';
import { MIT_LICENSE } from '../settings/license.ts';
import SpotlightRuntime from '../spotlight/runtime.js';
import { THIRD_PARTY_LICENSES } from './thirdParty.ts';

export const REPOSITORY_URL = 'https://github.com/marumimamori/bases-views-ex';
export const BRAT_INSTALL_URL = 'obsidian://brat?plugin=marumimamori%2Fbases-views-ex';
function steps(parent: HTMLElement, items: string[]): void {
	const list = parent.createEl('ol');
	items.forEach((text) => list.createEl('li', { text }));
}
function link(parent: HTMLElement, text: string, href: string): void {
	parent.createEl('a', { text, attr: { href, target: '_blank', rel: 'noopener noreferrer' } });
}

export function renderSetup(parent: HTMLElement): void {
	const base = settingsSection(
		parent,
		'Start with a Base',
		'All three layouts use the core Bases plugin. Filters, sorting and visible properties are saved independently for each Base view.',
	);
	steps(base, [
		'Enable Bases in Settings → Core plugins, then enable Bases Views EX in Community plugins. Disable the separate Kanban Bases View and Spotlight EX plugins before enabling this combined plugin.',
		'Open a .base file, or run Bases: Create new base. Open the view menu at the top left → Add view, then choose Kanban EX, Spotlight EX or Cards EX under Layout.',
		'Use Properties to select fields, Filter to select files and Sort to set their order. Change an existing view using the arrow beside its name or its right-click menu.',
		'Open the matching tab here, add your Base to its library, then choose the view. Changes to its layout options synchronize with the Base view menu.',
	]);
	const kanban = settingsSection(
		parent,
		'Kanban EX · arrange work',
		'Drag cards between columns and keep project/category labels when custom status matching is used.',
	);
	steps(kanban, [
		'Set Group by to the property containing your statuses. Add custom values, display names and colors, then drag their handles to choose the column order.',
		'Choose Only custom columns, Custom + other columns or Only other columns. Saved custom entries are muted when they are not in use. Card Moves chooses which recognized status labels a move replaces.',
		'Use the permanent Uncategorized row to edit its heading/color, show or hide it, and choose No snap, Always first or Always last. Its saved position survives mode changes.',
	]);
	kanban.createEl('p', {
		text:
			'The view menu also controls swimlanes, card titles, images, wrapping and new-card folders. Value matches an exact property item; Name changes only the heading. Use a note property for moves: formula values are read-only.',
	});
	const spotlight = settingsSection(
		parent,
		'Spotlight EX · preview and edit',
		'Browse one result at a time with its preview and editable property sidebar.',
	);
	spotlight.createEl('p', {
		text:
			'Use Previous, Next or arrow keys to browse notes, images and PDFs. Spotlight Content Property optionally previews a linked file; Hyperlink Property makes a displayed field open the current entry. Drag the sidebar divider or property handles to resize, and drag property names to reorder.',
	});
	const cards = settingsSection(
		parent,
		'Cards EX · editable gallery',
		'Browse many results as cards while keeping large galleries responsive.',
	);
	cards.createEl('p', {
		text:
			'Choose Card size, Image property, Image fit and Image aspect ratio in the Cards EX tab or view menu. Cover fills the box; Contain shows the whole image. Click a card title/background to open it, or a property to edit it. The gallery supports Base groups, lazy images and virtualized rows.',
	});
	const editors = settingsSection(
		parent,
		'Editing in Spotlight and Cards',
		'Both layouts share typed editors, suggestions, per-setting resets and live property synchronization.',
	);
	editors.createEl('p', {
		text:
			'Click an empty dash, property name or free space to add a value. List/Tags values have individual chips: click to rename, use × to remove, and Enter or a suggestion to save and continue. Clicking away saves and closes; Escape cancels unsubmitted input. Type icons change Obsidian’s shared property type. Formula and file properties remain read-only.',
	});
	editors.createEl('p', {
		text:
			'Text, List, Tags, Number, Checkbox, Date and Date & time have typed editors; File, Folder and Property use available native pickers. Cards EX also edits objects and nested arrays as validated JSON. Attachment properties use filename.ext.md companion notes. Editing preferences in either tab apply to both layouts.',
	});
	const beta = settingsSection(
		parent,
		'Beta notice & installation',
		'Install and update the beta through BRAT, or use the manual release files.',
	);
	beta.createEl('p', {
		cls: 'bvx-beta-notice',
		text:
			'This plugin was vibecoded with AI assistance and is still a beta. Be careful: keep a vault backup and try it in a test vault before relying on it for important notes.',
	});
	steps(beta, [
		'Install and enable Obsidian42 – BRAT from Community plugins.',
		'Select Install with BRAT below, or run BRAT: Add a beta plugin for testing and enter marumimamori/bases-views-ex.',
		'Choose the latest beta, then enable Bases Views EX. Keep the separate source plugins disabled; their files and settings can remain for migration and rollback.',
	]);
	link(beta, 'Install with BRAT', BRAT_INSTALL_URL);
	beta.createSpan({ text: ' · ' });
	link(beta, 'Repository & releases', REPOSITORY_URL);
	beta.createSpan({ text: ' · ' });
	link(beta, 'BRAT guide', 'https://tfthacker.com/BRAT');
}

export function renderThanks(parent: HTMLElement): void {
	const credits = settingsSection(
		parent,
		'Thanks & attribution',
		'This combined plugin retains both original MIT copyrights and full permission notices.',
	);
	credits.createEl('p', {
		text:
			'Thank you to I. Welch Canavan for Kanban Bases View, including drag-and-drop boards, swimlanes and column colors.',
	});
	link(credits, 'Original Kanban project', 'https://github.com/xiwcx/obsidian-bases-kanban');
	credits.createEl('p', {
		text:
			'Thank you to Brendan Early / mymindstorm for Obsidian Bases Spotlight View, including previews, navigation, sidecar notes and property layouts.',
	});
	link(credits, 'Original Spotlight project', 'https://github.com/mymindstorm/obsidian-bases-spotlight-view');
	credits.createEl('p', {
		text:
			'Spotlight EX, Cards EX and this combined edition are maintained by Maru. Thanks to TfTHacker for BRAT and the SortableJS contributors for drag-and-drop. These derivatives do not imply endorsement by the original authors.',
	});
	link(credits, 'Maru', 'https://marumimamori.me/');
	for (const [name, license] of [
		['Kanban · MIT license', MIT_LICENSE],
		['Spotlight · MIT license', SpotlightRuntime.ORIGINAL_MIT_LICENSE],
		['Third-party licenses', THIRD_PARTY_LICENSES],
	]) {
		settingsSection(parent, name ?? '', 'Full notices are also included with source and release files.').createEl('pre', {
			text: license,
			cls: 'obk-license',
		});
	}
}
