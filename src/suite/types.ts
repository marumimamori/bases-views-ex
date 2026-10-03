import { type Plugin } from 'obsidian';
import { type EditorSettings } from '../spotlight/runtime.js';
import { type SuitePreferences } from './preferences.ts';
export interface BasesViewsEXPlugin extends Plugin {
	settings: EditorSettings;
	preferences: SuitePreferences;
	saveSettings(): Promise<void>;
}
