/* Long-lived entries and live pages are deliberately separate. */
(function (root) {
  const entry = (id, title, homeUrl, icon, color, folderId = null) => ({ id, title, homeUrl, icon, color, folderId });
  const themes = { auto: '自动 · 跟随明暗', light: '雾青 · 浅色', dark: '松夜 · 深色', sand: '暖沙', ocean: '海盐', lavender: '暮紫' };
  const validExpiryHours = hours => Number.isSafeInteger(hours) && hours >= 1 && hours <= 720;
  const entryIcons = { initial: '名称首字 · 自动', mail: '邮件', calendar: '日历', studio: '创作', code: '代码', check: '待办', grid: '网格', sun: '太阳', type: '文字', map: '地图', link: '链接', folder: '文件夹', custom: '自定义字 / emoji' };
  const iconColors = { green: '草绿 / 主题色', blue: '湖蓝', orange: '暖棕', purple: '淡紫', ink: '石墨' };
  const glyphs = new Intl.Segmenter('zh', { granularity: 'grapheme' });
  const validIconGlyph = value => typeof value === 'string' && value.length <= 32 && /[\p{L}\p{N}\p{P}\p{S}]/u.test(value) && !/[\p{White_Space}\p{Cc}\p{Cs}]/u.test(value) && [...glyphs.segment(value)].length === 1;
  const validIcon = (value, glyph) => typeof value === 'string' && Object.hasOwn(entryIcons, value) && (value === 'custom' ? validIconGlyph(glyph) : glyph === undefined);
  function createState() {
    return {
      version: 1, currentSpaceId: 'daily', theme: 'light', compact: false,
      favorites: [
        entry('mail', '星邮', 'https://mail.example/inbox', 'mail', 'blue'),
        entry('calendar', '小日历', 'https://calendar.example/week', 'calendar', 'orange'),
        entry('studio', '造物', 'https://studio.example', 'studio', 'purple'),
        entry('code', '代码仓库', 'https://code.example', 'code', 'ink')
      ],
      spaces: [
        { id: 'daily', name: '日常', emblem: '✳', color: 'green', caption: '让想法慢慢生长', activeId: 'notebook',
          folders: [{ id: 'design', name: '灵感与设计', collapsed: false }],
          pins: [entry('plan', '本周计划', 'https://plan.example/week', 'check', 'green'), entry('notebook', '山海 · 设计笔记', 'https://shanhai.example/notebook', 'shanhai', 'green', 'design'), entry('references', '界面参考集', 'https://reference.example/collection', 'grid', 'purple', 'design')],
          today: [entry('color', '色彩与情绪', 'https://reading.example/color', 'sun', 'orange'), entry('type', '中文排版的呼吸感', 'https://reading.example/type', 'type', 'ink'), entry('walk', '找一条周末散步路线', 'https://maps.example/walk', 'map', 'blue')]
        },
        { id: 'work', name: '创作', emblem: '◈', color: 'purple', caption: '留一点空间给专注', activeId: null,
          folders: [{ id: 'project', name: '项目资料', collapsed: false }],
          pins: [entry('board', '青屿 · 项目看板', 'https://qingyu.example/board', 'grid', 'purple', 'project'), entry('brief', '创作简报', 'https://qingyu.example/brief', 'type', 'green', 'project')],
          today: [entry('notes', '本周创作随记', 'https://notes.example/week', 'type', 'orange')]
        },
        { id: 'blank', name: '留白', emblem: '☼', color: 'orange', caption: '从一个新念头开始', activeId: null, folders: [], pins: [], today: [] }
      ],
      live: { notebook: { url: 'https://shanhai.example/notebook' }, plan: { url: 'https://plan.example/week' }, color: { url: 'https://reading.example/color' }, type: { url: 'https://reading.example/type' }, walk: { url: 'https://maps.example/walk' }, notes: { url: 'https://notes.example/week' } }
    };
  }
  function createEmptyState() {
    const state = createState();
    state.favorites = [];
    state.live = {};
    state.defaultSpacesVersion = 2;
    state.expiryEnabled = false;
    state.expiryHours = 12;
    state.theme = 'auto';
    state.spaces = state.spaces.filter(space => space.id !== 'blank');
    state.spaces.find(space => space.id === 'work').name = '工作';
    for (const space of state.spaces) {
      space.pins = []; space.today = []; space.folders = []; space.activeId = null;
    }
    return state;
  }
  const currentSpace = state => state.spaces.find(space => space.id === state.currentSpaceId);
  const getEntity = (state, id) => state.favorites.find(item => item.id === id) || state.spaces.flatMap(space => [...space.pins, ...space.today]).find(item => item.id === id);
  function validUrl(value) {
    try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
  }
  function reduce(state, action) {
    const next = structuredClone(state);
    const space = currentSpace(next);
    const item = getEntity(next, action.id);
    switch (action.type) {
      case 'switch':
        if (next.spaces.some(candidate => candidate.id === action.id)) next.currentSpaceId = action.id;
        break;
      case 'open':
        if (!item) break;
        next.live[item.id] ||= { url: item.homeUrl };
        space.activeId = item.id;
        break;
      case 'close':
        if (!item) break;
        delete next.live[item.id];
        if (next.lastActiveId === item.id) next.lastActiveId = null;
        for (const candidate of next.spaces) {
          candidate.today = candidate.today.filter(tab => tab.id !== item.id);
          if (candidate.activeId === item.id) candidate.activeId = null;
        }
        break;
      case 'navigate':
        if (item && next.live[item.id] && validUrl(action.url)) next.live[item.id].url = validUrl(action.url);
        break;
      case 'home':
        if (item) { next.live[item.id] = { url: item.homeUrl }; space.activeId = item.id; }
        break;
      case 'rename': {
        const target = item || next.spaces.find(candidate => candidate.id === action.id) || space.folders.find(folder => folder.id === action.id);
        if (target && action.title?.trim()) target[item ? 'title' : 'name'] = action.title.trim().slice(0, 60);
        break;
      }
      case 'icon':
        if (item && [...next.favorites, ...space.pins, ...space.today].some(candidate => candidate.id === item.id) && validIcon(action.icon, action.glyph) && typeof action.color === 'string' && Object.hasOwn(iconColors, action.color)) {
          item.icon = action.icon; item.color = action.color;
          if (action.icon === 'custom') item.iconGlyph = action.glyph;
          else delete item.iconGlyph;
        }
        break;
      case 'move': {
        const list = next.favorites.some(candidate => candidate.id === action.id) ? next.favorites : space.pins.some(candidate => candidate.id === action.id) ? space.pins : space.today;
        const peers = list.filter(candidate => candidate.folderId === item?.folderId);
        const index = peers.findIndex(candidate => candidate.id === action.id);
        const other = peers[index + action.direction];
        if (index >= 0 && item && other) { const a = list.findIndex(candidate => candidate.id === item.id); const b = list.findIndex(candidate => candidate.id === other.id); [list[a], list[b]] = [list[b], list[a]]; }
        break;
      }
      case 'remove':
        if (!item || !(next.favorites.some(candidate => candidate.id === item.id) || next.spaces.some(candidate => candidate.pins.some(pin => pin.id === item.id)))) break;
        next.favorites = next.favorites.filter(candidate => candidate.id !== item.id);
        for (const candidate of next.spaces) {
          candidate.pins = candidate.pins.filter(pin => pin.id !== item.id);
          if (candidate.activeId === item.id && (candidate !== space || !next.live[item.id])) candidate.activeId = null;
        }
        if (next.live[item.id]) {
          const temporary = { ...item, folderId: null };
          delete temporary.lastActiveAt;
          space.today.push(temporary);
        } else if (next.lastActiveId === item.id) next.lastActiveId = null;
        break;
      case 'pin': case 'favorite':
        if (space.today.some(tab => tab.id === action.id)) {
          space.today = space.today.filter(tab => tab.id !== action.id);
          const fixed = { ...item, homeUrl: next.live[item.id]?.url || item.homeUrl, folderId: null };
          delete fixed.lastActiveAt;
          if (action.type === 'favorite') next.favorites.push(fixed);
          else space.pins.push(fixed);
        }
        break;
      case 'folder': {
        const folder = space.folders.find(candidate => candidate.id === action.id);
        if (folder) folder.collapsed = !folder.collapsed;
        break;
      }
      case 'add': {
        if (!action.title?.trim() || !validUrl(action.url) || !action.id || getEntity(next, action.id)) break;
        const added = entry(action.id, action.title.trim().slice(0, 60), validUrl(action.url), 'link', 'green', action.folderId || null);
        if (action.kind === 'favorite') next.favorites.push(added);
        else if (action.kind === 'pin') space.pins.push(added);
        else { space.today.push(added); next.live[added.id] = { url: added.homeUrl }; space.activeId = added.id; }
        break;
      }
      case 'add-folder':
        if (action.title?.trim() && action.id && !space.folders.some(folder => folder.id === action.id)) {
          space.folders.push({ id: action.id, name: action.title.trim().slice(0, 60), collapsed: false });
        }
        break;
      case 'add-space':
        if (action.title?.trim() && action.id && !next.spaces.some(candidate => candidate.id === action.id)) {
          next.spaces.push({ id: action.id, name: action.title.trim().slice(0, 60), emblem: '◇', color: 'green', caption: '从一个新念头开始', activeId: null, folders: [], pins: [], today: [] });
          next.currentSpaceId = action.id;
        }
        break;
      case 'theme': if (typeof action.value === 'string' && Object.hasOwn(themes, action.value)) next.theme = action.value; break;
      case 'compact': next.compact = Boolean(action.value); break;
    }
    return next;
  }
  const model = { createState, createEmptyState, currentSpace, getEntity, validUrl, validExpiryHours, themes, entryIcons, iconColors, validIconGlyph, validIcon, reduce };
  if (typeof module !== 'undefined' && module.exports) module.exports = model;
  else root.ArcModel = model;
})(typeof globalThis !== 'undefined' ? globalThis : this);
