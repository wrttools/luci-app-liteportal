# 运行时标识从 `portal` 全量更名为 `liteportal`

- 状态：已接受
- 日期：2026-10-17
- 决策者：cocolight

## 背景

3.0.2（ADR 0005 之后的首个正式版）只改了 apk / ipk 的**包名**，运行时标识一律保留
`portal`：uci 配置文件 `/etc/config/portal`、ubus 对象 `luci.portal`、服务
`/etc/init.d/portal`、菜单 `admin/services/portal`、门户页 URL `/portal/`、静态目录
`/www/portal`，以及 `portal.uc` / `portal.po` 等文件名的全部。当时的判断是「包名与
运行时标识是两件事，前者会重名冲突，后者不会」。

这个判断在实践中留下了一个长期的认知负担：仓库名、包名、菜单路径、URL、日志 tag
分属两套术语，读代码、写文档、排查故障都要在 `portal` 与 `liteportal` 之间来回翻译。
用户据此要求把两者统一（原话：*将仓库名称也改为 luci-app-liteportal，这些运行时
标识也都相应更改，所有的*）。

## 决策

1. **所有构成对外契约的标识改为 `liteportal`**，一次改齐：

   | 类别 | 旧 | 新 |
   |---|---|---|
   | uci 配置 | `/etc/config/portal`，section 类型 `config portal` | `/etc/config/liteportal`，`config liteportal` |
   | ubus | `luci.portal` | `luci.liteportal` |
   | 服务 | `/etc/init.d/portal` | `/etc/init.d/liteportal` |
   | 菜单 | `admin/services/portal` | `admin/services/liteportal` |
   | 页面 URL | `/portal/` | `/liteportal/` |
   | 静态目录 | `/www/portal` | `/www/liteportal` |
   | 前端模板 | `/usr/share/portal/www` | `/usr/share/liteportal/www` |
   | 上传暂存 | `/tmp/portal_upload.tmp` | `/tmp/liteportal_upload.tmp` |
   | 视图与资源 | `view/portal/`、`resources/portal/` | `view/liteportal/`、`resources/liteportal/` |
   | 后端插件 / 翻译 | `portal.uc`、`portal.po`、`portal.pot` | `liteportal.uc`、`liteportal.po`、`liteportal.pot` |

   门户前端资源文件（`liteportal.js` / `liteportal.css`）与视图样式作用域类
   （`.liteportal-admin` / `.liteportal-panel` / `.liteportal-bm-thumb`）一并更名，
   后者会让主题里针对旧类名的自定义样式失效，代价可接受（那是内部钩子）。

2. **版本记 `4.0.0`**（3.0.2 → 4.0.0）。uci 配置名、ubus 对象与 URL 都是对外 API，
   改名属不兼容变更，按语义化版本记 MAJOR。

3. **`postinst` 负责迁移，升级顺序为先装新包、后卸旧包**。安装脚本把
   `/etc/config/portal` 搬到 `/etc/config/liteportal`（判据是 apk 未留下
   `.apk-new`，即用户尚未持有自己的 liteportal 配置）、把 `/www/portal` 搬到
   `/www/liteportal`（仅在目标不存在时），并停用可能仍在运行的旧服务。
   顺序不能反：旧包的 `prerm` 会 `rm -rf /www/portal`，先卸会把上传素材删掉。

4. **菜单与页面显示名保留 `Portal`**。那是面向用户的文案，不是标识符；改它只会让
   中文界面多出一个英文单词，且要牵动翻译目录。

5. **仓库更名为 `wrttools/luci-app-liteportal`**，`Makefile` 的 `LUCI_URL` 同步。
   GitHub 对旧 URL 提供重定向。

## 后果

- 正面：仓库、包、配置、对象、服务、路径、日志全部同名，读代码与排障不再需要翻译
  层；`scripts/check.sh` 的交叉引用（ubus 方法 ↔ ACL）也随之统一到 `luci.liteportal`。
- 负面：这是一次不兼容变更。用户若把 `/portal/` 加入过书签会 404；任何外部脚本里写
  死的 `ubus call luci.portal …`、`uci get portal.@portal[0]…`、`/etc/init.d/portal`
  都要跟着改。迁移只覆盖配置与素材，**不覆盖外部脚本**。
- 迁移的边界：`postinst` 只处理两种历史布局（3.x 的 `portal` 命名与 2.0.0-r23 及更早
  的 `/etc/portal/www`）。更早或手工改动过的布局需要用户自行搬运。
- 若用户按相反顺序升级（先卸旧包），`/www/portal` 及其中的上传素材会先被旧包的
  `prerm` 删除。这一点写进了 README 与 Release 说明，但无法在代码层阻止。

## 替代方案

1. **保留 `/portal/`，在服务端加 301 重定向到 `/liteportal/`。** 放弃：门户由主
   uhttpd 按目录直接提供静态文件（ADR 0004），项目没有 uhttpd 之外的服务端能力，
   而 uhttpd 的重定向配置是全局的 `option redirect`，为一个路径改全局配置不划算。
2. **发布一个转发用的兼容包（空包，仅保留旧名下的 ubus 与 init 脚本）。** 放弃：
   那是一个需要永久维护、只在升级窗口有意义的东西，与项目「不引入冗余组件」的取向
   冲突。
3. **不做自动迁移，要求用户手工 `mv`。** 放弃：uci 配置文件名变了，conffile 机制
   不生效，手工步骤漏一步就是书签与素材全丢。
