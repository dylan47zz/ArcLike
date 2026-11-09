const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const M = require('../model.js');
const { createController, DATA_KEY, SESSION_KEY, validState, safeHttp } = require('../extension/controller.js');
const { createFakeChrome } = require('./fake-chrome.js');
async function system() {
  const fake = createFakeChrome();
  const controller = createController(fake.api, undefined, fake.now);
  const send = (action, windowId = 1) => controller.handle({ windowId, action });
  await send({ type: 'connect' });
  return { fake, controller, send };
}
async function addPin(send, kind = 'pin', url = 'https://example.org/start') {
  const { state } = await send({ type: 'add', kind, title: '固定文档', url });
  return (kind === 'favorite' ? state.favorites : M.currentSpace(state).pins).at(-1).id;
}
const creates = fake => fake.records.filter(record => record[0] === 'tabs.create');
function loadWorker(fake) {
  const context = vm.createContext({ chrome: fake.api, ArcExtension: { createController: (api, publish) => createController(api, publish, fake.now) }, structuredClone, console });
  context.importScripts = () => {};
  vm.runInContext(readFileSync(resolve(__dirname, '../extension/background.js'), 'utf8'), context);
}

test('初始化无虚构网址，不自动纳入已有标签；仅四个必要权限', async () => {
  const { fake, send } = await system();
  const { state } = await send({ type: 'connect' });
  assert.equal(state.favorites.length, 0);
  assert.deepEqual(state.spaces.map(space => [space.id, space.name]), [['daily', '日常'], ['work', '工作']]);
  assert.ok(state.spaces.every(space => !space.pins.length && !space.today.length));
  assert.equal(creates(fake).length, 0);
  const manifest = JSON.parse(readFileSync(resolve(__dirname, '../manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.minimum_chrome_version, '141');
  assert.equal(manifest.version, '0.1.6');
  assert.deepEqual(Object.keys(manifest.commands), ['_execute_action', 'previous-space', 'next-space']);
  assert.deepEqual(Object.values(manifest.commands).map(command => command.suggested_key.default), ['Ctrl+Shift+Y', 'Ctrl+Shift+Comma', 'Ctrl+Shift+Period']);
  assert.deepEqual(Object.values(manifest.commands).map(command => command.suggested_key.mac), ['Command+Shift+Y', 'Command+Shift+Comma', 'Command+Shift+Period']);
  assert.equal(manifest.action.default_popup, undefined, 'A popup would replace the native side-panel action');
  assert.deepEqual(manifest.permissions, ['sidePanel', 'tabs', 'storage', 'alarms']);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined);
  for (const [size, path] of Object.entries({ ...manifest.icons, ...manifest.action.default_icon })) {
    const bytes = readFileSync(resolve(__dirname, '..', path));
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    assert.equal(bytes.readUInt32BE(16), Number(size)); assert.equal(bytes.readUInt32BE(20), Number(size));
  }
  assert.ok(readFileSync(resolve(__dirname, '..', manifest.background.service_worker)).length);
  assert.ok(readFileSync(resolve(__dirname, '..', manifest.side_panel.default_path)).length);
});

test('默认工作区升级只清理空留白；旧入口 / 文件夹 / 会话标签 / 自定义名称保留，改名只做一次', async () => {
  const legacy = () => {
    const state = M.createEmptyState(); delete state.defaultSpacesVersion;
    state.spaces.find(space => space.id === 'work').name = '创作';
    state.spaces.push({ id: 'blank', name: '留白', emblem: '☼', color: 'orange', caption: '从一个新念头开始', activeId: null, folders: [], pins: [], today: [] });
    state.currentSpaceId = 'blank'; return state;
  };
  const fake = createFakeChrome(); fake.local[DATA_KEY] = legacy();
  let controller = createController(fake.api);
  const connect = () => controller.handle({ windowId: 1, action: { type: 'connect' } });
  const result = await connect();
  assert.deepEqual(result.state.spaces.map(space => space.name), ['日常', '工作']);
  assert.equal(result.state.currentSpaceId, 'daily');
  assert.equal(fake.local[DATA_KEY].spaces.length, 2, 'Migration must be persisted');
  await controller.handle({ windowId: 1, action: { type: 'rename', id: 'work', title: '创作' } });
  controller = createController(fake.api);
  assert.equal((await connect()).state.spaces.find(space => space.id === 'work').name, '创作', 'Do not repeat the default rename');
  for (const kind of ['pin', 'folder', 'today', 'renamed']) {
    const kept = createFakeChrome(); let old = legacy();
    if (kind === 'pin') old = M.reduce(old, { type: 'add', kind: 'pin', id: 'kept', title: '保留入口', url: 'https://example.org/kept' });
    if (kind === 'folder') old = M.reduce(old, { type: 'add-folder', id: 'kept-folder', title: '保留文件夹' });
    if (kind === 'renamed') old.spaces.at(-1).name = '我的空间';
    kept.local[DATA_KEY] = structuredClone(old);
    if (kind === 'today') {
      old = M.reduce(old, { type: 'add', kind: 'today', id: 'kept', title: '保留页面', url: 'https://example.org/docs' });
      old.live.kept.tabId = 10;
      kept.session[SESSION_KEY] = { windowId: 1, state: old };
    }
    const migrated = await createController(kept.api).handle({ windowId: 1, action: { type: 'connect' } });
    assert.equal(migrated.state.spaces.length, 3, `Do not drop ${kind}`);
    assert.equal(migrated.state.currentSpaceId, 'blank');
    if (kind === 'today') assert.equal(migrated.state.live.kept.tabId, 10);
    if (kind === 'pin') assert.equal(M.getEntity(migrated.state, 'kept').homeUrl, 'https://example.org/kept');
    assert.equal(kept.records.filter(record => ['tabs.remove', 'tabs.create'].includes(record[0])).length, 0);
  }
});

test('打开、导航、返回起点、关闭、重开；持久入口与 tab ID 分离', async () => {
  const { fake, send, controller } = await system();
  const id = await addPin(send);
  let result = await send({ type: 'open', id });
  const tabId = result.state.live[id].tabId;
  fake.tabs.get(tabId).url = 'https://example.org/detail';
  await controller.event('updated', tabId, fake.tabs.get(tabId));
  result = await send({ type: 'open', id });
  assert.equal(creates(fake).length, 1);
  assert.equal(result.state.live[id].url, 'https://example.org/detail');
  assert.equal(M.getEntity(result.state, id).homeUrl, 'https://example.org/start');
  result = await send({ type: 'home', id });
  assert.equal(fake.tabs.get(tabId).url, 'https://example.org/start');
  assert.equal(result.state.live[id].tabId, tabId);
  result = await send({ type: 'close', id });
  assert.ok(M.getEntity(result.state, id)); assert.equal(result.state.live[id], undefined);
  result = await send({ type: 'open', id });
  assert.notEqual(result.state.live[id].tabId, tabId);
  assert.equal(creates(fake).length, 2);
});

test('连续与并发点击只创建一个真实标签，Service Worker 重建后复用 session 绑定', async () => {
  const { fake, send } = await system();
  const id = await addPin(send);
  await Promise.all([send({ type: 'open', id }), send({ type: 'open', id }), send({ type: 'open', id })]);
  assert.equal(creates(fake).length, 1);
  const restarted = createController(fake.api);
  const result = await restarted.handle({ windowId: 1, action: { type: 'connect' } });
  await restarted.handle({ windowId: 1, action: { type: 'open', id } });
  assert.ok(result.state.live[id]); assert.equal(creates(fake).length, 1);
});

test('不按网址绑定无关标签；两个相同起始 URL 的固定入口仍独立', async () => {
  const { fake, send } = await system();
  const a = await addPin(send, 'pin', 'https://example.org/docs');
  const b = await addPin(send, 'pin', 'https://example.org/docs');
  const first = await send({ type: 'open', id: a }), second = await send({ type: 'open', id: b });
  assert.notEqual(first.state.live[a].tabId, 10);
  assert.notEqual(second.state.live[a].tabId, second.state.live[b].tabId);
  assert.equal(creates(fake).length, 2);
});

test('手动纳入窗口已有页面：只纳入当前窗口，内部页不能固定', async () => {
  const { fake, send } = await system();
  const result = await send({ type: 'import' });
  assert.equal(M.currentSpace(result.state).today.length, 2);
  assert.ok(Object.values(result.state.live).every(page => page.tabId !== 20));
  const internal = Object.keys(result.state.live).find(id => result.state.live[id].tabId === 11);
  await assert.rejects(send({ type: 'pin', id: internal }), /普通网页/);
  await send({ type: 'close', id: internal });
  assert.equal(fake.tabs.has(11), false); assert.equal(fake.tabs.has(20), true);
});

test('原生新建、改标题、导航、关闭事件跟随；固定入口不随标题或 URL 更新', async () => {
  const { fake, send, controller } = await system();
  const tab = { id: 55, windowId: 1, active: true, title: '原生新页', url: 'https://example.org/new' };
  fake.tabs.set(tab.id, tab); await controller.event('created', tab.id, tab);
  let result = await send({ type: 'connect' });
  const id = Object.keys(result.state.live).find(key => result.state.live[key].tabId === tab.id);
  tab.title = '子页面'; tab.url = 'https://example.org/child';
  await controller.event('updated', tab.id, tab);
  result = await send({ type: 'pin', id });
  assert.equal(M.getEntity(result.state, id).homeUrl, tab.url);
  tab.title = '进一步导航'; tab.url = 'https://example.org/further';
  await controller.event('updated', tab.id, tab);
  result = await send({ type: 'connect' });
  assert.equal(M.getEntity(result.state, id).title, '子页面');
  assert.equal(M.getEntity(result.state, id).homeUrl, 'https://example.org/child');
  fake.tabs.delete(tab.id); await controller.event('removed', tab.id);
  result = await send({ type: 'connect' });
  assert.ok(M.getEntity(result.state, id)); assert.equal(result.state.live[id], undefined);
});

test('新建原生标签页进入当前 Today 并选中，但内部地址不可固定', async () => {
  const { fake, send } = await system();
  const result = await send({ type: 'new-tab' });
  const item = M.currentSpace(result.state).today[0];
  assert.equal(M.currentSpace(result.state).activeId, item.id);
  assert.ok(fake.tabs.has(result.state.live[item.id].tabId));
  await assert.rejects(send({ type: 'pin', id: item.id }), /普通网页/);
});

test('Today 从原生栏关闭即移除，重复关闭事件安全', async () => {
  const { fake, send, controller } = await system();
  let result = await send({ type: 'add', kind: 'today', title: '临时', url: 'https://example.org/temp' });
  const item = M.currentSpace(result.state).today[0], tabId = result.state.live[item.id].tabId;
  fake.tabs.delete(tabId); await controller.event('removed', tabId); await controller.event('removed', tabId);
  result = await send({ type: 'connect' });
  assert.equal(M.getEntity(result.state, item.id), undefined);
});

test('移除已打开固定入口只转 Today，不关闭页面；未打开入口直接移除', async () => {
  const { fake, send } = await system();
  const id = await addPin(send); const unopened = await addPin(send);
  const opened = await send({ type: 'open', id }); const tabId = opened.state.live[id].tabId;
  const result = await send({ type: 'remove', id });
  assert.ok(fake.tabs.has(tabId)); assert.ok(M.currentSpace(result.state).today.some(item => item.id === id));
  assert.ok(!M.currentSpace(result.state).pins.some(item => item.id === id));
  assert.equal(M.getEntity((await send({ type: 'remove', id: unopened })).state, unopened), undefined);
  assert.equal(fake.records.filter(record => record[0] === 'tabs.remove').length, 0);
});

test('Favorites 跨 Space 共享；切换不关页，原生激活回到所属 Space', async () => {
  const { fake, send, controller } = await system();
  const id = await addPin(send, 'favorite'); await send({ type: 'open', id });
  await send({ type: 'switch', id: 'work' });
  const pin = await addPin(send); const result = await send({ type: 'open', id: pin });
  await send({ type: 'switch', id: 'daily' });
  await controller.event('activated', result.state.live[pin].tabId, { windowId: 1 });
  const state = (await send({ type: 'connect' })).state;
  assert.equal(state.currentSpaceId, 'work'); assert.ok(state.favorites.some(item => item.id === id));
  assert.ok(state.live[id]); assert.equal(fake.records.filter(record => record[0] === 'tabs.remove').length, 0);
});

test('固定当前真实页，文件夹创建 / 移入 / 折叠 / 改名与同层排序', async () => {
  const { send } = await system();
  const captured = await send({ type: 'capture' }); const id = M.currentSpace(captured.state).pins[0].id;
  assert.equal(M.getEntity(captured.state, id).homeUrl, 'https://example.org/docs');
  const added = await send({ type: 'add-folder', title: '阅读' }); const folder = M.currentSpace(added.state).folders[0].id;
  await send({ type: 'relocate', id, folderId: folder });
  const second = await send({ type: 'add', kind: 'pin', title: '第二篇', url: 'https://example.org/second', folderId: folder });
  const secondId = M.currentSpace(second.state).pins.at(-1).id;
  await send({ type: 'move', id: secondId, direction: -1 });
  await send({ type: 'rename', id: folder, title: '阅读资料' });
  const result = await send({ type: 'folder', id: folder });
  assert.equal(M.currentSpace(result.state).pins[0].id, secondId);
  assert.equal(M.currentSpace(result.state).folders[0].name, '阅读资料');
  assert.equal(M.currentSpace(result.state).folders[0].collapsed, true);
});

test('空 Space 固定当前网页时归入当前 Space，保留临时页的手动名称', async () => {
  const { fake, send, controller } = await system();
  const imported = await send({ type: 'import' });
  const id = Object.keys(imported.state.live).find(key => imported.state.live[key].tabId === 10);
  await send({ type: 'rename', id, title: '我命名的文档' });
  await controller.event('updated', 10, fake.tabs.get(10));
  assert.equal(M.getEntity((await send({ type: 'connect' })).state, id).title, '我命名的文档');
  await send({ type: 'switch', id: 'work' });
  await controller.event('updated', 10, fake.tabs.get(10));
  assert.equal((await send({ type: 'connect' })).state.currentSpaceId, 'work', 'background title / load updates must not switch the chosen Space');
  const captured = await send({ type: 'capture' });
  assert.equal(captured.state.currentSpaceId, 'work');
  assert.equal(M.currentSpace(captured.state).pins[0].id, id);
  assert.equal(captured.state.spaces.find(space => space.id === 'daily').today.some(item => item.id === id), false);
});

test('持久存储无 Today 或 tab ID；浏览器新会话只恢复入口与设置，不猜测旧页面', async () => {
  const { fake, send } = await system();
  const id = await addPin(send); await send({ type: 'open', id });
  await send({ type: 'theme', value: 'dark' }); await send({ type: 'compact', value: true });
  assert.ok(validState(fake.local[DATA_KEY]));
  assert.deepEqual(fake.local[DATA_KEY].live, {});
  assert.ok(fake.local[DATA_KEY].spaces.every(space => !space.today.length && space.activeId === null));
  delete fake.session[SESSION_KEY];
  const next = await createController(fake.api).handle({ windowId: 1, action: { type: 'connect' } });
  assert.ok(M.getEntity(next.state, id)); assert.deepEqual(next.state.live, {});
  assert.equal(next.state.theme, 'dark'); assert.equal(next.state.compact, true);
});

test('重建 worker 对已被原生关闭的 tab 做校对，保留固定入口', async () => {
  const { fake, send } = await system(); const id = await addPin(send);
  const result = await send({ type: 'open', id }); fake.tabs.delete(result.state.live[id].tabId);
  const next = await createController(fake.api).handle({ windowId: 1, action: { type: 'connect' } });
  assert.ok(M.getEntity(next.state, id)); assert.equal(next.state.live[id], undefined);
});

test('新窗口不会隐式接管；显式接管保留旧窗口网页、释放临时归属', async () => {
  const { fake, send } = await system(); const id = await addPin(send);
  const opened = await send({ type: 'open', id }); const tabId = opened.state.live[id].tabId;
  assert.equal((await send({ type: 'connect' }, 2)).managed, false);
  await assert.rejects(send({ type: 'close', id }, 2), /先在设置/);
  const next = await send({ type: 'takeover' }, 2);
  assert.equal(next.windowId, 2); assert.ok(fake.tabs.has(tabId));
  assert.equal(next.state.live[id], undefined); assert.ok(M.getEntity(next.state, id));
  assert.equal(fake.records.filter(record => record[0] === 'tabs.remove').length, 0);
});

test('页面移出管理窗口只解绑，不会从侧栏误关另一个窗口的网页', async () => {
  const { fake, send, controller } = await system(); const id = await addPin(send);
  const result = await send({ type: 'open', id }); const tabId = result.state.live[id].tabId;
  fake.tabs.get(tabId).windowId = 2;
  await send({ type: 'close', id });
  assert.ok(fake.tabs.has(tabId)); assert.equal(fake.records.filter(record => record[0] === 'tabs.remove').length, 0);
  await controller.event('detached', tabId);
});

test('原生 tab 替换 ID 时按事件继承绑定，不依靠 URL 匹配', async () => {
  const { fake, send } = await system(); const id = await addPin(send);
  const opened = await send({ type: 'open', id }); const oldId = opened.state.live[id].tabId;
  const tab = { ...fake.tabs.get(oldId), id: 900 }; fake.tabs.delete(oldId); fake.tabs.set(tab.id, tab);
  const restarted = createController(fake.api);
  await restarted.event('replaced', oldId, tab.id);
  const next = await restarted.handle({ windowId: 1, action: { type: 'connect' } });
  assert.equal(next.state.live[id].tabId, tab.id);
});

test('创建 / 关闭 Chrome API 失败不伪造成功，也不丢掉入口', async () => {
  const { fake, send } = await system(); const id = await addPin(send);
  fake.failures['tabs.create'] = true;
  await assert.rejects(send({ type: 'open', id }), /tabs.create failure/);
  delete fake.failures['tabs.create'];
  const opened = await send({ type: 'open', id }); const tabId = opened.state.live[id].tabId;
  fake.failures['tabs.remove'] = true;
  await assert.rejects(send({ type: 'close', id }), /tabs.remove failure/);
  assert.ok(fake.tabs.has(tabId)); assert.ok(M.getEntity((await send({ type: 'connect' })).state, id));
});

test('本地写失败拒绝删除；会话写失败保留内存绑定，重试不会重复创建', async () => {
  const { fake, send } = await system(); const id = await addPin(send);
  fake.failures['local.set'] = true;
  await assert.rejects(send({ type: 'remove', id }), /local.set failure/);
  delete fake.failures['local.set'];
  assert.ok(M.getEntity((await send({ type: 'connect' })).state, id));
  fake.failures['session.set'] = true;
  await assert.rejects(send({ type: 'open', id }), /临时标签绑定保存失败/);
  delete fake.failures['session.set']; await send({ type: 'open', id });
  assert.equal(creates(fake).length, 1);
});

test('坏持久数据不静默清空；还能导出原始备份', async () => {
  const fake = createFakeChrome(); fake.local[DATA_KEY] = { version: 99, keep: '原始数据' };
  const controller = createController(fake.api);
  await assert.rejects(controller.handle({ windowId: 1 }), /数据未被覆盖/);
  const backup = await controller.handle({ action: { type: 'export' } });
  assert.equal(backup.backup[DATA_KEY].keep, '原始数据');
  assert.equal(fake.records.filter(record => record[0] === 'local.set').length, 0);
});

test('坏 session 可明确清除，不影响持久入口或真实网页', async () => {
  const { fake, send } = await system(); const id = await addPin(send);
  const opened = await send({ type: 'open', id }); const tabId = opened.state.live[id].tabId;
  fake.session[SESSION_KEY] = { damaged: true };
  const restarted = createController(fake.api);
  await assert.rejects(restarted.handle({ windowId: 1 }), /临时标签绑定格式/);
  const next = await restarted.handle({ windowId: 1, action: { type: 'forget-session' } });
  assert.ok(M.getEntity(next.state, id)); assert.equal(next.state.live[id], undefined); assert.ok(fake.tabs.has(tabId));
});

test('拒绝脚本 URL、登录凭据、坏 ID / 名称 / 文件夹和排序方向', async () => {
  const { fake, send } = await system();
  for (const url of ['javascript:alert(1)', 'file:///tmp/private', 'chrome://settings', 'https://user:password@example.org/']) {
    assert.equal(safeHttp(url), null);
    await assert.rejects(send({ type: 'add', kind: 'pin', title: '不安全', url }), /地址/);
  }
  for (const action of [{ type: 'rename', id: '__proto__', title: 'bad' }, { type: 'rename', id: 'toString', title: 'bad' }, { type: 'add-folder', title: ' ' }, { type: 'add-space', title: 'A'.repeat(61) }, { type: 'move', id: 'missing', direction: 4 }, { type: 'add', kind: 'pin', title: 'bad', url: 'https://example.org', folderId: 'missing' }]) await assert.rejects(send(action));
  const damaged = M.createEmptyState();
  damaged.favorites.push({ id: 'toString', title: 'bad', homeUrl: 'https://example.org', icon: 'link', color: 'green' });
  assert.equal(validState(damaged), false);
  assert.equal(creates(fake).length, 0);
});

test('关闭管理窗口释放 session；其他窗口事件不会混入 Today', async () => {
  const { fake, send, controller } = await system();
  await controller.event('created', 20, fake.tabs.get(20));
  assert.equal(M.currentSpace((await send({ type: 'connect' })).state).today.length, 0);
  fake.windows.delete(1); await controller.event('window-removed', 1);
  assert.equal((await send({ type: 'connect' }, 2)).windowId, 2);
});

test('MV3 同步注册事件、限制消息来源，串起 panel -> worker -> tabs -> 广播', async () => {
  const fake = createFakeChrome(); loadWorker(fake);
  assert.equal(fake.api.commands.onCommand.listeners.size, 1);
  assert.equal(fake.api.tabs.onReplaced.listeners.size, 1);
  assert.equal(fake.api.tabs.onCreated.listeners.size, 1);
  assert.ok(fake.records.some(record => record[0] === 'sidePanel'));
  let rejected;
  fake.api.runtime.onMessage.dispatch({ scope: 'arclike:command', windowId: 1 }, { id: 'not-this-extension', url: 'https://evil.example' }, result => { rejected = result; });
  assert.equal(rejected.ok, false);
  const send = action => fake.api.runtime.sendMessage({ scope: 'arclike:command', windowId: 1, action });
  assert.equal((await send({ type: 'connect' })).ok, true);
  const added = await send({ type: 'add', kind: 'pin', title: '集成', url: 'https://example.org/' });
  const id = M.currentSpace(added.state).pins[0].id;
  const opened = await send({ type: 'open', id });
  assert.equal(opened.ok, true); assert.ok(opened.state.live[id].tabId);
  const settled = await send({ type: 'connect' });
  assert.equal(M.currentSpace(settled.state).today.length, 0, 'onCreated must not duplicate a persistent binding');
  assert.equal(creates(fake).length, 1);
});

test('闭合侧栏上下文中的冷启动、循环边界、并发方向及单工作区', async () => {
  const fake = createFakeChrome(), controller = createController(fake.api);
  const cycle = direction => controller.handle({ windowId: 1, action: { type: 'cycle-space', direction } });
  assert.equal((await cycle(-1)).state.currentSpaceId, 'work');
  assert.equal((await cycle(1)).state.currentSpaceId, 'daily');
  const results = await Promise.all([cycle(1), cycle(1)]);
  assert.deepEqual(results.map(result => result.state.currentSpaceId), ['work', 'daily']);
  const restarted = createController(fake.api);
  assert.equal((await restarted.handle({ windowId: 1, action: { type: 'cycle-space', direction: 1 } })).state.currentSpaceId, 'work');
  assert.equal(creates(fake).length, 0);
  assert.ok(fake.local[DATA_KEY].spaces.every(space => !space.today.length));
  const single = createFakeChrome(); single.local[DATA_KEY] = M.createEmptyState(); single.local[DATA_KEY].spaces = single.local[DATA_KEY].spaces.slice(0, 1);
  const one = createController(single.api);
  for (const direction of [-1, 1]) assert.equal((await one.handle({ windowId: 1, action: { type: 'cycle-space', direction } })).state.currentSpaceId, 'daily');
});

test('快捷键先到、旧界面保存消息后到：拒绝跨区提交，显式切区和全局设置不受影响', async () => {
  const { fake, controller, send } = await system();
  const action = { type: 'add', kind: 'pin', title: '原工作区草稿', url: 'https://example.org/start' };
  const cycle = send({ type: 'cycle-space', direction: 1 });
  const delayedSave = controller.handle({ windowId: 1, spaceId: 'daily', action });
  await cycle;
  await assert.rejects(delayedSave, /工作区已变化/);
  assert.ok(fake.local[DATA_KEY].spaces.every(space => !space.pins.length));
  const saved = await controller.handle({ windowId: 1, spaceId: 'work', action });
  assert.equal(M.currentSpace(saved.state).pins[0].title, action.title);
  assert.equal(creates(fake).length, 0);
  assert.equal((await controller.handle({ windowId: 1, spaceId: 'daily', action: { type: 'switch', id: 'daily' } })).state.currentSpaceId, 'daily');
  assert.equal((await controller.handle({ windowId: 1, spaceId: 'daily', action: { type: 'theme', value: 'dark' } })).state.theme, 'dark');
});

test('循环复用目标工作区页面，不关页、不重建、不重置当前导航或绑定', async () => {
  const { fake, send } = await system();
  const daily = await addPin(send); await send({ type: 'open', id: daily });
  await send({ type: 'switch', id: 'work' });
  const work = await addPin(send); const opened = await send({ type: 'open', id: work });
  const tabId = opened.state.live[work].tabId;
  await fake.api.tabs.update(tabId, { url: 'https://example.org/child' });
  await send({ type: 'switch', id: 'daily' });
  const result = await send({ type: 'cycle-space', direction: 1 });
  assert.equal(result.state.currentSpaceId, 'work'); assert.equal(fake.tabs.get(tabId).active, true);
  assert.equal(result.state.live[work].tabId, tabId); assert.ok(result.state.live[daily]);
  assert.equal(result.state.live[work].url, 'https://example.org/child');
  assert.equal(M.getEntity(result.state, work).homeUrl, 'https://example.org/start');
  assert.equal(creates(fake).length, 2);
  assert.equal(fake.records.filter(record => ['tabs.remove', 'session.remove'].includes(record[0])).length, 0);
});

test('循环不隐式接管其他窗口；无效方向、无痕和非普通窗口被拒绝', async () => {
  const { fake, send } = await system(); const id = await addPin(send); await send({ type: 'open', id });
  const before = structuredClone(fake.session[SESSION_KEY]);
  await assert.rejects(send({ type: 'cycle-space', direction: 1 }, 2), /先在设置/);
  for (const direction of [0, 2, '1', undefined]) await assert.rejects(send({ type: 'cycle-space', direction }), /方向/);
  fake.windows.set(3, { id: 3, type: 'normal', incognito: true });
  fake.windows.set(4, { id: 4, type: 'popup', incognito: false });
  for (const windowId of [3, 4]) await assert.rejects(send({ type: 'cycle-space', direction: -1 }, windowId), /普通 Chrome/);
  assert.deepEqual(fake.session[SESSION_KEY], before);
  await send({ type: 'cycle-space', direction: 1 });
  await assert.rejects(send({ type: 'move', id, direction: 1 }), /只能排序当前/);
  assert.ok(fake.tabs.has(before.state.live[id].tabId));
});

test('原生 action 配置在初始化 / 安装 / 启动时启用，保留命令不被重复处理，不触碰标签或存储', async () => {
  const fake = createFakeChrome(); fake.local[DATA_KEY] = { version: 99, keep: '未被触碰' };
  const before = structuredClone(fake.local), errors = [];
  fake.api.runtime.onMessage.addListener(message => { if (message.error) errors.push(message.error); });
  loadWorker(fake);
  await Promise.all(fake.api.runtime.onInstalled.dispatch());
  await Promise.all(fake.api.runtime.onStartup.dispatch());
  const configured = fake.records.filter(record => record[0] === 'sidePanel');
  assert.equal(configured.length, 3);
  assert.ok(configured.every(record => record[1].openPanelOnActionClick === true));
  const count = fake.records.length;
  // Chrome handles _execute_action itself; this fake event must not invoke a second custom toggle.
  for (const command of ['_execute_action', 'open-panel', 'close-panel', 'unknown']) {
    await Promise.all(fake.api.commands.onCommand.dispatch(command, fake.tabs.get(10)));
  }
  assert.equal(fake.records.length, count);
  fake.failures['sidePanel.setPanelBehavior'] = true;
  await Promise.all(fake.api.runtime.onStartup.dispatch());
  assert.ok(errors.some(error => error.includes('sidePanel.setPanelBehavior failure')));
  assert.deepEqual(fake.local, before); assert.deepEqual(fake.session, {});
  assert.equal(fake.records.filter(record => record[0].startsWith('tabs.')).length, 0);
});

test('临时页转固定 / 常用入口保留 tab ID，读取真实当前 URL 而非过时事件；支持文件夹', async () => {
  for (const type of ['pin', 'favorite']) {
    const { fake, send } = await system();
    const added = await send({ type: 'add', kind: 'today', title: '临时资料', url: 'https://example.org/first' });
    const id = M.currentSpace(added.state).today[0].id, tabId = added.state.live[id].tabId;
    fake.tabs.get(tabId).pendingUrl = 'https://example.org/current';
    const folder = M.currentSpace((await send({ type: 'add-folder', title: '资料' })).state).folders[0].id;
    const result = await send({ type, id, folderId: folder });
    assert.equal(M.getEntity(result.state, id).homeUrl, 'https://example.org/current');
    assert.equal(M.getEntity(result.state, id).folderId, type === 'pin' ? folder : null);
    assert.equal(M.getEntity(result.state, id).lastActiveAt, undefined);
    assert.equal(result.state.live[id].tabId, tabId); assert.ok(fake.tabs.has(tabId));
    assert.equal(M.currentSpace(result.state).today.length, 0);
    await assert.rejects(send({ type, id }), /普通网页/);
    assert.equal(creates(fake).length, 1); assert.equal(fake.records.filter(record => record[0] === 'tabs.remove').length, 0);
    await send({ type: 'switch', id: 'work' });
    if (type === 'favorite') assert.ok((await send({ type: 'connect' })).state.favorites.some(item => item.id === id));
  }
});

test('拒绝跨区、关闭或不安全网址的拖放指令；坏过期设置 / 时间戳不覆盖数据', async () => {
  const { fake, send, controller } = await system();
  const added = await send({ type: 'add', kind: 'today', title: '临时', url: 'https://example.org/' });
  const id = M.currentSpace(added.state).today[0].id, tabId = added.state.live[id].tabId;
  await send({ type: 'switch', id: 'work' });
  await assert.rejects(send({ type: 'favorite', id }), /普通网页/);
  await assert.rejects(controller.handle({ windowId: 1, spaceId: 'daily', action: { type: 'pin', id } }), /工作区已变化/);
  await send({ type: 'switch', id: 'daily' });
  fake.tabs.get(tabId).url = 'https://user:password@example.org/';
  await assert.rejects(send({ type: 'pin', id }), /普通网页/);
  fake.tabs.delete(tabId); await assert.rejects(send({ type: 'favorite', id }), /普通网页/);
  for (const hours of [-1, 0, 721, 12.5, '24', null, Infinity]) await assert.rejects(send({ type: 'expiry', enabled: true, hours }), /自动过期/);
  await assert.rejects(send({ type: 'expiry', hours: 12 }), /自动过期/);
  for (const value of ['constructor', 'unknown', null, {}]) await assert.rejects(send({ type: 'theme', value }), /主题/);
  const bad = M.createEmptyState(); bad.expiryHours = '24'; assert.equal(validState(bad), false);
  const malformed = M.createEmptyState(); malformed.lastActiveId = 'unknown'; malformed.spaces[0].today = null;
  assert.equal(validState(malformed, true), false, 'Validate shape before resolving activity IDs');
  const transient = structuredClone(fake.session[SESSION_KEY].state);
  M.getEntity(transient, id).lastActiveAt = -1; assert.equal(validState(transient, true), false);
});

test('自动过期默认关闭；24h 边界，仅清理 Today，保留固定与常用入口', async () => {
  const { fake, send, controller } = await system();
  const old = await send({ type: 'add', kind: 'today', title: '闲置', url: 'https://example.org/old' });
  const id = M.currentSpace(old.state).today[0].id;
  const pin = await addPin(send), favorite = await addPin(send, 'favorite');
  await send({ type: 'open', id: pin }); await send({ type: 'open', id: favorite });
  fake.advance(25 * 3600000); await controller.expire();
  assert.ok(fake.tabs.has(old.state.live[id].tabId), 'Disabled policy must never close tabs');
  await send({ type: 'expiry', enabled: true, hours: 24 }); await controller.expire();
  assert.ok(!fake.tabs.has(old.state.live[id].tabId));
  const state = (await send({ type: 'connect' })).state;
  assert.ok(M.getEntity(state, pin) && M.getEntity(state, favorite));
  assert.equal(M.getEntity(state, id), undefined); assert.equal(fake.local[DATA_KEY].expiryHours, 24);
  const young = await send({ type: 'add', kind: 'today', title: '边界', url: 'https://example.org/young' });
  const youngId = M.currentSpace(young.state).today[0].id;
  await send({ type: 'open', id: favorite });
  fake.advance(24 * 3600000 - 1); await controller.expire(); assert.ok(M.getEntity((await send({ type: 'connect' })).state, youngId));
  fake.advance(1); await controller.expire(); assert.ok(!fake.tabs.has(young.state.live[youngId].tabId));
});

test('过期跳过当前 / 原生固定 / 发声 / 加载 / 不可自动丢弃页面，移出窗口只解绑', async () => {
  const { fake, send, controller } = await system(); const kept = [];
  for (const flags of [{ active: true }, { pinned: true }, { audible: true }, { status: 'loading' }, { autoDiscardable: false }]) {
    const added = await send({ type: 'add', kind: 'today', title: '保护', url: 'https://example.org/kept' });
    const id = M.currentSpace(added.state).today.at(-1).id; kept.push({ id, tabId: added.state.live[id].tabId, flags });
  }
  const moved = await send({ type: 'add', kind: 'today', title: '已移出', url: 'https://example.org/moved' });
  const movedId = M.currentSpace(moved.state).today.at(-1).id, movedTab = moved.state.live[movedId].tabId;
  fake.tabs.get(movedTab).windowId = 2;
  for (const tab of fake.tabs.values()) if (tab.windowId === 1) tab.active = false;
  for (const page of kept) Object.assign(fake.tabs.get(page.tabId), page.flags);
  await send({ type: 'expiry', enabled: true, hours: 24 }); fake.advance(25 * 3600000); await controller.expire();
  for (const page of kept) assert.ok(fake.tabs.has(page.tabId), JSON.stringify(page.flags));
  assert.ok(fake.tabs.has(movedTab), 'Do not close a tab in another window');
  assert.equal(M.getEntity((await send({ type: 'connect' })).state, movedId), undefined);
});

test('长时间选中后离开再计时；后台改标题不续期，Worker 重建保留时间戳', async () => {
  const { fake, send, controller } = await system();
  const added = await send({ type: 'add', kind: 'today', title: '长阅读', url: 'https://example.org/read' });
  const id = M.currentSpace(added.state).today[0].id, tabId = added.state.live[id].tabId;
  await send({ type: 'expiry', enabled: true, hours: 24 }); fake.advance(25 * 3600000);
  await send({ type: 'switch', id: 'work' });
  await fake.api.tabs.update(11, { active: true }); await controller.event('activated', 11, { windowId: 1 });
  await controller.expire(); assert.ok(fake.tabs.has(tabId), 'Time starts when leaving the active page');
  fake.advance(12 * 3600000); fake.tabs.get(tabId).title = '后台更新';
  await controller.event('updated', tabId, fake.tabs.get(tabId));
  const restarted = createController(fake.api, undefined, fake.now);
  fake.advance(12 * 3600000); await restarted.expire(); assert.ok(!fake.tabs.has(tabId));
});

test('过期检查期间收到用户激活事件，不关闭刚选中的页面', async () => {
  const { fake, send, controller } = await system();
  const old = await send({ type: 'add', kind: 'today', title: '正在选中', url: 'https://example.org/select' });
  const id = M.currentSpace(old.state).today[0].id, tabId = old.state.live[id].tabId;
  await send({ type: 'new-tab' }); await send({ type: 'expiry', enabled: true, hours: 24 }); fake.advance(25 * 3600000);
  const get = fake.api.tabs.get; let activation, once = true;
  fake.api.tabs.get = async checked => {
    const snapshot = await get(checked);
    if (checked === tabId && once) {
      once = false;
      for (const tab of fake.tabs.values()) if (tab.windowId === 1) tab.active = false;
      fake.tabs.get(tabId).active = true;
      activation = controller.event('activated', tabId, { windowId: 1 });
    }
    return snapshot;
  };
  await controller.expire(); await activation;
  assert.ok(fake.tabs.has(tabId)); assert.equal(fake.records.filter(record => record[0] === 'tabs.remove').length, 0);
});

test('旧会话缺少访问时间时从升级时刻起算，不立即关闭；到期后仍可清理', async () => {
  const { fake, send } = await system();
  const old = await send({ type: 'add', kind: 'today', title: '旧数据', url: 'https://example.org/legacy' });
  const id = M.currentSpace(old.state).today[0].id, tabId = old.state.live[id].tabId;
  await send({ type: 'new-tab' }); await send({ type: 'expiry', enabled: true, hours: 24 });
  for (const space of fake.session[SESSION_KEY].state.spaces) for (const item of space.today) delete item.lastActiveAt;
  fake.advance(365 * 24 * 3600000);
  const restarted = createController(fake.api, undefined, fake.now);
  await restarted.getExpiryHours(); await restarted.expire(); assert.ok(fake.tabs.has(tabId));
  assert.equal(fake.session[SESSION_KEY].state.spaces[0].today.find(item => item.id === id).lastActiveAt, fake.now());
  fake.advance(24 * 3600000); await restarted.expire(); assert.ok(!fake.tabs.has(tabId));
});

test('过期关闭失败保留页面 / 入口；会话写失败后已关闭状态可重试，先固定的页面不被并发清理', async () => {
  const { fake, send, controller } = await system();
  const old = await send({ type: 'add', kind: 'today', title: '失败重试', url: 'https://example.org/old' });
  const id = M.currentSpace(old.state).today[0].id, tabId = old.state.live[id].tabId;
  const keep = await send({ type: 'add', kind: 'today', title: '先固定', url: 'https://example.org/keep' });
  const keepId = M.currentSpace(keep.state).today.at(-1).id;
  await send({ type: 'expiry', enabled: true, hours: 24 }); fake.advance(25 * 3600000);
  await Promise.all([send({ type: 'pin', id: keepId }), controller.expire()]);
  assert.ok(fake.tabs.has(keep.state.live[keepId].tabId));
  // Re-create an old inactive page for independent failure checks.
  const added = await send({ type: 'add', kind: 'today', title: '失败重试', url: 'https://example.org/retry' });
  const retryId = M.currentSpace(added.state).today.at(-1).id, retryTab = added.state.live[retryId].tabId;
  await send({ type: 'open', id: keepId }); fake.advance(25 * 3600000);
  fake.failures['tabs.remove'] = true; await assert.rejects(controller.expire(), /tabs.remove failure/);
  assert.ok(fake.tabs.has(retryTab)); assert.ok(M.getEntity((await send({ type: 'connect' })).state, retryId));
  delete fake.failures['tabs.remove']; fake.failures['session.set'] = true;
  await assert.rejects(controller.expire(), /临时标签绑定保存失败/); assert.ok(!fake.tabs.has(retryTab));
  delete fake.failures['session.set']; const result = await send({ type: 'connect' });
  assert.equal(M.getEntity(result.state, retryId), undefined); assert.ok(M.getEntity(result.state, keepId));
  assert.ok(!fake.tabs.has(tabId)); assert.equal(M.getEntity(result.state, id), undefined);
});

test('Alarm 接线只在开启后创建；关闭清理、丢失后重建、创建失败可重试，不抢先校对替换 ID', async () => {
  const fake = createFakeChrome(); loadWorker(fake);
  const send = action => fake.api.runtime.sendMessage({ scope: 'arclike:command', windowId: 1, action });
  await send({ type: 'connect' }); assert.equal(fake.alarms.size, 0); assert.equal(fake.api.alarms.onAlarm.listeners.size, 1);
  const old = await send({ type: 'add', kind: 'today', title: '过期', url: 'https://example.org/old' });
  const id = M.currentSpace(old.state).today[0].id, tabId = old.state.live[id].tabId;
  await send({ type: 'new-tab' });
  fake.failures['alarms.create'] = true; assert.equal((await send({ type: 'expiry', enabled: true, hours: 24 })).ok, false);
  delete fake.failures['alarms.create']; await send({ type: 'connect' });
  assert.equal(fake.alarms.get('arclike-expire-today').periodInMinutes, 5);
  fake.alarms.clear(); await Promise.all(fake.api.runtime.onStartup.dispatch()); assert.equal(fake.alarms.size, 1);
  fake.advance(25 * 3600000); await Promise.all(fake.api.alarms.onAlarm.dispatch({ name: 'arclike-expire-today' }));
  assert.ok(!fake.tabs.has(tabId)); assert.equal(M.getEntity((await send({ type: 'connect' })).state, id), undefined);
  await send({ type: 'expiry', enabled: false, hours: 24 }); assert.equal(fake.alarms.size, 0);
  await send({ type: 'expiry', enabled: true, hours: 24 });
  const current = await send({ type: 'add', kind: 'today', title: '替换', url: 'https://example.org/replace' });
  const replacementId = M.currentSpace(current.state).today.at(-1).id, previousTab = current.state.live[replacementId].tabId;
  fake.tabs.set(900, { ...fake.tabs.get(previousTab), id: 900 }); fake.tabs.delete(previousTab);
  const restarted = createController(fake.api, undefined, fake.now);
  await restarted.getExpiryHours(); await restarted.event('replaced', previousTab, 900);
  assert.equal((await restarted.handle({ windowId: 1, action: { type: 'connect' } })).state.live[replacementId].tabId, 900);
});

test('过期时长默认 12h，可设参数；关闭仍保留时长，旧 0 / 24h 开关不被意外开启或缩短', async () => {
  const { fake, send, controller } = await system();
  const initial = (await send({ type: 'connect' })).state;
  assert.equal(initial.expiryHours, 12); assert.equal(initial.expiryEnabled, false); assert.equal(initial.theme, 'auto');
  const old = await send({ type: 'add', kind: 'today', title: '12h 边界', url: 'https://example.org/12h' });
  const id = M.currentSpace(old.state).today[0].id;
  await send({ type: 'new-tab' }); await send({ type: 'expiry', enabled: true, hours: 12 });
  fake.advance(12 * 3600000 - 1); await controller.expire(); assert.ok(fake.tabs.has(old.state.live[id].tabId));
  fake.advance(1); await controller.expire(); assert.ok(!fake.tabs.has(old.state.live[id].tabId));
  await send({ type: 'expiry', enabled: false, hours: 36 });
  const restarted = createController(fake.api, undefined, fake.now);
  assert.equal(await restarted.getExpiryHours(), 0);
  assert.equal((await restarted.handle({ windowId: 1, action: { type: 'connect' } })).state.expiryHours, 36);
  for (const hours of [0, 24]) {
    const legacy = createFakeChrome(), data = M.createEmptyState();
    delete data.expiryEnabled; data.expiryHours = hours; data.theme = 'dark'; legacy.local[DATA_KEY] = data;
    const migrated = (await createController(legacy.api).handle({ windowId: 1, action: { type: 'connect' } })).state;
    assert.equal(migrated.expiryEnabled, hours === 24); assert.equal(migrated.expiryHours, hours || 12);
    assert.equal(migrated.theme, 'dark'); assert.equal(legacy.local[DATA_KEY].expiryEnabled, hours === 24);
  }
  for (const value of Object.keys(M.themes)) {
    await send({ type: 'theme', value });
    assert.equal(fake.local[DATA_KEY].theme, value); assert.ok(validState(fake.local[DATA_KEY]));
  }
});

test('常用 / 固定 / Today 更换图标安全落盘，不改地址或 tab ID；关闭 / 重建 / 提升保留', async () => {
  const { fake, controller, send } = await system();
  const favorite = await addPin(send, 'favorite');
  const pin = await addPin(send);
  const { state: opened } = await send({ type: 'add', kind: 'today', title: '临时文档', url: 'https://example.org/temporary' });
  const temporary = M.currentSpace(opened).today.at(-1).id;
  await send({ type: 'open', id: favorite });
  const before = (await send({ type: 'connect' })).state;
  const records = fake.records.length;
  for (const id of [favorite, pin, temporary]) await send({ type: 'icon', id, icon: 'custom', glyph: '👩🏽‍💻', color: 'purple' });
  const after = fake.session[SESSION_KEY].state;
  assert.deepEqual(after.live, before.live);
  for (const id of [favorite, pin, temporary]) {
    assert.equal(M.getEntity(after, id).homeUrl, M.getEntity(before, id).homeUrl);
    assert.equal(M.getEntity(after, id).iconGlyph, '👩🏽‍💻');
  }
  assert.ok(!fake.records.slice(records).some(record => record[0].startsWith('tabs.')), 'Icon save must not touch real tabs');
  assert.ok(validState(fake.local[DATA_KEY])); assert.ok(validState(after, true));
  await send({ type: 'pin', id: temporary });
  await send({ type: 'close', id: favorite });
  const restored = await createController(fake.api, undefined, fake.now).handle({ windowId: 1, action: { type: 'connect' } });
  for (const id of [favorite, pin, temporary]) assert.equal(M.getEntity(restored.state, id).iconGlyph, '👩🏽‍💻');
  await send({ type: 'icon', id: favorite, icon: 'initial', color: 'green' });
  assert.equal(M.getEntity(fake.local[DATA_KEY], favorite).iconGlyph, undefined);
  const durableBefore = structuredClone(fake.local[DATA_KEY]);
  fake.failures['local.set'] = true;
  await assert.rejects(send({ type: 'icon', id: favorite, icon: 'mail', color: 'blue' }), /local.set/);
  assert.deepEqual(fake.local[DATA_KEY], durableBefore);
  fake.failures['local.set'] = false;
  for (const action of [
    { type: 'icon', id: favorite, icon: 'custom', glyph: 'AB', color: 'green' },
    { type: 'icon', id: favorite, icon: 'custom', glyph: '<img src=x>', color: 'green' },
    { type: 'icon', id: favorite, icon: '__proto__', color: 'green' },
    { type: 'icon', id: favorite, icon: 'mail', color: '__proto__' },
    { type: 'icon', id: 'missing', icon: 'mail', color: 'green' }
  ]) await assert.rejects(send(action));
  await send({ type: 'switch', id: 'work' });
  await assert.rejects(send({ type: 'icon', id: pin, icon: 'sun', color: 'orange' }), /当前工作区/);
  await assert.rejects(controller.handle({ windowId: 1, spaceId: 'daily', action: { type: 'icon', id: favorite, icon: 'sun', color: 'orange' } }), /工作区已变化/);
  await send({ type: 'icon', id: favorite, icon: 'mail', color: 'blue' });
  const damaged = structuredClone(fake.local[DATA_KEY]);
  M.getEntity(damaged, favorite).icon = 'custom'; M.getEntity(damaged, favorite).iconGlyph = 'bad';
  assert.equal(validState(damaged), false);
});

test('浏览器切区命令无需打开侧栏，前后循环落盘且拒绝跨窗口接管', async () => {
  const fake = createFakeChrome(), errors = [];
  fake.api.runtime.onMessage.addListener(message => { if (message.error) errors.push(message.error); });
  loadWorker(fake);
  await Promise.all(fake.api.commands.onCommand.dispatch('next-space', fake.tabs.get(10)));
  assert.equal(fake.local[DATA_KEY].currentSpaceId, 'work');
  await Promise.all(fake.api.commands.onCommand.dispatch('previous-space', fake.tabs.get(10)));
  assert.equal(fake.local[DATA_KEY].currentSpaceId, 'daily');
  await Promise.all(fake.api.commands.onCommand.dispatch('previous-space', fake.tabs.get(10)));
  assert.equal(fake.local[DATA_KEY].currentSpaceId, 'work');
  await Promise.all(fake.api.commands.onCommand.dispatch('next-space', fake.tabs.get(20)));
  assert.equal(fake.local[DATA_KEY].currentSpaceId, 'work'); assert.equal(fake.session[SESSION_KEY].windowId, 1);
  await Promise.all(fake.api.commands.onCommand.dispatch('next-space'));
  await Promise.all(fake.api.commands.onCommand.dispatch('previous-space', { ...fake.tabs.get(10), incognito: true }));
  assert.ok(errors.some(error => error.includes('普通 Chrome')));
  assert.equal(fake.local[DATA_KEY].currentSpaceId, 'work');
  assert.equal(fake.records.filter(record => ['tabs.create', 'tabs.remove'].includes(record[0])).length, 0);
});
