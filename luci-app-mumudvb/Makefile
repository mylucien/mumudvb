#
# Copyright (C) 2026
#
# This is free software, licensed under the Apache License, Version 2.0 .
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI app for MuMuDVB (DVB/ATSC -> IPTV)
LUCI_DESCRIPTION:=Configure and control the MuMuDVB streaming daemon.
LUCI_DEPENDS:=+luci-base +mumudvb
LUCI_PKGARCH:=all

PKG_NAME:=luci-app-mumudvb
PKG_VERSION:=1.0.0
PKG_RELEASE:=1
PKG_LICENSE:=Apache-2.0
PKG_MAINTAINER:=

# 本包不在 feeds/luci/applications/ 下，所以不能用 ../../luci.mk，
# 必须显式指向 luci feed 里的 luci.mk（feeds update 后才会存在）。
include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
# 注意：luci.mk 末尾已经对所有包（含 luci-i18n-*）调用过 BuildPackage，
# 这里绝对不能再写 $(eval $(call BuildPackage,...))，否则重复定义。
