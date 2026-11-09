const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createState, createEmptyState, reduce, currentSpace, getEntity, validUrl, entryIcons, validIconGlyph } = require('../model.js');

test('关闭固定页面不删除入口，重开回到起始 URL，并且不会重复创建页面', () => {
  const initial = createState();
  let state = reduce(initial, { type: 'navigate', id: 'notebook', url: 'https://shanhai.example/notes/quiet' });
  assert.equal(getEntity(state, 'notebook').homeUrl, 'https://shanhai.example/notebook');
  state = reduce(state, { type: 'close', id: 'notebook' });
  assert.ok(getEntity(state, 'notebook'));
  assert.equal(state.live.notebook, undefined);
  assert.equal(currentSpace(state).activeId, null);
  state = reduce(state, { type: 'open', id: 'notebook' });
  state = reduce(state, { type: 'open', id: 'notebook' });
  assert.equal(state.live.notebook.url, 'https://shanhai.example/notebook');
  assert.equal(Object.keys(state.live).filter(id => id === 'notebook').length, 1);
  assert.equal(initial.live.notebook.url, 'https://shanhai.example/notebook');
});

test('已加载入口再次打开时保留当前导航，返回起点才复位', () => {
  let state = reduce(createState(), { type: 'navigate', id: 'notebook', url: 'https://shanhai.example/notes/quiet' });
  state = reduce(state, { type: 'open', id: 'notebook' });
  assert.equal(state.live.notebook.url, 'https://shanhai.example/notes/quiet');
  state = reduce(state, { type: 'home', id: 'notebook' });
  assert.equal(state.live.notebook.url, getEntity(state, 'notebook').homeUrl);
});

test('Favorites 跨工作区共享，关闭页面仍保留；切换不关闭其他工作区页面', () => {
  let state = reduce(createState(), { type: 'open', id: 'mail' });
  state = reduce(state, { type: 'switch', id: 'work' });
  assert.ok(state.favorites.some(item => item.id === 'mail'));
  assert.ok(state.live.mail);
  assert.ok(state.live.notebook);
  state = reduce(state, { type: 'open', id: 'mail' });
  assert.equal(currentSpace(state).activeId, 'mail');
  state = reduce(state, { type: 'close', id: 'mail' });
  assert.ok(getEntity(state, 'mail'));
  assert.ok(state.spaces.every(space => space.activeId !== 'mail'));
});

test('Today 关闭时从临时集合移除，其他页面不受影响', () => {
  const state = reduce(createState(), { type: 'close', id: 'color' });
  assert.equal(getEntity(state, 'color'), undefined);
  assert.equal(state.live.color, undefined);
  assert.ok(state.live.notebook);
});

test('显式移除未加载固定入口才删除；移除已加载入口转入 Today 而不关闭页面', () => {
  let state = reduce(createState(), { type: 'remove', id: 'references' });
  assert.equal(getEntity(state, 'references'), undefined);
  state = reduce(state, { type: 'remove', id: 'notebook' });
  assert.ok(!currentSpace(state).pins.some(item => item.id === 'notebook'));
  assert.ok(currentSpace(state).today.some(item => item.id === 'notebook'));
  assert.ok(state.live.notebook);
  state = reduce(state, { type: 'close', id: 'notebook' });
  assert.equal(getEntity(state, 'notebook'), undefined);
});

test('重命名、同文件夹内排序与折叠不改变 URL', () => {
  let state = reduce(createState(), { type: 'rename', id: 'notebook', title: '  新笔记  ' });
  assert.equal(getEntity(state, 'notebook').title, '新笔记');
  assert.equal(getEntity(state, 'notebook').homeUrl, 'https://shanhai.example/notebook');
  state = reduce(state, { type: 'move', id: 'references', direction: -1 });
  assert.deepEqual(currentSpace(state).pins.map(item => item.id), ['plan', 'references', 'notebook']);
  state = reduce(state, { type: 'move', id: 'references', direction: -1 });
  assert.deepEqual(currentSpace(state).pins.map(item => item.id), ['plan', 'references', 'notebook']);
  state = reduce(state, { type: 'folder', id: 'design' });
  assert.equal(currentSpace(state).folders[0].collapsed, true);
});

test('切工作区后过期排序指令不破坏当前 Today', () => {
  const state = reduce(createState(), { type: 'switch', id: 'work' });
  assert.deepEqual(reduce(state, { type: 'move', id: 'plan', direction: 1 }), state);
});

test('固定 Today 时保存当前导航 URL，而不是旧的临时地址', () => {
  let state = reduce(createState(), { type: 'navigate', id: 'color', url: 'https://reading.example/color/detail' });
  state = reduce(state, { type: 'pin', id: 'color' });
  assert.ok(!currentSpace(state).today.some(item => item.id === 'color'));
  assert.equal(currentSpace(state).pins.find(item => item.id === 'color').homeUrl, 'https://reading.example/color/detail');
  assert.ok(state.live.color);
});

test('Today 设为常用入口保留 ID / 页面，保存当前网址并移除过期时间', () => {
  let state = createState();
  getEntity(state, 'color').lastActiveAt = 123;
  state = reduce(state, { type: 'navigate', id: 'color', url: 'https://reading.example/current' });
  state = reduce(state, { type: 'favorite', id: 'color' });
  assert.ok(state.favorites.some(item => item.id === 'color'));
  assert.ok(!currentSpace(state).today.some(item => item.id === 'color'));
  assert.equal(getEntity(state, 'color').homeUrl, 'https://reading.example/current');
  assert.equal(getEntity(state, 'color').lastActiveAt, undefined);
  assert.ok(state.live.color);
  assert.deepEqual(reduce(state, { type: 'favorite', id: 'color' }), state);
  assert.equal(createEmptyState().expiryHours, 12);
  assert.equal(createEmptyState().expiryEnabled, false);
});

test('更换图标支持内置与单个 emoji，保留地址 / 绑定；无效或跨区修改不变', () => {
  const original = createState();
  let state = reduce(original, { type: 'icon', id: 'mail', icon: 'custom', glyph: '👩🏽‍💻', color: 'purple' });
  assert.equal(getEntity(state, 'mail').iconGlyph, '👩🏽‍💻');
  assert.equal(getEntity(state, 'mail').homeUrl, getEntity(original, 'mail').homeUrl);
  assert.deepEqual(state.live, original.live);
  assert.equal(getEntity(original, 'mail').iconGlyph, undefined);
  for (const icon of Object.keys(entryIcons)) {
    state = reduce(state, { type: 'icon', id: 'mail', icon, glyph: icon === 'custom' ? '星' : undefined, color: 'blue' });
    assert.equal(getEntity(state, 'mail').icon, icon);
    assert.equal(getEntity(state, 'mail').iconGlyph, icon === 'custom' ? '星' : undefined);
  }
  for (const good of ['G', '星', '⭐', '🇨🇳', '👩🏽‍💻', 'e\u0301', '<']) assert.ok(validIconGlyph(good));
  for (const bad of ['', ' ', '\n', '\u0000', '\u200b', '\ud800', 'AB', '两字', '⭐ ⭐', '<img src=x>', 'a'.repeat(33), 1, null]) assert.equal(validIconGlyph(bad), false);
  for (const action of [
    { type: 'icon', id: 'board', icon: 'mail', color: 'green' },
    { type: 'icon', id: 'mail', icon: '__proto__', color: 'green' },
    { type: 'icon', id: 'mail', icon: 'custom', glyph: 'AB', color: 'green' },
    { type: 'icon', id: 'mail', icon: 'sun', color: 'unknown' }
  ]) assert.deepEqual(reduce(state, action), state);
});

test('无效地址、空名称、未知工作区和重复 ID 不改变状态', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,test', 'file:///tmp/test', 'bad', '']) assert.equal(validUrl(value), null);
  assert.equal(validUrl('https://garden.example'), 'https://garden.example/');
  const state = createState();
  for (const action of [
    { type: 'navigate', id: 'notebook', url: 'javascript:alert(1)' },
    { type: 'add', id: 'bad', title: 'Invalid', url: 'file:///tmp/test' },
    { type: 'add', id: 'notebook', title: 'Duplicate', url: 'https://garden.example' },
    { type: 'rename', id: 'notebook', title: ' ' },
    { type: 'switch', id: 'missing' }
  ]) assert.deepEqual(reduce(state, action), state);
});

test('空工作区支持新入口、新临时页、设置与新工作区', () => {
  let state = reduce(createState(), { type: 'switch', id: 'blank' });
  assert.equal(currentSpace(state).pins.length, 0);
  state = reduce(state, { type: 'add', kind: 'pin', id: 'garden', title: '花园', url: 'https://garden.example' });
  assert.equal(currentSpace(state).pins.length, 1);
  assert.equal(state.live.garden, undefined);
  state = reduce(state, { type: 'add', kind: 'today', id: 'article', title: '文章', url: 'https://article.example' });
  assert.equal(currentSpace(state).activeId, 'article');
  assert.ok(state.live.article);
  state = reduce(state, { type: 'theme', value: 'dark' });
  state = reduce(state, { type: 'compact', value: true });
  assert.equal(state.theme, 'dark');
  assert.equal(state.compact, true);
  state = reduce(state, { type: 'add-space', id: 'read', title: '阅读' });
  assert.equal(currentSpace(state).name, '阅读');
  assert.equal(state.spaces.length, 4);
});

test('移除共享入口后仅在当前 Today 保留页面，清除其他工作区的旧选中状态', () => {
  let state = reduce(createState(), { type: 'open', id: 'mail' });
  state = reduce(state, { type: 'switch', id: 'work' });
  state = reduce(state, { type: 'open', id: 'mail' });
  state = reduce(state, { type: 'remove', id: 'mail' });
  assert.equal(currentSpace(state).activeId, 'mail');
  assert.equal(state.spaces.find(space => space.id === 'daily').activeId, null);
  assert.equal(currentSpace(state).today.filter(item => item.id === 'mail').length, 1);
  assert.deepEqual(reduce(state, { type: 'remove', id: 'mail' }), state);
});

test('真实扩展初始无虚构页，新文件夹能折叠与添加入口', () => {
  let state = createEmptyState();
  assert.equal(state.favorites.length, 0);
  assert.deepEqual(state.spaces.map(space => [space.id, space.name]), [['daily', '日常'], ['work', '工作']]);
  assert.deepEqual(state.live, {});
  assert.ok(state.spaces.every(space => !space.pins.length && !space.today.length && !space.folders.length));
  state = reduce(state, { type: 'add-folder', id: 'reading', title: ' 阅读 ' });
  assert.equal(currentSpace(state).folders[0].name, '阅读');
  state = reduce(state, { type: 'add', kind: 'pin', id: 'book', title: '文档', url: 'https://example.org', folderId: 'reading' });
  assert.equal(currentSpace(state).pins[0].folderId, 'reading');
  assert.deepEqual(reduce(state, { type: 'add-folder', id: 'reading', title: '重复' }), state);
});

test('相同 URL 的入口使用不同 ID，不错误合并', () => {
  let state = reduce(createState(), { type: 'add', kind: 'pin', id: 'same-url', title: '另一个入口', url: 'https://shanhai.example/notebook' });
  state = reduce(state, { type: 'open', id: 'same-url' });
  state = reduce(state, { type: 'close', id: 'same-url' });
  assert.ok(state.live.notebook);
  assert.equal(state.live['same-url'], undefined);
});
