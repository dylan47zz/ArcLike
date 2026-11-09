/* One serialized writer owns both metadata and real-tab bindings. */
(function (root) {
  const M = typeof module !== 'undefined' && module.exports ? require('../model.js') : root.ArcModel;
  const DATA_KEY = 'arclike.data.v1';
  const SESSION_KEY = 'arclike.session.v1';
  const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id) && id !== 'prototype' && !Object.hasOwn(Object.prototype, id);
  function safeHttp(value) {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
    } catch { return null; }
  }
  function validState(value, transient = false) {
    if (!value || value.version !== 1 || (typeof value.theme !== 'string' || !Object.hasOwn(M.themes, value.theme)) || typeof value.compact !== 'boolean' || !Array.isArray(value.favorites) || !Array.isArray(value.spaces) || !value.spaces.length || !value.live || typeof value.live !== 'object' || Array.isArray(value.live)) return false;
    if (value.expiryEnabled === undefined) {
      if (value.expiryHours !== undefined && ![0, 24].includes(value.expiryHours)) return false;
    } else if (typeof value.expiryEnabled !== 'boolean' || !M.validExpiryHours(value.expiryHours)) return false;
    const ids = new Set();
    const unique = id => { if (!validId(id) || ids.has(id)) return false; ids.add(id); return true; };
    const entry = (item, temporary = false) => item && unique(item.id) && typeof item.title === 'string' && typeof item.icon === 'string' && (item.iconGlyph === undefined || M.validIconGlyph(item.iconGlyph)) && (item.icon !== 'custom' || M.validIconGlyph(item.iconGlyph)) && typeof item.color === 'string' && (!temporary || item.lastActiveAt === undefined || Number.isSafeInteger(item.lastActiveAt) && item.lastActiveAt >= 0) && (temporary ? typeof item.homeUrl === 'string' : Boolean(safeHttp(item.homeUrl)));
    if (!value.favorites.every(item => entry(item))) return false;
    for (const space of value.spaces) {
      if (!space || !unique(space.id) || !['name', 'caption', 'emblem', 'color'].every(key => typeof space[key] === 'string') || !Array.isArray(space.folders) || !Array.isArray(space.pins) || !Array.isArray(space.today)) return false;
      if (!space.folders.every(folder => folder && unique(folder.id) && typeof folder.name === 'string' && typeof folder.collapsed === 'boolean')) return false;
      if (!space.pins.every(item => entry(item) && (!item.folderId || space.folders.some(folder => folder.id === item.folderId))) || !space.today.every(item => entry(item, transient))) return false;
      if (!transient && (space.today.length || space.activeId !== null)) return false;
    }
    if (value.lastActiveId !== undefined && value.lastActiveId !== null && (!transient || !validId(value.lastActiveId) || !M.getEntity(value, value.lastActiveId))) return false;
    const tabIds = new Set();
    for (const [id, live] of Object.entries(value.live)) {
      if (!validId(id) || !M.getEntity(value, id) || !live || !Number.isInteger(live.tabId) || live.tabId < 0 || tabIds.has(live.tabId) || typeof live.url !== 'string') return false;
      tabIds.add(live.tabId);
    }
    return value.spaces.some(space => space.id === value.currentSpaceId) && value.spaces.every(space => (space.activeId === null || [...value.favorites, ...space.pins, ...space.today].some(item => item.id === space.activeId)) && (!transient || space.today.every(item => Object.hasOwn(value.live, item.id)))) && (transient || !Object.keys(value.live).length);
  }
  function durable(state) {
    const data = structuredClone(state);
    data.live = {};
    delete data.lastActiveId;
    for (const space of data.spaces) { space.today = []; space.activeId = null; }
    return data;
  }
  function createController(api, publish = () => {}, now = Date.now) {
    let state;
    let windowId = null;
    let saved = false;
    let activationVersion = 0;
    let queue = Promise.resolve();
    const snapshot = () => ({ state: structuredClone(state), windowId });
    const isPermanent = id => state.favorites.some(item => item.id === id) || state.spaces.some(space => space.pins.some(item => item.id === id));
    const boundId = tabId => Object.keys(state.live).find(id => state.live[id].tabId === tabId);
    const uuid = () => `entry-${crypto.randomUUID()}`;
    function enqueue(task) {
      const pending = queue.then(task);
      queue = pending.catch(() => {});
      return pending;
    }
    async function save(next) {
      for (const space of next.spaces) for (const item of space.today) item.lastActiveAt ??= now();
      if (!saved || JSON.stringify(durable(next)) !== JSON.stringify(durable(state))) {
        await api.storage.local.set({ [DATA_KEY]: durable(next) });
        saved = true;
      }
      state = next;
      try { await api.storage.session.set({ [SESSION_KEY]: { windowId, state } }); }
      catch { publish(snapshot()); throw new Error('入口已保留，但临时标签绑定保存失败。请检查实际标签页后重试，避免重复打开。'); }
      publish(snapshot());
    }
    async function load() {
      if (state) return;
      const local = (await api.storage.local.get(DATA_KEY))[DATA_KEY];
      if (local !== undefined && !validState(local)) throw new Error('本地入口数据格式无法读取。数据未被覆盖，请先导出备份再排查。');
      const session = (await api.storage.session.get(SESSION_KEY))[SESSION_KEY];
      if (session !== undefined && (!session || session.windowId !== null && (!Number.isInteger(session.windowId) || session.windowId < 0) || !validState(session.state, true))) throw new Error('临时标签绑定格式无法读取。可清除临时绑定，固定入口不会被删除。');
      const next = local === undefined ? M.createEmptyState() : structuredClone(local);
      if (session) {
        for (const space of next.spaces) {
          const old = session.state.spaces.find(candidate => candidate.id === space.id);
          if (!old) continue;
          space.today = old.today.filter(item => !M.getEntity(next, item.id));
          space.activeId = old.activeId;
        }
        next.live = Object.fromEntries(Object.entries(session.state.live).filter(([id]) => M.getEntity(next, id)));
        next.lastActiveId = M.getEntity(next, session.state.lastActiveId) ? session.state.lastActiveId : null;
        for (const space of next.spaces) if (!M.getEntity(next, space.activeId)) space.activeId = null;
        windowId = session.windowId;
      }
      if (next.defaultSpacesVersion !== 2) {
        const work = next.spaces.find(space => space.id === 'work');
        if (work?.name === '创作') work.name = '工作';
        // Retire only unused defaults after session hydration; never drop user content or repeat renames.
        next.spaces = next.spaces.filter(space => space.id !== 'blank' || space.name !== '留白' || space.pins.length || space.folders.length || space.today.length);
        if (!next.spaces.some(space => space.id === next.currentSpaceId)) next.currentSpaceId = next.spaces[0].id;
        next.defaultSpacesVersion = 2;
      }
      if (next.expiryEnabled === undefined) {
        next.expiryEnabled = next.expiryHours === 24;
        next.expiryHours = next.expiryEnabled ? 24 : 12;
      }
      for (const space of next.spaces) for (const item of space.today) item.lastActiveAt ??= now();
      state = next;
      saved = local !== undefined && JSON.stringify(durable(next)) === JSON.stringify(local);
    }
    function attach(next, tab) {
      if (tab.windowId !== windowId || tab.incognito || typeof tab.id !== 'number' || tab.url?.startsWith(api.runtime.getURL(''))) return;
      const id = Object.keys(next.live).find(key => next.live[key].tabId === tab.id) || uuid();
      if (!M.getEntity(next, id)) M.currentSpace(next).today.push({ id, title: (tab.title || '新标签页').slice(0, 60), homeUrl: tab.pendingUrl || tab.url || 'about:blank', icon: 'initial', color: 'green', folderId: null });
      next.live[id] = { tabId: tab.id, url: tab.pendingUrl || tab.url || next.live[id]?.url || 'about:blank' };
      const item = M.getEntity(next, id);
      if (!item.customTitle && !next.favorites.some(entry => entry.id === id) && !next.spaces.some(space => space.pins.some(entry => entry.id === id))) item.title = (tab.title || item.title).slice(0, 60);
    }
    function activity(next, id) {
      for (const space of next.spaces) for (const item of space.today) {
        if (item.id === id || item.id === next.lastActiveId) item.lastActiveAt = now();
      }
      next.lastActiveId = id || null;
    }
    function select(next, id) {
      activity(next, id);
      const owner = next.spaces.find(space => [...space.pins, ...space.today].some(item => item.id === id));
      if (owner) next.currentSpaceId = owner.id;
      M.currentSpace(next).activeId = id;
    }
    function selectCurrent(next, tabId) {
      const id = Object.keys(next.live).find(key => next.live[key].tabId === tabId);
      activity(next, id);
      const space = M.currentSpace(next);
      space.activeId = id && (next.favorites.some(item => item.id === id) || [...space.pins, ...space.today].some(item => item.id === id)) ? id : null;
    }
    async function reconcile() {
      if (windowId === null) return;
      const windows = await api.windows.getAll({ windowTypes: ['normal'] });
      let next = structuredClone(state);
      if (!windows.some(window => window.id === windowId)) {
        for (const id of Object.keys(next.live)) next = M.reduce(next, { type: 'close', id });
        windowId = null;
      } else {
        const tabs = await api.tabs.query({ windowId });
        for (const [id, live] of Object.entries(next.live)) {
          const tab = tabs.find(candidate => candidate.id === live.tabId);
          if (!tab) next = M.reduce(next, { type: 'close', id });
          else attach(next, tab);
        }
        selectCurrent(next, tabs.find(tab => tab.active)?.id);
      }
      await save(next);
    }
    async function realTab(id) {
      const live = state.live[id];
      if (!live) return null;
      try {
        const tab = await api.tabs.get(live.tabId);
        return tab.windowId === windowId ? tab : null;
      } catch (error) {
        if (/No tab with id/i.test(error.message)) return null;
        throw error;
      }
    }
    async function open(next, id, home = false) {
      const item = M.getEntity(next, id);
      if (!item) throw new Error('入口已不存在，请刷新侧栏。');
      let tab = await realTab(id);
      if (!tab) {
        if (!isPermanent(id) && state.live[id]) { await save(M.reduce(next, { type: 'close', id })); throw new Error('这个临时页面已关闭或移出管理窗口。'); }
        const url = safeHttp(item.homeUrl);
        if (!url) throw new Error('只能新开 http / https 页面，且 URL 不能含用户名或密码。');
        tab = await api.tabs.create({ windowId, url, active: true });
      } else {
        const options = { active: true };
        if (home) options.url = safeHttp(item.homeUrl);
        tab = await api.tabs.update(tab.id, options);
      }
      next.live[id] = { tabId: tab.id, url: home ? item.homeUrl : tab.pendingUrl || tab.url || item.homeUrl };
      select(next, id);
      return next;
    }
    function validateAction(action) {
      if (!action || typeof action.type !== 'string') throw new Error('无效操作。');
      if (action.id !== undefined && !validId(action.id)) throw new Error('无效入口标识。');
      if (['add', 'rename', 'add-space', 'add-folder'].includes(action.type) && (typeof action.title !== 'string' || !action.title.trim() || action.title.trim().length > 60)) throw new Error('名称需为 1–60 个字符。');
      if (action.type === 'add' && (!['pin', 'favorite', 'today'].includes(action.kind) || typeof action.url !== 'string' || action.url.length > 8192 || !safeHttp(action.url))) throw new Error('请输入 http / https 地址；不要在 URL 中包含登录凭据。');
      if (['move', 'cycle-space'].includes(action.type) && ![-1, 1].includes(action.direction)) throw new Error('无效切换或排序方向。');
      if (action.type === 'move' && ![...state.favorites, ...M.currentSpace(state).pins, ...M.currentSpace(state).today].some(item => item.id === action.id)) throw new Error('只能排序当前工作区或共享常用入口。');
      if (action.type === 'expiry' && (typeof action.enabled !== 'boolean' || !M.validExpiryHours(action.hours))) throw new Error('自动过期时长需为 1–720 的整数小时，并指定开关。');
      if (action.type === 'icon' && (!M.validIcon(action.icon, action.glyph) || typeof action.color !== 'string' || !Object.hasOwn(M.iconColors, action.color))) throw new Error('请选择内置图标或一个可见字 / emoji，以及有效颜色。');
      if (action.type === 'icon' && ![...state.favorites, ...M.currentSpace(state).pins, ...M.currentSpace(state).today].some(item => item.id === action.id)) throw new Error('只能修改当前工作区或共享常用入口的图标。');
      if (action.type === 'theme' && (typeof action.value !== 'string' || !Object.hasOwn(M.themes, action.value))) throw new Error('无效主题。');
      if (['add', 'relocate', 'pin'].includes(action.type) && action.folderId && !M.currentSpace(state).folders.some(folder => folder.id === action.folderId)) throw new Error('文件夹已不存在。');
    }
    async function handle(message) {
      return enqueue(async () => {
        if (message?.action?.type === 'export') return { backup: await api.storage.local.get(DATA_KEY) };
        if (message?.action?.type === 'forget-session') {
          await api.storage.session.remove(SESSION_KEY);
          state = undefined; windowId = null;
        }
        await load();
        if (!Number.isInteger(message?.windowId) || message.windowId < 0) throw new Error('无法识别当前窗口。');
        const action = message.action || { type: 'connect' };
        validateAction(action);
        if (['connect', 'takeover', 'forget-session', 'cycle-space'].includes(action.type)) {
          await reconcile();
          const windows = await api.windows.getAll({ windowTypes: ['normal'] });
          if (!windows.some(window => window.id === message.windowId && !window.incognito)) throw new Error('首版只支持普通 Chrome 窗口。');
          if (windowId === null || action.type === 'takeover' || action.type === 'forget-session') {
            // shortcut: one managed window; takeover releases old bindings, upgrade to per-window contexts for continuous multi-window use.
            let next = structuredClone(state);
            for (const id of Object.keys(next.live)) next = M.reduce(next, { type: 'close', id });
            windowId = message.windowId;
            await save(next);
          }
          if (action.type !== 'cycle-space') return { ...snapshot(), managed: windowId === message.windowId };
        }
        if (windowId !== message.windowId) throw new Error('请先在设置中明确改为管理当前窗口；旧窗口的页面不会被关闭。');
        if (message.spaceId !== undefined && message.spaceId !== state.currentSpaceId && !['switch', 'cycle-space', 'theme', 'compact', 'expiry'].includes(action.type)) {
          throw new Error('工作区已变化，请重新执行操作。');
        }
        let next = structuredClone(state);
        const item = M.getEntity(next, action.id);
        switch (action.type) {
          case 'open': next = await open(next, action.id); break;
          case 'home':
            if (!isPermanent(action.id)) throw new Error('只有固定入口支持返回固定起点。');
            next = await open(next, action.id, true); break;
          case 'close': {
            const tab = await realTab(action.id);
            if (tab) await api.tabs.remove(tab.id);
            next = M.reduce(next, action); break;
          }
          case 'add': {
            const id = uuid();
            next = M.reduce(next, { ...action, id, folderId: action.kind === 'pin' ? action.folderId : null });
            M.getEntity(next, id).icon = 'initial';
            if (action.kind === 'today') next = await open(next, id);
            break;
          }
          case 'capture': {
            const tab = (await api.tabs.query({ windowId, active: true }))[0];
            if (!tab || !safeHttp(tab.url)) throw new Error('当前页面不能固定；请打开普通 http / https 网页。');
            attach(next, tab);
            const id = Object.keys(next.live).find(key => next.live[key].tabId === tab.id);
            if (isPermanent(id)) throw new Error('当前页面已有固定入口。');
            const source = next.spaces.find(space => space.today.some(item => item.id === id));
            const target = M.currentSpace(next);
            if (source !== target) {
              target.today.push(source.today.find(item => item.id === id));
              source.today = source.today.filter(item => item.id !== id);
              if (source.activeId === id) source.activeId = null;
            }
            next = M.reduce(next, { type: 'pin', id });
            M.currentSpace(next).activeId = id;
            break;
          }
          case 'pin': case 'favorite': {
            const tab = item && await realTab(item.id);
            const url = tab && safeHttp(tab.pendingUrl || tab.url);
            if (!item || !M.currentSpace(next).today.some(entry => entry.id === item.id) || !url) throw new Error('只有当前工作区仍打开的普通网页可以固定。');
            next.live[item.id] = { tabId: tab.id, url };
            next = M.reduce(next, action);
            M.getEntity(next, action.id).folderId = action.type === 'pin' ? action.folderId || null : null;
            break;
          }
          case 'relocate':
            if (!M.currentSpace(next).pins.some(entry => entry.id === action.id)) throw new Error('只能移动当前工作区的固定入口。');
            item.folderId = action.folderId || null; break;
          case 'new-tab': {
            const tab = await api.tabs.create({ windowId, active: true });
            attach(next, tab); selectCurrent(next, tab.id); break;
          }
          case 'import': {
            const tabs = await api.tabs.query({ windowId });
            for (const tab of tabs) attach(next, tab);
            selectCurrent(next, tabs.find(tab => tab.active)?.id); break;
          }
          case 'add-folder': case 'add-space': next = M.reduce(next, { ...action, id: uuid() }); break;
          case 'remove':
            if (!isPermanent(action.id)) throw new Error('这个固定入口已被移除。');
            next = M.reduce(next, action); break;
          case 'cycle-space': case 'switch': {
            const index = next.spaces.findIndex(space => space.id === next.currentSpaceId);
            const id = action.type === 'switch' ? action.id : next.spaces[(index + action.direction + next.spaces.length) % next.spaces.length].id;
            if (!next.spaces.some(space => space.id === id)) throw new Error('工作区已不存在。');
            next = M.reduce(next, { type: 'switch', id });
            if (M.currentSpace(next).activeId && next.live[M.currentSpace(next).activeId]) next = await open(next, M.currentSpace(next).activeId);
            break;
          }
          case 'expiry': next.expiryEnabled = action.enabled; next.expiryHours = action.hours; break;
          case 'rename':
            if (item && !isPermanent(item.id)) item.customTitle = true;
            next = M.reduce(next, action); break;
          case 'icon': case 'folder': case 'move': case 'theme': case 'compact': next = M.reduce(next, action); break;
          default: throw new Error('不支持的操作。');
        }
        await save(next);
        return snapshot();
      });
    }
    async function event(type, tabId, detail) {
      if (type === 'activated') activationVersion++;
      return enqueue(async () => {
        await load();
        if (windowId === null) return;
        let next = structuredClone(state);
        const id = boundId(tabId);
        if (type === 'created' || type === 'attached') {
          const tab = type === 'created' ? detail : await api.tabs.get(tabId);
          if (tab.windowId !== windowId) return;
          attach(next, tab);
          if (tab.active) selectCurrent(next, tab.id);
        } else if (type === 'updated') {
          if (!id) return;
          attach(next, detail);
        } else if (type === 'replaced') {
          if (!id) return;
          const tab = await api.tabs.get(detail);
          if (tab.windowId !== windowId) next = M.reduce(next, { type: 'close', id });
          else { next.live[id].tabId = tab.id; attach(next, tab); }
        } else if (type === 'removed' || type === 'detached') {
          if (!id) return;
          next = M.reduce(next, { type: 'close', id });
        } else if (type === 'activated') {
          if (detail.windowId !== windowId) return;
          if (id) select(next, id);
          else { activity(next, null); M.currentSpace(next).activeId = null; }
        } else if (type === 'window-removed') {
          if (tabId !== windowId) return;
          for (const key of Object.keys(next.live)) next = M.reduce(next, { type: 'close', id: key });
          windowId = null;
        } else return;
        await save(next);
      });
    }
    async function expire() {
      return enqueue(async () => {
        await load();
        if (!state.expiryEnabled || windowId === null) return snapshot();
        let next = structuredClone(state);
        const tabs = await api.tabs.query({ windowId });
        activity(next, boundId(tabs.find(tab => tab.active)?.id));
        const failures = [];
        for (const space of next.spaces) for (const item of [...space.today]) {
          if (now() - item.lastActiveAt < next.expiryHours * 60 * 60 * 1000) continue;
          try {
            const checkedVersion = activationVersion;
            const tab = await realTab(item.id);
            if (activationVersion !== checkedVersion) continue;
            if (tab && (tab.active || tab.pinned || tab.audible || tab.status === 'loading' || tab.autoDiscardable === false)) continue;
            // shortcut: unsaved edits need site-aware protection; add that before removing the opt-in confirmation.
            if (tab) {
              await api.tabs.remove(tab.id);
              if (await realTab(item.id)) throw new Error('页面仍打开，已保留临时入口。');
            }
            next = M.reduce(next, { type: 'close', id: item.id });
          } catch (failure) { failures.push(failure.message); }
        }
        await save(next);
        if (failures.length) throw new Error(`临时页过期检查未完成：${failures.join('；')}`);
        return snapshot();
      });
    }
    const getExpiryHours = () => enqueue(async () => { await load(); return state.expiryEnabled ? state.expiryHours : 0; });
    return { handle, event, expire, getExpiryHours };
  }
  const controller = { createController, validState, safeHttp, DATA_KEY, SESSION_KEY };
  if (typeof module !== 'undefined' && module.exports) module.exports = controller;
  else root.ArcExtension = controller;
})(globalThis);
