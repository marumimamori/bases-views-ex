(() => {
  const pause = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
  const frame = () => new Promise(requestAnimationFrame);
  const ready = async () => { await frame(); await frame(); await pause(); };
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const click = (element) => {
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    if (element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))) element.focus();
    element.click();
  };
  const type = (input, value) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); };
  const key = (input, value) => input.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
  let fixture;
  const imageData = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="500" height="400"><defs><linearGradient id="g" x2="0.9" y2="1"><stop stop-color="#26375c"/><stop offset="1" stop-color="#ae789a"/></linearGradient></defs><rect width="500" height="400" fill="url(#g)"/><circle cx="370" cy="85" r="38" fill="#edc89e"/><path d="M0 310 100 170 210 260 310 130 500 315V400H0" fill="#162b42"/><path d="M0 365 160 260 260 330 410 235 500 350V400H0" fill="#41667c"/></svg>');

  function setup(count = 12, frontmatter = {}, options = {}) {
    fixture?.view.flushEditorDrafts(fixture.view.containerEl, true);
    fixture?.view.onunload(); fixture?.plugin.unload();
    const root = document.querySelector('#fixture'); root.replaceChildren();
    const files = new Map(), metadata = new Map(), entries = [];
    const names = ['Fantasy City Inspiration', 'Mountain Sanctuary', 'Harbor At Dusk', 'Crystal Garden', 'Library Observatory', 'River District'];
    const image = new testObsidian.TFile('cover.svg'); files.set(image.path, image);
    for (let index = 0; index < count; index++) {
      const file = new testObsidian.TFile(`${index < names.length ? names[index] : `Image ${String(index).padStart(5, '0')}`}.jpg.md`);
      files.set(file.path, file);
      const raw = { domains: ['Architecture'], types: ['Inspiration'], related: [], notes: 'A place to explore.', score: 3,
        done: false, date: '2026-10-02', datetime: '2026-10-02T18:30:45', image: '[[cover.svg]]', ...frontmatter };
      metadata.set(file.path, raw);
      entries.push({ file, getValue: (id) => id === 'file.name' ? file.basename : id.startsWith('formula.') ? `Formula ${index}` : { value: metadata.get(file.path)[id.replace(/^note\./, '')] } });
    }
    const types = { domains:'multitext', types:'multitext', related:'multitext', tags:'tags', notes:'text', score:'number', done:'checkbox', date:'date', datetime:'datetime', image:'text', attachment:'file', folder:'folder', property:'property' };
    const manager = new testObsidian.TestEvents();
    const widgets = Object.fromEntries(Object.values(PROPERTY_TYPES).filter((info) => info.native).map((info) => [info.native, {
      type: info.native, icon: info.icon,
      render: (container, value, context) => {
        const input = container.createEl('input', { cls:'test-native-widget' }); input.value = value || '';
        input.addEventListener('change', () => context.onChange(input.value));
      },
    }]));
    manager.getAssignedWidget = (name) => types[name] || null;
    manager.getWidget = (type) => widgets[type] || { type:'unknown' };
    manager.getTypeInfo = (name, raw) => ({ expected: manager.getWidget(manager.getAssignedWidget(name) || PROPERTY_TYPES[normalizeType(null, name, raw)]?.native) });
    manager.setType = async (name, type) => { types[name] = type; manager.trigger('changed'); };
    const cache = new testObsidian.TestEvents();
    cache.getFileCache = (file) => ({ frontmatter: metadata.get(file.path) });
    cache.getFirstLinkpathDest = (path) => files.get(path) || null;
    const vault = new testObsidian.TestEvents();
    Object.assign(vault, { getAbstractFileByPath: (path) => files.get(path), getMarkdownFiles: () => [...files.values()].filter((file) => file.extension === 'md'),
      getResourcePath: () => imageData, adapter: { exists:async () => true, read:async () => JSON.stringify({ types }) },
      create:async (path) => { const file = new testObsidian.TFile(path); files.set(path, file); metadata.set(path, {}); return file; },
    });
    const leaves = [{ view:{ containerEl:root } }];
    const opened = [];
    const workspace = { activeLeaf:null, iterateAllLeaves:(run) => leaves.forEach(run),
      setActiveLeaf:(leaf, options) => { assert(options.focus === false, 'Inactive pane stole focus'); workspace.activeLeaf = leaf; fixture?.view.onDataUpdated(); },
      getLeaf:(newLeaf) => ({ openFile:(file) => opened.push({ file, newLeaf }) }),
    };
    let concurrent = 0, maxConcurrent = 0;
    const app = { vault, workspace, metadataCache:cache, metadataTypeManager:manager, renderContext:{},
      fileManager:{ processFrontMatter:async (file, run) => {
        concurrent++; maxConcurrent = Math.max(concurrent, maxConcurrent);
        await pause(10);
        try {
          if (fixture.failNext) { fixture.failNext = false; throw new Error('Expected failed save'); }
          run(metadata.get(file.path)); cache.trigger('changed', file); fixture.view.onDataUpdated();
        } finally { concurrent--; }
      } },
    };
    const plugin = new module.exports(); plugin.app = app; plugin.views = new Set();
    plugin.settings = { ...DEFAULT_SETTINGS, propertyOrder:[], propertyHeights:{}, suggestionScope:'base' };
    plugin.storedPropertyTypes = types; plugin.watchPropertyChanges();
    const view = new CardsEXView({ app }, root.createDiv(), plugin);
    const config = { cardSize:260, image:'note.image', imageFit:'cover', imageAspectRatio:1, ...options };
    let properties = ['file.name', 'note.domains', 'note.types', 'note.related'];
    view.config = { get:(name) => config[name], getAsPropertyId:(name) => config[name], getOrder:() => properties, getDisplayName:(id) => id.replace(/^(note|file|formula)\./, '') };
    view.data = { data:entries, groupedData:[{ entries }] };
    fixture = { view, plugin, app, entries, files, metadata, types, manager, cache, config, opened, root, leaves,
      properties:(value) => { properties = value; view.onDataUpdated(); }, raw:(index = 0) => metadata.get(entries[index].file.path), maxConcurrent:() => maxConcurrent };
    view.onDataUpdated(); return fixture;
  }

  const field = (name, index = 0) => fixture.view.cards.get(fixture.entries[index].file.path)?.fields.get(`note.${name}`)?.el;
  const edit = async (name, index = 0) => { click(field(name, index).querySelector('.cards-ex-compact-value')); await pause(); return field(name, index); };
  const settled = async () => { await fixture.view.writeQueue; await ready(); };
  const cases = [
    ['Cards use dark type boxes and center empty dashes and checkbox displays under the icon', async () => {
      setup(1,{ related:[], done:null, notes:null }); fixture.properties(['note.related','note.done','note.notes']); await ready();
      for (const name of ['related','done','notes']) {
        const row = field(name), icon = row.querySelector('.spotlight-ex-type-icon');
        icon.style.width = '48px'; icon.style.height = '48px'; icon.style.flexBasis = '48px';
        await ready();
        const value = row.querySelector('.spotlight-ex-empty-value,.cards-ex-check-display');
        const a = icon.getBoundingClientRect(), b = value.getBoundingClientRect();
        assert(Math.abs(a.left+a.width/2-b.left-b.width/2) < 1.5, `${name} is not centered under its actual icon`);
        assert(getComputedStyle(icon).backgroundColor !== 'rgba(0, 0, 0, 0)' && getComputedStyle(icon).borderStyle === 'solid', 'Icon box is transparent or borderless');
      }
    }],
    ['Empty property names open input immediately; switching cards saves and closes it without action buttons', async () => {
      setup(3,{ related:[] }); await ready(); click(field('related').querySelector('.spotlight-ex-property-name')); await ready();
      const input = field('related').querySelector('input'); assert(input && document.activeElement === input, 'Property name did not start input');
      assert(!field('related').querySelector('.cards-ex-edit-actions,.spotlight-ex-add-button,.spotlight-ex-add-confirm,.spotlight-ex-add-cancel'), 'Extra action buttons remain');
      type(input,'click away value'); click(field('related',1).querySelector('.spotlight-ex-empty-value')); await ready(); await settled();
      assert(fixture.raw().related[0] === 'click away value' && !input.isConnected, 'Switching fields did not save and close');
      assert(field('related',1).querySelector('input') === document.activeElement, 'Second field did not receive the first click');
    }],
    ['Compact card chips rename on click and save on blur; their separate x removes only the selected value', async () => {
      setup(1,{ domains:['before','Architecture','after'] }); await ready();
      click(field('domains').querySelectorAll('.spotlight-ex-chip-label')[1]); await ready();
      const input = field('domains').querySelector('input'); assert(input.value === 'Architecture', 'Compact chip did not open rename input');
      assert(input.closest('.spotlight-ex-chip-label') && !field('domains').querySelector('.spotlight-ex-add-input'), 'Cards rename appeared in the adding field');
      type(input,'Panorama'); click(document.querySelector('#deactivate')); await ready(); await settled();
      assert(fixture.raw().domains.join() === 'before,Panorama,after' && !fixture.view.activeEditor && !input.isConnected, 'Blur rename did not save and compact');
      click(field('domains').querySelectorAll('.spotlight-ex-chip-remove')[1]); await settled();
      assert(fixture.raw().domains.join() === 'before,after' && !fixture.view.activeEditor, 'Remove opened editing or removed the wrong value');
    }],
    ['Inline card renames stay mounted during resize and refresh, then Enter continues in the adding field', async () => {
      setup(3); await ready(); click(field('domains').querySelector('.spotlight-ex-chip-label')); await ready();
      const input = field('domains').querySelector('.spotlight-ex-rename-input'), chip = input.closest('.spotlight-ex-chip');
      type(input,'A wider renamed chip'); input.setSelectionRange(2,7);
      fixture.view.onDataUpdated(); fixture.root.style.width = '700px'; await ready();
      assert(input.isConnected && input.closest('.spotlight-ex-chip') === chip && document.activeElement === input && input.selectionStart === 2, 'Card refresh or resize replaced the inline editor');
      key(input,'Enter'); await settled();
      assert(fixture.raw().domains[0] === 'A wider renamed chip' && !input.isConnected && fixture.view.activeEditor, 'Enter did not save and keep the card editor open');
      const add = field('domains').querySelector('.spotlight-ex-add-input');
      assert(add && document.activeElement === add && !field('domains').querySelector('.spotlight-ex-rename-input'), 'Rename did not focus the separate adding field');
      type(add,'next value'); key(add,'Enter'); await settled();
      assert(fixture.raw().domains.join() === 'A wider renamed chip,next value' && document.activeElement === add && !add.value, 'Adding after rename lost the value or focus');
      fixture.root.style.width = '';
    }],
    ['Cards use the shared animation duration, and zero disables card height animations', async () => {
      setup(1); fixture.plugin.settings.animationDuration = 320; fixture.view.applyAnimationSettings(); await ready();
      const card = field('related').closest('.cards-ex-card'); await edit('related'); await frame();
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) assert(card.getAnimations()[0]?.effect.getTiming().duration === 320, 'Card height ignored the shared duration');
      await pause(360); key(field('related').querySelector('input'),'Escape'); await settled(); await pause(360);
      fixture.plugin.settings.animationDuration = 0; fixture.view.applyAnimationSettings(); await edit('related'); await frame();
      assert(!card.getAnimations().length && fixture.view.containerEl.style.getPropertyValue('--spotlight-ex-animation-duration') === '0ms', 'Zero did not disable Cards EX animations');
    }],
    ['Card resizing animates only mounted content and settles to its measured height', async () => {
      setup(1); await ready(); const card = field('related').closest('.cards-ex-card'), before = card.getBoundingClientRect().height;
      await edit('related'); await frame();
      assert(card.getAnimations().length === (matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1), 'Card height did not respect the motion preference');
      await pause(180);
      assert(card.getBoundingClientRect().height > before && !card.getAnimations().length, 'Card animation did not settle');
      key(field('related').querySelector('input'),'Escape'); await settled(); await pause(180);
      assert(Math.abs(card.getBoundingClientRect().height-before) < 1.5 && !card.getAnimations().length, 'Card did not shrink to its original height');
    }],
    ['Closing a Cards EX view flushes unsubmitted input and releases its controllers', async () => {
      setup(1,{ related:[] }); await ready(); await edit('related'); const input = field('related').querySelector('input'); type(input,'close card value');
      fixture.view.onunload(); await settled();
      assert(fixture.raw().related[0] === 'close card value', 'Closing the view lost the value');
      assert(!fixture.view.draftSavers.size && !fixture.view.listEditors.size && !fixture.view.cards.size, 'Closed view retained controllers');
    }],
    ['Plugin registration exposes both layouts and the Cards EX options', async () => {
      setup(1); const plugin = new module.exports(); plugin.app = fixture.app;
      const registrations = new Map();
      plugin.loadData = async () => ({});
      plugin.registerBasesView = (type, registration) => registrations.set(type, registration);
      plugin.addSettingTab = () => {};
      await plugin.onload();
      const cards = registrations.get(CARDS_VIEW_TYPE);
      assert(registrations.get(VIEW_TYPE)?.name === 'Spotlight EX' && cards?.name === 'Cards EX', 'One of the layouts was not registered');
      assert(cards.options().map((option) => option.key).join() === 'cardSize,image,imageFit,imageAspectRatio', 'Cards configuration options are missing');
      const view = cards.factory({ app:fixture.app },fixture.root.createDiv());
      assert(view instanceof CardsEXView && view.type === CARDS_VIEW_TYPE, 'Registered factory could not instantiate Cards EX');
      view.onunload(); plugin.unload();
    }],
    ['Only selected properties appear, with compact values and Base-specific order', async () => {
      setup(); await ready(); assert(document.querySelectorAll('#fixture textarea, #fixture input').length === 0, 'Editors were eagerly mounted');
      assert(Math.abs(document.querySelector('.cards-ex-card').getBoundingClientRect().width - 260) < 2, 'Card size does not set the card width');
      assert(!field('notes'), 'Hidden property was displayed');
      fixture.plugin.settings.propertyOrder = ['note.related','note.types','note.domains'];
      fixture.properties(['note.types','note.domains']); await ready();
      const first = fixture.view.cards.values().next().value;
      assert([...first.values.children].map((el) => el.dataset.prop).join() === 'note.types,note.domains', 'Global Spotlight order changed the Base order');
      fixture.properties([]); await ready(); assert(!document.querySelector('.cards-ex-field'), 'Empty selection showed all fields');
    }],
    ['Consecutive List and Tags values use the shared editors without losing focus', async () => {
      setup(3, { tags:['existing'] }); fixture.properties(['note.domains','note.tags']); await ready();
      await edit('domains');
      const input = field('domains').querySelector('input'); type(input, 'Panorama'); key(input,'Enter'); type(input,'House'); key(input,'Enter'); await settled();
      assert(fixture.raw().domains.join() === 'Architecture,Panorama,House', 'Rapid list values were lost');
      assert(input.isConnected && document.activeElement === input, 'Input focus was lost during save');
      fixture.plugin.settings.showTypeBadge = false; fixture.view.onDataUpdated();
      assert(!field('domains').querySelector('.spotlight-ex-type-icon') && input.isConnected && document.activeElement === input, 'Appearance changes replaced the active input or left stale icons');
      fixture.plugin.settings.showTypeBadge = true; fixture.view.onDataUpdated();
      await fixture.view.endEditing(); await edit('tags');
      const tag = field('tags').querySelector('input'); type(tag,'#garden'); key(tag,'Enter'); await settled();
      assert(fixture.raw().tags.includes('garden'), 'Tag normalization failed');
    }],
    ['Text, decimals, checkboxes, dates, and date-times save native values', async () => {
      setup(1); fixture.properties(['note.notes','note.score','note.done','note.date','note.datetime']); await ready();
      for (const [name,value,expected] of [['notes','Edited text','Edited text'],['score','2.75',2.75],['date','2026-11-01','2026-11-01'],['datetime','2026-11-01T18:30:45','2026-11-01T18:30:45']]) {
        await edit(name); const input = field(name).querySelector('input,textarea'); type(input,value); key(input,'Enter'); await settled();
        assert(fixture.raw()[name] === expected, `Wrong ${name} value`); await fixture.view.endEditing();
      }
      await edit('done'); const input = field('done').querySelector('input'); input.checked = true; input.dispatchEvent(new Event('change')); await settled();
      assert(fixture.raw().done === true, 'Checkbox became a string');
    }],
    ['File, Folder, and Property types use native pickers', async () => {
      setup(1, { attachment:'old.jpg', folder:'old', property:'notes' }); fixture.properties(['note.attachment','note.folder','note.property']); await ready();
      for (const name of ['attachment','folder','property']) {
        await edit(name); const input = field(name).querySelector('.test-native-widget'); assert(input, `Missing ${name} widget`);
        type(input,'new value'); input.dispatchEvent(new Event('change')); await settled(); assert(fixture.raw()[name] === 'new value', `Cannot save ${name}`); await fixture.view.endEditing();
      }
    }],
    ['Structured values reject invalid JSON and retain nested objects when saved', async () => {
      setup(1, { details:{ nested:{ count:2 }, values:[true,'x'] } }); fixture.properties(['note.details']); await ready();
      await edit('details'); let input = field('details').querySelector('textarea'); type(input,'{ broken'); input.blur(); await settled();
      assert(fixture.raw().details.nested.count === 2 && input.dataset.dirty === 'true', 'Invalid object overwrote metadata');
      assert(field('details').querySelector('.spotlight-ex-structured-error').textContent.includes('Cannot save'), 'Validation error is missing');
      type(input,JSON.stringify({ nested:{ count:4 }, values:[false,'y'] })); click([...field('details').querySelectorAll('button')].find((button) => button.textContent === 'Save object')); await settled();
      assert(fixture.raw().details.nested.count === 4 && fixture.raw().details.values[0] === false, 'Nested types were flattened');
    }],
    ['Formula and file properties stay read-only; editing a field does not open its file', async () => {
      setup(1); fixture.properties(['file.name','file.size','formula.summary','note.notes']); await ready();
      const record = fixture.view.cards.values().next().value;
      assert(!record.fields.get('formula.summary').el.querySelector('[role="button"]'), 'Formula became writable');
      assert(!record.fields.get('file.size').el.querySelector('[role="button"]'), 'File property became writable');
      await edit('notes'); assert(!fixture.opened.length, 'Property editing opened the card'); await fixture.view.endEditing(true);
      click(record.title); assert(fixture.opened[0].file.path === fixture.entries[0].file.path, 'Title opened the wrong file');
    }],
    ['Type changes update editors and recover unfinished input', async () => {
      setup(1); await ready(); await edit('domains');
      const input = field('domains').querySelector('input'); type(input,'retain this draft'); await fixture.manager.setType('domains','datetime'); await ready();
      assert(field('domains').querySelector('input[type="datetime-local"]'), 'Editor type did not change');
      assert(field('domains').querySelector('.spotlight-ex-recovered-draft pre').textContent === 'retain this draft', 'Type change discarded the draft');
    }],
    ['Clean fields and images sync while a different field has a draft', async () => {
      setup(1); fixture.properties(['note.domains','note.notes','note.related']); await ready(); await edit('notes');
      const input = field('notes').querySelector('textarea'); type(input,'unfinished'); fixture.raw().domains = ['Updated externally']; fixture.raw().image = '#123456';
      fixture.cache.trigger('changed',fixture.entries[0].file); await ready();
      assert(field('domains').textContent.includes('Updated externally'), 'Clean field did not sync');
      assert(input.isConnected && input.value === 'unfinished', 'Different field draft was lost');
      assert([...fixture.view.cards.values().next().value.values.children].map((el) => el.dataset.prop).join() === 'note.domains,note.notes,note.related', 'Synchronization moved the active field out of order');
      assert(fixture.view.cards.get(fixture.entries[0].file.path).cover.style.backgroundColor === 'rgb(18, 52, 86)', 'Cover did not sync');
    }],
    ['Base refresh and resizing keep the active control, selection, and draft', async () => {
      setup(); fixture.properties(['note.notes']); await ready(); await edit('notes');
      const input = field('notes').querySelector('textarea'); type(input,'composition draft'); input.setSelectionRange(4,8);
      fixture.view.onDataUpdated(); fixture.root.style.width = '650px'; await ready();
      assert(input.isConnected && document.activeElement === input && input.value === 'composition draft', 'Reflow replaced the active editor');
      assert(input.selectionStart === 4 && input.selectionEnd === 8, 'Reflow lost text selection'); fixture.root.style.width = '';
    }],
    ['An edited card stays mounted when scrolled far outside the viewport', async () => {
      setup(10000); fixture.properties(['note.notes']); await ready(); await edit('notes');
      const input = field('notes').querySelector('textarea'); type(input,'keep while scrolling'); fixture.view.scrollerEl.scrollTop = fixture.view.heights.offset(fixture.view.rows.length) - 800; fixture.view.scrollerEl.dispatchEvent(new Event('scroll')); await ready();
      assert(input.isConnected && input.value === 'keep while scrolling', 'Virtualization dropped an active draft');
      assert(fixture.view.cards.size < 80 && document.querySelectorAll('#fixture img').length < 80, 'Pinned editor unbounded the gallery');
      assert([...fixture.view.cards.keys()].some((path) => path.includes('09999')), 'End of the gallery is unreachable');
    }],
    ['A filter update pins the edited file until the draft is committed', async () => {
      setup(5); fixture.properties(['note.notes']); await ready(); await edit('notes'); const input = field('notes').querySelector('textarea'); type(input,'save outside filter');
      const remaining = fixture.entries.slice(1); fixture.view.data = { data:remaining, groupedData:[{ entries:remaining }] }; fixture.view.onDataUpdated(); await ready();
      assert(input.isConnected && input.value === 'save outside filter', 'Filter update dropped draft');
      assert(input.getBoundingClientRect().top < fixture.view.scrollerEl.getBoundingClientRect().bottom, 'Filtered active editor moved outside the viewport');
      assert(fixture.view.rows.some((row) => row.label === 'Editing outside current results'), 'Pinned file was not explained');
      await fixture.view.endEditing(); await ready(); assert(fixture.raw().notes === 'save outside filter', 'Pinned draft did not save');
      assert(!fixture.view.cards.has(fixture.entries[0].file.path), 'Committed filtered card stayed mounted');
    }],
    ['Grouped results keep their headings and query-provided ordering', async () => {
      setup(6); fixture.view.data.groupedData = [{ key:{ toString:() => 'First', isTruthy:() => true }, entries:fixture.entries.slice(3) }, { key:{ toString:() => 'Second', isTruthy:() => true }, entries:fixture.entries.slice(0,3) }]; fixture.view.onDataUpdated(); await ready();
      assert(fixture.view.rows[0].label === 'First' && fixture.view.rows[1].entries[0] === fixture.entries[3], 'Group order changed');
      assert(fixture.view.rows.some((row) => row.label === 'Second'), 'Group heading missing');
      fixture.config.groupBy = { property:'note.related' };
      fixture.view.data.groupedData = [{ key:{ toString:() => '', isTruthy:() => false }, hasKey:() => false, entries:fixture.entries }];
      fixture.view.onDataUpdated(); await ready();
      assert(fixture.view.rows[0].label === 'No value', 'An all-empty property group lost its heading');
    }],
    ['Covers support wikilinks, list Values, URLs, colors, fit, and aspect ratio', async () => {
      setup(1); await ready(); const record = fixture.view.cards.values().next().value;
      assert(record.cover.querySelector('img').loading === 'lazy' && record.cover.querySelector('img').decoding === 'async', 'Images are eager');
      fixture.config.imageFit = 'contain'; fixture.config.imageAspectRatio = 1.5; fixture.raw().image = '#abc'; fixture.view.onDataUpdated(); await ready();
      assert(parseFloat(record.cover.style.aspectRatio) === 1.5 && record.cover.style.backgroundColor, 'Color or aspect ratio failed');
      fixture.raw().image = 'https://example.invalid/test.jpg'; fixture.view.onDataUpdated(); assert(record.cover.querySelector('img').style.objectFit === 'contain', 'Image fit failed'); await ready();
      assert(unwrapValue({ length:() => 1, get:() => ({ value:'[[cover.svg]]' }) })[0] === '[[cover.svg]]', 'Native ListValue unsupported');
    }],
    ['Multiple views serialize same-file writes and preserve concurrent additions', async () => {
      setup(1); await ready(); const extra = fixture.root.createDiv(); const second = new CardsEXView({ app:fixture.app },extra,fixture.plugin);
      second.config = fixture.view.config; second.data = fixture.view.data; second.onDataUpdated();
      const file = fixture.entries[0].file;
      await Promise.all([fixture.view.writeProperty(file,'domains',(values) => [...values,'one'],'list'),second.writeProperty(file,'domains',(values) => [...values,'two'],'list')]);
      assert(fixture.raw().domains.join() === 'Architecture,one,two' && fixture.maxConcurrent() === 1, 'Cross-view edits raced'); second.onunload();
    }],
    ['Attachment properties create and update the binary file’s sidecar', async () => {
      setup(1); const binary = new testObsidian.TFile('new-image.jpg'); fixture.files.set(binary.path,binary);
      const entry = { file:binary, getValue:() => null }; fixture.view.data = { data:[entry], groupedData:[{ entries:[entry] }] }; fixture.view.onDataUpdated(); await ready();
      const record = fixture.view.cards.get(binary.path); await fixture.view.startEditing(record,record.fields.get('note.related'));
      const input = record.fields.get('note.related').el.querySelector('input'); type(input,'sidecar value'); key(input,'Enter'); await settled();
      assert(fixture.metadata.get('new-image.jpg.md').related[0] === 'sidecar value', 'Binary metadata was not saved to a sidecar');
    }],
    ['Failed saves remain editable and clicking away commits list input', async () => {
      setup(1); fixture.properties(['note.notes','note.related']); await ready(); await edit('notes'); const input = field('notes').querySelector('textarea'); type(input,'retry'); fixture.failNext = true; key(input,'Enter'); await settled();
      assert(input.dataset.dirty === 'true' && input.value === 'retry', 'Failed text draft lost'); await fixture.view.endEditing(true);
      await edit('related'); const add = field('related').querySelector('input'); type(add,'not submitted');
      assert(await fixture.view.endEditing() && !add.isConnected && fixture.raw().related.includes('not submitted'), 'Click-away did not save and close the draft');
    }],
    ['10,000-image scrolling keeps cards, images, and observers bounded', async () => {
      setup(10000); await ready(); const start = performance.now();
      for (const fraction of [0.25,0.5,0.75,1,0]) {
        fixture.view.scrollerEl.scrollTop = Math.max(0,fixture.view.heights.offset(fixture.view.rows.length) * fraction - 700); fixture.view.scrollerEl.dispatchEvent(new Event('scroll')); await ready();
        assert(fixture.view.cards.size < 80 && fixture.view.mountedRows.size < 30 && document.querySelectorAll('#fixture img').length < 80, 'Offscreen cards/images accumulated');
      }
      document.querySelector('#results').dataset.stressMs = String(Math.round(performance.now()-start));
      document.querySelector('#results').dataset.mountedCards = String(fixture.view.cards.size);
      fixture.view.onunload(); assert(!fixture.view.cards.size && !fixture.view.rows.length && !fixture.view.editorCleanups.length, 'Unload retained cards or observers');
    }],
  ];
  document.querySelector('#run').onclick = async () => {
    const output = document.querySelector('#results'); delete output.dataset.complete; output.textContent = 'Running…';
    const results = [];
    for (const [name,run] of cases) {
      try { await run(); results.push(`PASS ${name}`); } catch (err) { results.push(`FAIL ${name}: ${err.message}`); }
      output.textContent = results.join('\n');
    }
    const failures = results.filter((line) => line.startsWith('FAIL')).length;
    output.textContent += `\n\n${cases.length-failures}/${cases.length} passed.`; output.dataset.complete = 'true'; output.dataset.failures = String(failures);
  };
  document.querySelector('#preview').onclick = async () => { document.querySelector('#results').textContent = 'Preview gallery — edits stay in test metadata.'; setup(30); await ready(); };
  document.querySelector('#stress').onclick = () => setup(10000);
  setup();
})();
