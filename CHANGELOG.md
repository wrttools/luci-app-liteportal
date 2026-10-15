# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与
[语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added

- **书签行在保存按钮左侧显示素材图缩略图**（用户 2026-10-15 加入计划）：书签用了素材库
  图片（`icon` 字段）后，行内「保存」按钮左边出现该图的小缩略图 —— 「这一行用的到底是
  哪张图」此前只能从下拉框里的路径名猜，而路径正是最难认的形式。缩略图 URL 与门户页
  走同一套转换（复刻 rpcd 插件 `asset_path()` 的三分支：`/www/portal/` 前缀、裸文件名、
  其他绝对路径），保证缩略图显示的门户也显示。改下拉框即时更新，不等保存。仅素材库
  图片驱动缩略图：「图标」列填 emoji 或外链 URL 时不拉取第三方图装饰设置页。

### Changed

- **上传素材不再弹「已上传 xxx。」通知**（用户 2026-10-15 反馈）：上传成功时下方素材
  列表已经从后端重画完毕，新图出现在列表里就是成功 —— 通知重复这一点，且浮在新图正
  上方。`upload()` 的 `run_rpc()` 改传 `null` 作成功消息（失败仍弹错误，不受影响），
  译句从 pot/po 移除。

- **「扫描本地服务并添加」改为先确认再写入，且只追加新行**：此前按一次按钮就会立刻把
  所有识别出的服务写进配置，弹出一条通知，然后在 1.5 秒后整页 `location.reload()`。
  两个问题：通知根本没机会被读完就被刷新冲掉；用户在被写入之前没有机会看清到底要加什么，
  而且一次误触就会留下一批配置里已经存在、页面却从未展示过的书签。

  现在分成两半：`scan_candidates()` 只读不写，把结果整理成候选清单（已存在的书签按 URL
  去重）；`confirm_scan()` 用带勾选框的弹窗呈现，识别出的服务默认勾选、无法判定的端口
  默认不勾 —— 「全都加上」不是一个看一眼清单就能做出的决定，这正是原来那套流程留不下的
  部分。用户在弹窗里点「添加所选」之后，`stage_bookmarks()` 才写入，且**刻意不调
  `uci.save()`**，与页面上其他输入一样等「保存并应用」统一提交。

  追加行由 `BookmarkTable.append_sections(sids)` 完成，只重画新增的那几行 `<tr>`，不动整页：
  通知读得完、正在编辑的半行不丢、滚动位置不变。表格为空时的占位行会被移除，否则会出现
  「下面还有书签，上面却写着空」的自相矛盾。行的单元格来自与初次渲染完全相同的 option
  widget，所以新行在「保存并应用」时的 parse/save 路径与旧行没有区别。

  因此 `common.js` 的 `maintenance_section()` 多收一个 `on_add(sids)` 回调：扫描本身不碰
  DOM，只有调用方知道一行书签长什么样，把 section id 交回去也让「哪些行存在」的决定留在
  一处。`scan_services()` 与 `confirm_unknown()` 随之被上述三个函数取代。

- **门户设置页去掉「立即重新生成 links.json」按钮**（ROADMAP #10）：配置变更本就会触发
  `/etc/init.d/portal reload`，而 `init.d/portal` 注册了
  `procd_add_reload_trigger "portal"` 且未定义 `reload_service()`，故 `rc.common` 默认的
  `reload()` 走 `start_service()` —— 点「保存并应用」就重新烘焙，无论配置是否真的变了。

  该按钮是通往同一件事的第二条路径，且有误导性：按它会重新发布，却并不解决用户想改的东西。
  「维护」区段因此只剩「扫描本地服务并添加」一个按钮。

  前端随之删除已无调用方的 `callGenerate` 声明与导出。**后端的 `generate` 方法、ACL 授权、
  `init.d` 的 `generate_links()` 一律保留** —— reload 触发器正是靠
  `ubus call luci.portal generate` 实现的。

  `PKG_RELEASE` 随之升到 5：3.0.0-r4 已发布，本轮有内容变更，同号会让包管理器
  把新包当成同一个而跳过升级。

- **扫描添加书签后不再弹出「已在列表末尾添加 N 个书签」通知**（ROADMAP #23 装机验证的
  反馈）：确认弹窗里点「添加所选」，行已经出现在列表末尾 —— 通知说的就是列表已经显示
  的事，而且浮在新增行的正上方，恰好挡住它报告的内容。真正需要知道的事（加了几条、加在
  哪）一眼就能看到，无需再确认一次。`confirm_scan()` 的 `on_add(sids)` 回调完成后直接
  结束，不再 `notify()`；译句随之从 `po/templates/portal.pot` 与 `po/zh_Hans/portal.po`
  移除。

- **删除与保存的成功通知一并去掉**（用户 2026-10-15 反馈，延续上传弹窗的处理）：批量删除
  「已删除 N 个书签。」、行内「保存」的「已保存该书签。」、素材库删除的「已删除 xxx。」
  都不再弹 —— 三者的结果在动作发生的同一位置就已可见（行消失 / 按钮文字变「已保存」/ 
  列表里文件消失），通知只是重复眼着的结果。`run_rpc()` 的成功消息改传 `null`，
  失败路径不受影响；译句从 pot/po 移除。

### Fixed

- **书签行缩略图不显示（#25）**：缩略图 URL 的换算在「素材库图片」这一分支上少切了一段 ——
  `icon_url_of()` 拿 `ICON_DIR`（`/www/portal/icons`，比 rpcd 的 `WWW` 深一层）去切路径，
  产出的 URL 丢掉了 `icons/` 段，请求落到 `/portal/<文件名>`，404。改为与 rpcd 插件
  `asset_path()` 对齐，切在 `WWW` 上，URL 保留 `icons/`。修复前上传过的图片一律显示不出，
  这也解释了为什么 r7 装机后设备上看不到任何缩略图。

- **扫描添加的书签行「名称」「URL」为空**（ROADMAP #23 装机验证的反馈）：`form.TableSection`
  的每个 option widget 各有一份配置值缓存（`option.data[sid]`），页面加载时由
  `CBIAbstractSection.load()` 一次性填入，渲染与保存都只读这份缓存。扫描走的是页面加载
  之后才发生的 `uci.add()`：新 section 在 `uci.get()` 可见（`uci.js` 的 `get()` 会先查待
  创建的 `state.creates`，保存链路因此一直是通的），却不在任何 option 的缓存里，
  `cfgvalue()` 返回 `undefined`，`append_sections()` 画出的行于是全是空输入框。

  `append_sections()` 现在在渲染前先给每个 option 补一次该 sid 的加载——逐 option 调
  `opt.load(sid)`，再用与 `CBIAbstractSection.load()` 相同的两参数 `cfgvalue(sid, value)`
  写回缓存，新行与初次渲染的行从此走完全相同的取值路径。这里不复用 `loadChildren()`：
  它跳过 `disable` 的 option，返回值与 `this.children` 的索引对不上，按 `children[i]`
  直接配对会错位（`CBIAbstractSection.load()` 自己的写法依赖「没有 disable 的 option」
  这一前提，这里不替它继承这个假设）。

  `PKG_RELEASE` 随之升到 6：3.0.0-r5 已装机验证，本轮修的是用户可见缺陷，同号会让包
  管理器把新包当成同一个而跳过升级。

## [3.0.0-r3] - 2026-10-13

### Changed

- **「维护」区段从常规页移到书签页，位于书签列表上方**：「立即重新生成 links.json」与
  「扫描本地服务并添加」两个按钮原本在常规页末尾，而扫描的结果是新增书签 —— 按钮在列表
  下面、效果出现在按钮上面，操作时需要来回找。区段的定义随之移入
  `portal/common.js` 的 `maintenance_section()`，由书签页在列表之前调用：两个按钮共用
  同一份扫描规则，而不是各留一份日后走偏。随之移入 common 的还有 `scan_services()`
  与 `confirm_unknown()`。

  用户可见字符串未变，`po/templates/portal.pot` 与 `po/zh_Hans/portal.po` 的行号引用
  已用 xgettext + msgmerge 同步。

### Fixed

- **`enabled=0` 关闭门户后 `/portal/` 不再返回 uhttpd 的目录索引页**：uhttpd 对「有目录、
  无 `index.html`」的路径会生成 `Index of ...` 并回 200，所以关闭后访问
  `http://<router>/portal/` 会看到一份列出 `bg/`、`icons/` 的目录页，看起来像门户还在。
  `unpublish()` 改用 `rmdir` 由深到浅撤下目录（含 `/www/portal` 本身），目录不存在时
  路径自然回到 404。`rmdir` 对非空目录会拒绝并保持原样，**用户上传的文件一个都不会被删**；
  `publish()` 的 `mkdir -p` 会在重新开启时重建整条目录链。已知取舍：目录内有素材时列表
  仍存在（保文件优先于关列表）。
- **全新安装后直接「保存并应用」不再报「选项"背景遮罩强度"不能为空」**：`form.RangeSliderValue`
  的 `formvalue()` 对「值等于 `default`」返回 `null`（用它省略冗余键），而背景遮罩强度 /
  背景磨砂模糊 / 书签透明度三个滑块都设了 `o.rmempty = false`，于是表单走 reject 分支抛
  `Option "%s" must not be empty.`。包自带配置里三个键的值恰好都等于各自的 `default`
  （78 / 0 / 45），**故全新安装必现**，与 0 无关。三个滑块改为不设 `rmempty`，缺省时由后端
  `percent()` 回落默认值，行为等价；`enabled` 的 `rmempty = false` 保留（开关须显式记 0/1）。
- **背景文件丢失时门户页不再显示为「有背景」**：`generate()` 原先在 `stat()` 失败时只清空
  `background_v`，`background` 仍指向已消失的文件，浏览器 404 后回退到 CSS 纯色且不作任何
  提示 —— 页面像有背景、素材库却是空，两边对不上。现在先 `stat()` 再赋值，文件缺失时
  `background` 回落到「背景色」选项的纯色值。
- **上传的文件名不再变成一串下划线**：原先把文件名里每个非法字符**逐字**替换成 `_`，
  「AI训练背景.jpg」落盘成了 `______AI__-__-__.jpg` —— 既看不出上传的是什么，两张只在中文
  部分不同的图片还会直接撞名。改为保留可读的 ASCII 部分、其余折成单个短横线
  （`AI训练背景.jpg` → `AI.jpg`、`my photo.jpeg` → `my-photo.jpeg`），全非 ASCII 时用
  `image`；扩展名始终保留。重名时在扩展名前追加序号（`AI-2.jpg`、`AI-3.jpg`），不再依赖
  后端拒绝后让用户自己想办法。后端的白名单校验不变 —— 它仍是唯一的落盘入口校验。

## [3.0.0-r1] - 2026-10-12

### Added

- 新增 `.github/pull_request_template.md`；`AGENTS.md` 增补 §8 单一事实源坐标、§9 同改矩阵，红线分为阻断级 / 提醒级。
- **主版本升到 3.0.0**：部署模型由「门户跑自己的 uhttpd 实例」改为「复用主 uhttpd 的子路径」，
  uci 与 `luci.portal status` 契约随之破坏性变更，故按语义化版本升主版本。

### Changed

- **门户不再由独立的 `uhttpd` 实例提供服务**：改由路由器已在运行的主 uhttpd 在
  `/portal/` 子路径下提供，页面与素材落在 `/www/portal/`。省掉一个常驻进程与一个自选
  端口，也不再需要单独放行防火墙；缩略图与 LuCI 同源，因此「LuCI 走 HTTPS 时缩略图被
  按混合内容拦截」这条限制随之消失。决策与取舍见
  [docs/adr/0004](docs/adr/0004-serve-portal-from-main-uhttpd.md)。
- `enabled` 开关的语义由「启停守护进程」改为「发布 / 撤下页面」：关闭时从
  `/www/portal/` 移除入口文件与 `links.json`，用户上传的图标与背景图保留，重新开启
  即恢复。
- `/etc/init.d/portal` 每次启动都刷新模板文件（原先只在 `index.html` 缺失时拷贝），
  使包升级能真正替换掉旧的 `index.html` / `portal.js` / `portal.css`。
- 设置页的「运行状态」面板改为「可访问」提示：去掉 PID / 端口 / 监听三行，改为
  `published` 与 `server_listening` 共同决定 `reachable`，并在不可访问时说明是哪一层
  不满足。

### Fixed

- 升级保留既有素材：postinst 会把旧位置 `/etc/portal/www/{icons,bg}` 的内容搬到
  `/www/portal/` 下，**仅在目标目录尚不存在时**搬运，不覆盖、不合并。

### Removed

- uci 的 `port` 选项 —— 页面不再有自己的端口；配置里残留的值会被忽略。
- `luci.portal status` 的 `running` / `pid` / `port` / `listening` / `url` 字段，改为
  `path` / `published` / `server_listening` / `reachable`（**破坏性**，调用方需跟改）。
- `portal/common.js` 的 `port_in_use()`，以及各视图对 `uhttpd` 配置的读取 —— 不再有
  「门户端口是否与主实例冲突」这回事。

## [2.0.0-r23] - 2026-10-06

### Added

- 门户页外观可调：新增三个 0–100 的滑块 —— **背景遮罩强度**（`bg_veil`）、
  **背景磨砂模糊**（`bg_blur`，100 等于 20 px）、**书签卡片透明度**
  （`card_transparency`）。取值由后端原样写进 `links.json`，门户页再转成 CSS 自定义
  属性；未设置时沿用此前硬编码的 78 / 0 / 45，升级后外观不变。

## [2.0.0-r22] - 2026-10-06

本版含此前**未对外发布**的 `2.0.0-r21` 内容（`r21` 未出过 Release），二者一并发布。

### Added

- 书签页行内「保存」成功后，该行按钮文字变为「已保存」；保存失败时仍显示「保存」（`2.0.0-r21`）。

### Changed

- 素材库的上传 / 改名 / 删除不再整页刷新：`assets.js` 用 `refresh_assets()` 重新读取两个
  素材目录并只替换列表容器，滚动位置与未应用的暂存改动都不再丢失；操作结果仍由通知
  横幅告知。「设为背景」也走同一路径，好让「(current)」标记立刻跟上暂存值（`2.0.0-r22`）。

### Fixed

- 书签页连续点「保存」或勾选「全选」时，上方通知横幅不再逐条累计：`portal/common.js`
  新增 `notify()`，`run_rpc()` 与书签页的两处直接调用改走它。此前 `ui.addNotification()`
  只往 `#maincontent` 顶部插入、从不移除旧的，横幅会越堆越多、页面越来越高（`2.0.0-r21`）。
- 门户页设置背景图后书签被照片盖住、页面上只剩图片：`portal.css` 增加一层只压暗、
  不吃事件的暗幕（`body::before`），并把卡片底色由 6% 白改为半透明深色加磨砂。
  原来那套「深色底 + 浅灰字 + 近透明卡片」的配色在明亮照片上会让内容整个消失
  （素材库到 v2.0.0-r20 才能正常设背景，此前该组合从未被验证过。`2.0.0-r22` 修复）。

## [2.0.0-r20] - 2026-10-06

### Added

- 书签页：行内「保存」（只提交该行）、列表内「全选」复选框、「删除禁用书签」与
  「清空所有书签」。

### Changed

- 书签页表头：「启用」文字从标题行移到描述行，标题行该列只留复选框。
- 「设为背景」保持**暂存**语义：值写入 UCI 后仍需点「保存并应用」生效，不链式提交
  （按用户决定，避免顺带提交其它页面的未保存改动）。

### Fixed

- **素材库的上传 / 重命名 / 删除 / 设为背景会提示「成功」但文件毫无变化** —— 三个
  独立层次，分别随 `2.0.0-r18` / `r19` / `r20` 修复：
  1. rpcd 方法表未声明 `args`，具名参数在回调执行前即被 ubus 以
     `UBUS_STATUS_INVALID_ARGUMENT` 拒绝（`r18`）；
  2. LuCI `rpc.declare` 的数组 `params` 是**位置映射**，调用点却传了对象字面量，
     参数根本没拼对（`r19`）；
  3. 上传的搬运用了 `rename(2)`，而 `/tmp`（tmpfs）与 `/etc/portal/www`（overlay）
     属不同挂载点，跨设备 rename 返回 `EXDEV`；改用 `readfile` + `writefile` +
     `unlink`（`r20`）。
- **后端失败在 UI 上被读成成功**：`run_rpc()` 现在把 resolved 的 `{ ok: false }` 抛出
  （`r17`），且本 App 全部 `rpc.declare` 声明 `reject: true`，ubus 层错误不再被当作
  结果 resolve（`r18`）。
- 所有文件系统失败的报错带上 errno 文本（如 `Cross-device link`），不再一律显示同
  一句话。
- `links.json` 生成失败时不再静默；落盘后显式 `chmod 644`（原先 0600，网页读不到）。
- `init.d/portal` 以 0644 打进包，导致安装/卸载脚本静默失败。
- `lan_ip()` 把带掩码的 `ipaddr` 直接拼进 URL。

### Removed

- 无

## [2.0.0]

### Added

- 门户素材库：图标与背景图的上传（单个 ≤ 2 MiB）、预览、重命名、删除，并可直接设为
  页面背景。
- 端口扫描改读 `/proc/net/tcp[6]`，只列出从 LAN 地址可达的监听端口，并按
  `/etc/services` 把端口分为「已知 Web 服务」「确定非浏览器目标」「未知」三类。
- 状态面板同时报告**进程存活**与**端口已监听** —— procd 会不断重启启动即退出的守护
  进程，只看 PID 会掩盖一个根本不应答的门户。
- `/admin/services/portal` 菜单注册与 rpcd ACL。

### Changed

- **破坏性（仅 1.x）**：前端由 Lua + `luci-compat` 改为 JavaScript 视图，后端由
  `luasrc/portal.lua` 改为 ucode rpcd 插件（`luci.portal` ubus 对象）。
- **破坏性（仅 1.x）**：端口扫描不再逐端口跑 `nc -z`，也不再扫描只监听 `127.0.0.1`
  的服务 —— 用路由器地址做书签根本连不上它们。
- 图标新增 `icon_url`（emoji / 远程 URL）；上传的图标仍写入 `icon`，新旧两种值都能识别。
- 构建改用 `luci.mk`。

### Fixed

- 独立 `uhttpd` 实例显式绑定 IPv4 通配地址。传裸 `:PORT` 会让 `getaddrinfo()` 报
  「Name does not resolve」，uhttpd 随即以「No sockets bound」退出，门户完全不可达。
- `/etc/config/portal` 不再在卸载时删除：它是 conffile，交给包管理器处理，已定制的
  门户配置因此能在重装后存活。

### Removed

- `luasrc/`、CBI model、Lua controller 全部移除。

## [1.0.0]

### Added

- 首个版本：静态 HTML 导航页 + 独立 `uhttpd` 实例 + LuCI 配置界面。

