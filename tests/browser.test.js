/* Run in the prototype page (or open tests/browser.html through the local server). */
(async function () {
  const original = structuredClone(state);
  const stored = localStorage.getItem(STORAGE_KEY);
  const panelView = document.body.classList.contains('panel-view');
  const results = [];
  const errors = [];
  const onError = event => errors.push(event.message);
  window.addEventListener('error', onError);
  const frame = () => new Promise(resolve => setTimeout(resolve, 0));
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const click = selector => { const target = document.querySelector(selector); assert(target, `Missing: ${selector}`); target.click(); return target; };
  const input = (selector, value) => { const target = document.querySelector(selector); target.value = value; target.dispatchEvent(new Event('input', { bubbles: true })); };
  const submit = () => $('#dialog-form').requestSubmit();
  const run = async (name, check) => {
    $('#dialog').close(); hideMenu(); state = M.createState(); render(); await frame();
    try { await check(); results.push({ name, pass: true }); }
    catch (error) { results.push({ name, pass: false, error: error.message }); }
  };
  try {
    await run('默认层级、未加载与选中状态', () => {
      assert($('#favorites').children.length === 4, 'Favorites count');
      assert($('#pins [data-row="notebook"]').classList.contains('active'), 'Selected pin');
      assert($('#pins [data-row="references"]').classList.contains('unloaded'), 'Unloaded pin');
      assert($('#today').children.length === 3, 'Today count');
      assert($('#favorites svg').getAttribute('viewBox') === '0 0 24 24', 'SVG attributes preserved');
    });
    await run('关闭固定页面仍保留入口；重开不重复创建', () => {
      click('[data-action="close"][data-id="notebook"]');
      assert($('#pins [data-row="notebook"]').classList.contains('unloaded'), 'Entry lost after close');
      assert(!state.live.notebook, 'Page still loaded');
      click('[data-action="open"][data-id="notebook"]');
      click('[data-action="open"][data-id="notebook"]');
      assert(state.live.notebook.url === M.getEntity(state, 'notebook').homeUrl, 'Reopen URL');
      assert(document.querySelectorAll('[data-row="notebook"]').length === 1, 'Duplicate entry');
    });
    await run('子页面导航与返回固定起点', () => {
      const home = M.getEntity(state, 'notebook').homeUrl;
      click('.hero-link');
      assert(state.live.notebook.url !== home && M.getEntity(state, 'notebook').homeUrl === home, 'Home overwritten');
      assert($('.home-strip'), 'Missing home indicator');
      click('.home-strip button');
      assert($('#address-input').value === home, 'Did not return home');
    });
    await run('Favorites 共享与工作区独立列表', () => {
      click('#favorites [data-id="mail"]');
      click('#spaces [data-id="work"]');
      assert($('#space-name').textContent === '创作', 'Workspace name');
      assert($('#favorites [data-id="mail"]') && state.live.mail, 'Shared favorite missing');
      assert($('#pins [data-row="board"]') && !$('#pins [data-row="notebook"]'), 'Pins not space-scoped');
      click('#spaces [data-id="daily"]');
      assert(M.currentSpace(state).activeId === 'mail' && state.live.notebook, 'Switch closed background page');
    });
    await run('Today 关闭即移除，演示跳转不留下死入口', () => {
      click('[data-action="close"][data-id="color"]');
      assert(!$('#today [data-row="color"]') && !state.live.color, 'Today retained');
      assert($('.note-card[data-id="color"]').disabled, 'Dead demo action still enabled');
    });
    await run('显式移除固定入口：确认后页面转入 Today', () => {
      click('[data-action="entry-menu"][data-id="notebook"]');
      click('[data-menu="remove"]');
      assert($('#dialog').open, 'Missing confirmation');
      submit();
      assert(!$('#pins [data-row="notebook"]') && $('#today [data-row="notebook"]'), 'Wrong removal lifecycle');
      assert(state.live.notebook && $('.generic-page'), 'Removal closed page or mislabels it as pinned');
    });
    await run('重命名与键盘焦点恢复', async () => {
      click('[data-action="entry-menu"][data-id="notebook"]');
      click('[data-menu="rename"]');
      input('#name-input', '新的设计笔记');
      const closed = new Promise(resolve => $('#dialog').addEventListener('close', resolve, { once: true }));
      submit(); await closed;
      assert($('#pins [data-row="notebook"] .tab-title').textContent === '新的设计笔记', 'Rename failed');
      assert(document.activeElement.dataset.id === 'notebook', 'Focus lost after dialog close');
    });
    await run('常用图标编辑：右键、实时预览、验证与保存，不改变页面', async () => {
      const before = structuredClone(state);
      $('#favorites [data-id="mail"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      click('[data-menu="icon"]');
      input('#icon-choice', 'custom'); input('#icon-glyph', 'AB'); submit();
      assert($('#dialog').open && !$('#icon-glyph').validity.valid && M.getEntity(state, 'mail').icon === 'mail', 'Invalid glyph accepted');
      input('#icon-glyph', '⭐'); input('#icon-color', 'orange');
      assert($('#icon-preview .site-icon').textContent === '⭐', 'Icon preview missing');
      const closed = new Promise(resolve => $('#dialog').addEventListener('close', resolve, { once: true }));
      submit(); await closed;
      assert($('#favorites [data-id="mail"] .site-icon').textContent === '⭐', 'Favorite icon not saved');
      assert(M.getEntity(state, 'mail').homeUrl === M.getEntity(before, 'mail').homeUrl && JSON.stringify(state.live) === JSON.stringify(before.live), 'Icon changed page state');
      assert(document.activeElement.dataset.id === 'mail', 'Favorite focus not restored');
    });
    await run('同文件夹排序、折叠与焦点保留', () => {
      click('[data-action="entry-menu"][data-id="references"]'); click('[data-menu="up"]');
      assert($('#folder-design .tab-row').dataset.row === 'references', 'Sort failed');
      const toggle = click('[data-action="folder"][data-id="design"]');
      assert($('#folder-design').hidden && document.querySelector('[data-action="folder"]').getAttribute('aria-expanded') === 'false', 'Folder state');
      assert(!toggle.isConnected, 'Expected updated render');
      click('[data-action="folder"][data-id="design"]');
      assert(!$('#folder-design').hidden, 'Cannot expand');
    });
    await run('空工作区与新入口；拒绝无效 URL / 空白名，安全呈现用户文本', () => {
      click('#spaces [data-id="blank"]');
      assert($('.empty-pins') && $('.empty-today'), 'Missing empty states');
      click('#add-pin'); input('#entry-title', '   '); input('#entry-url', 'https://garden.example'); submit();
      assert($('#dialog').open && $('#entry-title').validity.customError, 'Whitespace accepted');
      input('#entry-title', '<img src=x onerror="alert(1)">'); input('#entry-url', 'javascript:alert(1)'); submit();
      assert($('#dialog').open && M.currentSpace(state).pins.length === 0, 'Invalid protocol accepted');
      input('#entry-url', 'https://garden.example'); submit();
      assert(M.currentSpace(state).pins.length === 1 && !$('#pins img'), 'Unsafe text render');
      assert($('#pins .tab-title').textContent.startsWith('<img'), 'User text changed');
    });
    await run('跨工作区搜索和快捷键', () => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
      assert($('#dialog').open && document.activeElement === $('#search-input'), 'Search shortcut');
      input('#search-input', '青屿'); click('[data-search-id="board"]');
      assert(state.currentSpaceId === 'work' && M.currentSpace(state).activeId === 'board', 'Cross-space result did not switch');
    });
    await run('轻量设置与本地模拟状态保存', () => {
      click('#settings'); $('#theme-select').value = 'dark'; $('#theme-select').dispatchEvent(new Event('change'));
      $('#compact-check').checked = true; $('#compact-check').dispatchEvent(new Event('change'));
      assert(document.body.classList.contains('dark') && $('#sidebar').classList.contains('compact'), 'Settings not applied');
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      assert(saved.theme === 'dark' && saved.compact, 'Settings not persisted');
    });
    await run('创建和重命名工作区', () => {
      click('#workspace-list'); click('[data-menu="add-space"]'); input('#name-input', '阅读'); submit();
      assert(state.spaces.length === 4 && $('#space-name').textContent === '阅读', 'New space');
      click('#space-menu'); click('[data-menu="rename-space"]'); input('#name-input', '阅读花园'); submit();
      assert($('#space-name').textContent === '阅读花园', 'Space rename');
    });
    await run('菜单方向键、Escape 与可见焦点规则', () => {
      const favorite = $('#favorites [data-id="mail"]'); favorite.focus();
      favorite.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }));
      assert(!$('#menu').hidden, 'Keyboard context menu');
      const first = document.activeElement;
      first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      assert(document.activeElement !== first, 'Menu arrow navigation');
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      assert($('#menu').hidden && document.activeElement === favorite, 'Escape focus');
      // Synthetic keys do not change the browser's trusted keyboard modality; inspect the rule here.
      const focusRule = [...document.styleSheets].flatMap(sheet => [...sheet.cssRules]).find(rule => rule.selectorText?.includes('button:focus-visible'));
      assert(focusRule?.style.outline.includes('2px'), 'Missing focus-visible rule');
    });
    await run('严格片段挂载：移除脚本、事件与外部资源', () => {
      const target = document.createElement('div');
      mount(target, '<div onclick="alert(1)"><script>alert(1)</script><img src="https://bad.example"><svg><foreignObject><iframe src="https://bad.example"></iframe></foreignObject><path d="M1 1" onload="alert(1)"></path></svg><button data-action="open">safe</button></div>');
      assert(!target.querySelector('script,img,iframe,foreignObject,[onclick],[onload]'), 'Dangerous fragment survived');
      assert(target.querySelector('button').textContent === 'safe' && target.querySelector('path'), 'Safe template broken');
    });
    await run('独立侧栏模式', () => {
      click('[data-view="panel"]');
      assert(document.body.classList.contains('panel-view'), 'Panel view not applied');
      assert(getComputedStyle($('#page-preview')).display === 'none', 'Mock page visible in panel');
      assert($('.browser').getBoundingClientRect().width === 320, 'Panel width including frame border');
      click('[data-view="browser"]');
    });
    await run('损坏本地存储安全回退', () => {
      localStorage.setItem(STORAGE_KEY, '{bad json');
      assert(restore().currentSpaceId === 'daily', 'Storage fallback failed');
    });
    assert(errors.length === 0, `Runtime errors: ${errors.join('; ')}`);
  } catch (error) { results.push({ name: '运行时错误检查', pass: false, error: error.message }); }
  finally {
    window.removeEventListener('error', onError);
    $('#dialog').close(); hideMenu(); state = original; storageNotice = ''; render();
    document.body.classList.toggle('panel-view', panelView);
    for (const button of document.querySelectorAll('[data-view]')) button.setAttribute('aria-pressed', String((button.dataset.view === 'panel') === panelView));
    if (stored === null) localStorage.removeItem(STORAGE_KEY); else localStorage.setItem(STORAGE_KEY, stored);
    clearTimeout(toastTimer); $('#toast').classList.remove('visible');
  }
  const result = { passed: results.filter(item => item.pass).length, total: results.length, results };
  window.arcLikeTestResult = result;
  if (parent !== window) parent.postMessage({ type: 'arclike-test-result', result }, location.origin);
  return result;
})();
