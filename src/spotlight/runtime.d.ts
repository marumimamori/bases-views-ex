import { Plugin, type BasesViewConfig } from 'obsidian';

export interface EditorSettings {
	propertyHeights: Record<string, number>;
	propertyOrder: string[];
	sidebarWidth: number;
	showTypeBadge: boolean;
	suggestionScope: string;
	maxSuggestions: number;
	preventDuplicateListValues: boolean;
	removeButtonAlwaysVisible: boolean;
	tagHashDisplay: boolean;
	createBinarySidecars: boolean;
	animationDuration: number;
}
export interface EditorView {
	controller: unknown;
	config: BasesViewConfig;
	onDataUpdated(): void;
	register(cleanup: () => void): void;
}
export default class SpotlightRuntime extends Plugin {
	static DEFAULT_SETTINGS: EditorSettings;
	static ORIGINAL_MIT_LICENSE: string;
	settings: EditorSettings;
	views: Set<EditorView>;
	onload(): Promise<void>;
	loadSettings(): Promise<void>;
	saveSettings(): Promise<void>;
}
