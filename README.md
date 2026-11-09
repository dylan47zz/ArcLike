# ArcLike

面向个人自用的中文 Chrome 侧栏，借鉴 Arc 的 Favorites、Pinned Tabs 和 Today。原生 HTML / CSS / JavaScript，零第三方依赖、无需构建。

**当前交付：Chrome Manifest V3 开发版 v0.1.6，可手动加载。** 已接入真实标签页和本地存储，并保留已确认的 UI 原型。没有账号、云同步或浏览历史数据库查询。项目采用 [MIT 许可证](LICENSE)，是独立项目，不隶属于 Arc、The Browser Company 或 Google。

## 手动加载开发版

需要 **Chrome 141+**（当前支持基线），首版只管理一个普通 Chrome 窗口，不支持无痕窗口。

1. 打开 `chrome://extensions`，开启右上角「开发者模式」。
2. 选择「加载已解压的扩展程序」，选中**含 `manifest.json` 的项目根目录**：

   ```text
   ArcLike/
   ```

3. 在工具栏的扩展菜单中固定 ArcLike，点击其图标打开 / 关闭侧栏。
4. 默认只有「日常 / 工作」两个工作区，Favorites、固定入口和 Today 都是空的，不会自动纳入已打开的网页。

修改代码后可在扩展管理页点击「重新加载」。卸载可能删除本地入口数据，请先从设置导出备份。

### 浏览器级快捷键

重新加载现有 ArcLike 后，在 **Chrome 有焦点**时使用以下默认组合，无须聚焦侧栏：

| 功能 | macOS | Windows / Linux |
| --- | --- | --- |
| 打开 / 关闭侧栏（同键切换） | Command + Shift + Y | Ctrl + Shift + Y |
| 上一个工作区 | Command + Shift + , | Ctrl + Shift + , |
| 下一个工作区 | Command + Shift + . | Ctrl + Shift + . |

- 同一个键：关闭时打开，已打开时关闭。快捷键触发 Chrome 原生扩展按钮，与鼠标点击图标一致，由 Chrome 判断真实可见性；不在 Worker 内猜测开关状态。鼠标关闭后再按会重新打开。**不会关闭网页或清空入口**。
- 工作区按底部顺序首尾循环；侧栏关闭时也能切区，复用目标区记住的页面，不重置其当前导航。未加载的入口不会因此自动开页。
- 首次快捷键切区可建立当前普通窗口上下文；已有管理窗口时，不会自动接管另一个窗口。在管理窗口内使用，或先在设置明确接管。
- 切区会取消过期菜单与未提交的侧栏对话框，防止把操作提交到错误工作区。已保存入口和网页不受影响。
- 可在 `chrome://extensions/shortcuts` 修改三个快捷键，其中「激活扩展程序」就是侧栏开关。v0.1.1 的独立打开 / 关闭命令已合并，旧的 Shift + U 不再使用；更新后请检查该项，必要时重新绑定 Y。Chrome / 系统保留键或其他扩展冲突时，建议键可能未分配。不是其他应用获得焦点时的系统全局快捷键。

### 侧栏布局与宽度

- 插件内不再重复显示 ArcLike 标题，只保留 Chrome 原生标题栏；搜索直接置顶。
- 固定入口空状态改成一行「暂无固定入口 / 添加入口」。Favorites 图标固定 36px，不随宽侧栏拉成大卡片。
- 从旧版升级，只移除空且未改名的默认「留白」，把默认「创作」改为「工作」；有入口、文件夹、会话标签或自定义名称的空间保留，避免丢数据。迁移只执行一次，之后自定义改名不被覆盖。
- **外框宽度由 Chrome 控制**，插件没有设置原生宽度的 API。把鼠标放在侧栏**靠网页一侧的外边缘**，出现左右调整光标后拖动；不是在绿色内容里拖动。当前核对的 Chromium 实现最小内容宽度为 360px（外框另计），达到下限后不能继续缩小；放大还受浏览器窗口空间限制。
- 内容布局会跟随 Chrome 分配的宽度，已验证 240–600px 网页视口。这不代表原生 Chrome 面板能缩到 240px；没有添加只缩小绿色区域、却保留空白外框的伪宽度滑块。

### 外观与自动适配

设置支持 **自动 / 雾青 / 松夜 / 暖沙 / 海盐 / 暮紫** 六种外观，新安装默认自动。自动模式使用浏览器提供的 `prefers-color-scheme` 和系统 `Canvas / CanvasText` 颜色，随浅 / 深色偏好变化，无需重新打开侧栏，不改变正在编辑的表单。手选外观不会被系统切换覆盖；旧版已保存的主题保留，可手动改为自动。

Chrome 原生标题栏本身仍跟随 Chrome。插件可跟随浏览器公开的浅 / 深色偏好，但 **Chrome 没有公开读取自定义主题色、背景图的扩展 API**，不能承诺完整复刻商店主题；没有增加网站访问权限。参见 [Chrome 扩展 API 列表](https://developer.chrome.com/docs/extensions/reference/api) 与 [prefers-color-scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme)。

### 首次体验

- **添加入口**：固定区的 **+** 输入名称和 http / https 起始网址，只保存、不立即打开；点击入口才打开网页。设置里的「固定当前网页」可保存当前真实页面。
- **关闭不删除**：条目旁 **× 会关闭真实 Chrome 标签页**。Favorites / 固定入口仍在，并显示未加载；再次点击会重新打开。同一入口已打开时复用其 tab ID，不重复创建。
- **返回起点**：在真实网页中导航到子页面后，入口的起始 URL 不变。条目 **··· → 返回固定起点** 会导航回该地址。
- **临时页面与拖动**：侧栏「新建标签」和管理窗口中新建的原生标签进入 Today。拖动 Today 条目到固定区（也可放到文件夹标题）或顶部常用区，即保存**真实当前 URL**，原页面与 tab ID 不变。常用入口跨工作区共享。也可用 **··· / Shift + F10 → 固定当前地址 / 设为共享常用入口**。只接受当前工作区的内部条目；外来 URL / HTML 不会自动保存，切区后旧拖动取消。Chrome 内部页可以切换 / 关闭，但不能固定。
- **明确移除**：菜单「移除固定入口…」需要确认。已打开的页面转入 Today，不会被关闭；未打开的入口直接移除。
- **组织**：底部切换 / 新建工作区，工作区菜单创建文件夹；条目菜单重命名、同层上移 / 下移、移动到文件夹。Favorites 跨工作区共享，图标默认采用本地名称首字，不请求第三方 favicon。
- **更换图标**：常用图标 **右键 → 更换图标…**；固定入口 / Today 用 **··· → 更换图标…**。支持 11 种内置图标、一个汉字 / 字母 / emoji 和五种颜色，实时预览后保存；选择「名称首字」可恢复自动显示。焦点在入口时也可 **Shift + F10** 打开菜单。只改侧栏图标，不改变起始 URL、网页或 tab ID；固定 / 常用图标随入口持久保存。Emoji 自带颜色，不会被着色。
- **搜索与设置**：焦点在侧栏时用 **/** 搜索名称或起始 URL，输入完整网址可新开页面。**Tab** 移动焦点，菜单用 **↑ / ↓ / Home / End**，**Esc** 关闭浮层。设置支持六种外观、紧凑列表、添加常用入口和导出固定入口备份。

### 临时页自动过期

**时长默认 12h，自动关页默认关闭**。在 **设置 →「闲置时长（小时）」** 设置 1–720 的整数小时，再开启「临时页自动过期」并确认风险。对管理窗口中所有工作区的 Today 生效；关闭开关不丢失已设时长。

旧版关闭状态迁移为关闭 / 12h；旧版已开启 24h 则保留开启 / 24h，不自动缩短已有规则。开启或缩短已启用的时长需确认，可能立即清理已超时页面；取消不改变原设置。

- 从最后使用 / 离开页面起算闲置时间，每 5 分钟检查；后台标题变化不续期。过期会**关闭真实 Chrome 标签并移除临时入口**，不是只从列表隐藏。
- 检查时跳过当前页、Chrome 原生固定页、发声页、加载中的页，以及 `autoDiscardable: false` 的页。固定入口 / 常用入口永不过期；把 Today 拖到固定区后即不受此规则影响。
- **无法可靠检测未保存的表单、编辑等内容**，关闭可能导致内容丢失；因此必须手动确认开启。重要内容请先保存或固定，不要用未保存内容验收。
- Worker 重建保留会话内的计时；旧会话缺少时间戳时从升级时刻起算，不立即关闭。浏览器休眠时 Alarm 可能延迟，不承诺精确到秒；重启 / 扩展重新加载后的未纳入标签不会被自动清理。
- 关闭该设置立即取消后续定时检查，但保留时长参数。没有午夜清空、归档历史或已关闭页面恢复功能。

### 已有网页、工作区与重启

- 设置中的「纳入本窗口已有页面」需要确认，只把当前窗口的现有标签纳入管理，不打开或关闭它们。
- 工作区用于组织，并激活其记住的已打开页面；**不会隐藏 / 关闭其他工作区的原生标签，不隔离 Cookie 或登录**。原生标签栏和 Chrome 外框仍由浏览器控制。
- 首版只管理一个窗口。在另一个窗口打开侧栏时，需明确「改为管理本窗口」；这会释放旧窗口的临时归属，但不关闭旧窗口的网页。
- 固定入口、文件夹、工作区和设置写入 `chrome.storage.local`；Today、tab ID 和窗口归属写入 `chrome.storage.session`。同一扩展会话内 Worker 重建可以恢复绑定。
- 浏览器重启，或扩展被重新加载 / 禁用 / 更新后，临时绑定会清空。Chrome 恢复的网页可手动纳入 Today，**不会按同 URL 自动配对旧固定入口**；点击未加载的固定入口会新开网页。
- Today 不在午夜自动清空。设置「清除临时绑定」不会删除固定入口或关闭真实网页。

### 权限与数据

只申请 `sidePanel`、`tabs`、`storage`、`alarms`；新增 `alarms` 仅用于本地过期计时。更新后需重新加载扩展，并留意 Chrome 的权限提示。Chrome 对 `tabs` 的提示较宽泛；这里用于当前标签的 ID、标题和地址，没有 `history` 权限、内容脚本或网站访问权限，没有统计上报 / 云服务。

入口名称和 URL 存在本机 Chrome 配置中，**不是加密存储**。含用户名 / 密码的 URL 被拒绝，但查询参数仍可能含敏感信息；不要固定一次性登录链接或分享未检查的备份。当前备份只导出固定入口和设置 JSON，尚不提供导入。持久数据损坏时会提示并保留原数据，不静默重置。

## UI 原型 / 本地预览

[`index.html`](index.html) 是独立可点击原型，**仍只操作虚构数据，不会打开真实网站**；可以直接用现代 Chrome 打开，也可以运行本地服务：

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

- 原型：http://127.0.0.1:4173/ — 浏览器场景 / 独立侧栏、浅色 / 深色，宽度 ≤ 580px 自动变为全高度侧栏。
- 扩展 UI 自检：http://127.0.0.1:4173/tests/extension-browser.html — 生产侧栏代码配模拟 Chrome API，可点击验证，**不操作你的真实 Chrome 标签**。
- `extension/panel.html` 在普通 HTTP / 文件页面中只提示手动加载；只有实际扩展环境才能操作 Chrome。

原型的 `localStorage` 与扩展的 `chrome.storage` 分开；原型设置里的恢复演示数据不会影响扩展入口。启动 4173 服务后即可预览。

## 检查

Node.js 22+：

```sh
node --test tests/model.test.cjs tests/extension.test.cjs
```

启动本地服务后，可打开原型自检 http://127.0.0.1:4173/tests/browser.html 和上述扩展 UI 自检。只通过本地 HTTP 运行自检，不要从安装后的扩展 URL 打开测试页。

自动浏览器检查（已安装 Chrome；服务须运行）：

```sh
node tests/run-browser.cjs
# Chrome 不在默认位置时：
node tests/run-browser.cjs "/path/to/chrome"
```

脚本使用临时独立 Chrome 配置，检查原型和生产侧栏的模拟 API 交互、原生指针 / 键盘、窄布局和直接文件打开；不安装扩展，不读取真实历史。结束后关闭该浏览器并清理配置，截图更新到 `docs/preview/`。实际加载、权限提示和 Chrome 原生 Side Panel / Worker 休眠仍需手动验收，见验证说明。

## 文件与设计

- [`manifest.json`](manifest.json)：MV3、权限、侧栏与后台入口。
- `extension/background.js` / `extension/controller.js`：同步注册 Chrome 事件、串行状态写入、真实 tab ID 绑定与存储。
- `extension/panel.html` / `extension/panel.js` / `extension/panel.css`：真实侧栏控制器和布局。
- `ui.js` / `model.js`：扩展与原型共用的安全渲染和状态模型。
- `index.html` / `app.js` / `styles.css`：原型、模拟导航和共享样式。
- [`docs/DESIGN.md`](docs/DESIGN.md)：设计规则与实现边界。
- [`docs/VALIDATION.md`](docs/VALIDATION.md)：自动检查、未覆盖项与手动验收清单。
- [`docs/preview/extension-panel.png`](docs/preview/extension-panel.png)、[`extension-empty.png`](docs/preview/extension-empty.png)：生产侧栏代码的模拟 API 截图，后一张展示紧凑初始化布局。另有 [`暖沙`](docs/preview/theme-sand.png)、[`海盐`](docs/preview/theme-ocean.png)、[`暮紫`](docs/preview/theme-lavender.png) 外观预览。
- [`图标编辑预览`](docs/preview/icon-editor.png)：常用入口右键后的内置图标、字 / emoji 与颜色编辑界面。
- [`desktop.png`](docs/preview/desktop.png)、[`side-panel.png`](docs/preview/side-panel.png)、[`dark-panel.png`](docs/preview/dark-panel.png)：已确认原型截图。

## 开源与发布

- [GitHub 仓库](https://github.com/dylan47zz/ArcLike) · [v0.1.6 开发版下载](https://github.com/dylan47zz/ArcLike/releases/tag/v0.1.6)。
- [MIT 许可证](LICENSE) · [隐私政策](PRIVACY.md) · [GitHub / 商店发布清单](docs/STORE.md)。
- `python3 scripts/prepare-release.py` 生成 `dist/ArcLike-0.1.6.zip` 商店包和 `dist/ArcLike-0.1.6-source.zip` 公开源码包，及 SHA-256 校验文件。
- 商店包只含运行资源及许可证；源码包排除私有交接、研究目录、环境文件与旧 Git 历史。发布到 GitHub 时使用新的公开历史，不直接推送原工作目录。
- 这是一份开发版源码，不代表已经通过 Chrome Web Store 审核；发布者须完成账号与真实扩展验收，见发布清单。

## 后续范围

没有实现账号 / 云同步、备份导入、午夜归档、跨窗口连续管理、浏览器重启后的固定入口自动重绑或拖放排序；当前拖放用于 Today 晋升固定 / 常用入口，排序仍采用明确的上移 / 下移操作。不会伪装成可完全定制 Chrome 外框的浏览器。

实现与限制见 [设计说明](docs/DESIGN.md) 和 [验证清单](docs/VALIDATION.md)。
