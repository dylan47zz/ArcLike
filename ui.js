/* Shared by the approved prototype and the real extension; no browser APIs here. */
(function (root) {
  const M = root.ArcModel;
  const $ = selector => document.querySelector(selector);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  // Strict inert fragments: no scripts, links, media, styles, or event attributes enter the live DOM.
  function mount(target, markup) {
    const parsed = new DOMParser().parseFromString(markup, 'text/html');
    const tags = new Set(['div', 'span', 'button', 'small', 'p', 'br', 'h2', 'h3', 'article', 'figure', 'figcaption', 'em', 'label', 'input', 'select', 'option', 'ol', 'li', 'svg', 'rect', 'path', 'circle']);
    const attributes = new Set(['class', 'title', 'id', 'hidden', 'disabled', 'role', 'aria-label', 'aria-hidden', 'aria-pressed', 'aria-expanded', 'aria-controls', 'data-action', 'data-id', 'data-row', 'data-menu', 'data-search-id', 'data-search-url', 'data-space-id', 'for', 'type', 'name', 'required', 'maxlength', 'min', 'max', 'step', 'value', 'placeholder', 'spellcheck', 'checked', 'selected', 'autocomplete', 'viewBox', 'x', 'y', 'width', 'height', 'rx', 'd', 'cx', 'cy', 'r']);
    for (const element of parsed.body.querySelectorAll('*')) {
      if (!tags.has(element.localName)) { element.remove(); continue; }
      for (const attribute of [...element.attributes]) if (!attributes.has(attribute.name)) element.removeAttribute(attribute.name);
    }
    target.replaceChildren(...[...parsed.body.childNodes].map(node => document.importNode(node, true)));
  }
  const scheme = root.matchMedia('(prefers-color-scheme: dark)');
  let preference = 'light';
  function applyTheme(theme) {
    preference = typeof theme === 'string' && Object.hasOwn(M.themes, theme) ? theme : 'light';
    const dark = preference === 'dark' || preference === 'auto' && scheme.matches;
    document.documentElement.dataset.theme = preference;
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    document.body.classList.toggle('dark', dark);
  }
  scheme.addEventListener('change', () => applyTheme(preference));
  const icons = {
    mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>',
    calendar: '<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 10h16"/><path d="M9 14h1v4m4-4h2l-2 4"/>',
    studio: '<rect x="6" y="3" width="6" height="6" rx="3"/><rect x="12" y="3" width="6" height="6" rx="3"/><rect x="6" y="9" width="6" height="6" rx="3"/><circle cx="15" cy="12" r="3"/><path d="M6 15h6v3a3 3 0 0 1-6 0z"/>',
    code: '<path d="m8 6-5 6 5 6m8-12 5 6-5 6m-3-14-2 16"/>',
    check: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8 12 3 3 5-6"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
    type: '<path d="M4 6V4h16v2M12 4v16m-4 0h8"/>',
    map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15m6-12v15"/>',
    link: '<path d="m10 8 2-2a5 5 0 0 1 7 7l-2 2M14 16l-2 2a5 5 0 0 1-7-7l2-2m2 6 6-6"/>',
    folder: '<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>'
  };
  function icon(item) {
    const name = Object.hasOwn(icons, item.icon) ? item.icon : 'link';
    const color = ['green', 'blue', 'orange', 'purple', 'ink'].includes(item.color) ? item.color : 'green';
    let mark = `<svg viewBox="0 0 24 24">${icons[name]}</svg>`;
    if (item.icon === 'shanhai') mark = 'S';
    else if (item.icon === 'initial') mark = escapeHtml(Array.from(item.title?.trim() || '↗')[0]);
    else if (item.icon === 'custom') mark = escapeHtml(M.validIconGlyph(item.iconGlyph) ? item.iconGlyph : '◇');
    return `<span class="site-icon ${item.icon === 'shanhai' ? 'shanhai' : color}" aria-hidden="true">${mark}</span>`;
  }
  function iconEditor(item) {
    const selected = Object.hasOwn(M.entryIcons, item.icon) ? item.icon : 'custom';
    const glyph = item.icon === 'shanhai' ? 'S' : item.iconGlyph || '';
    return `<div id="icon-fields"><div id="icon-preview" class="icon-preview"></div><label for="icon-choice">图标</label><select id="icon-choice" name="icon">${Object.entries(M.entryIcons).map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select><label for="icon-glyph">自定义一个字 / emoji</label><input id="icon-glyph" name="glyph" maxlength="32" value="${escapeHtml(glyph)}" placeholder="如：星、G、⭐" autocomplete="off"><label for="icon-color">图标颜色</label><select id="icon-color" name="color">${Object.entries(M.iconColors).map(([value, label]) => `<option value="${value}" ${item.color === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select><p class="form-note">只改变侧栏图标。选择「名称首字」可恢复自动显示；emoji 自带颜色，不会被着色。不上传图片，也不访问外部图标服务。</p></div>`;
  }
  function bindIconEditor(item) {
    const update = () => {
      const choice = $('#icon-choice').value, field = $('#icon-glyph');
      field.disabled = choice !== 'custom'; field.required = choice === 'custom';
      mount($('#icon-preview'), `${icon({ ...item, icon: choice, color: $('#icon-color').value, iconGlyph: field.value })}<span>${escapeHtml(item.title)}</span>`);
    };
    $('#icon-fields').addEventListener('input', update);
    $('#icon-fields').addEventListener('change', update);
    update(); $('#icon-choice').focus();
  }
  function iconAction(id) {
    const choice = $('#icon-choice'), field = $('#icon-glyph'), color = $('#icon-color');
    const glyph = choice.value === 'custom' ? field.value : undefined;
    choice.setCustomValidity(Object.hasOwn(M.entryIcons, choice.value) ? '' : '请选择图标。');
    color.setCustomValidity(Object.hasOwn(M.iconColors, color.value) ? '' : '请选择图标颜色。');
    field.setCustomValidity(choice.value !== 'custom' || M.validIconGlyph(glyph) ? '' : '请输入一个可见汉字、字母或 emoji，不含空格。');
    if (![choice, field, color].every(input => input.reportValidity())) return null;
    return { type: 'icon', id, icon: choice.value, glyph, color: color.value };
  }
  function row(state, item, permanent) {
    const loaded = Boolean(state.live[item.id]);
    const active = M.currentSpace(state).activeId === item.id && loaded;
    const title = escapeHtml(item.title);
    return `<div class="tab-row ${active ? 'active' : ''} ${loaded ? '' : 'unloaded'}" data-row="${escapeHtml(item.id)}"><button class="tab-open" data-action="open" data-id="${escapeHtml(item.id)}" aria-pressed="${active}" title="${title}${loaded ? '' : ' · 未加载，点击打开'}">${icon(item)}<span class="tab-title">${title}</span></button>${!loaded ? '<span class="unloaded-marker" title="未加载" aria-label="未加载"></span>' : ''}<button class="row-action" data-action="entry-menu" data-id="${escapeHtml(item.id)}" aria-label="${title}的更多操作" title="更多操作">···</button>${loaded ? `<button class="row-action" data-action="close" data-id="${escapeHtml(item.id)}" aria-label="关闭${title}的页面${permanent ? '，保留固定入口' : '，从 Today 移除'}" title="${permanent ? '关闭页面 · 保留入口' : '关闭临时页面'}">×</button>` : ''}</div>`;
  }
  function renderSidebar(state) {
    const space = M.currentSpace(state);
    applyTheme(state.theme);
    $('#sidebar').classList.toggle('compact', state.compact);
    $('#space-name').textContent = space.name;
    $('#space-caption').textContent = space.caption;
    $('#space-emblem').textContent = space.emblem;
    $('#dock-space-name').textContent = space.name;
    $('#today-count').textContent = space.today.length;
    mount($('#favorites'), state.favorites.map(item => `<button class="favorite ${state.live[item.id] ? '' : 'unloaded'} ${space.activeId === item.id ? 'active' : ''}" data-action="open" data-id="${escapeHtml(item.id)}" aria-label="打开常用入口${escapeHtml(item.title)}${state.live[item.id] ? '' : '，未加载'}" aria-pressed="${space.activeId === item.id}" title="${escapeHtml(item.title)} · ${state.live[item.id] ? '已打开' : '未加载'}（右键更换图标 / 更多操作）">${icon(item)}</button>`).join('') || '<button class="favorite" data-action="add-favorite" aria-label="添加常用入口" title="添加常用入口">+</button>');
    let pins = space.pins.filter(item => !item.folderId).map(item => row(state, item, true)).join('');
    pins += space.folders.map(folder => {
      const items = space.pins.filter(item => item.folderId === folder.id);
      return `<div class="folder"><div class="folder-header"><button class="folder-toggle" data-action="folder" data-id="${escapeHtml(folder.id)}" aria-expanded="${!folder.collapsed}" aria-controls="folder-${escapeHtml(folder.id)}"><span class="chevron" aria-hidden="true">›</span><span class="folder-icon">${icon({ icon: 'folder' })}</span><span>${escapeHtml(folder.name)}</span><span class="folder-count">${items.length}</span></button><button class="row-action" data-action="rename-folder" data-id="${escapeHtml(folder.id)}" aria-label="重命名文件夹${escapeHtml(folder.name)}" title="重命名文件夹">···</button></div><div class="folder-children" id="folder-${escapeHtml(folder.id)}" ${folder.collapsed ? 'hidden' : ''}>${items.map(item => row(state, item, true)).join('')}</div></div>`;
    }).join('');
    mount($('#pins'), pins || '<div class="empty-pins"><p>暂无固定入口</p><button data-action="add-pin">添加入口</button></div>');
    mount($('#today'), space.today.map(item => row(state, item, false)).join('') || '<div class="empty-today">还没有临时页面。<br>不急，新的发现会在这里落脚。</div>');
    mount($('#spaces'), state.spaces.map(item => `<button class="space-button ${escapeHtml(item.color)}" data-action="switch" data-id="${escapeHtml(item.id)}" aria-pressed="${space.id === item.id}" aria-label="切换到${escapeHtml(item.name)}工作区" title="${escapeHtml(item.name)}">${escapeHtml(item.emblem)}</button>`).join(''));
    $('#spaces').scrollLeft = $('#spaces [aria-pressed="true"]').offsetLeft;
  }
  root.ArcUI = { $, escapeHtml, mount, icon, iconEditor, bindIconEditor, iconAction, row, renderSidebar };
})(globalThis);
