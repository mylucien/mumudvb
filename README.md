# MuMuDVB for PonWrt / ImmortalWrt (LuCI 24.10 JS)

本仓库就是一个 OpenWrt feed，包含两个可以直接编译的软件包：

| 目录 | 包名 | 说明 |
|---|---|---|
| `mumudvb/` | `mumudvb` | 守护进程 + UCI 默认配置 + procd init 脚本 + 手写配置样例 |
| `luci-app-mumudvb/` | `luci-app-mumudvb` | LuCI 界面（JS 版，适配 LuCI 24.10 / ImmortalWrt master） |

仓库地址：<https://github.com/mylucien/mumudvb>

针对 `https://github.com/pbs05/ponwrt`：该树基于 ImmortalWrt，luci feed 是
`immortalwrt/luci` master，即 **LuCI 24.10 的 JS 架构**（`htdocs/luci-static/resources/view/*.js` +
`menu.d` + `acl.d`），不是老的 Lua CBI，所以这里没有 `luasrc/`。

---

## 一、加到源码里

仓库本身就是一个 **OpenWrt feed**（根目录下直接是包目录），三种加法任选：

```sh
git clone https://github.com/pbs05/ponwrt.git
cd ponwrt

# 方式 A（推荐）：当 git feed，以后 git pull 就能更新
echo 'src-git mumudvb https://github.com/mylucien/mumudvb.git' >> feeds.conf.default
./scripts/feeds update mumudvb
./scripts/feeds install -a -p mumudvb

# 方式 B：直接塞进 package/
git clone https://github.com/mylucien/mumudvb.git /tmp/mumudvb-feed
cp -r /tmp/mumudvb-feed/mumudvb            package/
cp -r /tmp/mumudvb-feed/luci-app-mumudvb   package/

# 方式 C：本地 src-link feed（改代码不用提交）
git clone https://github.com/mylucien/mumudvb.git /opt/mumudvb-feed
echo 'src-link mumudvb /opt/mumudvb-feed' >> feeds.conf.default
./scripts/feeds update mumudvb && ./scripts/feeds install -a -p mumudvb
```

> 用方式 A/C 时，`./scripts/feeds install` 会在 `package/feeds/mumudvb/` 下建软链接，
> 之后改代码要改 feed 目录里的那份，不能改 `package/feeds/` 下的链接。

## 二、选中并编译

```sh
make menuconfig
#   Multimedia  -> <*> mumudvb
#   LuCI        -> Applications -> <*> luci-app-mumudvb
#                                 <*> luci-i18n-mumudvb-zh-cn
#                                 <*> luci-base (已默认)

make -j$(nproc)
# 只编这两个包：
make package/mumudvb/compile V=s
make package/luci-app-mumudvb/compile V=s
```

> `luci-i18n-mumudvb-zh-cn` 由 `luci.mk` 从 `po/zh_Hans/mumudvb.po` 自动生成，是 HIDDEN 包，
> `DEFAULT:=LUCI_LANG_zh_cn||(ALL&&m)` —— 只要你的固件开了中文语言包，它会自动被选中，
> 不用手动勾。没选中也能用，只是界面回到英文。

> 方式 B 把包复制到 `package/` 下时，`luci-app-mumudvb/Makefile` 里的
> `include $(TOPDIR)/feeds/luci/luci.mk` 依然要求 **luci feed 已经 update 过**
> （正常情况下 `./scripts/feeds update -a` 都会跑，`feeds/luci/luci.mk` 存在即可）。

前置条件：宿主机需要 `autoconf`、`automake`（mumudvb 用 autotools，包内已加
`PKG_FIXUP:=autoreconf`）。Debian/Ubuntu：

```sh
sudo apt install build-essential autoconf automake libncurses-dev gawk \
     gettext unzip file python3 rsync git
```

## 三、运行时前提

- 内核里必须有 DVB 子系统（你说驱动已经有了，那 `/dev/dvb/adapter0` 应该在）。
  如果 DVB 编成模块，`/etc/modules.d/` 里要有对应 `kmod-dvb-*`。
- 软件包**故意不依赖 `kmod-dvb-core`**：musl 的官方源里根本没有 `libpthread` 这类包，
  硬写依赖会让 menuconfig 报依赖缺失。驱动由你在内核配置里保证。
- 首次安装默认 `option enabled '0'`，需要在 LuCI 里打开，或
  `uci set mumudvb.main.enabled=1 && uci commit mumudvb && /etc/init.d/mumudvb restart`。

## 四、设计说明

### 1. UCI 选项名 = mumudvb 配置指令名

`/etc/init.d/mumudvb` 把每个 `config tuner` 段翻译成一份 mumudvb 配置文件，
**UCI 选项名与 mumudvb 指令同名，直接透传**，所以加参数不用改脚本：

```
config tuner 'card0'
	option freq '474'            →  freq=474
	option bandwidth '8MHz'      →  bandwidth=8MHz
	option autoconfig_ip4 '...'  →  autoconf_ip4=...
```

一个 tuner 段 = 一个 mumudvb 进程（procd 多实例），互不影响，
可以同时跑 DVB-T 卡和 DVB-S 卡。

### 2. 两种模式

- **默认（`main.custom=0`）**：按 UCI 生成配置 → `/var/etc/mumudvb/<段名>.conf`
- **自定义（`main.custom=1`）**：直接用 `main.custom_file`（默认
  `/etc/mumudvb/mumudvb.conf`）启动单个实例，适合手写频道/PID/模板。
  LuCI 的「服务 → MuMuDVB → 配置文件」页面可以直接编辑它。

### 3. 给某个实例追加原始指令

生成模式下想加 mumudvb 原生配置（`new_channel`、逐频道 PID 等），
写 `/etc/mumudvb/<段名>.conf`（例如 `/etc/mumudvb/card0.conf`），
内容会被原样追加到生成配置末尾，优先级高于前面的同名指令。

### 4. 为什么打了 `100-build-without-gettext.patch`

上游 `configure.ac` 里有 `AM_GNU_GETTEXT_VERSION([0.15])` 和 `AM_ICONV`，
但源码里**一次 `gettext()` 都没调用**（只有 iconv，而 iconv 在 musl/glibc 里是 libc 自带的）。
留着这两个宏会让 `autoreconf` 强制调用 `autopoint`，宿主机没装 gettext 就直接失败。
补丁顺便修掉 `AC_PROG_CC_STDC`（新 autoconf 已废弃）、`AC_HEADER_RESOLV`、
空的 `AC_CONFIG_MACRO_DIR([m4])`，以及 `AC_INIT` 里用 `git rev-parse HEAD` 拼版本号
（git 导出的源码树里没有 `.git`，会失败）。

## 五、版本

固定在上游 `mumudvb2` 分支 commit `ce2db87f23`（2026-09-13）。

改版本只需动 `mumudvb/Makefile` 两行（**不要**加 `PKG_VERSION`）：

```make
PKG_SOURCE_VERSION:=<新的 commit sha>
PKG_SOURCE_DATE:=<日期>
```

包版本由 OpenWrt 自动推导成 `2026.09.13~ce2db87f` 这种形式。

> ⚠️ 别写 `PKG_VERSION:=2.1.0+git20260913` 这种带 `+` 的版本号。
> apk 的版本号只接受 `[0-9.]`、字母、`_suffix`、`~<hex>`、`-r<N>`，
> `+` 非法（apk-tools `src/version.c` 走 default → `TOKEN_INVALID`，
> `src/apk_adb.c` 的 `version_fromstring()` 返回 `APKE_PKGVERSION_FORMAT`），
> `apk mkpkg` 会以 99 退出，构建日志里就是
> `[...]/mumudvb-....apk] Error 99`。
>
> 同时**不要设 `PKG_MIRROR_HASH`**（包括 `:=skip`）：只要非空，OpenWrt 会先去
> `sources.openwrt.org` 探测同名 tarball，git 源必然 404，日志里刷一堆 curl 报错。

> 上游 2.1.0 之后的提交修了不少现代 GCC/musl 的问题
> （`sys/poll.h` → POSIX `poll.h`、gcc15、`-std=c23` 等），所以不要退回 2.1.0 tag。

## 六、用起来

```sh
# 状态
/etc/init.d/mumudvb status
logread -e mumudvb

# 看生成的配置
cat /var/etc/mumudvb/card0.conf

# HTTP 单播（unicast=1 时），上游只有这几条路径：
#   http://<路由器IP>:4242/         索引页
#   http://<路由器IP>:4242/playlist.m3u        m3u 播放列表（可直接丢给 VLC）
#   http://<路由器IP>:4242/channels_list.html   频道状态页
#   http://<路由器IP>:4242/bynumber/1           第 1 个频道（序号）
#   http://<路由器IP>:4242/bysid/1025           按 SID 取频道
#   http://<路由器IP>:4242/byname/CCTV-1        按频道名取
# 注意没有 /1.ts 这种写法。

# 组播（默认 autoconf_ip4=239.100.%card.%number，端口 1234）
# VLC 打开 udp://@239.100.0.1:1234
```

## 七、排错

| 现象 | 原因 / 处理 |
|---|---|
| 打包阶段 `[...]/*.apk] Error 99` | apk 的错误被钳到 99。看上一行有没有 `info field 'version' has invalid value`：`PKG_VERSION` 里出现了 `+` 等非法字符。本包已改为不设 `PKG_VERSION`，由 OpenWrt 推导 |
| 日志里 `curl: (22) ... 404`（git 源） | 设了 `PKG_MIRROR_HASH` 导致先去官方镜像探测。删掉该行即可 |
| `mumudvb` 起不来，日志 `cannot open /dev/dvb/adapter0` | 适配器序号填错，或 DVB 模块没加载 |
| 生成配置里没有 `freq` | LuCI 里频率是必填项，`uci show mumudvb` 确认 |
| LuCI 页面 403 / 空白 | 没装 `luci-base`，或没更新 luci feed |
| 界面还是英文 | 没装 `luci-i18n-mumudvb-zh-cn` |
| 提示 `ln: ... autoreconf` 失败 | 宿主机缺 autoconf/automake |
| 想用 CAM/SCAM 解扰 | 本包已 `--disable-cam-support/--disable-scam-support`：OpenWrt 源里没有 libdvben50221/libdvbcsa，需要自己再加包 |
