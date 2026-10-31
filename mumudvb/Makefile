#
# MuMuDVB - DVB/ATSC -> IPTV (multicast / HTTP unicast / HLS) streamer
#
# Copyright (C) 2026
#
# This is free software, licensed under the GNU General Public License v2.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=mumudvb
PKG_SOURCE_PROTO:=git
PKG_SOURCE_URL:=https://github.com/braice/MuMuDVB.git
PKG_SOURCE_VERSION:=ce2db87f2341b73e639d3248de7a841339d91716
PKG_SOURCE_DATE:=2026-09-13
PKG_RELEASE:=2

# 故意不写 PKG_VERSION，原因有两个：
#
# 1) apk 的版本号语法只接受 [0-9.]、单个字母、_<suffix>、~<hex>、-r<N>。
#    '+' 落在 apk-tools src/version.c 的 default 分支 -> TOKEN_INVALID，
#    接着 src/apk_adb.c version_fromstring() 返回 APKE_PKGVERSION_FORMAT，
#    apk mkpkg 打印 "info field 'version' has invalid value" 并以 99 退出
#    （src/apk.c: if (r > 99) r = 99; ），make 里就表现为
#    "[...]/mumudvb-2.1.0+git20260913-r1.apk] Error 99"。
#    不写 PKG_VERSION 时 OpenWrt 会从 SOURCE_DATE + SOURCE_VERSION 推导：
#        2026.09.13~ce2db87f
#    这个形式 apk 完全合法（~ 后跟 16 进制 commit 前缀）。
#
# 2) 不写 PKG_MIRROR_HASH（哪怕是 =skip）：只要它非空，OpenWrt 的 wrap_mirror
#    就会先去 sources.openwrt.org 探测同名 tarball，git 源必然 404，
#    白白在日志里刷一堆 "curl: (22) ... 404"。留空则直接走 github_archive /
#    裸 git clone，不碰镜像。
#
# 改版本时只动上面两行（SOURCE_VERSION / SOURCE_DATE），版本号会自动跟着变。

PKG_LICENSE:=GPL-2.0-or-later
PKG_LICENSE_FILES:=COPYING
PKG_MAINTAINER:=

PKG_FIXUP:=autoreconf
PKG_INSTALL:=1
PKG_BUILD_PARALLEL:=1
PKG_BUILD_FLAGS:=no-mips16

include $(INCLUDE_DIR)/package.mk

define Package/mumudvb
  SECTION:=multimedia
  CATEGORY:=Multimedia
  TITLE:=DVB/ATSC to IPTV streamer (multicast, HTTP unicast, HLS)
  URL:=https://mumudvb.net/
  # HLS 输出必须有个 HTTP 服务器把 hls_storage_dir 暴露出去：mumudvb 自己的
  # 4242 端口只提供 /bysid/ 和 /playlist.m3u，不提供 .m3u8/.ts（源码里没有
  # 这条路由）。uhttpd 在 OpenWrt 里本来就在（luci-base 依赖它），这里显式
  # 声明，避免裁剪过的固件装了 mumudvb 却发现 HLS 访问不到。
  DEPENDS:=+uhttpd
endef

define Package/mumudvb/description
 MuMuDVB redistributes a whole DVB/ATSC transponder over the network.
 Every service of the transponder is mapped to its own multicast group,
 HTTP unicast TS stream (with an XML/JSON status page and M3U playlist)
 or HLS output. Autoconfiguration detects the services, their PIDs and
 names and follows changes at runtime.
endef

#
# CAM support needs libdvben50221/libucsi (dvb-apps), SCAM needs libdvbcsa
# and oscam, neither of them are available in the OpenWrt feeds.
# ARIB is only needed for ISDB-T (Japan). All three are disabled here.
#
CONFIGURE_ARGS += \
	--disable-cam-support \
	--disable-scam-support \
	--disable-arib-support \
	--disable-duma \
	--disable-coverage

define Package/mumudvb/conffiles
/etc/config/mumudvb
endef

define Package/mumudvb/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_INSTALL_DIR)/usr/bin/mumudvb $(1)/usr/bin/mumudvb

	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/mumudvb.config $(1)/etc/config/mumudvb

	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/mumudvb.init $(1)/etc/init.d/mumudvb

	$(INSTALL_DIR) $(1)/etc/mumudvb
	$(INSTALL_DATA) ./files/mumudvb.conf.sample $(1)/etc/mumudvb/mumudvb.conf.sample

	# HLS 网关：docroot 里只放 CGI 和一个落地页，真实的 .m3u8/.ts 由
	# cgi-bin/hls 从 /tmp/hls 读（uhttpd 的 mime 表改不了，只能绕开）。
	# 放 /etc 而不是 /tmp：uhttpd START=50 早于 mumudvb START=95，
	# docroot 不存在的话这个实例直接起不来。
	$(INSTALL_DIR) $(1)/etc/mumudvb/gw/cgi-bin
	$(INSTALL_BIN) ./files/hls.cgi $(1)/etc/mumudvb/gw/cgi-bin/hls
	$(INSTALL_DATA) ./files/gw-index.html $(1)/etc/mumudvb/gw/index.html

	# 首次启动时建 uhttpd 实例（幂等，带 gw_version 可升级）
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./files/95-mumudvb-hls $(1)/etc/uci-defaults/95-mumudvb-hls
endef

$(eval $(call BuildPackage,mumudvb))
