# luci-app-portal

给 OpenWrt / ImmortalWrt 用的**静态 HTML 导航页**：跑在你自己指定的端口上，
由独立的 `uhttpd` 实例提供服务，全部通过 LuCI 配置。

[English](README.md)

## 它做什么

路由器照常在原端口提供 LuCI。本应用在**同一个** Web 服务器上额外挂一个刻意保持极简
的页面 —— 一个指向路由器（或任意位置）上各服务的书签网格，路径固定为 `/portal/`，
因此不需要第二个守护进程，也不需要额外开一个防火墙端口。书签、图标与背景都存放在
`uci` 中，并烘焙成静态的 `links.json`，因此门户页面本身不需要任何后端。

```
                    ┌──────────────────────────────────────┐
   :80 / :443  ────►│  uhttpd  （路由器自带的 Web 服务）    │
                    │    /         → LuCI                  │
                    │    /portal/  → 门户页面              │
                    └──────────────────┬───────────────────┘
                                       │ 直接从磁盘读取
                                       ▼
                    ┌──────────────────────────────────────┐
                    │  /www/portal/                        │
                    │    index.html  portal.js  portal.css │
                    │    links.json   ◄── 由 uci 烘焙      │
                    │    bg/  icons/  ◄── 上传落在这里     │
                    └──────────────────────────────────────┘
                                       ▲
   LuCI  ── /admin/services/portal ────┘   发布 / 撤下页面
```

## 功能

| | |
|---|---|
| 启用开关 | 发布或撤下门户页面；上传的图标与背景图在两种状态下都保留 |
| 不额外起进程 | 由路由器已在运行的 `uhttpd` 在 `/portal/` 下提供，无需启动、守护或额外放行端口 |
| 书签 | 增删与启用/禁用；图标支持 emoji、远程 URL 或素材库里的图片（用素材库图片时行内显示缩略图） |
| 素材库 | 上传（单个 ≤ 2 MiB）、预览、重命名、列出与删除图标/背景图，并可直接设为页面背景 |
| 外观 | 页面标题、CSS 背景色或背景图，另有背景压暗、磨砂模糊、书签卡片透明度三个 0–100 滑块 |
| Discovery | 读取 `/proc/net/tcp[6]`，把已知的 Web 服务加成**禁用**书签，其余端口交给你决定 |
| 运行状态 | 报告页面是否**可访问**；不可访问时指出是「未发布」还是「服务器未监听」，并给出访问地址与已生成的书签数 |
| 纯静态 | 配置存 `uci`，生成 `links.json` 供前端读取，页面本身不需要后端 |
| 不依赖 `luci-compat` | 现代 LuCI（JavaScript 视图 + ucode 后端），无需 Lua 运行时 |

## 环境要求

| 组件 | 最低版本 |
|---|---|
| OpenWrt / ImmortalWrt | 23.05（JS LuCI + ucode） |
| 软件包 | `luci-base`、`uhttpd`、`ucode`、`rpcd-mod-ucode`（会自动拉取） |

## 安装

```sh
# OpenWrt 25.12 及更新（apk）
apk add --allow-untrusted ./luci-app-portal-3.0.1-r3.apk

# OpenWrt 24.10 及更早（opkg），需用对应 SDK 构建
opkg install ./luci-app-portal_3.0.1-r3_all.ipk
```

然后进 LuCI 的**服务 → Portal**，或直接访问 `http://<路由器>/portal/`。

## 目录结构

| 路径 | 用途 |
|---|---|
| `htdocs/luci-static/resources/portal/common.js` | 共享工具：RPC 封装、状态面板、错误上报 |
| `htdocs/luci-static/resources/view/portal/general.js` | LuCI 视图 —— 开关、标题、背景、外观、维护 |
| `htdocs/luci-static/resources/view/portal/bookmarks.js` | LuCI 视图 —— 书签表格 |
| `htdocs/luci-static/resources/view/portal/assets.js` | LuCI 视图 —— 图标与背景素材库 |
| `root/usr/share/luci/menu.d/luci-app-portal.json` | 菜单注册 |
| `root/usr/share/rpcd/acl.d/luci-app-portal.json` | 各视图的 ubus / uci / 文件权限 |
| `root/usr/share/rpcd/ucode/portal.uc` | 后端：`luci.portal` ubus 对象（仅插件，无 CLI 模式） |
| `root/etc/init.d/portal` | 服务脚本：发布 / 撤下页面并生成 `links.json`，本身不起任何进程 |
| `root/usr/share/portal/www/` | 门户前端模板（`index.html`、`portal.js`、`portal.css`），会被拷进 `/www/portal/` |
| `root/etc/config/portal` | 默认 `uci` 配置 |
| `scripts/check.sh` | 本地与 CI 的全部检查门禁 |
| `docs/` | 架构、完成定义、配置说明与 ADR |

## 后端 API

`/usr/share/rpcd/ucode/portal.uc` 由 `rpcd-mod-ucode` 加载，暴露为 `luci.portal`
ubus 对象：

```sh
ubus call luci.portal generate
# { "ok": true, "title": "My Portal", "links": 2 }

ubus call luci.portal scan
# { "lan_ip": "192.168.1.1",
#   "ports": [ { "port": 80, "svc": "http", "web": true },
#              { "port": 22, "svc": "ssh", "web": false },
#              { "port": 7890, "svc": "", "web": "unknown" } ] }

ubus call luci.portal status
# { "ok": true, "enabled": true, "path": "/portal/", "published": true,
#   "server_listening": true, "reachable": true, "links": 2,
#   "generated": true, "generated_at": 1791124783 }

# 素材管理 —— 浏览器只能写 /tmp/portal_upload.tmp，由后端搬到最终文件名
ubus call luci.portal upload '{ "dir": "bg", "name": "wallpaper.jpg" }'
ubus call luci.portal rename '{ "dir": "bg", "name": "wallpaper.jpg", "new_name": "home.jpg" }'
ubus call luci.portal remove  '{ "dir": "bg", "name": "home.jpg" }'
```

上面每个方法都必须出现在 `root/usr/share/rpcd/acl.d/luci-app-portal.json` 中，
否则浏览器里会得到 *Access denied*。`scripts/check.sh` 每次运行都会核对这份对应关系。

扫描结果的 `web` 字段有三种取值：

| 取值 | 含义 |
|---|---|
| `true` | 已知的 Web 服务 —— 会加成禁用状态的书签 |
| `false` | 确定不是浏览器目标（`ssh`、`dns`、`mdns`、`dhcp`、`ntp`、`openvpn`、`wireguard` 等）—— 不会提示 |
| `"unknown"` | `/etc/services` 里没有对应条目 —— 弹窗列出，由你决定 |

端口号本身不携带协议信息，所以 `7890` 可能是代理也可能是任意 TCP 服务，`1053` 是
mDNS。与其双向猜测，不如把未识别的端口列出来让你一次性勾选添加为禁用书签。

该脚本**仅作插件** —— rpcd 加载时不会定义 `ARGV`，因此它无法兼作命令行工具。
按上例通过 ubus 调用即可。

`status` 只回答一个问题 —— 页面能不能打开 —— 并把背后的两个条件分开报告，因为两者
的修法不同：`published`（入口文件与 `links.json` 是否就位）与 `server_listening`
（主 uhttpd 是否占着它被配置的某个端口）。`reachable` 是这两者的交集。结果里不再有
`url`：地址由浏览器用自身 origin 加 `path` 拼出 —— 那才是**正在**提供页面的地址。

## uci 配置参考

```
config portal
	option enabled           '1'         # 总开关；'0' 把页面从 Web 服务器上撤下
	option title             'My Portal' # 页面标题与 <title>
	option background        '#0e1116'   # CSS 颜色
	option background_file   ''          # /www/portal 下的绝对路径
	option bg_veil           '78'        # 0-100：背景图被压暗的程度
	option bg_blur           '0'         # 0-100：磨砂模糊，100 等于最大值 20 px
	option card_transparency '45'        # 0-100：100 表示卡片完全透出背景
	option search_enabled    '0'         # '1' 在门户页上显示搜索框
	option search_engine     'https://www.google.com/search?q=%s'  # 结果页 URL，%s 为关键字

config link
	option name     'AdGuard Home'
	option url      'http://192.168.1.1:3000'
	option icon_url '🛡️'              # 或：option icon '/www/portal/icons/x.png'
	option enabled  '1'
```

旧版本写在这里的 `port` 选项已随独立实例一并移除：页面在**主 uhttpd 监听的端口**上
访问，配置里残留的 `port` 会被直接忽略。

`enabled` 不再是「启停一个守护进程」，而是「发布或撤下页面」。关闭它会从
`/www/portal/` 移除入口文件与 `links.json`，使 `/portal/` 不再解析；上传的图标与
背景图原封不动，重新打开即恢复。

`links.json` 原样带上标题、背景与三个外观百分比；`portal.js` 把百分比转成
`portal.css` 消费的 CSS 自定义属性，所以门户页自己不必读 uci。删掉其中任何一项都会
在后台回落到同一个值 —— 这正是「这些选项存在之前写下的配置」外观不变的原因。

门户页可以带一个搜索框：`search_enabled` 打开它，缺省（没有这一项）视为关闭 ——
在它存在之前写下的配置照旧不显示搜索框。`search_engine` 是引擎的结果页 URL，用
`%s` 表示关键字；预设引擎列在设置页上。在设置页选「自定义」时，页面改用
`search_url` 里的模板，该选项只在那时才会被写入。引擎清单只存在于 LuCI 表单：
`links.json` 只带解析后的模板，门户页本身不持有任何引擎知识。

搜索框开启后默认隐藏 —— 门户页是一页链接，常驻输入框会和链接抢注意力。在页面
任意位置按空格唤出（自动聚焦）；输入框为空时再按空格或按 `Escape` 收起。回车提交
后结果页在新标签页打开，门户页同时清空并隐藏搜索框。输入框有内容时，空格照常
输入空格。

`/etc/config/portal` 一有变化，`links.json` 会自动重新生成（LuCI 点「保存并应用」，
或 `uci commit` 加 `/etc/init.d/portal reload`）。

## 排查

「常规」页有「运行状态」面板；同样的数据也可以从命令行取：

```sh
ubus call luci.portal status
```

| 现象 | 原因 |
|---|---|
| `enabled: false` | 「常规」页的开关被关掉了，勾上并点「保存并应用」 |
| `published: false` | 页面不在磁盘上：服务还没跑过，或开关是关的。`sh /etc/init.d/portal start` 会发布它 |
| `server_listening: false` | 主 uhttpd 没有在它被配置的任何一个端口上监听 —— 检查 `/etc/config/uhttpd` |
| 面板说「可访问」但 `/portal/` 返回 404 | 主实例的 `option home` 不是 `/www`，它在提供另一棵树 |
| 页面能开但没有书签 | `links.json` 缺失或为空：点「保存并应用」重新烘焙，或 `ubus call luci.portal generate` |
| 浏览器控制台报 *Access denied* | 有 ubus 方法没写进 ACL —— 跑一下 `sh scripts/check.sh` |

页面由主 uhttpd 提供，因此继承该实例的监听地址与防火墙规则 —— 没有单独的端口需要
放行。反过来也要知道：**LuCI 能访问到的地方，`/portal/` 就能访问到**，包括把管理界面
暴露在 WAN 上的情形。

## 已知限制

| 限制 | 原因 |
|---|---|
| 上传单个文件 ≤ 2 MiB | 前端与后端都做校验，手工构造的请求也绕不过去。多兆的背景图**显示**没问题，限的只是上传 |
| 文件名仅限 ASCII 字母数字与 `.` `-` `_` | 文件名会变成设备路径；直接拒绝比悄悄改写用户输入更安全，也能从根上杜绝路径穿越。中文名与空格会被拒绝 |
| 页面在 LuCI 可达处皆可达 | 它与 LuCI 由同一个 uhttpd 提供，因而继承管理界面的暴露范围 —— 没有一个单独留着的端口可供收紧。要让它不可达，等于让 LuCI 不可达 |
| 位置固定在 `/portal/` | 页面必须落在主实例的 `option home`（默认 `/www`）之内，而 LuCI 侧的文件 ACL 是静态清单 —— `home` 被改过就需要人工调整本包 |
| 不会主动探测未识别端口 | 判定端口是否说 HTTP 需要在同步 ubus 方法里做带超时的 `GET /`，会阻塞整个 rpcd（连带所有 LuCI 页面）。因此改为列出来由你决定 |
| 设为背景只暂存 | 与其他设置一致，需点「保存并应用」才生效 —— `generate()` 跑在后端进程里，用的是它自己的 `uci` cursor，否则会烘出旧值 |

## 构建

构建需要与目标固件匹配的 Linux SDK —— WSL2 + Ubuntu 完全可用，但 SDK 与源码树必须
放在 Linux 文件系统里，**不能**放在 `/mnt/` 下。

```sh
tar --zstd -xf immortalwrt-sdk-<version>-<arch>_gcc-*.tar.zst
cd immortalwrt-sdk-*/

./scripts/feeds update -a
./scripts/feeds install -a

cp -r /path/to/luci-app-portal package/
make defconfig
make package/luci-app-portal/compile V=s
```

产物在 `bin/packages/<arch>/luci/`。注意 SDK 自带的 `.config` 描述的是一整个固件镜像；
除非你确实要编译整个包树，否则请先删掉其中的 `CONFIG_PACKAGE_*=m` 行。

## 开发

```sh
sh scripts/check.sh
```

这就是 CI 跑的那道门禁：JS 语法、JSON 合法性、`shellcheck`、`msgfmt --check`、
ubus↔ACL 对应关系、行尾、以及模板占位符残留。任一项失败即以非零退出。单条命令见
[AGENTS.md](AGENTS.md) §2，代码约定见 [docs/architecture.md](docs/architecture.md)。

## 许可证

GPL-2.0-only，见 [LICENSE](LICENSE)。
