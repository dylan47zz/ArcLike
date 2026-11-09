/* Test-only in-memory Chrome API. It never opens a real tab or reads a browser profile. */
(function (root) {
  function createFakeChrome() {
    const records = [];
    const failures = {};
    const local = {};
    const session = {};
    const alarms = new Map();
    let timestamp = Date.now();
    const windows = new Map([[1, { id: 1, type: 'normal', incognito: false }], [2, { id: 2, type: 'normal', incognito: false }]]);
    const tabs = new Map([[10, { id: 10, windowId: 1, active: true, url: 'https://example.org/docs', title: '示例文档' }], [11, { id: 11, windowId: 1, active: false, url: 'chrome://newtab/', title: '新标签页' }], [20, { id: 20, windowId: 2, active: true, url: 'https://example.net/', title: '另一窗口' }]]);
    let nextId = 100;
    const copy = value => structuredClone(value);
    function event() {
      const listeners = new Set();
      return { listeners, addListener: callback => listeners.add(callback), removeListener: callback => listeners.delete(callback), dispatch: (...args) => [...listeners].map(callback => callback(...args)) };
    }
    function fail(key) { if (failures[key]) throw new Error(`Simulated ${key} failure`); }
    function storage(store, name) {
      return {
        async get(key) { fail(`${name}.get`); return key ? { [key]: copy(store[key]) } : copy(store); },
        async set(value) { fail(`${name}.set`); records.push([`${name}.set`, copy(value)]); Object.assign(store, copy(value)); },
        async remove(key) { fail(`${name}.remove`); delete store[key]; }
      };
    }
    const api = {
      storage: { local: storage(local, 'local'), session: storage(session, 'session') },
      runtime: {
        id: 'arclike-test',
        getURL: path => `chrome-extension://arclike-test/${path}`,
        onInstalled: event(), onStartup: event(), onMessage: event(),
        sendMessage(message) {
          const sender = { id: 'arclike-test', url: api.runtime.getURL(message.scope === 'arclike:command' ? 'extension/panel.html' : 'extension/background.js') };
          return new Promise(resolve => {
            let waiting = false, replied = false;
            for (const callback of api.runtime.onMessage.listeners) {
              if (callback(copy(message), sender, result => { replied = true; resolve(copy(result)); }) === true) waiting = true;
            }
            if (!waiting && !replied) resolve(undefined);
          });
        }
      },
      commands: { onCommand: event() },
      alarms: {
        onAlarm: event(),
        async get(name) { fail('alarms.get'); return copy(alarms.get(name)); },
        async create(name, options) { fail('alarms.create'); records.push(['alarms.create', name, copy(options)]); alarms.set(name, { name, ...copy(options) }); },
        async clear(name) { fail('alarms.clear'); records.push(['alarms.clear', name]); return alarms.delete(name); }
      },
      sidePanel: {
        async setPanelBehavior(options) { fail('sidePanel.setPanelBehavior'); records.push(['sidePanel', copy(options)]); }
      },
      windows: {
        onRemoved: event(),
        async getCurrent() { return copy(windows.get(1)); },
        async getAll(options = {}) { fail('windows.getAll'); return [...windows.values()].filter(window => !options.windowTypes || options.windowTypes.includes(window.type)).map(copy); }
      },
      tabs: {
        onCreated: event(), onUpdated: event(), onRemoved: event(), onActivated: event(), onDetached: event(), onAttached: event(), onReplaced: event(),
        async query(query) { fail('tabs.query'); records.push(['tabs.query', copy(query)]); return [...tabs.values()].filter(tab => (query.windowId === undefined || tab.windowId === query.windowId) && (query.active === undefined || tab.active === query.active)).map(copy); },
        async get(id) { fail('tabs.get'); if (!tabs.has(id)) throw new Error(`No tab with id: ${id}.`); return copy(tabs.get(id)); },
        async create(options) {
          fail('tabs.create');
          records.push(['tabs.create', copy(options)]);
          if (!windows.has(options.windowId)) throw new Error('No window with id.');
          if (options.active) for (const tab of tabs.values()) if (tab.windowId === options.windowId) tab.active = false;
          const tab = { id: nextId++, title: '新页面', ...options };
          tabs.set(tab.id, tab); api.tabs.onCreated.dispatch(copy(tab));
          if (tab.active) api.tabs.onActivated.dispatch({ tabId: tab.id, windowId: tab.windowId });
          return copy(tab);
        },
        async update(id, options) {
          fail('tabs.update');
          records.push(['tabs.update', id, copy(options)]);
          const tab = await api.tabs.get(id);
          if (options.active) for (const candidate of tabs.values()) if (candidate.windowId === tab.windowId) candidate.active = false;
          Object.assign(tab, options); tabs.set(id, tab);
          api.tabs.onUpdated.dispatch(id, copy(options), copy(tab));
          if (options.active) api.tabs.onActivated.dispatch({ tabId: id, windowId: tab.windowId });
          return copy(tab);
        },
        async remove(id) {
          fail('tabs.remove');
          records.push(['tabs.remove', id]);
          const tab = await api.tabs.get(id); tabs.delete(id);
          api.tabs.onRemoved.dispatch(id, { windowId: tab.windowId, isWindowClosing: false });
        }
      }
    };
    return { api, records, failures, local, session, tabs, windows, alarms, now: () => timestamp, advance: ms => { timestamp += ms; } };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { createFakeChrome };
  else root.ArcFakeChrome = { createFakeChrome };
})(globalThis);
