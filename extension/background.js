/* MV3 listeners are registered synchronously so Chrome can wake this worker. */
importScripts('../model.js', 'controller.js');
const broadcast = payload => chrome.runtime.sendMessage({ scope: 'arclike:update', ...payload }).catch(() => {});
const controller = ArcExtension.createController(chrome, broadcast);
const report = error => broadcast({ error: error.message || '浏览器操作失败。' });
// _execute_action uses this native toggle; Chrome owns visibility, not the worker.
const configurePanel = () => chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(report);
chrome.runtime.onInstalled.addListener(configurePanel);
chrome.runtime.onStartup.addListener(configurePanel);
configurePanel();
const EXPIRY_ALARM = 'arclike-expire-today';
async function configureExpiry() {
  const hours = await controller.getExpiryHours();
  if (hours > 0) {
    if (!await chrome.alarms.get(EXPIRY_ALARM)) await chrome.alarms.create(EXPIRY_ALARM, { periodInMinutes: 5 });
  } else await chrome.alarms.clear(EXPIRY_ALARM);
}
chrome.runtime.onInstalled.addListener(() => configureExpiry().catch(report));
chrome.runtime.onStartup.addListener(() => configureExpiry().catch(report));
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === EXPIRY_ALARM) return controller.expire().catch(report);
});
configureExpiry().catch(report);
chrome.commands.onCommand.addListener((command, tab) => {
  if (!['previous-space', 'next-space'].includes(command)) return;
  if (!Number.isInteger(tab?.windowId) || tab.windowId < 0 || tab.incognito) return report(new Error('快捷键需要在普通 Chrome 标签页窗口中使用。'));
  return controller.handle({ windowId: tab.windowId, action: { type: 'cycle-space', direction: command === 'previous-space' ? -1 : 1 } }).catch(report);
});
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.scope !== 'arclike:command') return;
  if (sender.id !== chrome.runtime.id || sender.url?.split(/[?#]/)[0] !== chrome.runtime.getURL('extension/panel.html')) {
    reply({ ok: false, error: '不允许从此页面操作 ArcLike。' });
    return;
  }
  controller.handle(message).then(async result => {
    if (['expiry', 'connect', 'forget-session'].includes(message.action?.type)) await configureExpiry();
    reply({ ok: true, ...result });
  }).catch(error => reply({ ok: false, error: error.message || '浏览器操作失败。' }));
  return true;
});
const event = (type, id, detail) => controller.event(type, id, detail).catch(report);
chrome.tabs.onCreated.addListener(tab => event('created', tab.id, tab));
chrome.tabs.onUpdated.addListener((id, _change, tab) => event('updated', id, tab));
chrome.tabs.onRemoved.addListener(id => event('removed', id));
chrome.tabs.onActivated.addListener(info => event('activated', info.tabId, info));
chrome.tabs.onDetached.addListener(id => event('detached', id));
chrome.tabs.onAttached.addListener(id => event('attached', id));
chrome.tabs.onReplaced.addListener((addedId, removedId) => event('replaced', removedId, addedId));
chrome.windows.onRemoved.addListener(id => event('window-removed', id));
