(() => {
  HTMLElement.prototype.createEl = function(tag, options = {}) {
    if (typeof options === 'string') options = { cls: options };
    const element = document.createElement(tag);
    if (options.cls) element.className = options.cls;
    if (options.text != null) element.textContent = options.text;
    if (options.type) element.type = options.type;
    if (options.href) element.href = options.href;
    for (const [key, value] of Object.entries(options.attr || {})) element.setAttribute(key, value);
    this.append(element);
    return element;
  };
  HTMLElement.prototype.createDiv = function(options) { return this.createEl('div', options); };
  HTMLElement.prototype.createSpan = function(options) { return this.createEl('span', options); };
  HTMLElement.prototype.empty = function() { this.replaceChildren(); };
  HTMLElement.prototype.addClass = function(...names) { this.classList.add(...names); };
  HTMLElement.prototype.addClasses = function(names) { this.classList.add(...names); };
  HTMLElement.prototype.removeClass = function(...names) { this.classList.remove(...names); };
  HTMLElement.prototype.removeClasses = function(names) { this.classList.remove(...names); };
  HTMLElement.prototype.toggleClass = function(name, enabled) { this.classList.toggle(name, enabled); };
  HTMLElement.prototype.setText = function(value) { this.textContent = value; };
  HTMLElement.prototype.setAttr = function(name, value) { this.setAttribute(name, value); };

  class TestFile {
    constructor(path) { this.path = path; this.extension = path.split('.').pop(); this.basename = path.split('/').pop().replace(/\.[^.]+$/, ''); }
  }
  class TestEvents {
    constructor() { this.listeners = new Map(); }
    on(name, callback) {
      const callbacks = this.listeners.get(name) || new Set(); callbacks.add(callback); this.listeners.set(name, callbacks);
      return { off: () => callbacks.delete(callback) };
    }
    trigger(name, ...args) { for (const callback of this.listeners.get(name) || []) callback(...args); }
  }
  class TestComponent {
    constructor() { this.cleanups = []; }
    registerEvent(ref) { this.cleanups.push(() => ref.off()); }
    unload() { this.onunload?.(); for (const cleanup of this.cleanups) cleanup(); this.cleanups = []; }
  }
  class TestBasesView extends TestComponent { constructor(controller) { super(); this.app = controller.app; } }
  class TestSettingTab {
    constructor(app, plugin) { this.app = app; this.plugin = plugin; this.containerEl = document.createElement('div'); }
  }
  class TestSetting {
    constructor(container) {
      this.settingEl = container.createDiv('setting-item');
      const info = this.settingEl.createDiv('setting-item-info');
      this.nameEl = info.createDiv('setting-item-name');
      this.descEl = info.createDiv('setting-item-description');
      this.controlEl = this.settingEl.createDiv('setting-item-control');
      this.components = [];
    }
    setName(value) { this.nameEl.textContent = value; return this; }
    setDesc(value) { this.descEl.textContent = value; return this; }
    addValue(tag, type, callback) {
      const input = this.controlEl.createEl(tag, { type, attr: { 'aria-label': this.nameEl.textContent } });
      const component = {
        inputEl: input,
        setValue(value) { if (type === 'checkbox') input.checked = value; else input.value = value; return this; },
        setPlaceholder(value) { input.placeholder = value; return this; },
        addOption(value, label) { input.add(new Option(label, value)); return this; },
        onChange(run) { input.addEventListener(type === 'text' ? 'input' : 'change', () => run(type === 'checkbox' ? input.checked : input.value)); return this; },
      };
      this.components.push(component); callback(component); return this;
    }
    addToggle(callback) { return this.addValue('input', 'checkbox', callback); }
    addText(callback) { return this.addValue('input', 'text', callback); }
    addDropdown(callback) { return this.addValue('select', null, callback); }
    addExtraButton(callback) {
      const el = this.controlEl.createDiv('clickable-icon');
      const component = {
        extraSettingsEl: el,
        setIcon(value) { setIcon(el, value); return this; },
        setTooltip(value) { el.title = value; return this; },
        onClick(run) { el.addEventListener('click', run); return this; },
      };
      this.components.push(component); callback(component); return this;
    }
  }
  class TestMenu {
    constructor() { this.items = []; }
    addItem(callback) {
      const entry = {};
      const item = {
        setTitle(value) { entry.title = value; return this; }, setIcon() { return this; },
        setChecked() { return this; }, onClick(value) { entry.run = value; return this; },
      };
      callback(item); this.items.push(entry); return this;
    }
    showAtMouseEvent() {
      const menu = document.body.createDiv('test-type-menu');
      for (const item of this.items) {
        const button = menu.createEl('button', { text: item.title });
        button.onclick = () => { menu.remove(); item.run(); };
      }
    }
  }
  const setIcon = (element, name) => {
    const paths = {
      'lucide-text': 'M4 7h16M9 7v14M15 7v14M8 21h8',
      'lucide-list': 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
      'lucide-calendar': 'M8 2v4M16 2v4M3 10h18M3 4h18v18H3Z',
      'lucide-clock': 'M12 8v4l3 2', 'lucide-binary': 'M4 5h4v6H4ZM6 14v6M14 5v6M12 14h4v6h-4Z',
      'lucide-check-square': 'M3 3h18v18H3ZM7 12l3 3 7-7',
      'lucide-tags': 'M3 3h7l10 10-7 7L3 10ZM7 7h.01',
      'rotate-ccw': 'M3 11a9 9 0 1 1 2.4 7M3 4v7h7',
    };
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2');
    const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', paths[name] || 'M4 4h16v16H4Z'); svg.append(path);
    if (name === 'lucide-clock') { const circle = document.createElementNS(svg.namespaceURI, 'circle'); circle.setAttribute('cx','12'); circle.setAttribute('cy','12'); circle.setAttribute('r','9'); svg.append(circle); }
    element.append(svg); element.dataset.icon = name;
  };
  window.testObsidian = {
    TFile: TestFile, BasesView: TestBasesView, Plugin: TestComponent, PluginSettingTab: TestSettingTab,
    Menu: TestMenu, setIcon, TestEvents,
    MarkdownRenderer: {}, Setting: TestSetting, Notice: class { constructor(message) { window.testNotices.push(message); } },
  };
  window.require = () => window.testObsidian;
  window.module = { exports: {} };
  window.testNotices = [];
})();
