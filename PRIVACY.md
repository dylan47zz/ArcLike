# ArcLike 隐私政策 / Privacy Policy

生效日期：2026-11-09。适用于 ArcLike v0.1.6。ArcLike 是用于组织 Chrome 标签页的本地侧栏扩展。

## 处理的数据与用途

ArcLike 在本机读取和处理受管理窗口中标签的 URL、标题、tab ID、激活状态与必要的标签状态，用于切换、关闭、固定、返回起点、同步侧栏显示，以及用户开启后的临时页过期检查。用户手动纳入已有页面时，会读取该窗口的标签列表。

用户输入的入口名称、固定起始 URL、文件夹、工作区、图标与外观 / 过期设置保存在 `chrome.storage.local`。临时 Today 条目、当前 URL、tab ID、窗口归属与闲置时间保存在 `chrome.storage.session`；扩展会话结束或重新加载后会清空临时绑定。固定入口仍保留。

ArcLike 不调用 `chrome.history` 查询浏览历史数据库，不读取页面正文、表单、密码、Cookie 或登录凭据，没有内容脚本或网站内容访问权限。标签 URL / 标题本身仍属于浏览相关数据；URL 查询参数可能包含敏感信息，请勿保存一次性登录链接。

## 数据不上传

扩展自身没有账号、服务器、分析统计、广告、云同步或第三方图标服务，不将上述数据传送给开发者或第三方，不出售数据，不用于广告、信用评估或与标签管理无关的用途。所有扩展代码和内置图标随安装包提供，不加载远程可执行代码。默认网页图标通过 Chrome 自身的 `_favicon` 接口读取，使用 `favicon` 权限；扩展不直接抓取网页图标地址，也不向第三方图标服务提交 URL。图标响应由 Chrome 管理，不把图像或额外图标地址存入扩展备份。

用户通过入口打开的网站会按其自身隐私政策处理正常网页请求；这与 ArcLike 的本地数据处理不同。Chrome / 操作系统对本机配置文件、备份与同步的行为由相应服务提供方管理。

## 控制、保存与删除

数据在本机配置中并非加密存储。用户可删除固定 / 常用入口、清除临时绑定，或卸载扩展；卸载一般会删除扩展的本地数据。导出的 JSON 备份由用户自行保管和删除，可能含个人 URL / 标题，分享前请检查。

自动过期默认关闭，时长默认 12 小时，可设 1–720 小时。开启需确认；它会关闭闲置的 Today 真实页面，但不能可靠判断未保存内容，可能导致内容丢失。固定 / 常用入口不受过期规则影响。

## 联系与变更

可通过 [ArcLike GitHub Issues](https://github.com/dylan47zz/ArcLike/issues) 联系维护者；请勿在公开 Issue 中粘贴个人网址、备份或其他敏感数据。发布时的仓库 / 支持链接见商店详情页。本政策与代码变化一起更新；如增加数据处理用途、上传或额外权限，会先更新说明。

## English summary

ArcLike processes tab URLs, titles, identifiers and necessary tab activity/status locally to organize tabs in a Chrome side panel. Permanent entries and settings use `chrome.storage.local`; temporary tab bindings and idle timestamps use `chrome.storage.session`. The extension does not query the browser history database, read page content/forms/cookies, use analytics or transmit this data to the developer or third parties. It has no account, cloud sync, advertising or remote executable code. Websites opened by the user follow their own privacy policies.

Local storage and exported backups are not encrypted. Users can remove entries, clear temporary bindings or uninstall the extension; exported backups must be deleted separately. Optional idle-tab expiration is off by default and can close pages with unsaved work. Support is available through https://github.com/dylan47zz/ArcLike/issues; do not post sensitive data there.
