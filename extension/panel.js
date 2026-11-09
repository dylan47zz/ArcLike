/* Real side-panel UI: all mutations go through the single MV3 writer. */
(function (root) {
  const M = root.ArcModel;
  const { $, escapeHtml: e, mount, renderSidebar, iconEditor, bindIconEditor, iconAction } = root.ArcUI;
  let state = M.createEmptyState();
  let api, windowId, managed = false, toastTimer, dialogSubmit, dialogAnchor, menuAnchor, dragged;
  const buttons = label => `<button type="button" class="secondary-button" data-action="cancel-dialog">取消</button><button type="submit" class="primary-button">${e(label)}</button>`;
  function notify(message) {
    $('#toast').textContent = message; $('#toast').classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 4000);
  }
  function error(message) {
    $('#connection-message').textContent = message;
    $('#connection-notice').hidden = false; $('#connection-actions').hidden = !api;
    notify(message);
  }
  function restoreFocus(anchor) {
    if (anchor?.isConnected) { anchor.focus({ preventScroll: true }); return; }
    const replacement = anchor?.dataset?.id && [...document.querySelectorAll('[data-id]')].find(element => element.dataset.id === anchor.dataset.id && element.dataset.action === anchor.dataset.action);
    (replacement || $('#quick-open')).focus({ preventScroll: true });
  }
  function render() {
    const focused = document.activeElement;
    renderSidebar(state);
    for (const button of $('#today').querySelectorAll('.tab-open')) {
      button.draggable = managed;
      button.title += ' · 拖到固定入口或常用入口';
    }
    $('.lifecycle-note').textContent = state.expiryEnabled ? `Today：闲置 ${state.expiryHours}h 自动关闭 · 已开启` : '关闭页面，固定入口依然在。';
    $('.lifecycle-note').classList.toggle('expiry-on', state.expiryEnabled);
    $('#sidebar').setAttribute('aria-busy', 'false');
    $('#favorites').inert = !managed; $('.sidebar-scroll').inert = !managed; $('#spaces').inert = !managed;
    $('#quick-open').disabled = !managed; $('#workspace-list').disabled = !managed;
    if (focused && !focused.isConnected) restoreFocus(focused);
  }
  function accept(result) {
    const contextChanged = (result.state && result.state.currentSpaceId !== state.currentSpaceId) || (managed && result.windowId !== undefined && result.windowId !== windowId);
    if (contextChanged) {
      clearDrag();
      hideMenu();
      if ($('#dialog').open) { $('#dialog').close(); notify('工作区或管理窗口已变化，未提交的操作已取消。'); }
    }
    if (result.state) state = result.state;
    if (result.windowId !== undefined) managed = result.windowId === windowId;
    render();
    if (result.error) error(result.error);
    else if (!managed) error('开发版正在管理另一个窗口。可在设置中明确改为管理本窗口。');
  }
  async function command(action, message) {
    if (!api) throw new Error('请在 Chrome 中手动加载扩展；网页预览不能操作真实标签。');
    const result = await api.runtime.sendMessage({ scope: 'arclike:command', windowId, spaceId: state.currentSpaceId, action });
    if (!result?.ok) throw new Error(result?.error || '后台未响应，请重试或在扩展管理页检查错误。');
    if (result.state) {
      $('#connection-notice').hidden = true;
      accept(result);
    }
    if (message) notify(message);
    return result;
  }
  async function start(chromeApi) {
    api = chromeApi;
    try {
      windowId = (await api.windows.getCurrent()).id;
      api.runtime.onMessage.addListener(result => { if (result.scope === 'arclike:update') accept(result); });
      await command({ type: 'connect' });
    } catch (failure) { error(failure.message); }
  }
  function hideMenu(focus = false) {
    $('#menu').hidden = true;
    if (focus) restoreFocus(menuAnchor);
  }
  function showMenu(anchor, markup) {
    menuAnchor = anchor; mount($('#menu'), markup); $('#menu').hidden = false;
    const rect = anchor.getBoundingClientRect(), menu = $('#menu');
    menu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(rect.bottom + 5, innerHeight - menu.offsetHeight - 8))}px`;
    menu.querySelector('button:not(:disabled)')?.focus();
  }
  function showDialog(title, markup, label, submit) {
    dialogAnchor = document.activeElement;
    hideMenu(); dialogSubmit = submit;
    $('#dialog-title').textContent = title; mount($('#dialog-body'), markup); mount($('#dialog-actions'), buttons(label));
    if (!$('#dialog').open) $('#dialog').showModal();
    const input = $('#dialog-body input'); if (input) { input.focus(); input.select(); }
  }
  function confirm(title, message, label, action) {
    showDialog(title, `<p>${e(message)}</p>`, label, () => command(action));
  }
  function folderSelect(selected = null) {
    return `<label for="folder">放入文件夹</label><select id="folder" name="folderId"><option value="">固定入口顶层</option>${M.currentSpace(state).folders.map(folder => `<option value="${e(folder.id)}" ${folder.id === selected ? 'selected' : ''}>${e(folder.name)}</option>`).join('')}</select>`;
  }
  function add(kind) {
    showDialog(kind === 'favorite' ? '添加常用入口' : kind === 'pin' ? '添加固定入口' : '打开一个网页', `<label for="entry-title">名称</label><input id="entry-title" name="title" required maxlength="60" autocomplete="off"><label for="entry-url">网页地址</label><input id="entry-url" name="url" type="url" required maxlength="8192" placeholder="https://…" spellcheck="false">${kind === 'pin' ? folderSelect() : ''}<p class="form-note">${kind === 'today' ? '确认后将在真实 Chrome 标签页中打开。' : '只保存入口；点击后才打开页面，关闭页面仍保留入口。'}</p>`, kind === 'today' ? '打开网页' : '保存入口', form => command({ type: 'add', kind, title: form.title.value, url: form.url.value, folderId: form.folderId?.value || null }, '已保存。'));
  }
  function rename(id) {
    const target = M.getEntity(state, id) || state.spaces.find(space => space.id === id) || M.currentSpace(state).folders.find(folder => folder.id === id);
    if (!target) return;
    showDialog('重命名', `<label for="rename-title">名称</label><input id="rename-title" name="title" required maxlength="60" value="${e(target.title || target.name)}">`, '保存', form => command({ type: 'rename', id, title: form.title.value }, '名称已更新。'));
  }
  function changeIcon(id) {
    const item = M.getEntity(state, id); if (!item) return;
    showDialog('更换图标', iconEditor(item), '保存图标', async () => {
      const action = iconAction(id); if (!action) return false;
      await command(action, '图标已更新，页面和固定地址保持不变。');
    });
    bindIconEditor(item);
  }
  function entryMenu(id, anchor) {
    const item = M.getEntity(state, id); if (!item) return;
    const space = M.currentSpace(state);
    const favorite = state.favorites.some(entry => entry.id === id);
    const pin = space.pins.some(entry => entry.id === id), permanent = favorite || pin;
    const list = favorite ? state.favorites : pin ? space.pins : space.today;
    const peers = list.filter(entry => entry.folderId === item.folderId), index = peers.findIndex(entry => entry.id === id);
    const button = (action, text, disabled = false) => `<button data-menu="${action}" data-id="${e(id)}" ${disabled ? 'disabled' : ''}>${text}</button>`;
    showMenu(anchor, `<div class="menu-heading">${e(item.title)}</div>${button('open', '打开 / 选中页面')}${permanent ? button('home', '↶ 返回固定起点') : button('pin', '固定当前地址', !M.validUrl(state.live[id]?.url))}${!permanent ? button('favorite', '设为共享常用入口', !M.validUrl(state.live[id]?.url)) : ''}${button('rename', '重命名')}${button('icon', '更换图标…')}${pin ? button('relocate', '移入文件夹…') : ''}${button('up', '向上移动', index <= 0)}${button('down', '向下移动', index >= peers.length - 1)}<div class="menu-line"></div>${state.live[id] ? button('close', permanent ? '关闭页面 · 保留入口' : '关闭临时页面') : ''}${permanent ? button('remove', '移除固定入口…') : ''}`);
  }
  function workspaceMenu(anchor) {
    showMenu(anchor, `<div class="menu-heading">你的工作区 · 不隔离登录</div>${state.spaces.map(space => `<button class="workspace-menu-button" data-menu="switch" data-id="${e(space.id)}"><span>${e(space.emblem)}</span>${e(space.name)}<small>${space.id === state.currentSpaceId ? '当前' : ''}</small></button>`).join('')}<div class="menu-line"></div><button data-menu="rename-space">重命名当前工作区</button><button data-menu="add-folder">＋ 新建文件夹</button><button data-menu="add-space">＋ 新建工作区</button>`);
  }
  function named(type, title) {
    showDialog(title, '<label for="new-name">名称</label><input id="new-name" name="title" required maxlength="60" autocomplete="off">', '创建', form => command({ type, title: form.title.value }, '已创建。'));
  }
  function settings() {
    showDialog('轻一点，刚刚好', `<label class="setting-row"><span>外观</span><select name="theme">${Object.entries(M.themes).map(([value, label]) => `<option value="${value}" ${state.theme === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label class="setting-row"><span>紧凑列表</span><input type="checkbox" name="compact" ${state.compact ? 'checked' : ''}></label><p class="form-note">自动外观跟随浏览器提供的浅 / 深色偏好，使用系统界面颜色；Chrome 未提供读取自定义主题色或背景图的扩展 API，不能完整复刻商店主题。</p><label class="setting-row"><span>临时页自动过期</span><input type="checkbox" name="expiry" ${state.expiryEnabled ? 'checked' : ''}></label><label class="setting-row"><span>闲置时长（小时）</span><input type="number" name="expiryHours" required min="1" max="720" step="1" value="${state.expiryHours}" aria-label="自动过期闲置小时数"></label><p class="form-note">时长默认 12h，可设 1–720 整数小时；自动关页默认关闭。开启或缩短已开启的时长需确认，可能立即清理已超时页面；不能识别所有未保存编辑。</p><div class="extension-settings-actions"><button type="button" class="secondary-button" data-action="capture">固定当前网页</button><button type="button" class="secondary-button" data-action="add-favorite">添加共享常用入口</button><button type="button" class="secondary-button" data-action="import">纳入本窗口已有标签…</button><button type="button" class="secondary-button" data-action="export">导出入口备份</button><button type="button" class="text-button" data-action="takeover">改为管理本窗口…</button><button type="button" class="text-button" data-action="forget-session">清除临时绑定…</button></div><div class="settings-info">开发版只管理一个普通窗口；切换 Space 不隐藏原生标签，也不隔离登录。<p>入口与设置只保存到本机。Today 和真实 tab ID 仅保留在当前浏览器会话；重启后可手动纳入恢复的标签。不使用历史、账号或云同步。</p><p>宽度由 Chrome 控制：拖动面板靠网页一侧的外边缘调整。达到浏览器最小宽度后不能继续缩小；这里的列表会随可用宽度排版。</p><p>浏览器级默认快捷键：Ctrl / ⌘ + Shift + Y 打开 / 关闭侧栏，同键切换；逗号 / 句号切上一个 / 下一个工作区。侧栏关闭时也可切工作区。在 chrome://extensions/shortcuts 的「激活扩展程序」设置侧栏开关；未生效时先检查冲突。</p></div>`, '完成', async () => {});
  }
  function search() {
    showDialog('搜索，或打开', '<input id="search-input" name="query" placeholder="找入口、工作区，或输入网址…" aria-label="搜索或输入网址" autocomplete="off"><div id="search-results" class="search-results"></div>', '关闭', async () => {});
    const input = $('#search-input');
    const update = () => {
      const query = input.value.trim().toLowerCase();
      const entries = [...state.favorites.map(item => ({ item, spaceId: state.currentSpaceId, label: '共享常用' })), ...state.spaces.flatMap(space => [...space.pins, ...space.today].map(item => ({ item, spaceId: space.id, label: space.name })))];
      const results = entries.filter(({ item, label }) => `${item.title} ${item.homeUrl} ${label}`.toLowerCase().includes(query));
      const url = M.validUrl(input.value.trim());
      mount($('#search-results'), `${url ? `<button type="button" class="search-result" data-search-url="${e(url)}">在新标签打开输入的网址 ↗</button>` : ''}${results.slice(0, 40).map(({ item, spaceId, label }) => `<button type="button" class="search-result" data-action="search-open" data-id="${e(item.id)}" data-space-id="${e(spaceId)}"><span>${e(item.title)}</span><small>${e(label)}</small></button>`).join('') || '<p class="search-empty">没有找到。可输入完整 http / https 地址。</p>'}`);
    };
    input.addEventListener('input', update); update();
  }
  async function exportData() {
    const result = await command({ type: 'export' });
    const url = URL.createObjectURL(new Blob([JSON.stringify({ format: 'arclike-local-v1', exportedAt: new Date().toISOString(), data: result.backup }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'arclike-backup.json';
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('备份包含入口名称与 URL，请妥善保存，不要公开分享。');
  }
  async function perform(action, id, anchor) {
    if (action === 'entry-menu') return entryMenu(id, anchor);
    if (action === 'icon') return changeIcon(id);
    if (action === 'rename' || action === 'rename-folder') return rename(id);
    if (action === 'rename-space') return rename(state.currentSpaceId);
    if (action === 'workspace-menu') return workspaceMenu(anchor);
    if (action === 'add-pin' || action === 'add-favorite' || action === 'add-today') return add(action.slice(4));
    if (action === 'add-space') return named('add-space', '新建工作区');
    if (action === 'add-folder') return named('add-folder', '新建文件夹');
    if (action === 'settings') return settings();
    if (action === 'search') return search();
    if (action === 'cancel-dialog') return $('#dialog').close();
    if (action === 'remove') return confirm('移除固定入口？', '只删除这个入口；如果页面还开着，将转入当前工作区的 Today，不会关闭网页。', '移除入口', { type: 'remove', id });
    if (action === 'import') return confirm('纳入本窗口已有标签？', '这些正在打开的页面将归入当前工作区的 Today；已有入口绑定不变，不按网址猜测固定入口。不读取浏览历史。', '纳入标签', { type: 'import' });
    if (action === 'takeover') return confirm('改为管理本窗口？', '旧窗口的网页不会被关闭。旧窗口的临时 Space 归属和活标签绑定将释放，固定入口仍保留；新窗口已有页面需手动纳入。', '改为管理', { type: 'takeover' });
    if (action === 'forget-session') return confirm('清除临时标签绑定？', '不会关闭真实网页，也不会删除固定入口。Today 与活页面关联会被清除；需要时再手动纳入已有标签。', '清除绑定', { type: 'forget-session' });
    if (action === 'relocate' || action === 'pin') return showDialog(action === 'pin' ? '固定当前地址' : '放入文件夹', `${folderSelect(M.getEntity(state, id)?.folderId)}<p class="form-note">固定地址与之后的页面导航相互独立。</p>`, '保存', form => command({ type: action, id, folderId: form.folderId.value || null }, '已保存。'));
    if (action === 'export') return exportData();
    if (action === 'retry') return command({ type: 'connect' });
    if (action === 'up' || action === 'down') return command({ type: 'move', id, direction: action === 'up' ? -1 : 1 });
    return command({ type: action, id });
  }
  document.addEventListener('click', async event => {
    const target = event.target.closest('button'); if (!target) { if (!event.target.closest('#menu')) hideMenu(); return; }
    const routes = { 'quick-open': 'search', 'add-pin': 'add-pin', 'add-today': 'add-today', 'new-tab': 'new-tab', 'settings': 'settings', 'space-menu': 'workspace-menu', 'workspace-list': 'workspace-menu', 'dialog-close': 'cancel-dialog' };
    const action = target.dataset.menu || target.dataset.action || routes[target.id];
    try {
      if (target.dataset.searchUrl) {
        const url = new URL(target.dataset.searchUrl); $('#dialog').close();
        await command({ type: 'add', kind: 'today', title: url.hostname, url: url.href }); return;
      }
      if (action === 'search-open') {
        $('#dialog').close();
        if (target.dataset.spaceId !== state.currentSpaceId) await command({ type: 'switch', id: target.dataset.spaceId });
        await command({ type: 'open', id: target.dataset.id }); return;
      }
      if (target.dataset.menu) { const anchor = menuAnchor; hideMenu(true); await perform(action, target.dataset.id, anchor); }
      else if (action) await perform(action, target.dataset.id, target);
    } catch (failure) { error(failure.message); }
    if (action && action !== 'workspace-menu' && action !== 'entry-menu' && !target.closest('#menu')) hideMenu();
  });
  function clearDrag() {
    dragged = null;
    for (const target of document.querySelectorAll('.drop-target, .dragging')) target.classList.remove('drop-target', 'dragging');
  }
  function dropZone(target) {
    if (target.closest?.('#favorites, #favorites-label')) return { element: $('#favorites'), type: 'favorite' };
    if (target.closest?.('#pins, #pins-label')) return { element: $('#pins'), type: 'pin', folderId: target.closest('.folder')?.querySelector('.folder-toggle')?.dataset.id || null };
  }
  document.addEventListener('dragstart', event => {
    const button = event.target.closest?.('#today .tab-open');
    if (!button || !event.dataTransfer) return;
    if (!managed || !M.currentSpace(state).today.some(item => item.id === button.dataset.id)) { event.preventDefault(); return; }
    hideMenu();
    dragged = { id: button.dataset.id, spaceId: state.currentSpaceId, windowId };
    event.dataTransfer.setData('application/x-arclike-today', JSON.stringify(dragged));
    event.dataTransfer.effectAllowed = 'move';
    button.classList.add('dragging');
  });
  document.addEventListener('dragover', event => {
    const zone = dropZone(event.target);
    if (!zone) return;
    event.preventDefault();
    if (!dragged || !managed || dragged.spaceId !== state.currentSpaceId) { if (event.dataTransfer) event.dataTransfer.dropEffect = 'none'; return; }
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    for (const target of document.querySelectorAll('.drop-target')) target.classList.remove('drop-target');
    zone.element.classList.add('drop-target');
  });
  document.addEventListener('dragleave', event => {
    const zone = dropZone(event.target);
    if (zone && !zone.element.contains(event.relatedTarget)) zone.element.classList.remove('drop-target');
  });
  document.addEventListener('dragend', clearDrag);
  document.addEventListener('drop', async event => {
    const zone = dropZone(event.target);
    if (!zone) return;
    event.preventDefault();
    const source = dragged;
    const payload = event.dataTransfer?.getData('application/x-arclike-today');
    clearDrag();
    if (!source || payload !== JSON.stringify(source) || !managed || source.windowId !== windowId || source.spaceId !== state.currentSpaceId) { notify('请拖动当前工作区的临时页面；外部链接不会被自动保存。'); return; }
    try { await command({ type: zone.type, id: source.id, folderId: zone.folderId }, zone.type === 'favorite' ? '已设为共享常用入口，页面保持打开。' : '已固定当前地址，页面保持打开。'); }
    catch (failure) { error(failure.message); }
  });
  document.addEventListener('contextmenu', event => {
    const target = event.target.closest('[data-id][data-action="open"]');
    if (target) { event.preventDefault(); entryMenu(target.dataset.id, target); }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { if (!$('#menu').hidden) { event.preventDefault(); hideMenu(true); } return; }
    if (!$('#menu').hidden && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); const entries = [...$('#menu').querySelectorAll('button:not(:disabled)')], index = entries.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length;
      entries[next]?.focus(); return;
    }
    if (event.shiftKey && event.key === 'F10') {
      const target = document.activeElement.closest('[data-id][data-action="open"]');
      if (target) { event.preventDefault(); entryMenu(target.dataset.id, target); } return;
    }
    if (event.key === '/' && managed && !$('#dialog').open && !event.ctrlKey && !event.metaKey && !event.altKey && !event.target.matches?.('input,select,textarea')) { event.preventDefault(); search(); }
  });
  $('#dialog-form').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget, submitter = event.submitter;
    const title = form.elements.namedItem('title');
    if (title && !title.value.trim()) { title.setCustomValidity('名称不能只有空格。'); title.reportValidity(); return; }
    if (submitter) submitter.disabled = true;
    try { if (await dialogSubmit?.(form.elements) !== false) $('#dialog').close(); }
    catch (failure) { error(failure.message); }
    finally { if (submitter) submitter.disabled = false; }
  });
  $('#dialog-form').addEventListener('input', event => { if (event.target.setCustomValidity) event.target.setCustomValidity(''); });
  $('#dialog-form').addEventListener('change', async event => {
    const target = event.target;
    if (target.name === 'expiry' || target.name === 'expiryHours') {
      const hours = target.name === 'expiryHours' ? Number(target.value) : state.expiryHours;
      if (!M.validExpiryHours(hours)) { target.setCustomValidity('请输入 1–720 的整数小时。'); target.reportValidity(); return; }
      const enabled = target.name === 'expiry' ? target.checked : state.expiryEnabled;
      const action = { type: 'expiry', enabled, hours };
      if (enabled && (!state.expiryEnabled || hours < state.expiryHours)) {
        confirm('确认自动过期设置？', `闲置 ${hours} 小时的 Today 页面会自动关闭真实 Chrome 标签，可能立即清理已超时页面，丢失未保存的表单或编辑。当前标签、原生固定、发声、加载中或不允许自动丢弃的页面跳过。固定入口与常用入口永不过期；无法可靠识别所有未保存编辑。`, '确认启用此时长', action);
      } else {
        try { await command(action, enabled ? '自动过期时长已更新。' : '自动关页已关闭，时长已保存。'); }
        catch (failure) { target.checked = state.expiryEnabled; target.value = state.expiryHours; error(failure.message); }
      }
      return;
    }
    if (!['theme', 'compact'].includes(target.name)) return;
    try { await command({ type: target.name, value: target.name === 'compact' ? target.checked : target.value }); }
    catch (failure) { target.value = state.theme; target.checked = state.compact; error(failure.message); }
  });
  $('#dialog').addEventListener('close', () => restoreFocus(dialogAnchor));
  root.ArcPanel = { start };
  render();
  if (root.chrome?.runtime?.id) start(root.chrome);
  else error('这是扩展的真实侧栏页面，不是网页模拟器。请按 README 在 Chrome 扩展管理页手动加载项目目录。');
})(globalThis);
