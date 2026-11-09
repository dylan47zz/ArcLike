# ArcLike 验证记录

环境：2026-11-09，macOS，Node.js v26.13.0，Google Chrome 157.0.8103.39。测试使用独立临时 Chrome 配置，没有读取用户真实浏览历史，也没有安装 ArcLike 扩展。

**代码已接入 Chrome API；自动验证中的 Chrome API 使用模拟器。真实扩展加载、授权和原生 Side Panel 尚未验证。** 两者不混为同一结果。

## 已通过的自动检查

| 检查 | 结果 / 口径 |
| --- | --- |
| 纯模型 `tests/model.test.cjs` | 15 / 15 |
| API / 存储 / Worker / 浏览器命令接线 `tests/extension.test.cjs` | 42 / 42，内存 Chrome API 模拟器 |
| 原型浏览器自检 `tests/browser.html` | 17 / 17 |
| 生产侧栏自检 `tests/extension-browser.html` | 14 / 14；实际面板、后台代码与模拟 API |
| CDP 原生指针，原型 | 子页面导航、返回起点、关闭保留、重开通过 |
| CDP 原生指针，生产侧栏 | 关闭 / 重开，恰好创建一个模拟 tab 通过；不是操作真实 Chrome 标签 |
| CDP 原生 HTML 拖动 | 真实鼠标启动 + Chrome 可信 drag/drop：Today → Pinned / Favorites，保留模拟 tab ID；不是安装后扩展验收 |
| CDP 外观偏好模拟 | 浅 / 深色切换时自动模式跟随、已存偏好仍为 auto，输入框焦点与未提交值保留；手选海盐不随系统覆盖。不是实机 Chrome 商店主题验收 |
| CDP 原生 Tab 键 | 原型和生产侧栏均有可见焦点描边 |
| 网页视口 × 720px | 原型 280 / 320 / 360px；生产侧栏 240 / 280 / 320 / 360 / 480 / 600px，六主题空状态与长名称无横向溢出，底部切换器可见 |
| 多工作区 / 长名称 | 当前图标保持可见，长名称不撑破原型；生产侧栏长名称也通过 |
| `file://` 原型 | 脚本加载、点击和模拟导航通过 |
| 页面资源观测 | 只有本地 HTTP、项目文件及内嵌 data 资源；测试未访问真实目标网站 |
| Manifest 静态资源 | 后台 / 面板入口存在；16 / 32 / 48 / 128px PNG 尺寸正确 |
| JavaScript `node --check` | 模型、共享渲染、原型、扩展和测试脚本全部通过 |
| `git diff --check` | 通过；新文件另做文本空白检查 |

命令见 [README](../README.md)。`tests/run-browser.cjs` 会更新 `docs/preview/desktop.png`、`side-panel.png`、`dark-panel.png`、`extension-panel.png` 、`extension-empty.png` 和 `theme-sand.png / theme-ocean.png / theme-lavender.png`、`icon-editor.png`。前三张是已确认的虚构原型；其余是生产侧栏代码配模拟 Chrome API，空状态图为 360px 内容视口。运行结束关闭测试浏览器并清理临时配置。

### 模型与 API 覆盖

- 固定入口与真实 tab ID 分离；关闭保留入口，重开使用起始 URL，连续 / 并发打开不重复创建。
- 当前导航与 `homeUrl` 分离；已加载入口重激活，不覆盖当前导航；返回起点才更新真实 API 的 URL 参数。
- Favorites 共享、工作区切换、Today 关闭、临时页固定当前 URL、删除已打开固定入口转入 Today 而不关闭页面。
- 原生创建 / 标题 / 导航 / 激活 / 关闭 / 移出窗口 / ID 替换事件；手动临时页名称不会被标题事件覆盖。
- 空工作区固定当前页面归入该工作区；后台加载 / 标题事件不会把用户切回其他工作区。
- 同层排序、文件夹创建 / 折叠 / 移动、工作区创建 / 重命名与设置。
- 常用 / 固定 / Today 更换图标不改地址或绑定、不调用 tabs API；内置与组合 emoji 校验、颜色白名单、拒绝未知图标 / 跨区 / 过期编辑，永久图标关闭、晋升与 Worker 重建后保留。恢复名称首字清除自定义值；存储失败不覆盖原图标，坏自定义字素数据被拒绝。
- 默认仅日常 / 工作；旧默认空留白迁移落盘，当前区回落日常。旧固定入口、文件夹、会话 Today / tab ID、自定义名称不被迁移删除；再次重建 Worker 不覆盖迁移后的自定义改名。
- 明确接管另一个窗口，不关闭旧网页；不会误关已移到非管理窗口的标签。
- 模拟 Worker 重建恢复同会话绑定；模拟新浏览器会话只恢复固定入口与设置，不按 URL 猜测旧网页归属。
- 本地存储不含 Today / tab ID；坏持久数据不覆盖且可导出原始备份，坏 session 可显式清除。
- Chrome 创建 / 关闭失败、本地删除写入失败、session 写入失败反馈；session 写失败后内存绑定保留，重试不重复开页。
- 拒绝脚本 / 文件 / 内部页的固定 URL、登录凭据、空白或超长名称、坏 ID / 文件夹 / 排序方向；拒绝 Object.prototype 同名 ID。
- Manifest 只申请 sidePanel / tabs / storage / alarms；后台同步注册事件与 commands / alarms，只接受自身侧栏消息。v0.1.6 的三个建议键与 macOS 映射、Chrome 141 支持基线有断言。
- 侧栏同键开关使用 `_execute_action`；没有 action popup。初始化 / 安装 / 启动均启用 `openPanelOnActionClick: true`，配置错误有反馈，保留命令不会被 onCommand 重复处理。模拟器不伪造 Chrome 原生动作或面板可见性。
- 快捷键前后循环、首尾、单工作区、并发顺序、冷启动和 Worker 重建；复用当前导航 / tab ID，不隐式接管其他窗口，拒绝坏方向。
- 复现并修复过期跨区排序把 Today 元素写入数组 `-1`、原位置成为 `undefined` 的问题；模型 no-op、后台拒绝，面板取消过期菜单 / 表单。界面请求携带当时工作区 ID；即便快捷键先到、旧界面保存消息后到，后台也拒绝跨区提交，不影响显式切区或全局设置。

- Today 转 Pinned / 文件夹 / Favorites：复用实体与 tab ID，读取真实当前 / pending URL，不依赖过期导航事件；拒绝关闭、跨区、带凭据与内部页，晋升不保留过期时间。
- 注入时钟验证默认关闭 / 12h 参数，12h 与 24h 精确边界、自定义时长、关闭保留时长 / 重建、旧 0 / 24h 安全迁移与六种主题落盘、坏参数拒绝、跨 Space 与 Worker 保留计时、长时间选中后离开再计时、标题更新不续期、旧时间戳迁移、不立即关页；检查期间收到用户激活事件不关闭该页。
- 过期保护当前 / 原生固定 / 发声 / 加载 / 不可自动丢弃页；固定 / 常用入口不参与。关闭与 session 写失败可重试，并发先固定不被清理；移出管理窗口只解绑。
- 模拟 Alarm 启用 / 关闭 / 丢失重建 / 配置失败与重试 / 命名事件派发，初始化读取不抢先清除替换 ID。**不等同于真实 Chrome Alarm 唤醒、站点未保存内容保护或小时级实时等待验收。**

### 浏览器 UI 覆盖

无插件重复标题、搜索顶部 ≤16px、36px 常用图标、固定入口空状态 ≤56px、默认双工作区、内容随 240–600px 视口缩放；默认层级、未加载 / 选中 / 空状态、添加验证、名称与图标首字安全呈现、删除 / 纳入 / 接管确认、文件夹排序 / 折叠 / 移回顶层、跨区搜索、主题 / 紧凑设置、本地落盘、菜单方向键 / Esc、对话框关闭后的焦点返回、错误提示与窄布局。

图标编辑另验证 Favorites 右键与 Shift + F10、固定 / Today 菜单、实时预览、组合 emoji、用户文本转义、多字符拒绝、取消、保存失败保留草稿、恢复首字与焦点返回，240 / 320 / 600px 对话框无溢出。另用 CDP 可信右键打开常用入口菜单、原生点击保存图标，不增加模拟标签。

相邻页分割线另验证固定区、文件夹内、Today 三种列表，六主题 × 普通 / 紧凑行高均为 1px 渐变，不在第一行前显示、不增加行高，`pointer-events: none` 不拦截输入。分割线更新后再次主动探测 CSS / 自检脚本：0 个错误，仅 10 条既有隐藏 / 减少动态效果的 `!important` 样式提示。

DOM 自检的合成点击 / 键盘不等同于原生输入，因此核心点击与 Tab 焦点额外使用 CDP 原生输入。拖动另用真实鼠标启动，再由 CDP 派发 Chrome 可信 drag/drop，验证生产处理器；Chrome tab API 仍为模拟。合成 UI 用例额外覆盖文件夹 / 外部载荷拒绝 / 跨区取消 / 菜单替代，以及自动过期默认 12h / 输入校验、开启确认与取消、缩短确认取消、关闭保留时长、设置落盘、Alarm 派发与禁用。工作区命令测试直接派发模拟 `onCommand`；开关只验证 Manifest 原生动作绑定及行为配置。**没有实测 Chrome 注册 / 拦截三个按键或真实 Side Panel 同键开关**。生产侧栏的原生输入仍调用模拟 API，没有绕过「不自动安装扩展」的约束。

### 原生同键开关的依据（不是实机验收）

- [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel#type-PanelBehavior)：`openPanelOnActionClick` 明确是 toggle，不只是 open。
- [Chrome Commands API](https://developer.chrome.com/docs/extensions/reference/api/commands#action_commands)：`_execute_action` 触发扩展按钮，不派发 `onCommand`。
- 核对 Chromium 提交 `e2f5e9c588dfdba1cf8c10d9bc1c5b6f09c589ab` 的原生路径：[键盘触发 ExecuteUserAction / RunAction](https://chromium.googlesource.com/chromium/src/+/e2f5e9c588dfdba1cf8c10d9bc1c5b6f09c589ab/chrome/browser/ui/extensions/extension_action_view_model.cc#560) → [返回 kToggleSidePanel](https://chromium.googlesource.com/chromium/src/+/e2f5e9c588dfdba1cf8c10d9bc1c5b6f09c589ab/chrome/browser/extensions/extension_action_runner.cc#122) → [SidePanelUI::Toggle](https://chromium.googlesource.com/chromium/src/+/e2f5e9c588dfdba1cf8c10d9bc1c5b6f09c589ab/chrome/browser/ui/extensions/extension_side_panel_utils.cc#54)。浏览器处理真实面板状态，无需 Worker 保存可见性或异步判断后再请求打开。
- 上述证明设计采用原生切换路径，不等同于已在安装的 Chrome 157 或最低支持 Chrome 141 上验收按键。

### 原生宽度的依据（不是实机拖拽验收）

核对同一 Chromium 提交：[`SidePanelEntry::kSidePanelDefaultContentWidth = 360`](https://chromium.googlesource.com/chromium/src/+/e2f5e9c588dfdba1cf8c10d9bc1c5b6f09c589ab/chrome/browser/ui/side_panel/side_panel_entry.h#36)；[`GetMinimumSize / ClampPanelWidth`](https://chromium.googlesource.com/chromium/src/+/e2f5e9c588dfdba1cf8c10d9bc1c5b6f09c589ab/chrome/browser/ui/views/side_panel/side_panel.cc#393) 加上外框并限制下限；[`SidePanelResizeArea`](https://chromium.googlesource.com/chromium/src/+/e2f5e9c588dfdba1cf8c10d9bc1c5b6f09c589ab/chrome/browser/ui/views/side_panel/side_panel_resize_area.cc#46) 提供原生鼠标 / 键盘调整区域。公开 Side Panel API 无宽度设置字段。240–600px 自检只证明网页布局响应，不声称修复或实测了用户 Chrome 的原生拖拽问题；更小的原生侧栏不能靠插件 CSS 达成。

## 静态分析与其他限制

- v0.1.0 阶段主动 LSP 探测 18 个 HTML / CSS / JS 文件：0 个错误诊断，但 **0 个确认 clean、18 个 inconclusive**（1 个超时、17 个服务无法确认 clean）。v0.1.1 对 9 个改动代码 / 配置文件再探测：0 个错误诊断、0 个确认 clean、9 个 inconclusive。v0.1.2 对 6 个改动代码 / 配置文件主动探测：0 个错误，4 个确认 clean、2 个有发现（8 条 TypeScript `event` 弃用提示与 8 条既有样式规则提示 / 警告）；Worker 实际调用的是自身的事件转发函数。保留这些提示，不为此做无关重构。仍不声称完整静态检查无问题，以语法检查与运行时断言为主要证据。
- v0.1.3 对 11 个改动代码 / 配置文件主动探测：0 个错误，7 个确认 clean、4 个有发现，共 12 条既有样式警告 / 提示（嵌套三元表达式、布尔参数和 await 语法提示）。未为这些提示扩大重构范围。
- v0.1.4 对 12 个改动代码 / 配置文件主动探测：0 个错误，7 个确认 clean、5 个有发现，共 20 条提示 / 样式警告（8 条既有 `event` 弃用提示、1 条测试中的 await 类型提示、11 条嵌套三元 / 布尔参数等提示）。未为此扩大无关重构；语法与运行时检查通过。
- v0.1.5 对 13 个改动代码 / 配置文件主动探测：0 个错误，5 个确认 clean、8 个有发现，共 38 条提示 / 样式警告（8 条既有 `event` 弃用、1 条测试 await 类型提示、29 条嵌套三元 / 布尔参数 / CSS `!important` 等）。保留隐藏元素与减少动态效果所需的覆盖规则，不为一般样式建议扩大重构。
- v0.1.6 对 12 个改动代码 / 配置文件主动探测：0 个错误，5 个确认 clean、7 个有发现，共 30 条既有样式警告 / 提示（嵌套三元、布尔参数、CSS `!important` 与测试 await 类型提示）。语法与运行时检查通过，不为一般样式建议扩大重构。
- 最初 Cetus 内嵌预览点击没有观察到事件，等待返回 `Wait timed out after 25000ms`。已停止这条自动化路径；这些命令不计入通过结果。
- 未做屏幕阅读器朗读、完整 WCAG 审计、Chrome 141 最低支持版本的实机验证、真实扩展下载备份验收或实际站点对比。
- 实际 Chrome Worker 休眠、重启 / 更新时 storage.session 清空、真实窗口移动和 Side Panel 外层布局仍需验收；模拟器只证明状态规则与 API 参数 / 接线。
- 首版无无痕支持、账号 / 云同步、登录隔离、连续多窗口上下文、备份导入或重启后的自动重绑。未实测 Arcify，不能推断用户未说明的痛点。

## 手动验收清单（尚未执行）

按 [README](../README.md) 手动加载后，建议在单独的普通窗口中测试：

- [ ] 扩展管理页无 manifest / Worker 错误，授权提示符合四个权限，工具栏点击打开原生侧栏。
- [ ] 首次没有虚构页面；创建一个固定入口不会立即开页，点击才打开真实网页。
- [ ] 连续点击同一入口不增加标签；网页导航后 `homeUrl` 不变，菜单返回起点真实生效。
- [ ] **× 确实关闭真实标签**但保留固定入口；从原生标签栏关闭也使入口变为未加载。不要用有未保存内容的页面测试。
- [ ] 常用右键 / Shift + F10 及条目 ··· 能更换图标，预览 / 取消 / 恢复首字正常；切区与重载后永久图标保留，不重开 / 导航网页。
- [ ] Today 关闭即移除；删除已打开固定入口需要确认、页面仍在；内部页不能固定。
- [ ] 从 Today 拖到固定区、文件夹与常用区，网页不重开 / 不关闭，保存当前地址；切区后常用入口共享，菜单键盘操作也可晋升。
- [ ] 自动过期默认关闭，开启确认解释风险；时长默认 12h 且可设置整数，关闭保留时长，缩短需确认且取消保留原值；用无未保存内容的测试页验收配置时长、当前 / 固定 / 发声页保护、Alarm 唤醒与关闭设置。不用真实重要编辑页做测试。
- [ ] 六种外观可切换，自动模式随 Chrome 提供的浅 / 深色偏好变化、编辑与焦点不丢；不要求商店主题色或背景图复制。
- [ ] 空工作区、文件夹、重命名 / 排序、主题、键盘焦点在真实 Side Panel 中正常；其他工作区原生标签不被隐藏 / 关闭。
- [ ] 在第二个窗口明确接管，旧窗口网页仍在；手动移出标签后不会从原窗口误关它。
- [ ] Worker 空闲后重建，同会话仍复用 tab ID；重启浏览器 / 重新加载扩展后入口保留、绑定清空，不自动配对恢复页。
- [ ] 导出 JSON 内容正确且不含 Today / tab ID；确认备份安全后再考虑卸载或清理本地数据。
- [ ] 初始化不再出现插件内重复标题，固定入口空状态紧凑，默认日常 / 工作两区；旧空间有内容时不被删除。
- [ ] 拖动原生面板靠网页侧的边缘，放大 / 缩小在 Chrome 上下限内生效，内容随宽度变化；对比其他 Chrome 内置面板，区分浏览器拖拽异常与布局问题。
- [ ] 重新加载 v0.1.6 后，`chrome://extensions/shortcuts` 显示三个已绑定快捷键；「激活扩展程序」是侧栏同键开关，必要时重新绑定 Y；检查 Chrome / OS / 其他扩展冲突。
- [ ] 在网页、新标签页及侧栏有焦点时，同一键第一次打开、第二次关闭；鼠标点击侧栏 × 关闭后再按打开。工具栏点击、切到另一面板后再按、多个窗口和 Worker 休眠后再次按键均跟随实际状态，不关闭网页。
- [ ] 侧栏关闭时前后切工作区，重新打开显示正确工作区；目标页面只激活、不重复打开或重置导航。首尾循环、跨窗口不隐式接管、切区取消未提交侧栏操作均正常。
