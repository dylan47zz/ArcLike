/* Templates are local; every user-controlled interpolation passes escapeHtml. No external page is loaded. */
const M = window.ArcModel;
const { $, escapeHtml, mount, icon, renderSidebar, iconEditor, bindIconEditor, iconAction } = window.ArcUI;
function parseUrl(value) {
  try { return new URL(value); } catch { return null; }
}
const STORAGE_KEY = 'arclike.prototype.v1';
let storageNotice = '';
function restore() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return M.createState();
    const value = JSON.parse(saved);
    const isEntry = item => item && typeof item.id === 'string' && typeof item.title === 'string' && Boolean(M.validUrl(item.homeUrl));
    if (value.version !== 1 || !Array.isArray(value.favorites) || !value.favorites.every(isEntry) || !Array.isArray(value.spaces) || !value.spaces.length || !value.spaces.every(space => typeof space.id === 'string' && typeof space.name === 'string' && Array.isArray(space.pins) && space.pins.every(isEntry) && Array.isArray(space.today) && space.today.every(isEntry) && Array.isArray(space.folders) && space.folders.every(folder => typeof folder.id === 'string' && typeof folder.name === 'string')) || !value.spaces.some(space => space.id === value.currentSpaceId) || !value.live || typeof value.live !== 'object' || !Object.values(value.live).every(page => page && M.validUrl(page.url))) throw new Error('Invalid prototype state');
    return value;
  } catch {
    storageNotice = '本地演示状态不可用，已使用默认数据。';
    return M.createState();
  }
}
let state = restore();
let menuTarget = null;
let menuAnchor = null;
let dialogSubmit = null;
let dialogAnchor = null;
let toastTimer;
function notify(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3400);
}
function dispatch(action, message) {
  const focused = document.activeElement;
  const focusId = focused?.dataset?.id;
  const focusAction = focused?.dataset?.action;
  state = M.reduce(state, action);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { storageNotice = '浏览器不允许本地存储；当前会话仍可体验，刷新后不保留。'; }
  render();
  if (focused && !focused.isConnected && focusId) {
    const replacement = [...document.querySelectorAll('[data-id]')].find(element => element.dataset.id === focusId && element.dataset.action === focusAction);
    (replacement || $('#quick-open')).focus({ preventScroll: true });
  }
  if (message || storageNotice) notify(storageNotice || message);
  storageNotice = '';
}
function render() {
  renderSidebar(state);
  renderPage();
}
function pageUtility(item) {
  const permanent = state.favorites.some(candidate => candidate.id === item.id) || M.currentSpace(state).pins.some(candidate => candidate.id === item.id);
  return `<div class="page-utility"><span>网页内容示意 · 不加载外部网站</span><div>${permanent ? `<button data-action="home" data-id="${escapeHtml(item.id)}" title="${escapeHtml(item.homeUrl)}">↶ 返回固定起点</button>` : `<button data-action="pin" data-id="${escapeHtml(item.id)}">♧ 固定此页面</button>`}<button data-action="close" data-id="${escapeHtml(item.id)}">关闭页面${permanent ? '，保留入口' : ''}</button></div></div>`;
}
function renderPage() {
  const space = M.currentSpace(state);
  const item = M.getEntity(state, space.activeId);
  const live = item && state.live[item.id];
  $('#native-title').textContent = live ? item.title : '新标签页';
  $('#address-input').value = live ? live.url : '';
  $('#address-input').placeholder = '输入地址，仅模拟页面导航';
  if (!live) {
    mount($('#page-preview'), `<div class="blank-page"><span class="blank-symbol" aria-hidden="true">${escapeHtml(space.emblem)}</span><p class="eyebrow">A MOMENT OF SPACE</p><h2>${space.pins.length || space.today.length ? '下一步，由你选择。' : '留白，也是一个好开始。'}</h2><p>${escapeHtml(space.name)}工作区${space.pins.length ? '的固定入口都还在。<br>点一下，就能继续。' : '还没有正在浏览的页面。<br>保存一个入口，或随意打开一个新念头。'}</p><div class="empty-actions"><button class="secondary-button" data-action="add-pin">添加固定入口</button><button class="primary-button" data-action="add-today">打开模拟页面 ↗</button></div><span class="demo-label">逻辑工作区只组织页面，不隔离登录或 Cookie</span></div>`);
    return;
  }
  const atHome = live.url === item.homeUrl;
  const permanent = state.favorites.some(candidate => candidate.id === item.id) || space.pins.some(candidate => candidate.id === item.id);
  const homeStrip = permanent && !atHome ? `<div class="home-strip"><span>固定起点未改变 · ${escapeHtml(item.homeUrl)}</span><button data-action="home" data-id="${escapeHtml(item.id)}">返回起点 ↶</button></div>` : '';
  if (item.id === 'notebook' && permanent) {
    mount($('#page-preview'), `${pageUtility(item)}<div class="page-brand"><span>S</span> 山海 <small>DESIGN NOTEBOOK</small></div><article class="document"><div class="doc-meta"><span class="meta-pill">${atHome ? '我的设计笔记' : '正在浏览子页面'}</span><span>/</span><span>${atHome ? '灵感，不止于收藏' : '让界面拥有呼吸感'}</span><span class="doc-date">虚构示例 / 2026</span></div><div class="doc-hero"><div><h2>${atHome ? '把灵感，<br>变成<em>下一步。</em>' : '好的界面，<br>懂得<em>留一点白。</em>'}</h2><p>${atHome ? '记下值得停留的瞬间，整理正在生长的想法。<br>不必一次完成，慢慢来就很好。' : '在信息之间留出呼吸的距离。<br>这是一张模拟子页面，固定起始 URL 仍然保留。'}</p><button class="hero-link" data-action="${atHome ? 'navigate-demo' : 'home'}" data-id="notebook">${atHome ? '读一篇设计随记' : '回到设计笔记首页'} <span>↗</span></button></div><figure class="landscape" aria-label="山丘与暖阳的几何插画"><div class="sun"></div><div class="hill"></div><div class="hill two"></div><div class="hill three"></div><div class="line"></div><div class="grain"></div><figcaption>LESS, BUT A LITTLE BETTER.</figcaption></figure></div>${homeStrip}<div class="doc-divider">${atHome ? '留在手边的想法' : '随记里的三个关键词'} <span>03</span></div><div class="note-cards"><button class="note-card" data-action="navigate-demo" data-id="notebook"><span class="card-number">01</span><span class="card-arrow">↗</span><h3>给界面一点呼吸感</h3><p>留白 · 层级 · 节奏</p></button><button class="note-card" data-action="open" data-id="references" ${M.getEntity(state, 'references') ? '' : 'disabled'}><span class="card-number">02</span><span class="card-arrow">↗</span><h3>那些恰到好处的细节</h3><p>打开固定的界面参考集</p></button><button class="note-card" data-action="open" data-id="color" ${M.getEntity(state, 'color') ? '' : 'disabled'}><span class="card-number">03</span><span class="card-arrow">↗</span><h3>收集一整个春天</h3><p>打开临时的色彩与情绪</p></button></div><div class="doc-bottom"><span>SHANHAI / PERSONAL GARDEN</span><span>一点记录，一点生长。 ✳</span></div></article>`);
  } else {
    mount($('#page-preview'), `${pageUtility(item)}<article class="generic-page"><p class="eyebrow">YOUR EVERYDAY, IN FOCUS</p>${icon(item)}<h2>${escapeHtml(item.title)}</h2><p>${permanent ? '这是一个持久入口对应的模拟页面。你可以继续浏览，也可以关闭页面；入口会留在侧栏，随时等你回来。' : '这是当前工作区的临时页面。关闭后从 Today 移除；如果值得长期保留，可以将它固定。'}</p><div class="generic-url">当前页面<br><br>${escapeHtml(live.url)}</div>${homeStrip}<button class="primary-button" data-action="navigate-demo" data-id="${escapeHtml(item.id)}">模拟浏览子页面 ↗</button><p class="form-note">虚构网站 · 无网络请求 · 页面导航不会更新固定 URL</p></article>`);
  }
}
function hideMenu(restoreFocus = false) {
  $('#menu').hidden = true;
  if (restoreFocus) {
    if (menuAnchor?.isConnected) menuAnchor.focus();
    else $('#quick-open').focus({ preventScroll: true });
  }
}
function showMenu(anchor, html) {
  menuAnchor = anchor;
  const menu = $('#menu');
  mount(menu, html);
  menu.hidden = false;
  const rect = anchor.getBoundingClientRect();
  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
  menu.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
  menu.style.top = `${Math.max(12, Math.min(rect.bottom + 5, window.innerHeight - height - 12))}px`;
  menu.querySelector('button:not(:disabled)')?.focus();
}
function entryMenu(id, anchor) {
  const item = M.getEntity(state, id);
  if (!item) return;
  menuTarget = id;
  const space = M.currentSpace(state);
  const isFavorite = state.favorites.some(candidate => candidate.id === id);
  const permanent = isFavorite || space.pins.some(candidate => candidate.id === id);
  const list = isFavorite ? state.favorites : permanent ? space.pins : space.today;
  const peers = list.filter(candidate => candidate.folderId === item.folderId);
  const index = peers.findIndex(candidate => candidate.id === id);
  showMenu(anchor, `<div class="menu-heading">${escapeHtml(item.title)} · ${state.live[id] ? '页面已打开' : '未加载'}</div><button data-menu="rename">重命名 <small>入口标题</small></button><button data-menu="icon">更换图标…</button>${permanent ? '<button data-menu="home">返回固定起点 <small>↶</small></button>' : '<button data-menu="pin">固定此页面 <small>移到 Pinned</small></button>'}<div class="menu-line"></div><button data-menu="up" ${index === 0 ? 'disabled' : ''}>向上移动 <small>↑</small></button><button data-menu="down" ${index === peers.length - 1 ? 'disabled' : ''}>向下移动 <small>↓</small></button><div class="menu-line"></div>${state.live[id] ? `<button data-menu="close">关闭页面 <small>${permanent ? '入口保留' : '移出 Today'}</small></button>` : ''}${permanent ? '<button data-menu="remove" class="danger">移除固定入口… <small>显式删除</small></button>' : ''}`);
}
function showDialog(title, body, actions, submit) {
  hideMenu();
  dialogAnchor = document.activeElement;
  $('#dialog-title').textContent = title;
  mount($('#dialog-body'), body);
  mount($('#dialog-actions'), actions);
  dialogSubmit = submit;
  $('#dialog').showModal();
  const input = $('#dialog-body input');
  if (input) { input.focus(); if (input.type !== 'checkbox') input.select(); }
}
const cancelSave = (save = '保存') => `<button type="button" class="secondary-button" data-action="cancel-dialog">取消</button><button type="submit" class="primary-button">${save}</button>`;
function rename(id) {
  const item = M.getEntity(state, id) || state.spaces.find(candidate => candidate.id === id) || M.currentSpace(state).folders.find(folder => folder.id === id);
  if (!item) return;
  const title = item.title || item.name;
  showDialog('给它一个更顺手的名字', `<label for="name-input">名称</label><input id="name-input" name="title" value="${escapeHtml(title)}" required maxlength="60"><p class="form-note">只修改显示名称，不改变页面地址。</p>`, cancelSave(), form => {
    dispatch({ type: 'rename', id, title: form.get('title') }, '名称已更新。');
    return true;
  });
}
function changeIcon(id) {
  const item = M.getEntity(state, id); if (!item) return;
  showDialog('更换图标', iconEditor(item), cancelSave('保存图标'), () => {
    const action = iconAction(id); if (!action) return false;
    dispatch(action, '图标已更新，页面和固定地址保持不变。'); return true;
  });
  bindIconEditor(item);
}
function addEntry(kind = 'today') {
  const space = M.currentSpace(state);
  showDialog(kind === 'pin' ? '留一个固定入口' : kind === 'favorite' ? '添加常用入口' : '打开一个新念头', `<p>${kind === 'today' ? '新页面出现在当前工作区的 Today，所有导航仅为模拟。' : kind === 'favorite' ? '常用入口跨工作区共享，关闭页面也不会消失。' : '保存起始 URL，以后页面导航也不会改变它。'}</p><label for="entry-title">名称</label><input id="entry-title" name="title" required maxlength="60" placeholder="例如：我的灵感花园"><label for="entry-url">${kind === 'today' ? '模拟页面地址' : '固定起始 URL'}</label><input id="entry-url" name="url" type="url" required placeholder="https://garden.example" spellcheck="false">${kind === 'pin' && space.folders.length ? `<label for="entry-folder">放在哪里</label><select id="entry-folder" name="folderId"><option value="">固定区顶层</option>${space.folders.map(folder => `<option value="${escapeHtml(folder.id)}">${escapeHtml(folder.name)}</option>`).join('')}</select>` : ''}<p class="form-note">仅支持 http / https；不会访问输入的网站。</p>`, cancelSave(kind === 'today' ? '打开模拟页面' : '保存入口'), form => {
    const input = $('#entry-url');
    input.setCustomValidity('');
    if (!M.validUrl(form.get('url'))) { input.setCustomValidity('请输入有效的 http 或 https 地址。'); input.reportValidity(); return false; }
    dispatch({ type: 'add', id: `entry-${crypto.randomUUID()}`, kind, title: form.get('title'), url: form.get('url'), folderId: form.get('folderId') }, kind === 'today' ? '已打开模拟页面。' : '已保存固定入口，点击时再加载。');
    return true;
  });
}
function removeEntry(id) {
  const item = M.getEntity(state, id);
  showDialog('移除固定入口？', `<p>将从固定区移除「${escapeHtml(item.title)}」。${state.live[id] ? '正在打开的页面不会被关闭，会移入当前工作区的 Today。' : '此入口未加载，不会影响其他页面。'}</p><div class="url-note">${escapeHtml(item.homeUrl)}</div><p class="form-note">如果只是暂时不用，请选择「关闭页面」，入口会保留。</p>`, '<button type="button" class="secondary-button" data-action="cancel-dialog">保留入口</button><button type="submit" class="danger-button">移除入口</button>', () => { dispatch({ type: 'remove', id }, '固定入口已移除。'); return true; });
}
function settings() {
  showDialog('轻一点，顺手一点。', `<label class="setting-row"><span>界面主题<p>给眼睛一个舒服的环境</p></span><select id="theme-select" aria-label="界面主题">${Object.entries(M.themes).map(([value, label]) => `<option value="${value}" ${state.theme === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label class="setting-row"><span>紧凑列表<p>缩小行高，留出更多浏览空间</p></span><input id="compact-check" type="checkbox" ${state.compact ? 'checked' : ''}></label><div class="settings-info">只在本机，按自己的节奏。<p>无账号、无云同步，不读取浏览历史。Today 是临时工作集合，不会在午夜自动清空。此原型保存的是模拟数据。</p></div><button type="button" class="text-button" data-action="add-favorite">添加一个常用入口</button><br><br><button type="button" class="text-button" data-action="reset">恢复初始演示数据…</button>`, '<button type="button" class="primary-button" data-action="cancel-dialog">完成</button>', null);
  $('#theme-select').addEventListener('change', event => dispatch({ type: 'theme', value: event.target.value }));
  $('#compact-check').addEventListener('change', event => dispatch({ type: 'compact', value: event.target.checked }));
}
function workspaceMenu(anchor) {
  showMenu(anchor, `<div class="menu-heading">你的工作区 · 不隔离登录</div>${state.spaces.map(space => `<button class="workspace-menu-button" data-menu="space" data-id="${escapeHtml(space.id)}"><span>${escapeHtml(space.emblem)}</span>${escapeHtml(space.name)}<small>${space.id === state.currentSpaceId ? '当前' : `${space.pins.length} 个固定入口`}</small></button>`).join('')}<div class="menu-line"></div><button data-menu="rename-space">重命名当前工作区</button><button data-menu="add-space">＋ 新建工作区</button>`);
}
function addSpace() {
  showDialog('给新想法一个空间', '<label for="name-input">工作区名称</label><input id="name-input" name="title" required maxlength="60" placeholder="例如：阅读"><p class="form-note">工作区用于组织页面，不创建独立登录环境。</p>', cancelSave('创建工作区'), form => { dispatch({ type: 'add-space', id: `space-${crypto.randomUUID()}`, title: form.get('title') }, '新工作区已创建。'); return true; });
}
function guide() {
  showDialog('在这版原型里，试一试。', '<ol class="guide-list"><li>点击顶部常用图标或固定入口。<small>未加载入口的空心点会变为已打开状态。</small></li><li>关闭「山海 · 设计笔记」，再点击它。<small>关闭不删除固定入口；重开会回到固定起点。</small></li><li>点击「读一篇设计随记」，再「返回固定起点」。<small>子页面地址改变，固定 URL 始终不变。</small></li><li>通过条目「···」重命名、上下排序。<small>Favorite 可右键或用 Shift + F10 打开同一菜单。</small></li><li>底部切换「创作」和空工作区「留白」。<small>工作区只组织页面，不隔离登录。</small></li><li>按 / 搜索；Tab 移动焦点；Esc 关闭浮层。<small>窄屏自动展示侧栏。浏览器外框与网页均为示意。</small></li></ol>', '<button type="button" class="primary-button" data-action="cancel-dialog">开始体验</button>', null);
}
function search() {
  showDialog('找一个入口，继续。', '<input id="search-input" aria-label="搜索模拟入口" placeholder="搜索名称，或输入一个网址…" autocomplete="off"><div id="search-results" class="search-results"></div><p class="form-note">跨工作区搜索 · 网址只用于创建模拟页面</p>', '<button type="button" class="secondary-button" data-action="cancel-dialog">关闭</button>', () => {
    const first = $('#search-results button');
    if (first) { first.click(); }
    return false;
  });
  const update = () => {
    const query = $('#search-input').value.trim();
    const all = [...state.favorites.map(item => ({ item, label: '共享常用', spaceId: null })), ...state.spaces.flatMap(space => [...space.pins.map(item => ({ item, label: `${space.name} · 固定`, spaceId: space.id })), ...space.today.map(item => ({ item, label: `${space.name} · 临时`, spaceId: space.id }))])];
    const matches = all.filter(({ item }) => `${item.title} ${item.homeUrl}`.toLowerCase().includes(query.toLowerCase()));
    mount($('#search-results'), matches.map(({ item, label, spaceId }) => `<button type="button" class="search-result" data-search-id="${escapeHtml(item.id)}" data-space-id="${escapeHtml(spaceId || '')}">${icon(item)}<span>${escapeHtml(item.title)}</span><small>${escapeHtml(label)}</small></button>`).join('') || (M.validUrl(query) ? `<button type="button" class="search-result" data-search-url="${escapeHtml(query)}">＋ 打开模拟页面 <small>Today</small></button>` : '<p class="search-empty">没有找到。试试其他名称，或输入完整网址。</p>'));
  };
  $('#search-input').addEventListener('input', update);
  update();
}
function perform(action, id, anchor) {
  switch (action) {
    case 'open': dispatch({ type: 'open', id }); break;
    case 'close': {
      const permanent = state.favorites.some(item => item.id === id) || state.spaces.some(space => space.pins.some(item => item.id === id));
      dispatch({ type: 'close', id }, permanent ? '页面已关闭，固定入口仍保留。点击可重新打开。' : '临时页面已关闭，已从 Today 移除。'); break;
    }
    case 'home': dispatch({ type: 'home', id }, '已回到保存的固定起点。'); break;
    case 'switch': dispatch({ type: 'switch', id }); break;
    case 'folder': dispatch({ type: 'folder', id }); break;
    case 'pin': dispatch({ type: 'pin', id }, '已将当前 URL 保存为固定起点。'); break;
    case 'entry-menu': entryMenu(id, anchor); break;
    case 'icon': changeIcon(id); break;
    case 'rename-folder': rename(id); break;
    case 'navigate-demo': {
      const item = M.getEntity(state, id);
      const url = parseUrl(item?.homeUrl);
      if (!url) { notify('页面地址不可用，请重新添加模拟入口。'); break; }
      url.pathname = `${url.pathname.replace(/\/$/, '')}/notes/quiet-design`;
      dispatch({ type: 'navigate', id, url: url.href }, '已模拟导航；固定起始地址没有改变。'); break;
    }
    case 'add-pin': addEntry('pin'); break;
    case 'add-today': addEntry('today'); break;
    case 'add-favorite': $('#dialog').close(); addEntry('favorite'); break;
    case 'cancel-dialog': $('#dialog').close(); break;
    case 'reset':
      $('#dialog').close();
      showDialog('恢复初始演示数据？', '<p>只清除 ArcLike 原型的本地状态，包括你在演示中添加的入口与名称；不会影响真实 Chrome 数据。</p>', cancelSave('恢复演示数据'), () => { state = M.createState(); dispatch({ type: 'switch', id: 'daily' }, '已恢复初始演示数据。'); return true; });
      break;
  }
}
// Event delegation keeps simulated pages and dynamically added entries interactive.
document.addEventListener('click', event => {
  const searchResult = event.target.closest('[data-search-id], [data-search-url]');
  if (searchResult) {
    $('#dialog').close();
    if (searchResult.dataset.searchId) {
      if (searchResult.dataset.spaceId) dispatch({ type: 'switch', id: searchResult.dataset.spaceId });
      dispatch({ type: 'open', id: searchResult.dataset.searchId });
    } else {
      const url = parseUrl(M.validUrl(searchResult.dataset.searchUrl));
      if (url) dispatch({ type: 'add', id: `entry-${crypto.randomUUID()}`, kind: 'today', title: url.hostname, url: url.href });
    }
    return;
  }
  const menuButton = event.target.closest('[data-menu]');
  if (menuButton) {
    const action = menuButton.dataset.menu;
    hideMenu(true);
    if (action === 'rename') rename(menuTarget);
    else if (action === 'remove') removeEntry(menuTarget);
    else if (action === 'up' || action === 'down') dispatch({ type: 'move', id: menuTarget, direction: action === 'up' ? -1 : 1 }, '顺序已更新。');
    else if (action === 'space') perform('switch', menuButton.dataset.id);
    else if (action === 'rename-space') rename(state.currentSpaceId);
    else if (action === 'add-space') addSpace();
    else perform(action, menuTarget);
    return;
  }
  const actionButton = event.target.closest('[data-action]');
  if (actionButton) perform(actionButton.dataset.action, actionButton.dataset.id, actionButton);
  else if (!event.target.closest('#menu')) hideMenu();
});
document.addEventListener('contextmenu', event => {
  const target = event.target.closest('[data-action="open"]');
  if (target) { event.preventDefault(); entryMenu(target.dataset.id, target); }
});
document.addEventListener('keydown', event => {
  const typing = event.target.matches('input, textarea, select, [contenteditable="true"]');
  if ((event.key === 'F10' && event.shiftKey || event.key === 'ContextMenu') && event.target.matches('[data-action="open"]')) {
    event.preventDefault(); entryMenu(event.target.dataset.id, event.target); return;
  }
  if (event.key === 'Escape' && !$('#menu').hidden) { event.preventDefault(); hideMenu(true); }
  if (event.key === '/' && !typing && !$('#dialog').open) { event.preventDefault(); search(); }
  if (!$('#menu').hidden && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const buttons = [...$('#menu').querySelectorAll('button:not(:disabled)')];
    const index = buttons.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }
});
$('#dialog-form').addEventListener('submit', event => {
  event.preventDefault();
  const name = event.currentTarget.querySelector('input[name="title"]');
  if (name && !name.value.trim()) { name.setCustomValidity('名称不能只有空格。'); name.reportValidity(); return; }
  if (dialogSubmit?.(new FormData(event.currentTarget))) $('#dialog').close();
});
$('#dialog-form').addEventListener('input', event => { if (event.target instanceof HTMLInputElement) event.target.setCustomValidity(''); });
$('#dialog').addEventListener('close', () => {
  if ($('#dialog').open) return;
  const replacement = [...document.querySelectorAll('[data-id]')].find(element => element.dataset.id === dialogAnchor?.dataset?.id && element.dataset.action === dialogAnchor?.dataset?.action);
  const target = dialogAnchor?.isConnected ? dialogAnchor : replacement || $('#quick-open');
  target?.focus({ preventScroll: true });
});
$('#dialog-close').addEventListener('click', () => $('#dialog').close());
$('#dialog').addEventListener('click', event => { if (event.target === $('#dialog')) { const rect = $('#dialog').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('#dialog').close(); } });
$('#quick-open').addEventListener('click', search);
$('#new-tab').addEventListener('click', () => addEntry('today'));
$('#add-today').addEventListener('click', () => addEntry('today'));
$('#add-pin').addEventListener('click', () => addEntry('pin'));
$('#settings').addEventListener('click', settings);
$('#guide').addEventListener('click', guide);
$('#space-menu').addEventListener('click', event => workspaceMenu(event.currentTarget));
$('#workspace-list').addEventListener('click', event => workspaceMenu(event.currentTarget));
$('#address-form').addEventListener('submit', event => {
  event.preventDefault();
  const url = parseUrl(M.validUrl($('#address-input').value));
  const id = M.currentSpace(state).activeId;
  if (!url) { notify('请输入有效的 http 或 https 地址；此处只模拟导航。'); return; }
  if (id) dispatch({ type: 'navigate', id, url: url.href }, '模拟地址已更新，固定起始 URL 保持不变。');
  else dispatch({ type: 'add', id: `entry-${crypto.randomUUID()}`, kind: 'today', title: url.hostname, url: url.href });
});
for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => {
  document.body.classList.toggle('panel-view', button.dataset.view === 'panel');
  for (const other of document.querySelectorAll('[data-view]')) other.setAttribute('aria-pressed', String(other === button));
  hideMenu();
});
window.addEventListener('resize', () => hideMenu());
render();
if (storageNotice) { notify(storageNotice); storageNotice = ''; }
