(() => {
  const pause = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const key = (input, value, options = {}) => input.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...options }));
  const type = (input, value) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); };
  const click = (element) => {
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    if (element.dispatchEvent(down)) element.focus();
    element.click();
  };
  const frame = () => new Promise(requestAnimationFrame);
  let fixture;

  function setup(frontmatter = {}, assignedTypes = {}) {
    fixture?.view.flushEditorDrafts(fixture.view.containerEl, true);
    fixture?.view.onunload();
    fixture?.plugin.unload();
    document.querySelector('#fixture').replaceChildren();
    const root = document.querySelector('#fixture').createDiv();
    const file = new testObsidian.TFile('test.md');
    const fm = { labels: ['alpha'], tags: ['existing'], notes: 'Short text', other: 'Other text', score: 3,
      done: false, date: '2026-10-02', datetime: '2026-10-02T10:30:45', ...frontmatter };
    const types = { labels: 'multitext', tags: 'tags', notes: 'text', other: 'text', score: 'number',
      done: 'checkbox', date: 'date', datetime: 'datetime', ...assignedTypes };
    const manager = new testObsidian.TestEvents();
    const widgets = Object.fromEntries(Object.entries(PROPERTY_TYPES).filter(([, info]) => info.native).map(([type, info]) => [info.native, {
      type: info.native, icon: info.icon,
      render: (container, value, context) => {
        const input = container.createEl('input', { type: 'text', cls: 'test-native-widget' }); input.value = value || '';
        input.addEventListener('change', () => context.onChange(input.value));
        input.addEventListener('keydown', (event) => { if (event.key === 'Enter') context.onChange(input.value); });
      },
    }]));
    manager.getAssignedWidget = (key) => types[Object.keys(types).find((name) => name.toLowerCase() === key.toLowerCase())] || null;
    manager.getWidget = (type) => widgets[type] || { type: 'unknown' };
    manager.getTypeInfo = (key, raw) => ({ expected: manager.getWidget(manager.getAssignedWidget(key) || PROPERTY_TYPES[normalizeType(null, key, raw)]?.native) });
    manager.getPropertyInfo = (key) => ({ name: key, widget: manager.getAssignedWidget(key) || 'text', occurrences: 1 });
    manager.setType = async (key, type) => { types[key] = type; manager.trigger('changed', key.toLowerCase()); };
    const cache = new testObsidian.TestEvents(); cache.getFileCache = () => ({ frontmatter: fm });
    const vault = new testObsidian.TestEvents();
    Object.assign(vault, { getAbstractFileByPath: () => file, getMarkdownFiles: () => [file],
      adapter: { exists: async () => true, read: async () => JSON.stringify({ types }) } });
    let view;
    const leaf = { view: { containerEl: root } };
    const workspace = {
      activeLeaf: null,
      iterateAllLeaves: (callback) => callback(leaf),
      setActiveLeaf: (next, options) => {
        assert(options.focus === false, 'Activating pane stole native focus');
        workspace.activeLeaf = next;
        view.onDataUpdated();
      },
    };
    const app = {
      workspace,
      vault, metadataCache: cache, metadataTypeManager: manager,
      fileManager: { processFrontMatter: async (_file, callback) => {
        await pause(25);
        if (fixture.failNext) { fixture.failNext = false; throw new Error('Expected test failure'); }
        callback(fm);
        cache.trigger('changed', file); view.onDataUpdated();
        // Simulate a delayed metadata refresh after the write has returned.
        setTimeout(() => view.onDataUpdated(), 5);
      } },
    };
    const plugin = new module.exports(); plugin.app = app; plugin.views = new Set();
    plugin.settings = { ...DEFAULT_SETTINGS, propertyHeights: {}, propertyOrder: [], suggestionScope: 'base' };
    plugin.storedPropertyTypes = { ...types };
    plugin.saveData = async (settings) => {
      const status = document.querySelector('#settings-status');
      status.textContent = 'Settings saved in the preview.';
      status.dataset.saved = JSON.stringify(settings);
    };
    plugin.watchPropertyChanges();
    view = new SpotlightEXView({ app }, root, plugin);
    fixture = { view, fm, workspace, leaf, plugin, types, manager, cache, file, vault };
    view.config = { get: () => null, getDisplayName: (id) => id.replace(/^note\./, '') };
    view.data = { data: [{ file }], properties: Object.keys(fm).map((key) => `note.${key}`) };
    view.renderFileContent = (_file, container) => container.createDiv({ text: 'Preview area — metadata edits are kept in memory.' });
    view.render();
    return fixture;
  }
  const field = (name) => fixture.view.sidebarEl.querySelector(`[data-prop="note.${name}"]`);
  const open = (name) => {
    click(field(name).querySelector('.spotlight-ex-chip-list'));
    return field(name).querySelector('input');
  };
  const settled = async () => { await fixture.view.writeQueue; await pause(20); };

  const cases = [
    ['Dashes, names and property space open one button-free input', async () => {
      for (const selector of ['.spotlight-ex-empty-value','.spotlight-ex-property-name','.spotlight-ex-property-value-container']) {
        setup({ labels:[] }); click(field('labels').querySelector(selector));
        const input = field('labels').querySelector('.spotlight-ex-add-input');
        assert(input && document.activeElement === input, `Click on ${selector} did not start entry`);
        assert(!field('labels').querySelector('.spotlight-ex-add-button,.spotlight-ex-add-confirm,.spotlight-ex-add-cancel'), 'Extra buttons are still shown');
        key(input,'Escape'); await pause(); assert(!input.isConnected && fixture.fm.labels.length === 0, 'Escape did not cancel');
      }
    }],
    ['Renaming stays inside the chip; the separate input only adds, preserving order and concurrent values', async () => {
      setup({ labels:['before','[[Old|Alias]]','after'] });
      click(field('labels').querySelectorAll('.spotlight-ex-chip-label')[1]);
      const input = field('labels').querySelector('input');
      assert(input.closest('.spotlight-ex-chip-label') && !field('labels').querySelector('.spotlight-ex-add-input'), 'Rename used the separate adding field');
      assert(input.value === '[[Old|Alias]]' && input.selectionEnd === input.value.length, 'Rename did not select the stored value');
      type(input,'[[New|Renamed]]'); fixture.fm.labels.push('external'); key(input,'Enter');
      await settled(); assert(!input.isConnected, 'Enter did not finish inline renaming');
      const add = field('labels').querySelector('.spotlight-ex-add-input');
      assert(add && !add.closest('.spotlight-ex-chip') && document.activeElement === add, 'Rename did not move directly to the separate adding field');
      assert(document.activeElement !== field('labels').querySelector('.spotlight-ex-chip-list'), 'Rename highlighted the whole value list');
      type(add,'next'); key(add,'Enter'); await settled();
      assert(fixture.fm.labels.join() === 'before,[[New|Renamed]],after,external,next', 'Rename lost ordering or a concurrent value');
      assert(add.isConnected && document.activeElement === add && !add.value, 'Adding did not leave entry ready');
    }],
    ['Inline renaming keeps the chip, selection and draft through refreshes; Escape restores the value', async () => {
      setup({ labels:['first','original','last'] });
      click(field('labels').querySelectorAll('.spotlight-ex-chip-label')[1]);
      const input = field('labels').querySelector('.spotlight-ex-rename-input'), chip = input.closest('.spotlight-ex-chip');
      type(input,'draft with more text'); input.setSelectionRange(3,8);
      fixture.view.onDataUpdated(); fixture.view.syncSidebarProperties(); await pause();
      assert(input.isConnected && input.closest('.spotlight-ex-chip') === chip && document.activeElement === input && input.selectionStart === 3, 'Refresh replaced the inline draft or selection');
      key(input,'Escape'); await settled();
      assert(fixture.fm.labels.join() === 'first,original,last' && !input.isConnected && field('labels').textContent.includes('original'), 'Escape saved or lost the original value');
      assert(document.activeElement.classList.contains('spotlight-ex-chip-label') && !field('labels').querySelector('.spotlight-ex-add-input'), 'Escape did not return focus to the pill');
    }],
    ['Property growth and shrink animate briefly, settle to content height and release animations on unload', async () => {
      setup({ labels:[] }); await frame(); await frame();
      const box = field('labels').querySelector('.spotlight-ex-property-value-container');
      const before = box.getBoundingClientRect().height;
      const input = open('labels'); await frame(); await frame();
      assert(box.getAnimations().length === (matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1), 'Growing property did not respect the motion preference');
      await pause(180); assert(box.getBoundingClientRect().height > before && !box.getAnimations().length, 'Growth did not settle');
      key(input,'Escape'); await frame(); await frame(); await frame();
      const closingBox = field('labels').querySelector('.spotlight-ex-property-value-container');
      assert(closingBox.getAnimations().length === (matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1), 'Shrinking property did not animate across a sidebar refresh');
      fixture.view.onunload(); assert(!closingBox.getAnimations().length && !box.getAnimations().length, 'Unload left an animation running');
    }],
    ['Switching from adding to inline renaming saves the addition; suggestions finish a rename without adding another item', async () => {
      setup({ labels:['original'], tags:['existing'] }); const add = open('labels'); type(add,'added draft');
      click(field('labels').querySelector('.spotlight-ex-chip-label')); await settled();
      const input = field('labels').querySelector('.spotlight-ex-rename-input');
      assert(input && !add.isConnected && fixture.fm.labels.join() === 'original,added draft', 'Switching to rename lost the addition');
      fixture.view.getSuggestions = () => ['suggested replacement'];
      type(input,'suggested'); click(field('labels').querySelector('.spotlight-ex-suggestion')); await settled();
      assert(!input.isConnected && fixture.fm.labels.join() === 'suggested replacement,added draft', 'Suggestion appended a value or reopened the rename');
      assert(field('labels').querySelector('.spotlight-ex-add-input') === document.activeElement, 'Rename suggestion did not continue with adding');
      click(field('tags').querySelector('.spotlight-ex-chip-label'));
      const tag = field('tags').querySelector('.spotlight-ex-rename-input'); type(tag,'#renamed'); key(tag,'Enter'); await settled();
      assert(fixture.fm.tags.join() === 'renamed' && !tag.isConnected, 'Inline tag rename did not normalize and close');
    }],
    ['Animation duration saves, controls height and chip width, disables at zero, and resets to 140 ms', async () => {
      setup({ labels:['existing'] }); await frame(); await frame();
      const preview = document.querySelector('#settings-preview'); preview.replaceChildren(); preview.hidden = false;
      const tab = new SpotlightEXSettingTab(fixture.plugin.app, fixture.plugin); preview.append(tab.containerEl); tab.display();
      const duration = preview.querySelector('[aria-label="Animation duration (ms)"]');
      assert(duration.value === '140', 'Animation default was not shown');
      type(duration,'320'); await pause();
      assert(fixture.plugin.settings.animationDuration === 320 && JSON.parse(document.querySelector('#settings-status').dataset.saved).animationDuration === 320, 'Animation duration was not saved');
      let input = open('labels'); await frame(); await frame();
      let box = field('labels').querySelector('.spotlight-ex-property-value-container');
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) assert(box.getAnimations()[0]?.effect.getTiming().duration === 320, 'Property height ignored the duration');
      await pause(360); key(input,'Escape'); await pause(360);
      click(field('labels').querySelector('.spotlight-ex-chip-label'));
      input = field('labels').querySelector('.spotlight-ex-rename-input');
      assert(getComputedStyle(input).transitionDuration === (matchMedia('(prefers-reduced-motion: reduce)').matches ? '0s' : '0.32s'), 'Chip width ignored the duration');
      key(input,'Escape'); type(duration,'0'); await pause();
      input = open('labels'); await frame(); await frame();
      box = field('labels').querySelector('.spotlight-ex-property-value-container');
      assert(!box.getAnimations().length && fixture.view.containerEl.style.getPropertyValue('--spotlight-ex-animation-duration') === '0ms', 'Zero did not disable animation');
      key(input,'Escape');
      click(preview.querySelector('[aria-label="Reset Animation duration (ms) to default (140)"]')); await pause();
      assert(duration.value === '140' && fixture.plugin.settings.animationDuration === 140 && fixture.view.containerEl.style.getPropertyValue('--spotlight-ex-animation-duration') === '140ms', 'Reset did not restore 140 ms');
      preview.hidden = true;
    }],
    ['Renaming numeric values preserves numbers; clearing a renamed value removes that occurrence', async () => {
      setup({ labels:[1,2,3] }); click(field('labels').querySelectorAll('.spotlight-ex-chip-label')[1]);
      let input = field('labels').querySelector('input'); type(input,'0'); key(input,'Enter'); await settled();
      assert(fixture.fm.labels.join() === '1,0,3' && fixture.fm.labels[1] === 0, 'Renaming to zero removed the value');
      key(field('labels').querySelector('.spotlight-ex-add-input'),'Escape'); await pause(); click(field('labels').querySelectorAll('.spotlight-ex-chip-label')[1]);
      input = field('labels').querySelector('.spotlight-ex-rename-input'); type(input,'4.5'); key(input,'Enter'); await settled();
      assert(fixture.fm.labels.join() === '1,4.5,3' && typeof fixture.fm.labels[1] === 'number', 'Numeric rename became a string');
      key(field('labels').querySelector('.spotlight-ex-add-input'),'Escape'); await pause(); click(field('labels').querySelectorAll('.spotlight-ex-chip-label')[1]);
      input = field('labels').querySelector('.spotlight-ex-rename-input'); type(input,''); document.querySelector('#deactivate').focus(); await pause(); await settled();
      assert(fixture.fm.labels.join() === '1,3', 'Clearing a renamed value did not remove it');
      setup({ labels:['same','between','same','after'] }); fixture.plugin.settings.preventDuplicateListValues = false;
      click(field('labels').querySelectorAll('.spotlight-ex-chip-remove')[2]); await settled();
      assert(fixture.fm.labels.join() === 'same,between,after', 'Remove targeted the wrong duplicate occurrence');
    }],
    ['Renames save on click-away and a failed blur save retains the input for retry', async () => {
      setup(); click(field('labels').querySelector('.spotlight-ex-chip-label')); let input = field('labels').querySelector('input');
      type(input,'renamed'); document.querySelector('#deactivate').focus(); await pause(); await settled();
      assert(fixture.fm.labels.join() === 'renamed' && !input.isConnected, 'Rename did not save and close on blur');
      assert(!field('labels').querySelector('.spotlight-ex-add-input'), 'Clicking away reopened adding');
      input = open('labels'); type(input,'retry blur'); fixture.failNext = true; document.querySelector('#deactivate').focus(); await pause(); await settled();
      assert(input.isConnected && input.value === 'retry blur' && !fixture.fm.labels.includes('retry blur'), 'Failed blur save discarded input');
      click(input); key(input,'Enter'); await settled(); assert(fixture.fm.labels.includes('retry blur'), 'Blur retry failed');
    }],
    ['A failed rename keeps its chip for retry; leaving during confirmation never reopens adding', async () => {
      setup({ labels:['original'] }); click(field('labels').querySelector('.spotlight-ex-chip-label'));
      const input = field('labels').querySelector('.spotlight-ex-rename-input'); type(input,'replacement'); fixture.failNext = true;
      key(input,'Enter'); await settled();
      assert(input.isConnected && input.value === 'replacement' && !field('labels').querySelector('.spotlight-ex-add-input'), 'Failed rename opened adding or lost its draft');
      key(input,'Enter'); document.querySelector('#deactivate').focus(); await settled();
      assert(fixture.fm.labels.join() === 'replacement' && !input.isConnected && !field('labels').querySelector('.spotlight-ex-add-input'), 'Confirmation took focus back after clicking away');
    }],
    ['Closing a view flushes list and text drafts before removing its editors', async () => {
      setup({ labels:[] }); const input = open('labels'); type(input,'saved at close'); type(field('notes').querySelector('textarea'),'text at close');
      fixture.view.onunload(); await settled();
      assert(fixture.fm.labels[0] === 'saved at close' && fixture.fm.notes === 'text at close', 'View close did not flush drafts');
      assert(!fixture.view.draftSavers.size && !fixture.view.listEditors.size, 'Closed view retained editor controllers');
    }],
    ['Window close events commit the focused value and close its input', async () => {
      setup({ labels:[] }); const input = open('labels'); type(input,'window close value');
      window.dispatchEvent(new Event('beforeunload')); await settled(); await pause();
      assert(fixture.fm.labels[0] === 'window close value' && !input.isConnected, 'Window close event did not save and close input');
    }],
    ['Empty dashes and checkboxes follow actual icon geometry across appearances without replacing inputs', async () => {
      const appearance = document.body.dataset.appearance;
      try {
        setup({ labels: [], done: null });
        const checkbox = field('done').querySelector('input');
        for (const variant of ['basic', 'obsidian', 'large', 'obsidian']) {
          document.body.dataset.appearance = variant;
          await frame(); await frame();
          for (const name of ['labels', 'done']) {
            const row = field(name);
            const icon = row.querySelector('.spotlight-ex-type-icon').getBoundingClientRect();
            const value = row.querySelector('.spotlight-ex-empty-value, .spotlight-ex-checkbox').getBoundingClientRect();
            assert(Math.abs(icon.left + icon.width / 2 - value.left - value.width / 2) < 0.75, `${name} is off-center in ${variant}`);
            if (variant === 'large') assert(icon.width === 52, 'The oversized theme was not applied');
          }
          const name = field('done').querySelector('.spotlight-ex-property-name').getBoundingClientRect();
          const label = field('done').querySelector('.spotlight-ex-checkbox-label').getBoundingClientRect();
          assert(Math.abs(name.left - label.left) < 0.75, `Checkbox label is misaligned in ${variant}`);
          assert(checkbox === field('done').querySelector('input') && checkbox.indeterminate, 'Appearance change replaced or changed the checkbox');
        }
      } finally { document.body.dataset.appearance = appearance; }
    }],
    ['Property type icons and labels are on by default for every standard editor', async () => {
      setup();
      assert(DEFAULT_SETTINGS.showTypeBadge, 'Type display default is off');
      for (const [name, type] of Object.entries({ labels: 'list', tags: 'tags', notes: 'text', score: 'number', done: 'checkbox', date: 'date', datetime: 'datetime' })) {
        const row = field(name);
        assert(row.dataset.type === type, `Wrong ${name} editor`);
        const icon = row.querySelector('.spotlight-ex-type-icon');
        assert(icon?.querySelector('svg') && icon.dataset.icon === PROPERTY_TYPES[type].icon, `Missing native ${type} icon`);
        assert(row.querySelector('.spotlight-ex-type-badge').textContent === PROPERTY_TYPES[type].name, `Wrong ${type} label`);
        assert(icon.nextElementSibling.classList.contains('spotlight-ex-property-name'), 'Icon is not beside the name');
      }
    }],
    ['All native scalar editors save the correct YAML types and empty values', async () => {
      setup();
      for (const [name, value, expected] of [['score', '3.75', 3.75], ['date', '2026-11-04', '2026-11-04'], ['datetime', '2026-11-04T14:15:30', '2026-11-04T14:15:30']]) {
        const input = field(name).querySelector('input.spotlight-ex-scalar-input'); click(input); type(input, value); key(input, 'Enter'); await settled();
        assert(fixture.fm[name] === expected, `Wrong stored ${name} type or format`);
        type(input, ''); key(input, 'Enter'); await settled(); assert(fixture.fm[name] === null, `Clearing ${name} did not save an empty value`);
      }
      const checkbox = field('done').querySelector('input'); click(checkbox); await settled();
      assert(fixture.fm.done === true, 'Checkbox was not saved as boolean');
    }],
    ['External type changes replace the editor without a plugin reload', async () => {
      setup();
      await fixture.manager.setType('labels', 'text');
      assert(field('labels').dataset.type === 'text' && field('labels').querySelector('textarea'), 'List did not switch to Text');
      assert(field('labels').querySelector('.spotlight-ex-type-mismatch'), 'Incompatible old array was silently flattened');
      await fixture.manager.setType('labels', 'datetime');
      assert(field('labels').querySelector('input[type="datetime-local"]'), 'Text did not switch to Date & time');
      assert(field('labels').querySelector('.spotlight-ex-type-icon').dataset.icon === 'lucide-clock', 'Type icon did not update');
      assert(Array.isArray(fixture.fm.labels), 'Changing the displayed type rewrote stored values');
    }],
    ['The property icon changes the shared Obsidian type', async () => {
      setup(); click(field('notes').querySelector('.spotlight-ex-type-icon'));
      const option = Array.from(document.querySelectorAll('.test-type-menu button')).find((item) => item.textContent === 'Date & time');
      assert(option, 'Type menu did not include Date & time'); click(option); await pause();
      assert(fixture.types.notes === 'datetime' && field('notes').querySelector('input[type="datetime-local"]'), 'Type selection did not sync with the native registry');
    }],
    ['External value updates sync while a different field has an unfinished draft', async () => {
      setup(); const draft = open('labels'); type(draft, 'keep this'); fixture.fm.other = 'changed elsewhere';
      fixture.cache.trigger('changed', fixture.file);
      assert(field('other').querySelector('textarea').value === 'changed elsewhere', 'Inactive value did not sync');
      assert(document.activeElement === draft && draft.value === 'keep this', 'Another property refresh interrupted input');
    }],
    ['Type changes preserve an unfinished value and prevent stale typed writes', async () => {
      setup(); const draft = open('labels'); type(draft, 'do not lose this');
      await fixture.manager.setType('labels', 'date');
      assert(field('labels').querySelector('input[type="date"]'), 'Editor still has the old type');
      assert(field('labels').querySelector('.spotlight-ex-recovered-draft pre').textContent === 'do not lose this', 'Unfinished draft was discarded');
      setup(); const input = open('labels'); type(input, 'queued list item'); key(input, 'Enter');
      await fixture.manager.setType('labels', 'number'); await settled();
      assert(fixture.fm.labels.join(',') === 'alpha', 'An old list write overwrote a new Number type');
      assert(field('labels').querySelector('.spotlight-ex-recovered-draft pre').textContent === 'queued list item', 'Rejected queued value was lost');
    }],
    ['Reserved aliases and CSS classes stay as arrays and empty checkbox stays indeterminate', async () => {
      setup({ aliases: ['Known name'], cssclasses: ['wide'], done: null }, { aliases: 'aliases', cssclasses: 'multitext' });
      const alias = open('aliases'); type(alias, 'Another name'); key(alias, 'Enter'); await settled();
      assert(Array.isArray(fixture.fm.aliases) && fixture.fm.aliases.includes('Another name'), 'Alias type was flattened');
      assert(field('tags').querySelector('.spotlight-ex-type-icon').disabled, 'Reserved Tags can be reassigned');
      assert(field('done').querySelector('input').indeterminate, 'Empty checkbox became false');
    }],
    ['Available File, Folder and Property editors use native widgets and save text', async () => {
      setup({ attachment: 'Beach Room.jpg', folder: 'Files', relatedProperty: 'labels' }, { attachment: 'file', folder: 'folder', relatedProperty: 'property' });
      for (const [name, next] of [['attachment', 'Other.jpg'], ['folder', 'Notes'], ['relatedProperty', 'tags']]) {
        const input = field(name).querySelector('.test-native-widget'); assert(input, `Missing native ${name} widget`);
        click(input); type(input, next); key(input, 'Enter'); await settled();
        assert(fixture.fm[name] === next, `${name} did not save`);
      }
    }],
    ['Dates with offsets show local time while refresh leaves the stored timestamp unchanged', async () => {
      const timestamp = '2026-10-02T10:30:45Z'; setup({ datetime: timestamp });
      const input = field('datetime').querySelector('input');
      assert(input.value === localDateTimeValue(timestamp), 'Zoned date was treated as local wall time');
      fixture.view.onDataUpdated(); assert(fixture.fm.datetime === timestamp, 'Rendering changed the stored offset');
    }],
    ['Type changes preserve drafts in native file picker widgets', async () => {
      setup({ attachment: 'Beach Room.jpg' }, { attachment: 'file' });
      const input = field('attachment').querySelector('.test-native-widget'); click(input); type(input, 'unfinished.jpg');
      await fixture.manager.setType('attachment', 'folder');
      assert(field('attachment').dataset.type === 'folder', 'Native picker type did not update');
      assert(field('attachment').querySelector('.spotlight-ex-recovered-draft pre').textContent === 'unfinished.jpg', 'Native picker draft was discarded');
      assert(fixture.fm.attachment === 'Beach Room.jpg', 'Type change silently saved the unfinished picker value');
    }],
    ['Embed syntax stays literal while normal wikilinks keep their link labels', async () => {
      setup({ labels: ['![[adssa]]', '[[asdas]]', '![[Folder/adssa#Section|Shown]]', '[[Folder/asdas#Section|Alias]]'] });
      const labels = Array.from(field('labels').querySelectorAll('.spotlight-ex-chip-label'));
      assert(labels[0].textContent === '![[adssa]]' && !labels[0].classList.contains('spotlight-ex-chip-link'), 'Embed syntax was collapsed into a regular link');
      assert(labels[1].textContent === 'asdas' && labels[1].classList.contains('spotlight-ex-chip-link'), 'Regular wikilink stopped rendering as a link');
      assert(labels[2].textContent === '![[Folder/adssa#Section|Shown]]' && !labels[2].classList.contains('spotlight-ex-chip-link'), 'Embed alias or section was stripped');
      assert(labels[3].textContent === 'Alias' && labels[3].classList.contains('spotlight-ex-chip-link'), 'Regular wikilink alias was lost');
    }],
    ['Adding and removing an embed preserves the original YAML string', async () => {
      setup(); const input = open('labels'); type(input, '![[adssa]]'); key(input, 'Enter'); await settled();
      assert(fixture.fm.labels.includes('![[adssa]]'), 'Embed syntax was changed during saving');
      const chip = Array.from(field('labels').querySelectorAll('.spotlight-ex-chip')).find((item) => item.querySelector('.spotlight-ex-chip-label').textContent === '![[adssa]]');
      assert(chip, 'Saved embed was not shown literally');
      click(chip.querySelector('.spotlight-ex-chip-remove')); await settled();
      assert(fixture.fm.labels.join(',') === 'alpha' && document.activeElement === input, 'Embed removal changed another value or interrupted entry');
    }],
    ['First click in an inactive pane opens and focuses the input', async () => {
      setup(); const input = open('labels'); await pause();
      assert(fixture.workspace.activeLeaf === fixture.leaf, 'Pane did not activate');
      assert(input.isConnected && document.activeElement === input, 'First click lost the editor');
      type(input, 'first-click'); key(input, 'Enter'); await settled();
      assert(fixture.fm.labels.includes('first-click'), 'Inactive pane ignored input');
    }],
    ['Enter saves consecutive list values and preserves the next draft through refresh', async () => {
      setup(); const input = open('labels');
      type(input, 'one'); key(input, 'Enter');
      assert(input.value === '' && document.activeElement === input, 'Next value is not ready immediately');
      type(input, 'two'); key(input, 'Enter');
      type(input, 'unsaved draft'); await settled(); fixture.view.onDataUpdated();
      assert(JSON.stringify(fixture.fm.labels) === JSON.stringify(['alpha', 'one', 'two']), 'Rapid values overwrote one another');
      assert(input.isConnected && input.value === 'unsaved draft' && document.activeElement === input, 'Refresh destroyed the draft or focus');
    }],
    ['Concurrent metadata changes survive a list addition', async () => {
      setup(); const input = open('labels'); type(input, 'mine'); key(input, 'Enter');
      fixture.fm.labels.push('external'); await settled();
      assert(fixture.fm.labels.join(',') === 'alpha,external,mine', 'Append used a stale array');
    }],
    ['Duplicate values, including pending saves, are rejected', async () => {
      setup(); const input = open('labels'); type(input, 'one'); key(input, 'Enter');
      type(input, 'one'); key(input, 'Enter'); await settled();
      assert(fixture.fm.labels.filter((value) => value === 'one').length === 1, 'Duplicate was saved');
      assert(input.value === 'one', 'Rejected draft disappeared');
    }],
    ['Tag entry normalizes # and Enter keeps focus ready', async () => {
      setup(); const input = open('tags'); type(input, '#new-tag');
      key(input, 'Enter'); await settled();
      assert(fixture.fm.tags.includes('new-tag'), 'Tag hash was saved');
      assert(document.activeElement === input && input.value === '', 'Add did not keep the input ready');
    }],
    ['Suggestion selection keeps the same input ready', async () => {
      setup(); fixture.view.getSuggestions = () => ['suggested'];
      const input = open('labels'); key(input, 'ArrowDown'); key(input, 'Enter'); await settled();
      assert(fixture.fm.labels.includes('suggested'), 'Suggestion was not saved');
      assert(document.activeElement === input && input.value === '', 'Suggestion closed input');
    }],
    ['Removing a value preserves an active add draft', async () => {
      setup(); const input = open('labels'); type(input, 'draft');
      click(field('labels').querySelector('.spotlight-ex-chip-remove')); await settled();
      assert(fixture.fm.labels.length === 0, 'Value was not removed');
      assert(input.isConnected && input.value === 'draft', 'Remove destroyed draft');
    }],
    ['A failed write retains the editor and submitted draft', async () => {
      setup(); fixture.failNext = true; const input = open('labels');
      type(input, 'retry me'); key(input, 'Enter'); await settled();
      assert(!fixture.fm.labels.includes('retry me') && input.value === 'retry me', 'Failed write discarded draft');
      key(input, 'Enter'); await settled(); assert(fixture.fm.labels.includes('retry me'), 'Retry failed');
    }],
    ['Clicking a second text field survives the first field saving on blur', async () => {
      setup(); const input = field('notes').querySelector('textarea'); click(input); type(input, 'saved on blur');
      const other = field('other').querySelector('textarea'); click(other); type(other, 'second draft'); await settled();
      assert(fixture.fm.notes === 'saved on blur', 'First field did not save');
      assert(other.isConnected && document.activeElement === other && other.value === 'second draft', 'First save interrupted the second field');
      key(other, 'Enter'); await settled(); assert(fixture.fm.other === 'second draft', 'Enter did not save text');
      assert(document.activeElement === other, 'Enter dropped text focus');
    }],
    ['Composition Enter does not submit unfinished text', async () => {
      setup(); const input = open('labels'); type(input, 'composing'); key(input, 'Enter', { isComposing: true }); await settled();
      assert(!fixture.fm.labels.includes('composing') && input.value === 'composing', 'Composition text was submitted prematurely');
    }],
    ['Numeric lists retain numbers and scalar Enter preserves focus', async () => {
      setup({ labels: [1, 2] }); const input = open('labels'); type(input, '3'); key(input, 'Enter'); await settled();
      assert(fixture.fm.labels.every((value) => typeof value === 'number'), 'Numeric array became text');
      const scalar = field('score').querySelector('input'); click(scalar); type(scalar, '4'); key(scalar, 'Enter'); await settled();
      assert(fixture.fm.score === 4 && document.activeElement === scalar, 'Number save lost type or focus');
    }],
    ['Clicking away saves the current list value and closes input through Base refresh', async () => {
      setup(); const input = open('labels'); type(input, 'unsubmitted draft');
      document.querySelector('#deactivate').focus(); fixture.view.onDataUpdated(); await pause(); await settled(); await pause();
      assert(fixture.fm.labels.includes('unsubmitted draft') && !input.isConnected, 'Blur did not save and close the list input');
    }],
    ['Fields fit long values and the button-free input without inner scrolling', async () => {
      setup({ labels: Array.from({ length: 25 }, (_, index) => `A long wrapped value ${index} with further detail`) }); await frame();
      const property = field('labels'); const container = property.querySelector('.spotlight-ex-property-value-container');
      assert(container.clientHeight > 170 && container.scrollHeight <= container.clientHeight + 1, 'Content still hits the fixed height limit');
      assert(!property.querySelector('.spotlight-ex-add-button'), 'Obsolete Add Value button remains');
      assert(getComputedStyle(property).flexShrink === '0', 'Sidebar compresses property content');
      fixture.view.sidebarEl.style.width = '220px'; await frame();
      assert(container.scrollWidth <= container.clientWidth + 1, 'Long labels overflow a narrow sidebar');
      const input = open('labels'); await frame();
      assert(!property.querySelector('.spotlight-ex-add-confirm, .spotlight-ex-add-cancel') && input.getBoundingClientRect().right <= container.getBoundingClientRect().right + 1, 'Input has extra buttons or overflows');
    }],
    ['Textareas grow and shrink with text and respond to sidebar width', async () => {
      setup(); const input = field('notes').querySelector('textarea'); const short = input.clientHeight;
      type(input, Array.from({ length: 12 }, () => 'A longer line of text which can wrap.').join('\n')); await frame();
      assert(input.clientHeight > short && input.scrollHeight <= input.clientHeight + 1, 'Textarea clipped long content');
      const wide = input.clientHeight; fixture.view.sidebarEl.style.width = '220px'; await frame(); await frame();
      assert(input.clientHeight > wide, 'Textarea did not grow when sidebar became narrower');
      type(input, 'Short'); await frame(); assert(input.clientHeight < wide, 'Textarea did not shrink');
    }],
    ['Saved manual heights remain minimums while content can grow', async () => {
      setup({ labels: Array.from({ length: 20 }, (_, index) => `Item ${index}`) });
      fixture.plugin.settings.propertyHeights['note.labels'] = 50; fixture.view.render(); await frame();
      const container = field('labels').querySelector('.spotlight-ex-property-value-container');
      assert(container.style.minHeight === '50px' && container.clientHeight > 50, 'Saved height caps content');
    }],
    ['Deferred Base refresh applies after focus leaves the sidebar', async () => {
      setup(); const input = open('labels'); fixture.view.onDataUpdated();
      assert(fixture.view.pendingDataRender, 'Refresh was not deferred');
      document.querySelector('#deactivate').focus(); await pause();
      assert(!input.isConnected && !fixture.view.pendingDataRender, 'Deferred refresh did not apply');
    }],
  ];

  document.querySelector('#run').onclick = async () => {
    const output = document.querySelector('#results'); output.textContent = 'Running…';
    const results = [];
    for (const [name, run] of cases) {
      try { await run(); results.push(`PASS ${name}`); }
      catch (error) { results.push(`FAIL ${name}: ${error.message}`); }
      output.textContent = results.join('\n');
    }
    const failures = results.filter((result) => result.startsWith('FAIL')).length;
    output.textContent += `\n\n${cases.length - failures}/${cases.length} passed.`;
    output.dataset.complete = 'true'; output.dataset.failures = String(failures);
    setup({ labels: ['A short value', 'A much longer value that should wrap completely as the sidebar gets narrower', '[[asdas]]', '![[adssa]]'], notes: 'Text fields grow as you type.\nAdd another line to try it.' });
  };
  document.querySelector('#deactivate').onclick = () => { fixture.workspace.activeLeaf = null; };
  document.querySelector('#refresh').onclick = () => fixture.view.onDataUpdated();
  document.querySelector('#alignment').onclick = () => {
    setup({ labels: [], done: null });
    fixture.view.data.properties = ['note.labels', 'note.done'];
    fixture.view.config.getDisplayName = (id) => id === 'note.labels' ? 'Related' : 'CurrentStatus';
    fixture.view.render();
  };
  document.querySelector('#settings').onclick = () => {
    const preview = document.querySelector('#settings-preview'); preview.replaceChildren(); preview.hidden = false;
    const tab = new SpotlightEXSettingTab(fixture.plugin.app, fixture.plugin);
    preview.append(tab.containerEl); tab.display();
  };
  document.querySelector('#appearance').onchange = (event) => { document.body.dataset.appearance = event.target.value; };
  document.body.dataset.appearance = document.querySelector('#appearance').value;
  setup();
})();
