/* Local HTTP only; test-only adapters sit outside production extension code. */
(async () => {
  const results = [];
  const frame = document.querySelector('#panel-frame');
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  if (!['http:', 'https:'].includes(location.protocol)) {
    document.querySelector('#status').textContent = '请通过 README 的本地 HTTP 服务运行此自检。'; return;
  }
  let fake, win, doc;
  const q = selector => doc.querySelector(selector);
  async function until(check, message) {
    for (let attempt = 0; attempt < 100; attempt++) { if (check()) return; await wait(20); }
    throw new Error(message);
  }
  async function fresh() {
    const loaded = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
    frame.src = '../extension/panel.html'; await loaded;
    win = frame.contentWindow; doc = win.document; fake = ArcFakeChrome.createFakeChrome();
    win.chrome = fake.api; win.ArcExtension = { ...ArcExtension, createController: (api, publish) => ArcExtension.createController(api, publish, fake.now) }; win.importScripts = () => {};
    const worker = doc.createElement('script'); worker.src = '../extension/background.js';
    await new Promise((resolve, reject) => { worker.onload = resolve; worker.onerror = () => reject(new Error('Mock worker script did not load')); doc.head.append(worker); });
    await win.ArcPanel.start(fake.api);
    await until(() => q('#sidebar').getAttribute('aria-busy') === 'false' && q('#connection-notice').hidden, 'Panel did not connect');
  }
  const send = action => fake.api.runtime.sendMessage({ scope: 'arclike:command', windowId: 1, action });
  const flush = async () => { const result = await send({ type: 'connect' }); await wait(0); return result.state; };
  function click(selector) { const target = q(selector); assert(target, `Missing ${selector}`); target.click(); }
  async function submit(fields = {}) {
    for (const [name, value] of Object.entries(fields)) q('#dialog-form').elements.namedItem(name).value = value;
    let closed = false;
    q('#dialog').addEventListener('close', () => { closed = true; }, { once: true });
    q('#dialog-form').requestSubmit();
    await until(() => closed, 'Dialog did not commit');
  }
  async function pin(title = '文档', folderId = '') {
    click('#add-pin'); await submit({ title, url: 'https://example.org/start', folderId });
    return ArcModel.currentSpace(await flush()).pins.at(-1).id;
  }
  async function menu(id, action) { click(`[data-action="entry-menu"][data-id="${id}"]`); click(`[data-menu="${action}"]`); await wait(0); }
  async function check(name, test) {
    try { await fresh(); await test(); results.push({ name, pass: true }); }
    catch (error) { results.push({ name, pass: false, error: error.message }); }
    const line = document.createElement('li'); line.textContent = `${results.at(-1).pass ? '✓' : '✗'} ${name}${results.at(-1).error ? ` — ${results.at(-1).error}` : ''}`;
    if (!results.at(-1).pass) line.className = 'failed'; document.querySelector('#results').append(line);
  }
  await check('空状态 / 新建原生标签 / 内部页不可固定 / Today 关闭', async () => {
    assert(q('.empty-pins') && q('.empty-today'), 'Missing empty states');
    assert(!q('.chrome-frame') && !q('.page-preview'), 'Mock browser frame leaked into extension');
    assert(!q('.panel-top') && !q('.panel-brand'), 'Duplicate extension title remained');
    assert(q('.empty-pins').getBoundingClientRect().height <= 56, 'Pinned empty state still too tall');
    assert(q('.favorite').getBoundingClientRect().width === 36, 'Empty Favorite must not stretch');
    assert(q('#quick-open').getBoundingClientRect().top <= 16, 'Search wasted header space');
    assert(q('#spaces').children.length === 2 && q('#space-name').textContent === '日常', 'Expected only two default Spaces');
    click('#new-tab'); let state = await flush();
    const id = ArcModel.currentSpace(state).today[0].id;
    assert(q(`[data-row="${id}"]`).classList.contains('active'), 'Native new tab not selected');
    await menu(id, 'open'); await flush();
    click(`[data-action="entry-menu"][data-id="${id}"]`);
    assert(q('[data-menu="pin"]').disabled, 'Internal URL pin not disabled');
    click('[data-menu="close"]'); state = await flush();
    assert(!ArcModel.getEntity(state, id), 'Today close did not remove item');
    assert(fake.tabs.size === 3, 'Unmanaged existing pages changed');
  });
  await check('添加验证 / 安全名称 / 关闭保留 / 重新打开 / 返回起点', async () => {
    click('#add-pin');
    q('[name="title"]').value = ' '; q('[name="url"]').value = 'https://example.org'; q('#dialog-form').requestSubmit();
    assert(q('#dialog').open && !q('[name="title"]').validity.valid, 'Whitespace name accepted');
    q('[name="title"]').dispatchEvent(new win.Event('input', { bubbles: true }));
    const title = '<img src=x onerror=alert(1)>';
    await submit({ title, url: 'https://example.org/start' });
    let state = await flush(); const id = ArcModel.currentSpace(state).pins[0].id;
    assert(q('.tab-title').textContent === title && !q('#pins img') && q('#pins .site-icon').textContent === '<', 'Unsafe name / initial rendered as HTML');
    assert(!fake.records.some(record => record[0] === 'tabs.create'), 'Saving pin opened a page');
    click(`[data-action="open"][data-id="${id}"]`); state = await flush();
    const tabId = state.live[id].tabId;
    await fake.api.tabs.update(tabId, { url: 'https://example.org/detail' }); await flush();
    await menu(id, 'home'); state = await flush();
    assert(state.live[id].url === 'https://example.org/start', 'Home failed');
    click(`[data-action="close"][data-id="${id}"]`); await flush();
    assert(q(`[data-row="${id}"]`).classList.contains('unloaded'), 'Closed pin lost entry');
    click(`[data-action="open"][data-id="${id}"]`); state = await flush();
    assert(state.live[id].tabId !== tabId && fake.records.filter(record => record[0] === 'tabs.create').length === 2, 'Reopen / duplication failed');
  });
  await check('重命名焦点返回 / 显式移除需确认且不关网页', async () => {
    const id = await pin();
    click(`[data-action="open"][data-id="${id}"]`); await flush();
    await menu(id, 'rename'); await submit({ title: '我自己的文档' });
    assert(q('.tab-title').textContent === '我自己的文档', 'Rename failed');
    assert(doc.activeElement.dataset.id === id, 'Dialog did not restore entry focus');
    await menu(id, 'remove'); assert(q('#dialog').open && q('#dialog-title').textContent.includes('移除'), 'No remove confirmation');
    await submit(); const state = await flush();
    assert(!ArcModel.currentSpace(state).pins.some(item => item.id === id), 'Pin not removed');
    assert(ArcModel.currentSpace(state).today.some(item => item.id === id) && fake.tabs.has(state.live[id].tabId), 'Removal closed actual page');
  });
  await check('创建文件夹 / 同层排序 / 折叠 / 移回顶层', async () => {
    click('#space-menu'); click('[data-menu="add-folder"]'); await submit({ title: '设计资料' });
    const folder = ArcModel.currentSpace(await flush()).folders[0].id;
    const a = await pin('第一篇', folder), b = await pin('第二篇', folder);
    await menu(b, 'up'); assert(ArcModel.currentSpace(await flush()).pins[0].id === b, 'Folder sort failed');
    click(`[data-action="folder"][data-id="${folder}"]`); await flush();
    assert(q(`[data-action="folder"][data-id="${folder}"]`).getAttribute('aria-expanded') === 'false', 'Folder did not collapse');
    click(`[data-action="folder"][data-id="${folder}"]`); await flush();
    await menu(a, 'relocate'); await submit({ folderId: '' });
    assert(ArcModel.getEntity(await flush(), a).folderId === null, 'Relocate failed');
  });
  await check('Favorites 跨 Space / 新 Space / 搜索切换 / 设置落盘', async () => {
    click('#settings'); click('[data-action="add-favorite"]'); await submit({ title: '常用收件箱', url: 'https://example.org/mail' });
    const favorite = (await flush()).favorites[0].id;
    assert(q(`#favorites [data-id="${favorite}"] .site-icon`).textContent === '常', 'Local entry initial not rendered');
    const id = await pin('中文文档');
    click('#workspace-list'); click('[data-menu="add-space"]'); await submit({ title: '阅读空间' });
    assert(q(`#favorites [data-id="${favorite}"]`), 'Shared favorite vanished');
    win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key: '/', bubbles: true }));
    q('#search-input').value = '中文'; q('#search-input').dispatchEvent(new win.Event('input', { bubbles: true }));
    click(`[data-action="search-open"][data-id="${id}"]`);
    await until(() => q(`[data-row="${id}"]`)?.classList.contains('active'), 'Cross-space search did not finish switching and opening');
    const state = await flush();
    assert(state.currentSpaceId === 'daily' && state.live[id], 'Cross-space search failed');
    await until(() => !q('#dialog').open, 'Search dialog did not close');
    click('#settings'); q('[name="theme"]').value = 'dark'; q('[name="theme"]').dispatchEvent(new win.Event('change', { bubbles: true }));
    q('[name="compact"]').checked = true; q('[name="compact"]').dispatchEvent(new win.Event('change', { bubbles: true })); await flush();
    assert(doc.body.classList.contains('dark') && q('#sidebar').classList.contains('compact'), 'Theme / compact not applied');
    assert(fake.local[ArcExtension.DATA_KEY].theme === 'dark' && fake.local[ArcExtension.DATA_KEY].compact, 'Settings not durable');
  });
  await check('常用右键更换图标：预览 / 校验 / 取消 / 失败 / 恢复首字 / 键盘与窄屏', async () => {
    click('#settings'); click('[data-action="add-favorite"]'); await submit({ title: '常用收件箱', url: 'https://example.org/mail' });
    let state = await flush(); const id = state.favorites[0].id;
    click(`#favorites [data-id="${id}"]`); state = await flush(); const live = structuredClone(state.live[id]);
    const openEditor = async () => {
      q(`#favorites [data-id="${id}"]`).dispatchEvent(new win.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      click('[data-menu="icon"]'); await wait(0);
    };
    const select = (selector, value) => { q(selector).value = value; q(selector).dispatchEvent(new win.Event('input', { bubbles: true })); };
    await openEditor();
    assert(doc.activeElement === q('#icon-choice') && q('#icon-glyph').disabled, 'Editor focus / default glyph field');
    select('#icon-choice', 'custom'); select('#icon-glyph', 'AB');
    q('#dialog-form').requestSubmit(); await wait(0);
    assert(q('#dialog').open && !q('#icon-glyph').validity.valid && (await flush()).favorites[0].icon === 'initial', 'Multiple characters accepted');
    select('#icon-glyph', '<');
    assert(q('#icon-preview .site-icon').textContent === '<' && !q('#icon-preview img'), 'Preview interpreted markup');
    select('#icon-glyph', '👩🏽‍💻'); select('#icon-color', 'purple');
    assert(q('#icon-preview .site-icon').textContent === '👩🏽‍💻' && q('#icon-preview .site-icon').classList.contains('purple'), 'Preview missing');
    await submit(); state = await flush();
    assert(q(`#favorites [data-id="${id}"] .site-icon`).textContent === '👩🏽‍💻', 'Favorite glyph missing');
    assert(state.favorites[0].iconGlyph === '👩🏽‍💻' && state.favorites[0].homeUrl === 'https://example.org/mail' && JSON.stringify(state.live[id]) === JSON.stringify(live), 'Icon changed identity / URL / binding');
    assert(doc.activeElement.dataset.id === id, 'Icon save lost Favorite focus');
    await openEditor(); select('#icon-choice', 'mail'); click('[data-action="cancel-dialog"]'); await wait(0);
    assert((await flush()).favorites[0].icon === 'custom', 'Cancel saved draft');
    await openEditor(); select('#icon-choice', 'mail'); fake.failures['local.set'] = true;
    q('#dialog-form').requestSubmit();
    await until(() => q('#connection-message').textContent.includes('local.set'), 'Save failure not shown');
    assert(q('#dialog').open && fake.local[ArcExtension.DATA_KEY].favorites[0].icon === 'custom', 'Save failure closed draft / changed durable icon');
    fake.failures['local.set'] = false;
    select('#icon-choice', 'initial'); await submit();
    assert(q(`#favorites [data-id="${id}"] .site-icon`).textContent === '常' && !(await flush()).favorites[0].iconGlyph, 'Initial restore failed');
    const button = q(`#favorites [data-id="${id}"]`); button.focus();
    button.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
    click('[data-menu="icon"]');
    for (const width of [240, 320, 600]) {
      frame.style.width = `${width}px`;
      assert(doc.documentElement.scrollWidth === width && q('#dialog').getBoundingClientRect().right <= width, 'Icon editor overflow');
    }
    click('#dialog-close'); frame.style.width = '320px'; await wait(0);
    const pinned = await pin(); await menu(pinned, 'icon'); select('#icon-choice', 'grid'); await submit();
    assert(q(`[data-row="${pinned}"] .site-icon svg`) && ArcModel.getEntity(await flush(), pinned).icon === 'grid', 'Pinned icon menu missing');
    click('#new-tab'); const temporary = ArcModel.currentSpace(await flush()).today.at(-1).id;
    await menu(temporary, 'icon'); select('#icon-choice', 'sun'); await submit();
    assert(ArcModel.getEntity(await flush(), temporary).icon === 'sun', 'Today icon menu missing');
  });
  await check('手动纳入需确认 / 当前网页固定 / 未绑定旧页面不自动纳入', async () => {
    assert(Object.keys((await flush()).live).length === 0, 'Existing pages auto-adopted');
    click('#settings'); click('[data-action="import"]'); assert(q('#dialog-title').textContent.includes('纳入'), 'No import confirmation');
    await submit(); assert(ArcModel.currentSpace(await flush()).today.length === 2, 'Import failed');
    click('#settings'); click('[data-action="capture"]'); const state = await flush();
    assert(ArcModel.currentSpace(state).pins[0].homeUrl === 'https://example.org/docs', 'Capture failed');
    click('#dialog-close');
  });
  await check('菜单键盘方向 / Esc 返回焦点 / UI 错误不伪造页面成功', async () => {
    const id = await pin(); click(`[data-action="entry-menu"][data-id="${id}"]`);
    const first = doc.activeElement;
    first.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    assert(doc.activeElement !== first, 'Menu arrow failed');
    doc.activeElement.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert(q('#menu').hidden && doc.activeElement.dataset.id === id, 'Esc / focus restore failed');
    fake.failures['tabs.create'] = true; click(`[data-action="open"][data-id="${id}"]`);
    await until(() => q('#connection-message').textContent.includes('tabs.create'), 'Chrome error not displayed');
    assert(q(`[data-row="${id}"]`).classList.contains('unloaded'), 'Failed API action faked loaded state');
  });
  await check('接管另一窗口需确认 / 旧网页不关闭 / 清理临时绑定保留入口', async () => {
    const id = await pin(); click(`[data-action="open"][data-id="${id}"]`); const before = await flush();
    await fake.api.runtime.sendMessage({ scope: 'arclike:command', windowId: 2, action: { type: 'takeover' } });
    assert(q('#connection-notice').textContent.includes('另一个窗口') && q('.sidebar-scroll').inert, 'Unmanaged panel not blocked');
    click('#connection-actions [data-action="takeover"]'); await submit();
    assert(q('#connection-notice').hidden && fake.tabs.has(before.live[id].tabId), 'Takeover closed old tab');
    click(`[data-action="open"][data-id="${id}"]`); await flush();
    click('#settings'); click('[data-action="forget-session"]'); await submit();
    const after = await flush(); assert(ArcModel.getEntity(after, id) && !after.live[id], 'Session clear deleted entry');
  });
  await check('浏览器命令切区广播 / 过期菜单与表单取消 / 同键开关说明 / 原生 action 配置', async () => {
    const id = await pin('第一入口'); await pin('第二入口');
    click(`[data-action="entry-menu"][data-id="${id}"]`);
    await Promise.all(fake.api.commands.onCommand.dispatch('next-space', fake.tabs.get(10)));
    await until(() => q('#space-name').textContent === '工作', 'Command did not update the visible Space');
    assert(q('#menu').hidden, 'Stale menu remained after workspace command');
    const stale = await fake.api.runtime.sendMessage({ scope: 'arclike:command', windowId: 1, spaceId: 'daily', action: { type: 'add', kind: 'pin', title: '过期保存', url: 'https://example.org/stale' } });
    assert(stale.error?.includes('工作区已变化'), 'Delayed save was accepted in the wrong Space');
    click('#add-pin'); q('[name="title"]').value = '尚未保存的入口';
    await Promise.all(fake.api.commands.onCommand.dispatch('previous-space', fake.tabs.get(10)));
    await until(() => !q('#dialog').open && q('#space-name').textContent === '日常', 'Stale form remained after workspace command');
    const state = await flush();
    assert(state.spaces.reduce((count, space) => count + space.pins.length, 0) === 2, 'Cancelled form wrote to the new Space');
    click('#settings');
    const guidance = q('.settings-info').textContent;
    assert(guidance.includes('chrome://extensions/shortcuts') && guidance.includes('同键切换') && guidance.includes('激活扩展程序'), 'Native toggle shortcut guidance missing');
    assert(fake.records.some(record => record[0] === 'sidePanel' && record[1].openPanelOnActionClick === true), 'Native action behavior not configured');
    assert(!fake.records.some(record => record[0] === 'tabs.remove'), 'Workspace command removed a page');
  });
  await check('Today 拖到固定 / 文件夹 / 常用区，复用页面并拒绝外来与过期拖动；键盘菜单替代', async () => {
    const addToday = async title => {
      const result = await send({ type: 'add', kind: 'today', title, url: 'https://example.org/first' });
      return ArcModel.currentSpace(result.state).today.at(-1).id;
    };
    const start = id => {
      const dataTransfer = new win.DataTransfer();
      assert(q(`#today [data-id="${id}"]`).draggable, 'Today row not draggable');
      q(`#today [data-action="open"][data-id="${id}"]`).dispatchEvent(new win.DragEvent('dragstart', { bubbles: true, dataTransfer }));
      return dataTransfer;
    };
    const drop = async (transfer, target) => {
      q(target).dispatchEvent(new win.DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
      q(target).dispatchEvent(new win.DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
      return flush();
    };
    const a = await addToday('固定拖动'), before = await flush(), tabId = before.live[a].tabId;
    fake.tabs.get(tabId).pendingUrl = 'https://example.org/current';
    const first = await drop(start(a), '#pins-label');
    assert(ArcModel.currentSpace(first).pins.some(item => item.id === a) && !ArcModel.currentSpace(first).today.some(item => item.id === a), 'Pin drag did not promote');
    assert(first.live[a].tabId === tabId && ArcModel.getEntity(first, a).homeUrl === 'https://example.org/current' && fake.tabs.has(tabId), 'Drag reset page or saved stale URL');
    await send({ type: 'add-folder', title: '资料' });
    const folderId = ArcModel.currentSpace(await flush()).folders[0].id;
    const b = await addToday('文件夹拖动'); await drop(start(b), '.folder-toggle');
    assert(ArcModel.getEntity(await flush(), b).folderId === folderId, 'Folder target ignored');
    const c = await addToday('常用拖动'); await drop(start(c), '#favorites-label');
    const favorite = await flush(); assert(favorite.favorites.some(item => item.id === c), 'Favorite drag failed');
    assert(ArcModel.getEntity(favorite, c).lastActiveAt === undefined, 'Permanent entry retained expiration metadata');
    const external = new win.DataTransfer(); external.setData('text/uri-list', 'https://external.example/');
    await drop(external, '#favorites'); assert((await flush()).favorites.length === 1, 'External URL silently saved');
    const d = await addToday('跨区取消'), transfer = start(d);
    await send({ type: 'switch', id: 'work' }); await drop(transfer, '#pins');
    assert(!ArcModel.currentSpace(await flush()).pins.length, 'Stale drag saved in a different Space');
    await send({ type: 'switch', id: 'daily' }); await menu(d, 'favorite');
    assert((await flush()).favorites.some(item => item.id === d), 'Keyboard menu fallback failed');
    assert(!fake.records.some(record => record[0] === 'tabs.remove'), 'Drag closed a real page');
  });
  await check('过期参数默认 12h / 输入校验 / 缩短确认取消 / Alarm 清理 / 关闭保留时长', async () => {
    const old = await send({ type: 'add', kind: 'today', title: '过期页', url: 'https://example.org/old' });
    const id = ArcModel.currentSpace(old.state).today[0].id, tabId = old.state.live[id].tabId;
    const current = await send({ type: 'add', kind: 'today', title: '当前页', url: 'https://example.org/current' });
    const currentId = ArcModel.currentSpace(current.state).today.at(-1).id;
    click('#settings'); assert(!q('[name="expiry"]').checked && fake.alarms.size === 0, 'Expiry enabled without consent');
    const hoursInput = q('[name="expiryHours"]');
    assert(hoursInput.value === '12' && hoursInput.min === '1' && hoursInput.max === '720', 'Duration default or native bounds missing');
    hoursInput.value = '12.5'; hoursInput.dispatchEvent(new win.Event('change', { bubbles: true }));
    assert(!hoursInput.checkValidity() && !(await flush()).expiryEnabled, 'Invalid hours persisted');
    hoursInput.value = '18'; hoursInput.dispatchEvent(new win.Event('input', { bubbles: true })); hoursInput.dispatchEvent(new win.Event('change', { bubbles: true }));
    await until(() => fake.local[ArcExtension.DATA_KEY].expiryHours === 18, 'Custom duration not saved');
    q('[name="expiry"]').click();
    assert(q('#dialog-title').textContent.includes('自动过期') && q('#dialog-body').textContent.includes('未保存'), 'Missing destructive-operation warning');
    click('#dialog-close'); await wait(0); click('#settings'); assert(!q('[name="expiry"]').checked, 'Cancelled enable wrote policy');
    q('[name="expiry"]').click(); await submit(); assert((await flush()).expiryEnabled && (await flush()).expiryHours === 18 && fake.alarms.size === 1, 'Enable did not schedule alarm');
    click('#settings'); q('[name="expiryHours"]').value = '12'; q('[name="expiryHours"]').dispatchEvent(new win.Event('change', { bubbles: true }));
    assert(q('#dialog-body').textContent.includes('立即清理'), 'Shortening omitted risk confirmation');
    click('#dialog-close'); await wait(0); assert((await flush()).expiryHours === 18, 'Cancelled shortening persisted');
    fake.advance(19 * 3600000);
    await Promise.all(fake.api.alarms.onAlarm.dispatch({ name: 'arclike-expire-today' }));
    await until(() => !q(`[data-row="${id}"]`), 'Expired page remained visible');
    assert(!fake.tabs.has(tabId) && ArcModel.getEntity(await flush(), currentId), 'Expired or protected page handling failed');
    assert(q('.lifecycle-note').textContent.includes('已开启'), 'Enabled policy not visible');
    click('#settings'); q('[name="expiry"]').click(); await until(() => fake.alarms.size === 0, 'Disable did not clear alarm');
    assert(!(await flush()).expiryEnabled && (await flush()).expiryHours === 18, 'Disable lost duration');
    click('#dialog-close');
  });
  await check('相邻页渐变分割线：固定 / 文件夹 / Today、六主题、不占行高或拦截输入', async () => {
    await pin('第一页'); await pin('第二页');
    click('#space-menu'); click('[data-menu="add-folder"]'); await submit({ title: '分组' });
    const folder = ArcModel.currentSpace(await flush()).folders[0].id;
    await pin('组内一', folder); await pin('组内二', folder);
    click('#new-tab'); await flush(); click('#new-tab'); await flush();
    for (const theme of Object.keys(ArcModel.themes)) {
      await send({ type: 'theme', value: theme });
      for (const compact of [false, true]) {
        await send({ type: 'compact', value: compact });
        const rows = doc.querySelectorAll('.tab-row+.tab-row');
        assert(rows.length === 3, 'Separator did not cover each list');
        for (const row of rows) {
          const line = win.getComputedStyle(row, '::after');
          assert(line.content === '""' && line.backgroundImage.startsWith('linear-gradient(90deg,'), 'Gradient separator missing');
          assert(line.height === '1px' && line.top === '-1px' && line.pointerEvents === 'none', 'Separator changed spacing or blocked input');
          assert(row.getBoundingClientRect().height === (compact ? 30 : 33), 'Separator increased row height');
        }
        for (const selector of ['#pins>.tab-row', '.folder-children>.tab-row', '#today>.tab-row']) {
          assert(win.getComputedStyle(q(selector), '::after').content === 'none', 'Unwanted separator before first page');
        }
      }
    }
  });
  await check('240–600px 内容随视口缩放：六主题、紧凑空状态、长名称与设置无溢出', async () => {
    for (const width of [240, 280, 320, 360, 480, 600]) {
      frame.style.width = `${width}px`; await wait(40);
      for (const theme of Object.keys(ArcModel.themes)) {
        await send({ type: 'theme', value: theme });
        assert(q('#sidebar').getBoundingClientRect().width === width, `Content did not follow viewport at ${width}`);
        assert(q('.empty-pins').getBoundingClientRect().height <= 56, `Empty state too tall at ${width}`);
        assert(q('.favorite').getBoundingClientRect().width === 36, `Favorite stretched at ${width}`);
        assert(doc.documentElement.scrollWidth === width, `Empty view overflow at ${width}`);
      }
    }
    await pin('很长的中文入口名称'.repeat(5));
    for (const width of [240, 280, 320, 360, 480, 600]) {
      frame.style.width = `${width}px`; await wait(40);
      assert(doc.documentElement.scrollWidth === width, `Horizontal overflow at ${width}`);
      assert(q('.sidebar-bottom').getBoundingClientRect().bottom <= win.innerHeight, `Dock clipped at ${width}`);
      click('#settings');
      const dialog = q('#dialog').getBoundingClientRect();
      assert(doc.documentElement.scrollWidth === width && dialog.top >= 0 && dialog.bottom <= win.innerHeight, `Shortcut settings overflow at ${width}`);
      click('#dialog-close'); await wait(0);
    }
    frame.style.width = '320px';
  });
  await fresh();
  await send({ type: 'capture' });
  await send({ type: 'add', kind: 'favorite', title: '共享示例入口', url: 'https://example.org/mail' });
  const demo = await send({ type: 'add', kind: 'today', title: '拖动我试试', url: 'https://example.org/temporary' });
  await send({ type: 'rename', id: ArcModel.currentSpace(demo.state).today.at(-1).id, title: '拖动我试试' });
  const passed = results.filter(result => result.pass).length;
  window.arcLikeExtensionTestResult = { passed, total: results.length, results };
  window.arcLikeExtensionFake = fake;
  document.querySelector('#status').textContent = `${passed} / ${results.length} 项通过 · Chrome API 为模拟器`;
})().catch(error => { document.querySelector('#status').textContent = `自检中断：${error.message}`; });
