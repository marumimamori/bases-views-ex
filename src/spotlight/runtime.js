/*
 * Spotlight EX
 *
 * Derived from "Obsidian Bases Spotlight View" by Brendan Early (mymindstorm):
 * https://github.com/mymindstorm/obsidian-bases-spotlight-view
 *
 * Original project and this derivative are distributed under the MIT License.
 * See LICENSE and NOTICE.md.
 */

const {
  Plugin,
  BasesView,
  MarkdownRenderer,
  TFile,
  PluginSettingTab,
  Setting,
  Notice,
  Menu,
  setIcon,
} = require('obsidian');

// Persisted identifier: retain it so existing Base views survive the branding change.
const VIEW_TYPE = 'bases-spotlight-view-expanded';
const CARDS_VIEW_TYPE = 'spotlight-ex-cards';
const REPOSITORY_URL = 'https://github.com/marumimamori/spotlight-ex';
const UPSTREAM_URL = 'https://github.com/mymindstorm/obsidian-bases-spotlight-view';

const ORIGINAL_MIT_LICENSE = `MIT License

Copyright (c) 2026 Brendan Early

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

const DEFAULT_SETTINGS = {
  propertyHeights: {},
  propertyOrder: [],
  sidebarWidth: 330,
  showTypeBadge: true,
  suggestionScope: 'vault',
  maxSuggestions: 12,
  preventDuplicateListValues: true,
  removeButtonAlwaysVisible: true,
  tagHashDisplay: true,
  createBinarySidecars: true,
  animationDuration: 140,
};

function normalizeAnimationDuration(value) {
  const duration = Number(value);
  if (value == null || value === '' || !Number.isFinite(duration)) return DEFAULT_SETTINGS.animationDuration;
  return Math.max(0, Math.min(2000, Math.round(duration)));
}

const PROPERTY_TYPES = {
  text: { name: 'Text', icon: 'lucide-text', native: 'text' },
  list: { name: 'List', icon: 'lucide-list', native: 'multitext' },
  tags: { name: 'Tags', icon: 'lucide-tags', native: 'tags' },
  number: { name: 'Number', icon: 'lucide-binary', native: 'number' },
  checkbox: { name: 'Checkbox', icon: 'lucide-check-square', native: 'checkbox' },
  date: { name: 'Date', icon: 'lucide-calendar', native: 'date' },
  datetime: { name: 'Date & time', icon: 'lucide-clock', native: 'datetime' },
  file: { name: 'File', icon: 'lucide-file', native: 'file' },
  folder: { name: 'Folder', icon: 'lucide-folder', native: 'folder' },
  property: { name: 'Property', icon: 'lucide-info', native: 'property' },
  complex: { name: 'Object', icon: 'lucide-braces' },
  readonly: { name: 'Read-only', icon: 'lucide-lock' },
};

function localDateTimeValue(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().replace(' ', 'T');
  if (/([zZ]|[+-]\d{2}:?\d{2})$/.test(normalized)) {
    const date = new Date(normalized);
    if (!Number.isFinite(date.getTime())) return '';
    const pad = (number) => String(number).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }
  return normalized;
}

function validPropertyValue(type, value) {
  if (value == null) return true;
  if (type === 'list' || type === 'tags') {
    return typeof value === 'string' || (Array.isArray(value)
      && value.every((item) => typeof item === 'string' || (typeof item === 'number' && Number.isFinite(item))));
  }
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'checkbox') return typeof value === 'boolean';
  if (type === 'date' || type === 'datetime') {
    const text = type === 'datetime' ? localDateTimeValue(value) : value;
    if (typeof text !== 'string') return false;
    const match = text.match(type === 'date'
      ? /^(\d{4})-(\d{2})-(\d{2})$/
      : /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/);
    if (!match) return false;
    const [, year, month, day, hour = '0', minute = '0', second = '0'] = match;
    const date = new Date(0);
    date.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
    return date.getUTCFullYear() === Number(year) && date.getUTCMonth() === Number(month) - 1
      && date.getUTCDate() === Number(day) && Number(hour) < 24 && Number(minute) < 60 && Number(second) < 60;
  }
  return typeof value === 'string';
}

function isObject(value) {
  return value !== null && typeof value === 'object';
}

function unwrapValue(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(unwrapValue);
  if (isObject(value) && Object.prototype.hasOwnProperty.call(value, 'value')) {
    return unwrapValue(value.value);
  }
  if (value && typeof value.length === 'function' && typeof value.get === 'function') {
    return Array.from({ length: value.length() }, (_, index) => unwrapValue(value.get(index)));
  }
  if (value && typeof value.isTruthy === 'function') return value.isTruthy() ? value.toString() : null;
  return value;
}

function toComparableString(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch (_err) {
    return String(value);
  }
}

function normalizeType(type, propName, rawValue) {
  const lower = String(type || '').toLowerCase();
  if (lower === 'multitext' || lower === 'list' || lower === 'aliases') return 'list';
  if (lower === 'tags' || lower === 'tag') return 'tags';
  if (lower === 'checkbox' || lower === 'boolean') return 'checkbox';
  if (lower === 'number') return 'number';
  if (lower === 'date') return 'date';
  if (lower === 'datetime' || lower === 'date-time') return 'datetime';
  if (lower === 'text' || lower === 'string') return 'text';
  if (lower === 'file' || lower === 'folder' || lower === 'property') return lower;
  if (lower && lower !== 'unknown') return lower;

  const key = String(propName || '').toLowerCase();
  if (key === 'tags') return 'tags';
  if (key === 'aliases' || key === 'cssclasses') return 'list';
  if (Array.isArray(rawValue)) return key === 'tags' ? 'tags' : 'list';
  if (typeof rawValue === 'boolean') return 'checkbox';
  if (typeof rawValue === 'number') return 'number';
  if (typeof rawValue === 'string' && validPropertyValue('date', rawValue)) return 'date';
  if (typeof rawValue === 'string' && validPropertyValue('datetime', rawValue)) return 'datetime';
  if (typeof rawValue === 'string' || rawValue == null) return 'text';
  return 'complex';
}

function sidecarOriginalPath(path) {
  const match = String(path || '').match(/^(.*\.(png|jpe?g|gif|bmp|svg|webp|pdf|avif|heic|heif))\.md$/i);
  return match ? match[1] : null;
}

function isEditablePropertyId(propId) {
  if (!propId) return false;
  if (propId.startsWith('note.')) return true;
  return !propId.includes('.');
}

function frontmatterKeyFromPropertyId(propId) {
  if (propId.startsWith('note.')) return propId.slice(5);
  if (!propId.includes('.')) return propId;
  return null;
}

function extractWikilink(value) {
  const values = Array.isArray(value) ? value : [value];
  for (const item of values) {
    const str = toComparableString(unwrapValue(item));
    const match = str.match(/!?\[\[([^\]]+)\]\]/);
    if (match) {
      const inside = match[1];
      const target = inside.split('|')[0].split('#')[0];
      if (target) return target;
    }
  }
  return null;
}

function isWikiLinkString(value) {
  // Native Properties displays embed syntax literally, rather than as a link chip.
  return typeof value === 'string' && /^\[\[[^\]]+\]\]$/.test(value.trim());
}

function displayWikiLink(value) {
  const match = String(value).trim().match(/^\[\[([^\]]+)\]\]$/);
  if (!match) return String(value);
  const inside = match[1];
  const alias = inside.includes('|') ? inside.split('|').slice(1).join('|') : null;
  const target = inside.split('|')[0];
  return alias || target.split('#')[0].split('/').pop() || target;
}

// Shared property editing and metadata writes for both layouts.
class PropertyEditorView extends BasesView {
  constructor(controller, containerEl, plugin) {
    super(controller);
    this.plugin = plugin;
    this.controller = controller;
    this.containerEl = containerEl;
    this.pendingWrites = 0;
    this.writeQueue = Promise.resolve();
    this.pendingPropertyWrites = new Map();
    this.recoveredDrafts = new Map();
    this.editorCleanups = [];
    this.suggestionCache = new Map();
    this.listEditors = new Map();
    this.draftSavers = new Map();
    this.propertyValueHeights = new Map();
    this.unloaded = false;
    this.applyAnimationSettings();
    const win = containerEl.ownerDocument.defaultView;
    this.windowDraftHandler = () => {
      const focused = this.containerEl.ownerDocument.activeElement;
      if (this.containerEl.contains(focused)) focused.blur?.();
      this.flushEditorDrafts();
    };
    for (const event of ['blur', 'pagehide', 'beforeunload']) win.addEventListener(event, this.windowDraftHandler);
  }

  registerDraftSaver(target, save) {
    this.draftSavers.set(target, save);
    const cleanup = () => this.draftSavers.delete(target);
    cleanup.target = target;
    this.editorCleanups.push(cleanup);
  }

  async flushEditorDrafts(container = this.containerEl, cancel = false) {
    const saves = [...this.draftSavers].filter(([target]) => container.contains(target)).map(([, save]) => save(cancel));
    const results = await Promise.allSettled(saves);
    return results.every((result) => result.status === 'fulfilled' && result.value !== false);
  }

  unloadEditors() {
    // Start the writes while the view and its draft controls still exist.
    this.flushEditorDrafts();
    const win = this.containerEl.ownerDocument.defaultView;
    for (const event of ['blur', 'pagehide', 'beforeunload']) win.removeEventListener(event, this.windowDraftHandler);
  }

  activatePane() {
    this.activatingPane = true;
    const win = this.containerEl.ownerDocument.defaultView;
    win.clearTimeout(this.activationTimer);
    this.activationTimer = win.setTimeout(() => {
      this.activatingPane = false;
      this.scheduleDataRender();
    }, 0);
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view.containerEl.contains(this.containerEl) && this.app.workspace.activeLeaf !== leaf) {
        this.app.workspace.setActiveLeaf(leaf, { focus: false });
      }
    });
  }

  resolvePreviewFile(file) {
    const originalPath = sidecarOriginalPath(file.path);
    if (originalPath) {
      const original = this.app.vault.getAbstractFileByPath(originalPath);
      if (original instanceof TFile) return original;
    }
    return file;
  }

  alignPropertyControls(property) {
    const icon = property.querySelector('.spotlight-ex-type-icon');
    const values = property.querySelector('.spotlight-ex-property-value-container');
    if (!icon || !values.querySelector('.spotlight-ex-chip-list, .spotlight-ex-checkbox, .spotlight-ex-empty-value')) return;
    const name = property.querySelector('.spotlight-ex-property-name');
    const win = property.ownerDocument.defaultView;
    const align = () => {
      if (!property.isConnected) return;
      const iconRect = icon.getBoundingClientRect();
      if (!iconRect.width) return;
      const valueRect = values.getBoundingClientRect();
      // Convert visual distances back to layout pixels when a parent is scaled.
      const scale = property.getBoundingClientRect().width / property.offsetWidth || 1;
      const measurements = {
        'width': iconRect.width / scale,
        'offset': (iconRect.left - valueRect.left) / scale,
        'gap': (name.getBoundingClientRect().left - iconRect.right) / scale,
      };
      for (const [key, measurement] of Object.entries(measurements)) {
        const variable = `--spotlight-ex-value-icon-${key}`;
        const value = `${measurement}px`;
        if (property.style.getPropertyValue(variable) !== value) property.style.setProperty(variable, value);
      }
    };
    const observer = new win.ResizeObserver(align);
    for (const element of [icon, name, values]) observer.observe(element, { box: 'border-box' });
    const frame = win.requestAnimationFrame(align);
    const cleanup = () => { observer.disconnect(); win.cancelAnimationFrame(frame); };
    cleanup.target = property;
    this.editorCleanups.push(cleanup);
  }

  applyAnimationSettings() {
    this.containerEl.style.setProperty('--spotlight-ex-animation-duration', `${normalizeAnimationDuration(this.plugin.settings.animationDuration)}ms`);
  }

  animateContentSize(box, content, initialHeight = null, remember = null) {
    const win = box.ownerDocument.defaultView;
    let previous = initialHeight, animation = null;
    const observer = new win.ResizeObserver(() => {
      if (!box.isConnected) return;
      const style = win.getComputedStyle(box);
      const extra = ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth']
        .reduce((sum, key) => sum + (parseFloat(style[key]) || 0), 0);
      const height = Math.max(parseFloat(style.minHeight) || 0, content.getBoundingClientRect().height + extra);
      if (previous !== null && Math.abs(height - previous) < 0.5) return;
      const from = animation?.playState === 'running' ? box.getBoundingClientRect().height : previous ?? height;
      animation?.cancel();
      const duration = normalizeAnimationDuration(this.plugin.settings.animationDuration);
      if (duration && previous !== null && Math.abs(height - from) > 0.5 && !win.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        // Observe the natural content, not the animated outer box, to avoid a resize feedback loop.
        animation = box.animate([{ height: `${from}px` }, { height: `${height}px` }], { duration, easing: 'ease-out' });
      }
      previous = height;
      remember?.(height);
    });
    observer.observe(content);
    const cleanup = () => {
      observer.disconnect();
      // A sidebar refresh may replace the box midway through the same transition.
      if (animation?.playState === 'running') remember?.(box.getBoundingClientRect().height);
      animation?.cancel();
    };
    cleanup.target = box; this.editorCleanups.push(cleanup);
  }

  animatePropertyValue(container) {
    // Cards animate their persistent shell, which also covers editor activation and cover changes.
    if (this.type === CARDS_VIEW_TYPE || container.querySelector(':scope > .spotlight-ex-value-content')) return;
    const children = [...container.childNodes];
    const content = container.createDiv('spotlight-ex-value-content');
    content.append(...children);
    const key = container.closest('.spotlight-ex-property')?.dataset.prop;
    this.animateContentSize(container, content, this.propertyValueHeights.get(key) ?? null,
      (height) => this.propertyValueHeights.set(key, height));
  }

  openPropertyTypeMenu(event, key, currentType) {
    const manager = this.app.metadataTypeManager;
    if (!manager?.setType) return;
    const menu = new Menu();
    const reserved = { tags: 'tags', aliases: 'aliases', cssclasses: 'multitext' }[key.toLowerCase()];
    for (const [type, details] of Object.entries(PROPERTY_TYPES)) {
      if (!details.native || type === 'tags' || (reserved && details.native !== reserved)) continue;
      if (manager.getWidget && manager.getWidget(details.native)?.type !== details.native) continue;
      menu.addItem((item) => item.setTitle(details.name).setIcon(details.icon).setChecked(type === currentType)
        .onClick(async () => {
          try { await manager.setType(key, details.native); this.syncSidebarProperties(); }
          catch (error) { new Notice(`Could not change the type of “${key}”.`); }
        }));
    }
    menu.showAtMouseEvent(event);
  }

  getMetadataFile(file) {
    if (!(file instanceof TFile)) return null;
    if (sidecarOriginalPath(file.path)) return file;
    if (file.extension === 'md') return file;
    const sidecar = this.app.vault.getAbstractFileByPath(`${file.path}.md`);
    return sidecar instanceof TFile ? sidecar : null;
  }

  async ensureMetadataFile(file) {
    if (!(file instanceof TFile)) return null;
    const existing = this.getMetadataFile(file);
    if (existing) return existing;
    if (file.extension === 'md') return file;
    if (!this.plugin.settings.createBinarySidecars) return null;

    const sidecarPath = `${file.path}.md`;
    try {
      const created = await this.app.vault.create(sidecarPath, '');
      return created instanceof TFile ? created : null;
    } catch (err) {
      const existing = this.getMetadataFile(file);
      if (existing) return existing;
      console.error('[Spotlight EX] Could not create sidecar', err);
      new Notice(`Could not create metadata sidecar: ${sidecarPath}`);
      return null;
    }
  }

  readRawFrontmatterValue(file, key) {
    if (!(file instanceof TFile)) return undefined;
    const cache = this.app.metadataCache.getFileCache(file);
    return cache?.frontmatter ? cache.frontmatter[key] : undefined;
  }

  getPropertyType(key, rawValue) {
    if (isObject(rawValue) && (!Array.isArray(rawValue) || rawValue.some(isObject))) return 'complex';
    const manager = this.app.metadataTypeManager;
    let declared = null;
    try {
      declared = manager?.getAssignedWidget?.(key) || manager?.getAssignedType?.(key)
        || manager?.getTypeInfo?.(key, rawValue)?.expected?.type;
      if (!declared) {
        const info = manager?.getPropertyInfo?.(key);
        declared = info?.widget || info?.type || null;
      }
    } catch (_err) {
      declared = null;
    }
    if (!declared) declared = this.plugin.getStoredPropertyType(key);
    return normalizeType(declared, key, rawValue);
  }

  getPropertyWidget(key, rawValue) {
    const manager = this.app.metadataTypeManager;
    try {
      const nativeType = manager?.getAssignedWidget?.(key)
        || manager?.getTypeInfo?.(key, rawValue)?.expected?.type
        || PROPERTY_TYPES[this.getPropertyType(key, rawValue)]?.native;
      return nativeType ? manager?.getWidget?.(nativeType) : null;
    } catch (error) { return null; }
  }

  renderTypedEditor(entry, entries, key, propId, type, rawValue, container) {
    container.empty();
    container.addClass('spotlight-ex-editor-container');
    if (type !== 'complex' && !validPropertyValue(type, rawValue)) {
      container.createDiv({ text: `Stored value does not match ${PROPERTY_TYPES[type]?.name || type}. Enter a new value to replace it.`, cls: 'spotlight-ex-type-mismatch' });
      container.createEl('pre', { text: toComparableString(rawValue), cls: 'spotlight-ex-mismatched-value' });
      rawValue = undefined;
    }

    switch (type) {
      case 'list':
      case 'tags':
        this.renderMultiValueEditor(entry, entries, key, type, rawValue, container);
        break;
      case 'checkbox':
        this.renderCheckboxEditor(entry, key, rawValue, container);
        break;
      case 'number':
        this.renderScalarInput(entry, key, 'number', rawValue, container);
        break;
      case 'date':
        this.renderScalarInput(entry, key, 'date', rawValue, container);
        break;
      case 'datetime':
        this.renderScalarInput(entry, key, 'datetime-local', rawValue, container);
        break;
      case 'complex':
        if (this.allowStructuredEditing) this.renderStructuredEditor(entry, key, rawValue, container);
        else this.renderComplexReadOnly(rawValue, container);
        break;
      case 'file':
      case 'folder':
      case 'property':
        this.renderNativeEditor(entry, key, type, rawValue, container);
        break;
      case 'text':
      default:
        if (type === 'text') this.renderTextEditor(entry, key, rawValue, container);
        else this.renderNativeEditor(entry, key, type, rawValue, container);
        break;
    }
    this.animatePropertyValue(container);
  }

  renderMultiValueEditor(entry, entries, key, type, rawValue, container, options = {}) {
    const values = rawValue == null ? [] : (Array.isArray(rawValue) ? [...rawValue] : [rawValue]);
    const listEl = container.createDiv('spotlight-ex-chip-list');
    const addArea = container.createDiv('spotlight-ex-add-area');
    const property = container.closest('.spotlight-ex-property');
    const controller = { editor: null, switching: false, disposed: false };
    controller.open = async (intent = null) => {
      if (options.activate) return options.activate(intent);
      if (controller.editor) {
        const target = controller.editor.renameTarget;
        if (!controller.editor.finishing && ((!intent && !controller.editor.inline)
          || (intent && target && toComparableString(intent.value) === toComparableString(target.value) && intent.occurrence === target.occurrence))) {
          controller.editor.input.focus(); return;
        }
        controller.switching = true;
        const saved = await controller.editor.finish(false);
        controller.switching = false;
        if (!saved || controller.disposed) return;
      }
      if (!container.isConnected || this.unloaded) return;
      const label = intent ? [...listEl.querySelectorAll('.spotlight-ex-chip-label')].find((label) => {
        const index = Number(label.parentElement.dataset.index);
        return toComparableString(values[index]) === toComparableString(intent.value)
          && values.slice(0, index).filter((item) => toComparableString(item) === toComparableString(intent.value)).length === intent.occurrence;
      }) : null;
      if (intent && !label) return;
      this.openListValueEditor(entry, entries, key, type, values, addArea, updateValues, intent, controller, label, renderChips);
    };
    controller.finish = (cancel) => controller.editor?.finish(cancel) ?? true;
    this.listEditors.set(container, controller);
    this.registerDraftSaver(container, controller.finish);
    const updateValues = async (update) => {
      const result = await this.writeProperty(entry.file, key, (stored) => {
        const current = stored == null ? [] : (Array.isArray(stored) ? [...stored] : [stored]);
        return update(current);
      }, type);
      if (!result) return false;
      values.splice(0, values.length, ...result.value);
      if (listEl.isConnected) renderChips();
      return true;
    };

    const renderChips = () => {
      // Keep the exact chip and selection mounted until its rename has finished saving.
      if (controller.editor?.inline) return;
      const restoreFocus = listEl.contains(listEl.ownerDocument.activeElement);
      listEl.empty();
      if (!values.length) {
        listEl.createSpan({ text: '—', cls: 'spotlight-ex-empty-value', attr: { role: 'button', tabindex: '0', 'aria-label': `Add ${key} value` } });
      }

      values.slice(0, options.limit || values.length).forEach((value, index) => {
        const chip = listEl.createDiv('spotlight-ex-chip');
        chip.dataset.index = String(index);
        const label = chip.createSpan('spotlight-ex-chip-label');
        this.renderChipLabel(label, value, type, entry.file, () => controller.open({ value, occurrence: values.slice(0, index).filter((item) => toComparableString(item) === toComparableString(value)).length }));

        const remove = chip.createEl('button', {
          text: '×',
          cls: 'spotlight-ex-chip-remove',
          attr: { 'aria-label': `Remove ${toComparableString(value)}`, title: 'Remove value' },
        });
        remove.addEventListener('mousedown', (event) => event.preventDefault());
        if (!this.plugin.settings.removeButtonAlwaysVisible) remove.addClass('spotlight-ex-chip-remove-hover');
        remove.addEventListener('click', async (event) => {
          event.preventDefault();
          event.stopPropagation();
          const wantedOccurrence = values.slice(0, index).filter((item) => toComparableString(item) === toComparableString(value)).length;
          if (controller.editor?.inline) {
            controller.switching = true;
            const target = controller.editor.renameTarget;
            const saved = await controller.finish(target?.value === value && target.occurrence === wantedOccurrence);
            controller.switching = false;
            if (!saved) return;
          }
          await updateValues((current) => {
            let occurrence = 0;
            const found = current.findIndex((item) => toComparableString(item) === toComparableString(value) && occurrence++ === wantedOccurrence);
            if (found >= 0) current.splice(found, 1);
            return current;
          });
          if (!controller.editor) container.dispatchEvent(new (container.ownerDocument.defaultView.CustomEvent)('spotlight-ex-editor-closed', { bubbles: true }));
        });
      });
      if (options.limit && values.length > options.limit) listEl.createSpan({ text: `+${values.length - options.limit}`, cls: 'spotlight-ex-more-values' });
      if (restoreFocus) {
        const next = container.querySelector('.spotlight-ex-add-input')
          || listEl.querySelector('.spotlight-ex-chip-remove')
          || container;
        if (next) next.focus();
        else { listEl.tabIndex = -1; listEl.focus(); }
      }
    };
    renderChips();
    const openFromProperty = (event) => {
      if (event.target.closest('button, input, textarea, select, a, summary, pre, .spotlight-ex-property-resizer, .spotlight-ex-chip-label, .spotlight-ex-recovered-draft')) return;
      event.stopPropagation(); controller.open();
    };
    const openFromKeyboard = (event) => {
      if ((event.key === 'Enter' || event.key === ' ') && (event.target === listEl || event.target === name || event.target.classList.contains('spotlight-ex-empty-value'))) {
        event.preventDefault(); event.stopPropagation(); controller.open();
      }
    };
    const name = property?.querySelector('.spotlight-ex-property-name');
    listEl.tabIndex = 0; listEl.setAttribute('role', 'group'); listEl.setAttribute('aria-label', `${key} values; Enter to add`);
    if (name) { name.tabIndex = 0; name.setAttribute('role', 'button'); name.setAttribute('aria-label', `Add ${key} value`); }
    property?.addClass('spotlight-ex-click-to-edit');
    property?.addEventListener('click', openFromProperty);
    property?.addEventListener('keydown', openFromKeyboard);
    const cleanup = () => {
      controller.disposed = true; this.listEditors.delete(container);
      property?.removeEventListener('click', openFromProperty);
      property?.removeEventListener('keydown', openFromKeyboard);
    };
    cleanup.target = container; this.editorCleanups.push(cleanup);
    this.animatePropertyValue(container);
    return controller;
  }

  renderChipLabel(label, value, type, sourceFile, edit = null) {
    const stringValue = toComparableString(value);
    if (isWikiLinkString(stringValue)) {
      label.addClass('spotlight-ex-chip-link');
      label.setText(displayWikiLink(stringValue));
      label.title = stringValue;
    } else if (type === 'tags' && this.plugin.settings.tagHashDisplay) {
      label.setText(stringValue.startsWith('#') ? stringValue : `#${stringValue}`);
    } else {
      label.setText(stringValue);
    }
    if (edit) {
      label.tabIndex = 0; label.setAttribute('role', 'button');
      label.setAttribute('aria-label', `Rename ${stringValue}`);
      label.addEventListener('mousedown', (event) => { if (event.target === label) event.preventDefault(); });
      const activate = (event) => {
        if (label.querySelector('.spotlight-ex-rename-input')) return;
        event.preventDefault(); event.stopPropagation();
        if (isWikiLinkString(stringValue) && (event.ctrlKey || event.metaKey)) this.openWikiLink(stringValue, sourceFile, event);
        else edit();
      };
      label.addEventListener('click', activate);
      label.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') activate(event); });
    }
  }

  openWikiLink(wikilink, sourceFile, event) {
    const match = String(wikilink).match(/!?\[\[([^\]]+)\]\]/);
    if (!match) return;
    const target = match[1].split('|')[0];
    const sourcePath = sourceFile instanceof TFile ? sourceFile.path : '';
    const linkPath = target.split('#')[0];
    const dest = this.app.metadataCache.getFirstLinkpathDest(linkPath, sourcePath);
    if (!(dest instanceof TFile)) return;
    const newLeaf = !!(event?.ctrlKey || event?.metaKey || event?.button === 1);
    this.app.workspace.getLeaf(newLeaf).openFile(dest);
  }

  openListValueEditor(entry, entries, key, type, currentValues, addArea, updateValues, intent, controller, label, renderChips) {
    const inline = !!intent;
    if (inline) {
      label.empty(); label.removeAttribute('role'); label.removeAttribute('aria-label'); label.removeAttribute('tabindex');
      label.parentElement.addClass('spotlight-ex-chip-editing');
    }
    const editor = inline ? label.createSpan('spotlight-ex-inline-editor') : addArea.createDiv('spotlight-ex-add-editor');
    const input = editor.createEl('input', {
      type: 'text',
      cls: inline ? 'spotlight-ex-rename-input' : 'spotlight-ex-add-input',
      attr: { placeholder: type === 'tags' ? 'Add tag…' : 'Add value…' },
    });
    const error = editor.createDiv({ cls: 'spotlight-ex-list-error', attr: { role: 'alert' } });
    const suggestions = editor.createDiv('spotlight-ex-suggestions');
    suggestions.style.display = 'none';
    let activeSuggestion = -1;
    let visibleSuggestions = [];
    const pendingValues = new Set();
    const jobs = new Set();
    const state = { input, inline, renameTarget: intent, finishing: false };
    controller.editor = state;
    if (intent) {
      input.value = toComparableString(intent.value);
      input.placeholder = type === 'tags' ? 'Rename tag…' : 'Rename value…';
      input.setAttribute('aria-label', `Rename ${toComparableString(intent.value)}`);
    }

    const close = (continueAdding = false) => {
      if (controller.editor !== state) return;
      const restoreFocus = input.ownerDocument.activeElement === input;
      const resumeAdding = inline && continueAdding && restoreFocus && !controller.disposed && !this.unloaded && addArea.isConnected;
      const index = inline ? Number(label.parentElement.dataset.index) : -1;
      controller.editor = null;
      editor.remove();
      if (inline) {
        const list = label.closest('.spotlight-ex-chip-list');
        renderChips();
        if (restoreFocus && !resumeAdding && !controller.disposed && !this.unloaded) {
          const chips = list.querySelectorAll('.spotlight-ex-chip-label');
          (chips[Math.min(index, chips.length - 1)] || list.querySelector('.spotlight-ex-empty-value'))?.focus();
        }
      }
      if (resumeAdding) controller.open();
      else if (addArea.isConnected) addArea.dispatchEvent(new (addArea.ownerDocument.defaultView.CustomEvent)('spotlight-ex-editor-closed', { bubbles: true }));
      this.scheduleDataRender();
    };

    const normalizeAddedValue = (text) => {
      const trimmed = text.trim();
      if (type === 'tags' && trimmed.startsWith('#')) return trimmed.slice(1);
      return trimmed;
    };

    const submit = (forcedValue = null, keepOpen = true) => {
      let value = normalizeAddedValue(forcedValue == null ? input.value : forcedValue);
      const target = state.renameTarget;
      if (!value && !target) return Promise.resolve(true);
      const removing = !!target && value === '';

      // List properties can legally contain numbers. If all existing values are
      // numeric, keep the item type numeric rather than silently changing it.
      if (!removing && type === 'list' && (typeof target?.value === 'number' || (currentValues.length > 0 && currentValues.every((item) => typeof item === 'number')))) {
        const numeric = Number(value);
        if (!Number.isNaN(numeric)) value = numeric;
      }

      const comparable = toComparableString(value);
      const duplicate = pendingValues.has(comparable)
        || currentValues.some((existing) => toComparableString(existing) === comparable && (!target || toComparableString(target.value) !== comparable));
      if (duplicate && this.plugin.settings.preventDuplicateListValues) {
        input.addClass('spotlight-ex-input-error');
        error.setText('This value already exists. Change it or press Escape to cancel.');
        return Promise.resolve(false);
      }
      const draft = input.value;
      pendingValues.add(comparable);
      input.value = '';
      if (inline) input.readOnly = true;
      delete input.dataset.dirty;
      state.renameTarget = null;
      if (!inline) {
        input.placeholder = type === 'tags' ? 'Add tag…' : 'Add value…';
        input.removeAttribute('aria-label');
      }
      if (keepOpen) input.focus();
      refreshSuggestions();
      const job = updateValues((current) => {
        let index = -1;
        if (target) {
          let occurrence = 0;
          index = current.findIndex((item) => toComparableString(item) === toComparableString(target.value) && occurrence++ === target.occurrence);
          if (index < 0) throw new Error('The value being renamed changed elsewhere.');
          if (removing) { current.splice(index, 1); return current; }
          if (toComparableString(target.value) === comparable) return current;
        }
        if (this.plugin.settings.preventDuplicateListValues && current.some((existing, i) => i !== index && toComparableString(existing) === comparable)) {
          if (target) throw new Error('This value already exists.');
          return current;
        }
        if (target) { current[index] = value; return current; }
        return [...current, value];
      }).then((saved) => {
        pendingValues.delete(comparable);
        if (!editor.isConnected) return saved;
        if (!saved) {
          input.readOnly = false;
          if (!input.value) { input.value = draft || toComparableString(value); state.renameTarget = target; }
          input.dataset.dirty = 'true'; input.addClass('spotlight-ex-input-error');
          error.setText(`Could not save “${draft || value}”. Your input is still here; press Enter to retry.`);
        } else { input.removeClass('spotlight-ex-input-error'); error.empty(); }
        refreshSuggestions(); return saved;
      }).finally(() => jobs.delete(job));
      jobs.add(job); return job;
    };

    state.finish = (cancel = false, continueAdding = false) => {
      if (cancel) { close(); return Promise.resolve(true); }
      if (state.finishing) return state.finishing;
      state.finishing = (async () => {
        if ((input.value.trim() || (state.renameTarget && input.dataset.dirty === 'true')) && !await submit(null, false)) return false;
        const results = await Promise.all([...jobs]);
        if (results.some((saved) => !saved) || input.value.trim() || input.classList.contains('spotlight-ex-input-error')) return false;
        close(continueAdding); return true;
      })().finally(() => { state.finishing = false; });
      return state.finishing;
    };

    const refreshSuggestions = () => {
      const rawQuery = input.value.trim();
      const query = rawQuery.replace(/^#/, '').toLowerCase();
      const candidateSet = new Set(this.getSuggestions(entries, key, type));
      const looksLikeWikiList = type === 'list' && (
        rawQuery.startsWith('[[') || currentValues.some((item) => isWikiLinkString(toComparableString(item)))
      );
      if (looksLikeWikiList) {
        for (const candidate of this.getWikiLinkSuggestions(rawQuery)) candidateSet.add(candidate);
      }
      const candidates = Array.from(candidateSet)
        .filter((candidate) => !currentValues.some((v) => toComparableString(v) === candidate))
        .filter((candidate) => !pendingValues.has(candidate))
        .filter((candidate) => !query || candidate.toLowerCase().includes(query))
        .slice(0, Math.max(1, Number(this.plugin.settings.maxSuggestions) || 12));
      visibleSuggestions = candidates;
      activeSuggestion = -1;
      suggestions.empty();
      if (!candidates.length) {
        suggestions.style.display = 'none';
        return;
      }
      suggestions.style.display = 'block';
      candidates.forEach((candidate, index) => {
        const item = suggestions.createDiv('spotlight-ex-suggestion');
        item.setText(type === 'tags' && this.plugin.settings.tagHashDisplay ? `#${candidate.replace(/^#/, '')}` : candidate);
        item.addEventListener('mousedown', (event) => event.preventDefault());
        item.addEventListener('click', (event) => {
          event.preventDefault(); event.stopPropagation();
          if (inline) { input.value = candidate; input.dataset.dirty = 'true'; state.finish(false, true); }
          else submit(candidate);
        });
        item.dataset.index = String(index);
      });
    };

    const setActiveSuggestion = (index) => {
      const items = Array.from(suggestions.querySelectorAll('.spotlight-ex-suggestion'));
      items.forEach((el) => el.removeClass('is-active'));
      if (!items.length) return;
      activeSuggestion = (index + items.length) % items.length;
      items[activeSuggestion].addClass('is-active');
      items[activeSuggestion].scrollIntoView({ block: 'nearest' });
    };

    const measureContext = inline ? input.ownerDocument.createElement('canvas').getContext('2d') : null;
    const resizeInline = () => {
      if (!inline) return;
      const win = input.ownerDocument.defaultView;
      const style = win.getComputedStyle(input);
      measureContext.font = style.font;
      const width = Math.ceil(measureContext.measureText(input.value || ' ').width + 4);
      input.style.width = `${Math.max(18, width)}px`;
    };
    input.addEventListener('input', () => { input.dataset.dirty = 'true'; input.removeClass('spotlight-ex-input-error'); error.empty(); resizeInline(); refreshSuggestions(); });
    input.addEventListener('focus', refreshSuggestions);
    input.addEventListener('blur', () => input.ownerDocument.defaultView.setTimeout(() => {
      if (!controller.disposed && !controller.switching && controller.editor === state && input.ownerDocument.activeElement !== input) state.finish();
    }, 0));
    input.addEventListener('keydown', (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'ArrowDown' && visibleSuggestions.length) {
        event.preventDefault();
        setActiveSuggestion(activeSuggestion + 1);
      } else if (event.key === 'ArrowUp' && visibleSuggestions.length) {
        event.preventDefault();
        setActiveSuggestion(activeSuggestion - 1);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        if (inline) {
          if (activeSuggestion >= 0 && visibleSuggestions[activeSuggestion]) { input.value = visibleSuggestions[activeSuggestion]; input.dataset.dirty = 'true'; }
          state.finish(false, true);
        } else if (activeSuggestion >= 0 && visibleSuggestions[activeSuggestion]) submit(visibleSuggestions[activeSuggestion]);
        else submit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        state.finish(true);
      }
    });
    resizeInline();
    input.focus();
    if (intent) input.select();
  }

  getSuggestions(entries, key, type) {
    const cacheKey = `${this.plugin.settings.suggestionScope}\0${key}\0${type}`;
    const revision = this.plugin.metadataRevision || 0;
    const cached = this.suggestionCache.get(cacheKey);
    if (cached?.revision === revision && cached.entries === entries) return cached.values;
    const result = new Set();
    const addRaw = (raw) => {
      const list = Array.isArray(raw) ? raw : (raw == null ? [] : [raw]);
      for (const item of list) {
        let value = toComparableString(item).trim();
        if (!value) continue;
        if (type === 'tags' && value.startsWith('#')) value = value.slice(1);
        result.add(value);
      }
    };

    if (this.plugin.settings.suggestionScope === 'base') {
      for (const candidateEntry of entries) {
        const metadataFile = this.getMetadataFile(candidateEntry.file);
        addRaw(this.readRawFrontmatterValue(metadataFile, key));
      }
    } else {
      for (const file of this.app.vault.getMarkdownFiles()) {
        const cache = this.app.metadataCache.getFileCache(file);
        addRaw(cache?.frontmatter?.[key]);
      }
    }
    const values = Array.from(result).sort((a, b) => a.localeCompare(b));
    this.suggestionCache.set(cacheKey, { revision, entries, values });
    return values;
  }

  getWikiLinkSuggestions(rawQuery) {
    const needle = String(rawQuery || '').replace(/^\[\[/, '').replace(/\]\]$/, '').toLowerCase();
    const values = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      const display = file.basename;
      const path = file.path.replace(/\.md$/i, '');
      if (needle && !display.toLowerCase().includes(needle) && !path.toLowerCase().includes(needle)) continue;
      // Prefer a short wikilink when the basename uniquely resolves; a path link
      // remains valid even if duplicate basenames exist.
      values.push(`[[${path}]]`);
    }
    return values;
  }

  renderCheckboxEditor(entry, key, rawValue, container) {
    const row = container.createDiv('spotlight-ex-checkbox-row');
    const input = row.createEl('input', { type: 'checkbox', cls: 'spotlight-ex-checkbox' });
    input.checked = rawValue === true;
    input.indeterminate = rawValue == null;
    const label = row.createSpan({ text: input.indeterminate ? 'No value' : (input.checked ? 'True' : 'False'), cls: 'spotlight-ex-checkbox-label' });
    input.addEventListener('change', async () => {
      input.indeterminate = false;
      label.setText(input.checked ? 'True' : 'False');
      await this.writeProperty(entry.file, key, input.checked, 'checkbox');
    });
  }

  renderScalarInput(entry, key, inputType, rawValue, container) {
    const input = container.createEl('input', { type: inputType, cls: 'spotlight-ex-scalar-input' });
    const expectedType = inputType === 'datetime-local' ? 'datetime' : inputType;
    let initial = rawValue == null ? '' : String(rawValue);
    if (inputType === 'datetime-local' && initial) {
      // Native input expects YYYY-MM-DDTHH:mm[:ss] without timezone suffix.
      initial = localDateTimeValue(initial);
    }
    input.value = initial;
    if (inputType === 'number') input.step = 'any';
    if (inputType === 'datetime-local') input.step = '1';
    let dirty = false;
    input.addEventListener('input', () => { dirty = true; input.dataset.dirty = 'true'; });

    const save = async () => {
      if (!dirty) return true;
      if (!input.checkValidity()) return false;
      let next = input.value;
      if (next === '') next = null;
      else if (inputType === 'number') {
        const parsed = Number(next);
        if (!Number.isFinite(parsed)) return false;
        next = parsed;
      }
      dirty = false;
      delete input.dataset.dirty;
      if (!await this.writeProperty(entry.file, key, next, expectedType)) {
        dirty = true;
        input.dataset.dirty = 'true';
        return false;
      }
      return true;
    };
    this.registerDraftSaver(input, (cancel) => { if (cancel) { dirty = false; delete input.dataset.dirty; return true; } return save(); });
    input.addEventListener('change', save);
    input.addEventListener('blur', save);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        if (event.isComposing || event.keyCode === 229) return;
        event.preventDefault();
        save();
      }
    });
  }

  renderTextEditor(entry, key, rawValue, container) {
    const textarea = container.createEl('textarea', {
      cls: 'spotlight-ex-text-input',
      attr: { placeholder: 'Empty' },
    });
    textarea.value = rawValue == null ? '' : String(rawValue);
    let dirty = false;
    this.autoSizeTextarea(textarea);
    textarea.addEventListener('input', () => { dirty = true; textarea.dataset.dirty = 'true'; });
    const save = async () => {
      if (!dirty) return true;
      dirty = false;
      delete textarea.dataset.dirty;
      if (!await this.writeProperty(entry.file, key, textarea.value === '' ? null : textarea.value, 'text')) {
        dirty = true;
        textarea.dataset.dirty = 'true';
        return false;
      }
      return true;
    };
    this.registerDraftSaver(textarea, (cancel) => { if (cancel) { dirty = false; delete textarea.dataset.dirty; return true; } return save(); });
    textarea.addEventListener('blur', save);
    textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        if (event.isComposing || event.keyCode === 229) return;
        event.preventDefault();
        save();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.render();
      }
    });
  }

  renderNativeEditor(entry, key, type, rawValue, container) {
    const widget = this.getPropertyWidget(key, rawValue);
    if (!widget?.render || normalizeType(widget.type, key, rawValue) !== type) {
      this.renderComplexReadOnly(rawValue, container);
      return;
    }
    container.addEventListener('input', (event) => {
      if (event.target?.nodeType === 1) event.target.dataset.dirty = 'true';
    });
    widget.render(container, rawValue ?? null, {
      app: this.app, key, sourcePath: entry.file.path, hoverSource: 'bases',
      onChange: async (value) => {
        const input = container.querySelector('input, textarea, [contenteditable="true"]');
        const draft = input?.value ?? input?.textContent;
        const saved = await this.writeProperty(entry.file, key, value ?? null, type);
        if (saved && input && (input.value ?? input.textContent) === draft) delete input.dataset.dirty;
      },
      blur: () => container.querySelector('input, [contenteditable="true"]')?.blur(),
    });
  }

  clearEditorCleanups(container = null) {
    this.editorCleanups = this.editorCleanups.filter((cleanup) => {
      if (container && !container.contains(cleanup.target)) return true;
      cleanup();
      return false;
    });
  }

  autoSizeTextarea(textarea) {
    const win = textarea.ownerDocument.defaultView;
    const resize = () => {
      textarea.style.height = 'auto';
      const style = win.getComputedStyle(textarea);
      const borders = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
      textarea.style.height = `${textarea.scrollHeight + borders}px`;
    };
    textarea.addEventListener('input', resize);
    let lastWidth;
    const observer = new win.ResizeObserver(([entry]) => {
      if (entry.contentRect.width !== lastWidth) {
        lastWidth = entry.contentRect.width;
        resize();
      }
    });
    observer.observe(textarea);
    const frame = win.requestAnimationFrame(resize);
    const cleanup = () => {
      observer.disconnect();
      win.cancelAnimationFrame(frame);
    };
    cleanup.target = textarea;
    this.editorCleanups.push(cleanup);
    resize();
  }

  renderComplexReadOnly(rawValue, container) {
    container.addClass('spotlight-ex-complex-readonly');
    const msg = container.createDiv({ text: 'Complex YAML value — shown read-only to avoid changing its structure.', cls: 'spotlight-ex-complex-note' });
    const pre = container.createEl('pre', { cls: 'spotlight-ex-complex-value' });
    try {
      pre.setText(JSON.stringify(rawValue, null, 2));
    } catch (_err) {
      pre.setText(String(rawValue));
    }
  }

  renderStructuredEditor(entry, key, rawValue, container) {
    container.createDiv({ text: 'Edit as JSON; saved as a YAML object or array.', cls: 'spotlight-ex-complex-note' });
    const input = container.createEl('textarea', { cls: 'spotlight-ex-text-input', attr: { 'aria-label': `Edit ${key} as JSON` } });
    input.value = JSON.stringify(rawValue, null, 2);
    const error = container.createDiv({ cls: 'spotlight-ex-structured-error', attr: { role: 'status' } });
    this.autoSizeTextarea(input);
    input.addEventListener('input', () => { input.dataset.dirty = 'true'; error.empty(); });
    const save = async () => {
      if (input.dataset.dirty !== 'true') return true;
      try {
        const value = JSON.parse(input.value);
        if (!isObject(value)) throw new Error('Enter an object or array.');
        const draft = input.value;
        if (await this.writeProperty(entry.file, key, value, 'complex')) {
          if (input.value === draft) delete input.dataset.dirty;
          error.empty();
          return true;
        }
        return false;
      } catch (err) { error.setText(`Cannot save: ${err.message}`); return false; }
    };
    this.registerDraftSaver(input, (cancel) => { if (cancel) { delete input.dataset.dirty; return true; } return save(); });
    input.addEventListener('blur', save);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) {
        event.preventDefault(); save();
      } else if (event.key === 'Escape') { event.preventDefault(); this.render(); }
    });
    const button = container.createEl('button', { text: 'Save object' });
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', save);
  }

  renderReadOnlyValue(entry, propId, container) {
    const valueEl = container.createDiv('spotlight-ex-readonly-value');
    let value;
    try {
      value = entry.getValue(propId);
    } catch (_err) {
      value = null;
    }
    if (value && typeof value.renderTo === 'function') {
      value.renderTo(valueEl, this.app.renderContext);
      if (!valueEl.innerHTML) valueEl.setText('—');
      return;
    }
    const unwrapped = unwrapValue(value);
    if (Array.isArray(unwrapped)) {
      const chips = valueEl.createDiv('spotlight-ex-chip-list');
      if (!unwrapped.length) chips.createSpan({ text: '—', cls: 'spotlight-ex-empty-value' });
      unwrapped.forEach((item) => {
        const chip = chips.createDiv('spotlight-ex-chip spotlight-ex-chip-readonly');
        chip.createSpan({ text: toComparableString(item), cls: 'spotlight-ex-chip-label' });
      });
      return;
    }
    const text = toComparableString(unwrapped);
    valueEl.setText(text || '—');
    if (!text) valueEl.addClass('spotlight-ex-empty-value');
  }

  renderHyperlinkProperty(entry, container, propId) {
    container.empty();
    const value = entry.getValue(propId);
    const text = this.formatValue(value) || '—';
    const link = container.createDiv({ text, cls: 'spotlight-ex-hyperlink-value' });
    link.title = 'Open current file (Ctrl/Cmd+Click for a new pane)';
    link.addEventListener('click', (event) => {
      if (!(entry.file instanceof TFile)) return;
      const newLeaf = event.ctrlKey || event.metaKey || event.button === 1;
      this.app.workspace.getLeaf(newLeaf).openFile(entry.file);
    });
  }

  writeProperty(sourceFile, key, value, expectedType = null) {
    const propertyKey = `${sourceFile.path}\0${key}`;
    this.pendingPropertyWrites.set(propertyKey, (this.pendingPropertyWrites.get(propertyKey) || 0) + 1);
    this.pendingWrites += 1;
    // Serialize a file's writes across every open Spotlight EX / Cards EX view.
    const queues = this.plugin.propertyWriteQueues ||= new Map();
    const fileKey = sidecarOriginalPath(sourceFile.path) || sourceFile.path;
    const task = (queues.get(fileKey) || Promise.resolve()).then(() => this.commitProperty(sourceFile, key, value, expectedType));
    const queued = task.catch(() => null);
    queues.set(fileKey, queued);
    queued.then(() => { if (queues.get(fileKey) === queued) queues.delete(fileKey); });
    this.writeQueue = task.catch(() => null);
    return task.finally(() => {
      this.pendingWrites -= 1;
      const count = this.pendingPropertyWrites.get(propertyKey) - 1;
      if (count) this.pendingPropertyWrites.set(propertyKey, count);
      else this.pendingPropertyWrites.delete(propertyKey);
      this.scheduleDataRender();
    });
  }

  async commitProperty(sourceFile, key, value, expectedType) {
    const metadataFile = await this.ensureMetadataFile(sourceFile);
    if (!(metadataFile instanceof TFile)) {
      if (sourceFile instanceof TFile && sourceFile.extension !== 'md' && !this.plugin.settings.createBinarySidecars) {
        new Notice('Enable “Create sidecars for attachments” to edit attachment metadata.');
      }
      return null;
    }
    try {
      let writtenValue;
      await this.app.fileManager.processFrontMatter(metadataFile, (frontmatter) => {
        if (expectedType && this.getPropertyType(key, frontmatter[key]) !== expectedType) {
          throw new Error('Property type changed before this edit was saved.');
        }
        writtenValue = typeof value === 'function' ? value(frontmatter[key]) : value;
        if (expectedType && !(expectedType === 'complex' ? isObject(writtenValue) : validPropertyValue(expectedType, writtenValue))) {
          throw new Error('Value does not match the current property type.');
        }
        frontmatter[key] = writtenValue;
      });
      return { value: writtenValue };
    } catch (err) {
      console.error('[Spotlight EX] Property write failed', err);
      new Notice(`Could not update property “${key}”.`);
      return null;
    }
  }

  getPropName(propId) {
    const parts = String(propId).split('.');
    return parts.length > 1 ? parts.slice(1).join('.') : String(propId);
  }

  formatValue(value) {
    const unwrapped = unwrapValue(value);
    if (unwrapped == null) return '';
    if (Array.isArray(unwrapped)) return unwrapped.map((v) => this.formatValue(v)).join(', ');
    if (isObject(unwrapped)) {
      try { return JSON.stringify(unwrapped); } catch (_err) { return String(unwrapped); }
    }
    return String(unwrapped);
  }

}

class SpotlightEXView extends PropertyEditorView {
  constructor(controller, containerEl, plugin) {
    super(controller, containerEl, plugin);
    this.type = VIEW_TYPE;
    this.currentIndex = 0;
    this.sidebarVisible = true;
    this.sidebarWidth = Number(plugin.settings.sidebarWidth) || 330;
    this.isResizing = false;
    this.activePdfBlobUrls = [];
    this.renderToken = 0;
    this.pendingDataRender = false;

    this.containerEl.tabIndex = 0;
    this.containerEl.addClass('spotlight-ex-view');

    this.wrapperEl = this.containerEl.createDiv('spotlight-ex-wrapper');
    this.centerEl = this.wrapperEl.createDiv('spotlight-ex-center');
    this.resizerEl = this.wrapperEl.createDiv('spotlight-ex-resizer');
    this.sidebarEl = this.wrapperEl.createDiv('spotlight-ex-sidebar');

    this.resizerEl.addEventListener('mousedown', (event) => this.beginSidebarResize(event));
    this.containerEl.addEventListener('keydown', (event) => this.handleKeyDown(event));
    this.containerEl.addEventListener('pointerdown', () => this.activatePane(), true);
    // Bases navigation must not consume keys intended for a property editor.
    this.sidebarEl.addEventListener('keydown', (event) => event.stopPropagation());
    this.sidebarEl.addEventListener('focusout', () => this.scheduleDataRender());

    this.toggleBtn = this.containerEl.createEl('button', {
      text: 'Toggle Sidebar',
      cls: 'spotlight-ex-toolbar-button spotlight-ex-sidebar-toggle',
    });
    this.toggleBtn.addEventListener('click', () => this.toggleSidebar());

    this.fullscreenBtn = this.containerEl.createEl('button', {
      text: 'Full Screen',
      cls: 'spotlight-ex-toolbar-button spotlight-ex-fullscreen-toggle',
    });
    this.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());

    this.fullscreenHandler = () => {
      const doc = this.containerEl.ownerDocument;
      const active = doc.fullscreenElement === this.containerEl;
      this.fullscreenBtn.setText(active ? 'Exit Full Screen' : 'Full Screen');
      this.containerEl.toggleClass('spotlight-ex-is-fullscreen', active);
    };
    this.containerEl.ownerDocument.addEventListener('fullscreenchange', this.fullscreenHandler);
    this.plugin.views?.add(this);
  }

  onDataUpdated() {
    if (this.unloaded) return;
    this.plugin.onViewConfigChanged?.(this);
    if (this.deferDataRender()) {
      this.pendingDataRender = true;
      this.syncSidebarProperties();
      return;
    }
    this.render();
  }

  deferDataRender() {
    return this.activatingPane || this.pendingWrites
      || this.sidebarEl.contains(this.containerEl.ownerDocument.activeElement)
      || this.sidebarEl.querySelector('[data-dirty="true"]')
      || Array.from(this.sidebarEl.querySelectorAll('.spotlight-ex-add-input')).some((input) => input.value.trim());
  }

  scheduleDataRender() {
    if (this.unloaded) return;
    const win = this.containerEl.ownerDocument.defaultView;
    win.clearTimeout(this.dataRenderTimer);
    this.dataRenderTimer = win.setTimeout(() => {
      this.dataRenderTimer = null;
      if (!this.unloaded) this.syncSidebarProperties();
      if (!this.unloaded && this.pendingDataRender && !this.deferDataRender()) {
        this.render();
      }
    }, 0);
  }

  onunload() {
    this.unloadEditors();
    this.unloaded = true;
    this.plugin.views?.delete(this);
    this.containerEl.ownerDocument.defaultView.clearTimeout(this.dataRenderTimer);
    this.containerEl.ownerDocument.defaultView.clearTimeout(this.activationTimer);
    this.clearEditorCleanups();
    this.revokePdfUrls();
    this.containerEl.ownerDocument.removeEventListener('fullscreenchange', this.fullscreenHandler);
  }

  get filteredEntries() {
    if (!this.data || !Array.isArray(this.data.data)) return [];

    // One logical record per original file. If both a binary attachment and its
    // .md metadata sidecar appear in the Base results, prefer the sidecar entry.
    const byOriginal = new Map();
    for (const entry of this.data.data) {
      const file = entry?.file;
      if (!(file instanceof TFile)) continue;
      const original = sidecarOriginalPath(file.path);
      const key = original || file.path;
      const previous = byOriginal.get(key);
      if (!previous || original) byOriginal.set(key, entry);
    }
    return Array.from(byOriginal.values());
  }

  handleKeyDown(event) {
    const target = event.target;
    if (target?.nodeType === 1) {
      const tag = target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button' || target.isContentEditable) {
        return;
      }
    }

    const entries = this.filteredEntries;
    if (!entries.length) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      this.currentIndex = Math.min(this.currentIndex + 1, entries.length - 1);
      this.render();
      event.preventDefault();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      this.currentIndex = Math.max(this.currentIndex - 1, 0);
      this.render();
      event.preventDefault();
    }
  }

  toggleSidebar() {
    this.sidebarVisible = !this.sidebarVisible;
    this.sidebarEl.style.display = this.sidebarVisible ? 'flex' : 'none';
    this.resizerEl.style.display = this.sidebarVisible ? 'block' : 'none';
  }

  async toggleFullscreen() {
    const doc = this.containerEl.ownerDocument;
    try {
      if (!doc.fullscreenElement) await this.containerEl.requestFullscreen();
      else await doc.exitFullscreen();
    } catch (err) {
      console.error('[Spotlight EX] Fullscreen failed', err);
    }
  }

  beginSidebarResize(event) {
    event.preventDefault();
    this.isResizing = true;
    const doc = this.containerEl.ownerDocument;
    const move = (e) => {
      if (!this.isResizing) return;
      const rect = this.containerEl.getBoundingClientRect();
      const width = rect.right - e.clientX;
      if (width >= 180 && width <= rect.width - 180) {
        this.sidebarWidth = width;
        this.sidebarEl.style.width = `${width}px`;
      }
    };
    const up = async () => {
      this.isResizing = false;
      doc.removeEventListener('mousemove', move);
      doc.removeEventListener('mouseup', up);
      this.plugin.settings.sidebarWidth = Math.round(this.sidebarWidth);
      await this.plugin.saveSettings();
    };
    doc.addEventListener('mousemove', move);
    doc.addEventListener('mouseup', up);
  }

  revokePdfUrls() {
    for (const url of this.activePdfBlobUrls) URL.revokeObjectURL(url);
    this.activePdfBlobUrls = [];
  }

  render() {
    this.pendingDataRender = false;
    this.clearEditorCleanups();
    this.renderToken += 1;
    const token = this.renderToken;
    this.revokePdfUrls();
    this.centerEl.empty();
    this.sidebarEl.empty();

    const entries = this.filteredEntries;
    if (!entries.length) {
      this.centerEl.createDiv({ text: 'No entries found.', cls: 'spotlight-ex-empty' });
      return;
    }

    this.currentIndex = Math.max(0, Math.min(this.currentIndex, entries.length - 1));
    const entry = entries[this.currentIndex];
    if (this.renderedFilePath !== entry.file.path) this.propertyValueHeights.clear();
    this.renderedFilePath = entry.file.path;

    this.renderCenter(entry, token);
    this.renderSidebar(entry, entries);
  }

  renderCenter(entry, token) {
    const centerContent = this.centerEl.createDiv('spotlight-ex-center-content');
    const spotlightProperty = this.config?.get?.('spotlight_property');
    let previewFile = null;

    if (spotlightProperty) {
      let value;
      try {
        value = unwrapValue(entry.getValue(spotlightProperty));
      } catch (_err) {
        value = null;
      }
      const linkPath = extractWikilink(value);
      if (linkPath) {
        const sourcePath = entry.file instanceof TFile ? entry.file.path : '';
        const dest = this.app.metadataCache.getFirstLinkpathDest(linkPath, sourcePath);
        if (dest instanceof TFile) previewFile = dest;
      }
    }

    if (!previewFile && entry.file instanceof TFile) previewFile = this.resolvePreviewFile(entry.file);

    if (!previewFile) {
      this.centerEl.removeClass('spotlight-ex-center-no-padding');
      centerContent.createDiv({ text: 'Cannot read file content.', cls: 'spotlight-ex-error-message' });
      return;
    }

    this.renderFileContent(previewFile, centerContent, token);
  }

  getVisiblePropertyIds() {
    const fromData = Array.isArray(this.data?.properties) ? this.data.properties : [];
    const fromConfig = typeof this.config?.getOrder === 'function' ? this.config.getOrder() : [];
    const list = fromData.length ? fromData : fromConfig;
    const unique = [...new Set(list)];

    const orderMap = new Map();
    this.plugin.settings.propertyOrder.forEach((id, index) => orderMap.set(id, index));
    return unique.sort((a, b) => {
      const ai = orderMap.has(a) ? orderMap.get(a) : Number.POSITIVE_INFINITY;
      const bi = orderMap.has(b) ? orderMap.get(b) : Number.POSITIVE_INFINITY;
      if (ai !== bi) return ai - bi;
      return unique.indexOf(a) - unique.indexOf(b);
    });
  }

  renderSidebar(entry, entries) {
    this.sidebarEl.style.width = `${this.sidebarWidth}px`;
    this.sidebarEl.createEl('h3', { text: 'Attributes', cls: 'spotlight-ex-sidebar-title' });

    const properties = this.getVisiblePropertyIds();
    for (const propId of properties) this.renderProperty(entry, entries, propId, properties);

    const nav = this.sidebarEl.createDiv('spotlight-ex-nav-container');
    const prev = nav.createEl('button', { text: 'Previous', cls: 'spotlight-ex-nav-btn' });
    prev.disabled = this.currentIndex === 0;
    prev.addEventListener('click', () => {
      this.currentIndex = Math.max(0, this.currentIndex - 1);
      this.render();
    });

    nav.createDiv({ text: `Entry ${this.currentIndex + 1} of ${entries.length}`, cls: 'spotlight-ex-count' });

    const next = nav.createEl('button', { text: 'Next', cls: 'spotlight-ex-nav-btn' });
    next.disabled = this.currentIndex >= entries.length - 1;
    next.addEventListener('click', () => {
      this.currentIndex = Math.min(entries.length - 1, this.currentIndex + 1);
      this.render();
    });
  }

  renderProperty(entry, entries, propId, orderedProperties) {
    const propEl = this.sidebarEl.createDiv('spotlight-ex-property');
    propEl.dataset.prop = propId;

    const header = propEl.createDiv('spotlight-ex-property-header');
    const displayName = typeof this.config?.getDisplayName === 'function'
      ? this.config.getDisplayName(propId)
      : this.getPropName(propId);
    const nameEl = header.createDiv({ text: displayName || this.getPropName(propId), cls: 'spotlight-ex-property-name' });

    nameEl.draggable = true;
    nameEl.addEventListener('dragstart', (event) => {
      event.dataTransfer?.setData('text/plain', propId);
      propEl.addClass('spotlight-ex-property-dragging');
    });
    nameEl.addEventListener('dragend', () => {
      propEl.removeClass('spotlight-ex-property-dragging');
      this.sidebarEl.querySelectorAll('.spotlight-ex-property-drag-over, .spotlight-ex-property-drag-below')
        .forEach((el) => el.removeClasses(['spotlight-ex-property-drag-over', 'spotlight-ex-property-drag-below']));
    });

    const editable = isEditablePropertyId(propId);
    const key = frontmatterKeyFromPropertyId(propId);
    const metadataFile = editable ? this.getMetadataFile(entry.file) : null;
    const rawValue = editable && key ? this.readRawFrontmatterValue(metadataFile, key) : undefined;
    const propType = editable && key ? this.getPropertyType(key, rawValue) : 'readonly';
    propEl.dataset.type = propType;
    propEl.dataset.value = JSON.stringify(rawValue) ?? 'undefined';

    if (this.plugin.settings.showTypeBadge) {
      const details = PROPERTY_TYPES[propType] || { name: propType, icon: 'lucide-circle-help' };
      const widget = editable && key ? this.getPropertyWidget(key, rawValue) : null;
      const icon = header.createEl('button', {
        cls: 'spotlight-ex-type-icon clickable-icon',
        attr: { title: `Property type: ${details.name}`, 'aria-label': `Change ${displayName || key} property type (${details.name})` },
      });
      setIcon(icon, widget?.icon || details.icon);
      header.insertBefore(icon, nameEl);
      icon.disabled = !editable || !this.app.metadataTypeManager?.setType || propType === 'complex'
        || ['tags', 'aliases', 'cssclasses'].includes(key?.toLowerCase());
      icon.addEventListener('click', (event) => this.openPropertyTypeMenu(event, key, propType));
      header.createSpan({ text: details.name, cls: 'spotlight-ex-type-badge' });
    }

    this.addDragDropHandlers(propEl, propId, orderedProperties);

    const valueContainer = propEl.createDiv('spotlight-ex-property-value-container');
    const savedHeight = this.plugin.settings.propertyHeights[propId];
    if (savedHeight) {
      valueContainer.style.minHeight = `${savedHeight}px`;
    }

    const hyperlinkProperty = this.config?.get?.('hyperlink_property');
    if (hyperlinkProperty && propId === hyperlinkProperty) {
      this.renderHyperlinkProperty(entry, valueContainer, propId);
    } else if (editable && key) {
      // When a binary file has no sidecar yet, rawValue is undefined. We still
      // use the global Obsidian type for the property so the correct editor is shown.
      this.renderTypedEditor(entry, entries, key, propId, propType, rawValue, valueContainer);
    } else {
      this.renderReadOnlyValue(entry, propId, valueContainer);
    }

    this.addHeightResizer(propEl, valueContainer, propId);
    const draft = this.recoveredDrafts.get(`${entry.file.path}\0${propId}`);
    if (draft) {
      const details = propEl.createEl('details', { cls: 'spotlight-ex-recovered-draft' });
      details.createEl('summary', { text: 'Unfinished value from the previous type' });
      details.createEl('pre', { text: draft });
    }
    this.alignPropertyControls(propEl);
    if (editable && !['list', 'tags', 'complex'].includes(propType)) propEl.addEventListener('click', (event) => {
      if (!event.target.closest('button, input, textarea, select, a, summary, pre, .spotlight-ex-property-resizer')) valueContainer.querySelector('input, textarea, [contenteditable="true"]')?.focus();
    });
    return propEl;
  }

  syncSidebarProperties() {
    if (this.unloaded || this.isResizing) return;
    const entries = this.filteredEntries;
    const entry = entries.find((item) => item.file.path === this.renderedFilePath);
    if (!entry) return;
    const order = this.getVisiblePropertyIds();
    const doc = this.containerEl.ownerDocument;
    for (const row of Array.from(this.sidebarEl.querySelectorAll('.spotlight-ex-property'))) {
      const propId = row.dataset.prop;
      const key = frontmatterKeyFromPropertyId(propId);
      if (!key || !isEditablePropertyId(propId) || !order.includes(propId)) continue;
      if (this.pendingPropertyWrites.get(`${entry.file.path}\0${key}`)) continue;
      const raw = this.readRawFrontmatterValue(this.getMetadataFile(entry.file), key);
      const type = this.getPropertyType(key, raw);
      const typeChanged = type !== row.dataset.type;
      const draftInput = row.querySelector('[data-dirty="true"]')
        || row.querySelector('.spotlight-ex-add-input');
      const draft = draftInput?.value ?? draftInput?.textContent ?? '';
      const focused = row.contains(doc.activeElement);
      if (!typeChanged && (focused || draftInput?.dataset.dirty === 'true' || draft.trim())) continue;
      if (!typeChanged && row.dataset.value === (JSON.stringify(raw) ?? 'undefined')) continue;
      if (typeChanged && (draftInput?.dataset.dirty === 'true' || draft.trim())) {
        this.recoveredDrafts.set(`${entry.file.path}\0${propId}`, draft);
      }
      this.clearEditorCleanups(row);
      const replacement = this.renderProperty(entry, entries, propId, order);
      row.replaceWith(replacement);
      if (focused) {
        const control = replacement.querySelector('textarea, input, select, .spotlight-ex-chip-list');
        control?.focus();
      }
    }
  }

  addDragDropHandlers(propEl, propId, orderedProperties) {
    propEl.addEventListener('dragover', (event) => {
      event.preventDefault();
      const rect = propEl.getBoundingClientRect();
      if (event.clientY < rect.top + rect.height / 2) {
        propEl.addClass('spotlight-ex-property-drag-over');
        propEl.removeClass('spotlight-ex-property-drag-below');
      } else {
        propEl.addClass('spotlight-ex-property-drag-below');
        propEl.removeClass('spotlight-ex-property-drag-over');
      }
    });
    propEl.addEventListener('dragleave', () => {
      propEl.removeClasses(['spotlight-ex-property-drag-over', 'spotlight-ex-property-drag-below']);
    });
    propEl.addEventListener('drop', async (event) => {
      event.preventDefault();
      propEl.removeClasses(['spotlight-ex-property-drag-over', 'spotlight-ex-property-drag-below']);
      const dragged = event.dataTransfer?.getData('text/plain');
      if (!dragged || dragged === propId) return;

      const nextOrder = [...orderedProperties];
      const oldIndex = nextOrder.indexOf(dragged);
      if (oldIndex >= 0) nextOrder.splice(oldIndex, 1);
      let targetIndex = nextOrder.indexOf(propId);
      const rect = propEl.getBoundingClientRect();
      if (event.clientY >= rect.top + rect.height / 2) targetIndex += 1;
      nextOrder.splice(Math.max(0, targetIndex), 0, dragged);
      this.plugin.settings.propertyOrder = nextOrder;
      await this.plugin.saveSettings();
      this.render();
    });
  }

  addHeightResizer(propEl, valueContainer, propId) {
    const resizeHandle = propEl.createDiv('spotlight-ex-property-resizer');
    let startY = 0;
    let startHeight = 0;
    const doc = this.containerEl.ownerDocument;

    const move = (event) => {
      const height = Math.max(28, startHeight + (event.clientY - startY));
      valueContainer.style.minHeight = `${height}px`;
    };
    const up = async () => {
      doc.removeEventListener('mousemove', move);
      doc.removeEventListener('mouseup', up);
      window.setTimeout(() => { this.isResizing = false; }, 50);
      this.plugin.settings.propertyHeights[propId] = parseFloat(valueContainer.style.minHeight) || 28;
      await this.plugin.saveSettings();
    };
    resizeHandle.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.isResizing = true;
      startY = event.clientY;
      startHeight = valueContainer.getBoundingClientRect().height;
      doc.addEventListener('mousemove', move);
      doc.addEventListener('mouseup', up);
    });
  }

  renderFileContent(file, containerEl, token) {
    this.centerEl.removeClasses([
      'spotlight-ex-center-no-padding',
      'spotlight-ex-center-media-mode',
      'spotlight-ex-center-pdf-mode',
    ]);

    const ext = file.extension.toLowerCase();
    const imageExtensions = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp', 'avif', 'heic', 'heif']);

    if (imageExtensions.has(ext)) {
      this.centerEl.addClasses(['spotlight-ex-center-no-padding', 'spotlight-ex-center-media-mode']);
      containerEl.empty();
      containerEl.addClass('spotlight-ex-center-media-container');
      const resourcePath = this.app.vault.getResourcePath(file);
      containerEl.createEl('img', { attr: { src: resourcePath, alt: file.basename }, cls: 'spotlight-ex-media' });
      return;
    }

    if (ext === 'pdf') {
      this.centerEl.addClasses(['spotlight-ex-center-no-padding', 'spotlight-ex-center-pdf-mode']);
      containerEl.empty();
      containerEl.addClass('spotlight-ex-center-pdf-container');
      this.app.vault.readBinary(file).then((buffer) => {
        if (this.renderToken !== token) return;
        const blob = new Blob([buffer], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        this.activePdfBlobUrls.push(url);
        containerEl.createEl('iframe', {
          cls: 'spotlight-ex-pdf-iframe',
          attr: { src: url, type: 'application/pdf', title: file.basename },
        });
      }).catch((err) => {
        console.error(err);
        if (this.renderToken !== token) return;
        containerEl.empty();
        containerEl.createDiv({ text: `Could not load PDF content for ${file.name}.`, cls: 'spotlight-ex-error-message' });
      });
      return;
    }

    this.app.vault.cachedRead(file).then((content) => {
      if (this.renderToken !== token) return;
      containerEl.empty();
      containerEl.addClasses(['markdown-rendered', 'markdown-preview-view']);
      MarkdownRenderer.render(this.app, content, containerEl, file.path, this).catch((err) => {
        console.error('[Spotlight EX] Markdown render failed', err);
      });
    }).catch((err) => {
      console.error(err);
      if (this.renderToken !== token) return;
      containerEl.empty();
      containerEl.createDiv({ text: `Could not load content for ${file.name}.`, cls: 'spotlight-ex-error-message' });
    });
  }
}

class SpotlightEXSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.activeTab = 'general';
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('spotlight-ex-settings');

    containerEl.createEl('h2', { text: 'Spotlight EX' });
    const tabs = containerEl.createDiv('spotlight-ex-settings-tabs');
    const generalTab = tabs.createEl('button', { text: 'General', cls: 'spotlight-ex-settings-tab' });
    const setupTab = tabs.createEl('button', { text: 'Setup', cls: 'spotlight-ex-settings-tab' });
    const creditsTab = tabs.createEl('button', { text: 'Credits & License', cls: 'spotlight-ex-settings-tab' });
    generalTab.toggleClass('is-active', this.activeTab === 'general');
    setupTab.toggleClass('is-active', this.activeTab === 'setup');
    creditsTab.toggleClass('is-active', this.activeTab === 'credits');
    generalTab.addEventListener('click', () => { this.activeTab = 'general'; this.display(); });
    setupTab.addEventListener('click', () => { this.activeTab = 'setup'; this.display(); });
    creditsTab.addEventListener('click', () => { this.activeTab = 'credits'; this.display(); });

    const body = containerEl.createDiv('spotlight-ex-settings-body');
    if (this.activeTab === 'credits') this.renderCredits(body);
    else if (this.activeTab === 'setup') this.renderSetup(body);
    else this.renderGeneral(body);
  }

  renderSetup(containerEl) {
    const guide = containerEl.createDiv('spotlight-ex-setup-guide');
    guide.createEl('h3', { text: 'Configure a Base' });
    const steps = guide.createEl('ol');
    for (const step of [
      'Enable Bases under Settings → Core plugins and Spotlight EX under Settings → Community plugins.',
      'Open an existing .base file, or run “Bases: Create new base” from the command palette.',
      'Click the view name at the top left → Add view. Name it, then choose Spotlight EX as its layout. To change an existing view, click the arrow beside its name (or right-click the view name) and select Spotlight EX under Layout.',
      'Use Properties in the Base toolbar to choose the fields shown in the sidebar. Use Filter to limit the files and Sort to set their navigation order.',
      'Open the view settings for layout-specific options. Spotlight EX has preview/link options; Cards EX has card and cover-image options.',
    ]) steps.createEl('li', { text: step });

    guide.createEl('h3', { text: 'Spotlight EX: preview and navigation' });
    const options = guide.createEl('ul');
    options.createEl('li', { text: 'Spotlight Content Property: select a property containing a [[wikilink]] to another file to preview. Leave it empty to preview the current entry.' });
    options.createEl('li', { text: 'Hyperlink Property: select a displayed field whose value should open the current Base entry when clicked.' });
    guide.createEl('p', { text: 'Use Previous / Next or the arrow keys to browse. Arrow keys inside property editors remain available for editing. If the Base is empty, check its filters.' });
    guide.createEl('h3', { text: 'Cards EX: editable gallery' });
    const cards = guide.createEl('ul');
    cards.createEl('li', { text: 'Add a Base view or open an existing view’s settings and choose Cards EX under Layout. Use Properties to choose the fields displayed on each card; Filter and Sort also apply to this gallery, including grouping.' });
    cards.createEl('li', { text: 'In the view settings, choose Card size, Image property, Image fit (Cover or Contain), and Image aspect ratio. The image property can contain a [[wikilink]] to a local image, an https:// URL, or a hex color such as #336699.' });
    cards.createEl('li', { text: 'Click an empty dash, property name, or free space inside a property to add a value. Click a List/Tags value to rename inside its chip; its × removes it. Enter or choosing a suggestion finishes a rename and focuses the separate adding field. Adding keeps that field ready for the next value. Clicking away saves and closes the editor; Escape cancels unsubmitted input. Adjust Animation duration (ms) under General → Layout; 0 disables size animations. Reduced motion is always respected.' });
    cards.createEl('li', { text: 'Objects and nested arrays use a validated JSON editor with Save object or Ctrl/Cmd+Enter. Formula and file properties are read-only. Attachment properties use the same sidecars as Spotlight EX.' });
    guide.createEl('p', { text: 'Use the General tab here for shared editing preferences, suggestions, attachment sidecars, and Spotlight sidebar width. Layout, displayed properties, filters, and sorting are configured separately for each Base view.' });
    const link = guide.createEl('a', { text: 'Full setup guide on GitHub', href: `${REPOSITORY_URL}#configure-a-base` });
    link.setAttr('target', '_blank');
    link.setAttr('rel', 'noopener noreferrer');
  }

  renderGeneral(containerEl) {
    containerEl.createEl('h3', { text: 'Property editing' });

    this.addReset(new Setting(containerEl)
      .setName('Always show remove × buttons')
      .setDesc('Every List/Tags item always has its × visible. If disabled, the same one-click × appears on hover/focus instead. Values remain real YAML array items.')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.removeButtonAlwaysVisible)
        .onChange(async (value) => {
          this.plugin.settings.removeButtonAlwaysVisible = value;
          await this.plugin.saveSettings();
        })), 'removeButtonAlwaysVisible');

    this.addReset(new Setting(containerEl)
      .setName('Prevent duplicate list values')
      .setDesc('Avoids adding the exact same list/tag value twice.')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.preventDuplicateListValues)
        .onChange(async (value) => {
          this.plugin.settings.preventDuplicateListValues = value;
          await this.plugin.saveSettings();
        })), 'preventDuplicateListValues');

    this.addReset(new Setting(containerEl)
      .setName('Suggestion source')
      .setDesc('Choose where autocomplete suggestions for List and Tags properties come from.')
      .addDropdown((dropdown) => dropdown
        .addOption('vault', 'Whole vault')
        .addOption('base', 'Current Base results')
        .setValue(this.plugin.settings.suggestionScope)
        .onChange(async (value) => {
          this.plugin.settings.suggestionScope = value;
          await this.plugin.saveSettings();
        })), 'suggestionScope');

    this.addReset(new Setting(containerEl)
      .setName('Maximum suggestions')
      .setDesc('Maximum number of autocomplete values shown at once.')
      .addText((text) => text
        .setPlaceholder('12')
        .setValue(String(this.plugin.settings.maxSuggestions))
        .onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          if (Number.isFinite(parsed) && parsed > 0) {
            this.plugin.settings.maxSuggestions = Math.min(100, parsed);
            await this.plugin.saveSettings();
          }
        })), 'maxSuggestions');

    this.addReset(new Setting(containerEl)
      .setName('Display # for Tags')
      .setDesc('Visual only. Stored tag values are not rewritten just to add a #.')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.tagHashDisplay)
        .onChange(async (value) => {
          this.plugin.settings.tagHashDisplay = value;
          await this.plugin.saveSettings();
        })), 'tagHashDisplay');

    this.addReset(new Setting(containerEl)
      .setName('Show property type icons and labels')
      .setDesc('Shows the native type icon beside each property name and a type label. On by default. Click an editable type icon to change its vault-wide type.')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.showTypeBadge)
        .onChange(async (value) => {
          this.plugin.settings.showTypeBadge = value;
          await this.plugin.saveSettings();
        })), 'showTypeBadge');

    containerEl.createEl('h3', { text: 'Attachments' });
    this.addReset(new Setting(containerEl)
      .setName('Create sidecars for attachments')
      .setDesc('When editing note properties for images/PDFs, create “filename.ext.md” as the metadata sidecar if it does not already exist.')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.createBinarySidecars)
        .onChange(async (value) => {
          this.plugin.settings.createBinarySidecars = value;
          await this.plugin.saveSettings();
        })), 'createBinarySidecars');

    containerEl.createEl('h3', { text: 'Layout' });
    this.addReset(new Setting(containerEl)
      .setName('Animation duration (ms)')
      .setDesc('Time for chip width, property height, and card height changes in both views. Default: 140 ms. Set 0 to disable; maximum: 2000 ms. Reduced motion is always respected.')
      .addText((text) => {
        text.inputEl.type = 'number'; text.inputEl.min = '0'; text.inputEl.max = '2000'; text.inputEl.step = '10';
        text.inputEl.setAttribute('aria-label', 'Animation duration (ms)');
        text.setPlaceholder('140').setValue(String(normalizeAnimationDuration(this.plugin.settings.animationDuration)))
          .onChange(async (value) => {
            if (value.trim() === '' || !Number.isFinite(Number(value))) return;
            this.plugin.settings.animationDuration = normalizeAnimationDuration(value);
            await this.plugin.saveSettings();
          });
      }), 'animationDuration');
    this.addReset(new Setting(containerEl)
      .setName('Default sidebar width')
      .setDesc('The live sidebar resizer also saves its width automatically.')
      .addText((text) => text
        .setPlaceholder('330')
        .setValue(String(this.plugin.settings.sidebarWidth))
        .onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          if (Number.isFinite(parsed) && parsed >= 180) {
            this.plugin.settings.sidebarWidth = parsed;
            await this.plugin.saveSettings();
          }
        })), 'sidebarWidth');
  }

  addReset(setting, key) {
    const value = DEFAULT_SETTINGS[key];
    const control = setting.components.find((component) => typeof component.setValue === 'function');
    const label = typeof value === 'boolean' ? (value ? 'On' : 'Off')
      : key === 'suggestionScope' ? 'Whole vault' : String(value);
    const tooltip = `Reset ${setting.nameEl.textContent} to default (${label})`;
    return setting.addExtraButton((button) => {
      button.setIcon('rotate-ccw').setTooltip(tooltip).onClick(async () => {
        this.plugin.settings[key] = value;
        control.setValue(typeof value === 'number' ? String(value) : value);
        await this.plugin.saveSettings();
      });
      const el = button.extraSettingsEl;
      el.addClass('spotlight-ex-setting-reset');
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', tooltip);
      el.tabIndex = 0;
      el.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          el.click();
        }
      });
    });
  }

  renderCredits(containerEl) {
    containerEl.createEl('h3', { text: 'Thanks & attribution' });
    const credit = containerEl.createDiv('spotlight-ex-credit-card');
    credit.createEl('p', {
      text: 'Spotlight EX is a derivative of Bases Spotlight View by Brendan Early (mymindstorm). Thank you for creating and releasing the original plugin under the MIT License.',
    });
    const link = credit.createEl('a', {
      text: 'Original project on GitHub',
      href: UPSTREAM_URL,
      cls: 'spotlight-ex-upstream-link',
    });
    link.setAttr('target', '_blank');
    link.setAttr('rel', 'noopener noreferrer');

    containerEl.createEl('h3', { text: 'Original MIT License' });
    containerEl.createEl('p', {
      text: 'The original copyright notice and permission notice are preserved below and in the bundled LICENSE file, as required by the MIT License.',
    });
    const pre = containerEl.createEl('pre', { cls: 'spotlight-ex-license-text' });
    pre.setText(ORIGINAL_MIT_LICENSE);
  }
}

module.exports = class SpotlightEXPlugin extends Plugin {
  async onload() {
    this.views = new Set();
    await this.loadSettings();
    await this.loadStoredPropertyTypes();
    this.watchPropertyChanges();

    this.registerBasesView(VIEW_TYPE, {
      name: 'Spotlight EX',
      icon: 'presentation',
      factory: (controller, containerEl) => new SpotlightEXView(controller, containerEl, this),
      options: () => [
        {
          type: 'property',
          key: 'spotlight_property',
          displayName: 'Spotlight Content Property',
          description: 'Optional property containing a [[wikilink]] to the file shown in the large preview pane.',
        },
        {
          type: 'property',
          key: 'hyperlink_property',
          displayName: 'Hyperlink Property',
          description: 'Optional displayed property that opens the current Base entry when clicked.',
        },
      ],
    });

    this.registerBasesView(CARDS_VIEW_TYPE, {
      name: 'Cards EX',
      icon: 'lucide-layout-grid',
      factory: (controller, containerEl) => new CardsEXView(controller, containerEl, this),
      options: () => [
        { type: 'slider', key: 'cardSize', displayName: 'Card size', default: 260, min: 160, max: 640, step: 10 },
        { type: 'property', key: 'image', displayName: 'Image property' },
        { type: 'dropdown', key: 'imageFit', displayName: 'Image fit', default: 'cover', options: { cover: 'Cover', contain: 'Contain' } },
        { type: 'slider', key: 'imageAspectRatio', displayName: 'Image aspect ratio', default: 1, min: 0.25, max: 3, step: 0.05 },
      ],
    });

    // Bases Views EX supplies the shared settings navigation.
  }

  watchPropertyChanges() {
    const refreshTypes = () => {
      this.metadataRevision = (this.metadataRevision || 0) + 1;
      for (const view of this.views) view.syncSidebarProperties();
    };
    const manager = this.app.metadataTypeManager;
    if (manager?.on) {
      this.registerEvent(manager.on('changed', () => {
        refreshTypes();
        this.loadStoredPropertyTypes().then(refreshTypes);
      }));
    }
    this.registerEvent(this.app.metadataCache.on('changed', (file) => {
      this.metadataRevision = (this.metadataRevision || 0) + 1;
      for (const view of this.views) {
        if (view.onMetadataChanged) { view.onMetadataChanged(file); continue; }
        const entry = view.filteredEntries.find((item) => item.file.path === view.renderedFilePath);
        if (entry && view.getMetadataFile(entry.file)?.path === file.path) view.syncSidebarProperties();
      }
    }));
    // Obsidian also uses the raw config-file event to observe external type changes.
    this.registerEvent(this.app.vault.on('raw', (path) => {
      if (path === `${this.app.vault.configDir || '.obsidian'}/types.json`) {
        this.loadStoredPropertyTypes().then(refreshTypes);
      }
    }));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.settings.propertyHeights = this.settings.propertyHeights || {};
    this.settings.propertyOrder = this.settings.propertyOrder || [];
    this.settings.animationDuration = normalizeAnimationDuration(this.settings.animationDuration);
  }

  async loadStoredPropertyTypes() {
    this.storedPropertyTypes = {};
    try {
      const configDir = this.app.vault.configDir || '.obsidian';
      const path = `${configDir}/types.json`;
      if (await this.app.vault.adapter.exists(path)) {
        const raw = await this.app.vault.adapter.read(path);
        const parsed = JSON.parse(raw);
        if (parsed && parsed.types && typeof parsed.types === 'object') {
          this.storedPropertyTypes = parsed.types;
        }
      }
    } catch (err) {
      console.warn('[Spotlight EX] Could not read types.json fallback', err);
    }
  }

  getStoredPropertyType(key) {
    if (!this.storedPropertyTypes) return null;
    if (this.storedPropertyTypes[key]) return this.storedPropertyTypes[key];
    const lower = String(key).toLowerCase();
    if (this.storedPropertyTypes[lower]) return this.storedPropertyTypes[lower];
    const match = Object.keys(this.storedPropertyTypes).find((candidate) => candidate.toLowerCase() === lower);
    return match ? this.storedPropertyTypes[match] : null;
  }

  async saveSettings() {
    if (this.persistEditorSettings) await this.persistEditorSettings(this.settings);
    else await this.saveData(this.settings);
    for (const view of this.views || []) {
      view.applyAnimationSettings();
      if (view.sidebarEl) {
        view.sidebarWidth = this.settings.sidebarWidth;
        view.sidebarEl.style.width = `${view.sidebarWidth}px`;
      }
      view.onDataUpdated();
    }
  }
};

// Bundled after src/main.js: both layouts use PropertyEditorView's editors.
class CardRowHeights {
  constructor(heights) {
    this.values = heights;
    this.tree = new Float64Array(heights.length + 1);
    for (let i = 1; i <= heights.length; i++) {
      this.tree[i] += heights[i - 1];
      const parent = i + (i & -i);
      if (parent < this.tree.length) this.tree[parent] += this.tree[i];
    }
  }
  offset(index) {
    let sum = 0;
    for (let i = index; i > 0; i -= i & -i) sum += this.tree[i];
    return sum;
  }
  set(index, height) {
    const delta = height - this.values[index];
    if (Math.abs(delta) < 0.5) return;
    this.values[index] = height;
    for (let i = index + 1; i < this.tree.length; i += i & -i) this.tree[i] += delta;
  }
  rowAt(offset) {
    let index = 0, sum = 0;
    for (let bit = 2 ** Math.floor(Math.log2(this.values.length || 1)); bit; bit >>= 1) {
      const next = index + bit;
      if (next < this.tree.length && sum + this.tree[next] <= offset) {
        index = next; sum += this.tree[next];
      }
    }
    return Math.min(index, Math.max(0, this.values.length - 1));
  }
}

class CardsEXView extends PropertyEditorView {
  constructor(controller, containerEl, plugin) {
    super(controller, containerEl, plugin);
    this.type = CARDS_VIEW_TYPE;
    this.allowStructuredEditing = true;
    this.rows = [];
    this.entries = [];
    this.mountedRows = new Map();
    this.cards = new Map();
    this.rowHeights = new Map();
    this.pathRows = new Map();
    this.activeEditor = null;
    this.containerEl.addClass('cards-ex-view');
    this.scrollerEl = containerEl.createDiv('cards-ex-scroll');
    this.scrollerEl.tabIndex = 0;
    this.scrollerEl.setAttribute('aria-label', 'Cards EX gallery');
    this.canvasEl = this.scrollerEl.createDiv('cards-ex-canvas');
    this.statusEl = containerEl.createDiv({ cls: 'cards-ex-status', attr: { role: 'status', 'aria-live': 'polite' } });
    this.scrollerEl.addEventListener('scroll', () => this.scheduleWindow(), { passive: true });
    this.pointerHandler = () => this.activatePane();
    this.focusHandler = (event) => {
      this.scheduleDataRender();
      const active = this.activeEditor;
      if (active && !active.field.el.contains(event.relatedTarget)) this.containerEl.ownerDocument.defaultView.setTimeout(() => {
        if (this.activeEditor === active && !active.field.el.contains(this.containerEl.ownerDocument.activeElement)) this.endEditing();
      }, 0);
    };
    this.listCloseHandler = (event) => {
      const active = this.activeEditor;
      const controller = this.listEditors.get(event.target.closest('.spotlight-ex-property-value-container'));
      if (active?.field.el.contains(event.target) && !controller?.switching) this.endEditing();
    };
    this.containerEl.addEventListener('pointerdown', this.pointerHandler, true);
    this.containerEl.addEventListener('focusout', this.focusHandler);
    this.containerEl.addEventListener('spotlight-ex-editor-closed', this.listCloseHandler);
    const win = containerEl.ownerDocument.defaultView;
    this.sizeObserver = new win.ResizeObserver(() => {
      const width = this.scrollerEl.clientWidth;
      if (width !== this.lastWidth) { this.lastWidth = width; this.rebuildRows(true); }
      else this.scheduleWindow();
    });
    this.sizeObserver.observe(this.scrollerEl);
    this.rowObserver = new win.ResizeObserver((changes) => {
      if (this.unloaded || !this.heights) return;
      let changed = false;
      const anchor = this.heights.rowAt(this.scrollerEl.scrollTop);
      let correction = 0;
      for (const change of changes) {
        const index = Number(change.target.dataset.row);
        if (this.mountedRows.get(index) !== change.target) continue;
        const height = Math.ceil(change.target.getBoundingClientRect().height) + 16;
        const previous = this.heights.values[index];
        if (height > 16 && Math.abs(height - previous) > 0.5) {
          this.rowHeights.set(this.rows[index].key, height);
          this.heights.set(index, height);
          if (index < anchor) correction += height - previous;
          changed = true;
        }
      }
      if (changed) {
        if (correction) this.scrollerEl.scrollTop += correction;
        this.positionRows();
        this.scheduleWindow();
      }
    });
    this.plugin.views?.add(this);
  }

  get filteredEntries() { return this.entries; }

  getVisiblePropertyIds() {
    // An empty selection is intentional; do not fall back to every vault property.
    const selected = this.config?.getOrder?.() ?? this.data?.properties ?? [];
    return [...new Set(selected)];
  }

  cardOptions() {
    const number = (key, fallback, min, max) => {
      const raw = this.config?.get?.(key);
      const value = raw == null || raw === '' ? fallback : Number(raw);
      return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
    };
    return {
      size: number('cardSize', 260, 160, 640),
      image: this.config?.getAsPropertyId?.('image') || this.config?.get?.('image') || '',
      fit: this.config?.get?.('imageFit') === 'contain' ? 'contain' : 'cover',
      ratio: number('imageAspectRatio', 1, 0.25, 3),
    };
  }

  onDataUpdated() {
    if (this.unloaded) return;
    this.plugin.onViewConfigChanged?.(this);
    this.rebuildRows();
    this.syncSidebarProperties();
  }

  rebuildRows(resized = false) {
    if (this.unloaded) return;
    const focused = this.containerEl.ownerDocument.activeElement;
    const previousRows = this.rows;
    const oldAnchor = this.heights ? this.heights.rowAt(this.scrollerEl.scrollTop) : 0;
    const oldPath = this.rows[oldAnchor]?.entries?.[0]?.file.path;
    const oldOffset = this.heights ? this.scrollerEl.scrollTop - this.heights.offset(oldAnchor) : 0;
    const options = this.cardOptions();
    const properties = this.getVisiblePropertyIds();
    const width = Math.max(1, this.scrollerEl.clientWidth - 32);
    const columns = Math.max(1, Math.floor((width + 16) / (options.size + 16)));
    const cardWidth = Math.min(options.size, width);
    const layoutKey = JSON.stringify([properties, options, columns, Math.round(cardWidth),
      this.plugin.settings.showTypeBadge, this.plugin.settings.tagHashDisplay, this.plugin.settings.removeButtonAlwaysVisible]);
    if (layoutKey !== this.layoutKey || resized) this.rowHeights.clear();
    const layoutChanged = this.layoutKey !== layoutKey;
    this.layoutKey = layoutKey;
    this.options = options;
    this.properties = properties;
    this.columns = columns;
    this.cardWidth = cardWidth;

    const selected = new Map();
    for (const entry of this.data?.data || []) {
      if (!(entry?.file instanceof TFile)) continue;
      const original = sidecarOriginalPath(entry.file.path);
      const key = original || entry.file.path;
      if (!selected.has(key) || original) selected.set(key, entry);
    }
    const groups = this.data?.groupedData?.length ? this.data.groupedData : [{ entries: this.data?.data || [] }];
    const rows = [], entries = [], pathRows = new Map();
    for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
      const group = groups[groupIndex];
      const items = (group.entries || []).filter((entry) => entry?.file instanceof TFile && selected.get(sidecarOriginalPath(entry.file.path) || entry.file.path) === entry);
      if (!items.length) continue;
      const grouped = !!this.config?.get?.('groupBy') || groups.length > 1 || group.hasKey?.() || group.key?.isTruthy?.();
      if (grouped) rows.push({ key: `group:${groupIndex}`, label: group.key?.toString?.() || 'No value', count: items.length });
      for (let i = 0; i < items.length; i += columns) {
        const chunk = items.slice(i, i + columns);
        const index = rows.length;
        rows.push({ key: `${groupIndex}:${chunk[0].file.path}`, entries: chunk });
        for (const entry of chunk) { entries.push(entry); pathRows.set(entry.file.path, index); }
      }
    }
    // A filter-changing save or external update must not discard an editor.
    const active = this.activeEditor;
    if (active && !pathRows.has(active.record.entry.file.path)) {
      const path = active.record.entry.file.path;
      const position = Math.min(this.pathRows.get(path) || 0, rows.length);
      rows.splice(position, 0,
        { key: 'editing-outside-results', label: 'Editing outside current results', count: 1 },
        { key: `pinned:${path}`, entries: [active.record.entry] });
      for (const [filePath, index] of pathRows) if (index >= position) pathRows.set(filePath, index + 2);
      pathRows.set(path, position + 1);
    }
    this.rows = rows; this.entries = entries; this.pathRows = pathRows;
    const estimate = 70 + properties.filter((id) => id !== 'file.name').length * 66 + (options.image ? cardWidth / options.ratio : 0);
    this.heights = new CardRowHeights(rows.map((row) => this.rowHeights.get(row.key) || (row.entries ? estimate + 16 : 54)));
    const rowIndices = new Map(rows.map((row, index) => [row.key, index]));
    const retained = new Map();
    const obsolete = [];
    for (const [oldIndex, el] of this.mountedRows) {
      const previous = previousRows[oldIndex];
      const index = rowIndices.get(previous.key);
      const next = rows[index];
      const sameEntries = next && JSON.stringify(previous.entries?.map((item) => item.file.path)) === JSON.stringify(next.entries?.map((item) => item.file.path));
      if (sameEntries) {
        el.dataset.row = String(index);
        if (next.entries) el.style.gridTemplateColumns = `repeat(${columns}, minmax(0, ${cardWidth}px))`;
        else { el.empty(); el.createSpan({ text: next.label }); el.createSpan({ text: String(next.count), cls: 'cards-ex-group-count' }); }
        retained.set(index, el);
      } else { this.rowObserver.unobserve(el); obsolete.push(el); }
    }
    this.mountedRows = retained;
    for (const record of this.cards.values()) {
      const entry = selected.get(sidecarOriginalPath(record.entry.file.path) || record.entry.file.path);
      if (entry?.file.path === record.entry.file.path) record.entry = entry;
    }
    if (oldPath && pathRows.has(oldPath)) this.scrollerEl.scrollTop = this.heights.offset(pathRows.get(oldPath)) + oldOffset;
    this.canvasEl.style.height = `${Math.max(this.heights.offset(rows.length), 1)}px`;
    this.canvasEl.classList.toggle('cards-ex-is-empty', !rows.length);
    if (!rows.length) {
      for (const record of this.cards.values()) this.destroyCard(record);
      this.cards.clear();
      this.canvasEl.setText('No entries found. Check this Base’s filters.');
    } else {
      if (this.canvasEl.firstChild?.nodeType === 3) this.canvasEl.empty();
      for (const record of this.cards.values()) this.updateCard(record, layoutChanged);
      this.renderWindow();
    }
    for (const el of obsolete) el.remove();
    if (focused?.isConnected && this.containerEl.contains(focused) && focused !== this.containerEl.ownerDocument.activeElement) focused.focus({ preventScroll: true });
  }

  scheduleWindow() {
    if (this.unloaded || this.windowFrame) return;
    this.windowFrame = this.containerEl.ownerDocument.defaultView.requestAnimationFrame(() => {
      this.windowFrame = null; this.renderWindow();
    });
  }

  renderWindow() {
    if (this.unloaded || !this.rows.length || !this.heights) return;
    const top = this.scrollerEl.scrollTop;
    const overscan = Math.max(400, this.scrollerEl.clientHeight * 0.75);
    const first = this.heights.rowAt(Math.max(0, top - overscan));
    const last = this.heights.rowAt(top + this.scrollerEl.clientHeight + overscan);
    const wanted = new Set();
    for (let index = first; index <= last; index++) wanted.add(index);
    const activePath = this.activeEditor?.record.entry.file.path;
    if (activePath && this.pathRows.has(activePath)) wanted.add(this.pathRows.get(activePath));
    const wantedPaths = new Set();
    for (const index of wanted) for (const entry of this.rows[index].entries || []) wantedPaths.add(entry.file.path);
    for (const [index, element] of this.mountedRows) {
      if (wanted.has(index)) continue;
      this.rowObserver.unobserve(element); element.remove(); this.mountedRows.delete(index);
    }
    for (const [path, record] of this.cards) {
      if (!wantedPaths.has(path)) { this.destroyCard(record); this.cards.delete(path); }
    }
    for (const index of [...wanted].sort((a, b) => a - b)) {
      const row = this.rows[index];
      let element = this.mountedRows.get(index);
      if (!element) {
        element = this.canvasEl.createDiv({ cls: row.entries ? 'cards-ex-row' : 'cards-ex-group' });
        element.dataset.row = String(index);
        this.mountedRows.set(index, element);
        if (row.entries) {
          element.style.gridTemplateColumns = `repeat(${this.columns}, minmax(0, ${this.cardWidth}px))`;
          for (const entry of row.entries) {
            let record = this.cards.get(entry.file.path);
            if (!record) { record = this.createCard(entry); this.cards.set(entry.file.path, record); }
            else { record.entry = entry; this.updateCard(record); }
            element.append(record.el);
          }
        } else {
          element.createSpan({ text: row.label });
          element.createSpan({ text: String(row.count), cls: 'cards-ex-group-count' });
        }
        this.rowObserver.observe(element);
      }
    }
    this.positionRows();
  }

  positionRows() {
    this.canvasEl.style.height = `${Math.max(1, this.heights.offset(this.rows.length))}px`;
    for (const [index, element] of this.mountedRows) element.style.transform = `translateY(${this.heights.offset(index)}px)`;
  }

  createCard(entry) {
    const el = this.containerEl.ownerDocument.createElement('article');
    el.className = 'cards-ex-card'; el.dataset.path = entry.file.path;
    const record = { el, entry, fields: new Map() };
    const content = el.createDiv('cards-ex-card-content');
    record.cover = content.createDiv('cards-ex-cover');
    record.body = content.createDiv('cards-ex-card-body');
    record.title = record.body.createEl('a', { cls: 'cards-ex-title', href: '#' });
    record.title.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); this.openEntry(record.entry, event); });
    record.title.addEventListener('auxclick', (event) => { if (event.button === 1) { event.preventDefault(); this.openEntry(record.entry, event); } });
    record.values = record.body.createDiv('cards-ex-fields');
    el.addEventListener('click', (event) => {
      if (!event.target.closest('a, button, input, textarea, select, .cards-ex-field')) this.openEntry(record.entry, event);
    });
    this.updateCard(record, true);
    this.animateContentSize(el, content);
    return record;
  }

  openEntry(entry, event) {
    this.app.workspace.getLeaf(!!(event?.ctrlKey || event?.metaKey || event?.button === 1)).openFile(entry.file);
  }

  fieldState(entry, propId) {
    const key = frontmatterKeyFromPropertyId(propId);
    const editable = isEditablePropertyId(propId) && !!key;
    const raw = editable ? this.readRawFrontmatterValue(this.getMetadataFile(entry.file), key) : null;
    let value;
    if (!editable) { try { value = entry.getValue(propId); } catch (_err) { value = null; } }
    const type = editable ? this.getPropertyType(key, raw) : 'readonly';
    const name = this.config?.getDisplayName?.(propId) || this.getPropName(propId);
    return { key, editable, raw, value, type, fingerprint: `${name}\0${type}\0${editable ? toComparableString(raw) : value?.toString?.() ?? ''}` };
  }

  updateCard(record, force = false) {
    const focused = record.el.ownerDocument.activeElement;
    record.title.setText(record.entry.file.basename);
    record.title.title = record.entry.file.path;
    this.updateCover(record);
    const selected = new Set(this.properties.filter((id) => id !== 'file.name'));
    for (const [id, field] of record.fields) {
      if (!selected.has(id) && this.activeEditor?.field !== field) { this.clearEditorCleanups(field.el); field.el.remove(); record.fields.delete(id); }
    }
    for (const id of selected) {
      const state = this.fieldState(record.entry, id);
      let field = record.fields.get(id);
      if (!field) {
        field = { id, el: record.values.createDiv({ cls: 'cards-ex-field spotlight-ex-property' }) };
        field.el.dataset.prop = id; record.fields.set(id, field);
        field.el.addEventListener('keydown', (event) => event.stopPropagation());
        field.el.addEventListener('click', (event) => {
          if (!field.state?.editable || ['list', 'tags'].includes(field.state.type) || event.target.closest('button, input, textarea, select, a, summary, pre')) return;
          event.stopPropagation(); this.startEditing(record, field);
        });
      }
      if (this.activeEditor?.field === field) {
        if (state.type !== field.state.type && !this.pendingPropertyWrites.get(`${record.entry.file.path}\0${state.key}`)) {
          const input = field.el.querySelector('[data-dirty="true"], .spotlight-ex-add-input');
          const draft = input?.value ?? input?.textContent ?? '';
          if (draft) this.recoveredDrafts.set(`${record.entry.file.path}\0${id}`, draft);
          this.renderActiveField(record, field, state);
        } else if (field.showTypeBadge !== this.plugin.settings.showTypeBadge) {
          const oldHeader = field.el.querySelector('.spotlight-ex-property-header');
          this.renderFieldHeader(record, field, state);
          field.el.insertBefore(field.el.lastChild, oldHeader);
          oldHeader.remove();
        }
        continue;
      }
      if (force || field.state?.fingerprint !== state.fingerprint) this.renderCompactField(record, field, state);
    }
    // Keep unchanged fields in place: reattaching a clicked field during pane
    // activation can prevent the browser from delivering its first click.
    const ordered = [...selected].map((id) => record.fields.get(id).el);
    if (this.activeEditor?.record === record && !selected.has(this.activeEditor.field.id)) ordered.push(this.activeEditor.field.el);
    for (let index = 0; index < ordered.length; index++) {
      if (record.values.children[index] !== ordered[index]) record.values.insertBefore(ordered[index], record.values.children[index] || null);
    }
    if (focused?.isConnected && record.el.contains(focused) && focused !== record.el.ownerDocument.activeElement) focused.focus({ preventScroll: true });
  }

  renderFieldHeader(record, field, state) {
    field.showTypeBadge = this.plugin.settings.showTypeBadge;
    const header = field.el.createDiv('spotlight-ex-property-header');
    const name = this.config?.getDisplayName?.(field.id) || this.getPropName(field.id);
    const details = PROPERTY_TYPES[state.type] || { name: state.type, icon: 'lucide-circle-help' };
    if (this.plugin.settings.showTypeBadge) {
      const icon = header.createEl('button', { cls: 'spotlight-ex-type-icon clickable-icon', attr: { 'aria-label': `Change ${name} property type (${details.name})`, title: `Property type: ${details.name}` } });
      setIcon(icon, this.getPropertyWidget(state.key, state.raw)?.icon || details.icon);
      icon.disabled = !state.editable || state.type === 'complex' || !this.app.metadataTypeManager?.setType || ['tags', 'aliases', 'cssclasses'].includes(state.key?.toLowerCase());
      icon.addEventListener('click', (event) => { event.stopPropagation(); this.openPropertyTypeMenu(event, state.key, state.type); });
    }
    header.createDiv({ text: name, cls: 'spotlight-ex-property-name' });
    if (this.plugin.settings.showTypeBadge) header.createSpan({ text: details.name, cls: 'spotlight-ex-type-badge' });
    else if (!state.editable) header.createSpan({ text: 'Read-only', cls: 'cards-ex-readonly-label' });
  }

  renderCompactField(record, field, state) {
    this.clearEditorCleanups(field.el); field.el.empty(); field.state = state;
    field.el.removeClass('cards-ex-field-active');
    this.renderFieldHeader(record, field, state);
    const value = field.el.createDiv('cards-ex-compact-value spotlight-ex-property-value-container');
    if (state.editable) {
      if (state.type === 'list' || state.type === 'tags') {
        this.renderMultiValueEditor(record.entry, this.entries, state.key, state.type, state.raw, value,
          { limit: 8, activate: (intent) => this.startEditing(record, field, intent) });
        this.alignPropertyControls(field.el); return;
      }
      value.tabIndex = 0; value.setAttribute('role', 'button');
      value.setAttribute('aria-label', `Edit ${this.getPropName(field.id)} for ${record.entry.file.basename}`);
      const start = (event) => { event.preventDefault(); event.stopPropagation(); this.startEditing(record, field); };
      value.addEventListener('click', start);
      value.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') start(event); });
      if (state.type === 'checkbox') {
        const row = value.createDiv('spotlight-ex-checkbox-row');
        setIcon(row.createSpan('cards-ex-check-display spotlight-ex-checkbox'), state.raw === true ? 'lucide-check-square' : 'lucide-square');
        row.createSpan({ text: state.raw == null ? 'No value' : state.raw ? 'True' : 'False', cls: 'spotlight-ex-checkbox-label' });
      } else if (Array.isArray(state.raw) && state.type !== 'complex') {
        const items = state.raw.slice(0, 8);
        for (const item of items) value.createSpan({ text: state.type === 'tags' && this.plugin.settings.tagHashDisplay ? `#${String(item).replace(/^#/, '')}` : isWikiLinkString(item) ? displayWikiLink(item) : toComparableString(item), cls: 'cards-ex-compact-chip' });
        if (state.raw.length > 8) value.createSpan({ text: `+${state.raw.length - 8}`, cls: 'cards-ex-compact-chip' });
        if (!items.length) value.setText('—');
      } else {
        const text = toComparableString(state.raw);
        value.createSpan({ text: text || '—', cls: text ? '' : 'spotlight-ex-empty-value' });
      }
    } else { this.renderReadOnlyValue(record.entry, field.id, value); }
    this.alignPropertyControls(field.el);
  }

  async startEditing(record, field, intent = null) {
    if (this.activeEditor?.field === field) {
      this.listEditors.get(field.el.querySelector('.spotlight-ex-property-value-container'))?.open(intent);
      return;
    }
    if (this.activeEditor && !await this.endEditing()) return;
    if (!record.el.isConnected || this.unloaded) return;
    this.activeEditor = { record, field };
    this.renderActiveField(record, field, this.fieldState(record.entry, field.id), intent);
    this.scheduleWindow();
  }

  renderActiveField(record, field, state, intent = null) {
    this.clearEditorCleanups(field.el); field.el.empty(); field.state = state;
    field.el.addClass('cards-ex-field-active');
    this.renderFieldHeader(record, field, state);
    const value = field.el.createDiv('spotlight-ex-property-value-container');
    this.renderTypedEditor(record.entry, this.entries, state.key, field.id, state.type, state.raw, value);
    const draft = this.recoveredDrafts.get(`${record.entry.file.path}\0${field.id}`);
    if (draft) {
      const recovery = field.el.createEl('details', { cls: 'spotlight-ex-recovered-draft' });
      recovery.createEl('summary', { text: 'Unfinished value from the previous type' });
      recovery.createEl('pre', { text: draft });
    }
    if (state.type === 'list' || state.type === 'tags') this.listEditors.get(value)?.open(intent);
    const first = value.querySelector('textarea, input, select')
      || value.querySelector('button');
    first?.focus();
    this.alignPropertyControls(field.el);
  }

  endEditing(cancel = false) {
    const active = this.activeEditor;
    if (!active) return Promise.resolve(true);
    if (active.ending) return active.ending;
    active.ending = Promise.resolve().then(() => this.finishEditing(active, cancel)).finally(() => { active.ending = null; });
    return active.ending;
  }

  async finishEditing(active, cancel) {
    if (!cancel) {
      const saved = await this.flushEditorDrafts(active.field.el);
      if (!saved) { this.statusEl.setText('Could not save this input. Correct it, retry, or press Escape to cancel.'); return false; }
      const focused = this.containerEl.ownerDocument.activeElement;
      if (active.field.el.contains(focused)) focused.blur();
      await this.writeQueue;
      await Promise.resolve();
      const draft = active.field.el.querySelector('[data-dirty="true"]');
      const add = active.field.el.querySelector('.spotlight-ex-add-input');
      if (this.pendingWrites || draft || add?.value.trim()) {
        this.statusEl.setText('Could not save this input. Correct it, retry, or press Escape to cancel.');
        (draft || add)?.focus(); return false;
      }
    } else { await this.flushEditorDrafts(active.field.el, true); }
    if (this.activeEditor !== active) return false;
    this.activeEditor = null; this.statusEl.empty();
    this.renderCompactField(active.record, active.field, this.fieldState(active.record.entry, active.field.id));
    this.rebuildRows();
    return true;
  }

  // Shared text-editor Escape cancels only this card's unfinished editor.
  render() { if (this.activeEditor) this.endEditing(true); else this.onDataUpdated(); }

  scheduleDataRender() {
    if (this.unloaded || this.dataRenderTimer) return;
    this.dataRenderTimer = this.containerEl.ownerDocument.defaultView.setTimeout(() => {
      this.dataRenderTimer = null; this.syncSidebarProperties(); this.scheduleWindow();
    }, 0);
  }

  syncSidebarProperties() {
    if (this.unloaded) return;
    for (const record of this.cards.values()) this.updateCard(record);
  }

  onMetadataChanged(file) {
    for (const record of this.cards.values()) {
      if (record.entry.file.path === file.path || this.getMetadataFile(record.entry.file)?.path === file.path) this.updateCard(record);
    }
  }

  coverValue(entry) {
    if (!this.options.image) return '';
    let value;
    if (isEditablePropertyId(this.options.image)) {
      value = this.readRawFrontmatterValue(this.getMetadataFile(entry.file), frontmatterKeyFromPropertyId(this.options.image));
    } else { try { value = unwrapValue(entry.getValue(this.options.image)); } catch (_err) { value = null; } }
    return Array.isArray(value) ? value[0] : value;
  }

  updateCover(record) {
    const value = this.coverValue(record.entry);
    const key = JSON.stringify([value, this.options.image, this.options.ratio, this.options.fit]);
    if (record.coverKey === key) return;
    record.coverKey = key; record.cover.empty(); record.cover.hidden = true;
    record.cover.style.aspectRatio = String(this.options.ratio);
    if (!value) return;
    const text = String(value).trim();
    if (/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(text)) {
      record.cover.hidden = false; record.cover.style.backgroundColor = text; return;
    }
    record.cover.style.backgroundColor = '';
    let src = /^https?:\/\//i.test(text) ? text : null;
    if (!src) {
      const path = extractWikilink(text) || text;
      const file = this.app.metadataCache.getFirstLinkpathDest?.(path, record.entry.file.path) || this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile && /^(png|jpe?g|gif|bmp|svg|webp|avif|heic|heif)$/i.test(file.extension)) src = this.app.vault.getResourcePath(file);
    }
    if (!src) return;
    record.cover.hidden = false;
    const img = record.cover.createEl('img', { attr: { alt: record.entry.file.basename, loading: 'lazy', decoding: 'async', src } });
    img.style.objectFit = this.options.fit;
    img.addEventListener('error', () => { if (img.isConnected) { img.remove(); record.cover.createSpan({ text: 'Image unavailable', cls: 'cards-ex-image-error' }); } }, { once: true });
  }

  destroyCard(record) {
    this.clearEditorCleanups(record.el);
    for (const image of record.el.querySelectorAll('img')) image.removeAttribute('src');
    record.el.remove();
  }

  onunload() {
    this.unloadEditors();
    this.unloaded = true; this.plugin.views?.delete(this);
    const win = this.containerEl.ownerDocument.defaultView;
    win.clearTimeout(this.dataRenderTimer); win.clearTimeout(this.activationTimer); win.cancelAnimationFrame(this.windowFrame);
    this.sizeObserver.disconnect(); this.rowObserver.disconnect(); this.clearEditorCleanups();
    for (const record of this.cards.values()) this.destroyCard(record);
    this.cards.clear(); this.mountedRows.clear(); this.rows = []; this.entries = [];
    this.rowHeights.clear(); this.pathRows.clear();
    this.containerEl.removeEventListener('pointerdown', this.pointerHandler, true);
    this.containerEl.removeEventListener('focusout', this.focusHandler);
    this.containerEl.removeEventListener('spotlight-ex-editor-closed', this.listCloseHandler);
    this.suggestionCache.clear(); this.activeEditor = null; this.containerEl.empty(); this.containerEl.removeClass('cards-ex-view');
  }
}

module.exports.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
module.exports.ORIGINAL_MIT_LICENSE = ORIGINAL_MIT_LICENSE;
