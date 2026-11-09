# ArcLike 发布清单

版本：0.1.6；许可：MIT。此文档是 Chrome Web Store 提交素材与操作清单，不代表商店条目已上传、审核通过或上架。

## 生成公开源码与商店包

```sh
python3 scripts/prepare-release.py
python3 -m unittest discover -s tests -p 'release_test.py'
```

输出：

- `dist/ArcLike-0.1.6.zip`：Chrome Web Store 上传包，manifest 在 ZIP 根目录，仅 14 个运行资源与许可证文件，不含原型、测试、交接、环境文件或 Git 历史。
- `dist/ArcLike-0.1.6-source.zip`：MIT 公开源码、测试、隐私政策、设计 / 验证说明及商店素材。明确排除私有交接和研究目录，且没有旧 Git 历史。不要直接推送工作区的原始历史。
- 两个 SHA-256 文件用于核对包内容。ZIP 校验、图标尺寸、资源引用和公开文件检查失败时不会生成新包。

在已启动本地服务后运行 `node tests/run-browser.cjs` 可重建 `store/assets/overview.jpg` 和 `store/assets/icons.jpg`，均为 1280×800。图中使用生产侧栏代码的示例数据，不含真实浏览记录；它们是商店素材草稿，提交前应在独立普通 Chrome 窗口用实际安装版复核并确认 UI 与行为一致。不伪称已通过真实扩展 / Worker 休眠验收。

## GitHub

仓库：https://github.com/dylan47zz/ArcLike 。版本下载：https://github.com/dylan47zz/ArcLike/releases/tag/v0.1.6 。隐私政策 URL：https://github.com/dylan47zz/ArcLike/blob/main/PRIVACY.md 。支持：https://github.com/dylan47zz/ArcLike/issues 。

1. 本机 `gh auth login --hostname github.com --web`，不要把 token 放进源码或对话。
2. 确定当前登录的个人账号或有权限的组织；默认仓库名 `ArcLike`，公开，MIT。同名仓库存在时不要覆盖，先确认。
3. 将 source ZIP 解压到新的目录，在该目录 `git init -b main`，使用用户确认的提交身份。只在公开目录提交；不要修改全局 Git 身份，不带原工作区历史。
4. 创建 / 推送仓库，发布 `v0.1.6` GitHub Release，附件为商店 ZIP 及对应 SHA-256。源码 ZIP 可另附。
5. 用公开仓库的 `PRIVACY.md` 页面作可访问的隐私政策 URL，Issues 作支持链接；确认链接在未登录浏览器也能打开。将真实链接填进商店，不提交占位符。

## 商店条目（中文）

**名称**：ArcLike（与 manifest 一致）

**简短说明**：用常用图标、固定入口与工作区整理 Chrome 标签页，关闭网页仍保留起点；本地保存，支持拖动、主题与可选闲置清理。

**分类建议**：工作效率 / Productivity；免费；默认语言简体中文。

**完整说明**：

ArcLike 是一个本地保存的中文 Chrome 标签管理侧栏，让日常页面各归其位。

• 顶部共享常用入口：跨工作区访问常用页面，可选择内置图标、汉字 / 字母 / emoji 与颜色。
• 工作区固定入口和文件夹：关闭真实网页后入口仍保留；再次点击打开，返回起点保留固定初始 URL。
• 临时 Today：把临时条目拖到固定区或常用区，保存当前地址而不重开网页；也可使用菜单和键盘操作。
• 默认「日常 / 工作」两个工作区；支持重命名、文件夹、上移 / 下移和侧栏搜索。
• 自动浅 / 深色以及雾青、松夜、暖沙、海盐、暮紫主题，支持紧凑列表。
• 可选临时页闲置清理：默认关闭，时长默认 12h，可设 1–720h。启用会关闭真实闲置页面，不能可靠检测未保存内容，请先保存重要工作。
• 数据仅保存在本机，无账号、云同步、统计上报或第三方图标请求；MIT 开源。

需要 Chrome 141 或更新版本。当前只管理一个普通窗口，不支持无痕。工作区用于组织，不隐藏原生标签、不隔离 Cookie / 登录。重启、更新或重载后临时绑定清空，可手动纳入已有页面；不根据同 URL 自动重绑固定入口。Chrome 外框和侧栏宽度由浏览器控制。

ArcLike 是独立项目，不隶属于 Arc、The Browser Company 或 Google，也不宣称与这些产品完全相同。

## 隐私表单与权限理由

**单一用途**：在 Chrome 侧栏本地组织、激活和关闭标签页，以共享常用入口、固定起点、工作区和临时列表减少标签查找成本。

| 权限 | 可填写的理由 |
| --- | --- |
| sidePanel | 提供标签管理侧栏与原生开关，保持网页可见。 |
| tabs | 读取受管理窗口的标签 ID、URL、标题和必要状态，创建 / 激活 / 导航 / 关闭标签并同步侧栏；不读取页面内容或浏览历史数据库。 |
| storage | 在本机保存固定入口、工作区、图标与设置；在会话存储保存临时标签绑定、窗口归属和闲置时间。 |
| alarms | 用户明确开启自动过期后每 5 分钟检查本机临时标签的闲置时间；关闭后清除定时任务。 |

远程代码：**No, I am not using remote code**。普通网站自身执行网页脚本，不是扩展加载远程代码。

数据类型必须与实际处理一致。URL / 标题在本地读取和存储，属于浏览相关数据，不能仅因“不上传”就直接宣称“不处理任何用户数据”。建议在实际控制台按其定义如实声明 **Web history / 浏览记录（本地标签 URL / 标题）**，说明无服务器传输；其他类型没有专门读取功能。发布者须核对当前字段定义、隐私政策及 Limited Use 声明，并亲自确认合规承诺。

## 必须由发布者完成 / 确认

- [ ] 登录 GitHub，确认仓库账号 / 组织与公开提交身份。
- [ ] 注册 / 登录 Chrome Web Store 开发者账号，完成注册费、账号验证与安全要求；不由脚本代付，不提供虚假身份或地区。
- [ ] 提供可公开的开发者联系邮箱，确认商店要求的发布者身份 / 地区与适用的 trader 声明。
- [ ] 使用商店 ZIP 解压的版本做实际 Chrome 验收（见 [验证清单](VALIDATION.md)），不以 API 模拟器替代。
- [ ] 填入真实仓库、支持和隐私链接；确认商店名称、图标、截图不侵犯他人商标，不承诺不存在的能力。
- [ ] 新建商店条目，上传 ZIP、128px 图标及至少一张截图，填写商店说明、隐私、分发范围和免费状态。
- [ ] 提交审核。审核完成后才有可用商店链接；耗时与结果由 Google 决定，可选择审核后手动发布。

## 官方依据

- [开发者注册与注册费](https://developer.chrome.com/docs/webstore/register)
- [图标与截图：至少一张，1280×800 或 640×400](https://developer.chrome.com/docs/webstore/images)
- [隐私字段与权限理由](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [提交与审核](https://developer.chrome.com/docs/webstore/publish)
